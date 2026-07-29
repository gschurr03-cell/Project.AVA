import type { ConfidenceLabel, Limiter, LimitingFactorsResult } from "@/lib/limitingFactors";
import type { SprintIntelligenceReport } from "@/lib/sprintIntelligence";

export type RecommendationCategory =
  | "technical_focus"
  | "drill_idea"
  | "resisted_sprint"
  | "plyometric_emphasis"
  | "strength_emphasis"
  | "rhythm_focus"
  | "assessment"
  | "monitoring";

export type RecommendationStatus =
  | "recommended"
  | "conditional"
  | "monitor_only"
  | "additional_testing"
  | "insufficient_evidence"
  | "not_applicable";

export interface RecommendationEvidenceReference {
  limiterId: string;
  conclusionId: string | null;
  label: string;
  value: string;
  kind: "measurement" | "comparison" | "context";
}

export interface CoachingRecommendation {
  id: string;
  key: string;
  limiterIds: string[];
  conclusionIds: string[];
  category: RecommendationCategory;
  title: string;
  summary: string;
  rationale: string;
  evidenceReferences: RecommendationEvidenceReference[];
  implementationGuidance: string[];
  observationCues: string[];
  cautions: string[];
  exclusions: string[];
  confidence: {
    score: number | null;
    label: ConfidenceLabel;
    explanation: string;
  };
  priority: {
    score: number;
    level: "primary" | "secondary" | "optional";
    explanation: string;
  };
  applicability: {
    sessionContext: string[];
    athleteContext: string[];
    requiresCoachReview: boolean;
    requiresPhysicalTesting: boolean;
  };
  status: RecommendationStatus;
  historicalContext: {
    state: "unavailable" | "single_session" | "improving" | "unchanged" | "worsening";
    explanation: string;
  };
}

export interface CoachingRecommendationsInput {
  analysisId: string;
  sessionId: string;
  generatedAt: string;
  limitingFactors: LimitingFactorsResult;
  sprintIntelligence: SprintIntelligenceReport | null;
  context: {
    analysisType: string | null;
    injuryStatus?: "none_reported" | "current_injury" | "recent_surgery" | "rehabilitation" | "return_to_running" | null;
    painReported?: boolean | null;
    clinicianRestrictions?: string[] | null;
    historicalSessions?: number | null;
  };
}

export interface CoachingRecommendationsResult {
  analysisId: string;
  sessionId: string;
  generatedAt: string;
  modelVersion: string;
  status: "ok" | "no_reliable_limiter" | "insufficient_evidence";
  primaryDirection: string | null;
  startWith: string[];
  recommendations: CoachingRecommendation[];
  monitoring: CoachingRecommendation[];
  assessments: CoachingRecommendation[];
  limitations: string[];
  source: {
    limiterIds: string[];
    sprintIntelligenceVersion: string | null;
  };
}

export interface RecommendationTemplate {
  key: string;
  category: RecommendationCategory;
  title: string;
  summary: string;
  guidance: string[];
  cues: string[];
  caution?: string;
  conditional?: boolean;
  requiresCoachReview?: boolean;
  requiresPhysicalTesting?: boolean;
}

export interface RecommendationCandidate {
  template: RecommendationTemplate;
  limiter: Limiter;
  conclusionId: string | null;
}
