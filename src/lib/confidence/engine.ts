import {
  MEASUREMENT_CONFIDENCE_VERSION,
  type ConfidenceEvidence,
  type ConfidenceMetricFamily,
  type ConfidenceMetricId,
  type ConfidentMetric,
  type MeasurementConfidence,
  type MetricQualityFlag,
} from "./types";

type FactorKey = Exclude<keyof ConfidenceEvidence, "fps">;
type Profile = { family: ConfidenceMetricFamily; factors: Partial<Record<FactorKey, number>> };

const PROFILES: Record<ConfidenceMetricId, Profile> = {
  velocity: { family: "spatial", factors: { trackingContinuity: 18, cameraMotionStability: 14, calibrationCertainty: 25, frameTimingStability: 13, algorithmAgreement: 15, sampleSufficiency: 15 } },
  peak_velocity: { family: "spatial", factors: { trackingContinuity: 18, cameraMotionStability: 15, calibrationCertainty: 22, frameTimingStability: 12, algorithmAgreement: 18, sampleSufficiency: 15 } },
  average_velocity: { family: "spatial", factors: { trackingContinuity: 15, cameraMotionStability: 12, calibrationCertainty: 26, frameTimingStability: 17, algorithmAgreement: 15, sampleSufficiency: 15 } },
  contact_time: { family: "timing", factors: { frameTimingStability: 24, eventDetectionConfidence: 25, poseVisibility: 15, occlusionFraction: 12, trackingContinuity: 12, sampleSufficiency: 12 } },
  flight_time: { family: "timing", factors: { frameTimingStability: 24, eventDetectionConfidence: 25, poseVisibility: 15, occlusionFraction: 12, trackingContinuity: 12, sampleSufficiency: 12 } },
  stride_length: { family: "spatial", factors: { calibrationCertainty: 24, trackingContinuity: 19, cameraMotionStability: 14, eventDetectionConfidence: 16, interpolationFraction: 10, sampleSufficiency: 17 } },
  cadence: { family: "event", factors: { eventDetectionConfidence: 25, trackingContinuity: 20, frameTimingStability: 15, occlusionFraction: 15, sampleSufficiency: 25 } },
  step_frequency: { family: "event", factors: { eventDetectionConfidence: 25, trackingContinuity: 20, frameTimingStability: 15, occlusionFraction: 15, sampleSufficiency: 25 } },
  asymmetry: { family: "derived", factors: { eventDetectionConfidence: 20, trackingContinuity: 18, poseVisibility: 16, occlusionFraction: 14, sampleSufficiency: 22, algorithmAgreement: 10 } },
  acceleration: { family: "derived", factors: { calibrationCertainty: 20, eventDetectionConfidence: 22, frameTimingStability: 18, trackingContinuity: 16, cameraMotionStability: 12, sampleSufficiency: 12 } },
  timing_gate: { family: "timing", factors: { calibrationCertainty: 28, frameTimingStability: 25, trackingContinuity: 17, eventDetectionConfidence: 20, cameraMotionStability: 10 } },
  knee_flexion: { family: "pose", factors: { poseVisibility: 25, skeletonConfidence: 25, trackingContinuity: 18, occlusionFraction: 17, interpolationFraction: 15 } },
  trunk_lean: { family: "pose", factors: { poseVisibility: 25, skeletonConfidence: 25, trackingContinuity: 18, occlusionFraction: 17, interpolationFraction: 15 } },
  sprint_intelligence: { family: "intelligence", factors: { trackingContinuity: 15, calibrationCertainty: 18, poseVisibility: 12, eventDetectionConfidence: 15, algorithmAgreement: 20, sampleSufficiency: 20 } },
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const observed = (value: number | null | undefined, fallback = 0.6) =>
  value == null || !Number.isFinite(value) ? fallback : clamp01(value);
const positive = (key: FactorKey, value: number) =>
  key === "missingPoseFraction" || key === "interpolationFraction" || key === "occlusionFraction"
    ? 1 - value
    : value;

function warning(
  code: string,
  label: string,
  why: string,
  affectedMetrics: string[],
  improvement: string,
  severity: MetricQualityFlag["severity"] = "warning",
): MetricQualityFlag {
  return { code, label, why, affectedMetrics, improvement, severity };
}

function flagsFor(metricId: ConfidenceMetricId, e: ConfidenceEvidence): MetricQualityFlag[] {
  const flags: MetricQualityFlag[] = [];
  if (e.athleteFillFraction != null && e.athleteFillFraction < 0.08)
    flags.push(warning("athlete_too_small", "Camera too far away", "The athlete occupies too little of the frame for stable keypoints.", ["pose", "stride length", "contact time", "flight time"], "Move the camera closer or use optical framing without digital zoom."));
  if (e.fps != null && e.fps < 59)
    flags.push(warning("low_frame_rate", "Low frame rate", "Frame spacing limits event and gate timing precision.", ["timing gates", "velocity", "contact time", "flight time", "cadence"], "Record at 60 fps minimum; use 120–240 fps for contact and flight timing.", e.fps < 30 ? "critical" : "warning"));
  if (e.occlusionFraction != null && e.occlusionFraction > 0.15)
    flags.push(warning("heavy_occlusion", "Heavy occlusion", "Important joints are hidden in a substantial part of the clip.", ["pose angles", "step events", "asymmetry"], "Use a clear side view and keep feet and torso unobstructed."));
  if (e.calibrationCertainty != null && e.calibrationCertainty < 0.7)
    flags.push(warning("poor_calibration", "Poor calibration", "The real-world distance or gate placement is uncertain.", ["velocity", "stride length", "acceleration", "timing gates"], "Place both gates on fixed ground references and confirm the measured distance."));
  if (e.trackingContinuity != null && e.trackingContinuity < 0.7)
    flags.push(warning("athlete_left_frame", "Athlete left frame", "Tracking is discontinuous, so events or motion may be missing.", ["all tracked metrics"], "Keep the athlete fully visible before, through, and after the timing zone."));
  if (e.interpolationFraction != null && e.interpolationFraction > 0.15)
    flags.push(warning("large_interpolation", "Large interpolation", "Too much of the trajectory was reconstructed between detections.", ["velocity", "stride length", "pose angles"], "Improve lighting, framing, and contrast so detections remain continuous."));
  return flags.filter((flag) =>
    flag.affectedMetrics.some((affected) =>
      affected === "all tracked metrics" ||
      affected.includes(metricId.replaceAll("_", " ")) ||
      metricId.includes(affected.replaceAll(" ", "_")),
    ) || flag.code === "low_frame_rate",
  );
}

const reasonFor = (key: FactorKey, score: number): string => {
  const label: Record<FactorKey, string> = {
    trackingContinuity: "tracking continuity",
    missingPoseFraction: "usable pose frames",
    interpolationFraction: "minimal interpolation",
    cameraMotionStability: "camera stability",
    calibrationCertainty: "calibration certainty",
    frameTimingStability: "frame timing stability",
    occlusionFraction: "athlete visibility",
    roiStability: "athlete ROI stability",
    poseVisibility: "pose visibility",
    skeletonConfidence: "skeleton confidence",
    eventDetectionConfidence: "event detection certainty",
    sampleSufficiency: "sample sufficiency",
    algorithmAgreement: "agreement between calculation methods",
    athleteFillFraction: "athlete framing",
  };
  return `${score >= 0.85 ? "Excellent" : score >= 0.7 ? "Stable" : score >= 0.5 ? "Moderate" : "Reduced"} ${label[key]}`;
};

export function calculateMetricConfidence(
  metricId: ConfidenceMetricId,
  evidence: ConfidenceEvidence,
): MeasurementConfidence {
  const profile = PROFILES[metricId];
  const factors = Object.entries(profile.factors).map(([rawKey, weight]) => {
    const key = rawKey as FactorKey;
    const raw = evidence[key];
    const normalized = positive(key, observed(raw));
    return {
      key,
      observed: raw == null ? null : raw,
      normalized,
      weight: weight as number,
      contribution: normalized * (weight as number),
      reason: reasonFor(key, normalized),
    };
  });
  const weight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  const score = Math.max(0, Math.min(100, Math.round(factors.reduce((sum, factor) => sum + factor.contribution, 0) / weight * 100)));
  const confidenceReason = [...factors]
    .sort((a, b) => b.contribution - a.contribution || a.key.localeCompare(b.key))
    .slice(0, 4)
    .map((factor) => factor.reason);
  return {
    score,
    level: score >= 85 ? "high" : score >= 65 ? "medium" : "low",
    confidenceReason,
    qualityFlags: flagsFor(metricId, evidence),
    measurementVersion: MEASUREMENT_CONFIDENCE_VERSION,
    factors,
  };
}

export function withConfidence<T extends number | null>(
  metricId: ConfidenceMetricId,
  value: T,
  evidence: ConfidenceEvidence,
): ConfidentMetric<T> {
  const confidence = calculateMetricConfidence(metricId, evidence);
  return {
    value,
    confidence,
    confidenceReason: confidence.confidenceReason,
    qualityFlags: confidence.qualityFlags,
    measurementVersion: confidence.measurementVersion,
  };
}

