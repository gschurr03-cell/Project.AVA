import { trainingFingerprint } from "./engine";
import type { TrainingPlanSnapshot } from "./contracts";

export const TRAINING_MOBILE_CONTRACT_VERSION="training-mobile-v1";
export type OfflineTrainingPackage={
  contractVersion:typeof TRAINING_MOBILE_CONTRACT_VERSION;packageId:string;ownerId:string;athleteId:string;
  planId:string;planVersion:number;approvalStatus:"approved"|"active"|"paused"|"revoked";
  generatedAt:string;validUntil:string;lastSynchronizedAt:string;revocationVersion:number;
  currentWeek:{startDate:string;endDate:string;sessions:TrainingPlanSnapshot["sessions"]};
  warnings:string[];competitionContext:{id:string;date:string}[];integrity:string;
};
export function createOfflineTrainingPackage(input:Omit<OfflineTrainingPackage,"integrity">):OfflineTrainingPackage{
  if(!["approved","active"].includes(input.approvalStatus))throw new Error("offline_package_requires_usable_approved_plan");
  if(Date.parse(input.validUntil)<=Date.parse(input.generatedAt))throw new Error("offline_package_invalid_expiry");
  return{...input,integrity:trainingFingerprint(input)};
}
export function evaluateOfflinePlanSafety(pkg:OfflineTrainingPackage,input:{now:string;knownRevocationVersion:number;
  currentOwnerId:string;currentAthleteId:string;online:boolean}){
  if(pkg.ownerId!==input.currentOwnerId||pkg.athleteId!==input.currentAthleteId)return{usable:false,reason:"account_scope_changed",reconcileImmediately:true};
  if(input.knownRevocationVersion>pkg.revocationVersion)return{usable:false,reason:"plan_revoked_or_superseded",reconcileImmediately:true};
  if(Date.parse(input.now)>Date.parse(pkg.validUntil))return{usable:false,reason:"offline_validity_expired",reconcileImmediately:true};
  return{usable:true,reason:"within_bounded_offline_validity",reconcileImmediately:input.online};
}
export type OfflineTrainingEvent={id:string;type:"session_started"|"session_completed"|"session_partially_completed"|"session_skipped"|"readiness_submitted"|"pain_reported"|"athlete_note_category"|"stop_event";
  payload:Record<string,unknown>;createdAt:string;priority:"normal"|"safety_critical";idempotencyKey:string};
export function prioritizeOfflineEvents(events:OfflineTrainingEvent[]){
  return[...events].sort((a,b)=>(a.type==="pain_reported"||a.type==="stop_event"?0:1)-(b.type==="pain_reported"||b.type==="stop_event"?0:1)||a.createdAt.localeCompare(b.createdAt));
}

