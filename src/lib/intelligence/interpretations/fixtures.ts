import {
  OBSERVATION_ENGINE_VERSION,
  type Observation,
} from "@/lib/observations";

import type { InterpretationContext, InterpretationInput } from "./contracts";

const ANALYSIS_ID = "synthetic-interpretation-fixture";
const CREATED_AT = "2026-07-17T12:00:00.000Z";

export function syntheticObservation(overrides: Partial<Observation> & Pick<Observation, "ruleId" | "title">): Observation {
  const metric = overrides.supportingMetrics?.[0] ?? "synthetic_metric";
  return {
    id: `${OBSERVATION_ENGINE_VERSION}:${ANALYSIS_ID}:${overrides.ruleId}:${overrides.side ?? "none"}`,
    category: "DataQuality",
    summary: "Synthetic observation for deterministic interpretation testing.",
    status: "supported",
    confidence: "High",
    severity: "Informational",
    evidence: [
      {
        metric,
        value: 1,
        unit: "",
        confidence: "High",
        source: "synthetic-fixture:v1",
        availability: "available",
        frameRange: { startFrame: 10, endFrame: 30 },
        phase: "maximum_velocity",
        directness: "direct",
      },
    ],
    limitations: [],
    phase: "maximum_velocity",
    side: null,
    createdAt: CREATED_AT,
    engineVersion: OBSERVATION_ENGINE_VERSION,
    supportingMetrics: [metric],
    availability: "available",
    experimental: false,
    ...overrides,
  };
}

export const syntheticContext = (
  overrides: Partial<InterpretationContext> = {},
): InterpretationContext => ({
  analysisId: ANALYSIS_ID,
  generatedAt: CREATED_AT,
  phase: "maximum_velocity",
  cameraMode: "static_precision",
  fpsTier: "validated_60",
  calibrationAvailable: true,
  event: null,
  sessionPurpose: "fly",
  athleteId: "synthetic-athlete",
  contextVersion: "ava-interpretation-context-v1",
  savedVersion: false,
  ...overrides,
});

const asymmetry = (ruleId: string, title: string, side: "left" | "right") =>
  syntheticObservation({ ruleId, title, category: "Asymmetry", side });

export const INTERPRETATION_GOLDEN_FIXTURES: Record<string, InterpretationInput> = {
  stable_high_quality_maximum_velocity: {
    observations: [
      syntheticObservation({
        ruleId: "recording.high_quality.v1",
        title: "High recording quality",
      }),
      syntheticObservation({
        ruleId: "velocity.top_speed.v1",
        title: "Velocity available",
        category: "MaximumVelocity",
      }),
    ],
    context: syntheticContext(),
  },
  experimental_30_fps: {
    observations: [
      syntheticObservation({
        ruleId: "recording.experimental_fps.v1",
        title: "Experimental frame-rate analysis",
        category: "Recording",
        status: "experimental",
        confidence: "Low",
        experimental: true,
      }),
    ],
    context: syntheticContext({ fpsTier: "experimental_30" }),
  },
  panning_broad_technique: {
    observations: [
      syntheticObservation({
        ruleId: "recording.panning.v1",
        title: "Panning recording",
        category: "Recording",
      }),
    ],
    context: syntheticContext({ cameraMode: "smooth_pan" }),
  },
  single_metric_asymmetry: {
    observations: [
      asymmetry("asymmetry.stride_length_asymmetry.v1", "Stride length asymmetry observed", "left"),
    ],
    context: syntheticContext(),
  },
  converging_asymmetry: {
    observations: [
      asymmetry("asymmetry.stride_length_asymmetry.v1", "Stride length asymmetry observed", "left"),
      asymmetry("asymmetry.stride_frequency_asymmetry.v1", "Stride frequency asymmetry observed", "left"),
    ],
    context: syntheticContext(),
  },
  contradictory_asymmetry: {
    observations: [
      asymmetry("asymmetry.stride_length_asymmetry.v1", "Stride length asymmetry observed", "left"),
      asymmetry("asymmetry.stride_frequency_asymmetry.v1", "Stride frequency asymmetry observed", "right"),
    ],
    context: syntheticContext(),
  },
  reduced_front_side_unknown_phase: {
    observations: [
      syntheticObservation({
        ruleId: "front_side.knee_reference.v1",
        title: "Knee height below reference",
        category: "FrontSideMechanics",
      }),
    ],
    context: syntheticContext({ phase: "unknown" }),
  },
  variable_posture_transition: {
    observations: [
      syntheticObservation({
        ruleId: "posture.torso_stability.v1",
        title: "Torso position variable",
        category: "Posture",
      }),
    ],
    context: syntheticContext({ phase: "transition" }),
  },
  trusted_velocity_context: {
    observations: [
      syntheticObservation({
        ruleId: "velocity.top_speed.v1",
        title: "Velocity available",
        category: "MaximumVelocity",
      }),
    ],
    context: syntheticContext(),
  },
  velocity_unavailable_without_calibration: {
    observations: [
      syntheticObservation({
        ruleId: "velocity.top_speed.v1",
        title: "Velocity withheld",
        category: "MaximumVelocity",
        status: "unavailable",
        confidence: "Unavailable",
        availability: "withheld",
      }),
    ],
    context: syntheticContext({ calibrationAvailable: false }),
  },
  cadence_available_without_consistency: {
    observations: [
      syntheticObservation({
        ruleId: "cadence.availability.v1",
        title: "Cadence available",
        category: "StrideFrequency",
      }),
    ],
    context: syntheticContext(),
  },
  low_confidence_only: {
    observations: [
      syntheticObservation({
        ruleId: "cadence.availability.v1",
        title: "Cadence available",
        category: "StrideFrequency",
        confidence: "Low",
      }),
    ],
    context: syntheticContext(),
  },
  no_observations: { observations: [], context: syntheticContext() },
  duplicate_observation_family: {
    observations: [
      syntheticObservation({
        ruleId: "velocity.top_speed.v1",
        title: "Velocity available",
        category: "MaximumVelocity",
        id: `${OBSERVATION_ENGINE_VERSION}:${ANALYSIS_ID}:velocity.top_speed.v1:a`,
      }),
      syntheticObservation({
        ruleId: "velocity.average_velocity.v1",
        title: "Velocity available",
        category: "MaximumVelocity",
        id: `${OBSERVATION_ENGINE_VERSION}:${ANALYSIS_ID}:velocity.average_velocity.v1:b`,
      }),
    ],
    context: syntheticContext(),
  },
  compatible_personal_baseline_placeholder: {
    observations: [
      syntheticObservation({
        ruleId: "velocity.top_speed.v1",
        title: "Velocity available",
        category: "MaximumVelocity",
      }),
    ],
    context: syntheticContext(),
  },
};
