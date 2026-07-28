import type { ExerciseCatalogEntry } from "./catalog";
import type { TrainingProgramInput } from "./contracts";
import { approvedExercise } from "./catalog";
import { TRAINING_RULE_PRECEDENCE } from "./rules";

export type SafetyStatus="permitted"|"permitted_with_warning"|"modification_required"|"coach_review_required"|"clinician_review_required"|"prohibited"|"insufficient_information";
export type SafetyResult={status:SafetyStatus;reasonCodes:string[];appliedAuthority:string|null};
const rank={athlete:1,coach:2,organization:3,clinician:4}as const;

export function classifyExerciseSafety(exercise:ExerciseCatalogEntry,input:TrainingProgramInput,now=new Date()):SafetyResult{
  const restrictions=input.restrictions.filter(item=>!item.expiresAt||Date.parse(item.expiresAt)>=now.getTime())
    .sort((a,b)=>rank[b.authority]-rank[a.authority]);
  const conflict=restrictions.find(restriction=>
    restriction.prohibitedCategories.includes(exercise.category)||
    exercise.contraindicationTags.some(tag=>restriction.prohibitedCategories.includes(tag)));
  if(conflict)return{status:conflict.authority==="clinician"?"prohibited":"coach_review_required",
    reasonCodes:["restriction_conflict",`authority_${conflict.authority}`],appliedAuthority:conflict.authority};
  const pain=input.readiness.some(signal=>signal.type==="pain"&&["high","acute"].includes(signal.severity)&&
    Date.parse(signal.validUntil)>=now.getTime());
  if(pain&&["acceleration","max_velocity","power"].includes(exercise.category))
    return{status:"prohibited",reasonCodes:["acute_pain_high_intensity_block"],appliedAuthority:"athlete"};
  if(input.athlete.trainingAgeYears<exercise.minimumTrainingAgeYears)
    return{status:"coach_review_required",reasonCodes:["training_age_insufficient"],appliedAuthority:null};
  return{status:"permitted",reasonCodes:[],appliedAuthority:null};
}

export type ReadinessDecision={outcome:"proceed"|"reduce_volume"|"reduce_intensity"|"replace_session"|"recovery_only"|"coach_review"|"medical_review"|"blocked";triggerIds:string[];ruleId:string;explanation:string};
export function readinessDecision(input:TrainingProgramInput,now=new Date()):ReadinessDecision{
  const current=input.readiness.filter(item=>Date.parse(item.validUntil)>=now.getTime());
  const acute=current.filter(item=>item.type==="pain"&&item.severity==="acute");
  if(acute.length)return{outcome:"blocked",triggerIds:acute.map(x=>x.id),ruleId:"TPI-SAFE-PAIN-001",explanation:"Acute pain blocks the session and requires escalation; no diagnosis is inferred."};
  const highPain=current.filter(item=>item.type==="pain"&&item.severity==="high");
  if(highPain.length)return{outcome:"medical_review",triggerIds:highPain.map(x=>x.id),ruleId:"TPI-SAFE-PAIN-001",explanation:"Reported high pain requires medical review before high-intensity training."};
  const highFatigue=current.filter(item=>["fatigue","illness"].includes(item.type)&&["high","acute"].includes(item.severity));
  if(highFatigue.length)return{outcome:"recovery_only",triggerIds:highFatigue.map(x=>x.id),ruleId:"TPI-HI-WEEK-001",explanation:"Current high fatigue or illness permits recovery only."};
  const moderate=current.filter(item=>["fatigue","soreness","sleep","stress"].includes(item.type)&&item.severity==="moderate");
  if(moderate.length)return{outcome:"reduce_volume",triggerIds:moderate.map(x=>x.id),ruleId:"TPI-HI-WEEK-001",explanation:"Moderate readiness limitations reduce planned volume pending review."};
  return{outcome:"proceed",triggerIds:current.map(x=>x.id),ruleId:"TPI-HI-WEEK-001",explanation:"No current structured signal requires modification."};
}

export type Substitution={originalExerciseId:string;replacementExerciseId:string;reason:string;expectedDifference:string;confidence:number;reviewRequired:boolean};
export function substituteExercise(originalId:string,input:TrainingProgramInput):Substitution|null{
  const original=approvedExercise(originalId);
  const candidates=["standing-acceleration-20m","fly-20m","extensive-tempo-100m","mobility-recovery"]
    .filter(id=>id!==originalId).map(approvedExercise)
    .filter(item=>item.objectives.some(objective=>original.objectives.includes(objective)))
    .filter(item=>item.facilities.every(facility=>input.context.facilities.includes(facility as never)))
    .filter(item=>classifyExerciseSafety(item,input).status==="permitted")
    .sort((a,b)=>a.id.localeCompare(b.id));
  const selected=candidates[0];if(!selected)return null;
  return{originalExerciseId:original.id,replacementExerciseId:selected.id,
    reason:"Original facility, equipment or safety constraint was not satisfied.",
    expectedDifference:`Preserves ${original.objectives.join(", ")} with a different training demand.`,
    confidence:.6,reviewRequired:true};
}

export {TRAINING_RULE_PRECEDENCE};

