import { createHash } from "node:crypto";
import {
  PROJECTION_ENGINE_VERSION, PROJECTION_SCHEMA_VERSION,
  projectionInputSchema, projectionOutputSchema,
  type ProjectionInput, type ProjectionOutput,
} from "./contracts";
import { assessProjectionConfidence } from "./confidence";
import { buildLimiters } from "./limiters";
import { PROJECTION_HORIZONS, PROJECTION_POLICY } from "./policy";
import { analyzeTrajectory } from "./trajectory";

const round = (value: number) => Number(value.toFixed(6));
const clamp = (value: number, lower: number | null, upper: number | null) =>
  Math.min(upper ?? Infinity, Math.max(lower ?? -Infinity, value));
const stableId = (input: ProjectionInput) =>
  `projection_${createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 20)}`;

export function buildPerformanceProjection(rawInput: ProjectionInput): ProjectionOutput {
  const parsed = projectionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fallback = rawInput as ProjectionInput;
    return projectionOutputSchema.parse({
      projectionId: `unsupported_${createHash("sha256").update(JSON.stringify(rawInput)).digest("hex").slice(0, 20)}`,
      engineVersion: PROJECTION_ENGINE_VERSION, schemaVersion: PROJECTION_SCHEMA_VERSION,
      projectionType: fallback.projectionType, targetMetric: fallback.targetMetric, unit: fallback.unit,
      status: "unsupported", predictedValue: null, confidenceInterval: null,
      projectionConfidence: { level: "Insufficient", score: 0, limitingFactors: parsed.error.issues.map((issue) => issue.message) },
      timeHorizon: PROJECTION_HORIZONS[fallback.projectionType],
      trajectoryType: "unknown", supportingEvidence: [], supportingBenchmarks: [],
      assumptions: ["The input must satisfy the versioned projection contract."],
      requiredConditions: ["Provide a supported, directly measured metric and valid structured evidence."],
      majorLimiters: [], unknownVariables: fallback.unknownVariables ?? [],
      bestCase: null, expectedCase: null, conservativeCase: null,
      invalidationConditions: ["Input contract validation failed."],
      warnings: ["No projection was produced."], generatedAt: fallback.generatedAt,
    });
  }
  const input = parsed.data;
  const trajectory = analyzeTrajectory(input.history, input.targetMetric, input.higherIsBetter);
  const confidence = assessProjectionConfidence(input, trajectory);
  const horizon = PROJECTION_HORIZONS[input.projectionType];
  const unsupportedReason =
    input.projectionType === "career_peak" ? "Career peak requires a validated longitudinal maturation model." :
    input.projectionType === "return_from_injury" && input.returnToPlayCleared !== true
      ? "Return-from-injury projection requires documented return-to-play clearance and a validated recovery model." :
    input.projectionType === "return_from_injury" ? "A validated recovery model is not available." :
    null;
  const insufficient = trajectory.currentValue == null || trajectory.slopePerDay == null ||
    confidence.level === "Insufficient" || horizon.days == null && input.projectionType !== "peak_potential" &&
    input.projectionType !== "season_peak" && input.projectionType !== "off_season";
  const status = unsupportedReason ? "unsupported" : insufficient ? "insufficient_evidence" : "available";

  let expected: number | null = null, best: number | null = null, conservative: number | null = null;
  let interval: ProjectionOutput["confidenceInterval"] = null;
  if (status === "available") {
    const requestedDays = horizon.days ?? (input.projectionType === "season_peak" ? 120 : 365);
    const damping = 1 / (1 + requestedDays / PROJECTION_POLICY.horizonDampingDays);
    const observedSpanDays = Math.max(1,
      (Date.parse(trajectory.points.at(-1)!.capturedAt) - Date.parse(trajectory.points[0].capturedAt)) / 86_400_000);
    const extrapolationDays = Math.min(requestedDays, observedSpanDays * PROJECTION_POLICY.maximumExtrapolationMultiples);
    const trendChange = trajectory.slopePerDay! * extrapolationDays * damping;
    expected = clamp(trajectory.currentValue! + trendChange, input.metricFloor, input.metricCeiling);
    const residual = trajectory.residualStandardDeviation ?? 0;
    const spread = Math.max(Math.abs(expected) * PROJECTION_POLICY.scenarioSpreadFloor,
      residual * PROJECTION_POLICY.scenarioSpreadResidualMultiplier * Math.sqrt(1 + requestedDays / 30));
    const favorableDirection = input.higherIsBetter ? 1 : -1;
    best = clamp(expected + favorableDirection * spread, input.metricFloor, input.metricCeiling);
    conservative = clamp(expected - favorableDirection * spread, input.metricFloor, input.metricCeiling);
    interval = {
      lower: round(Math.min(best, conservative)),
      upper: round(Math.max(best, conservative)),
      coverage: "evidence_bounded_not_calibrated",
    };
    expected = round(expected); best = round(best); conservative = round(conservative);
  }
  const availableBenchmarks = input.benchmarks.filter((item) =>
    item.compatibilityConfidence === "High" || item.compatibilityConfidence === "Moderate");
  const limiters = buildLimiters(input.limiterInputs, input.evidence);
  return projectionOutputSchema.parse({
    projectionId: stableId(input), engineVersion: PROJECTION_ENGINE_VERSION,
    schemaVersion: PROJECTION_SCHEMA_VERSION, projectionType: input.projectionType,
    targetMetric: input.targetMetric, unit: input.unit, status,
    predictedValue: expected, confidenceInterval: interval, projectionConfidence: confidence,
    timeHorizon: horizon, trajectoryType: trajectory.trajectoryType,
    supportingEvidence: input.evidence, supportingBenchmarks: availableBenchmarks,
    assumptions: [
      "Future measurement uses the same compatible metric definition and protocol.",
      "The recent observed trend is relevant only within the bounded horizon.",
      "Training exposure and recovery remain broadly comparable to the observed period.",
    ],
    requiredConditions: [
      "Collect repeated compatible measurements at comparable session quality.",
      "Recalculate after a material training, health, environment, or protocol change.",
    ],
    majorLimiters: limiters,
    unknownVariables: input.unknownVariables,
    bestCase: best, expectedCase: expected, conservativeCase: conservative,
    invalidationConditions: [
      "Measurement definition, timing system, frame-rate class, or protocol changes.",
      "Training availability, health status, or competition environment changes materially.",
      "New compatible measurements fall outside this evidence-bounded interval.",
    ],
    warnings: [
      ...(unsupportedReason ? [unsupportedReason] : []),
      ...(trajectory.excludedPointCount ? [`${trajectory.excludedPointCount} incompatible history point(s) were excluded.`] : []),
      ...(status === "available" ? ["Trajectory projection, not a guarantee or estimate of genetic potential."] : ["No numeric projection was produced."]),
    ],
    generatedAt: input.generatedAt,
  });
}

