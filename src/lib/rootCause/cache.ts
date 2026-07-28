import { offlineRootCauseCacheSchema, type RootCauseState } from "./contracts";
export function buildOfflineRootCauseCache(input:{
  state:RootCauseState;syncedAt:string;queuedFeedbackActions:unknown[];
}){
  return offlineRootCauseCacheSchema.parse({
    cacheVersion:"ava-offline-root-cause-cache-v1",athleteId:input.state.athleteId,
    state:input.state,syncedAt:input.syncedAt,queuedFeedbackActions:input.queuedFeedbackActions,
  });
}
