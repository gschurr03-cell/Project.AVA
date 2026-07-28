import type{z}from"zod";import{cachePolicySchema}from"./contracts";
export type SharedCachePolicy=z.infer<typeof cachePolicySchema>;
export const immutableSnapshotCache=(input:{
  invalidationOwner:string;persistenceMigration:string;offlineCompatible:boolean;
}):SharedCachePolicy=>cachePolicySchema.parse({
  strategy:"immutable_snapshot_active_pointer",appOpenBehavior:"cache_only",
  offlineCompatible:input.offlineCompatible,idempotentFingerprint:true,
  invalidationOwner:input.invalidationOwner,persistenceMigration:input.persistenceMigration,
});
