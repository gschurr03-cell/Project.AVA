import type { ZoneCoverage } from "@/lib/benchmark/measurements";
import type { MetricEvidence } from "@/lib/intelligence/metricEvidence";
import {
  CANONICAL_EVIDENCE_REASONS,
  canonicalEvidenceReason,
  deriveScientificSessionState,
  evidenceDependencyGraph,
  type CanonicalEvidenceReason,
  type ScientificMetricProvenance,
  type ScientificSessionState,
} from "@/lib/intelligence/scientificEvidence";

export const EVIDENCE_EXPLANATION_VERSION = "evidence-explanations-v1" as const;
export type ExplanationAudience = "athlete" | "coach" | "developer";
export type RecordingGuidanceCode =
  | "KEEP_ATHLETE_VISIBLE" | "KEEP_START_GATE_VISIBLE" | "KEEP_FINISH_GATE_VISIBLE"
  | "KEEP_FULL_ZONE_VISIBLE" | "MOVE_CAMERA_CLOSER" | "USE_HIGHER_FPS"
  | "USE_SUPPORTED_CAMERA_MODE" | "CONFIRM_DISTANCE" | "RECALIBRATE_GATE"
  | "KEEP_FEET_IN_FRAME" | "REDUCE_CAMERA_SHAKE" | "NO_ACTION_NEEDED";

export interface EvidenceExplanation {
  version: typeof EVIDENCE_EXPLANATION_VERSION;
  reasonCode: CanonicalEvidenceReason | "unknown_reason" | null;
  metricId: string;
  audience: ExplanationAudience;
  title: string;
  message: string;
  actionable: boolean;
  guidance: RecordingGuidanceCode[];
  actionText: string | null;
  technicalDetail: string | null;
  dependencyPath: string[];
  sourceEvidence: {
    contributingFrames: number[];
    contributingTimeRanges: Array<[number, number]>;
    excludedEvidence: ScientificMetricProvenance["excludedEvidence"];
    calculationVersion: string | null;
  } | null;
}

interface ReasonPolicy {
  athlete: string;
  coach: string;
  developer: string;
  guidance: RecordingGuidanceCode[];
  action: string | null;
}

const policy = (athlete: string, coach: string, developer: string,
  guidance: RecordingGuidanceCode[] = [], action: string | null = null): ReasonPolicy =>
  ({ athlete, coach, developer, guidance, action });

export const EVIDENCE_REASON_POLICIES: Readonly<Record<CanonicalEvidenceReason, ReasonPolicy>> = {
  start_crossing_unavailable: policy(
    "The start crossing could not be verified.",
    "AVA did not have enough verified evidence at the start gate to calculate zone time.",
    "Required START_CROSSING_VERIFIED evidence is absent.",
    ["KEEP_START_GATE_VISIBLE", "KEEP_ATHLETE_VISIBLE"],
    "Keep the athlete and start gate visible as the athlete enters the timed zone.",
  ),
  finish_crossing_unavailable: policy(
    "The finish crossing could not be verified.",
    "AVA did not have enough verified evidence at the finish gate to calculate zone time.",
    "Required FINISH_CROSSING_VERIFIED evidence is absent.",
    ["KEEP_FINISH_GATE_VISIBLE", "KEEP_ATHLETE_VISIBLE"],
    "Keep the athlete and finish gate visible through the end of the timed zone.",
  ),
  start_and_finish_crossings_unavailable: policy(
    "The start and finish crossings could not be verified.",
    "AVA could not verify either timed-zone crossing.",
    "Both START_CROSSING_VERIFIED and FINISH_CROSSING_VERIFIED are absent.",
    ["KEEP_FULL_ZONE_VISIBLE", "KEEP_ATHLETE_VISIBLE"],
    "Keep the athlete and both gates visible throughout the timed zone.",
  ),
  crossing_confidence_below_threshold: policy(
    "A gate crossing could not be verified clearly enough.",
    "A crossing was detected, but its existing verification requirements were not met.",
    "Crossing evidence was rejected by the existing crossing-verification policy.",
  ),
  crossing_extrapolated_not_verified: policy(
    "A gate crossing was estimated but not directly verified.",
    "The nearest crossing estimate relied on extrapolation, so AVA withheld exact timing.",
    "Crossing candidate is extrapolated; exact-timing contracts forbid it.",
  ),
  crossing_order_invalid: policy(
    "The gate crossings could not be confirmed in the expected order.",
    "AVA found crossing evidence that did not form a valid start-to-finish sequence.",
    "Crossing order violates the timing contract.",
  ),
  insufficient_surrounding_continuity: policy(
    "There was not enough continuous video evidence around a gate crossing.",
    "A crossing was found, but continuous athlete evidence around it was insufficient for verified timing.",
    "The crossing lacks the required consecutive-frame continuity.",
    ["KEEP_ATHLETE_VISIBLE"],
    "Keep the athlete continuously visible before and after each gate crossing.",
  ),
  insufficient_contacts: policy(
    "Not enough ground contacts were verified for this metric.",
    "AVA could not verify enough athlete-specific ground contacts for this calculation.",
    "The metric contract's CONTACT_ACCEPTED minimum was not met.",
    ["KEEP_FEET_IN_FRAME", "MOVE_CAMERA_CLOSER"],
    "Keep both feet visible and large enough to distinguish throughout the measurement zone.",
  ),
  invalid_contact_sequence: policy(
    "The verified contacts did not form a usable sequence.",
    "The available contacts did not form the valid sequence required by this metric.",
    "CONTACT_SEQUENCE_VALID was not satisfied; unsupported gaps are not bridged.",
  ),
  insufficient_step_intervals: policy(
    "Not enough verified step intervals were available.",
    "AVA did not have enough eligible opposite-foot step intervals for this calculation.",
    "The STEP_INTERVAL_VALID minimum was not met.",
    ["KEEP_FEET_IN_FRAME", "MOVE_CAMERA_CLOSER"],
    "Keep both feet visible across more consecutive steps in the measurement zone.",
  ),
  localization_unverified: policy(
    "AVA could not verify the athlete through the required part of the run.",
    "Athlete localization was not verified across the evidence required by this metric.",
    "Required localization provenance is unavailable or rejected.",
    ["KEEP_ATHLETE_VISIBLE"],
    "Keep the athlete clearly separated from the background and visible through the full zone.",
  ),
  pose_unavailable: policy(
    "Body-position evidence was unavailable for the required part of the run.",
    "AVA could not verify the pose evidence required by this metric.",
    "Required POSE_VALID atoms are absent.",
  ),
  lower_limb_evidence_missing: policy(
    "Leg and foot evidence was unavailable for the required steps.",
    "AVA could not verify enough lower-limb landmarks for this metric.",
    "Required POSE_LOWER_LIMB_VALID evidence is absent.",
    ["KEEP_FEET_IN_FRAME", "MOVE_CAMERA_CLOSER"],
    "Keep both feet in frame and record close enough for the legs and feet to remain visible.",
  ),
  calibration_unavailable: policy(
    "The measurement zone has not been calibrated.",
    "A confirmed distance and gate calibration are required for this metric.",
    "Required CALIBRATION_VALID evidence is absent.",
    ["CONFIRM_DISTANCE", "RECALIBRATE_GATE"],
    "Confirm both gates and the known distance in the Timing Workspace.",
  ),
  zone_distance_unconfirmed: policy(
    "The measurement-zone distance has not been confirmed.",
    "AVA needs a confirmed zone distance before reporting this metric.",
    "Required ZONE_DISTANCE_CONFIRMED evidence is absent.",
    ["CONFIRM_DISTANCE"],
    "Confirm the measured distance between the start and finish gates.",
  ),
  fps_temporal_resolution_insufficient: policy(
    "The video frame rate is too low for this timing measurement.",
    "The source video does not provide enough temporal resolution for this metric.",
    "FPS_TEMPORAL_RESOLUTION_VALID was not satisfied.",
    ["USE_HIGHER_FPS"],
    "Use a higher frame-rate recording for precise contact timing.",
  ),
  camera_motion_unverified: policy(
    "Camera movement could not be verified safely for this measurement.",
    "AVA could not verify the camera-motion evidence required for this spatial metric.",
    "CAMERA_MODE_VALID or WORLD_TRANSFORM_VALID is absent/rejected.",
    ["REDUCE_CAMERA_SHAKE"],
    "Use a stable camera position and avoid unplanned camera movement.",
  ),
  coverage_insufficient: policy(
    "Only part of the measurement zone had usable evidence.",
    "The verified evidence did not cover enough of the zone for this metric.",
    "The metric's zone-coverage requirement was not met.",
    ["KEEP_FULL_ZONE_VISIBLE"],
    "Keep the complete measurement zone and athlete visible throughout the run.",
  ),
  long_unsupported_gap: policy(
    "A long part of the run did not have usable evidence.",
    "A long unsupported gap prevents AVA from joining the surrounding evidence.",
    "An unsupported gap exceeds the contract's permitted continuity boundary.",
    ["KEEP_ATHLETE_VISIBLE"],
    "Keep the athlete continuously visible through the measurement zone.",
  ),
  identity_uncertain: policy(
    "AVA could not confirm the same athlete through the required section.",
    "Athlete identity was uncertain, so AVA did not use that section as evidence.",
    "Identity provenance is ambiguous or rejected.",
  ),
  unsupported_recording_mode: policy(
    "This recording setup is not supported for this metric.",
    "The recording mode does not meet the current scientific contract for this metric.",
    "The recording mode is outside the supported metric-eligibility policy.",
    ["USE_SUPPORTED_CAMERA_MODE"],
    "Use a supported stationary camera setup for this analysis.",
  ),
  timing_unavailable: policy(
    "Verified timing was unavailable for this run.",
    "AVA could not verify the timing evidence required by this metric.",
    "A required timing dependency is unavailable.",
  ),
  metric_not_computed: policy(
    "This metric is not available for this analysis type.",
    "The current analysis pipeline does not calculate this metric.",
    "No calculation product exists for this metric in the current pipeline.",
    ["NO_ACTION_NEEDED"],
  ),
  missing_legacy_provenance: policy(
    "Detailed evidence references are unavailable for this earlier analysis.",
    "The result remains readable, but this earlier artifact does not contain the newer detailed provenance.",
    "The legacy artifact predates scientific-evidence-v1 fields.",
    ["NO_ACTION_NEEDED"],
  ),
};

export const RECORDING_GUIDANCE_TEXT: Readonly<Record<RecordingGuidanceCode, string>> = {
  KEEP_ATHLETE_VISIBLE: "Keep the athlete visible through the required part of the run.",
  KEEP_START_GATE_VISIBLE: "Keep the start gate visible as the athlete enters the timed zone.",
  KEEP_FINISH_GATE_VISIBLE: "Keep the finish gate visible through the end of the timed zone.",
  KEEP_FULL_ZONE_VISIBLE: "Keep the complete measurement zone visible.",
  MOVE_CAMERA_CLOSER: "Record close enough for the athlete's legs and feet to remain clear.",
  USE_HIGHER_FPS: "Use a higher frame-rate recording for precise timing.",
  USE_SUPPORTED_CAMERA_MODE: "Use a supported stationary camera setup.",
  CONFIRM_DISTANCE: "Confirm the known distance between the gates.",
  RECALIBRATE_GATE: "Reconfirm both gate positions in the Timing Workspace.",
  KEEP_FEET_IN_FRAME: "Keep both feet in frame throughout the measured steps.",
  REDUCE_CAMERA_SHAKE: "Stabilize the camera and avoid unplanned movement.",
  NO_ACTION_NEEDED: "No recording change is required for this limitation.",
};

const METRIC_LABELS: Readonly<Record<string, string>> = {
  zoneTimeS: "Zone Time", avgVelocityMps: "Average Velocity", topSpeedMps: "Peak Velocity",
  avgStrideLengthM: "Average Step Length", peakStrideLengthM: "Peak Step Length",
  frequencyHz: "Step Frequency", groundContactTimeMs: "Ground Contact Time",
  flightTimeMs: "Flight Time", peakKneeFlexionDeg: "Peak Knee Flexion", asymmetryPct: "Asymmetry",
};

function safePolicy(reason: CanonicalEvidenceReason | null): ReasonPolicy {
  return reason ? EVIDENCE_REASON_POLICIES[reason] : policy(
    "AVA could not verify the evidence required for this metric.",
    "The required evidence was unavailable, but the artifact does not provide a more specific reason.",
    "Unknown or missing reason code; fail-safe explanation used.",
  );
}

function downstreamMessage(metricId: string, reason: CanonicalEvidenceReason | null, audience: ExplanationAudience): string | null {
  if (metricId !== "avgVelocityMps") return null;
  const timingReasons: Array<CanonicalEvidenceReason | null> = [
    "start_crossing_unavailable", "finish_crossing_unavailable", "start_and_finish_crossings_unavailable",
    "crossing_confidence_below_threshold", "crossing_extrapolated_not_verified", "crossing_order_invalid",
    "insufficient_surrounding_continuity", "timing_unavailable",
  ];
  if (!timingReasons.includes(reason)) return null;
  if (audience === "athlete") return "Average Velocity is unavailable because verified Zone Time is unavailable.";
  if (audience === "coach") return "Average Velocity depends on verified Zone Time; the underlying crossing evidence did not meet that timing contract.";
  return "Downstream dependency failure: avgVelocityMps → Zone Time → verified gate crossings.";
}

function availableMessage(evidence: MetricEvidence, audience: ExplanationAudience): string {
  const p = evidence.provenance.scientific;
  const contacts = Number(p?.inputValues.validContacts ?? evidence.provenance.contactCount ?? 0);
  const intervals = Number(p?.inputValues.eligibleIntervals ?? evidence.provenance.verifiedStrideCount ?? 0);
  const windows = Number(p?.inputValues.velocityWindows ?? evidence.provenance.verifiedStrideCount ?? 0);
  if (evidence.metric === "frequencyHz") return `Calculated from ${contacts} verified ground contacts using source video timestamps.`;
  if (evidence.metric === "avgStrideLengthM") return `Calculated from ${intervals} eligible step intervals inside the calibrated measurement zone.`;
  if (evidence.metric === "peakStrideLengthM") return `Calculated from the current rolling step-length contract across ${intervals} eligible intervals.`;
  if (evidence.metric === "zoneTimeS") return "Calculated from verified start and finish crossings using source video timestamps.";
  if (evidence.metric === "avgVelocityMps") return "Calculated from the confirmed zone distance and verified Zone Time.";
  if (evidence.metric === "topSpeedMps") return `Calculated from ${windows} verified stride-velocity ${windows === 1 ? "window" : "windows"}.`;
  return audience === "developer" ? "The metric's required evidence contract is satisfied." : "AVA verified the evidence required for this metric.";
}

export function explainMetricEvidence(evidence: MetricEvidence, audience: ExplanationAudience): EvidenceExplanation {
  const scientific = evidence.provenance.scientific;
  // Runtime artifacts can predate or violate the current TypeScript union;
  // canonicalize both the additive and legacy fields before policy lookup.
  const canonical = canonicalEvidenceReason(scientific?.reason ?? evidence.reasonCode);
  const known = canonical != null;
  const reason = known ? canonical : evidence.status === "available" ? null : "unknown_reason";
  const selected = safePolicy(canonical);
  const label = METRIC_LABELS[evidence.metric] ?? evidence.label;
  const downstream = downstreamMessage(evidence.metric, canonical, audience);
  const message = evidence.status === "available"
    ? availableMessage(evidence, audience)
    : downstream ?? selected[audience];
  return {
    version: EVIDENCE_EXPLANATION_VERSION, reasonCode: reason, metricId: evidence.metric, audience,
    title: evidence.status === "available" ? `${label} evidence` : `${label} unavailable`,
    message, actionable: evidence.status === "unavailable" && selected.guidance.some((g) => g !== "NO_ACTION_NEEDED"),
    guidance: evidence.status === "unavailable" ? [...selected.guidance] : [],
    actionText: evidence.status === "unavailable" ? selected.action : null,
    technicalDetail: audience === "developer"
      ? (evidence.status === "available" ? "All required evidence in the metric contract is satisfied." : selected.developer)
      : null,
    dependencyPath: audience === "athlete" ? [] : evidenceDependencyGraph(evidence.metric)[0]?.dependsOn ?? [],
    sourceEvidence: audience === "developer" && scientific ? {
      contributingFrames: scientific.contributingFrames,
      contributingTimeRanges: scientific.contributingTimeRanges,
      excludedEvidence: scientific.excludedEvidence,
      calculationVersion: scientific.calculationVersion,
    } : null,
  };
}

export interface RootCauseExplanation {
  reasonCode: CanonicalEvidenceReason | "unknown_reason";
  affectedMetrics: string[];
  message: string;
  guidance: RecordingGuidanceCode[];
  actionText: string | null;
}

export function consolidateRootCauses(evidence: MetricEvidence[], audience: ExplanationAudience): RootCauseExplanation[] {
  const grouped = new Map<CanonicalEvidenceReason | "unknown_reason", MetricEvidence[]>();
  for (const item of evidence.filter((candidate) => candidate.status === "unavailable")) {
    const reason = canonicalEvidenceReason(item.provenance.scientific?.reason ?? item.reasonCode) ?? "unknown_reason";
    grouped.set(reason, [...(grouped.get(reason) ?? []), item]);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([reason, items]) => {
    const selected = reason === "unknown_reason" ? safePolicy(null) : EVIDENCE_REASON_POLICIES[reason];
    return { reasonCode: reason, affectedMetrics: items.map((item) => item.metric).sort(),
      message: selected[audience], guidance: [...selected.guidance], actionText: selected.action };
  });
}

export interface SessionEvidenceSummary {
  state: ScientificSessionState;
  title: string;
  message: string;
  rootCauses: RootCauseExplanation[];
}

const SESSION_COPY: Readonly<Record<ScientificSessionState, { title: string; message: string }>> = {
  complete: { title: "Full analysis available", message: "AVA verified timing, cadence, and step-length evidence for this run." },
  partially_available: { title: "Partial analysis", message: "Some metrics are available, but AVA could not verify all required evidence." },
  timing_only: { title: "Timing available", message: "Timing was verified, but step evidence was incomplete." },
  technique_only: { title: "Technique evidence available", message: "Step or pose evidence is available, but timing or distance evidence was not verified." },
  unavailable: { title: "Analysis unavailable", message: "AVA could not verify enough evidence for a reliable sprint analysis." },
};

export function buildSessionEvidenceSummary(evidence: MetricEvidence[], audience: ExplanationAudience): SessionEvidenceSummary {
  const state = deriveScientificSessionState(evidence);
  const sessionMetrics = new Set(["zoneTimeS", "avgVelocityMps", "topSpeedMps", "avgStrideLengthM", "peakStrideLengthM", "frequencyHz"]);
  return { state, ...SESSION_COPY[state], rootCauses: consolidateRootCauses(evidence.filter((item) => sessionMetrics.has(item.metric)), audience) };
}

export function explainZoneCoverage(coverage: ZoneCoverage | null, audience: ExplanationAudience): string | null {
  if (!coverage || coverage.measuredZoneFraction == null || coverage.measuredZoneFraction >= .95) return null;
  const early = !!coverage.missingEarlyZoneReason;
  const late = !!coverage.missingLateZoneReason;
  const region = early && late ? "the middle portion" : early ? "the middle and finish portions" : late ? "the opening and middle portions" : "the verified portion";
  if (audience === "developer") {
    return `Step evidence covers ${(coverage.measuredZoneFraction * 100).toFixed(1)}% of the zone (${coverage.firstMeasuredPositionM ?? "?"}m–${coverage.lastMeasuredPositionM ?? "?"}m).`;
  }
  return `AVA measured ${region} of this run. Step metrics are based only on the verified portion.`;
}

export function assertCompleteReasonPolicy(): boolean {
  return CANONICAL_EVIDENCE_REASONS.every((reason) => !!EVIDENCE_REASON_POLICIES[reason]);
}
