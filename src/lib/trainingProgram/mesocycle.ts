import { z } from "zod";
import { generateDraftTrainingPlan, trainingFingerprint } from "./engine";
import { TRAINING_CATALOG_VERSION, TRAINING_RULESET_VERSION, trainingPlanSnapshotSchema, trainingProgramInputSchema } from "./contracts";
import type { TrainingPlanSnapshot, TrainingProgramInput } from "./contracts";

export const MESOCYCLE_CONTRACT_VERSION="training-mesocycle-v1";
export const weekEvolutionSchema=z.enum(["introduction","accumulation","development","consolidation","overload","unload","taper","competition","recovery","reassessment"]);
export type WeekEvolution=z.infer<typeof weekEvolutionSchema>;
export const competitionPrioritySchema=z.enum(["training_meet","low_priority","secondary_target","primary_target","championship","qualification_critical"]);

export type TrainingMesocycleSnapshot={
  contractVersion:typeof MESOCYCLE_CONTRACT_VERSION;mesocycleId:string;athleteId:string;ownerId:string;
  sourceManifestId:string;sourceCoachingStateId:string|null;startDate:string;endDate:string;
  phase:string;durationWeeks:number;primaryObjectiveIds:string[];secondaryObjectiveIds:string[];maintenanceObjectiveIds:string[];
  weeks:{week:number;evolution:WeekEvolution;purpose:string;exposureMultiplier:number;expectedFatigue:"low"|"moderate"|"high";
    reviewConditions:string[];transitionCriteria:string[];microcycle:TrainingPlanSnapshot}[];
  reviewPoints:number[];competitionEvents:{id:string;date:string;priority:z.infer<typeof competitionPrioritySchema>}[];
  unloadStrategy:string;loadBounds:{maximumWeeklyIncreasePercent:number;maximumHighIntensityDays:number};
  progressionCriteria:string[];regressionCriteria:string[];exitCriteria:string[];approvalRequirement:"coach_required";
  ruleSetVersion:typeof TRAINING_RULESET_VERSION;catalogVersion:typeof TRAINING_CATALOG_VERSION;fingerprint:string;
  lifecycle:"draft";createdAt:string;
};

const addDays=(date:string,days:number)=>{const value=new Date(`${date}T00:00:00.000Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10)};
const deterministicUuid=(value:unknown)=>{
  const hex=trainingFingerprint(value).slice(0,32).split("");
  hex[12]="4";hex[16]=["8","9","a","b"][Number.parseInt(hex[16],16)%4];
  return`${hex.slice(0,8).join("")}-${hex.slice(8,12).join("")}-${hex.slice(12,16).join("")}-${hex.slice(16,20).join("")}-${hex.slice(20).join("")}`;
};
const priority=(importance:string):z.infer<typeof competitionPrioritySchema>=>
  importance==="championship"?"championship":importance==="important"?"primary_target":importance==="preparation"?"secondary_target":"low_priority";

function evolutionFor(input:TrainingProgramInput,week:number,weeks:number):WeekEvolution{
  const start=addDays(input.context.startDate,(week-1)*7),end=addDays(start,6);
  const competition=input.competitions.find(x=>x.date>=start&&x.date<=end);
  if(competition)return competition.importance==="championship"||competition.importance==="important"?"competition":"consolidation";
  const next=input.competitions.find(x=>x.date>start&&x.date<=addDays(end,7));
  if(next)return"taper";
  if(week===weeks)return"reassessment";
  if(week===1)return"introduction";
  if(week===weeks-1&&weeks>=4)return"unload";
  return week===2?"accumulation":"development";
}
const multiplier=(state:WeekEvolution)=>({introduction:.9,accumulation:1,development:1.05,consolidation:.95,overload:1.08,
  unload:.75,taper:.65,competition:.55,recovery:.5,reassessment:.7}[state]);

export function generateMesocycle(raw:unknown,options:{mesocycleId:string;durationWeeks:number;createdAt:string}):TrainingMesocycleSnapshot{
  const input=trainingProgramInputSchema.parse(raw);
  if(options.durationWeeks<2||options.durationWeeks>6)throw new Error("mesocycle_duration_out_of_bounds");
  const weeks=Array.from({length:options.durationWeeks},(_,index)=>{
    const week=index+1,evolution=evolutionFor(input,week,options.durationWeeks),startDate=addDays(input.context.startDate,index*7);
    const weeklyInput={...input,requestId:input.requestId,context:{...input.context,startDate},
      recentExposure:{...input.recentExposure,sprintDistanceM:Math.round(input.recentExposure.sprintDistanceM*multiplier(evolution))}};
    const microcycle=generateDraftTrainingPlan(weeklyInput,{createdAt:options.createdAt,
      planId:deterministicUuid({mesocycleId:options.mesocycleId,week})});
    return{week,evolution,purpose:`${evolution} week with bounded, reviewable exposure.`,exposureMultiplier:multiplier(evolution),
      expectedFatigue:(["development","overload"].includes(evolution)?"high":["unload","taper","competition","recovery","reassessment"].includes(evolution)?"low":"moderate")as"low"|"moderate"|"high",
      reviewConditions:["pain","material readiness decline","restriction change","competition change"],
      transitionCriteria:["completed comparable exposures","acceptable quality","no unresolved safety event"],microcycle};
  });
  const material=Object.freeze({contractVersion:MESOCYCLE_CONTRACT_VERSION,mesocycleId:options.mesocycleId,
    athleteId:input.athleteId,ownerId:input.ownerId,sourceManifestId:input.sourceManifest.id,
    sourceCoachingStateId:input.upstream.coachingStateSnapshotId,startDate:input.context.startDate,
    endDate:addDays(input.context.startDate,options.durationWeeks*7-1),phase:input.context.seasonPhase,durationWeeks:options.durationWeeks,
    primaryObjectiveIds:input.objectives.filter(x=>x.allocation==="primary").map(x=>x.id),
    secondaryObjectiveIds:input.objectives.filter(x=>x.allocation==="secondary").map(x=>x.id),
    maintenanceObjectiveIds:input.objectives.filter(x=>x.allocation==="maintenance").map(x=>x.id),weeks,
    reviewPoints:[1,options.durationWeeks],competitionEvents:input.competitions.map(x=>({id:x.id,date:x.date,priority:priority(x.importance)})),
    unloadStrategy:"Reduce volume while preserving only justified quality exposure; do not default to complete rest.",
    loadBounds:{maximumWeeklyIncreasePercent:8,maximumHighIntensityDays:3},
    progressionCriteria:["repeated comparable quality exposure","acceptable tolerance","no unresolved safety event"],
    regressionCriteria:["repeated adverse or negative response","material interruption","restriction change"],
    exitCriteria:["review point completed","competition block complete","material input change"],
    approvalRequirement:"coach_required"as const,ruleSetVersion:TRAINING_RULESET_VERSION,catalogVersion:TRAINING_CATALOG_VERSION,
    lifecycle:"draft"as const,createdAt:options.createdAt});
  return{...material,fingerprint:trainingFingerprint(material)};
}

export type RegenerationScope="remaining_session"|"remaining_day"|"remaining_microcycle"|"next_microcycle"|"remaining_mesocycle"|"next_phase";
export type LongitudinalChangeImpact={
  level:"no_material_impact"|"explanation_only_update"|"day_level_modification"|"session_level_modification"|
    "remaining_week_regeneration"|"next_week_regeneration"|"mesocycle_regeneration"|"phase_regeneration"|"immediate_pause"|"approval_required";
  regenerationScope:RegenerationScope|null;reasonCodes:string[];affectedComponents:string[];requiresApproval:boolean;
};
export function evaluateLongitudinalChangeImpact(change:string):LongitudinalChangeImpact{
  const map:Record<string,LongitudinalChangeImpact>={
    pain_report:{level:"immediate_pause",regenerationScope:"remaining_session",reasonCodes:["acute_pain_safety_event"],affectedComponents:["active_session","offline_package"],requiresApproval:true},
    restriction_update:{level:"phase_regeneration",regenerationScope:"remaining_mesocycle",reasonCodes:["restriction_authority_changed"],affectedComponents:["future_sessions"],requiresApproval:true},
    competition_added:{level:"mesocycle_regeneration",regenerationScope:"remaining_mesocycle",reasonCodes:["competition_calendar_changed"],affectedComponents:["taper","race_week"],requiresApproval:true},
    readiness_decline:{level:"day_level_modification",regenerationScope:"remaining_day",reasonCodes:["material_readiness_decline"],affectedComponents:["dosage"],requiresApproval:true},
    missed_low_priority_session:{level:"no_material_impact",regenerationScope:null,reasonCodes:["isolated_low_priority_miss"],affectedComponents:[],requiresApproval:false},
    new_analysis:{level:"next_week_regeneration",regenerationScope:"next_microcycle",reasonCodes:["activated_analysis_requires_review"],affectedComponents:["objectives","next_review"],requiresApproval:true},
  };
  return map[change]??{level:"approval_required",regenerationScope:null,reasonCodes:["unclassified_material_change"],affectedComponents:["review_queue"],requiresApproval:true};
}

export type TrainingPlanPatch={patchId:string;sourcePlanId:string;sourcePlanVersion:number;targetPlanVersion:number;
  trigger:string;operations:{kind:"move_session"|"replace_exercise"|"alter_dosage"|"remove_exercise"|"add_recovery"|"change_rest"|"reduce_intensity"|"reduce_volume"|"change_session_status"|"add_review_point"|"pause_session";
    path:string;previousValue:unknown;newValue:unknown}[];ruleIds:string[];validation:{valid:boolean;errors:string[]};
  approvalRequirement:"coach_required"|"clinician_required";effectiveDate:string;provenance:{eventIds:string[];engineVersion:string};fingerprint:string};
export function createTrainingPlanPatch(value:Omit<TrainingPlanPatch,"fingerprint">):TrainingPlanPatch{
  if(value.targetPlanVersion<=value.sourcePlanVersion)throw new Error("patch_must_create_new_revision");
  if(!value.operations.length)throw new Error("empty_plan_patch");
  return{...value,fingerprint:trainingFingerprint(value)};
}

export function comparePlans(source:TrainingPlanSnapshot,target:TrainingPlanSnapshot,trigger:string){
  trainingPlanSnapshotSchema.parse(source);trainingPlanSnapshotSchema.parse(target);
  const changes:string[]=[];
  source.sessions.forEach((session,index)=>{
    const next=target.sessions[index];
    if(session.weekday!==next.weekday)changes.push(`session_moved:${session.id}`);
    const before=session.exercises.map(x=>x.exerciseId),after=next.exercises.map(x=>x.exerciseId);
    if(JSON.stringify(before)!==JSON.stringify(after))changes.push(`exercise_change:${session.id}`);
    if(JSON.stringify(session.exercises.map(x=>x.dosage))!==JSON.stringify(next.exercises.map(x=>x.dosage)))changes.push(`dosage_change:${session.id}`);
  });
  if(JSON.stringify(source.objectives)!==JSON.stringify(target.objectives))changes.push("objective_change");
  if(JSON.stringify(source.exposure)!==JSON.stringify(target.exposure))changes.push("exposure_change");
  return{sourcePlanId:source.planId,targetPlanId:target.planId,trigger,changes,rationale:"Material typed differences only.",fingerprint:trainingFingerprint({source:source.planFingerprint,target:target.planFingerprint,trigger,changes})};
}
