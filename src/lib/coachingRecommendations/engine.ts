import type { ConfidenceLabel } from "@/lib/limitingFactors";
import { templatesForLimiter } from "./rules";
import type {
  CoachingRecommendation, CoachingRecommendationsInput, CoachingRecommendationsResult,
  RecommendationCandidate, RecommendationCategory,
} from "./types";

export const COACHING_RECOMMENDATION_MODEL_VERSION = "ava-coaching-recommendations-v1.0.0";

const categoryRank: Record<RecommendationCategory, number> = {
  technical_focus: 8, rhythm_focus: 7, drill_idea: 6, resisted_sprint: 5,
  strength_emphasis: 4, plyometric_emphasis: 4, assessment: 3, monitoring: 2,
};
const confidenceRank: Record<ConfidenceLabel, number> = {
  very_high: 5, high: 4, moderate: 3, low: 2, insufficient: 0,
};
const unique = <T,>(values: T[]) => [...new Set(values)];

function conclusionId(input: CoachingRecommendationsInput, limiterId: string): string | null {
  const all = [
    input.sprintIntelligence?.primaryConclusion,
    ...(input.sprintIntelligence?.supportingConclusions ?? []),
    ...(input.sprintIntelligence?.strengths ?? []),
  ].filter(Boolean);
  return all.find((item) => item?.limiterId === limiterId)?.id ?? null;
}

function score(candidate: RecommendationCandidate): number {
  const { limiter, template } = candidate;
  const directness = categoryRank[template.category] * 7;
  const confidence = confidenceRank[limiter.confidence.label] * 6;
  const impact = Math.round(limiter.impact.score * 30);
  const conditionalPenalty = template.conditional ? 10 : 0;
  return Math.max(0, Math.min(100, directness + confidence + impact - conditionalPenalty));
}

function physical(category: RecommendationCategory): boolean {
  return category === "strength_emphasis" || category === "plyometric_emphasis" || category === "resisted_sprint";
}

function build(candidate: RecommendationCandidate, input: CoachingRecommendationsInput): CoachingRecommendation {
  const { limiter, template } = candidate;
  const rawScore = score(candidate);
  const injuryContext = input.context.painReported === true ||
    !!input.context.injuryStatus && input.context.injuryStatus !== "none_reported" ||
    !!input.context.clinicianRestrictions?.length;
  const safetyCaution = injuryContext && (physical(template.category) || template.category === "drill_idea")
    ? "Only use this direction if cleared by the athlete’s qualified medical or rehabilitation professional. Do not train through pain."
    : null;
  const status = template.category === "monitoring" ? "monitor_only"
    : template.category === "assessment" ? "additional_testing"
    : template.conditional || safetyCaution ? "conditional" : "recommended";
  const evidenceReferences = limiter.evidence.slice(0, 4).map((e) => ({
    limiterId: limiter.id, conclusionId: candidate.conclusionId, ...e,
  }));
  return {
    id: `${COACHING_RECOMMENDATION_MODEL_VERSION}:${input.analysisId}:${template.key}`,
    key: template.key,
    limiterIds: [limiter.id],
    conclusionIds: candidate.conclusionId ? [candidate.conclusionId] : [],
    category: template.category,
    title: template.title,
    summary: template.summary,
    rationale: `${limiter.title}: ${limiter.summary}`,
    evidenceReferences,
    implementationGuidance: template.guidance.slice(0, 2),
    observationCues: template.cues.slice(0, 3),
    cautions: unique([template.caution, safetyCaution].filter((x): x is string => !!x)),
    exclusions: [
      "This does not diagnose a medical or physical deficit.",
      "This is a focused training direction, not a complete workout plan.",
    ],
    confidence: {
      score: limiter.confidence.overall,
      label: limiter.confidence.label,
      explanation: limiter.confidence.explanation,
    },
    priority: {
      score: rawScore,
      level: "optional",
      explanation: `Ranked from limiter impact, evidence confidence, action specificity, and safety (${rawScore}/100).`,
    },
    applicability: {
      sessionContext: [input.context.analysisType ?? "unknown sprint context"],
      athleteContext: injuryContext ? ["reported injury, pain, rehabilitation, or clinician restriction"] : [],
      requiresCoachReview: !!template.requiresCoachReview || !!safetyCaution,
      requiresPhysicalTesting: !!template.requiresPhysicalTesting,
    },
    status,
    historicalContext: {
      state: (input.context.historicalSessions ?? 0) > 1 ? "unavailable" : "single_session",
      explanation: (input.context.historicalSessions ?? 0) > 1
        ? "Compatible history exists, but no validated recommendation-trend model is connected yet."
        : "No trend is inferred from one session.",
    },
  };
}

function merge(a: CoachingRecommendation, b: CoachingRecommendation): CoachingRecommendation {
  const confidence = confidenceRank[a.confidence.label] <= confidenceRank[b.confidence.label] ? a.confidence : b.confidence;
  const winner = a.priority.score >= b.priority.score ? a : b;
  return {
    ...winner,
    limiterIds: unique([...a.limiterIds, ...b.limiterIds]).sort(),
    conclusionIds: unique([...a.conclusionIds, ...b.conclusionIds]).sort(),
    evidenceReferences: [...a.evidenceReferences, ...b.evidenceReferences]
      .filter((item, index, all) => all.findIndex((x) =>
        x.limiterId === item.limiterId && x.label === item.label && x.value === item.value) === index),
    cautions: unique([...a.cautions, ...b.cautions]),
    confidence,
    rationale: winner.rationale,
    priority: {
      ...winner.priority,
      score: Math.max(a.priority.score, b.priority.score),
      explanation: `Consolidated across ${unique([...a.limiterIds, ...b.limiterIds]).length} compatible limiter(s); the most conservative confidence is retained.`,
    },
  };
}

export function buildCoachingRecommendations(input: CoachingRecommendationsInput): CoachingRecommendationsResult {
  const limiters = input.limitingFactors.limiters.filter((l) => l.status === "detected");
  const base = {
    analysisId: input.analysisId, sessionId: input.sessionId, generatedAt: input.generatedAt,
    modelVersion: COACHING_RECOMMENDATION_MODEL_VERSION,
    limitations: [
      "Sprint footage can suggest technical patterns and possible physical associations, but cannot determine strength, mobility, tissue capacity, injury status, or medical diagnosis.",
      "AVA provides focused intervention ideas, not full programming, rehabilitation, or return-to-play guidance.",
    ],
    source: {
      limiterIds: limiters.map((l) => l.id),
      sprintIntelligenceVersion: input.sprintIntelligence?.version ?? null,
    },
  };
  if (!limiters.length) return {
    ...base, status: input.limitingFactors.status === "ok" ? "no_reliable_limiter" : "insufficient_evidence",
    primaryDirection: null, startWith: [], recommendations: [], monitoring: [], assessments: [],
  };

  const candidates = limiters.flatMap((limiter) =>
    templatesForLimiter(limiter, limiters).map((template) => ({
      limiter, template, conclusionId: conclusionId(input, limiter.id),
    })));
  const consolidated = new Map<string, CoachingRecommendation>();
  for (const candidate of candidates) {
    const next = build(candidate, input);
    const current = consolidated.get(next.key);
    consolidated.set(next.key, current ? merge(current, next) : next);
  }
  const ranked = [...consolidated.values()].sort((a, b) =>
    b.priority.score - a.priority.score || a.key.localeCompare(b.key));
  const actions = ranked.filter((r) => !["assessment", "monitoring"].includes(r.category)).slice(0, 3);
  const recommendations = actions.map((r, i) => ({
    ...r, priority: { ...r.priority, level: i === 0 ? "primary" as const : "secondary" as const },
  }));
  const monitoring = ranked.filter((r) => r.category === "monitoring").slice(0, 1);
  const assessments = ranked.filter((r) => r.category === "assessment").slice(0, 1);
  const primary = recommendations[0] ?? assessments[0] ?? monitoring[0];
  return {
    ...base, status: "ok",
    primaryDirection: primary?.summary ?? null,
    startWith: [...recommendations, ...assessments, ...monitoring].slice(0, 3).map((r) => r.title),
    recommendations, monitoring, assessments,
  };
}
