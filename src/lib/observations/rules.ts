import type {
  CompletedAnalysisObservationInput,
  ObservationCategory,
  ObservationConfidence,
  ObservationEvidence,
  ObservationLimitation,
  ObservationSeverity,
  ObservationSide,
  ObservationStatus,
} from "./types";

export interface ObservationRuleOutput {
  title: string;
  summary: string;
  status: ObservationStatus;
  confidence: ObservationConfidence;
  severity: ObservationSeverity;
  evidence: ObservationEvidence[];
  limitations: ObservationLimitation[];
  phase: string | null;
  side: ObservationSide;
  availability: ObservationEvidence["availability"];
  experimental: boolean;
  dedupeKey: string;
  conflictKey: string | null;
}

export interface ObservationRule {
  ruleId: string;
  category: ObservationCategory;
  requiredMetrics: string[];
  enabled: boolean;
  version: string;
  evaluate(input: CompletedAnalysisObservationInput): ObservationRuleOutput | null;
}

const metric = (input: CompletedAnalysisObservationInput, key: string) =>
  input.metrics.find((item) => item.key === key);
const limitation = (code: string, message: string, source: string): ObservationLimitation => ({
  code,
  message,
  source,
});
const evidenceFromMetric = (
  item: NonNullable<ReturnType<typeof metric>>,
): ObservationEvidence => ({
  metric: item.key,
  value: item.value,
  unit: item.unit,
  confidence: item.confidence,
  source: item.source,
  availability: item.availability,
  frameRange: item.frameRange,
  phase: item.phase,
  directness: item.directness,
});
const metricLimitations = (
  item: NonNullable<ReturnType<typeof metric>>,
): ObservationLimitation[] => [
  ...(item.confidence === "Low"
    ? [limitation("metric_confidence_limited", "Metric confidence is limited.", item.source)]
    : []),
  ...(item.warning
    ? [limitation("metric_warning", item.warning, item.source)]
    : []),
  ...(item.reasonCode
    ? [limitation(item.reasonCode, "The metric source reported a limitation.", item.source)]
    : []),
];
const statusFor = (
  experimental: boolean,
  confidence: ObservationConfidence,
  availability: ObservationEvidence["availability"],
): ObservationStatus =>
  experimental
    ? "experimental"
    : availability !== "available"
      ? "unavailable"
      : confidence === "Low" || confidence === "Unavailable"
        ? "limited"
        : "supported";

const recordingEvidence = (
  input: CompletedAnalysisObservationInput,
  metricName: string,
  value: string | number | boolean | null,
  confidence: ObservationConfidence,
  source: string,
): ObservationEvidence => ({
  metric: metricName,
  value,
  unit: metricName.includes("fps") ? "fps" : "",
  confidence,
  source,
  availability: "available",
  frameRange: null,
  phase: null,
  directness: "context",
});

export const OBSERVATION_RULES: ObservationRule[] = [
  {
    ruleId: "recording.experimental_fps.v1",
    category: "Recording",
    requiredMetrics: [],
    enabled: true,
    version: "1",
    evaluate: (input) =>
      input.experimental
        ? {
            title: "Experimental frame-rate analysis",
            summary: `This analysis used the experimental ${input.analysisFps ?? "unknown"} FPS pipeline.`,
            status: "experimental",
            confidence: "Unavailable",
            severity: "Informational",
            evidence: [
              recordingEvidence(
                input,
                "analysis_fps",
                input.analysisFps,
                "Unavailable",
                "analysis.provenance",
              ),
            ],
            limitations: [
              limitation(
                "experimental_frame_rate",
                "The frame-rate pipeline is experimental and is not equivalent to validated 60 FPS analysis.",
                "analysis.provenance",
              ),
            ],
            phase: null,
            side: null,
            availability: "available",
            experimental: true,
            dedupeKey: "recording:experimental_fps",
            conflictKey: "recording:fps_validation",
          }
        : null,
  },
  {
    ruleId: "recording.high_quality.v1",
    category: "DataQuality",
    requiredMetrics: [],
    enabled: true,
    version: "1",
    evaluate: (input) =>
      input.recordingQuality?.rating === "excellent"
        ? {
            title: "High recording quality",
            summary: `The existing recording-quality engine rated this recording excellent (${input.recordingQuality.score}/100).`,
            status: statusFor(false, input.recordingQuality.confidence, "available"),
            confidence: input.recordingQuality.confidence,
            severity: "Informational",
            evidence: [
              recordingEvidence(
                input,
                "recording_quality_score",
                input.recordingQuality.score,
                input.recordingQuality.confidence,
                input.recordingQuality.source,
              ),
            ],
            limitations: input.limitations,
            phase: null,
            side: null,
            availability: "available",
            experimental: false,
            dedupeKey: "recording:quality",
            conflictKey: null,
          }
        : null,
  },
  {
    ruleId: "calibration.missing.v1",
    category: "Calibration",
    requiredMetrics: [],
    enabled: true,
    version: "1",
    evaluate: (input) =>
      !input.calibrationAvailable
        ? {
            title: "Calibration unavailable",
            summary: "A real-world distance calibration was not available for this analysis.",
            status: "unavailable",
            confidence: "Unavailable",
            severity: "Informational",
            evidence: [
              recordingEvidence(
                input,
                "calibration_available",
                false,
                "Unavailable",
                "analysis.inputSnapshot",
              ),
            ],
            limitations: [
              limitation(
                "calibration_unavailable",
                "Calibrated spatial measurements may be unavailable.",
                "analysis.inputSnapshot",
              ),
            ],
            phase: null,
            side: null,
            availability: "unavailable",
            experimental: input.experimental,
            dedupeKey: "calibration:availability",
            conflictKey: "calibration:availability",
          }
        : null,
  },
  {
    ruleId: "recording.panning.v1",
    category: "Recording",
    requiredMetrics: [],
    enabled: true,
    version: "1",
    evaluate: (input) =>
      input.recordingMode?.includes("pan")
        ? {
            title: "Panning recording",
            summary: `The recording classifier identified ${input.recordingMode.replaceAll("_", " ")} camera motion.`,
            status: statusFor(
              input.experimental,
              input.recordingQuality?.confidence ?? "Unavailable",
              "available",
            ),
            confidence: input.recordingQuality?.confidence ?? "Unavailable",
            severity: "Informational",
            evidence: [
              recordingEvidence(
                input,
                "recording_mode",
                input.recordingMode,
                input.recordingQuality?.confidence ?? "Unavailable",
                "recordingAssessment",
              ),
            ],
            limitations: [
              limitation(
                "measured_from_panning_video",
                "Measurements were derived from a panning recording.",
                "recordingAssessment",
              ),
            ],
            phase: null,
            side: null,
            availability: "available",
            experimental: input.experimental,
            dedupeKey: "recording:camera_mode",
            conflictKey: null,
          }
        : null,
  },
  {
    ruleId: "timing.classification.v1",
    category: "Timing",
    requiredMetrics: [],
    enabled: true,
    version: "1",
    evaluate: (input) => {
      const classification = input.timingClassification;
      const experimental = classification === "experimental";
      const available = classification !== "unavailable";
      return {
        title: available
          ? experimental
            ? "Timing is experimental"
            : "Timing is available"
          : "Automatic timing unavailable",
        summary: available
          ? experimental
            ? "Timing was produced by an experimental timing pipeline."
            : "The completed analysis reports timing as trusted."
          : "The completed analysis did not produce trusted automatic timing.",
        status: experimental ? "experimental" : available ? "supported" : "unavailable",
        confidence: available ? input.timingConfidence : "Unavailable",
        severity: "Informational",
        evidence: [
          recordingEvidence(
            input,
            "timing_classification",
            classification,
            available ? input.timingConfidence : "Unavailable",
            input.timingConfidenceSource,
          ),
        ],
        limitations: available
          ? experimental
            ? [
                limitation(
                  "experimental_timing",
                  "Timing is experimental.",
                  "analysis.result",
                ),
              ]
            : []
          : [
              limitation(
                "automatic_timing_unavailable",
                "Automatic timing was unavailable.",
                "analysis.result",
              ),
            ],
        phase: null,
        side: null,
        availability: available ? "available" : "unavailable",
        experimental,
        dedupeKey: "timing:classification",
        conflictKey: "timing:classification",
      };
    },
  },
  ...(["top_speed", "average_velocity"] as const).map(
    (key): ObservationRule => ({
      ruleId: `velocity.${key}.v1`,
      category: "MaximumVelocity",
      requiredMetrics: [key],
      enabled: true,
      version: "1",
      evaluate: (input) => {
        const item = metric(input, key);
        if (!item) return null;
        const available = item.availability === "available";
        return {
          title: available ? "Velocity available" : "Velocity withheld",
          summary: available
            ? `${item.key.replaceAll("_", " ")} was measured at ${item.value} ${item.unit}.`
            : `${item.key.replaceAll("_", " ")} was not available from this analysis.`,
          status: statusFor(item.experimental, item.confidence, item.availability),
          confidence: item.confidence,
          severity: "Informational",
          evidence: [evidenceFromMetric(item)],
          limitations: metricLimitations(item),
          phase: item.phase,
          side: null,
          availability: item.availability,
          experimental: item.experimental,
          dedupeKey: "velocity:availability",
          conflictKey: "velocity:availability",
        };
      },
    }),
  ),
  {
    ruleId: "cadence.availability.v1",
    category: "StrideFrequency",
    requiredMetrics: ["cadence"],
    enabled: true,
    version: "1",
    evaluate: (input) => {
      const item = metric(input, "cadence");
      if (!item) return null;
      const available = item.availability === "available";
      return {
        title: available ? "Cadence available" : "Cadence unavailable",
        summary: available
          ? `Cadence was measured at ${item.value} ${item.unit}.`
          : "Cadence was not available from this analysis.",
        status: statusFor(item.experimental, item.confidence, item.availability),
        confidence: item.confidence,
        severity: "Informational",
        evidence: [evidenceFromMetric(item)],
        limitations: metricLimitations(item),
        phase: item.phase,
        side: null,
        availability: item.availability,
        experimental: item.experimental,
        dedupeKey: "cadence:availability",
        conflictKey: "cadence:availability",
      };
    },
  },
  ...([
    ["stride_length_asymmetry", "Stride length"],
    ["stride_frequency_asymmetry", "Stride frequency"],
    ["contact_asymmetry", "Contact time"],
    ["flight_asymmetry", "Flight time"],
  ] as const).map(
    ([key, label]): ObservationRule => ({
      ruleId: `asymmetry.${key}.v1`,
      category: "Asymmetry",
      requiredMetrics: [key],
      enabled: true,
      version: "1",
      evaluate: (input) => {
        const comparison = input.comparisons.find((item) => item.key === key);
        if (!comparison || comparison.classification !== "different") return null;
        const weakerSide =
          comparison.leftValue != null && comparison.rightValue != null
            ? comparison.leftValue < comparison.rightValue
              ? "left"
              : "right"
            : null;
        const evidence: ObservationEvidence[] = [
          {
            metric: key,
            value: comparison.differencePct,
            unit: "%",
            confidence: comparison.confidence,
            source: comparison.source,
            availability: comparison.availability,
            frameRange: comparison.frameRange,
            phase: comparison.phase,
            directness: "derived",
          },
        ];
        return {
          title: `${label} asymmetry observed`,
          summary: `${label} differed left-to-right by ${comparison.differencePct}%.`,
          status: statusFor(
            comparison.experimental,
            comparison.confidence,
            comparison.availability,
          ),
          confidence: comparison.confidence,
          severity: "Unknown",
          evidence,
          limitations:
            comparison.confidence === "Low"
              ? [
                  limitation(
                    "metric_confidence_limited",
                    "The underlying side comparison has limited confidence.",
                    comparison.source,
                  ),
                ]
              : [],
          phase: comparison.phase,
          side: weakerSide,
          availability: comparison.availability,
          experimental: comparison.experimental,
          dedupeKey: `asymmetry:${key}`,
          conflictKey: `asymmetry:${key}`,
        };
      },
    }),
  ),
  {
    ruleId: "front_side.knee_reference.v1",
    category: "FrontSideMechanics",
    requiredMetrics: ["knee_height_reference"],
    enabled: true,
    version: "1",
    evaluate: (input) => {
      const comparison = input.comparisons.find((item) => item.key === "knee_height_reference");
      if (!comparison || !["consistent", "reduced"].includes(comparison.classification)) return null;
      const reduced = comparison.classification === "reduced";
      return {
        title: reduced ? "Knee height below reference" : "Knee height consistent with reference",
        summary: reduced
          ? "Measured front-side knee height was below the configured reference."
          : "Measured front-side knee height was consistent with the configured reference.",
        status: statusFor(
          comparison.experimental,
          comparison.confidence,
          comparison.availability,
        ),
        confidence: comparison.confidence,
        severity: "Unknown",
        evidence: [
          {
            metric: comparison.key,
            value: comparison.leftValue,
            unit: comparison.unit,
            confidence: comparison.confidence,
            source: comparison.source,
            availability: comparison.availability,
            frameRange: comparison.frameRange,
            phase: comparison.phase,
            directness: "derived",
          },
        ],
        limitations: [],
        phase: comparison.phase,
        side: null,
        availability: comparison.availability,
        experimental: comparison.experimental,
        dedupeKey: "front_side:knee_reference",
        conflictKey: "front_side:knee_reference",
      };
    },
  },
  {
    ruleId: "posture.torso_stability.v1",
    category: "Posture",
    requiredMetrics: ["torso_stability"],
    enabled: true,
    version: "1",
    evaluate: (input) => {
      const comparison = input.comparisons.find((item) => item.key === "torso_stability");
      if (!comparison || !["stable", "variable"].includes(comparison.classification)) return null;
      const stable = comparison.classification === "stable";
      return {
        title: stable ? "Torso position stable" : "Torso position variable",
        summary: stable
          ? "Measured torso position remained within the existing stability classification."
          : "Measured torso position exceeded the existing variability classification.",
        status: statusFor(
          comparison.experimental,
          comparison.confidence,
          comparison.availability,
        ),
        confidence: comparison.confidence,
        severity: "Unknown",
        evidence: [
          {
            metric: comparison.key,
            value: comparison.differencePct,
            unit: comparison.unit,
            confidence: comparison.confidence,
            source: comparison.source,
            availability: comparison.availability,
            frameRange: comparison.frameRange,
            phase: comparison.phase,
            directness: "derived",
          },
        ],
        limitations: [],
        phase: comparison.phase,
        side: null,
        availability: comparison.availability,
        experimental: comparison.experimental,
        dedupeKey: "posture:torso_stability",
        conflictKey: "posture:torso_stability",
      };
    },
  },
];
