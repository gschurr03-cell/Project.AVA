import policy from "./fpsPolicy.json";

export const VALIDATED_ANALYSIS_FPS = policy.validatedAnalysisFps;
export const EXPERIMENTAL_30_ANALYSIS_FPS = policy.experimental30AnalysisFps;
export const SOURCE_FPS_TIER_POLICY_VERSION = policy.policyVersion;
export const MINIMUM_60_FPS_CLASS = policy.minimumNominal60Fps;
export const MAXIMUM_60_FPS_CLASS = policy.maximumNominal60Fps;
export const UNSUPPORTED_FPS_MESSAGE = policy.unsupportedMessage;

export type SourceFpsClassification =
  | "experimental_30_fps_class"
  | "validated_60_fps_class"
  | "high_speed_source_normalized_to_60"
  | "unsupported_source_fps";

export type SourceFpsTierReason =
  | "average_rate_in_experimental_30_range"
  | "timestamp_and_metadata_prove_experimental_30"
  | "average_rate_in_validated_60_range"
  | "timestamp_and_metadata_prove_nominal_60"
  | "source_above_validated_rate"
  | "insufficient_temporal_evidence";

export interface SourceFpsTierDecision {
  classification: SourceFpsClassification;
  reason: SourceFpsTierReason;
  policyVersion: typeof SOURCE_FPS_TIER_POLICY_VERSION;
  analysisFps: 30 | 60 | null;
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
 * Classify capture rate using the shared production thresholds. A sub-59 metadata
 * value is accepted only when independent timestamps and a nominal/real rate both
 * prove a 60 FPS-class stream; one malformed field can never promote true 30 FPS.
 */
export function classifySourceFpsTier(evidence: SourceFpsEvidence): SourceFpsTierDecision {
  const detected = evidence.averageFps ?? evidence.detectedFps;
  if (finitePositive(detected) && detected > MAXIMUM_60_FPS_CLASS) {
    return { classification: "high_speed_source_normalized_to_60", reason: "source_above_validated_rate", policyVersion: SOURCE_FPS_TIER_POLICY_VERSION, analysisFps: 60 };
  }
  if (
    finitePositive(detected) &&
    detected >= MINIMUM_60_FPS_CLASS &&
    detected <= MAXIMUM_60_FPS_CLASS
  ) {
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
  if (finitePositive(detected) && detected >= policy.minimumExperimental30Fps && detected <= policy.maximumExperimental30Fps)
    return { classification: "experimental_30_fps_class", reason: "average_rate_in_experimental_30_range", policyVersion: SOURCE_FPS_TIER_POLICY_VERSION, analysisFps: 30 };
  const timestampProves30 = finitePositive(evidence.timestampFps) && evidence.timestampFps >= policy.timestampExperimentalMinimumFps && evidence.timestampFps <= policy.timestampExperimentalMaximumFps;
  const rateMetadataSupports30 = [evidence.nominalFps, evidence.realFps].some(
    (value) => finitePositive(value) && value >= policy.minimumExperimental30Fps && value <= policy.maximumExperimental30Fps,
  );
  if (timestampProves30 && rateMetadataSupports30)
    return { classification: "experimental_30_fps_class", reason: "timestamp_and_metadata_prove_experimental_30", policyVersion: SOURCE_FPS_TIER_POLICY_VERSION, analysisFps: 30 };
  return { classification: "unsupported_source_fps", reason: "insufficient_temporal_evidence", policyVersion: SOURCE_FPS_TIER_POLICY_VERSION, analysisFps: null };
}

export function classifySourceFps(evidence: SourceFpsEvidence): SourceFpsClassification {
  return classifySourceFpsTier(evidence).classification;
}

/**
 * Source-frame indices nearest the validated 60 Hz analysis clock.
 * The source remains untouched; this only plans which decoded frames are analyzed.
 */
export function planAnalysisFrameIndices(
  sourceFps: number,
  sourceFrameCount: number,
  analysisFps = VALIDATED_ANALYSIS_FPS,
): number[] {
  const classification = classifySourceFps({ detectedFps: sourceFps });
  if (classification === "unsupported_source_fps" || classification === "experimental_30_fps_class")
    throw new Error(UNSUPPORTED_FPS_MESSAGE);
  if (!Number.isFinite(analysisFps) || analysisFps <= 0 || analysisFps > VALIDATED_ANALYSIS_FPS) {
    throw new Error(`Analysis FPS must be between 1 and ${VALIDATED_ANALYSIS_FPS}.`);
  }
  const count = Math.max(0, Math.floor(sourceFrameCount));
  if (classification === "validated_60_fps_class") {
    return Array.from({ length: count }, (_, index) => index);
  }
  const durationS = count / sourceFps;
  const outputCount = Math.floor(durationS * analysisFps);
  const indices: number[] = [];
  for (let i = 0; i < outputCount; i += 1) {
    const sourceIndex = Math.min(count - 1, Math.round((i * sourceFps) / analysisFps));
    if (sourceIndex >= 0 && sourceIndex !== indices[indices.length - 1]) indices.push(sourceIndex);
  }
  return indices;
}
