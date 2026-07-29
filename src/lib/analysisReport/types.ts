import type { CoachingRecommendationsResult } from "@/lib/coachingRecommendations";
import type { LimitingFactorsResult } from "@/lib/limitingFactors";
import type { SprintIntelligenceReport } from "@/lib/sprintIntelligence";

export type ReportAudience = "athlete" | "coach" | "organization";
export type ReportLifecycleState = "not_generated" | "generating" | "ready" | "failed" | "stale" | "superseded";
export type ReportMetricKey =
  | "average_step_length"
  | "peak_step_length"
  | "step_frequency"
  | "average_velocity"
  | "peak_velocity";

export interface ReportMetric {
  key: ReportMetricKey;
  name: string;
  value: number | null;
  formattedValue: string;
  unit: "m" | "Hz" | "m/s";
  definition: string;
  comparison: string;
  targetBasis: string;
  confidence: string;
  interpretation: string;
}

export interface SprintAnalysisReport {
  reportId: string;
  analysisId: string;
  sessionId: string;
  athleteId: string;
  audience: ReportAudience;
  lifecycleState: ReportLifecycleState;
  generatedAt: string;
  versions: {
    schema: string;
    template: string;
    metricEngine: string;
    limiterModel: string;
    sprintIntelligence: string;
    coachingRecommendations: string;
  };
  identity: {
    title: string;
    subtitle: string;
    reference: string;
  };
  athlete: {
    displayName: string;
    heightCm: number | null;
    weightKg: number | null;
    legLengthCm: number | null;
    trochanterHeightM: number | null;
  };
  session: {
    name: string;
    sessionDate: string | null;
    analysisDate: string;
    sprintContext: string;
    zoneType: string;
    zoneDistanceM: number | null;
    videoFps: number | null;
    calibrationMethod: string;
    validSteps: number | null;
    sessionNotes: string | null;
  };
  executiveSummary: {
    primaryFinding: string;
    performanceStrength: string;
    primaryTrainingDirection: string;
    confidenceLabel: string;
    confidenceScore: number | null;
    importantContext: string;
  };
  metrics: ReportMetric[];
  limitingFactors: LimitingFactorsResult["limiters"];
  intelligence: {
    primary: SprintIntelligenceReport["primaryConclusion"];
    supporting: SprintIntelligenceReport["supportingConclusions"];
    assumptions: SprintIntelligenceReport["assumptions"];
    missingInputs: SprintIntelligenceReport["missingInputs"];
    changeConditions: SprintIntelligenceReport["changeConditions"];
    counterEvidence: SprintIntelligenceReport["counterEvidence"];
  };
  strengths: SprintIntelligenceReport["strengths"];
  asymmetry: {
    title: string;
    measuredValues: LimitingFactorsResult["limiters"][number]["measuredValues"];
    percentage: number | null;
    confidence: string;
    interpretation: string;
    limitation: string;
  } | null;
  recommendations: CoachingRecommendationsResult["recommendations"];
  monitoring: CoachingRecommendationsResult["monitoring"];
  additionalTesting: CoachingRecommendationsResult["assessments"];
  dataQuality: {
    measurementConfidence: number | null;
    reasoningConfidence: number | null;
    overallConfidence: number | null;
    calibrationConfirmed: boolean;
    spatialAvailable: boolean;
    validSteps: number | null;
    warnings: string[];
  };
  methodology: {
    metricsUsed: string[];
    targetBasis: string;
    limiterRanking: string;
    confidenceBasis: string;
    recommendationsBoundary: string;
  };
  history: {
    available: boolean;
    summary: string;
  };
  branding: {
    organizationName: string | null;
    coachName: string | null;
    accentColor: string;
    footer: string | null;
    avaAttribution: string;
  };
  disclaimers: string[];
  sourceSnapshot: {
    limitingFactors: LimitingFactorsResult;
    sprintIntelligence: SprintIntelligenceReport;
    coachingRecommendations: CoachingRecommendationsResult;
  };
}

export interface BuildSprintAnalysisReportInput {
  generatedAt: string;
  analysisId: string;
  sessionId: string;
  athleteId: string;
  audience: ReportAudience;
  athlete: SprintAnalysisReport["athlete"];
  session: SprintAnalysisReport["session"];
  metrics: Record<ReportMetricKey, number | null>;
  metricConfidence: string;
  metricEngineVersion: string;
  limiterModelVersion: string;
  limitingFactors: LimitingFactorsResult;
  sprintIntelligence: SprintIntelligenceReport;
  coachingRecommendations: CoachingRecommendationsResult;
  branding?: Partial<SprintAnalysisReport["branding"]> | null;
}
