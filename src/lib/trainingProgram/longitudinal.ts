import { z } from "zod";
import { trainingFingerprint } from "./engine";

export const LONGITUDINAL_STATE_VERSION = "training-longitudinal-state-v1";
export const TRAINING_EVENT_VERSION = 1;
export const COACHING_MEMORY_RULESET_VERSION = "coaching-memory-rules-v1";

const eventTypeSchema = z.enum([
  "plan_approved","plan_activated","session_scheduled","session_started","session_completed",
  "session_partially_completed","session_skipped","session_modified","exercise_substituted",
  "dosage_changed","pain_reported","fatigue_reported","readiness_submitted","restriction_added",
  "restriction_changed","restriction_removed","competition_completed","performance_test_completed",
  "sprint_analysis_activated","coach_override_created","coach_review_completed","plan_paused",
  "plan_resumed","plan_superseded","athlete_unavailable","facility_unavailable","travel_event","illness_reported",
]);
export type TrainingEventType=z.infer<typeof eventTypeSchema>;

export const trainingEventSchema=z.object({
  eventVersion:z.literal(TRAINING_EVENT_VERSION),eventId:z.string().uuid(),sequence:z.number().int().nonnegative(),
  athleteId:z.string().uuid(),ownerId:z.string().uuid(),occurredAt:z.string().datetime(),
  effectiveDate:z.string().date(),source:z.enum(["athlete","coach","clinician","system","device"]),
  sourceAuthority:z.enum(["informational","athlete","coach","clinician","system"]),
  type:eventTypeSchema,planId:z.string().uuid().nullable(),planVersion:z.number().int().positive().nullable(),
  sessionId:z.string().nullable(),exerciseId:z.string().nullable(),
  payload:z.record(z.unknown()),confidence:z.number().min(0).max(1),
  provenance:z.object({sourceId:z.string().min(1),capturedAt:z.string().datetime(),contractVersion:z.string().min(1)}).strict(),
  idempotencyKey:z.string().min(1).max(200),
}).strict();
export type TrainingEvent=z.infer<typeof trainingEventSchema>;

export type MemoryStatus="candidate"|"emerging"|"established"|"contradicted"|"stale"|"retired";
export type CoachingMemory={
  id:string;kind:"exercise_tolerance"|"adverse_response"|"session_structure"|"readiness_pattern"|"recovery_duration"|
    "taper_response"|"adherence_barrier"|"effective_substitution"|"coach_preference"|"athlete_preference"|
    "progression_rate"|"volume_tolerance"|"intensity_tolerance"|"restriction_pattern"|"phase_response"|"objective_response";
  scope:string;value:string;sourceEventIds:string[];evidenceCount:number;contradictionCount:number;
  dateRange:{start:string;end:string};confidence:number;status:MemoryStatus;lastConfirmedDate:string;
  contradictionStatus:"none"|"present"|"resolved";reviewAfter:string|null;applicabilityScope:string[];
};
export const MEMORY_THRESHOLDS=Object.freeze({
  version:COACHING_MEMORY_RULESET_VERSION,emergingEvidence:2,establishedEvidence:3,
  contradictionPenalty:.2,staleAfterDays:90,retireAfterDays:180,
});

export type LongitudinalTrainingState={
  version:typeof LONGITUDINAL_STATE_VERSION;snapshotId:string;revision:number;ownerId:string;athleteId:string;
  reducedThroughSequence:number;reducedEventIds:string[];ignoredDuplicateEventIds:string[];
  reducedIdempotencyKeys:string[];ignoredFutureEventIds:string[];
  currentPlan:{planId:string;planVersion:number;status:"approved"|"active"|"paused"|"superseded"}|null;
  currentPhase:string|null;currentMicrocycleId:string|null;currentWeek:number|null;
  objectives:{primary:string[];secondary:string[];maintenance:string[];monitoring:string[]};
  exposure:{prescribed:number;completed:number;missed:number;modified:number};
  sessionOutcomes:Record<string,SessionCompletion>;
  readinessHistory:string[];painEventIds:string[];restrictionEventIds:string[];competitionEventIds:string[];
  performanceEventIds:string[];analysisEventIds:string[];coachDecisionEventIds:string[];
  unresolvedEvidenceRequests:string[];reviewTriggers:string[];
  memories:CoachingMemory[];lastEventAt:string|null;fingerprint:string;
};

export type SessionCompletion={
  classification:"completed_as_prescribed"|"completed_minor_modification"|"completed_material_modification"|
    "partially_completed"|"stopped_for_safety"|"missed"|"rescheduled"|"invalid_completion_data";
  completedFraction:number;qualityMaintained:boolean|null;pain:boolean;sourceEventId:string;
};

const emptyState=(ownerId:string,athleteId:string):Omit<LongitudinalTrainingState,"fingerprint">=>({
  version:LONGITUDINAL_STATE_VERSION,snapshotId:`state-${athleteId}`,revision:1,ownerId,athleteId,
  reducedThroughSequence:-1,reducedEventIds:[],ignoredDuplicateEventIds:[],reducedIdempotencyKeys:[],
  ignoredFutureEventIds:[],currentPlan:null,currentPhase:null,
  currentMicrocycleId:null,currentWeek:null,objectives:{primary:[],secondary:[],maintenance:[],monitoring:[]},
  exposure:{prescribed:0,completed:0,missed:0,modified:0},sessionOutcomes:{},readinessHistory:[],
  painEventIds:[],restrictionEventIds:[],competitionEventIds:[],performanceEventIds:[],analysisEventIds:[],
  coachDecisionEventIds:[],unresolvedEvidenceRequests:[],reviewTriggers:[],memories:[],lastEventAt:null,
});

const completion=(event:TrainingEvent):SessionCompletion=>{
  const fraction=typeof event.payload.completedFraction==="number"?Math.max(0,Math.min(1,event.payload.completedFraction)):0;
  const quality=typeof event.payload.qualityMaintained==="boolean"?event.payload.qualityMaintained:null;
  const pain=event.type==="pain_reported"||event.payload.stoppedForPain===true;
  let classification:SessionCompletion["classification"]="invalid_completion_data";
  if(pain)classification="stopped_for_safety";
  else if(event.type==="session_skipped")classification=event.payload.rescheduled===true?"rescheduled":"missed";
  else if(event.type==="session_partially_completed")classification="partially_completed";
  else if(event.type==="session_modified")classification=fraction>=.9?"completed_minor_modification":"completed_material_modification";
  else if(event.type==="session_completed")classification=fraction===1&&quality!==false?"completed_as_prescribed":"completed_minor_modification";
  return{classification,completedFraction:fraction,qualityMaintained:quality,pain,sourceEventId:event.eventId};
};

const memoryStatus=(evidence:number,contradictions:number,ageDays:number):MemoryStatus=>{
  if(ageDays>=MEMORY_THRESHOLDS.retireAfterDays)return"retired";
  if(ageDays>=MEMORY_THRESHOLDS.staleAfterDays)return"stale";
  if(contradictions>0)return"contradicted";
  if(evidence>=MEMORY_THRESHOLDS.establishedEvidence)return"established";
  if(evidence>=MEMORY_THRESHOLDS.emergingEvidence)return"emerging";
  return"candidate";
};

function buildMemories(events:TrainingEvent[],asOf:string):CoachingMemory[]{
  const grouped=new Map<string,{positive:TrainingEvent[];negative:TrainingEvent[]}>();
  for(const event of events){
    const exerciseId=event.exerciseId??(typeof event.payload.exerciseId==="string"?event.payload.exerciseId:null);
    if(!exerciseId)continue;
    const key=`exercise:${exerciseId}`,group=grouped.get(key)??{positive:[],negative:[]};
    if(event.type==="pain_reported"||event.payload.adverseResponse===true)group.negative.push(event);
    if(event.type==="session_completed"&&event.payload.qualityMaintained===true)group.positive.push(event);
    grouped.set(key,group);
  }
  return[...grouped.entries()].map(([scope,group]):CoachingMemory=>{
    const adverse=group.negative.length>group.positive.length,evidence=adverse?group.negative:group.positive;
    const contradictions=adverse?group.positive:group.negative,dates=evidence.map(x=>x.effectiveDate).sort();
    const last=dates.at(-1)??asOf,ageDays=Math.max(0,(Date.parse(asOf)-Date.parse(last))/86_400_000);
    const status=memoryStatus(evidence.length,contradictions.length,ageDays);
    return{id:trainingFingerprint({scope,adverse}).slice(0,24),kind:adverse?"adverse_response":"exercise_tolerance",
      scope,value:adverse?"associated_with_repeated_adverse_response":"consistently_tolerated",
      sourceEventIds:[...evidence,...contradictions].map(x=>x.eventId).sort(),evidenceCount:evidence.length,
      contradictionCount:contradictions.length,dateRange:{start:dates[0]??last,end:last},
      confidence:Number(Math.max(0,Math.min(.95,.35+evidence.length*.2-contradictions.length*MEMORY_THRESHOLDS.contradictionPenalty)).toFixed(2)),
      status,lastConfirmedDate:last,contradictionStatus:contradictions.length?"present":"none",
      reviewAfter:new Date(Date.parse(last)+MEMORY_THRESHOLDS.staleAfterDays*86_400_000).toISOString().slice(0,10),
      applicabilityScope:[scope]};
  }).sort((a,b)=>a.id.localeCompare(b.id));
}

export function reduceTrainingEvents(rawEvents:unknown[],input:{ownerId:string;athleteId:string;checkpoint?:LongitudinalTrainingState}):LongitudinalTrainingState{
  const base=input.checkpoint?structuredClone(input.checkpoint):emptyState(input.ownerId,input.athleteId);
  const parsed:TrainingEvent[]=[];
  for(const value of rawEvents){
    const result=trainingEventSchema.safeParse(value);
    if(result.success){parsed.push(result.data);continue;}
    const envelope=z.object({eventId:z.string().uuid(),eventVersion:z.number().int(),
      ownerId:z.string().uuid(),athleteId:z.string().uuid()}).passthrough().safeParse(value);
    if(envelope.success&&envelope.data.eventVersion>TRAINING_EVENT_VERSION){
      if(envelope.data.ownerId!==input.ownerId||envelope.data.athleteId!==input.athleteId)
        throw new Error("training_event_scope_mismatch");
      base.ignoredFutureEventIds.push(envelope.data.eventId);continue;
    }
    throw new Error(`corrupt_training_event:${result.error.issues.map(x=>x.path.join(".")).join(",")}`);
  }
  if(parsed.some(event=>event.ownerId!==input.ownerId||event.athleteId!==input.athleteId))
    throw new Error("training_event_scope_mismatch");
  const ordered=[...parsed].sort((a,b)=>a.sequence-b.sequence||a.eventId.localeCompare(b.eventId));
  const seen=new Set(base.reducedEventIds),keys=new Set(base.reducedIdempotencyKeys),accepted:TrainingEvent[]=[];
  for(const event of ordered){
    if(seen.has(event.eventId)||keys.has(event.idempotencyKey)){base.ignoredDuplicateEventIds.push(event.eventId);continue;}
    keys.add(event.idempotencyKey);base.reducedIdempotencyKeys.push(event.idempotencyKey);
    seen.add(event.eventId);accepted.push(event);base.reducedEventIds.push(event.eventId);
    base.reducedThroughSequence=Math.max(base.reducedThroughSequence,event.sequence);base.lastEventAt=event.occurredAt;
    if(event.type==="plan_approved"||event.type==="plan_activated")
      base.currentPlan={planId:event.planId!,planVersion:event.planVersion!,status:event.type==="plan_activated"?"active":"approved"};
    if(event.type==="plan_paused"&&base.currentPlan)base.currentPlan={...base.currentPlan,status:"paused"};
    if(event.type==="plan_superseded"&&base.currentPlan)base.currentPlan={...base.currentPlan,status:"superseded"};
    if(event.type==="session_scheduled")base.exposure.prescribed++;
    if(["session_completed","session_partially_completed","session_skipped","session_modified"].includes(event.type)&&event.sessionId){
      const outcome=completion(event);base.sessionOutcomes[event.sessionId]=outcome;
      if(outcome.classification==="missed")base.exposure.missed++;
      else if(outcome.classification.includes("modification")||outcome.classification==="partially_completed")base.exposure.modified++;
      else base.exposure.completed++;
    }
    if(event.type==="readiness_submitted"||event.type==="fatigue_reported")base.readinessHistory.push(event.eventId);
    if(event.type==="pain_reported"){base.painEventIds.push(event.eventId);base.reviewTriggers.push("acute_pain_review");}
    if(event.type.startsWith("restriction_"))base.restrictionEventIds.push(event.eventId);
    if(event.type==="competition_completed")base.competitionEventIds.push(event.eventId);
    if(event.type==="performance_test_completed")base.performanceEventIds.push(event.eventId);
    if(event.type==="sprint_analysis_activated")base.analysisEventIds.push(event.eventId);
    if(event.type==="coach_override_created"||event.type==="coach_review_completed")base.coachDecisionEventIds.push(event.eventId);
  }
  const allForMemory=[...ordered.filter(x=>seen.has(x.eventId))];
  if(allForMemory.some(x=>x.exerciseId||typeof x.payload.exerciseId==="string"))
    base.memories=buildMemories(allForMemory,base.lastEventAt?.slice(0,10)??"1970-01-01");
  base.revision=(input.checkpoint?.revision??0)+1;
  const material={...base,fingerprint:undefined,ignoredDuplicateEventIds:[...base.ignoredDuplicateEventIds].sort(),
    ignoredFutureEventIds:[...base.ignoredFutureEventIds].sort(),reducedIdempotencyKeys:[...new Set(base.reducedIdempotencyKeys)].sort()};
  return{...base,ignoredDuplicateEventIds:material.ignoredDuplicateEventIds,
    ignoredFutureEventIds:material.ignoredFutureEventIds,reducedIdempotencyKeys:material.reducedIdempotencyKeys,
    fingerprint:trainingFingerprint(material)};
}
