import {
  OFFLINE_COACHING_CACHE_VERSION, offlineCoachingCacheSchema,
  type CoachingState,
} from "./contracts";

export function buildOfflineCoachingCache(input: {
  state: CoachingState; reportIds: string[]; recommendationIds: string[];
  benchmarkComparisonIds: string[]; projectionIds: string[];
  drillLibraryVersion: string; syncedAt: string;
}) {
  return offlineCoachingCacheSchema.parse({
    cacheVersion: OFFLINE_COACHING_CACHE_VERSION,
    athleteId: input.state.athleteId, coachingState: input.state,
    reportIds: input.reportIds, recommendationIds: input.recommendationIds,
    benchmarkComparisonIds: input.benchmarkComparisonIds,
    projectionIds: input.projectionIds, drillLibraryVersion: input.drillLibraryVersion,
    syncedAt: input.syncedAt,
    queuedMutationsSupported: ["adherence", "note", "coach_feedback", "reminder", "upload"],
  });
}
