import type { LongitudinalTrainingState, SessionCompletion, TrainingEvent } from "./longitudinal";

export type ComparabilityResult={classification:"comparable"|"partially_comparable"|"noncomparable"|"insufficient_information";reasonCodes:string[];confidence:number};
export function evaluateComparability(a:Record<string,unknown>,b:Record<string,unknown>):ComparabilityResult{
  const required=["sessionType","protocolVersion","measurementMethod","engineVersion"];
  if(required.some(key=>a[key]==null||b[key]==null))return{classification:"insufficient_information",reasonCodes:["missing_required_comparison_metadata"],confidence:.2};
  const hard=["sessionType","protocolVersion","measurementMethod","engineVersion","restrictionState"];
  const hardMismatch=hard.filter(key=>a[key]!=null&&b[key]!=null&&a[key]!==b[key]);
  if(hardMismatch.length)return{classification:"noncomparable",reasonCodes:hardMismatch.map(x=>`${x}_mismatch`),confidence:.9};
  const soft=["exerciseId","dosage","surface","weather","phase","readiness","equipment"];
  const softMismatch=soft.filter(key=>a[key]!=null&&b[key]!=null&&JSON.stringify(a[key])!==JSON.stringify(b[key]));
  return softMismatch.length?{classification:"partially_comparable",reasonCodes:softMismatch.map(x=>`${x}_confounder`),confidence:.65}:
    {classification:"comparable",reasonCodes:[],confidence:.95};
}

export type SessionQuality={classification:"high_quality"|"acceptable"|"reduced_quality"|"failed_quality_threshold"|"not_evaluated";
  inputsUsed:string[];missingInputs:string[];reasonCodes:string[];confidence:number;mayInfluenceProgression:boolean};
export function evaluateSessionQuality(input:{completion:SessionCompletion;timingConsistency?:number;coachRating?:number;athleteRating?:number;
  repetitionDegradationPercent?:number;restCompliance?:boolean;stoppingRuleActivated?:boolean}):SessionQuality{
  if(input.completion.pain||input.stoppingRuleActivated)return{classification:"failed_quality_threshold",inputsUsed:["stopping_rule"],
    missingInputs:[],reasonCodes:["safety_stop"],confidence:.95,mayInfluenceProgression:true};
  const objective=input.timingConsistency!=null||input.repetitionDegradationPercent!=null;
  const inputs=Object.entries(input).filter(([,v])=>v!=null).map(([k])=>k);
  const missing=["timingConsistency","coachRating","repetitionDegradationPercent"].filter(k=>input[k as keyof typeof input]==null);
  if(!objective&&input.coachRating==null&&input.athleteRating==null)return{classification:"not_evaluated",inputsUsed:inputs,
    missingInputs:missing,reasonCodes:["insufficient_quality_evidence"],confidence:.1,mayInfluenceProgression:false};
  if((input.repetitionDegradationPercent??0)>5||(input.timingConsistency??1)<.9)return{classification:"reduced_quality",inputsUsed:inputs,
    missingInputs:missing,reasonCodes:["objective_degradation"],confidence:objective?.85:.5,mayInfluenceProgression:true};
  const score=input.coachRating??input.athleteRating??7;
  return{classification:score>=8?"high_quality":"acceptable",inputsUsed:inputs,missingInputs:missing,
    reasonCodes:[objective?"objective_quality_supported":input.coachRating!=null?"coach_rating_only":"athlete_rating_only"],
    confidence:objective?.85:input.coachRating!=null?.65:.4,mayInfluenceProgression:objective||input.coachRating!=null};
}

export type AdaptationResponse={domain:"performance"|"technical"|"exposure_tolerance"|"recovery"|"strength"|"power"|"readiness"|"adverse"|"competition";
  classification:"positive"|"likely_positive"|"neutral"|"mixed"|"likely_negative"|"negative"|"insufficient_data"|"noncomparable";
  window:"session"|"seven_day"|"fourteen_day"|"microcycle"|"mesocycle"|"phase"|"competition_block";
  evidenceEventIds:string[];baseline:string|null;confidence:number;contradictions:string[];alternativeExplanations:string[];objectiveIds:string[]};
export function evaluateAdaptation(input:{comparability:ComparabilityResult;quality:SessionQuality[];performanceChanges:number[];
  evidenceEventIds:string[];objectiveIds:string[]}):AdaptationResponse{
  if(input.comparability.classification==="noncomparable")return{domain:"performance",classification:"noncomparable",window:"microcycle",
    evidenceEventIds:input.evidenceEventIds,baseline:null,confidence:input.comparability.confidence,contradictions:[],
    alternativeExplanations:input.comparability.reasonCodes,objectiveIds:input.objectiveIds};
  if(input.performanceChanges.length<2)return{domain:"performance",classification:"insufficient_data",window:"microcycle",
    evidenceEventIds:input.evidenceEventIds,baseline:null,confidence:.2,contradictions:[],alternativeExplanations:["insufficient_comparable_exposures"],objectiveIds:input.objectiveIds};
  const average=input.performanceChanges.reduce((a,b)=>a+b,0)/input.performanceChanges.length;
  const poor=input.quality.some(x=>["reduced_quality","failed_quality_threshold"].includes(x.classification));
  return{domain:"performance",classification:poor?"mixed":average>.01?"likely_positive":average<-.01?"likely_negative":"neutral",
    window:"microcycle",evidenceEventIds:input.evidenceEventIds,baseline:"prior comparable microcycle",confidence:poor?.55:.7,
    contradictions:poor?["session_quality_conflict"]:[],alternativeExplanations:["readiness","environment","measurement_variation"],objectiveIds:input.objectiveIds};
}

export type ProgressionDecision={outcome:"progress"|"hold"|"regress"|"modify"|"insufficient_evidence"|"review_required"|"blocked";
  magnitude:"minimal"|"standard"|"accelerated"|"none";dimensions:string[];ruleIds:string[];reasonCodes:string[];requiresApproval:true};
export function evaluateProgression(input:{state:LongitudinalTrainingState;qualities:SessionQuality[];adaptation:AdaptationResponse;
  fatigue:"normal"|"elevated"|"high"|"recovery_required"|"review_required"|"insufficient_data";competitionWithinDays:number|null;coachApproved:boolean}):ProgressionDecision{
  if(input.state.painEventIds.length)return{outcome:"blocked",magnitude:"none",dimensions:[],ruleIds:["TPI-SAFE-PAIN-001"],reasonCodes:["pain_reported"],requiresApproval:true};
  if(["high","recovery_required","review_required"].includes(input.fatigue))return{outcome:"modify",magnitude:"none",dimensions:["volume"],ruleIds:["TPI-HI-WEEK-001"],reasonCodes:["fatigue_limits_progression"],requiresApproval:true};
  if(input.competitionWithinDays!=null&&input.competitionWithinDays<=7)return{outcome:"hold",magnitude:"none",dimensions:[],ruleIds:["TPI-COMP-001"],reasonCodes:["competition_proximity"],requiresApproval:true};
  const highQuality=input.qualities.filter(x=>["high_quality","acceptable"].includes(x.classification)).length;
  if(input.adaptation.classification==="insufficient_data"||highQuality<2)return{outcome:"insufficient_evidence",magnitude:"none",dimensions:[],ruleIds:["TPI-PROGRESS-001"],reasonCodes:["minimum_exposure_or_quality_not_met"],requiresApproval:true};
  if(["likely_negative","negative"].includes(input.adaptation.classification))return{outcome:"regress",magnitude:"minimal",dimensions:["volume"],ruleIds:["TPI-PROGRESS-001"],reasonCodes:["negative_response_association"],requiresApproval:true};
  if(!input.coachApproved)return{outcome:"review_required",magnitude:"none",dimensions:[],ruleIds:["TPI-APPROVAL-001"],reasonCodes:["coach_approval_required"],requiresApproval:true};
  return{outcome:"progress",magnitude:"minimal",dimensions:["volume"],ruleIds:["TPI-PROGRESS-001"],reasonCodes:["repeated_quality_and_response_evidence"],requiresApproval:true};
}

export function evaluateFatigue(events:TrainingEvent[]):{state:"normal"|"elevated"|"high"|"recovery_required"|"review_required"|"insufficient_data";reasonCodes:string[]}{
  if(!events.length)return{state:"insufficient_data",reasonCodes:["no_fatigue_evidence"]};
  if(events.some(x=>x.type==="illness_reported"))return{state:"review_required",reasonCodes:["illness_reported"]};
  if(events.some(x=>x.type==="pain_reported"))return{state:"recovery_required",reasonCodes:["pain_is_not_fatigue_but_blocks_training"]};
  const high=events.filter(x=>x.type==="fatigue_reported"&&["high","acute"].includes(String(x.payload.severity))).length;
  const travel=events.some(x=>x.type==="travel_event");
  return high?{state:"high",reasonCodes:["high_reported_fatigue"]}:travel?{state:"elevated",reasonCodes:["travel_fatigue_context"]}:{state:"normal",reasonCodes:["no_elevated_signal"]};
}

export function evaluatePlateauRegression(input:{comparableExposureCount:number;changes:number[];plannedUnload:boolean;taper:boolean;measurementMismatch:boolean}){
  if(input.measurementMismatch)return{plateau:"noncomparable",regression:"measurement_inconsistency",confidence:.9};
  if(input.plannedUnload||input.taper)return{plateau:"no_plateau",regression:"planned_reduction_not_regression",confidence:.9};
  if(input.comparableExposureCount<3)return{plateau:"insufficient_information",regression:"insufficient_information",confidence:.2};
  const stable=input.changes.every(x=>Math.abs(x)<.01),declining=input.changes.every(x=>x<-.01);
  return{plateau:stable?"likely_plateau":"no_plateau",regression:declining?"performance_regression":"no_regression",confidence:.7};
}

