import "server-only";
import { loadSprintIntelligence } from "@/lib/sprintIntelligence/loadContext";
import { buildCoachingRecommendations } from "./engine";
import type { CoachingRecommendationsResult } from "./types";

export async function loadCoachingRecommendations(sessionId: string): Promise<{
  result: CoachingRecommendationsResult | null;
  sessionName: string | null;
  found: boolean;
}> {
  const context = await loadSprintIntelligence(sessionId);
  if (!context.found || !context.limitingFactors) {
    return { result: null, sessionName: context.sessionName, found: context.found };
  }
  return {
    found: true,
    sessionName: context.sessionName,
    result: buildCoachingRecommendations({
      analysisId: context.report?.analysisId ?? sessionId,
      sessionId,
      generatedAt: context.report?.generatedAt ?? new Date().toISOString(),
      limitingFactors: context.limitingFactors,
      sprintIntelligence: context.report,
      context: {
        analysisType: context.analysisType,
        // No authoritative injury fields are connected to this loader yet. Null is explicit:
        // the engine must not fabricate restrictions or claim clearance.
        injuryStatus: null,
        painReported: null,
        clinicianRestrictions: null,
        historicalSessions: null,
      },
    }),
  };
}
