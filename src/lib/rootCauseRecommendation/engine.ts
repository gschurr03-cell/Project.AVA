import type { Recommendation,RecommendationResult } from "@/lib/intelligence/recommendationEngine";
import {
  ROOT_CAUSE_RECOMMENDATION_ADAPTER_VERSION,ROOT_CAUSE_RECOMMENDATION_CONTEXT_VERSION,
  ROOT_CAUSE_RECOMMENDATION_MAPPING_VERSION,adapterContextSchema,adapterInputSchema,
  type MappingEntry,type RootCauseRecommendationAdapterInput,
  type RootCauseRecommendationContext,type RootCauseRecommendationContextItem,
}from"./contracts";
import{ADAPTER_POLICY as POLICY}from"./policy";
import{ROOT_CAUSE_RECOMMENDATION_MAPPINGS,validateMappingRegistry}from"./registry";
import{ADAPTER_TEMPLATES}from"./templates";
import{stableFingerprint}from"@/lib/intelligence/shared/fingerprint";
import{renderDeterministicTemplate}from"@/lib/intelligence/shared/explanations";

const round=(v:number)=>Number(v.toFixed(6)),clamp=(v:number,l:number,h:number)=>Math.min(h,Math.max(l,v));
const unique=(v:string[])=>[...new Set(v)].sort();
const allRecommendations=(result:RecommendationResult)=>[
  ...result.recommendations,...result.preserveRecommendations,...result.monitoringRecommendations,
  ...result.unavailableRecommendations,...result.suppressedRecommendations,
];
const protectedRecommendation=(item:Recommendation)=>POLICY.protectedActionTypes.includes(item.actionType)||
  item.stopConditions.length>0||item.contraindicationNotes.length>0;
const statusAllows=(status:MappingEntry["status"],mode:string)=>
  mode==="SHADOW"?["SHADOW_VALIDATED","ADVISORY_APPROVED","BOUNDED_INFLUENCE_APPROVED"].includes(status):
  mode==="ADVISORY"?["ADVISORY_APPROVED","BOUNDED_INFLUENCE_APPROVED"].includes(status):
  mode==="BOUNDED_INFLUENCE"?status==="BOUNDED_INFLUENCE_APPROVED":false;

export function evaluateRootCauseRecommendationAdapter(
  rawInput:RootCauseRecommendationAdapterInput,
  registry:MappingEntry[]=ROOT_CAUSE_RECOMMENDATION_MAPPINGS,
):RootCauseRecommendationContext{
  const input=adapterInputSchema.parse(rawInput),registryErrors=validateMappingRegistry(registry);
  const mode=input.featureFlags.enabled?input.rolloutMode:"OFF";
  const recommendations=allRecommendations(input.baselineRecommendationResult);
  const eligible=new Map(recommendations.filter(item=>!["suppressed","unavailable","contradicted"].includes(item.status))
    .map(item=>[item.libraryItemId,item]));
  const allByCatalog=new Map(recommendations.map(item=>[item.libraryItemId,item]));
  const hypotheses=input.rootCauseState.rootCauseHypotheses;
  const decisions:RootCauseRecommendationContext["candidateMappings"]=[];
  const traces:RootCauseRecommendationContext["trace"]=[];
  const contexts:RootCauseRecommendationContextItem[]=[];
  const failClosed=registryErrors.length>0;
  const sharedEvidence=new Set<string>();
  if(mode!=="OFF"&&!failClosed)for(const hypothesis of hypotheses){
    const mappings=registry.filter(entry=>entry.rootCauseLimiterKey===hypothesis.limiterKey&&
      !["DRAFT","DEPRECATED","DISABLED"].includes(entry.status));
    for(const mapping of mappings){
      const recommendation=allByCatalog.get(mapping.recommendationCatalogEntryId)??null;
      const eligibleRecommendation=eligible.get(mapping.recommendationCatalogEntryId)??null;
      const unknownBurden=clamp(hypothesis.unknownVariables.length/Math.max(1,
        hypothesis.unknownVariables.length+hypothesis.supportingEvidence.length),0,1);
      const contradictionBurden=clamp(hypothesis.contradictingEvidence.length/Math.max(1,
        hypothesis.contradictingEvidence.length+hypothesis.supportingEvidence.length),0,1);
      const evidenceIds=hypothesis.supportingEvidence.map(e=>e.evidenceId).sort();
      const included=evidenceIds.filter(id=>!sharedEvidence.has(`${mapping.mappingId}:${recommendation?.id}:${id}`));
      const excluded=evidenceIds.filter(id=>!included.includes(id));
      included.forEach(id=>sharedEvidence.add(`${mapping.mappingId}:${recommendation?.id}:${id}`));
      const evidenceStrength=clamp(included.length/Math.max(1,evidenceIds.length),0,1);
      const components=[
        ["rootCauseConfidence",hypothesis.confidence,mapping.requiredRootCauseConfidence,[hypothesis.hypothesisId]],
        ["mappingConfidence",mapping.mappingConfidence,mapping.requiredMappingConfidence,[mapping.mappingId]],
        ["measurementQuality",input.measurementQuality,POLICY.minimumMeasurementQuality,[input.analysisId]],
        ["digitalTwinMaturity",input.digitalTwinReference.confidenceScore.score/100,0,[input.digitalTwinReference.twinId]],
        ["evidenceStrength",evidenceStrength,0,included],
        ["historicalStability",hypothesis.confidenceComponents.find(x=>x.component==="historicalStability")?.rawValue??0,0,hypothesis.historicalEvidence.map(e=>e.evidenceId)],
        ["contradictionAllowance",1-contradictionBurden,1-POLICY.maximumContradictionBurden,hypothesis.contradictingEvidence.map(e=>e.evidenceId)],
        ["unknownAllowance",1-unknownBurden,1-POLICY.maximumUnknownBurden,hypothesis.unknownVariables],
      ].map(([component,value,threshold,sourceIds])=>({component:component as string,
        value:round(value as number),threshold:threshold as number,
        passed:(value as number)>=(threshold as number),sourceIds:sourceIds as string[]}));
      const action=input.rootCauseState.coachOverrides.filter(x=>x.candidateId===hypothesis.candidateId)
        .sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
      const coachMultiplier=action?POLICY.coachModifier[action.action]:1;
      const statusApproved=statusAllows(mapping.status,mode);
      const applicability=(mapping.seasonApplicability.includes("any")||
        mapping.seasonApplicability.includes(input.seasonContext.stage))&&
        (mapping.competitionApplicability.includes("any")||
          mapping.competitionApplicability.includes(input.competitionContext.phase))&&
        (mapping.athleteStageApplicability.includes("any")||
          mapping.athleteStageApplicability.includes(input.athleteProfile.stage))&&
        (mapping.eventApplicability.includes("any")||
          (input.athleteProfile.event!=null&&mapping.eventApplicability.includes(input.athleteProfile.event)));
      const ambiguous=registry.filter(x=>x.rootCauseLimiterKey===mapping.rootCauseLimiterKey&&
        x.recommendationCatalogEntryId===mapping.recommendationCatalogEntryId&&x.mappingId!==mapping.mappingId).length>0;
      const safetyChecks=[
        recommendation?"Catalog recommendation exists.":"Catalog recommendation is not in baseline output.",
        eligibleRecommendation?"Recommendation was already eligible.":"Adapter cannot create eligibility.",
        recommendation&&protectedRecommendation(recommendation)?"Protected baseline fields remain authoritative.":"Baseline safety remains authoritative.",
        action?.action==="reject"?"Coach rejection blocks positive influence.":"No coach rejection blocks context.",
      ];
      const gatePass=components.every(x=>x.passed)&&statusApproved&&applicability&&!ambiguous&&
        action?.action!=="reject"&&mapping.disallowedUnknownStates.every(x=>!hypothesis.unknownVariables.includes(x));
      const signed=mapping.relationshipType==="CONFLICTING_RELATIONSHIP"?-1:1;
      const raw=round(signed*((hypothesis.confidence+mapping.mappingConfidence+evidenceStrength+
        input.digitalTwinReference.confidenceScore.score/100)/4-.5)*.2*coachMultiplier);
      const mappingClamped=round(clamp(raw,mapping.maximumNegativeModifier,mapping.maximumPositiveModifier));
      const globalClamped=round(clamp(mappingClamped,POLICY.globalMaximumNegativeModifier,
        POLICY.globalMaximumPositiveModifier));
      const canApply=mode==="BOUNDED_INFLUENCE"&&gatePass&&eligibleRecommendation!=null;
      const applied=canApply?globalClamped:0;
      const relationship=hypothesis.status==="conflicting"?"CONFLICTING_RELATIONSHIP":
        ambiguous?"UNKNOWN":mapping.relationshipType;
      const accepted=statusApproved&&recommendation!=null&&applicability;
      const reason=!recommendation?"Mapping catalog entry is absent from the baseline result.":
        !statusApproved?"Mapping status is not approved for the active rollout mode.":
        ambiguous?"Mapping is ambiguous; positive influence is withheld.":
        !eligibleRecommendation?"Recommendation is not eligible; influence is prohibited.":
        !gatePass?"One or more confidence or safety gates failed.":
        canApply?"Bounded influence passed all gates and clamps.":"Context only; baseline behavior is unchanged.";
      const decision={mappingId:mapping.mappingId,hypothesisId:hypothesis.hypothesisId,
        recommendationId:recommendation?.id??null,accepted,reason,relationshipType:relationship,
        confidenceComponents:components,includedEvidenceIds:included,excludedEvidenceIds:excluded,
        proposedModifier:raw,mappingClampedModifier:mappingClamped,
        globalClampedModifier:globalClamped,appliedModifier:applied,
        safetyChecks,ambiguous};
      decisions.push(decision);
      const traceId=`${ROOT_CAUSE_RECOMMENDATION_ADAPTER_VERSION}:${mapping.mappingId}:${hypothesis.hypothesisId}`;
      traces.push({traceId,mappingId:mapping.mappingId,hypothesisId:hypothesis.hypothesisId,
        recommendationId:recommendation?.id??null,mappingStatus:mapping.status,
        confidenceComponents:components,thresholdsEvaluated:components.map(x=>`${x.component}:${x.passed}`),
        evidenceIncluded:included,evidenceExcluded:excluded,
        contradictions:hypothesis.contradictingEvidence.map(e=>e.evidenceId),
        unknowns:hypothesis.unknownVariables,proposedModifier:raw,appliedModifier:applied,
        clampBehavior:[`mapping=${mappingClamped}`,`global=${globalClamped}`],
        safetyChecks,rolloutMode:mode});
      if(accepted&&recommendation){
        const existing=contexts.find(x=>x.recommendationId===recommendation.id);
        const wording=renderDeterministicTemplate(ADAPTER_TEMPLATES,mode==="SHADOW"?"SHADOW_ONLY_CONTEXT":
          hypothesis.status==="conflicting"?"CONFLICTING_EVIDENCE_CONTEXT":
            mapping.explanationTemplateKey,{limiter:hypothesis.limiterKey.replaceAll("_"," "),
              relationship:mapping.relationshipType});
        if(existing){
          existing.rootCauseHypothesisIds=unique([...existing.rootCauseHypothesisIds,hypothesis.hypothesisId]);
          existing.limiterKeys=[...new Set([...existing.limiterKeys,hypothesis.limiterKey])];
          existing.supportingEvidenceIds=unique([...existing.supportingEvidenceIds,...included]);
          existing.contradictingEvidenceIds=unique([...existing.contradictingEvidenceIds,
            ...hypothesis.contradictingEvidence.map(e=>e.evidenceId)]);
          existing.competingHypotheses=unique([...existing.competingHypotheses,hypothesis.hypothesisId]);
          existing.proposedRelevanceModifier=round(clamp(existing.proposedRelevanceModifier+raw,-.2,.2));
          existing.appliedRelevanceModifier=round(clamp(existing.appliedRelevanceModifier+applied,
            POLICY.globalMaximumNegativeModifier,POLICY.globalMaximumPositiveModifier));
          existing.traceIds.push(traceId);
        }else contexts.push({
          recommendationId:recommendation.id,catalogEntryId:recommendation.libraryItemId,
          relationshipType:relationship,rootCauseHypothesisIds:[hypothesis.hypothesisId],
          limiterKeys:[hypothesis.limiterKey],supportingEvidenceIds:included,
          contradictingEvidenceIds:hypothesis.contradictingEvidence.map(e=>e.evidenceId),
          rootCauseConfidence:hypothesis.confidence,mappingConfidence:mapping.mappingConfidence,
          combinedContextConfidence:round(Math.min(hypothesis.confidence,mapping.mappingConfidence,
            input.measurementQuality)),competingHypotheses:input.rootCauseState.competingHypotheses
            .map(x=>x.hypothesisId).filter(x=>x!==hypothesis.hypothesisId),
          unknownVariables:hypothesis.unknownVariables,
          evidenceRequests:input.rootCauseState.requiredEvidence.filter(x=>x.candidateId===hypothesis.candidateId),
          proposedRelevanceModifier:raw,appliedRelevanceModifier:applied,influenceReason:reason,
          rolloutMode:mode,wordingContext:wording,
          safetyStatus:protectedRecommendation(recommendation)?"protected":
            canApply?"influence_allowed":"baseline_authoritative",
          traceIds:[traceId],modifierAlreadyApplied:applied!==0,
        });
      }
    }
  }
  const baselineIds=recommendations.map(x=>x.id),baselineScores=Object.fromEntries(baselineIds.map(id=>[id,0]));
  const proposedScores=Object.fromEntries(baselineIds.map(id=>[id,
    contexts.find(x=>x.recommendationId===id)?.proposedRelevanceModifier??0]));
  const appliedInfluence=Object.fromEntries(contexts.map(x=>[x.recommendationId,x.appliedRelevanceModifier]));
  const proposedInfluence=Object.fromEntries(contexts.map(x=>[x.recommendationId,x.proposedRelevanceModifier]));
  const fingerprint=stableFingerprint({athleteId:input.athleteId,analysisId:input.analysisId,
    rootCauseFingerprint:input.rootCauseState.inputFingerprint,
    recommendationInputHash:input.baselineRecommendationResult.inputHash,
    catalogVersion:input.recommendationCatalogVersion,registryVersion:input.mappingRegistryVersion,
    adapterVersion:input.adapterVersion,rolloutMode:mode,season:input.seasonContext,
    competition:input.competitionContext,athleteProfile:input.athleteProfile,
    featureFlags:input.featureFlags,registry});
  const state={
    contextId:`${ROOT_CAUSE_RECOMMENDATION_ADAPTER_VERSION}:${fingerprint}`,
    athleteId:input.athleteId,analysisId:input.analysisId,
    adapterVersion:ROOT_CAUSE_RECOMMENDATION_ADAPTER_VERSION,
    contextVersion:ROOT_CAUSE_RECOMMENDATION_CONTEXT_VERSION,
    mappingRegistryVersion:ROOT_CAUSE_RECOMMENDATION_MAPPING_VERSION,
    rolloutMode:mode,generatedAt:input.generatedAt,
    rootCauseStateId:input.rootCauseState.rootCauseStateId,
    recommendationCatalogVersion:input.recommendationCatalogVersion,
    candidateMappings:decisions,appliedMappings:decisions.filter(x=>x.appliedModifier!==0),
    rejectedMappings:decisions.filter(x=>!x.accepted),
    unmappedHypotheses:hypotheses.filter(h=>!registry.some(m=>m.rootCauseLimiterKey===h.limiterKey))
      .map(h=>h.hypothesisId),ambiguousMappings:decisions.filter(x=>x.ambiguous),
    recommendationContexts:contexts,proposedInfluence,appliedInfluence,
    competingHypotheses:input.rootCauseState.competingHypotheses.map(x=>x.hypothesisId),
    unknownVariables:input.rootCauseState.unknownVariables,
    evidenceRequests:input.rootCauseState.requiredEvidence,
    safetyDecisions:unique(decisions.flatMap(x=>x.safetyChecks)),trace:traces,
    provenance:{rootCauseFingerprint:input.rootCauseState.inputFingerprint,
      recommendationInputHash:input.baselineRecommendationResult.inputHash,
      digitalTwinUpdatedAt:input.digitalTwinReference.updatedAt,
      researchVersion:input.sourceProvenance.researchVersion,
      benchmarkVersion:input.sourceProvenance.benchmarkVersion,
      recommendationOverrideIds:input.sourceProvenance.recommendationOverrideIds,
      modifierConsumer:"root_cause_recommendation_adapter",downstreamReapplicationAllowed:false},
    invalidationFingerprint:fingerprint,
    shadowComparison:mode==="SHADOW"?{
      comparisonId:`shadow:${fingerprint}`,athleteId:input.athleteId,analysisId:input.analysisId,
      baselineRecommendationIds:baselineIds,baselineScores,proposedRecommendationIds:baselineIds,
      proposedScores,scoreDeltas:proposedScores,
      contextDifferences:contexts.map(x=>`${x.recommendationId}:${x.relationshipType}`),
      mappingIds:decisions.map(x=>x.mappingId),hypothesisIds:decisions.map(x=>x.hypothesisId),
      safetyDifferences:[],orderingDifferences:[],generatedAt:input.generatedAt,
      adapterVersion:ROOT_CAUSE_RECOMMENDATION_ADAPTER_VERSION,
      mappingRegistryVersion:ROOT_CAUSE_RECOMMENDATION_MAPPING_VERSION}:null,
    failClosed,failClosedReasons:registryErrors,
    computePolicy:{evaluatedOn:"server",servedFromCache:true,offlineCompatible:true,
      externalModelCalls:0,deterministic:true},
  };
  return adapterContextSchema.parse(state);
}

export function attachRootCauseContext(input:{
  baseline:RecommendationResult;context:RootCauseRecommendationContext;
}):RecommendationResult{
  if(!["ADVISORY","BOUNDED_INFLUENCE"].includes(input.context.rolloutMode)||
    input.context.failClosed)return input.baseline;
  const byId=new Map(input.context.recommendationContexts.map(x=>[x.recommendationId,x]));
  const attach=(items:Recommendation[])=>items.map(item=>{
    const context=byId.get(item.id);return context?{...item,rootCauseContext:context}:item;
  });
  return{...input.baseline,recommendations:attach(input.baseline.recommendations),
    preserveRecommendations:attach(input.baseline.preserveRecommendations),
    monitoringRecommendations:attach(input.baseline.monitoringRecommendations),
    unavailableRecommendations:input.baseline.unavailableRecommendations,
    suppressedRecommendations:input.baseline.suppressedRecommendations};
}

export function runRootCauseRecommendationIntegration(input:{
  adapterInput:RootCauseRecommendationAdapterInput;baseline:RecommendationResult;
  registry?:MappingEntry[];
}):{recommendationResult:RecommendationResult;context:RootCauseRecommendationContext|null;
  failClosed:boolean;reason:string|null}{
  try{
    const context=evaluateRootCauseRecommendationAdapter(input.adapterInput,input.registry);
    return{recommendationResult:attachRootCauseContext({baseline:input.baseline,context}),
      context,failClosed:context.failClosed,
      reason:context.failClosed?context.failClosedReasons.join(" "):null};
  }catch{
    return{recommendationResult:input.baseline,context:null,failClosed:true,
      reason:"Adapter validation or runtime failure; baseline RecommendationResult preserved."};
  }
}
