import type { PlanValidation, TrainingPlanSnapshot } from "./contracts";

export type TrainingPlanLifecycle="requested"|"input_validation_failed"|"planning"|"draft"|"validation_failed"|"review_required"|"approved"|"scheduled"|"active"|"paused"|"superseded"|"completed"|"cancelled"|"archived";
export type ReviewerRole="athlete"|"coach"|"organization_staff"|"clinician";
export type PlanApproval={approvalId:string;planId:string;planVersion:number;reviewerId:string;role:ReviewerRole;
  action:"approve"|"reject"|"request_modification";acknowledgedWarnings:string[];reason:string;
  occurredAt:string;idempotencyKey:string};
export type CoachOverride={overrideId:string;planId:string;planVersion:number;path:string;originalValue:unknown;
  newValue:unknown;reason:string;reviewerId:string;occurredAt:string;validation:PlanValidation;
  resultingFingerprint:string;reapprovalRequired:true};

const allowed:Record<TrainingPlanLifecycle,readonly TrainingPlanLifecycle[]>={
  requested:["input_validation_failed","planning","cancelled"],input_validation_failed:["requested","cancelled"],
  planning:["draft","validation_failed","review_required","cancelled"],draft:["review_required","approved","cancelled"],
  validation_failed:["planning","cancelled"],review_required:["approved","validation_failed","cancelled"],
  approved:["scheduled","superseded","cancelled"],scheduled:["active","paused","cancelled"],
  active:["paused","completed","superseded","cancelled"],paused:["active","superseded","cancelled"],
  superseded:["archived"],completed:["archived"],cancelled:["archived"],archived:[],
};
export function authorizePlanTransition(from:TrainingPlanLifecycle,to:TrainingPlanLifecycle,role:ReviewerRole,
  validation:PlanValidation){
  if(!allowed[from].includes(to))throw new Error(`invalid_plan_transition:${from}:${to}`);
  if(["approved","scheduled","active"].includes(to)&&validation.errors.length)
    throw new Error("blocking_validation_prevents_approval");
  if(to==="approved"&&!["coach","organization_staff","clinician"].includes(role))
    throw new Error("reviewer_role_not_authorized");
  return{from,to,authorizedRole:role};
}
export function assertDraftNonAuthoritative(plan:TrainingPlanSnapshot){
  if(plan.lifecycle!=="draft"||plan.approval.approved)throw new Error("training_engine_may_only_emit_unapproved_draft");
  return plan;
}

