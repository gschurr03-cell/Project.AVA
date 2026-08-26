import type { SprintMeasurements } from "@/lib/benchmark/measurements";

export const SCIENTIFIC_EVIDENCE_VERSION = "scientific-evidence-v1" as const;

export const EVIDENCE_QUALITY_CLASSES = {
  direct_verified: { consumer: true, exactTiming: true, spatial: true },
  derived_verified: { consumer: true, exactTiming: true, spatial: true },
  bounded_inferred: { consumer: false, exactTiming: false, spatial: false },
  partial_supported: { consumer: false, exactTiming: false, spatial: false },
  unsupported: { consumer: false, exactTiming: false, spatial: false },
  rejected: { consumer: false, exactTiming: false, spatial: false },
  ambiguous: { consumer: false, exactTiming: false, spatial: false },
} as const;

export type EvidenceQualityClass = keyof typeof EVIDENCE_QUALITY_CLASSES;
export type EvidenceAtomStatus = "accepted" | "missing" | "rejected" | "ambiguous";
export type EvidenceAtomType =
  | "SOURCE_FRAME" | "SOURCE_TIMESTAMP" | "LOCALIZATION_VERIFIED" | "POSE_VALID"
  | "POSE_LOWER_LIMB_VALID" | "CONTACT_ACCEPTED" | "CONTACT_SEQUENCE_VALID"
  | "START_CROSSING_VERIFIED" | "FINISH_CROSSING_VERIFIED" | "CALIBRATION_VALID"
  | "WORLD_TRANSFORM_VALID" | "STEP_INTERVAL_VALID" | "VELOCITY_WINDOW_VALID"
  | "ZONE_DISTANCE_CONFIRMED" | "FPS_TEMPORAL_RESOLUTION_VALID"
  | "CAMERA_MODE_VALID" | "CROP_PROVENANCE_VALID" | "TOUCHDOWN_VALID"
  | "TOE_OFF_VALID" | "CONTACT_DURATION_VALID" | "FLIGHT_INTERVAL_VALID";

export interface EvidenceAtom {
  id: string;
  type: EvidenceAtomType;
  status: EvidenceAtomStatus;
  evidenceClass: EvidenceQualityClass;
  sourceFrameIndex?: number;
  frameRange?: [number, number];
  sourceTimestampMs?: number;
  timeRangeMs?: [number, number];
  provenanceSource: string;
  reason: CanonicalEvidenceReason | null;
  derivation: "direct" | "derived";
  dependencies: string[];
}

export const CANONICAL_EVIDENCE_REASONS = [
  "start_crossing_unavailable", "finish_crossing_unavailable",
  "start_and_finish_crossings_unavailable", "crossing_confidence_below_threshold",
  "crossing_extrapolated_not_verified", "crossing_order_invalid",
  "insufficient_surrounding_continuity", "insufficient_contacts",
  "invalid_contact_sequence", "insufficient_step_intervals", "localization_unverified",
  "pose_unavailable", "lower_limb_evidence_missing", "calibration_unavailable",
  "zone_distance_unconfirmed", "fps_temporal_resolution_insufficient",
  "camera_motion_unverified", "coverage_insufficient", "long_unsupported_gap",
  "identity_uncertain", "unsupported_recording_mode", "timing_unavailable",
  "metric_not_computed", "missing_legacy_provenance",
] as const;
export type CanonicalEvidenceReason = (typeof CANONICAL_EVIDENCE_REASONS)[number];

const LEGACY_REASON_MAP: Readonly<Record<string, CanonicalEvidenceReason>> = {
  not_calibrated: "calibration_unavailable",
  calibration_required: "calibration_unavailable",
  insufficient_step_evidence: "insufficient_step_intervals",
  insufficient_stride_evidence: "insufficient_step_intervals",
  insufficient_contact_evidence: "insufficient_contacts",
  athlete_tracking_unreliable: "localization_unverified",
  athlete_tracking_unavailable: "localization_unverified",
  camera_motion_unreliable: "camera_motion_unverified",
  panning_ground_calibration_unvalidated: "camera_motion_unverified",
  foot_events_unreliable: "lower_limb_evidence_missing",
  not_computed_by_current_pipeline: "metric_not_computed",
};

export function canonicalEvidenceReason(reason: string | null | undefined): CanonicalEvidenceReason | null {
  if (!reason) return null;
  if ((CANONICAL_EVIDENCE_REASONS as readonly string[]).includes(reason)) return reason as CanonicalEvidenceReason;
  return LEGACY_REASON_MAP[reason] ?? "timing_unavailable";
}

export interface MetricEvidenceContract {
  metricId: string;
  required: EvidenceAtomType[];
  optional: EvidenceAtomType[];
  forbiddenClasses: EvidenceQualityClass[];
  minimumEvidenceCount: number;
  allowableInference: EvidenceQualityClass[];
  calculationVersion: string;
}

const contract = (metricId: string, required: EvidenceAtomType[], minimumEvidenceCount: number,
  optional: EvidenceAtomType[] = []): MetricEvidenceContract => ({
  metricId, required, optional,
  forbiddenClasses: ["unsupported", "rejected", "ambiguous"],
  minimumEvidenceCount,
  allowableInference: [],
  calculationVersion: SCIENTIFIC_EVIDENCE_VERSION,
});

export const METRIC_EVIDENCE_CONTRACTS: Readonly<Record<string, MetricEvidenceContract>> = {
  zoneTimeS: contract("zoneTimeS", ["START_CROSSING_VERIFIED", "FINISH_CROSSING_VERIFIED", "SOURCE_TIMESTAMP", "CALIBRATION_VALID"], 2),
  frequencyHz: contract("frequencyHz", ["CONTACT_ACCEPTED", "CONTACT_SEQUENCE_VALID", "SOURCE_TIMESTAMP"], 2),
  avgStrideLengthM: contract("avgStrideLengthM", ["CONTACT_ACCEPTED", "STEP_INTERVAL_VALID", "CALIBRATION_VALID", "WORLD_TRANSFORM_VALID"], 2),
  peakStrideLengthM: contract("peakStrideLengthM", ["CONTACT_ACCEPTED", "STEP_INTERVAL_VALID", "CALIBRATION_VALID", "WORLD_TRANSFORM_VALID"], 2),
  avgVelocityMps: contract("avgVelocityMps", ["ZONE_DISTANCE_CONFIRMED", "START_CROSSING_VERIFIED", "FINISH_CROSSING_VERIFIED", "SOURCE_TIMESTAMP", "CALIBRATION_VALID"], 2),
  topSpeedMps: contract("topSpeedMps", ["VELOCITY_WINDOW_VALID", "CALIBRATION_VALID", "WORLD_TRANSFORM_VALID"], 1),
  groundContactTimeMs: contract("groundContactTimeMs", ["TOUCHDOWN_VALID", "TOE_OFF_VALID", "CONTACT_DURATION_VALID", "SOURCE_TIMESTAMP"], 1),
  flightTimeMs: contract("flightTimeMs", ["TOE_OFF_VALID", "TOUCHDOWN_VALID", "FLIGHT_INTERVAL_VALID", "SOURCE_TIMESTAMP"], 1),
  peakKneeFlexionDeg: contract("peakKneeFlexionDeg", ["POSE_VALID"], 1),
  asymmetryPct: contract("asymmetryPct", ["CONTACT_ACCEPTED", "CONTACT_SEQUENCE_VALID"], 2),
  stepCount: contract("stepCount", ["CONTACT_ACCEPTED"], 1),
  zoneStepCount: contract("zoneStepCount", ["CONTACT_ACCEPTED", "CALIBRATION_VALID"], 1),
};

export interface ScientificMetricProvenance {
  schemaVersion: typeof SCIENTIFIC_EVIDENCE_VERSION;
  metricId: string;
  value: number | null;
  available: boolean;
  reason: CanonicalEvidenceReason | null;
  evidenceClass: EvidenceQualityClass;
  contributingFrames: number[];
  contributingTimeRanges: Array<[number, number]>;
  inputValues: Record<string, number | string | boolean | null>;
  dependencies: string[];
  excludedEvidence: Array<{ frame: number | null; reason: CanonicalEvidenceReason }>;
  calculationVersion: string;
  atoms: EvidenceAtom[];
  legacyProvenanceIncomplete: boolean;
}

const atom = (id: string, type: EvidenceAtomType, status: EvidenceAtomStatus,
  source: string, extra: Partial<EvidenceAtom> = {}): EvidenceAtom => ({
  id, type, status,
  evidenceClass: status === "accepted" ? "direct_verified" : status === "rejected" ? "rejected" : "unsupported",
  provenanceSource: source, reason: status === "accepted" ? null : "missing_legacy_provenance",
  derivation: "direct", dependencies: [], ...extra,
});

export function buildScientificMetricProvenance(
  metricId: string,
  value: number | null,
  available: boolean,
  legacyReason: string | null,
  measurements: SprintMeasurements | null,
): ScientificMetricProvenance {
  const contractDef = METRIC_EVIDENCE_CONTRACTS[metricId] ?? contract(metricId, [], 0);
  const tp = measurements?.timingProvenance;
  const contacts = measurements?.zoneStepSummary?.contacts ?? [];
  const validIntervals = measurements?.zoneStepSummary?.intervals.filter((i) => i.valid) ?? [];
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const frames = new Set<number>();
  const times: Array<[number, number]> = [];
  const atoms: EvidenceAtom[] = [];

  if (contractDef.required.includes("START_CROSSING_VERIFIED")) {
    const ok = !!tp?.verified && tp.startCrossingFrame != null && !tp.startCrossingExtrapolated;
    if (tp?.startCrossingFrame != null) frames.add(tp.startCrossingFrame);
    atoms.push(atom("crossing:start", "START_CROSSING_VERIFIED", ok ? "accepted" : "missing", "timingProvenance", {
      sourceFrameIndex: tp?.startCrossingFrame ?? undefined,
      sourceTimestampMs: tp?.startCrossingTimestampS != null ? tp.startCrossingTimestampS * 1000 : undefined,
      reason: ok ? null : canonicalEvidenceReason(tp?.timingAvailabilityReason) ?? "start_crossing_unavailable",
    }));
  }
  if (contractDef.required.includes("FINISH_CROSSING_VERIFIED")) {
    const ok = !!tp?.verified && tp.finishCrossingFrame != null && !tp.finishCrossingExtrapolated;
    if (tp?.finishCrossingFrame != null) frames.add(tp.finishCrossingFrame);
    atoms.push(atom("crossing:finish", "FINISH_CROSSING_VERIFIED", ok ? "accepted" : "missing", "timingProvenance", {
      sourceFrameIndex: tp?.finishCrossingFrame ?? undefined,
      sourceTimestampMs: tp?.finishCrossingTimestampS != null ? tp.finishCrossingTimestampS * 1000 : undefined,
      reason: ok ? null : canonicalEvidenceReason(tp?.timingAvailabilityReason) ?? "finish_crossing_unavailable",
    }));
  }
  if (tp?.startCrossingTimestampS != null && tp.finishCrossingTimestampS != null) {
    times.push([tp.startCrossingTimestampS * 1000, tp.finishCrossingTimestampS * 1000]);
  }
  if (contractDef.required.includes("CONTACT_ACCEPTED")) {
    for (const c of contacts.filter((candidate) => candidate.countedInZone)) {
      frames.add(c.sourceFrameIndex);
      times.push([c.timeS * 1000, c.timeS * 1000]);
      atoms.push(atom(`contact:${c.id}`, "CONTACT_ACCEPTED", "accepted", "zoneStepSummary", {
        sourceFrameIndex: c.sourceFrameIndex, sourceTimestampMs: c.timeS * 1000,
      }));
    }
  }
  if (contractDef.required.includes("STEP_INTERVAL_VALID")) {
    for (const interval of validIntervals) {
      const from = contactById.get(interval.fromContactId);
      const to = contactById.get(interval.toContactId);
      if (from) frames.add(from.sourceFrameIndex);
      if (to) frames.add(to.sourceFrameIndex);
      if (from && to) times.push([from.timeS * 1000, to.timeS * 1000]);
      atoms.push(atom(`interval:${interval.id}`, "STEP_INTERVAL_VALID", "accepted", "zoneStepSummary", {
        frameRange: from && to ? [from.sourceFrameIndex, to.sourceFrameIndex] : undefined,
        timeRangeMs: from && to ? [from.timeS * 1000, to.timeS * 1000] : undefined,
        derivation: "derived", dependencies: [interval.fromContactId, interval.toContactId],
      }));
    }
  }
  if (contractDef.required.includes("VELOCITY_WINDOW_VALID")) {
    for (const [index, window] of (measurements?.strideVelocityWindows ?? []).entries()) {
      atoms.push(atom(`velocity-window:${index}`, "VELOCITY_WINDOW_VALID", "accepted", "strideVelocityWindows", {
        derivation: "derived", dependencies: [`contact-index:${window.startContactIndex}`, `contact-index:${window.endContactIndex}`],
        timeRangeMs: [0, window.reportedDurationS * 1000],
      }));
    }
  }
  for (const required of contractDef.required) {
    if (atoms.some((candidate) => candidate.type === required)) continue;
    const accepted = required === "CALIBRATION_VALID" ? !!measurements?.calibrated
      : required === "ZONE_DISTANCE_CONFIRMED" ? measurements?.zone?.distanceM != null
      : required === "WORLD_TRANSFORM_VALID" ? !!measurements?.cameraCompensation?.available
      : required === "SOURCE_TIMESTAMP" ? (times.length > 0 || tp?.startCrossingTimestampS != null || measurements?.diagnostics?.firstContactTimeS != null)
      : required === "CONTACT_ACCEPTED" ? (measurements?.validContacts ?? 0) >= contractDef.minimumEvidenceCount
      : required === "STEP_INTERVAL_VALID" ? (measurements?.individualStepLengthsM?.length ?? 0) >= contractDef.minimumEvidenceCount
      : required === "CONTACT_SEQUENCE_VALID" ? (validIntervals.length > 0 || ((measurements?.validContacts ?? 0) >= 2 && measurements?.combinedStepFrequencyHz != null))
      : required === "CONTACT_DURATION_VALID" ? measurements?.groundContactCombinedMs != null
      : required === "FLIGHT_INTERVAL_VALID" ? measurements?.flightCombinedMs != null
      : required === "TOUCHDOWN_VALID" || required === "TOE_OFF_VALID" ? measurements?.diagnostics?.timing != null
      : false;
    atoms.push(atom(`requirement:${required}`, required, accepted ? "accepted" : "missing", "measurement-contract", {
      derivation: "derived", evidenceClass: accepted ? "derived_verified" : "unsupported",
      reason: accepted ? null : canonicalEvidenceReason(legacyReason) ?? "missing_legacy_provenance",
    }));
  }

  const excludedEvidence = (measurements?.diagnostics?.excludedContacts ?? []).map((e) => ({
    frame: e.sourceFrameIndex ?? null,
    reason: (e.reasonCode === "outside_zone" || e.reasonCode === "before_start_crossing"
      ? "coverage_insufficient" : "invalid_contact_sequence") as CanonicalEvidenceReason,
  }));
  const legacyProvenanceIncomplete = !!measurements && !measurements.zoneStepSummary &&
    contractDef.required.some((r) => r === "CONTACT_ACCEPTED" || r === "STEP_INTERVAL_VALID");
  return {
    schemaVersion: SCIENTIFIC_EVIDENCE_VERSION, metricId, value, available,
    reason: available ? null : canonicalEvidenceReason(legacyReason) ?? "timing_unavailable",
    // Missing v1 frame references in a legacy artifact do not invalidate the
    // already-verified calculation; disclose the provenance gap separately.
    evidenceClass: available ? "derived_verified" : "unsupported",
    contributingFrames: [...frames].sort((a, b) => a - b), contributingTimeRanges: times,
    inputValues: {
      calibrated: measurements?.calibrated ?? false,
      zoneDistanceM: measurements?.zone?.distanceM ?? null,
      validContacts: measurements?.validContacts ?? null,
      eligibleIntervals: measurements?.individualStepLengthsM?.length ?? null,
      velocityWindows: measurements?.strideVelocityWindows?.length ?? null,
    },
    dependencies: contractDef.required,
    excludedEvidence, calculationVersion: contractDef.calculationVersion, atoms,
    legacyProvenanceIncomplete,
  };
}

export function validateScientificProvenance(p: ScientificMetricProvenance): string[] {
  const errors: string[] = [];
  if (!p.available && !p.reason) errors.push("unavailable_metric_missing_reason");
  if (p.available && p.atoms.some((a) => a.status === "rejected" && p.dependencies.includes(a.type))) {
    errors.push("rejected_required_evidence");
  }
  if (p.available && p.atoms.some((a) => a.status === "missing" && p.dependencies.includes(a.type))) {
    errors.push("missing_required_evidence");
  }
  if (p.contributingFrames.some((frame) => !Number.isInteger(frame) || frame < 0)) errors.push("invalid_contributing_frame");
  if (p.available && p.evidenceClass === "unsupported") errors.push("consumer_metric_depends_on_unsupported_evidence");
  return errors;
}

export function evidenceDependencyGraph(metricId: string): { id: string; dependsOn: string[] }[] {
  const root = METRIC_EVIDENCE_CONTRACTS[metricId];
  if (!root) return [{ id: metricId, dependsOn: [] }];
  return [{ id: metricId, dependsOn: [...root.required].sort() },
    ...[...root.required].sort().map((id) => ({ id, dependsOn: [] }))];
}

export type ScientificSessionState =
  | "complete" | "partially_available" | "timing_only" | "technique_only" | "unavailable";

export function deriveScientificSessionState(
  metrics: Array<{ metric: string; status: "available" | "unavailable" }>,
): ScientificSessionState {
  const available = new Set(metrics.filter((m) => m.status === "available").map((m) => m.metric));
  const primary = ["zoneTimeS", "avgVelocityMps", "topSpeedMps", "avgStrideLengthM", "peakStrideLengthM", "frequencyHz"];
  if (primary.every((id) => available.has(id))) return "complete";
  const technique = ["avgStrideLengthM", "peakStrideLengthM", "frequencyHz", "groundContactTimeMs", "flightTimeMs"];
  const hasTiming = available.has("zoneTimeS") || available.has("avgVelocityMps");
  const hasTechnique = technique.some((id) => available.has(id));
  if (hasTiming && !hasTechnique) return "timing_only";
  if (!hasTiming && hasTechnique) return "technique_only";
  if (hasTiming || hasTechnique || available.has("topSpeedMps")) return "partially_available";
  return "unavailable";
}
