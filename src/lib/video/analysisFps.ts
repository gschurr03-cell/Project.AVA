import policy from "./fpsPolicy.json";

export const VALIDATED_ANALYSIS_FPS = policy.validatedAnalysisFps;
export const EXPERIMENTAL_30_ANALYSIS_FPS = policy.experimental30AnalysisFps;
export const SOURCE_FPS_TIER_POLICY_VERSION = policy.policyVersion;
export const MINIMUM_60_FPS_CLASS = policy.minimumNominal60Fps;
export const MAXIMUM_60_FPS_CLASS = policy.maximumNominal60Fps;
export const MIN_SUPPORTED_FPS = policy.minSupportedFps;
export const MAX_SUPPORTED_FPS = policy.maxSupportedFps;
export const UNSUPPORTED_FPS_MESSAGE = policy.unsupportedMessage;

/**
 * `experimental_30_fps_class` and `validated_60_fps_class` are precise, narrow
 * windows (~29-30.5 / ~59-60.5) kept because specific subsystems key off them
 * exactly: the fly experimental-30 zone-timing profile, and the validated-60
 * production completion identity. Every OTHER accepted rate in [24, 300] —
 * whether 24, 45, 75, 90, 144, or 165 — is `native_source_class`: it keeps its
 * own exact rate as `analysisFps` and is fully eligible for general video/pose
 * analysis. `validated_high_speed_native_class` and
 * `high_speed_source_normalized_to_60` are kept only so historical rows still
 * validate — neither is produced by current detection anymore.
 */
export type SourceFpsClassification =
  | "experimental_30_fps_class"
  | "validated_60_fps_class"
  | "native_source_class"
  | "validated_high_speed_native_class"
  | "high_speed_source_normalized_to_60"
  | "unsupported_source_fps";

export type SourceFpsTierReason =
  | "average_rate_in_experimental_30_range"
  | "timestamp_and_metadata_prove_experimental_30"
  | "average_rate_in_validated_60_range"
  | "timestamp_and_metadata_prove_nominal_60"
  | "native_source_rate"
  | "source_above_maximum_supported_rate"
  | "source_below_minimum_supported_rate"
  | "insufficient_temporal_evidence";

export interface SourceFpsTierDecision {
  classification: SourceFpsClassification;
  reason: SourceFpsTierReason;
  policyVersion: typeof SOURCE_FPS_TIER_POLICY_VERSION;
  analysisFps: number | null;
}

/**
 * Source-fps bands (Day: variable-frame-rate audit). Purely a metadata/display/
 * eligibility concept — independent of whether the analysis pipeline has a
 * processing profile for that rate yet. Never used to gate acceptance of a file;
 * only "unsupported" (outside the sensor range AVA can even reason about) blocks
 * upload/inspection.
 */
export type FpsBand = "low" | "standard" | "high" | "ultra_high" | "unsupported";

export function classifyFpsBand(fps: number | null | undefined): FpsBand {
  if (typeof fps !== "number" || !Number.isFinite(fps)) return "unsupported";
  if (fps < MIN_SUPPORTED_FPS || fps > MAX_SUPPORTED_FPS) return "unsupported";
  if (fps < 50) return "low";
  if (fps < 100) return "standard";
  if (fps < 200) return "high";
  return "ultra_high";
}

export interface SourceFpsEvidence {
  detectedFps: number | null | undefined;
  averageFps?: number | null;
  nominalFps?: number | null;
  realFps?: number | null;
  timestampFps?: number | null;
  variableFrameRate?: boolean | null;
}

const finitePositive = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * Classify capture rate using the shared production thresholds. Two windows are
 * precise/narrow because a specific subsystem keys off them exactly (fly's
 * experimental-30 zone-timing profile; the validated-60 production identity) —
 * a sub-59 metadata value only reaches the validated-60 class when independent
 * timestamps and a nominal/real rate both corroborate it; one malformed field
 * can never promote true 30 FPS. Every other rate within the supported range
 * (24-300 — 24, 45, 75, 90, 144, 165, ...) gets a general, capability-based
 * `native_source_class` identity instead of being rejected: it keeps its own
 * exact rate, gets full general video/pose analysis, and is never forced into
 * an unrelated standard-camera identity. Metric-level eligibility (e.g.
 * acceleration contact timing needing >= ~59 FPS) is a separate, later gate.
 */
export function classifySourceFpsTier(evidence: SourceFpsEvidence): SourceFpsTierDecision {
  const detected = evidence.averageFps ?? evidence.detectedFps;
  if (!finitePositive(detected)) {
    return { classification: "unsupported_source_fps", reason: "insufficient_temporal_evidence", policyVersion: SOURCE_FPS_TIER_POLICY_VERSION, analysisFps: null };
  }
  if (detected > MAX_SUPPORTED_FPS) {
    return { classification: "unsupported_source_fps", reason: "source_above_maximum_supported_rate", policyVersion: SOURCE_FPS_TIER_POLICY_VERSION, analysisFps: null };
  }
  if (detected < MIN_SUPPORTED_FPS) {
    return { classification: "unsupported_source_fps", reason: "source_below_minimum_supported_rate", policyVersion: SOURCE_FPS_TIER_POLICY_VERSION, analysisFps: null };
  }
  if (detected >= MINIMUM_60_FPS_CLASS && detected <= MAXIMUM_60_FPS_CLASS) {
    return { classification: "validated_60_fps_class", reason: "average_rate_in_validated_60_range", policyVersion: SOURCE_FPS_TIER_POLICY_VERSION, analysisFps: 60 };
  }
  const timestampProves60 =
    finitePositive(evidence.timestampFps) &&
    evidence.timestampFps >= policy.timestampEvidenceMinimumFps &&
    evidence.timestampFps <= policy.timestampEvidenceMaximumFps;
  const rateMetadataSupports60 = [evidence.nominalFps, evidence.realFps].some(
    (value) => finitePositive(value) && value >= MINIMUM_60_FPS_CLASS,
  );
  if (timestampProves60 && rateMetadataSupports60)
    return { classification: "validated_60_fps_class", reason: "timestamp_and_metadata_prove_nominal_60", policyVersion: SOURCE_FPS_TIER_POLICY_VERSION, analysisFps: 60 };
  if (detected >= policy.minimumExperimental30Fps && detected <= policy.maximumExperimental30Fps)
    return { classification: "experimental_30_fps_class", reason: "average_rate_in_experimental_30_range", policyVersion: SOURCE_FPS_TIER_POLICY_VERSION, analysisFps: 30 };
  const timestampProves30 = finitePositive(evidence.timestampFps) && evidence.timestampFps >= policy.timestampExperimentalMinimumFps && evidence.timestampFps <= policy.timestampExperimentalMaximumFps;
  const rateMetadataSupports30 = [evidence.nominalFps, evidence.realFps].some(
    (value) => finitePositive(value) && value >= policy.minimumExperimental30Fps && value <= policy.maximumExperimental30Fps,
  );
  if (timestampProves30 && rateMetadataSupports30)
    return { classification: "experimental_30_fps_class", reason: "timestamp_and_metadata_prove_experimental_30", policyVersion: SOURCE_FPS_TIER_POLICY_VERSION, analysisFps: 30 };
  // General native fallback: 24-29, 30.5-59, or 60.5-300 — a real, supported
  // rate that just isn't one of the two precise named windows. Never forced
  // into 30 or 60; keeps its own exact analysisFps.
  return {
    classification: "native_source_class",
    reason: "native_source_rate",
    policyVersion: SOURCE_FPS_TIER_POLICY_VERSION,
    analysisFps: Math.round(detected * 1000) / 1000,
  };
}

export function classifySourceFps(evidence: SourceFpsEvidence): SourceFpsClassification {
  return classifySourceFpsTier(evidence).classification;
}

/**
 * Camera-friendly rates AVA recognizes for display, including common fractional
 * (NTSC-derived) container rates. Each entry maps a real capture rate to the
 * "camera-friendly" label a coach expects to see (23.976 → 24, 29.97 → 30, ...).
 * Whole-number entries map to themselves. Kept dependency-free (no `@/` imports)
 * so it can compile inside the worker's narrow, alias-free build alongside the
 * rest of this module.
 */
export const STANDARD_FPS: ReadonlyArray<readonly [number, number]> = [
  [23.976, 24], [24, 24],
  [25, 25],
  [29.97, 30], [30, 30],
  [50, 50],
  [100, 100],
  [119.88, 120], [120, 120],
  [200, 200],
  [239.76, 240], [240, 240],
  [300, 300],
];

/** Fractional tolerance used for canonical display-rate snapping (see STANDARD_FPS). */
export const FPS_SNAP_TOLERANCE = 0.025;

/**
 * Normalize a detected frame rate for display. Never changes the exact stored
 * FPS used for timing math — display only. A 120 FPS or 240 FPS source is never
 * collapsed onto 60: STANDARD_FPS treats them as distinct rates from 60/59.94.
 */
export function normalizeFpsDisplay(fps: number | null | undefined): number | null {
  if (typeof fps !== "number" || !Number.isFinite(fps)) return fps ?? null;
  // The 59-61 zone requires corroborated tier evidence (not just a nearby raw
  // number) before it is allowed to display as 60 — a single ambiguous metadata
  // field must never silently promote low-fps content into the validated class.
  if (classifySourceFps({ detectedFps: fps }) === "validated_60_fps_class") return 60;
  let best: number | null = null;
  let bestDiff = Infinity;
  for (const [exact, display] of STANDARD_FPS) {
    if (exact === 60) continue; // the 59-61 zone is handled exclusively above
    const diff = Math.abs(fps - exact);
    if (diff <= FPS_SNAP_TOLERANCE * exact && diff < bestDiff) {
      best = display;
      bestDiff = diff;
    }
  }
  return best ?? fps;
}

/**
 * Source-frame indices to analyze. Validated 60 FPS-class and native high-speed
 * sources default to full rate (every real source frame, no target needed); an
 * explicit lower `analysisFps` still downsamples on request. The source video
 * itself is never touched — this only plans which decoded frames are analyzed.
 */
export function planAnalysisFrameIndices(
  sourceFps: number,
  sourceFrameCount: number,
  analysisFps?: number,
): number[] {
  const classification = classifySourceFps({ detectedFps: sourceFps });
  if (classification === "unsupported_source_fps" || classification === "experimental_30_fps_class")
    throw new Error(UNSUPPORTED_FPS_MESSAGE);
  const cap =
    classification === "native_source_class" || classification === "validated_high_speed_native_class"
      ? MAX_SUPPORTED_FPS
      : VALIDATED_ANALYSIS_FPS;
  const target = analysisFps ?? sourceFps;
  if (!Number.isFinite(target) || target <= 0 || target > cap) {
    throw new Error(`Analysis FPS must be between 1 and ${cap}.`);
  }
  const count = Math.max(0, Math.floor(sourceFrameCount));
  if (Math.abs(target - sourceFps) < 1e-6) {
    return Array.from({ length: count }, (_, index) => index);
  }
  const durationS = count / sourceFps;
  const outputCount = Math.floor(durationS * target);
  const indices: number[] = [];
  for (let i = 0; i < outputCount; i += 1) {
    const sourceIndex = Math.min(count - 1, Math.round((i * sourceFps) / target));
    if (sourceIndex >= 0 && sourceIndex !== indices[indices.length - 1]) indices.push(sourceIndex);
  }
  return indices;
}
