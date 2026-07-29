import { RECOMMENDATION_LIBRARY, type RecommendationLibraryItem } from "@/lib/intelligence/recommendationEngine";
import { ROOT_CAUSE_LIBRARY } from "@/lib/rootCause";
import {
  ROOT_CAUSE_RECOMMENDATION_MAPPING_VERSION, mappingEntrySchema,
  type MappingEntry,
} from "./contracts";
import { ADAPTER_TEMPLATES } from "./templates";

const reviewedAt="2026-07-17T00:00:00.000Z";
const mapping=(value:Pick<MappingEntry,"mappingId"|"rootCauseLimiterKey"|
  "recommendationCatalogEntryId"|"relationshipType"|"explanationTemplateKey">&
  Partial<MappingEntry>):MappingEntry=>mappingEntrySchema.parse({
  mappingVersion:ROOT_CAUSE_RECOMMENDATION_MAPPING_VERSION,
  requiredRootCauseConfidence:.6,requiredMappingConfidence:.7,mappingConfidence:.78,
  requiredEvidenceQuality:"limited",allowedRolloutModes:["SHADOW"],
  maximumPositiveModifier:.04,maximumNegativeModifier:-.03,
  seasonApplicability:["any"],competitionApplicability:["any"],
  athleteStageApplicability:["any"],eventApplicability:["any"],contraindications:[],
  requiredSupportingEvidenceTypes:["interpretation"],
  disallowedUnknownStates:["measurement_quality_inadequate"],
  status:"SHADOW_VALIDATED",reviewedBy:"ava-internal-review",reviewedAt,
  effectiveFrom:reviewedAt,deprecatedAt:null,
  notes:["Initial mapping is shadow-only pending catalog-level validation."],...value,
});
export const ROOT_CAUSE_RECOMMENDATION_MAPPINGS:MappingEntry[]=[
  mapping({mappingId:"posture-to-awareness-v1",rootCauseLimiterKey:"posture",
    recommendationCatalogEntryId:"posture_awareness",relationshipType:"ROOT_CAUSE_TARGET",
    explanationTemplateKey:"ROOT_CAUSE_CONTEXT"}),
  mapping({mappingId:"posture-to-monitor-v1",rootCauseLimiterKey:"posture",
    recommendationCatalogEntryId:"monitor_posture",relationshipType:"SYMPTOM_MANAGEMENT",
    explanationTemplateKey:"SYMPTOM_CONTEXT"}),
  mapping({mappingId:"posture-to-preserve-v1",rootCauseLimiterKey:"posture",
    recommendationCatalogEntryId:"preserve_torso",relationshipType:"MAINTENANCE_SUPPORT",
    explanationTemplateKey:"ROOT_CAUSE_CONTEXT"}),
  mapping({mappingId:"front-side-to-awareness-v1",rootCauseLimiterKey:"front_side_organization",
    recommendationCatalogEntryId:"front_side_awareness",relationshipType:"ROOT_CAUSE_TARGET",
    explanationTemplateKey:"ROOT_CAUSE_CONTEXT"}),
  mapping({mappingId:"front-side-to-reconfirm-v1",rootCauseLimiterKey:"front_side_organization",
    recommendationCatalogEntryId:"reconfirm_front_side",relationshipType:"MONITORING_ONLY",
    explanationTemplateKey:"LOW_CONFIDENCE_CONTEXT"}),
  mapping({mappingId:"rhythm-to-cadence-v1",rootCauseLimiterKey:"stride_rhythm",
    recommendationCatalogEntryId:"monitor_cadence",relationshipType:"SYMPTOM_MANAGEMENT",
    explanationTemplateKey:"SYMPTOM_CONTEXT"}),
  mapping({mappingId:"symmetry-to-monitor-v1",rootCauseLimiterKey:"symmetry",
    recommendationCatalogEntryId:"monitor_asymmetry",relationshipType:"SYMPTOM_MANAGEMENT",
    explanationTemplateKey:"SYMPTOM_CONTEXT"}),
  mapping({mappingId:"symmetry-to-review-v1",rootCauseLimiterKey:"symmetry",
    recommendationCatalogEntryId:"coach_asymmetry_review",relationshipType:"MONITORING_ONLY",
    explanationTemplateKey:"LOW_CONFIDENCE_CONTEXT"}),
];

export function validateMappingRegistry(registry:MappingEntry[],
  catalog:RecommendationLibraryItem[]=RECOMMENDATION_LIBRARY):string[]{
  const errors:string[]=[],ids=new Set<string>(),catalogById=new Map(catalog.map(x=>[x.libraryItemId,x]));
  const limiterKeys=new Set(ROOT_CAUSE_LIBRARY.map(x=>x.key));
  for(const raw of registry){
    const parsed=mappingEntrySchema.safeParse(raw);
    if(!parsed.success){errors.push(`Invalid mapping contract: ${raw.mappingId??"unknown"}`);continue}
    const entry=parsed.data;
    if(ids.has(entry.mappingId))errors.push(`Duplicate mapping ID: ${entry.mappingId}`);ids.add(entry.mappingId);
    const item=catalogById.get(entry.recommendationCatalogEntryId);
    if(!item)errors.push(`Missing catalog entry: ${entry.recommendationCatalogEntryId}`);
    else if(!item.enabled)errors.push(`Disabled catalog entry is actively mapped: ${entry.recommendationCatalogEntryId}`);
    if(!limiterKeys.has(entry.rootCauseLimiterKey))errors.push(`Unsupported limiter: ${entry.rootCauseLimiterKey}`);
    if(!(entry.explanationTemplateKey in ADAPTER_TEMPLATES))
      errors.push(`Missing explanation template: ${entry.explanationTemplateKey}`);
    if(entry.maximumNegativeModifier>0||entry.maximumPositiveModifier<0)
      errors.push(`Invalid modifier bounds: ${entry.mappingId}`);
    if(entry.status==="DEPRECATED"&&!entry.deprecatedAt)
      errors.push(`Deprecated mapping lacks timestamp: ${entry.mappingId}`);
    if(entry.status==="BOUNDED_INFLUENCE_APPROVED"&&
      !entry.allowedRolloutModes.includes("BOUNDED_INFLUENCE"))
      errors.push(`Bounded mapping lacks bounded rollout permission: ${entry.mappingId}`);
  }
  return errors.sort();
}
