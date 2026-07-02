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

export interface CoachingReport {
  sessionId?: string;
  techniqueScore: number;
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
