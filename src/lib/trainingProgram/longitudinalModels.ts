import { trainingFingerprint } from "./engine";
import type { AdaptationResponse, SessionQuality } from "./evaluation";
import type { LongitudinalTrainingState, TrainingEvent } from "./longitudinal";

export const LONGITUDINAL_RULESET_VERSION="training-longitudinal-rules-v1";
export type ToleranceDomain="max_velocity"|"acceleration"|"speed_endurance"|"special_endurance"|"plyometric_contacts"|
  "lifting_volume"|"lifting_intensity"|"session_density"|"competition_density"|"consecutive_high_days"|"weekly_training_time";
export type ToleranceAssessment={domain:ToleranceDomain;state:"unknown"|"low_evidence"|"tolerated"|"well_tolerated"|
  "approaching_limit"|"exceeded"|"temporarily_reduced";evidenceEventIds:string[];comparableExposureCount:number;
  adverseResponseCount:number;confidence:number;ruleIds:string[]};
export function evaluateTolerance(input:{domain:ToleranceDomain;exposures:{eventId:string;comparable:boolean;completed:boolean;
  qualityMaintained:boolean|null;adverseResponse:boolean;loadRatioToRecent:number}[];activeRestriction:boolean}):ToleranceAssessment{
  const comparable=input.exposures.filter(x=>x.comparable),adverse=comparable.filter(x=>x.adverseResponse);
  let state:ToleranceAssessment["state"]="unknown";
  if(input.activeRestriction)state="temporarily_reduced";
  else if(!comparable.length)state="unknown";
  else if(comparable.length<3)state="low_evidence";
  else if(adverse.length>=2||comparable.some(x=>x.loadRatioToRecent>1.2&&x.adverseResponse))state="exceeded";
  else if(comparable.some(x=>x.loadRatioToRecent>1.1)||adverse.length===1)state="approaching_limit";
  else if(comparable.length>=5&&comparable.every(x=>x.completed&&x.qualityMaintained!==false))state="well_tolerated";
  else state="tolerated";
  return{domain:input.domain,state,evidenceEventIds:comparable.map(x=>x.eventId).sort(),
    comparableExposureCount:comparable.length,adverseResponseCount:adverse.length,
    confidence:Number(Math.min(.9,.2+comparable.length*.12).toFixed(2)),ruleIds:["TPI-TOLERANCE-001"]};
}

export type ProgramEffectiveness={classification:"effective"|"likely_effective"|"partially_effective"|"unclear"|
  "likely_ineffective"|"ineffective"|"unsafe_or_unsuitable";dimensions:Record<string,"positive"|"neutral"|"negative"|"unknown">;
  reasonCodes:string[];confidence:number;requiresReview:boolean};
export function evaluateProgramEffectiveness(input:{adaptations:AdaptationResponse[];qualities:SessionQuality[];
  adherenceRatio:number;adverseResponseCount:number;readinessStable:boolean;coachSatisfied:boolean|null;
  athleteAcceptable:boolean|null;schedulingFeasible:boolean}):ProgramEffectiveness{
  const dimensions={
    objectiveProgress:input.adaptations.some(x=>["positive","likely_positive"].includes(x.classification))?"positive":
      input.adaptations.some(x=>["negative","likely_negative"].includes(x.classification))?"negative":"unknown",
    adherence:input.adherenceRatio>=.8?"positive":input.adherenceRatio<.5?"negative":"neutral",
    quality:input.qualities.some(x=>x.classification==="failed_quality_threshold")?"negative":
      input.qualities.some(x=>["high_quality","acceptable"].includes(x.classification))?"positive":"unknown",
    tolerance:input.adverseResponseCount?"negative":"unknown",readiness:input.readinessStable?"positive":"neutral",
    coach:input.coachSatisfied==null?"unknown":input.coachSatisfied?"positive":"negative",
    acceptability:input.athleteAcceptable==null?"unknown":input.athleteAcceptable?"positive":"negative",
    feasibility:input.schedulingFeasible?"positive":"negative",
  }as const;
  if(input.adverseResponseCount>1)return{classification:"unsafe_or_unsuitable",dimensions,reasonCodes:["repeated_adverse_response"],confidence:.85,requiresReview:true};
  const values=Object.values(dimensions),positive=values.filter(x=>x==="positive").length,negative=values.filter(x=>x==="negative").length;
  const classification=negative>=3?"likely_ineffective":positive>=5?"likely_effective":positive>=2?"partially_effective":"unclear";
  return{classification,dimensions,reasonCodes:["multidimensional_effectiveness_review"],confidence:.65,requiresReview:true};
}

export type TrainingSeasonSnapshot={version:"training-season-v1";seasonId:string;ownerId:string;athleteId:string;
  eventFocus:string[];startDate:string;endDate:string;blocks:{id:string;kind:"preparation"|"competition"|"transition";startDate:string;endDate:string}[];
  competitions:{id:string;date:string;priority:"training_meet"|"low_priority"|"secondary_target"|"primary_target"|"championship"|"qualification_critical";
    travel:boolean;status:"scheduled"|"completed"|"cancelled"}[];availability:string[];fingerprint:string};
export function createTrainingSeason(value:Omit<TrainingSeasonSnapshot,"version"|"fingerprint">):TrainingSeasonSnapshot{
  if(Date.parse(value.endDate)<Date.parse(value.startDate))throw new Error("invalid_season_dates");
  if(value.competitions.some(x=>x.date<value.startDate||x.date>value.endDate))throw new Error("competition_outside_season");
  return{version:"training-season-v1",...value,fingerprint:trainingFingerprint(value)};
}

export type InterruptionAssessment={classification:"minor"|"material"|"medical_or_clinical";reentry:"resume_unchanged"|
  "resume_reduced_volume"|"resume_reduced_intensity"|"abbreviated_reentry_microcycle"|"reassessment_required"|
  "coach_review_required"|"clinician_clearance_required"|"blocked";reasonCodes:string[];requiresApproval:boolean};
export function evaluateInterruption(input:{cause:"illness"|"travel"|"facility_closure"|"weather"|"work_conflict"|
  "injury_restriction"|"personal_unavailability"|"equipment_loss"|"competition_reschedule";durationDays:number;
  clinicianRestriction:boolean;readiness:"good"|"reduced"|"poor";competitionWithinDays:number|null}):InterruptionAssessment{
  if(input.clinicianRestriction||input.cause==="injury_restriction")return{classification:"medical_or_clinical",
    reentry:"clinician_clearance_required",reasonCodes:["clinical_boundary"],requiresApproval:true};
  if(input.readiness==="poor")return{classification:"material",reentry:"reassessment_required",reasonCodes:["poor_readiness_after_interruption"],requiresApproval:true};
  if(input.durationDays<=2&&input.readiness==="good")return{classification:"minor",reentry:"resume_unchanged",reasonCodes:["brief_nonmedical_interruption"],requiresApproval:false};
  if(input.durationDays<=7)return{classification:"material",reentry:"resume_reduced_volume",reasonCodes:["bounded_reentry"],requiresApproval:true};
  return{classification:"material",reentry:"abbreviated_reentry_microcycle",reasonCodes:["extended_interruption"],requiresApproval:true};
}

export type LongitudinalPlanningSnapshot={version:"longitudinal-planning-v1";ownerId:string;athleteId:string;
  seasonId:string|null;mesocycleId:string|null;microcycleId:string|null;activePlanId:string|null;
  completedSessionIds:string[];pendingSessionIds:string[];stateFingerprint:string;memoryIds:string[];
  adaptationClassifications:string[];toleranceStates:string[];fatigueState:string;competitionIds:string[];
  unresolvedReviews:string[];nextDecisionPoint:string|null;status:"draft_planning_manifest";fingerprint:string};
export function createLongitudinalPlanningSnapshot(input:{state:LongitudinalTrainingState;seasonId:string|null;mesocycleId:string|null;
  microcycleId:string|null;pendingSessionIds:string[];adaptations:AdaptationResponse[];tolerances:ToleranceAssessment[];
  fatigueState:string;nextDecisionPoint:string|null}):LongitudinalPlanningSnapshot{
  const material={version:"longitudinal-planning-v1"as const,ownerId:input.state.ownerId,athleteId:input.state.athleteId,
    seasonId:input.seasonId,mesocycleId:input.mesocycleId,microcycleId:input.microcycleId,
    activePlanId:input.state.currentPlan?.planId??null,completedSessionIds:Object.entries(input.state.sessionOutcomes)
      .filter(([,x])=>x.classification.startsWith("completed")).map(([id])=>id).sort(),
    pendingSessionIds:[...input.pendingSessionIds].sort(),stateFingerprint:input.state.fingerprint,
    memoryIds:input.state.memories.map(x=>x.id).sort(),adaptationClassifications:input.adaptations.map(x=>x.classification),
    toleranceStates:input.tolerances.map(x=>x.state),fatigueState:input.fatigueState,
    competitionIds:[...input.state.competitionEventIds].sort(),unresolvedReviews:[...input.state.reviewTriggers].sort(),
    nextDecisionPoint:input.nextDecisionPoint,status:"draft_planning_manifest"as const};
  return{...material,fingerprint:trainingFingerprint(material)};
}

export function appendProgramAudit(events:TrainingEvent[]){
  return events.map(event=>({auditId:event.eventId,sequence:event.sequence,ownerId:event.ownerId,athleteId:event.athleteId,
    action:event.type,authority:event.sourceAuthority,occurredAt:event.occurredAt,provenance:event.provenance,
    fingerprint:trainingFingerprint(event)})).sort((a,b)=>a.sequence-b.sequence||a.auditId.localeCompare(b.auditId));
}

