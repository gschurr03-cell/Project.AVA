import{offlineAdapterCacheSchema,type RootCauseRecommendationContext}from"./contracts";
export function buildOfflineAdapterCache(input:{context:RootCauseRecommendationContext;
  recommendationIds:string[];syncedAt:string}){
  return offlineAdapterCacheSchema.parse({cacheVersion:"ava-offline-root-cause-recommendation-v1",
    athleteId:input.context.athleteId,context:input.context,
    recommendationIds:input.recommendationIds,syncedAt:input.syncedAt,readOnlyComputedState:true});
}
