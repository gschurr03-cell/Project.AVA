import { z } from "zod";

export const SCIENTIFIC_VALIDATION_VERSION="ava-scientific-validation-v1";
export const metricValidationClassSchema=z.enum(["direct_timing_measurement","spatial_measurement","temporal_estimate",
  "kinematic_estimate","derived_performance_metric","comparative_metric","heuristic_classification",
  "interpretive_coaching_output","predictive_output"]);
export const validationStatusSchema=z.enum(["directly_validated","indirectly_validated","fixture_validated",
  "manually_spot_checked","coach_reviewed","partially_validated","unvalidated","unsupported","hidden","production_gated"]);
export const metricVisibilitySchema=z.enum(["production_visible","visible_with_confidence_warning","coach_only","beta_only",
  "experimental","hidden","removed"]);
export const metricValidationEntrySchema=z.object({
  metricId:z.string().min(1),displayName:z.string().min(1),validationClass:metricValidationClassSchema,
  definition:z.string().min(1),unit:z.string().min(1),computation:z.string().min(1),dependencies:z.array(z.string()),
  requiredConditions:z.array(z.string()).min(1),supportedFps:z.array(z.enum(["60_class","120","240"])),
  expectedError:z.string(),confidencePolicy:z.string().min(1),referenceMethod:z.string().min(1),
  validationStatus:validationStatusSchema,defaultVisibility:metricVisibilitySchema,
  minimumConfidence:z.number().min(0).max(1).nullable(),manualReviewTriggers:z.array(z.string()),
  limitations:z.array(z.string()),registryVersion:z.literal(SCIENTIFIC_VALIDATION_VERSION),
}).strict();
export type MetricValidationEntry=z.infer<typeof metricValidationEntrySchema>;

export const validationDatasetItemSchema=z.object({
  itemId:z.string().min(1),split:z.enum(["development","calibration","validation","locked_holdout","adversarial","unsupported"]),
  sourceArtifact:z.string().min(1),sourceCommitted:z.boolean(),checksumSha256:z.string().regex(/^[a-f0-9]{64}$/),
  consentStatus:z.enum(["verified_validation_only","verified_research","unknown","withdrawn"]),
  anonymizedAthleteId:z.string().min(1),device:z.string().nullable(),nativeFps:z.number().positive(),
  resolution:z.object({width:z.number().int().positive(),height:z.number().int().positive()}),
  recordingContext:z.array(z.string()),referenceSystem:z.string().nullable(),referenceResult:z.record(z.unknown()).nullable(),
  inclusionStatus:z.enum(["included","excluded","quarantined"]),exclusionReason:z.string().nullable(),
  holdoutLabelsRestricted:z.boolean(),
}).strict();
export const validationDatasetManifestSchema=z.object({
  schemaVersion:z.literal(SCIENTIFIC_VALIDATION_VERSION),datasetId:z.string().min(1),datasetVersion:z.string().min(1),
  createdAt:z.string().datetime(),locked:z.boolean(),items:z.array(validationDatasetItemSchema),
  leakageEvents:z.array(z.object({itemId:z.string(),occurredAt:z.string().datetime(),reason:z.string()})),
}).strict().superRefine((manifest,ctx)=>{
  const ids=new Set<string>();
  for(const item of manifest.items){
    if(ids.has(item.itemId))ctx.addIssue({code:"custom",message:`duplicate_item:${item.itemId}`});ids.add(item.itemId);
    if(item.split==="locked_holdout"&&!item.holdoutLabelsRestricted)
      ctx.addIssue({code:"custom",message:`holdout_labels_not_restricted:${item.itemId}`});
    if(item.consentStatus==="unknown"&&item.inclusionStatus==="included")
      ctx.addIssue({code:"custom",message:`unknown_consent_cannot_be_included:${item.itemId}`});
  }
});

