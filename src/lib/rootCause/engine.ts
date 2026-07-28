import {
  ROOT_CAUSE_ENGINE_VERSION, ROOT_CAUSE_STATE_VERSION, ROOT_CAUSE_TAXONOMY_VERSION,
  rootCauseInputSchema, rootCauseStateSchema, type RootCauseHypothesis,
  type RootCauseInput, type RootCauseState,
} from "./contracts";
import { validateCausalNetwork } from "./graph";
import { ROOT_CAUSE_POLICY as POLICY } from "./policy";
import { confidenceLevel100 } from "@/lib/intelligence/shared/confidence";
import { stableFingerprint } from "@/lib/intelligence/shared/fingerprint";

const clamp=(value:number,low=0,high=1)=>Math.min(high,Math.max(low,value));
const round=(value:number)=>Number(value.toFixed(6));
const unique=(values:string[])=>[...new Set(values)].sort();
const interpretationConfidence=(value:string)=>value==="High"?1:value==="Moderate"?.72:value==="Low"?.42:0;
const requestType=(missing:string)=>{
  const value=missing.toLowerCase();
  if(value.includes("side"))return "side_view_recording" as const;
  if(value.includes("fps")||value.includes("frame"))return "higher_fps_recording" as const;
  if(value.includes("acceleration"))return "additional_acceleration_trial" as const;
  if(value.includes("fly")||value.includes("maximum"))return "additional_fly_sprint" as const;
  if(value.includes("benchmark"))return "benchmark_comparison" as const;
  if(value.includes("tag"))return "manual_tagging" as const;
  if(value.includes("coach"))return "coach_review" as const;
  return "repeated_session" as const;
};

export function evaluateRootCauseIntelligence(rawInput:RootCauseInput):RootCauseState{
  const input=rootCauseInputSchema.parse(rawInput);
  validateCausalNetwork(input.candidates,input.causalEdges);
  const interpretations=new Map([
    ...input.interpretations.interpretations,...input.interpretations.unavailableInterpretations,
    ...input.interpretations.contradictedInterpretations,
  ].map(item=>[item.id,item]));
  const latestActions=new Map(input.coachActions
    .sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.actionId.localeCompare(b.actionId))
    .map(action=>[action.candidateId,action]));
  const hypotheses=input.candidates.sort((a,b)=>a.candidateId.localeCompare(b.candidateId)).map(candidate=>{
    const linked=candidate.linkedInterpretationIds.map(id=>interpretations.get(id)!);
    const weakestInterpretation=Math.min(...linked.map(item=>interpretationConfidence(item.confidence)));
    const supportRatio=clamp(candidate.supportingEvidence.length/
      Math.max(1,candidate.supportingEvidence.length+candidate.contradictingEvidence.length));
    const values={
      interpretationConfidence:{value:weakestInterpretation,ids:linked.map(item=>item.id)},
      measurementQuality:{value:input.measurementQuality,ids:[input.interpretations.analysisId]},
      observationConsistency:{value:candidate.observationConsistency,ids:candidate.supportingEvidence.map(e=>e.evidenceId)},
      digitalTwinMaturity:{value:input.digitalTwin.confidenceScore.score/100,ids:[input.digitalTwin.twinId]},
      historicalStability:{value:candidate.historicalStability,ids:candidate.historicalEvidence.map(e=>e.evidenceId)},
      researchQuality:{value:candidate.researchQuality,ids:candidate.researchEvidence.map(e=>e.evidenceId)},
      benchmarkSimilarity:{value:candidate.benchmarkSimilarity,ids:candidate.benchmarkEvidence.map(e=>e.evidenceId)},
      supportingEvidence:{value:supportRatio,ids:candidate.supportingEvidence.map(e=>e.evidenceId)},
    };
    const components=Object.entries(POLICY.weights).map(([component,weight])=>({
      component,rawValue:round(values[component as keyof typeof values].value),weight,
      weightedValue:round(values[component as keyof typeof values].value*weight),
      sourceIds:values[component as keyof typeof values].ids.sort(),
    }));
    const unknowns=unique([...input.unknownVariables,...input.digitalTwin.unknownVariables,...candidate.unknownVariables]);
    const unknownPenalty=Math.min(POLICY.maximumUnknownPenalty,
      unknowns.length*POLICY.unknownPenaltyPerVariable);
    const contradictionPenalty=candidate.contradictingEvidence.length*POLICY.contradictionPenaltyPerItem;
    const missingPenalty=Math.min(POLICY.maximumMissingPenalty,
      candidate.missingEvidence.length*POLICY.missingEvidencePenaltyPerItem);
    let confidence=components.reduce((sum,item)=>sum+item.weightedValue,0)-
      unknownPenalty-contradictionPenalty-missingPenalty;
    const action=latestActions.get(candidate.candidateId);
    if(action?.action==="confirm")confidence*=POLICY.coachConfirmMultiplier;
    if(action?.action==="upgrade")confidence*=POLICY.coachUpgradeMultiplier;
    if(action?.action==="downgrade")confidence*=POLICY.coachDowngradeMultiplier;
    confidence=round(clamp(confidence));
    const phaseMismatch=!candidate.applicablePhases.includes(input.phase)&&
      !candidate.applicablePhases.includes("unknown");
    if(phaseMismatch)confidence=round(confidence*.7);
    const status:RootCauseHypothesis["status"]=action?.action==="reject"?"coach_rejected":
      action?.action==="confirm"?"coach_confirmed":
      candidate.contradictingEvidence.length&&confidence<POLICY.supportedThreshold?"conflicting":
      confidence>=POLICY.supportedThreshold?"supported_limiter":
      confidence>=POLICY.possibleThreshold?"possible":
      candidate.supportingEvidence.length?"insufficient_evidence":"unknown";
    const explanation=`${candidate.description} is retained as a ${status.replaceAll("_"," ")} hypothesis because ${candidate.supportingEvidence.length} structured item(s) support it and ${candidate.contradictingEvidence.length} contradict it. Confidence is evidence-bounded and does not establish causality.`;
    return {
      hypothesisId:`${ROOT_CAUSE_ENGINE_VERSION}:${candidate.candidateId}`,
      candidateId:candidate.candidateId,limiterKey:candidate.limiterKey,
      description:candidate.description,status,
      supportingEvidence:candidate.supportingEvidence,
      contradictingEvidence:candidate.contradictingEvidence,
      historicalEvidence:candidate.historicalEvidence,
      benchmarkSupport:candidate.benchmarkEvidence,researchSupport:candidate.researchEvidence,
      confidence,confidenceComponents:components,unknownVariables:unknowns,
      missingEvidence:candidate.missingEvidence,explanation,
      invalidationConditions:[
        "New validated interpretation contradicts or supports this hypothesis",
        "Measurement correction changes evidence quality","Coach feedback changes",
        "Research or benchmark applicability changes",
      ],
      unknownPenalty,
    };
  });
  const ranked=[...hypotheses].sort((a,b)=>b.confidence-a.confidence||
    a.candidateId.localeCompare(b.candidateId));
  const total=ranked.reduce((sum,item)=>sum+item.confidence,0);
  const requiredEvidence=ranked.flatMap(h=>h.confidence<POLICY.evidenceRequestThreshold
    ? unique(h.missingEvidence.length?h.missingEvidence:["coach review"]).map((missing,index)=>({
      requestId:`${h.hypothesisId}:evidence:${index}`,candidateId:h.candidateId,
      type:requestType(missing),reason:`Additional structured evidence is required: ${missing}.`,
      resolvesUnknowns:[missing],priority:h.confidence<.3?"high" as const:
        h.confidence<.5?"moderate" as const:"low" as const,isRecommendation:false as const,
    })):[]);
  const topConfidence=ranked[0]?.confidence??0;
  const limitingFactors=unique([
    ...input.unknownVariables,
    ...(input.measurementQuality<.55?["Measurement quality is inadequate for strong root-cause confidence."]:[]),
    ...(!ranked.length?["No root cause is currently identifiable."]:[]),
    ...(ranked.some(item=>item.status==="conflicting")?["Structured evidence conflicts across one or more hypotheses."]:[]),
  ]);
  const level=confidenceLevel100(topConfidence*100);
  const hypothesisByLimiter=new Map(ranked.map(item=>[item.limiterKey,item]));
  const inputFingerprint=stableFingerprint({
    ...input,candidates:[...input.candidates].sort((a,b)=>a.candidateId.localeCompare(b.candidateId)),
    causalEdges:[...input.causalEdges].sort((a,b)=>a.edgeId.localeCompare(b.edgeId)),
    coachActions:[...input.coachActions].sort((a,b)=>a.actionId.localeCompare(b.actionId)),
    engineVersion:ROOT_CAUSE_ENGINE_VERSION,
  });
  return rootCauseStateSchema.parse({
    rootCauseStateId:input.rootCauseStateId,athleteId:input.athleteId,
    engineVersion:ROOT_CAUSE_ENGINE_VERSION,stateVersion:ROOT_CAUSE_STATE_VERSION,
    taxonomyVersion:ROOT_CAUSE_TAXONOMY_VERSION,generatedAt:input.generatedAt,inputFingerprint,
    rootCauseHypotheses:ranked,
    confirmedLimiters:ranked.filter(item=>["supported_limiter","coach_confirmed"].includes(item.status)),
    possibleLimiters:ranked.filter(item=>["possible","conflicting","insufficient_evidence","unknown"].includes(item.status)),
    secondarySymptoms:input.interpretations.interpretations.map(interpretation=>{
      const linked=ranked.filter(item=>input.candidates.find(c=>c.candidateId===item.candidateId)!
        .linkedInterpretationIds.includes(interpretation.id));
      return {interpretationId:interpretation.id,
        relationship:linked.length?(linked[0]===ranked[0]?"primary_symptom":"secondary_symptom"):"independent_finding",
        linkedHypothesisIds:linked.map(item=>item.hypothesisId),
        reason:linked.length?"Explicitly linked by validated root-cause input.":"No supported relationship was supplied."};
    }),
    downstreamConsequences:input.causalEdges.filter(edge=>edge.relationship==="possible_downstream")
      .map(edge=>({sourceLimiter:edge.sourceLimiter,targetLimiter:edge.targetLimiter,
        edgeId:edge.edgeId,confidence:round(Math.min(edge.confidence,
          hypothesisByLimiter.get(edge.sourceLimiter)?.confidence??0))})),
    dependencyNetwork:input.causalEdges,
    competingHypotheses:ranked.map((item,index)=>({hypothesisId:item.hypothesisId,
      rank:index+1,relativeSupport:round(total?item.confidence/total:0)})),
    confidence:{score:Math.round(topConfidence*100),level,limitingFactors},
    unknownVariables:unique([...input.unknownVariables,...ranked.flatMap(item=>item.unknownVariables)]),
    requiredEvidence,
    supportingResearch:uniqueEvidence(ranked.flatMap(item=>item.researchSupport)),
    supportingBenchmarks:uniqueEvidence(ranked.flatMap(item=>item.benchmarkSupport)),
    historicalSupport:uniqueEvidence(ranked.flatMap(item=>item.historicalEvidence)),
    coachOverrides:input.coachActions,
    trace:ranked.map(item=>({
      candidateId:item.candidateId,ruleVersion:"ava-root-cause-hypothesis-rule-v1",
      interpretationIds:input.candidates.find(c=>c.candidateId===item.candidateId)!.linkedInterpretationIds,
      evidenceIds:unique([...item.supportingEvidence,...item.contradictingEvidence].map(e=>e.evidenceId)),
      confidenceComponents:item.confidenceComponents,
      unknownPenalty:hypotheses.find(h=>h.candidateId===item.candidateId)!.unknownPenalty,
      finalConfidence:item.confidence,finalStatus:item.status,
    })),
    invalidationContext:{
      twinUpdatedAt:input.digitalTwin.updatedAt,
      interpretationInputHash:input.interpretations.inputHash,
      observationHistoryVersion:input.observationHistoryVersion,
      interpretationHistoryVersion:input.interpretationHistoryVersion,
      researchVersion:input.researchVersion,benchmarkVersion:input.benchmarkVersion,
      projectionVersion:input.projectionVersion,
      coachActionIds:input.coachActions.map(item=>item.actionId).sort(),
    },
    computePolicy:{evaluatedOn:"server",servedFromCache:true,offlineCompatible:true,
      externalModelCalls:0,deterministic:true},
  });
}

function uniqueEvidence<T extends {evidenceId:string}>(items:T[]):T[]{
  return [...new Map(items.map(item=>[item.evidenceId,item])).values()]
    .sort((a,b)=>a.evidenceId.localeCompare(b.evidenceId));
}
