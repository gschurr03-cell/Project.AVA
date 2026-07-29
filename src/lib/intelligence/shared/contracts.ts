import{z}from"zod";
export const engineLifecycleSchema=z.enum([
  "development","shadow","advisory","production","deprecated",
]);
export const engineStatusSchema=z.enum(["active","feature_gated","internal","deprecated"]);
export const cachePolicySchema=z.object({
  strategy:z.enum(["none","immutable_snapshot_active_pointer","versioned_dataset","derived_result"]),
  appOpenBehavior:z.enum(["cache_only","not_applicable"]),
  offlineCompatible:z.boolean(),idempotentFingerprint:z.boolean(),
  invalidationOwner:z.string(),persistenceMigration:z.string().nullable(),
});
export const contractMetadataSchema=z.object({
  inputContract:z.string(),outputContract:z.string(),
  versioned:z.literal(true),stronglyTyped:z.literal(true),serializable:z.literal(true),
  immutableOutput:z.boolean(),cacheCompatible:z.boolean(),offlineCompatible:z.boolean(),
  futureCompatibility:z.enum(["additive_versioned","version_locked","registry_versioned"]),
});
export const engineRegistryEntrySchema=z.object({
  engineId:z.string(),displayName:z.string(),engineVersion:z.string(),
  status:engineStatusSchema,lifecycle:engineLifecycleSchema,
  dependencies:z.array(z.string()),pipelinePredecessor:z.string().nullable(),
  contract:contractMetadataSchema,cachePolicy:cachePolicySchema,
  featureFlags:z.array(z.string()),documentation:z.array(z.string()).min(1),
  dashboard:z.string().nullable(),tests:z.array(z.string()).min(1),owner:z.string(),
});
export type EngineRegistryEntry=z.infer<typeof engineRegistryEntrySchema>;
export const sharedTraceEnvelopeSchema=z.object({
  engineId:z.string(),engineVersion:z.string(),generatedAt:z.string().datetime(),
  inputFingerprint:z.string(),rulesEvaluated:z.array(z.string()),
  confidence:z.unknown(),unknowns:z.array(z.string()),evidenceIds:z.array(z.string()),
  provenance:z.record(z.unknown()),entries:z.array(z.unknown()),
});
export const sharedComputePolicySchema=z.object({
  evaluatedOn:z.literal("server"),servedFromCache:z.boolean(),
  offlineCompatible:z.boolean(),externalModelCalls:z.literal(0),deterministic:z.literal(true),
});
export const sharedProvenanceSchema=z.object({
  engineId:z.string(),engineVersion:z.string(),inputFingerprint:z.string(),
  sourceVersions:z.record(z.string().nullable()),sourceIds:z.array(z.string()),
});
