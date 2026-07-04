/**
 * Calibration engine (Day 57) — turn relative video-space measurements into
 * real-world estimates, *with explicit confidence*, or say "needs calibration".
 *
 * Everything the overlay measures (step distance, COM travel) is in normalized
 * image space: honest but unitless. To reach metres we need a single scalar —
 * `metersPerPixel` — that maps pixels to metres at the athlete's depth. This
 * module derives that scalar from whatever calibration signal is available,
 * ranks its trustworthiness, and applies it to produce step/stride length and
 * velocity estimates. When no signal exists it returns an uncalibrated report so
 * the UI can prompt for what's missing instead of inventing numbers.
 *
 * Design guarantees:
 *  - Pure & deterministic: no I/O, inputs are read-only, no DOM.
 *  - Fully separate from biomechanics: it consumes overlay/step *presentation*
 *    data (OverlayFrame, StepMark) and never touches the worker metric math.
 *  - Square pixels assumed (true for standard video), so one `metersPerPixel`
 *    is valid on both axes; leg-length (mostly vertical) can therefore scale
 *    horizontal travel.
 *
 * This is the foundation the PB predictor will build on — but is not itself a
 * predictor.
 */

import type { OverlayFrame, OverlayPoint } from "@/lib/video/overlay";
import { detectStepMarks, type StepMark } from "@/lib/video/steps";

export type Confidence = "high" | "medium" | "low";

/** How a scale was derived, best (most trusted) first. */
export type CalibrationMethod = "manual" | "zone" | "legLength" | "knownDistance";

/**
 * A user-defined calibration zone: a known real-world distance covered between
 * two timestamps in the clip (e.g. a 30 m fly zone). Because the distance is
 * known and the segment is bounded, this yields a high-confidence scale and a
 * direct segment (average) velocity.
 */
export interface CalibrationZone {
  /** Zone start time in seconds. */
  startTime: number;
  /** Zone end time in seconds (must be after `startTime`). */
  endTime: number;
  /** Known real-world distance covered in the zone, metres. */
  distanceM: number;
}

/** A resolved pixel→metre scale plus how much to trust it. */
export interface CalibrationScale {
  metersPerPixel: number;
  method: CalibrationMethod;
  confidence: Confidence;
  /** Human-readable note on how it was derived / its caveats. */
  reason: string;
}

/** One real-world estimate. `value` is null when it can't be computed. */
export interface Measurement {
  key: string;
  label: string;
  value: number | null;
  unit: "m" | "m/s";
  confidence: Confidence | null;
}

/** Everything the calibration UI needs for one analysis. */
export interface CalibrationReport {
  /** True when a usable scale was found and at least one estimate produced. */
  calibrated: boolean;
  scale: CalibrationScale | null;
  measurements: Measurement[];
  /** Caveats / prompts (e.g. "add leg length to enable calibration"). */
  warnings: string[];
}

/** Inputs the session page adapts from the athlete, session, and overlay data. */
export interface CalibrationInputs {
  /** Athlete's greater-trochanter-to-floor length, cm (profile field). */
  legLengthCm: number | null;
  /** Known sprint distance for the session, metres, if recorded. */
  knownDistanceM: number | null;
  /** Source video pixel dimensions (needed to turn normalized coords to pixels). */
  frameWidth: number | null;
  frameHeight: number | null;
  /** Overlay frames (COM + landmarks over time). */
  frames: OverlayFrame[];
  /** Detected step marks; if omitted they are derived from `frames`. */
  steps?: StepMark[];
  /** A user-supplied scale (metres per pixel) from manual calibration points. */
  manualMetersPerPixel?: number | null;
  /** A known-distance calibration zone (e.g. a 30 m fly), if the coach set one. */
  zone?: CalibrationZone | null;
}

const CONFIDENCE_ORDER: Confidence[] = ["low", "medium", "high"];

/** The lower (more cautious) of two confidences. */
function minConfidence(a: Confidence, b: Confidence): Confidence {
  return CONFIDENCE_ORDER[Math.min(CONFIDENCE_ORDER.indexOf(a), CONFIDENCE_ORDER.indexOf(b))];
}

/** Drop a confidence by `steps` levels, floored at "low". */
function downgrade(c: Confidence, steps = 1): Confidence {
  return CONFIDENCE_ORDER[Math.max(0, CONFIDENCE_ORDER.indexOf(c) - steps)];
}

/** Percentile (0..1) of a numeric sample; `[]` → null. */
function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
}

function median(values: number[]): number | null {
  return percentile(values, 0.5);
}

const visible = (p: OverlayPoint | undefined, min = 0.4): p is OverlayPoint =>
  !!p && (p.visibility ?? 1) >= min;

/** Straight-line pixel distance between two normalized points. */
function pixelDist(a: OverlayPoint, b: OverlayPoint, w: number, h: number): number {
  return Math.hypot((a.x - b.x) * w, (a.y - b.y) * h);
}

// --- Scale estimation -------------------------------------------------------

/** Enough well-tracked leg samples to trust an anthropometric scale. */
const MIN_LEG_SAMPLES = 8;
/** Below this the athlete is too small on screen for a reliable scale. */
const MIN_LEG_PIXELS = 40;

/**
 * Anthropometric scale from the athlete's known leg length. Per frame, take the
 * longer (more extended / fronto-parallel) hip→ankle leg in pixels; the high
 * percentile across frames approximates the true straight-leg projection, which
 * `legLengthCm` then converts to metres-per-pixel.
 */
export function estimateScaleFromLegLength(
  frames: OverlayFrame[],
  legLengthCm: number | null,
  w: number | null,
  h: number | null,
): CalibrationScale | null {
  if (!legLengthCm || legLengthCm <= 0 || !w || !h) return null;

  const legPixels: number[] = [];
  for (const f of frames) {
    const candidates: number[] = [];
    if (visible(f.landmarks.leftHip) && visible(f.landmarks.leftAnkle)) {
      candidates.push(pixelDist(f.landmarks.leftHip, f.landmarks.leftAnkle, w, h));
    }
    if (visible(f.landmarks.rightHip) && visible(f.landmarks.rightAnkle)) {
      candidates.push(pixelDist(f.landmarks.rightHip, f.landmarks.rightAnkle, w, h));
    }
    if (candidates.length) legPixels.push(Math.max(...candidates));
  }

  if (legPixels.length < 3) return null;
  const legPx = percentile(legPixels, 0.8);
  if (!legPx || legPx <= 0) return null;

  const metersPerPixel = legLengthCm / 100 / legPx;
  // Anthropometric calibration tops out at medium: it ignores perspective /
  // foreshortening. Too few samples or a tiny athlete drops it to low.
  const confidence: Confidence =
    legPixels.length >= MIN_LEG_SAMPLES && legPx >= MIN_LEG_PIXELS ? "medium" : "low";

  return {
    metersPerPixel,
    method: "legLength",
    confidence,
    reason: `Scaled from leg length (${legLengthCm} cm ≈ ${legPx.toFixed(0)} px). Assumes the athlete stays at a similar depth; not perspective-corrected.`,
  };
}

/**
 * Rough scale from a known sprint distance: assume the horizontal COM travel in
 * the clip corresponds to `knownDistanceM`. This is only true when the clip
 * captures exactly that distance, so it is always low confidence.
 */
export function estimateScaleFromKnownDistance(
  frames: OverlayFrame[],
  knownDistanceM: number | null,
  w: number | null,
): CalibrationScale | null {
  if (!knownDistanceM || knownDistanceM <= 0 || !w) return null;

  const xs = frames
    .map((f) => f.centerOfMass)
    .filter((c): c is OverlayPoint => !!c)
    .map((c) => c.x);
  if (xs.length < 3) return null;

  const travelPx = (Math.max(...xs) - Math.min(...xs)) * w;
  if (travelPx < 1) return null;

  return {
    metersPerPixel: knownDistanceM / travelPx,
    method: "knownDistance",
    confidence: "low",
    reason: `Assumes the clip spans the full recorded distance (${knownDistanceM} m). Verify the whole run is in frame.`,
  };
}

/** Valid, well-ordered zone (end after start, positive distance), or null. */
function validZone(zone: CalibrationZone | null | undefined): CalibrationZone | null {
  if (!zone) return null;
  if (!(zone.distanceM > 0)) return null;
  if (!(zone.endTime > zone.startTime)) return null;
  return zone;
}

/** COM x (normalized) at the frame nearest a given time, or null. */
function comXNearestTime(frames: OverlayFrame[], t: number): number | null {
  let best: { dt: number; x: number } | null = null;
  for (const f of frames) {
    if (!f.centerOfMass) continue;
    const dt = Math.abs(f.time - t);
    if (!best || dt < best.dt) best = { dt, x: f.centerOfMass.x };
  }
  return best ? best.x : null;
}

/**
 * High-confidence scale from a known-distance calibration zone: the horizontal
 * COM travel between the zone's start/end frames corresponds to `distanceM`.
 * Because the distance is real and the segment is explicitly bounded by the
 * coach, this is more trustworthy than anthropometric or whole-clip estimates.
 */
export function estimateScaleFromZone(
  frames: OverlayFrame[],
  zone: CalibrationZone | null | undefined,
  w: number | null,
): CalibrationScale | null {
  const z = validZone(zone);
  if (!z || !w) return null;

  const xStart = comXNearestTime(frames, z.startTime);
  const xEnd = comXNearestTime(frames, z.endTime);
  if (xStart == null || xEnd == null) return null;

  const travelPx = Math.abs(xEnd - xStart) * w;
  if (travelPx < 1) return null;

  return {
    metersPerPixel: z.distanceM / travelPx,
    method: "zone",
    confidence: "high",
    reason: `Scaled from a ${z.distanceM} m calibration zone (${z.startTime.toFixed(2)}–${z.endTime.toFixed(2)} s of the clip).`,
  };
}

/**
 * Resolve the best available scale: manual (user-provided) beats a known-distance
 * zone, which beats anthropometric, which beats a whole-clip known distance.
 * Returns null when nothing is available.
 */
export function resolveScale(inputs: CalibrationInputs): CalibrationScale | null {
  if (inputs.manualMetersPerPixel && inputs.manualMetersPerPixel > 0) {
    return {
      metersPerPixel: inputs.manualMetersPerPixel,
      method: "manual",
      confidence: "high",
      reason: "Set from manual calibration points.",
    };
  }
  return (
    estimateScaleFromZone(inputs.frames, inputs.zone, inputs.frameWidth) ??
    estimateScaleFromLegLength(inputs.frames, inputs.legLengthCm, inputs.frameWidth, inputs.frameHeight) ??
    estimateScaleFromKnownDistance(inputs.frames, inputs.knownDistanceM, inputs.frameWidth)
  );
}

// --- Measurements -----------------------------------------------------------

/** Confidence for a step/stride sample size. */
function countConfidence(n: number, good: number, ok: number): Confidence {
  return n >= good ? "high" : n >= ok ? "medium" : "low";
}

/**
 * Produce the real-world estimates from a resolved scale and the overlay data.
 * Each estimate's confidence is capped by the scale confidence and lowered when
 * its own supporting data is thin.
 */
export function computeMeasurements(
  scale: CalibrationScale,
  inputs: CalibrationInputs,
  steps: StepMark[],
): Measurement[] {
  const mpp = scale.metersPerPixel;
  const w = inputs.frameWidth ?? 0;
  const h = inputs.frameHeight ?? 0;
  const measurements: Measurement[] = [];

  // Step length: median gap between consecutive contacts (both feet).
  const stepPx: number[] = [];
  for (let i = 1; i < steps.length; i++) {
    stepPx.push(Math.hypot((steps[i].x - steps[i - 1].x) * w, (steps[i].y - steps[i - 1].y) * h));
  }
  const stepMed = median(stepPx);
  measurements.push({
    key: "stepLength",
    label: "Step length",
    value: stepMed != null ? stepMed * mpp : null,
    unit: "m",
    confidence:
      stepMed != null ? minConfidence(scale.confidence, countConfidence(stepPx.length, 6, 2)) : null,
  });

  // Stride length: gap between successive SAME-foot contacts.
  const stridePx: number[] = [];
  for (const side of ["left", "right"] as const) {
    const sideSteps = steps.filter((s) => s.side === side);
    for (let i = 1; i < sideSteps.length; i++) {
      stridePx.push(
        Math.hypot((sideSteps[i].x - sideSteps[i - 1].x) * w, (sideSteps[i].y - sideSteps[i - 1].y) * h),
      );
    }
  }
  const strideMed = median(stridePx);
  measurements.push({
    key: "strideLength",
    label: "Stride length",
    value: strideMed != null ? strideMed * mpp : null,
    unit: "m",
    confidence:
      strideMed != null ? minConfidence(scale.confidence, countConfidence(stridePx.length, 4, 1)) : null,
  });

  // Horizontal velocity from COM travel. Use the x-axis only so vertical bob
  // doesn't inflate speed. Instantaneous speeds → top; net travel / time → avg.
  const comFrames = inputs.frames
    .filter((f) => f.centerOfMass)
    .map((f) => ({ t: f.time, x: (f.centerOfMass as OverlayPoint).x }));

  const instSpeeds: number[] = [];
  for (let i = 1; i < comFrames.length; i++) {
    const dt = comFrames[i].t - comFrames[i - 1].t;
    if (dt <= 0) continue;
    const dxPx = Math.abs(comFrames[i].x - comFrames[i - 1].x) * w;
    instSpeeds.push((dxPx / dt) * mpp);
  }

  const trackedSpan =
    comFrames.length >= 2 ? comFrames[comFrames.length - 1].t - comFrames[0].t : 0;
  const netDistanceM =
    comFrames.length >= 2
      ? Math.abs(comFrames[comFrames.length - 1].x - comFrames[0].x) * w * mpp
      : null;

  const velDataConf: Confidence =
    comFrames.length >= 20 && trackedSpan >= 0.5
      ? "high"
      : comFrames.length >= 8
        ? "medium"
        : "low";
  const velConf = minConfidence(scale.confidence, velDataConf);

  const avgVelocity = netDistanceM != null && trackedSpan > 0 ? netDistanceM / trackedSpan : null;
  measurements.push({
    key: "avgVelocity",
    label: "Average velocity",
    value: avgVelocity,
    unit: "m/s",
    confidence: avgVelocity != null ? velConf : null,
  });

  // Top speed from a high percentile of instantaneous speed (robust to noise),
  // one confidence level below the average (single-frame deltas are noisier).
  const topPx = percentile(instSpeeds, 0.9);
  measurements.push({
    key: "topVelocity",
    label: "Top velocity",
    value: topPx,
    unit: "m/s",
    confidence: topPx != null ? downgrade(velConf) : null,
  });

  measurements.push({
    key: "distanceCovered",
    label: "Distance covered (in clip)",
    value: netDistanceM,
    unit: "m",
    confidence: netDistanceM != null ? velConf : null,
  });

  // Segment (zone) velocity: a known distance over a known elapsed time is a
  // direct average speed — no pixel scale needed, so it is high confidence. For a
  // fly zone this is the athlete's near-top velocity over that segment.
  const z = validZone(inputs.zone);
  if (z) {
    const elapsed = z.endTime - z.startTime;
    measurements.push({
      key: "segmentVelocity",
      label: `Zone velocity (${z.distanceM} m)`,
      value: elapsed > 0 ? z.distanceM / elapsed : null,
      unit: "m/s",
      confidence: elapsed > 0 ? "high" : null,
    });
  }

  return measurements;
}

/** Reasons calibration couldn't run, as UI prompts. */
function missingScaleWarnings(inputs: CalibrationInputs): string[] {
  const warnings: string[] = [];
  if (!inputs.legLengthCm)
    warnings.push("Add the athlete's leg length to their profile to enable calibration.");
  if (!inputs.frameWidth || !inputs.frameHeight)
    warnings.push("Video pixel dimensions are unknown, so pixels can't be mapped to metres.");
  if (!inputs.frames.some((f) => f.centerOfMass))
    warnings.push("No tracked pose in this clip to measure movement from.");
  if (warnings.length === 0)
    warnings.push("Not enough calibration signal to estimate real-world units.");
  return warnings;
}

/**
 * Build the full calibration report for an analysis. When no scale can be
 * resolved, returns `calibrated: false` with prompts and no numbers — never a
 * fabricated measurement.
 */
export function buildCalibrationReport(inputs: CalibrationInputs): CalibrationReport {
  const steps = inputs.steps ?? detectStepMarks(inputs.frames);
  const scale = resolveScale(inputs);

  if (!scale) {
    return { calibrated: false, scale: null, measurements: [], warnings: missingScaleWarnings(inputs) };
  }

  const measurements = computeMeasurements(scale, inputs, steps);
  const hasAny = measurements.some((m) => m.value != null);

  const warnings: string[] = [];
  if (scale.confidence === "low")
    warnings.push("Calibration is low-confidence — treat these numbers as rough estimates.");
  if (!hasAny)
    warnings.push("A scale was found but there wasn't enough motion/step data to estimate from.");

  return { calibrated: hasAny, scale, measurements, warnings };
}
