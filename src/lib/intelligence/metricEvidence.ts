/**
 * Metric Evidence Framework (Day 98).
 *
 * Replaces the single, whole-recording `spatialMetricEligibility` gate — which
 * previously suppressed Average/Peak Step Length and Average/Peak Velocity
 * together, as one unit, whenever `recordingMode` classified as anything but
 * `static_precision`/`static_usable` — with an INDEPENDENT evidence contract
 * per metric. A metric is available exactly when its own evidence clears its
 * own bar; one metric's missing evidence never withholds a different metric.
 *
 * Panning-safety boundary (unchanged, load-bearing — read before editing):
 * every recordingMode driven by CAMERA motion (`smooth_pan`, `unstable_pan`,
 * `pan_with_zoom`, `excessive_camera_motion`, `unsupported_recording`) keeps
 * the exact same blanket-withheld behavior every scale-dependent metric had
 * before this file existed — see `CAMERA_MOTION_UNSAFE_MODES` below. This
 * framework only relaxes evaluation for `"athlete_tracking_lost"`, and ONLY
 * when the caller can affirmatively prove the camera itself was confirmed
 * stationary (`calibrationCameraType === "stationary"`, the coach-confirmed
 * value already stored on `calibration_gates.cameraType` — never inferred).
 * A caller that omits `calibrationCameraType`, or a session whose camera type
 * is `"panning"` or unknown, gets the ORIGINAL conservative behavior with no
 * change at all. No camera-motion classifier, threshold, or tracking
 * algorithm was modified to build this file.
 */

import type { SprintMeasurements, MeasurementConfidence } from "@/lib/benchmark/measurements";
import { metricTrustForRecording, type RecordingAssessment, type RecordingMode } from "@/lib/video/recordingMode";
import {
  buildScientificMetricProvenance,
  type ScientificMetricProvenance,
} from "@/lib/intelligence/scientificEvidence";

export type MetricConfidenceCategory = MeasurementConfidence;
export type MetricAvailabilityStatus = "available" | "unavailable";

export type MetricKey =
  | "zoneTimeS"
  | "avgVelocityMps"
  | "topSpeedMps"
  | "avgStrideLengthM"
  | "peakStrideLengthM"
  | "frequencyHz"
  | "groundContactTimeMs"
  | "flightTimeMs"
  | "peakKneeFlexionDeg"
  | "asymmetryPct";

/** Permanent provenance for one metric's reported (or withheld) value. */
export interface MetricProvenance {
  /** Contact-index windows the value was derived from (velocity strides today). */
  sourceWindows: Array<{ startContactIndex: number; endContactIndex: number }> | null;
  /** In-zone contacts available to this metric's computation. */
  contactCount: number | null;
  /** Valid opposite-foot stride intervals / stride-velocity windows used. */
  verifiedStrideCount: number | null;
  calibrationSource: string | null;
  timingSource: "world_anchored" | "screen_fixed_interpolated" | null;
  requiredCrossings: Array<"start" | "finish"> | null;
  crossingsVerified: Array<"start" | "finish"> | null;
  /** Internal-only evidence-quality label — never a numeric score shown raw. */
  evidenceQuality: MetricConfidenceCategory | null;
  /** Phase 7.0 canonical evidence atoms, contract dependencies, frames and
   * exclusions. Existing fields remain for artifact/consumer compatibility. */
  scientific?: ScientificMetricProvenance;
}

export interface MetricEvidence {
  metric: MetricKey;
  label: string;
  status: MetricAvailabilityStatus;
  value: number | null;
  unit: string;
  /** Null exactly when `status === "available"`. */
  reasonCode: string | null;
  /** Internal-only — never displayed as a raw number to a coach. */
  confidenceCategory: MetricConfidenceCategory | null;
  provenance: MetricProvenance;
}

export interface MetricEvidenceOptions {
  /** Coach-confirmed camera type from `calibration_gates.cameraType` — the
   *  ONLY signal that may relax the `athlete_tracking_lost` case. Omit (or
   *  pass `"panning"`/unknown) to keep the fully conservative behavior. */
  calibrationCameraType?: "stationary" | "panning";
  calibrationSource?: string | null;
}

/** Camera-motion-driven modes: blanket-withheld for every scale-dependent
 *  metric, unconditionally — this is the panning-safety boundary and it does
 *  not vary per metric or per calibration signal. */
const CAMERA_MOTION_UNSAFE_MODES = new Set<RecordingMode>([
  "unstable_pan",
  "pan_with_zoom",
  "excessive_camera_motion",
  "unsupported_recording",
  "smooth_pan",
]);

/** Trust-group lookup that tolerates a missing assessment the same way the
 *  original `buildTrustedMetrics` did (treat "no assessment" as no reason to
 *  withhold on this axis) — never a new, looser number. */
function trust(
  group: "geometry" | "cadence",
  assessment: RecordingAssessment | undefined,
): { status: "available" | "withheld"; confidence: number | null; reasonCode: string | null } {
  if (!assessment) return { status: "available", confidence: null, reasonCode: null };
  return metricTrustForRecording(group, assessment, true);
}

/**
 * Whether the whole-recording classification permits a scale-dependent
 * (spatial) metric to be evaluated on its OWN evidence at all. Camera-motion
 * modes always say no (unchanged). `athlete_tracking_lost` says yes only for
 * an explicitly-confirmed stationary camera; everything else defers to
 * whatever `athlete_tracking_lost` would otherwise mean (no) unless the mode
 * is one of the two already-safe stationary modes.
 */
function recordingModePermitsIndependentEvaluation(
  assessment: RecordingAssessment | undefined,
  calibrationCameraType: "stationary" | "panning" | undefined,
): boolean {
  if (!assessment) return true;
  if (CAMERA_MOTION_UNSAFE_MODES.has(assessment.recordingMode)) return false;
  if (assessment.recordingMode === "athlete_tracking_lost") {
    return calibrationCameraType === "stationary";
  }
  return true; // static_precision / static_usable — unchanged, already safe.
}

function velocityConfidence(spreadPct: number | null): MetricConfidenceCategory {
  if (spreadPct == null) return "medium";
  if (spreadPct <= 15) return "high";
  if (spreadPct <= 30) return "medium";
  return "low";
}

function timingConfidence(
  timingStatus: "verified" | "provisionally_verified" | "unavailable",
): MetricConfidenceCategory | null {
  if (timingStatus === "verified") return "high";
  if (timingStatus === "provisionally_verified") return "medium";
  return null;
}

function contactCountConfidence(count: number | null): MetricConfidenceCategory {
  if (count == null) return "low";
  if (count >= 4) return "high";
  if (count >= 2) return "medium";
  return "low";
}

const emptyProvenance = (calibrationSource: string | null): MetricProvenance => ({
  sourceWindows: null,
  contactCount: null,
  verifiedStrideCount: null,
  calibrationSource,
  timingSource: null,
  requiredCrossings: null,
  crossingsVerified: null,
  evidenceQuality: null,
});

/**
 * Evaluate every metric's availability independently. `measurements === null`
 * (not calibrated / no overlay yet) makes every metric unavailable with
 * reason `"not_calibrated"` — this function never fabricates a value.
 */
export function evaluateMetricEvidence(
  measurements: SprintMeasurements | null,
  recordingAssessment: RecordingAssessment | undefined,
  options: MetricEvidenceOptions = {},
): MetricEvidence[] {
  const calibrationSource = options.calibrationSource ?? null;

  if (!measurements || !measurements.calibrated) {
    const reasonCode = "not_calibrated";
    const defs: Array<{ metric: MetricKey; label: string; unit: string }> = [
      { metric: "zoneTimeS", label: "Zone Time", unit: "s" },
      { metric: "avgVelocityMps", label: "Average Velocity", unit: "m/s" },
      { metric: "topSpeedMps", label: "Peak Velocity", unit: "m/s" },
      { metric: "avgStrideLengthM", label: "Average Step Length", unit: "m" },
      { metric: "peakStrideLengthM", label: "Peak Step Length", unit: "m" },
      { metric: "frequencyHz", label: "Step Frequency", unit: "Hz" },
      { metric: "groundContactTimeMs", label: "Ground Contact Time", unit: "ms" },
      { metric: "flightTimeMs", label: "Flight Time", unit: "ms" },
      { metric: "peakKneeFlexionDeg", label: "Peak Knee Flexion", unit: "deg" },
      { metric: "asymmetryPct", label: "Asymmetry", unit: "%" },
    ];
    return defs.map((d) => ({
      ...d,
      status: "unavailable",
      value: null,
      reasonCode,
      confidenceCategory: null,
      provenance: {
        ...emptyProvenance(calibrationSource),
        scientific: buildScientificMetricProvenance(d.metric, null, false, reasonCode, measurements),
      },
    }));
  }

  // Defensive: `SprintMeasurements`'s array/nested fields are typed as
  // required, but plain-JS test fixtures elsewhere in the codebase (and any
  // future caller) may omit ones they don't exercise — never crash on a
  // missing field, just treat it as "no evidence" for whatever it feeds.
  const m = {
    ...measurements,
    individualStepLengthsM: measurements.individualStepLengthsM ?? [],
    strideVelocityWindows: measurements.strideVelocityWindows ?? [],
    diagnostics: measurements.diagnostics ?? null,
    timingProvenance: measurements.timingProvenance ?? {
      verified: false,
      timingAvailabilityReason: "not_calibrated",
      timingStatus: "unavailable" as const,
      crossingDetectionMethod: null,
      startCrossingTimestampS: null,
      finishCrossingTimestampS: null,
      startCrossingExtrapolated: false,
      finishCrossingExtrapolated: false,
    },
  };
  const recordingModeSafe = recordingModePermitsIndependentEvaluation(
    recordingAssessment,
    options.calibrationCameraType,
  );
  const recordingModeReason: string | null = (() => {
    if (recordingModeSafe || !recordingAssessment) return null;
    if (CAMERA_MOTION_UNSAFE_MODES.has(recordingAssessment.recordingMode)) return "camera_motion_unreliable";
    return "athlete_tracking_unreliable";
  })();
  const geometryTrust = trust("geometry", recordingAssessment);
  const cadenceTrust = trust("cadence", recordingAssessment);

  const results: MetricEvidence[] = [];

  // --- Zone Time — unchanged from today: gated purely by verified crossings,
  //     never by recordingMode/camera-motion classification (it always was
  //     independent — this file only makes that explicit and permanent). ---
  {
    const tp = m.timingProvenance;
    const available = tp.verified;
    results.push({
      metric: "zoneTimeS",
      label: "Zone Time",
      status: available ? "available" : "unavailable",
      value: available ? m.zoneTimeS : null,
      unit: "s",
      reasonCode: available ? null : tp.timingAvailabilityReason ?? "timing_unavailable",
      confidenceCategory: available ? timingConfidence(tp.timingStatus) : null,
      provenance: {
        sourceWindows: null,
        contactCount: null,
        verifiedStrideCount: null,
        calibrationSource,
        timingSource: tp.crossingDetectionMethod,
        requiredCrossings: ["start", "finish"],
        crossingsVerified: [
          ...(tp.startCrossingTimestampS != null && !tp.startCrossingExtrapolated ? (["start"] as const) : []),
          ...(tp.finishCrossingTimestampS != null && !tp.finishCrossingExtrapolated ? (["finish"] as const) : []),
        ],
        evidenceQuality: timingConfidence(tp.timingStatus),
      },
    });
  }

  // --- Average Velocity — needs verified Zone Time AND a real zone-distance
  //     scale AND (being a scale-dependent spatial metric) the recordingMode
  //     + geometry-tracking checks. ---
  {
    const tp = m.timingProvenance;
    const timingOk = tp.verified && m.zoneVelocityMps != null;
    const available = timingOk && recordingModeSafe && geometryTrust.status === "available";
    const reasonCode = available
      ? null
      : !timingOk
        ? tp.timingAvailabilityReason ?? "timing_unavailable"
        : !recordingModeSafe
          ? recordingModeReason
          : geometryTrust.reasonCode;
    results.push({
      metric: "avgVelocityMps",
      label: "Average Velocity",
      status: available ? "available" : "unavailable",
      value: available ? m.zoneVelocityMps : null,
      unit: "m/s",
      reasonCode,
      confidenceCategory: available ? timingConfidence(tp.timingStatus) : null,
      provenance: {
        sourceWindows: null,
        contactCount: null,
        verifiedStrideCount: null,
        calibrationSource,
        timingSource: tp.crossingDetectionMethod,
        requiredCrossings: ["start", "finish"],
        crossingsVerified: [
          ...(tp.startCrossingTimestampS != null && !tp.startCrossingExtrapolated ? (["start"] as const) : []),
          ...(tp.finishCrossingTimestampS != null && !tp.finishCrossingExtrapolated ? (["finish"] as const) : []),
        ],
        evidenceQuality: available ? timingConfidence(tp.timingStatus) : null,
      },
    });
  }

  // --- Peak Velocity — independent of zone-crossing timing entirely: needs
  //     >=1 stride-velocity window (>=3 valid contacts two strides apart). ---
  {
    const hasWindows = m.strideVelocityWindows.length >= 1 && m.maxVelocityMps != null;
    const available = hasWindows && recordingModeSafe && geometryTrust.status === "available";
    const confidence = available ? velocityConfidence(m.velocitySpreadPct) : null;
    results.push({
      metric: "topSpeedMps",
      label: "Peak Velocity",
      status: available ? "available" : "unavailable",
      value: available ? m.maxVelocityMps : null,
      unit: "m/s",
      reasonCode: available
        ? null
        : !hasWindows
          ? "insufficient_stride_evidence"
          : !recordingModeSafe
            ? recordingModeReason
            : geometryTrust.reasonCode,
      confidenceCategory: confidence,
      provenance: {
        sourceWindows: m.strideVelocityWindows.map((w) => ({
          startContactIndex: w.startContactIndex,
          endContactIndex: w.endContactIndex,
        })),
        contactCount: m.validContacts,
        verifiedStrideCount: m.strideVelocityWindows.length,
        calibrationSource,
        timingSource: null,
        requiredCrossings: null,
        crossingsVerified: null,
        evidenceQuality: confidence,
      },
    });
  }

  // --- Average / Peak Step Length — share the same evidence shape: >=2
  //     valid opposite-foot step intervals (the same minimum
  //     `computePeakStrideLengthM` already enforces internally). ---
  {
    const validIntervals = m.individualStepLengthsM.length;
    const hasIntervals = validIntervals >= 2;
    const available = hasIntervals && recordingModeSafe && geometryTrust.status === "available";
    const avgValue = m.zoneStepSummary?.summaries.averageStepLengthM ?? m.avgIndividualStepLengthM ?? m.avgZoneStepLengthM;
    const reasonCode = available
      ? null
      : !hasIntervals
        ? "insufficient_step_evidence"
        : !recordingModeSafe
          ? recordingModeReason
          : geometryTrust.reasonCode;
    results.push({
      metric: "avgStrideLengthM",
      label: "Average Step Length",
      status: available && avgValue != null ? "available" : "unavailable",
      value: available ? avgValue : null,
      unit: "m",
      reasonCode: available && avgValue != null ? null : reasonCode ?? "insufficient_step_evidence",
      confidenceCategory: available ? m.stepLengthConfidence : null,
      provenance: {
        sourceWindows: null,
        contactCount: m.validContacts,
        verifiedStrideCount: validIntervals,
        calibrationSource,
        timingSource: null,
        requiredCrossings: null,
        crossingsVerified: null,
        evidenceQuality: available ? m.stepLengthConfidence : null,
      },
    });
    results.push({
      metric: "peakStrideLengthM",
      label: "Peak Step Length",
      status: available && m.peakStrideLengthM != null ? "available" : "unavailable",
      value: available ? m.peakStrideLengthM : null,
      unit: "m",
      reasonCode: available && m.peakStrideLengthM != null ? null : reasonCode ?? "insufficient_step_evidence",
      confidenceCategory: available ? m.stepLengthConfidence : null,
      provenance: {
        sourceWindows: null,
        contactCount: m.validContacts,
        verifiedStrideCount: validIntervals,
        calibrationSource,
        timingSource: null,
        requiredCrossings: null,
        crossingsVerified: null,
        evidenceQuality: available ? m.stepLengthConfidence : null,
      },
    });
  }

  // --- Step Frequency — unchanged gate (cadence trust group), independent
  //     of the spatial/scale metrics above; never was affected by the coarse
  //     gate this file replaces. ---
  {
    const available = m.combinedStepFrequencyHz != null && cadenceTrust.status === "available";
    results.push({
      metric: "frequencyHz",
      label: "Step Frequency",
      status: available ? "available" : "unavailable",
      value: available ? m.combinedStepFrequencyHz : null,
      unit: "Hz",
      reasonCode: available ? null : (cadenceTrust.reasonCode ?? "insufficient_step_evidence"),
      confidenceCategory: available
        ? (cadenceTrust.confidence != null && cadenceTrust.confidence >= 0.85 ? "high" : "medium")
        : null,
      provenance: {
        sourceWindows: null,
        contactCount: m.validContacts,
        verifiedStrideCount: null,
        calibrationSource,
        timingSource: null,
        requiredCrossings: null,
        crossingsVerified: null,
        evidenceQuality: available
          ? (cadenceTrust.confidence != null && cadenceTrust.confidence >= 0.85 ? "high" : "medium")
          : null,
      },
    });
  }

  // --- Ground Contact / Flight Time — computed by the engine already
  //     (Day 97 audit), but not yet exposed in the MVP UI scope; given their
  //     own evidence contract here so the underlying data model is complete,
  //     independent of that separate product-scope decision. ---
  for (const [metric, label, value, contactCount] of [
    ["groundContactTimeMs", "Ground Contact Time", m.groundContactCombinedMs, m.diagnostics?.timing?.leftContacts != null && m.diagnostics?.timing?.rightContacts != null ? m.diagnostics.timing.leftContacts + m.diagnostics.timing.rightContacts : null] as const,
    ["flightTimeMs", "Flight Time", m.flightCombinedMs, m.diagnostics?.timing?.leftContacts != null && m.diagnostics?.timing?.rightContacts != null ? m.diagnostics.timing.leftContacts + m.diagnostics.timing.rightContacts : null] as const,
  ]) {
    const hasValue = value != null;
    const available = hasValue && recordingModeSafe && geometryTrust.status === "available";
    const confidence = available ? contactCountConfidence(contactCount) : null;
    results.push({
      metric,
      label,
      status: available ? "available" : "unavailable",
      value: available ? value : null,
      unit: "ms",
      reasonCode: available
        ? null
        : !hasValue
          ? "insufficient_contact_evidence"
          : !recordingModeSafe
            ? recordingModeReason
            : geometryTrust.reasonCode,
      confidenceCategory: confidence,
      provenance: {
        sourceWindows: null,
        contactCount,
        verifiedStrideCount: null,
        calibrationSource,
        timingSource: null,
        requiredCrossings: null,
        crossingsVerified: null,
        evidenceQuality: confidence,
      },
    });
  }

  // --- Joint Angles / Asymmetry — not computed anywhere in the current live
  //     measurement engine for this session type. Declared honestly as
  //     permanently unavailable rather than silently omitted, so the
  //     contract list is complete; recovering them is new metric computation
  //     work, explicitly out of this task's scope ("the goal is not to
  //     produce more metrics"). ---
  results.push({
    metric: "peakKneeFlexionDeg",
    label: "Peak Knee Flexion",
    status: "unavailable",
    value: null,
    unit: "deg",
    reasonCode: "not_computed_by_current_pipeline",
    confidenceCategory: null,
    provenance: emptyProvenance(calibrationSource),
  });
  results.push({
    metric: "asymmetryPct",
    label: "Asymmetry",
    status: "unavailable",
    value: null,
    unit: "%",
    reasonCode: "not_computed_by_current_pipeline",
    confidenceCategory: null,
    provenance: emptyProvenance(calibrationSource),
  });

  return results.map((result) => ({
    ...result,
    provenance: {
      ...result.provenance,
      scientific: buildScientificMetricProvenance(
        result.metric,
        result.value,
        result.status === "available",
        result.reasonCode,
        measurements,
      ),
    },
  }));
}
