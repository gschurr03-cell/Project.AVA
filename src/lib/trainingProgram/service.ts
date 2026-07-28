import { randomUUID } from "node:crypto";
import { generateDraftTrainingPlan } from "./engine";
import { assertDraftNonAuthoritative, authorizePlanTransition, type PlanApproval, type ReviewerRole } from "./lifecycle";
import { trainingProgramInputSchema, type TrainingPlanSnapshot } from "./contracts";

export type TrainingProgramPrincipal={accountId:string;role:"athlete"|"coach"|"organization_staff"|"clinician"|"service";athleteIds:string[]};
export interface TrainingPlanStore{
  findByIdempotency(ownerId:string,idempotencyKey:string):Promise<TrainingPlanSnapshot|null>;
  saveDraft(plan:TrainingPlanSnapshot,idempotencyKey:string):Promise<void>;
  get(ownerId:string,planId:string):Promise<TrainingPlanSnapshot|null>;
  list(ownerId:string,athleteId:string):Promise<TrainingPlanSnapshot[]>;
  saveApproval(ownerId:string,approval:PlanApproval):Promise<void>;
}
const authorize=(principal:TrainingProgramPrincipal,ownerId:string,athleteId:string)=>{
  if(principal.accountId!==ownerId||!principal.athleteIds.includes(athleteId))throw new Error("training_plan_scope_denied");
};
export class TrainingProgramService{
  constructor(private readonly store:TrainingPlanStore){}
  async requestDraft(raw:unknown,principal:TrainingProgramPrincipal,idempotencyKey:string){
    if(!idempotencyKey||idempotencyKey.length>200)throw new Error("invalid_idempotency_key");
    const input=trainingProgramInputSchema.parse(raw);authorize(principal,input.ownerId,input.athleteId);
    const existing=await this.store.findByIdempotency(input.ownerId,idempotencyKey);if(existing)return existing;
    const plan=assertDraftNonAuthoritative(generateDraftTrainingPlan(input));
    await this.store.saveDraft(plan,idempotencyKey);return plan;
  }
  async retrieve(ownerId:string,planId:string,principal:TrainingProgramPrincipal){
    const plan=await this.store.get(ownerId,planId);if(!plan)throw new Error("training_plan_not_found");
    authorize(principal,ownerId,plan.athleteId);return plan;
  }
  async list(ownerId:string,athleteId:string,principal:TrainingProgramPrincipal){
    authorize(principal,ownerId,athleteId);return this.store.list(ownerId,athleteId);
  }
  async review(ownerId:string,planId:string,principal:TrainingProgramPrincipal,input:{
    action:"approve"|"reject"|"request_modification";reason:string;acknowledgedWarnings:string[];idempotencyKey:string;
  }){
    const plan=await this.retrieve(ownerId,planId,principal);
    const role:ReviewerRole=principal.role==="organization_staff"?"organization_staff":
      principal.role==="clinician"?"clinician":principal.role==="coach"?"coach":"athlete";
    if(input.action==="approve")authorizePlanTransition("draft","approved",role,plan.validation);
    const approval:PlanApproval={approvalId:randomUUID(),planId,planVersion:plan.planVersion,
      reviewerId:principal.accountId,role,action:input.action,acknowledgedWarnings:input.acknowledgedWarnings,
      reason:input.reason.slice(0,1_000),occurredAt:new Date().toISOString(),idempotencyKey:input.idempotencyKey};
    await this.store.saveApproval(ownerId,approval);return approval;
  }
}
