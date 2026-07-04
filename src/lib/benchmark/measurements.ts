/**
 * Sprint measurements (Day 62 benchmark) — the full, deterministic metric set AVA
 * reports for a calibrated sprint, derived from verified ground contacts plus a
 * manual two-point ground calibration that ALSO bounds the measurement zone.
 *
 * Everything here is a *presentation / validation* computation built on the pose
 * overlay and the step detector — it never touches the worker's biomechanics math
 * (contact/flight time live there). The manual calibration points do double duty:
 *   • their pixel distance ↔ known metres gives the pixel→metre scale; and
 *   • their x-range bounds the zone, so only contacts *between the cones* count as
 *     valid steps (steps before the start / after the finish are excluded).
 *
 * Metric families (all kept strictly distinct — never conflate them):
 *   • Contacts        — one true ground contact = one step (total, left, right, valid-in-zone).
 *   • Step frequency  — steps per second = valid contacts ÷ elapsed zone time
 *                       (combined is primary; left/right are that side's share).
 *   • Step length     — Method 1: zone distance ÷ valid steps (average); Method 2:
 *                       distance between consecutive contacts (individual, + left/right).
 *   • Velocity        — cross-checked three independent ways (distance÷time,
 *                       avg-individual-length×freq, median-length×freq) plus a
 *                       max (longest step × freq) and the zone (distance÷time) value.
 *
 * Pure & deterministic: no I/O, inputs read-only.
 */

import type { OverlayFrame, OverlayPoint } from "@/lib/video/overlay";
import { detectStepMarks, type StepMark, type StepSide, type StepDistanceScale } from "@/lib/video/steps";
import type { ManualCalibrationPoints } from "@/lib/calibration";
import { stepFrequenciesFromContacts } from "@/lib/video/cadence";
import {
  estimateCameraMotion,
  cameraOffsetAtTime,
  type CameraConfidence,
  type CameraTrack,
} from "@/lib/video/camera";

export type MeasurementConfidence = "high" | "medium" | "low";

/** How camera-motion compensation was applied to this session's spatial metrics. */
export interface CameraCompensation {
  available: boolean;
  confidence: CameraConfidence;
  coverage: number;
  warning: string | null;
}

/** Transparency on which frames/contacts fed the measurements (Day 65). */
export interface MeasurementDiagnostics {
  totalFrames: number;
  /** Frames where at least one foot is tracked above the detection threshold. */
  trackedFrames: number;
  trackingCoverage: number;
  /** Time of the first / last detected ground contact. */
  firstContactTimeS: number | null;
  lastContactTimeS: number | null;
  /** Contacts counted toward the zone metrics. */
  includedContacts: number;
  /** Contacts dropped from the zone, with the reason (for honest diagnosis). */
  excludedContacts: { time: number; side: StepSide; reason: string }[];
  notes: string[];
}

/** The measurement zone the two calibration points bound, in the athlete's travel direction. */
export interface SprintZone {
  /** Normalized x where the athlete enters the zone (first boundary reached). */
  entryX: number;
  /** Normalized x where the athlete exits the zone. */
  exitX: number;
  /** Lower/upper normalized x bound (order-independent), for the valid-step test. */
  minX: number;
  maxX: number;
  /** Known real-world zone length, metres. */
  distanceM: number;
}

/** One velocity estimate produced by an independent method. */
export interface VelocityEstimate {
  key: string;
  label: string;
  method: string;
  value: number | null;
}

export interface SprintMeasurements {
  calibrated: boolean;
  /** Metres-per-pixel scale used, if any. */
  metersPerPixel: number | null;

  // Contacts (one true ground contact = one step)
  totalContacts: number;
  leftContacts: number;
  rightContacts: number;
  validContacts: number;
  validLeftContacts: number;
  validRightContacts: number;

  // Zone + timing
  zone: SprintZone | null;
  zoneTimeS: number | null;

  // Step frequency (steps/s) — combined is the primary value
  combinedStepFrequencyHz: number | null;
  leftStepFrequencyHz: number | null;
  rightStepFrequencyHz: number | null;

  // Step length (m) — null when uncalibrated
  avgZoneStepLengthM: number | null;
  avgIndividualStepLengthM: number | null;
  leftStepLengthM: number | null;
  rightStepLengthM: number | null;
  individualStepLengthsM: number[];
  stepLengthConfidence: MeasurementConfidence;

  // Velocity (m/s)
  velocities: VelocityEstimate[];
  maxVelocityMps: number | null;
  zoneVelocityMps: number | null;
  /** Spread across the velocity methods + a note when they disagree materially. */
  velocitySpreadPct: number | null;
  velocityNote: string;

  /** Camera-motion compensation applied to the spatial (world-coordinate) metrics. */
  cameraCompensation: CameraCompensation;
  /** Which frames/contacts were included/excluded (Day 65 transparency). */
  diagnostics: MeasurementDiagnostics;

  warnings: string[];
}

const EPS = 1e-9;

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Coefficient of variation (stddev / mean) of a positive sample; null if < 2. */
function coefficientOfVariation(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values);
  if (m == null || m === 0) return null;
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length;
  return Math.sqrt(variance) / Math.abs(m);
}

/** COM (x, time) samples in frame order, dropping frames without a tracked COM. */
function comSeries(frames: OverlayFrame[]): { t: number; x: number }[] {
  return frames
    .filter((f): f is OverlayFrame & { centerOfMass: OverlayPoint } => !!f.centerOfMass)
    .map((f) => ({ t: f.time, x: f.centerOfMass.x }));
}

/**
 * Time the COM first reaches normalized x-position `target`, travelling in
 * `direction` (+1 rightwards, -1 leftwards), linearly interpolated between the
 * bracketing frames. Null when the COM never reaches it.
 */
function crossingTime(
  series: { t: number; x: number }[],
  target: number,
  direction: number,
): number | null {
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const cur = series[i];
    const reached = direction >= 0 ? cur.x >= target : cur.x <= target;
    const wasBefore = direction >= 0 ? prev.x < target : prev.x > target;
    if (reached && wasBefore) {
      const span = cur.x - prev.x;
      const frac = Math.abs(span) < EPS ? 0 : (target - prev.x) / span;
      return prev.t + frac * (cur.t - prev.t);
    }
  }
  // Already past the target at the very first sample.
  if (series.length && (direction >= 0 ? series[0].x >= target : series[0].x <= target)) {
    return series[0].t;
  }
  return null;
}

/**
 * Compute the full sprint measurement set. When `points`/dimensions are missing,
 * returns the contact-only view (counts + a clip-span frequency) with all
 * metre-scaled fields null, so the UI shows relative/uncalibrated state instead
 * of inventing numbers.
 */
export function computeSprintMeasurements(
  frames: OverlayFrame[],
  points: ManualCalibrationPoints | null | undefined,
  frameWidth: number | null | undefined,
  frameHeight: number | null | undefined,
): SprintMeasurements {
  const warnings: string[] = [];

  // Camera-motion compensation (Day 64): estimate the camera pan so every SPATIAL
  // quantity below can be computed in stabilized WORLD coordinates. When the track
  // is unavailable the offsets are zero, so world == frame and this degrades
  // gracefully to the old frame-coordinate behaviour.
  const cameraTrack: CameraTrack = estimateCameraMotion(frames);
  const off = (t: number) => cameraOffsetAtTime(cameraTrack, t);
  const cameraCompensation: CameraCompensation = {
    available: cameraTrack.available,
    confidence: cameraTrack.confidence,
    coverage: cameraTrack.coverage,
    warning: cameraTrack.warning,
  };
  if (cameraTrack.warning) warnings.push(cameraTrack.warning);

  const w = frameWidth ?? 0;
  const h = frameHeight ?? 0;

  // Gate world x-positions: each gate's frame x corrected by the camera offset at
  // the time it was placed (falls back to frame x when times/compensation are
  // absent). The known distance maps to the WORLD x-gap between the two gates.
  const gateWorldX = (frameX: number, timeS: number | null | undefined): number =>
    cameraTrack.available && timeS != null ? frameX + off(timeS).x : frameX;
  const gateAX = points ? gateWorldX(points.ax, points.aTimeS) : 0;
  const gateBX = points ? gateWorldX(points.bx, points.bTimeS) : 0;

  const scale: StepDistanceScale | null =
    points && frameWidth && frameHeight
      ? {
          metersPerPixel: (() => {
            const px = Math.abs(gateAX - gateBX) * frameWidth;
            return px > 0 ? points.distanceM / px : 0;
          })(),
          frameWidth,
          frameHeight,
        }
      : null;
  const usableScale = scale && scale.metersPerPixel > 0 ? scale : null;

  // Contacts in WORLD coordinates: each mark's frame position shifted by the
  // camera offset at its contact time, so gaps reflect real ground travel — not
  // camera pan — on panning footage. Step distances are recomputed from these.
  type WorldMark = StepMark & { wx: number; wy: number };
  const detected = detectStepMarks(frames);
  const worldPositions: WorldMark[] = detected.map((m) => {
    const o = off(m.time);
    return { ...m, wx: m.x + o.x, wy: m.y + o.y };
  });
  const marks: WorldMark[] = worldPositions.map((m, i) => {
    if (i === 0) return { ...m, distanceFromPrev: null, distanceMetersFromPrev: null };
    const prev = worldPositions[i - 1];
    const distNorm = Math.hypot(m.wx - prev.wx, m.wy - prev.wy);
    const meters = usableScale
      ? Math.hypot((m.wx - prev.wx) * w, (m.wy - prev.wy) * h) * usableScale.metersPerPixel
      : null;
    return { ...m, distanceFromPrev: distNorm, distanceMetersFromPrev: meters };
  });
  const totalContacts = marks.length;
  const leftContacts = marks.filter((m) => m.side === "left").length;
  const rightContacts = marks.filter((m) => m.side === "right").length;

  // COM path in WORLD x (for zone-crossing timing under pan).
  const worldSeries = comSeries(frames).map((s) => ({ t: s.t, x: s.x + off(s.t).x }));
  const minZoneX = Math.min(gateAX, gateBX);
  const maxZoneX = Math.max(gateAX, gateBX);
  const netTravel = worldSeries.length >= 2 ? worldSeries[worldSeries.length - 1].x - worldSeries[0].x : 1;
  const zone: SprintZone | null = points
    ? {
        minX: minZoneX,
        maxX: maxZoneX,
        entryX: netTravel >= 0 ? minZoneX : maxZoneX,
        exitX: netTravel >= 0 ? maxZoneX : minZoneX,
        distanceM: points.distanceM,
      }
    : null;

  // Times the COM crosses the entry / exit gates (world x) — used both for the
  // zone time and for a robust, time-based contact-inclusion fallback.
  let tEntry: number | null = null;
  let tExit: number | null = null;
  if (zone && worldSeries.length >= 2) {
    const dir = netTravel >= 0 ? 1 : -1;
    tEntry = crossingTime(worldSeries, zone.entryX, dir);
    tExit = crossingTime(worldSeries, zone.exitX, dir);
  }

  // Valid steps: a contact counts when it sits spatially between the two gates
  // (world x) OR when it falls temporally within the gate-crossing window. The
  // time criterion recovers boundary contacts that per-contact camera-compensation
  // noise would otherwise push just outside the gates — so all steps the athlete
  // actually took between the gates are counted.
  const inWindow = (m: WorldMark) =>
    tEntry != null && tExit != null && tExit > tEntry && m.time >= tEntry - EPS && m.time <= tExit + EPS;
  const inZone = (m: WorldMark) =>
    !zone || (m.wx >= zone.minX - EPS && m.wx <= zone.maxX + EPS) || inWindow(m);
  const validMarks = marks.filter(inZone);
  const validContacts = validMarks.length;
  const validLeftContacts = validMarks.filter((m) => m.side === "left").length;
  const validRightContacts = validMarks.filter((m) => m.side === "right").length;

  // Elapsed time. Primary: the COM's traversal of the zone (world x). Fallback (no
  // zone or COM never spans it): the span between the first and last VALID contact.
  let zoneTimeS: number | null = null;
  if (tEntry != null && tExit != null && tExit > tEntry) zoneTimeS = tExit - tEntry;
  // Fallback elapsed for velocity (distance ÷ time) when the COM path doesn't
  // cleanly cross both gates: the time span of the valid in-zone contacts.
  const contactSpanSource = zone ? validMarks : marks;
  const contactSpan =
    contactSpanSource.length >= 2
      ? contactSpanSource[contactSpanSource.length - 1].time - contactSpanSource[0].time
      : null;
  const zoneElapsedS = zoneTimeS ?? (contactSpan && contactSpan > 0 ? contactSpan : null);
  if (zone && zoneTimeS == null) {
    warnings.push(
      "Athlete's tracked path didn't cleanly cross both calibration gates — zone time falls back to the valid-contact time span.",
    );
  }

  // Step frequency — VueMotion definition (Day 63). A "step" is the interval
  // between two consecutive contacts; the step's SIDE is the landing foot (the
  // later contact). Frequency = 1 / mean(step interval):
  //   • combined  = 1 / mean(all step intervals)         (= (N-1)/span; primary)
  //   • left/right = 1 / mean(intervals landing on that foot)
  // Left + right therefore do NOT sum to combined — they match how VueMotion
  // reports per-side cadence, so benchmark comparisons are directly comparable.
  const freqMarks = zone ? validMarks : marks;
  const {
    combined: combinedStepFrequencyHz,
    left: leftStepFrequencyHz,
    right: rightStepFrequencyHz,
  } = stepFrequenciesFromContacts(freqMarks);

  // Step lengths. Individual gaps come straight from consecutive contact
  // positions (metres); the zone average is the known distance ÷ valid steps.
  const gapMarks = zone ? validMarks : marks;
  const individualStepLengthsM = gapMarks
    .map((m) => m.distanceMetersFromPrev)
    .filter((v): v is number => v != null && v > 0);
  const leftGaps = gapMarks
    .filter((m) => m.side === "left")
    .map((m) => m.distanceMetersFromPrev)
    .filter((v): v is number => v != null && v > 0);
  const rightGaps = gapMarks
    .filter((m) => m.side === "right")
    .map((m) => m.distanceMetersFromPrev)
    .filter((v): v is number => v != null && v > 0);

  const avgIndividualStepLengthM = mean(individualStepLengthsM);
  const leftStepLengthM = median(leftGaps);
  const rightStepLengthM = median(rightGaps);
  const avgZoneStepLengthM =
    zone && validContacts > 0 && usableScale ? zone.distanceM / validContacts : null;

  // Individual reliability: tight spread → trust individual lengths; otherwise the
  // zone average is the trusted value and individuals are lower confidence.
  const cv = coefficientOfVariation(individualStepLengthsM);
  const stepLengthConfidence: MeasurementConfidence = !usableScale
    ? "low"
    : cv == null
      ? "medium"
      : cv <= 0.15
        ? "high"
        : cv <= 0.3
          ? "medium"
          : "low";

  // Velocity, three independent ways + a max and the zone value.
  const vDistanceOverTime =
    zone && zoneElapsedS && zoneElapsedS > 0 ? zone.distanceM / zoneElapsedS : null;
  const vAvgLenFreq =
    avgIndividualStepLengthM != null && combinedStepFrequencyHz != null
      ? avgIndividualStepLengthM * combinedStepFrequencyHz
      : null;
  const medIndividual = median(individualStepLengthsM);
  const vMedianLenFreq =
    medIndividual != null && combinedStepFrequencyHz != null
      ? medIndividual * combinedStepFrequencyHz
      : null;

  const velocities: VelocityEstimate[] = [
    { key: "distanceTime", label: "Zone distance ÷ time", method: "distance / time", value: vDistanceOverTime },
    { key: "avgLenFreq", label: "Avg step length × cadence", method: "avg length × combined frequency", value: vAvgLenFreq },
    { key: "medianLenFreq", label: "Median step length × cadence", method: "median length × combined frequency", value: vMedianLenFreq },
  ];

  const maxIndividual = individualStepLengthsM.length ? Math.max(...individualStepLengthsM) : null;
  const maxVelocityMps =
    maxIndividual != null && combinedStepFrequencyHz != null
      ? maxIndividual * combinedStepFrequencyHz
      : null;
  const zoneVelocityMps = vDistanceOverTime;

  // Agreement across the three methods.
  const vals = velocities.map((v) => v.value).filter((v): v is number => v != null && v > 0);
  let velocitySpreadPct: number | null = null;
  let velocityNote = "";
  if (vals.length >= 2) {
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const avg = mean(vals)!;
    velocitySpreadPct = avg > 0 ? ((hi - lo) / avg) * 100 : null;
    if (velocitySpreadPct != null && velocitySpreadPct > 15) {
      velocityNote =
        "Velocity methods disagree by more than 15% — usually the calibration scale, the zone crossing, or step detection needs review. Treat these as lower confidence.";
      warnings.push(velocityNote);
    } else {
      velocityNote = "Velocity methods agree closely — high confidence.";
    }
  }

  if (!usableScale) {
    warnings.push("No manual calibration — set two ground points a known distance apart for metres.");
  }

  // --- Diagnostics: which frames/contacts were used, and why some were dropped ---
  const footVisible = (f: OverlayFrame) => {
    const la = f.landmarks.leftAnkle;
    const ra = f.landmarks.rightAnkle;
    return (la && (la.visibility ?? 1) >= 0.4) || (ra && (ra.visibility ?? 1) >= 0.4);
  };
  const trackedFrames = frames.filter(footVisible).length;
  const excludedContacts = marks
    .filter((m) => !inZone(m))
    .map((m) => ({
      time: m.time,
      side: m.side,
      reason: "outside the calibration gates (world x beyond the zone)",
    }));
  const diagNotes: string[] = [];
  const firstContactTimeS = marks.length ? marks[0].time : null;
  if (frames.length && firstContactTimeS != null) {
    // Flag when the athlete was untracked for a meaningful lead-in (pose coverage).
    const clipStart = frames[0].time;
    if (firstContactTimeS - clipStart > 0.4) {
      diagNotes.push(
        `First ground contact detected at ${firstContactTimeS.toFixed(2)}s — the athlete wasn't tracked for the first ${(firstContactTimeS - clipStart).toFixed(2)}s (too small/distant early), so the earliest steps are missing.`,
      );
    }
  }
  if (trackedFrames / Math.max(1, frames.length) < 0.75) {
    diagNotes.push(
      `Only ${Math.round((trackedFrames / Math.max(1, frames.length)) * 100)}% of frames have a tracked foot — spatial coverage is partial.`,
    );
  }
  const diagnostics: MeasurementDiagnostics = {
    totalFrames: frames.length,
    trackedFrames,
    trackingCoverage: frames.length ? trackedFrames / frames.length : 0,
    firstContactTimeS,
    lastContactTimeS: marks.length ? marks[marks.length - 1].time : null,
    includedContacts: validContacts,
    excludedContacts,
    notes: diagNotes,
  };

  return {
    calibrated: !!usableScale,
    metersPerPixel: usableScale ? usableScale.metersPerPixel : null,
    totalContacts,
    leftContacts,
    rightContacts,
    validContacts,
    validLeftContacts,
    validRightContacts,
    zone,
    zoneTimeS: zoneElapsedS,
    combinedStepFrequencyHz,
    leftStepFrequencyHz,
    rightStepFrequencyHz,
    avgZoneStepLengthM,
    avgIndividualStepLengthM: usableScale ? avgIndividualStepLengthM : null,
    leftStepLengthM: usableScale ? leftStepLengthM : null,
    rightStepLengthM: usableScale ? rightStepLengthM : null,
    individualStepLengthsM,
    stepLengthConfidence,
    velocities,
    maxVelocityMps,
    zoneVelocityMps,
    velocitySpreadPct,
    velocityNote,
    cameraCompensation,
    diagnostics,
    warnings,
  };
}
