/**
 * Phase 8.1B-2B — display-only Stabilized View.
 *
 * Phases 8.1A/8.1B-1/8.1B-2A proved, across Vanni 120/240/60, that AVA's
 * scientific `cameraPath` world-lock transform correctly tracks real, small,
 * physical camera motion (source-vs-independent residuals sub-pixel to a few
 * pixels; no world-lock defect). This module does NOT re-derive camera
 * motion and does NOT touch that scientific result. It reads the SAME
 * already-validated per-frame `frameToGlobalMatrix` the browser already
 * resolves for gates/contacts/zones, applies a small temporal low-pass
 * filter to it (source-time based, deterministic, no new evidence), and
 * exposes the DIFFERENCE between the raw and filtered value as one small
 * corrective CSS transform for the shared video/overlay wrapper.
 *
 * What this buys: real camera micro-shake/slow drift (the kind Phase 8.1A
 * measured, a few pixels over ~1-2s) is visually smoothed away for review,
 * while a genuinely large/fast camera movement (well outside anything seen
 * in the forensic evidence) is intentionally passed through immediately
 * rather than fought or lagged — see `maxDivergencePx` below.
 *
 * Everything here is presentation-only:
 *   - It never feeds back into `cameraPath`, calibration, contacts, timing,
 *     or any scientific value (this module has no I/O and is not imported
 *     by any scientific/measurement module).
 *   - It never recomputes camera motion independently (no optical flow,
 *     feature matching, or phase correlation in the browser — Part B of the
 *     commissioning task explicitly forbids this; the forensic methods in
 *     Phase 8.1A/8.1B were audit-only tools, not a production dependency).
 *   - RAW mode (`enabled: false`) is byte-identical to pre-phase behavior:
 *     `stepDisplayStabilization` short-circuits to the pure identity
 *     transform, exactly mirroring `stepPresentationCamera`'s own
 *     `!options.enabled` short-circuit in `presentationCamera.ts`.
 */

export interface SimilarityTransform {
  /** Normalized translation, fraction of source width. */
  translationX: number;
  /** Normalized translation, fraction of source height. */
  translationY: number;
  rotationDeg: number;
  scale: number;
}

export const IDENTITY_SIMILARITY: SimilarityTransform = {
  translationX: 0,
  translationY: 0,
  rotationDeg: 0,
  scale: 1,
};

// --- 3x3 homogeneous matrix helpers -----------------------------------
// Deliberately mirrors camera_path.py's own convention EXACTLY (rotation +
// uniform scale applied in RAW PIXEL space around the origin (0,0), then
// translate; translation stored normalized) -- see that file's
// `similarity_to_np`/`np_to_similarity`/`compose_np`. Using the identical
// convention is what makes `stabilizationCorrection` below mathematically
// coherent with the real `frameToGlobalMatrix` values it consumes (Part H:
// rotation and translation must compose as ONE transform, never smoothed or
// combined ad hoc per-axis in screen space).
type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

function toMatrix(t: SimilarityTransform, width: number, height: number): Mat3 {
  const theta = (t.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta) * t.scale;
  const sin = Math.sin(theta) * t.scale;
  return [cos, -sin, t.translationX * width, sin, cos, t.translationY * height, 0, 0, 1];
}

function fromMatrix(m: Mat3, width: number, height: number): SimilarityTransform {
  const [a, , , c] = m;
  const scale = Math.hypot(a, c);
  const rotationDeg = (Math.atan2(c, a) * 180) / Math.PI;
  return {
    rotationDeg,
    scale: Math.max(1e-6, scale),
    translationX: m[2] / width,
    translationY: m[5] / height,
  };
}

/** `later` applied AFTER `earlier`: composeMatrix(B, A) maps a point through A then B. */
function multiply(b: Mat3, a: Mat3): Mat3 {
  return [
    b[0] * a[0] + b[1] * a[3] + b[2] * a[6],
    b[0] * a[1] + b[1] * a[4] + b[2] * a[7],
    b[0] * a[2] + b[1] * a[5] + b[2] * a[8],
    b[3] * a[0] + b[4] * a[3] + b[5] * a[6],
    b[3] * a[1] + b[4] * a[4] + b[5] * a[7],
    b[3] * a[2] + b[4] * a[5] + b[5] * a[8],
    b[6] * a[0] + b[7] * a[3] + b[8] * a[6],
    b[6] * a[1] + b[7] * a[4] + b[8] * a[7],
    b[6] * a[2] + b[7] * a[5] + b[8] * a[8],
  ];
}

function invert(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const s = Math.abs(det) > 1e-12 ? 1 / det : 0;
  return [
    (e * i - f * h) * s,
    (c * h - b * i) * s,
    (b * f - c * e) * s,
    (f * g - d * i) * s,
    (a * i - c * g) * s,
    (c * d - a * f) * s,
    (d * h - e * g) * s,
    (b * g - a * h) * s,
    (a * e - b * d) * s,
  ];
}

/** Compose two similarity transforms: `composeSimilarity(later, earlier)` maps a point through `earlier` then `later`. */
export function composeSimilarity(
  later: SimilarityTransform,
  earlier: SimilarityTransform,
  width: number,
  height: number,
): SimilarityTransform {
  return fromMatrix(multiply(toMatrix(later, width, height), toMatrix(earlier, width, height)), width, height);
}

export function invertSimilarity(t: SimilarityTransform, width: number, height: number): SimilarityTransform {
  return fromMatrix(invert(toMatrix(t, width, height)), width, height);
}

export function applySimilarityToPoint(
  t: SimilarityTransform,
  point: { x: number; y: number },
  width: number,
  height: number,
): { x: number; y: number } {
  const m = toMatrix(t, width, height);
  const px = point.x * width;
  const py = point.y * height;
  return { x: (m[0] * px + m[1] * py + m[2]) / width, y: (m[3] * px + m[4] * py + m[5]) / height };
}

/**
 * Resolve the Auto Follow source-space centre that preserves an existing
 * composition after an OUTER display-stabilization correction is applied.
 *
 * With the current wrapper order, a source point `p` reaches the screen as
 * `S(0.5 + z * (p - c))`, where `S` is the display correction, `z` is the
 * Auto Follow zoom, and `c` is its source-space crop centre. `rawCenter` is
 * the centre Auto Follow would have used without stabilization. We preserve
 * that requested composition by solving the equation for `c`; subtracting
 * `S`'s translation directly would be wrong whenever zoom, rotation, or
 * stabilization scale is non-identity.
 *
 * This is presentation-only math. It does not alter the athlete trajectory,
 * cameraPath, calibration, or measurement coordinates.
 */
export function compensateFollowCenterForStabilization(
  subject: { x: number; y: number },
  rawCenter: { x: number; y: number },
  autoFollowScale: number,
  correction: SimilarityTransform,
  width: number,
  height: number,
): { x: number; y: number } {
  const zoom = Math.max(1e-6, autoFollowScale);
  const requestedViewportPoint = {
    x: 0.5 + zoom * (subject.x - rawCenter.x),
    y: 0.5 + zoom * (subject.y - rawCenter.y),
  };
  const beforeStabilization = applySimilarityToPoint(
    invertSimilarity(correction, width, height),
    requestedViewportPoint,
    width,
    height,
  );
  return {
    x: subject.x - (beforeStabilization.x - 0.5) / zoom,
    y: subject.y - (beforeStabilization.y - 0.5) / zoom,
  };
}

/**
 * Worst-case pixel divergence between two similarity transforms, sampled at
 * the four frame corners AND the center. Corners carry the largest lever-arm
 * amplification from a rotation difference (Part G/H); the center isolates
 * pure translation/scale divergence. Using the max across all five is a
 * deliberately conservative (never-underestimate) single scalar for the
 * deadzone/classification decision below.
 */
const REFERENCE_POINTS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
  { x: 0.5, y: 0.5 },
];

export function similarityDivergencePx(
  a: SimilarityTransform,
  b: SimilarityTransform,
  width: number,
  height: number,
): number {
  let max = 0;
  for (const p of REFERENCE_POINTS) {
    const pa = applySimilarityToPoint(a, p, width, height);
    const pb = applySimilarityToPoint(b, p, width, height);
    const dx = (pa.x - pb.x) * width;
    const dy = (pa.y - pb.y) * height;
    max = Math.max(max, Math.hypot(dx, dy));
  }
  return max;
}

// --- Motion classification (Part D) -------------------------------------
// A small, informational contract -- does NOT gate whether smoothing runs
// (the deadzone/fast-track logic in stepDisplayStabilization does that
// continuously); this only labels the CURRENT divergence for diagnostics/UI,
// deliberately kept smaller than the task's full suggested vocabulary
// ("do not over-engineer if a smaller contract suffices").
export type DisplayMotionClass = "stable" | "micro_shake" | "small_drift" | "intentional_motion";

export interface DisplayStabilizationConfig {
  /**
   * Below this worst-case pixel divergence, the smoothed transform does not
   * move at all -- reuses Phase 6.2's own evidence-backed atomic gate
   * deadzone precedent (0.5 SOURCE px; `docs/phase-6-2-world-locked-gates-and-camera-shake.md`
   * Section 9: "above all four measured transform p95s (.045-.238 px) but
   * below observed real peaks (up to .973 px)"). Expressed in SOURCE pixels,
   * not CSS/display pixels, so it is resolution-, DPR-, and CSS-size-independent.
   */
  deadzoneSourcePx: number;
  /** Source-time constant for ordinary (micro-shake/small-drift) smoothing. */
  timeConstantS: number;
  /**
   * Above this worst-case pixel divergence between the raw and smoothed
   * transform, treat the motion as intentional/large and pass it through
   * immediately (no lag, no continued easing) -- so the stabilizer never
   * visibly fights or lags a real, large camera movement. Set well above
   * every real post-exit drift magnitude Phase 8.1A/8.1B-1/8.1B-2A measured
   * across all three Vanni benchmarks (max ~10 px observed; this is set to
   * 58 px, an order of magnitude higher, so it activates only for motion
   * clearly outside that evidence band).
   */
  maxDivergencePx: number;
  /** Classification boundary: micro_shake vs small_drift, in worst-case px. */
  microShakeMaxPx: number;
  /** Classification boundary: small_drift vs intentional_motion, in worst-case px (equals maxDivergencePx). */
}

/**
 * Evidence-backed defaults (Phase 8.1A/8.1B-1/8.1B-2A real, measured
 * post-exit motion across Vanni 120/240/60 -- see
 * docs/phase-8-1b2a-cross-benchmark-camera-motion-validation.md Section 10):
 * real drift magnitude topped out ~6-10 px over ~1.5-1.9s of elapsed source
 * time, growing smoothly (never a step). `timeConstantS=0.6` smooths that
 * out comfortably within about one real-world "settle" cycle without ever
 * lagging by more than a couple of time constants; `deadzoneSourcePx=0.5`
 * matches the ALREADY-shipped Phase 6.2 gate deadzone exactly, both in value
 * and in its own evidence justification.
 */
export const DEFAULT_DISPLAY_STABILIZATION_CONFIG: DisplayStabilizationConfig = {
  deadzoneSourcePx: 0.5,
  timeConstantS: 0.6,
  maxDivergencePx: 58,
  microShakeMaxPx: 2,
};

export function classifyDisplayMotion(
  divergencePx: number,
  config: DisplayStabilizationConfig = DEFAULT_DISPLAY_STABILIZATION_CONFIG,
): DisplayMotionClass {
  if (divergencePx < config.deadzoneSourcePx) return "stable";
  if (divergencePx < config.microShakeMaxPx) return "micro_shake";
  if (divergencePx < config.maxDivergencePx) return "small_drift";
  return "intentional_motion";
}

export interface DisplayStabilizationState {
  enabled: boolean;
  /** The smoothed (filtered) equivalent of the current frame's real, resolved `frameToGlobalMatrix`. */
  smoothed: SimilarityTransform;
  timestampMs: number;
  sourceFrameIndex: number | null;
  motionClass: DisplayMotionClass;
  /** Worst-case px divergence between raw and smoothed this frame -- diagnostic only. */
  divergencePx: number;
}

export const IDENTITY_DISPLAY_STABILIZATION: DisplayStabilizationState = {
  enabled: false,
  smoothed: IDENTITY_SIMILARITY,
  timestampMs: 0,
  sourceFrameIndex: null,
  motionClass: "stable",
  divergencePx: 0,
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const expAlpha = (dt: number, tau: number) => 1 - Math.exp(-Math.max(0, dt) / Math.max(1e-6, tau));

export interface DisplayStabilizationStepOptions {
  enabled: boolean;
  /** Seek, pause, or fresh-frame-zero selection: evaluate directly at the raw value, no animation (Part P). */
  directSelection?: boolean;
}

/**
 * One deterministic, source-time-based step. Pure function: identical
 * (previous, raw, timestampMs, sourceFrameIndex, options) always produces an
 * identical result, so 0.25x/0.5x/1x playback (Part Q) and scrub/pause
 * (Part P) all resolve to the same transform at the same source time. `raw`
 * is the CURRENT frame's real, already-decomposed `frameToGlobalMatrix` --
 * the only input this function reads about camera motion (Part B).
 */
export function stepDisplayStabilization(
  previous: DisplayStabilizationState,
  raw: SimilarityTransform,
  timestampMs: number,
  sourceFrameIndex: number,
  width: number,
  height: number,
  options: DisplayStabilizationStepOptions,
  config: DisplayStabilizationConfig = DEFAULT_DISPLAY_STABILIZATION_CONFIG,
): DisplayStabilizationState {
  if (!options.enabled) {
    return { ...IDENTITY_DISPLAY_STABILIZATION, timestampMs, sourceFrameIndex };
  }
  if (options.directSelection || previous.sourceFrameIndex == null) {
    return { enabled: true, smoothed: raw, timestampMs, sourceFrameIndex, motionClass: "stable", divergencePx: 0 };
  }
  const dt = Math.min(0.5, Math.max(0, (timestampMs - previous.timestampMs) / 1000));
  if (dt <= 0) return { ...previous, timestampMs, sourceFrameIndex };

  const divergencePx = similarityDivergencePx(raw, previous.smoothed, width, height);
  const motionClass = classifyDisplayMotion(divergencePx, config);
  if (motionClass === "stable") {
    // Below the deadzone: hold the smoothed value exactly still (Part E).
    return { ...previous, timestampMs, sourceFrameIndex, motionClass, divergencePx };
  }
  if (motionClass === "intentional_motion") {
    // Beyond the evidence-based band (every real post-exit drift measured in
    // Phase 8.1A/8.1B-1/8.1B-2A topped out ~10px; this threshold is set an
    // order of magnitude higher): this is not camera shake, so pass it
    // through immediately rather than continuing to ease toward it (a
    // two-speed ease -- fast then reverting to the slow constant once inside
    // the ordinary band -- was evaluated and rejected: it produces a visible
    // deceleration "kink" right as the real motion is otherwise correctly
    // being resolved, exactly the fought/lagged feeling Part J prohibits).
    // Deliberately identical to a `directSelection` reset.
    return { enabled: true, smoothed: raw, timestampMs, sourceFrameIndex, motionClass, divergencePx: 0 };
  }
  const alpha = expAlpha(dt, config.timeConstantS);
  const smoothed: SimilarityTransform = {
    translationX: lerp(previous.smoothed.translationX, raw.translationX, alpha),
    translationY: lerp(previous.smoothed.translationY, raw.translationY, alpha),
    rotationDeg: lerp(previous.smoothed.rotationDeg, raw.rotationDeg, alpha),
    scale: lerp(previous.smoothed.scale, raw.scale, alpha),
  };
  return { enabled: true, smoothed, timestampMs, sourceFrameIndex, motionClass, divergencePx };
}

/**
 * The small corrective transform to apply, on top of the already-rendered
 * raw picture, to display world-anchored content at the SMOOTHED position
 * instead of the raw one. `correction = smoothed^-1 ∘ raw`, applied as one
 * coherent similarity transform (never independent per-axis smoothing in
 * screen space -- Part H).
 */
export function stabilizationCorrection(
  state: DisplayStabilizationState,
  raw: SimilarityTransform,
  width: number,
  height: number,
): SimilarityTransform {
  if (!state.enabled) return IDENTITY_SIMILARITY;
  const smoothedInverse = invertSimilarity(state.smoothed, width, height);
  return composeSimilarity(smoothedInverse, raw, width, height);
}

/**
 * CSS `transform` value for the correction. Pairs with `transform-origin: 0 0`
 * (matching `followTransform`'s own convention exactly), applied to a wrapper
 * OUTSIDE (i.e. composed on top of) the existing Auto Follow wrapper, so a
 * correction expressed as a fraction of source width/height scales correctly
 * with any Auto Follow zoom already applied beneath it.
 */
export function stabilizationTransform(correction: SimilarityTransform): string {
  const tx = correction.translationX * 100;
  const ty = correction.translationY * 100;
  return `translate(${tx}%, ${ty}%) rotate(${correction.rotationDeg}deg) scale(${correction.scale})`;
}

export function stabilizationDiffers(a: SimilarityTransform, b: SimilarityTransform, epsilon = 1e-5): boolean {
  return (
    Math.abs(a.translationX - b.translationX) > epsilon ||
    Math.abs(a.translationY - b.translationY) > epsilon ||
    Math.abs(a.rotationDeg - b.rotationDeg) > epsilon ||
    Math.abs(a.scale - b.scale) > epsilon
  );
}

/**
 * One source-time timeline entry: the frame this state was resolved for, the
 * raw transform read that frame, and the resulting stabilization state.
 */
export interface DisplayStabilizationPathEntry {
  sourceFrameIndex: number;
  timeS: number;
  raw: SimilarityTransform | null;
  state: DisplayStabilizationState;
}

/**
 * Resolve the stabilization path once over EVERY source frame with a
 * `getRawTransform` result (mirrors `buildPresentationCameraPath`'s own
 * "resolve once over the complete source-time path" design, Part Q: so
 * playback rate/display cadence can never change the dynamics — a scrub to
 * frame N always reaches the exact same state[N] regardless of how it got
 * there). Frames without a real, resolved raw transform (Part B: only real
 * cameraPath evidence is consumed) pass the previous state through
 * unchanged, matching `stepDisplayStabilization`'s own "no raw evidence this
 * frame" contract implicitly via `raw: null`.
 */
export function buildDisplayStabilizationPath(
  frameTimeline: ReadonlyArray<{ sourceFrameIndex: number; timeS: number }>,
  getRawTransform: (sourceFrameIndex: number) => SimilarityTransform | null,
  width: number,
  height: number,
  config: DisplayStabilizationConfig = DEFAULT_DISPLAY_STABILIZATION_CONFIG,
): DisplayStabilizationPathEntry[] {
  let state = IDENTITY_DISPLAY_STABILIZATION;
  return frameTimeline.map((entry, index) => {
    const raw = getRawTransform(entry.sourceFrameIndex);
    if (raw) {
      state = stepDisplayStabilization(
        state,
        raw,
        entry.timeS * 1000,
        entry.sourceFrameIndex,
        width,
        height,
        { enabled: true, directSelection: index === 0 },
        config,
      );
    }
    return { sourceFrameIndex: entry.sourceFrameIndex, timeS: entry.timeS, raw, state };
  });
}
