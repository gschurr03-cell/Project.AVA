import type { AthleteComparisonContext, BenchmarkDataset, BenchmarkEntry } from "./contracts";

export interface CompatibilityDecision {
  compatible: boolean;
  confidence: "High" | "Moderate" | "Low" | "Unavailable";
  reasons: string[];
  warnings: string[];
}

export function validateBenchmarkCompatibility(
  athlete: AthleteComparisonContext, dataset: BenchmarkDataset, entry: BenchmarkEntry,
): CompatibilityDecision {
  const reasons: string[] = [];
  const warnings: string[] = [];
  if (!dataset.verified || !dataset.active) reasons.push("Dataset is not active and verified.");
  if (dataset.source.reviewStatus !== "approved_production") reasons.push("Dataset evidence is not production approved.");
  if (!dataset.population.sex.includes(athlete.sex) && !dataset.population.sex.includes("mixed"))
    reasons.push("Sex population does not match.");
  if (!athlete.event || !dataset.population.events.includes(athlete.event) || entry.event !== athlete.event)
    reasons.push("Sprint event does not match.");
  if (entry.phase !== athlete.phase) reasons.push("Sprint phase does not match.");
  if (entry.measurementProtocolVersion !== athlete.measurementProtocolVersion)
    reasons.push("Measurement protocol differs.");
  if (entry.measurementMethod !== athlete.measurementTechnology || dataset.measurementTechnology !== athlete.measurementTechnology)
    reasons.push("Measurement technology differs.");
  if (entry.timingSystem !== athlete.timingSystem || dataset.timingSystem !== athlete.timingSystem)
    reasons.push("Timing system differs.");
  if (entry.sourceFrameRateClass !== athlete.frameRateClass || dataset.sourceFrameRateClass !== athlete.frameRateClass)
    reasons.push("Frame-rate class differs.");
  if (athlete.metricDefinitionVersions[entry.metric] !== entry.metricDefinitionVersion)
    reasons.push("Metric definition differs.");
  if (entry.sex !== athlete.sex && entry.sex !== "mixed") reasons.push("Entry sex does not match.");
  if (entry.ageRange && athlete.age != null && (athlete.age < entry.ageRange.minimum || athlete.age > entry.ageRange.maximum))
    reasons.push("Age falls outside the benchmark entry.");
  if (athlete.surface && dataset.population.surfaces.length && !dataset.population.surfaces.includes(athlete.surface))
    warnings.push("Surface differs or is not represented.");
  if (athlete.environment && dataset.population.environments.length && !dataset.population.environments.includes(athlete.environment))
    warnings.push("Environment differs or is not represented.");
  return {
    compatible: reasons.length === 0,
    confidence: reasons.length ? "Unavailable" : warnings.length ? "Moderate" : "High",
    reasons: reasons.length ? reasons : ["All required comparison contracts match."], warnings,
  };
}

