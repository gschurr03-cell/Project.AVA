/**
 * Step marks (Day 56, corrected Day 61) — turning foot contacts into visible,
 * ordered step landmarks for the overlay.
 *
 * This is a *visualization* helper, not a biomechanics metric. It detects ground
 * contacts directly from the overlay's foot landmarks (the stored pose artifact
 * carries no contact events), assigns each a chronological step index, and
 * measures the gap to the previous contact.
 *
 * A "step" here means exactly **one true ground contact by one foot**. The Day 61
 * corrections make that guarantee hold on real footage:
 *   1. Per foot, one contact can only be counted once per stride (a foot cannot
 *      re-strike faster than {@link StepDetectionConfig.minSameSideSpacingMs}).
 *   2. After both feet are merged, a global de-duplication pass drops any second
 *      mark that lands within {@link StepDetectionConfig.minStepSpacingMs} of the
 *      one before it, keeping the more prominent (deeper, better-tracked) contact.
 *      This kills the "too many steps" doubles and biases the result toward a
 *      natural left → right → left → right alternation.
 *
 * Distance: each mark carries the gap to the previous contact in **normalized
 * image units** (`distanceFromPrev`, always available but unitless) and, once a
 * calibration scale is supplied via {@link applyRealWorldStepDistances}, the same
 * gap in **metres** (`distanceMetersFromPrev`). Step distance is a *spatial* gap
 * between contacts — it is deliberately separate from contact time and flight
 * time, which are temporal metrics and must never be shown in its place.
 *
 * The contact heuristic mirrors the worker-side {@link detectFootContacts}:
 * per foot, build a y-trajectory from the foot keypoints (image y grows
 * downward, so the lowest foot point is a local maximum), smooth it, and take
 * spaced local maxima as contacts. The pure array helpers are reused from there;
 * no biomechanics code is modified.
 */

import { smoothSeries, findLocalMaxima } from "@/lib/biomechanics/events/FootContactDetector";
import type { OverlayFrame } from "./overlay";

export type StepSide = "left" | "right";

/** One detected ground contact, ready to draw as a step landmark. */
export interface StepMark {
  side: StepSide;
  /** OverlayFrame.frame index of the contact. */
  frame: number;
  /** Immutable source-video frame carrying the contact evidence. */
  sourceFrameIndex: number;
  /** Contact time in seconds. */
  time: number;
  /** Normalized foot position at contact (image space, 0..1). */
  x: number;
  y: number;
  /** 1-based chronological step number across both feet. */
  index: number;
  /**
   * Distance to the previous step in normalized image units — an UNCALIBRATED
   * estimate (no real-world scale). `null` for the first step.
   */
  distanceFromPrev: number | null;
  /**
   * Distance to the previous step in **metres**, or `null` when there is no
   * calibration scale (see {@link applyRealWorldStepDistances}) or for the first
   * step. This is a spatial gap between contacts — never a time.
   */
  distanceMetersFromPrev: number | null;
}

export interface StepDetectionConfig {
  /** Ignore foot keypoints below this visibility. */
  minVisibility: number;
  /** Moving-average window (frames) applied to the foot y-trajectory. */
  smoothingWindowFrames: number;
  /**
   * Minimum time between consecutive contacts **on one foot**. A single foot
   * only strikes once per stride, so this is generous — it suppresses a single
   * contact registering as several nearby maxima.
   */
  minSameSideSpacingMs: number;
  /**
   * Minimum time between any two counted steps (across both feet). Below this a
   * second mark is treated as a duplicate of the same physical contact.
   */
  minStepSpacingMs: number;
  /** Below this normalized y-range the foot barely moves — no reliable contacts. */
  minAmplitude: number;
}

export const DEFAULT_STEP_CONFIG: StepDetectionConfig = {
  minVisibility: 0.4,
  smoothingWindowFrames: 3,
  // A foot strikes ~once per stride (~400 ms at speed); 250 ms cannot drop a real
  // stride but does collapse a single contact's cluster of maxima into one.
  minSameSideSpacingMs: 250,
  // Successive foot-strikes (opposite feet) are ~180 ms+ apart even at elite
  // cadence, so 130 ms only removes sub-contact noise / cross-foot doubles.
  minStepSpacingMs: 130,
  minAmplitude: 0.01,
};

/** Overlay landmark keys per foot (ankle/heel/toe), lowest = ground contact. */
const SIDE_FOOT_JOINTS: Record<StepSide, string[]> = {
  left: ["leftAnkle", "leftHeel", "leftFootIndex"],
  right: ["rightAnkle", "rightHeel", "rightFootIndex"],
};

const MIN_VALID_FRAMES = 3;

/** A calibration scale for turning normalized step gaps into metres. */
export interface StepDistanceScale {
  /** Metres per pixel at the athlete's depth. */
  metersPerPixel: number;
  /** Source video pixel dimensions (normalized coords are scaled by these). */
  frameWidth: number;
  frameHeight: number;
}

/**
 * Phase R1C — the single, shared frame-eligibility gate every contact
 * consumer (scientific `measurements.ts` and the render-side overlay) must
 * apply identically before calling {@link detectStepMarks}. Previously each
 * side had its own inline copy; `measurements.ts` stripped
 * predicted/invalid/frozen_suspect landmarks first (Phase 4.2/4.2B, with the
 * Phase 4.2K `independent_corroborated` exception) while the overlay called
 * `detectStepMarks` on completely unstripped frames — a real divergence in
 * WHICH contacts get detected, not merely a numbering difference (see
 * docs/phase-r1c-authoritative-contact-render-alignment.md). Extracted here
 * so both call sites share one implementation and cannot drift again.
 *
 * A "predicted"/"invalid" boxOrigin means the crop that frame's landmarks
 * came from was guided by extrapolation, not verified box tracking/detection.
 * "frozen_suspect" means a later identity-verified detection proved the box
 * had settled onto near-static structure instead of the real, moving
 * athlete. Frames without a boxOrigin at all (legacy artifacts) are
 * unaffected. The one exception: a "frozen_suspect" frame whose real box
 * position independently agrees with trusted evidence both before and after
 * the uncertain run (`independentLocalizationState ===
 * "independent_corroborated"`) is not stripped.
 */
export function stripUnstableLandmarks(frames: OverlayFrame[]): OverlayFrame[] {
  return frames.map((f) => {
    const unstable = f.boxOrigin === "predicted" || f.boxOrigin === "invalid" || f.boxOrigin === "frozen_suspect";
    const independentlyCorroborated =
      f.boxOrigin === "frozen_suspect" && f.independentLocalizationState === "independent_corroborated";
    return unstable && !independentlyCorroborated ? { ...f, landmarks: {} } : f;
  });
}

/** Mean position + mean visibility of the usable foot keypoints in a frame, or null. */
function footSample(
  frame: OverlayFrame,
  joints: string[],
  minVis: number,
): { x: number; y: number; vis: number } | null {
  let sx = 0;
  let sy = 0;
  let sv = 0;
  let n = 0;
  for (const joint of joints) {
    const p = frame.landmarks[joint];
    if (p && (p.visibility ?? 1) >= minVis) {
      sx += p.x;
      sy += p.y;
      sv += p.visibility ?? 1;
      n += 1;
    }
  }
  return n > 0 ? { x: sx / n, y: sy / n, vis: sv / n } : null;
}

interface RawContact {
  side: StepSide;
  frame: number;
  time: number;
  x: number;
  y: number;
  /** Foot depth at contact (normalized y; larger = lower on screen = stronger). */
  prominence: number;
  /** Mean keypoint visibility at contact. */
  vis: number;
}

/** Read-only stage evidence for offline contact diagnostics. */
export interface StepDetectionTraceContact {
  side: StepSide;
  frame: number;
  sourceFrameIndex: number;
  time: number;
  x: number;
  y: number;
  prominence: number;
  visibility: number;
}

/**
 * Read-only explanation of the existing detector's decision chain. This is
 * deliberately separate from `StepMark`: it is for validation artifacts and
 * never changes acceptance, confidence, or production event output.
 */
export interface StepDetectionTrace {
  candidates: StepDetectionTraceContact[];
  acceptedPerSide: StepDetectionTraceContact[];
  afterGlobalDedup: StepDetectionTraceContact[];
  afterRecovery: StepDetectionTraceContact[];
}

/**
 * Contact strength, used to decide which of two near-simultaneous marks is the
 * real ground contact: a lower foot (deeper y) wins, with tracking confidence as
 * the tie-break.
 */
function contactScore(c: RawContact): number {
  return c.prominence + c.vis * 1e-3;
}

/**
 * Local maxima INCLUDING the start boundary of the tracked window (Day 71). The
 * shared {@link findLocalMaxima} can't mark the first finite sample — it needs a
 * finite neighbour on BOTH sides — so a genuine contact that occurs exactly when the
 * athlete first becomes visible is invisible to it. Here the first finite sample is
 * added as a candidate peak when the foot is at its lowest there and RISES afterwards
 * (`y[first] > y[first+1]`, image-y grows downward), i.e. the foot was planted at the
 * moment of first visibility and then lifts off — a real "contact at onset".
 *
 * The END boundary is deliberately NOT recovered: at the last tracked frame a foot
 * that is still descending (`y[last] > y[last-1]`) has not yet completed a contact —
 * the peak lies beyond the clip — so marking it would fabricate a contact the data
 * doesn't support. Downstream spacing + duplicate suppression still reject noise, so
 * this never invents a contact where a stronger, closer one exists.
 */
function boundaryAwareMaxima(values: number[], observedValues: number[]): number[] {
  const peaks = new Set(findLocalMaxima(values));
  // Smoothing intentionally bridges a one-frame NaN edge with its finite
  // neighbour. That is useful for an interior trajectory but must not move the
  // *start-of-observation* event onto an unobserved frame: a boundary candidate
  // needs an actual usable foot sample at its own frame.
  const first = observedValues.findIndex((v) => Number.isFinite(v));
  if (
    first >= 0 &&
    first + 1 < values.length &&
    Number.isFinite(observedValues[first + 1]) &&
    Number.isFinite(values[first]) &&
    observedValues[first] > observedValues[first + 1]
  ) {
    peaks.add(first);
  }
  return [...peaks].sort((a, b) => a - b);
}

function detectSide(
  frames: OverlayFrame[],
  side: StepSide,
  cfg: StepDetectionConfig,
): { accepted: RawContact[]; candidates: RawContact[] } {
  const joints = SIDE_FOOT_JOINTS[side];
  const samples = frames.map((f) => footSample(f, joints, cfg.minVisibility));
  const ys = samples.map((s) => (s ? s.y : NaN));
  if (ys.filter(Number.isFinite).length < MIN_VALID_FRAMES) return { accepted: [], candidates: [] };

  const smoothed = smoothSeries(ys, cfg.smoothingWindowFrames);
  const finite = smoothed.filter((v): v is number => Number.isFinite(v));
  if (finite.length < MIN_VALID_FRAMES) return { accepted: [], candidates: [] };
  const amplitude = Math.max(...finite) - Math.min(...finite);
  if (amplitude < cfg.minAmplitude) return { accepted: [], candidates: [] };

  const contacts: RawContact[] = [];
  const candidates: RawContact[] = [];
  let lastMs = -Infinity;
  for (const idx of boundaryAwareMaxima(smoothed, ys)) {
    const time = frames[idx].time;
    const pos = samples[idx] ?? footSample(frames[idx], joints, 0);
    if (!pos) continue;
    const candidate: RawContact = {
      side,
      frame: frames[idx].frame,
      time,
      x: pos.x,
      y: pos.y,
      prominence: smoothed[idx],
      vis: pos.vis,
    };
    candidates.push(candidate);
    // One foot cannot re-strike within a stride: enforce a generous per-foot gap,
    // keeping the deeper contact if a closer maximum appears.
    if (time * 1000 - lastMs < cfg.minSameSideSpacingMs) {
      const last = contacts[contacts.length - 1];
      if (last && smoothed[idx] > last.prominence) {
        contacts[contacts.length - 1] = candidate;
        lastMs = time * 1000;
      }
      continue;
    }
    lastMs = time * 1000;
    contacts.push(candidate);
  }
  return { accepted: contacts, candidates };
}

/**
 * Global de-duplication across both feet: walk the merged, time-sorted contacts
 * and drop any that falls within `minStepSpacingMs` of the previously kept mark,
 * keeping whichever contact is more prominent. This removes duplicate strikes of
 * the same physical contact and biases the sequence toward natural L/R
 * alternation without ever forcing an alternation that the data doesn't support.
 */
function suppressDuplicates(raw: RawContact[], cfg: StepDetectionConfig): RawContact[] {
  const sorted = [...raw].sort((a, b) => a.time - b.time || a.side.localeCompare(b.side));
  const kept: RawContact[] = [];
  for (const c of sorted) {
    const last = kept[kept.length - 1];
    if (!last) {
      kept.push(c);
      continue;
    }
    const gapMs = (c.time - last.time) * 1000;
    const sameSide = c.side === last.side;
    // Too close to be a distinct step, or the same foot re-striking impossibly
    // fast → a duplicate of `last`. Keep the stronger of the two.
    if (gapMs < cfg.minStepSpacingMs || (sameSide && gapMs < cfg.minSameSideSpacingMs)) {
      if (contactScore(c) > contactScore(last)) kept[kept.length - 1] = c;
      continue;
    }
    kept.push(c);
  }
  return kept;
}

/**
 * A per-side candidate that is later removed by cross-foot de-duplication must
 * not continue to own that side's cooldown. When the final merged sequence has
 * two consecutive contacts on the same foot, re-check the already-generated
 * opposite-foot maxima between them. The last candidate satisfying the existing
 * global spacing guard on BOTH sides is the only candidate whose temporal
 * ownership belongs to the interval immediately preceding the trailing strike;
 * earlier maxima can still be echoes of the leading strike.
 *
 * This does not create pose evidence, relax either spacing value, or recover a
 * localization-withheld frame: only candidates already generated from eligible
 * landmarks participate.
 */
function recoverSuppressedOppositeContacts(
  marks: RawContact[],
  candidates: RawContact[],
  cfg: StepDetectionConfig,
): RawContact[] {
  const recovered = [...marks].sort((a, b) => a.time - b.time || a.side.localeCompare(b.side));
  for (let i = 0; i + 1 < recovered.length; i++) {
    const before = recovered[i];
    const after = recovered[i + 1];
    if (before.side !== after.side) continue;
    const opposite: StepSide = before.side === "left" ? "right" : "left";
    const eligible = candidates.filter(
      (candidate) =>
        candidate.side === opposite &&
        candidate.time > before.time &&
        candidate.time < after.time &&
        (candidate.time - before.time) * 1000 >= cfg.minStepSpacingMs &&
        (after.time - candidate.time) * 1000 >= cfg.minStepSpacingMs,
    );
    const candidate = eligible[eligible.length - 1];
    if (!candidate) continue;
    recovered.splice(i + 1, 0, candidate);
    i += 1;
  }
  return recovered;
}

/**
 * Detect ordered step marks across an overlay sequence. Both feet are merged,
 * de-duplicated (one mark per true contact, biased toward L/R alternation), and
 * numbered chronologically; each mark carries the uncalibrated normalized
 * distance to the previous mark. Real-world (metre) distances are added
 * separately by {@link applyRealWorldStepDistances}. Returns `[]` when data is
 * too sparse.
 */
export function detectStepMarks(
  frames: OverlayFrame[],
  config: StepDetectionConfig = DEFAULT_STEP_CONFIG,
): StepMark[] {
  if (!frames || frames.length < MIN_VALID_FRAMES) return [];

  const left = detectSide(frames, "left", config);
  const right = detectSide(frames, "right", config);
  const merged = [...left.accepted, ...right.accepted];
  const deduped = recoverSuppressedOppositeContacts(
    suppressDuplicates(merged, config),
    [...left.candidates, ...right.candidates].sort(
      (a, b) => a.time - b.time || a.side.localeCompare(b.side),
    ),
    config,
  );

  return deduped.map((mark, i) => ({
    side: mark.side,
    frame: mark.frame,
    sourceFrameIndex: frames[mark.frame]?.sourceFrameIndex ?? mark.frame,
    time: mark.time,
    x: mark.x,
    y: mark.y,
    index: i + 1,
    distanceFromPrev:
      i > 0 ? Math.hypot(mark.x - deduped[i - 1].x, mark.y - deduped[i - 1].y) : null,
    distanceMetersFromPrev: null,
  }));
}

/**
 * Expose the exact existing candidate → per-side spacing → global dedup →
 * recovery stages for offline diagnostics. Production callers continue to use
 * `detectStepMarks`; this helper is intentionally read-only.
 */
export function traceStepDetection(
  frames: OverlayFrame[],
  config: StepDetectionConfig = DEFAULT_STEP_CONFIG,
): StepDetectionTrace {
  if (!frames || frames.length < MIN_VALID_FRAMES) {
    return { candidates: [], acceptedPerSide: [], afterGlobalDedup: [], afterRecovery: [] };
  }
  const left = detectSide(frames, "left", config);
  const right = detectSide(frames, "right", config);
  const acceptedPerSide = [...left.accepted, ...right.accepted];
  const afterGlobalDedup = suppressDuplicates(acceptedPerSide, config);
  const afterRecovery = recoverSuppressedOppositeContacts(
    afterGlobalDedup,
    [...left.candidates, ...right.candidates].sort((a, b) => a.time - b.time || a.side.localeCompare(b.side)),
    config,
  );
  const expose = (mark: RawContact): StepDetectionTraceContact => ({
    side: mark.side,
    frame: mark.frame,
    sourceFrameIndex: frames[mark.frame]?.sourceFrameIndex ?? mark.frame,
    time: mark.time,
    x: mark.x,
    y: mark.y,
    prominence: mark.prominence,
    visibility: mark.vis,
  });
  return {
    candidates: [...left.candidates, ...right.candidates].sort((a, b) => a.time - b.time || a.side.localeCompare(b.side)).map(expose),
    acceptedPerSide: acceptedPerSide.sort((a, b) => a.time - b.time || a.side.localeCompare(b.side)).map(expose),
    afterGlobalDedup: afterGlobalDedup.map(expose),
    afterRecovery: afterRecovery.map(expose),
  };
}

/**
 * Fill in `distanceMetersFromPrev` for each mark from a calibration scale. With
 * no (or an invalid) scale, every metre distance is left `null` so callers show
 * the uncalibrated/relative label instead of inventing a real-world number.
 * Pure: returns new marks, never mutates the input.
 */
export function applyRealWorldStepDistances(
  marks: StepMark[],
  scale: StepDistanceScale | null | undefined,
): StepMark[] {
  const usable =
    !!scale &&
    scale.metersPerPixel > 0 &&
    scale.frameWidth > 0 &&
    scale.frameHeight > 0;

  return marks.map((mark, i) => {
    if (!usable || i === 0) return { ...mark, distanceMetersFromPrev: null };
    const prev = marks[i - 1];
    const dxPx = (mark.x - prev.x) * scale!.frameWidth;
    const dyPx = (mark.y - prev.y) * scale!.frameHeight;
    return {
      ...mark,
      distanceMetersFromPrev: Math.hypot(dxPx, dyPx) * scale!.metersPerPixel,
    };
  });
}
