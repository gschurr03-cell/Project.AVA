import { PROJECTION_POLICY } from "./policy";
import type { ProjectionConfidenceLevel, ProjectionInput } from "./contracts";
import type { TrajectoryAnalysis } from "./trajectory";

const mean = (values: number[]) => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export function assessProjectionConfidence(
  input: ProjectionInput, trajectory: TrajectoryAnalysis,
): { level: ProjectionConfidenceLevel; score: number; limitingFactors: string[] } {
  const factors: string[] = [];
  if (trajectory.points.length < PROJECTION_POLICY.minimumHistoryPoints) {
    return { level: "Insufficient", score: 0, limitingFactors: ["Fewer than three compatible historical measurements."] };
  }
  const historyFactor = Math.min(1, trajectory.points.length / PROJECTION_POLICY.highHistoryPoints);
  const measurement = mean(trajectory.points.map((point) => point.measurementConfidence));
  const quality = mean(trajectory.points.map((point) => point.sessionQuality));
  const consistency = input.biomechanicalConsistency ?? 0.5;
  const research = input.researchConfidence ?? 0.5;
  let score = Math.round(100 * mean([historyFactor, measurement, quality, consistency, research]));

  if (trajectory.excludedPointCount) factors.push(`${trajectory.excludedPointCount} incompatible historical point(s) were excluded.`);
  const compatibleBenchmarks = input.benchmarks.filter((item) =>
    item.compatibilityConfidence === "High" || item.compatibilityConfidence === "Moderate");
  if (!input.benchmarks.length) {
    score = Math.min(score, PROJECTION_POLICY.confidence.noBenchmarkCap);
    factors.push("No compatible population benchmark was supplied.");
  } else if (!compatibleBenchmarks.length) {
    score = Math.min(score, PROJECTION_POLICY.confidence.incompatibleBenchmarkCap);
    factors.push("Supplied benchmark comparisons are incompatible or low-confidence.");
  }
  if (input.trainingAgeYears == null || input.trainingConsistency == null) {
    score = Math.min(score, PROJECTION_POLICY.confidence.missingTrainingContextCap);
    factors.push("Training age or training consistency is unknown.");
  }
  if (trajectory.trajectoryType === "inconsistent") {
    score = Math.min(score, PROJECTION_POLICY.confidence.inconsistentTrajectoryCap);
    factors.push("Compatible measurements are too inconsistent for a stable trend.");
  }
  score = Math.min(score, PROJECTION_POLICY.confidence.uncalibratedIntervalCap);
  factors.push("Projection intervals are evidence-bounded and have not been prospectively calibrated.");
  const level: ProjectionConfidenceLevel = score >= 75 ? "High" : score >= 55 ? "Moderate" : score >= 30 ? "Low" : "Insufficient";
  return { level, score, limitingFactors: factors };
}

