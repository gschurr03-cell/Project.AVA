import { z } from "zod";
import { trainingFingerprint } from "./engine";
import { planValidationSchema, trainingPlanSnapshotSchema, type PlanSession, type TrainingPlanSnapshot } from "./contracts";

export const adherenceEventSchema=z.object({
  id:z.string().uuid(),ownerId:z.string().uuid(),athleteId:z.string().uuid(),
  planId:z.string().uuid(),planVersion:z.number().int().positive(),sessionId:z.string().min(1),
  status:z.enum(["completed","partially_completed","skipped","modified","pain_reported","excessive_fatigue","coach_adjustment_requested"]),
  completedFraction:z.number().min(0).max(1),perceivedIntensity:z.number().min(0).max(10).nullable(),
  qualityMaintained:z.boolean().nullable(),notesCategory:z.enum(["none","technical","readiness","schedule","equipment","pain","other"]),
  occurredAt:z.string().datetime(),idempotencyKey:z.string().min(1).max(200),
}).strict();
export type AdherenceEvent=z.infer<typeof adherenceEventSchema>;

export type AdaptationDecision={
  kind:"progress"|"maintain"|"regress"|"replace"|"recovery_only"|"coach_review";
  dimensions:("volume"|"intensity"|"complexity"|"density"|"exercise")[];
  reasonCodes:string[];ruleIds:string[];requiresApproval:boolean;
};
export function decideAdaptation(events:AdherenceEvent[],input:{
  readiness:"good"|"reduced"|"poor";coachApproved:boolean;restrictionChanged:boolean;
}):AdaptationDecision{
  if(input.restrictionChanged)return{kind:"coach_review",dimensions:[],reasonCodes:["restriction_changed"],ruleIds:["TPI-APPROVAL-001"],requiresApproval:true};
  if(events.some(event=>event.status==="pain_reported"))return{kind:"recovery_only",dimensions:["volume","intensity"],reasonCodes:["pain_reported"],ruleIds:["TPI-SAFE-PAIN-001"],requiresApproval:true};
  if(input.readiness==="poor"||events.some(event=>event.status==="excessive_fatigue"))
    return{kind:"regress",dimensions:["volume","intensity","density"],reasonCodes:["poor_readiness"],ruleIds:["TPI-HI-WEEK-001"],requiresApproval:true};
  const successful=events.length>=2&&events.every(event=>event.status==="completed"&&event.completedFraction===1&&event.qualityMaintained===true);
  if(successful&&input.readiness==="good"&&input.coachApproved)
    return{kind:"progress",dimensions:["volume"],reasonCodes:["repeated_quality_completion"],ruleIds:["TPI-PROGRESS-001"],requiresApproval:true};
  return{kind:"maintain",dimensions:[],reasonCodes:["progression_criteria_not_met"],ruleIds:["TPI-PROGRESS-001"],requiresApproval:false};
}

export function applyAdaptationToSession(session:PlanSession,decision:AdaptationDecision):PlanSession{
  if(decision.kind==="maintain"||decision.kind==="coach_review")return session;
  const factor=decision.kind==="progress"?1.05:decision.kind==="recovery_only"?.5:.8;
  const exercises=session.exercises.map(item=>{
    const dosage=item.dosage;
    if(dosage.kind==="sprint")return{...item,dosage:{...dosage,repetitions:Math.max(1,Math.floor(dosage.repetitions*factor)),
      intensityPercent:decision.kind==="progress"?dosage.intensityPercent:Math.max(50,Math.floor(dosage.intensityPercent*factor))},
      rationale:`${item.rationale} Adaptation: ${decision.reasonCodes.join(", ")}.`,ruleIds:[...item.ruleIds,...decision.ruleIds]};
    if(dosage.kind==="lifting")return{...item,dosage:{...dosage,sets:Math.max(1,Math.floor(dosage.sets*factor)),
      loadValue:dosage.loadValue==null?null:Number((dosage.loadValue*factor).toFixed(1))},
      rationale:`${item.rationale} Adaptation: ${decision.reasonCodes.join(", ")}.`,ruleIds:[...item.ruleIds,...decision.ruleIds]};
    return item;
  });
  return{...session,exercises,rationale:`${session.rationale} ${decision.kind} applied after deterministic review.`,
    ruleIds:[...session.ruleIds,...decision.ruleIds]};
}

export const planRevisionSchema=z.object({
  revisionId:z.string().uuid(),planId:z.string().uuid(),planVersion:z.number().int().positive(),
  state:z.enum(["created","reviewed","modified","approved","superseded","archived"]),
  snapshot:trainingPlanSnapshotSchema,previousRevisionId:z.string().uuid().nullable(),
  reviewerId:z.string().uuid().nullable(),rationale:z.string().min(1).max(2_000),
  fingerprint:z.string().min(1),validation:planValidationSchema,createdAt:z.string().datetime(),
}).strict();
export type PlanRevision=z.infer<typeof planRevisionSchema>;
export function createPlanRevision(input:{revisionId:string;snapshot:TrainingPlanSnapshot;state:PlanRevision["state"];
  previous:PlanRevision|null;reviewerId:string|null;rationale:string;createdAt:string}):PlanRevision{
  const material={planId:input.snapshot.planId,planVersion:input.snapshot.planVersion,state:input.state,
    snapshotFingerprint:input.snapshot.planFingerprint,previousRevisionId:input.previous?.revisionId??null,
    reviewerId:input.reviewerId,rationale:input.rationale};
  return planRevisionSchema.parse({revisionId:input.revisionId,planId:input.snapshot.planId,
    planVersion:input.snapshot.planVersion,state:input.state,snapshot:input.snapshot,
    previousRevisionId:input.previous?.revisionId??null,reviewerId:input.reviewerId,
    rationale:input.rationale,fingerprint:trainingFingerprint(material),
    validation:input.snapshot.validation,createdAt:input.createdAt});
}

export type ChangeImpact="no_change"|"session_adjustment"|"microcycle_regeneration"|"phase_regeneration"|"coach_review_required";
export function analyzeProgramChange(change:"new_competition"|"restriction"|"missed_session"|"readiness_decline"|"readiness_improved"|"coach_override"):ChangeImpact{
  switch(change){
    case"new_competition":return"microcycle_regeneration";
    case"restriction":return"phase_regeneration";
    case"missed_session":case"readiness_decline":return"session_adjustment";
    case"readiness_improved":return"no_change";
    case"coach_override":return"coach_review_required";
  }
}
