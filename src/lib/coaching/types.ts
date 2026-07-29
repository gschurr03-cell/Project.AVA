export type MetricStatus = "elite" | "good" | "watch" | "poor";

export type InsightCategory =
  | "overall"
  | "acceleration"
  | "maxVelocity"
  | "groundContact"
  | "stride"
  | "posture"
  | "symmetry"
  | "fatigue";

export type InsightSeverity = "excellent" | "good" | "watch" | "poor";

export interface MetricEvaluation {
  id: string;
  label: string;
  value: number;
  unit: string;
  status: MetricStatus;
  targetRange: string;
  meaning: string;
  usedIn: string[];
}

export interface CoachingInsight {
  id: string;
  category: InsightCategory;
  severity: InsightSeverity;
  priority: number;
  title: string;
  explanation: string;
  recommendation: string;
  evidence: string[];
}

export interface CoachingPriority {
  id: string;
  title: string;
  impact: "high" | "medium" | "low";
  priority: number;
  recommendation: string;
  evidence: string[];
}

/** A score threshold mapped to a qualitative label. */
export interface TechniqueScoreBand {
  label: string;
  min: number;
}

/** One metric's contribution to the technique score. */
export interface TechniqueScoreBreakdownItem {
  metricId: string;
  label: string;
  status: MetricStatus;
  weight: number;
  points: number;
  maxPoints: number;
  explanation: string;
}

/** The computed technique score, its label, and per-metric breakdown. */
export interface TechniqueScoreResult {
  score: number;
  label: string;
  breakdown: TechniqueScoreBreakdownItem[];
}

export interface CoachingReport {
  sessionId?: string;
  techniqueScore: number;
  techniqueLabel: string;
  techniqueBreakdown: TechniqueScoreBreakdownItem[];
  summary: string;
  metricEvaluations: MetricEvaluation[];
  insights: CoachingInsight[];
  priorities: CoachingPriority[];
}

export interface CoachingRuleInput {
  metrics: Record<string, number | null | undefined>;
  evaluations: MetricEvaluation[];
}

export interface CoachingRule {
  id: string;
  evaluate(input: CoachingRuleInput): CoachingInsight | null;
}

/** Direction of change when comparing a report to a previous one. */
export type ComparisonDirection = "improved" | "declined" | "unchanged";

/** How one shared metric changed between two sessions. */
export interface MetricComparison {
  metricId: string;
  label: string;
  previousValue: number;
  currentValue: number;
  delta: number;
  unit: string;
  direction: ComparisonDirection;
}

/** How the technique score changed between two sessions. */
export interface TechniqueScoreComparison {
  previousScore: number;
  currentScore: number;
  delta: number;
  direction: ComparisonDirection;
}

/** A current CoachingReport compared against a previous one. */
export interface CoachingComparisonReport {
  techniqueScore: TechniqueScoreComparison;
  metrics: MetricComparison[];
}
