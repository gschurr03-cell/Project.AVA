import { createHash, randomUUID } from "node:crypto";
import { approvedExercise } from "./catalog";
import {
  TRAINING_CATALOG_VERSION, TRAINING_PLAN_CONTRACT_VERSION, TRAINING_PROGRAM_ENGINE_VERSION,
  TRAINING_RULESET_VERSION, TRAINING_VALIDATION_VERSION, trainingPlanSnapshotSchema,
  trainingProgramInputSchema, type PlanSession, type PlanValidation,
  type TrainingPlanSnapshot, type TrainingProgramInput,
} from "./contracts";

export type PlanningEligibility =
  | {status:"eligible"|"eligible_with_warnings";reasonCodes:string[];warnings:string[]}
  | {status:"review_required"|"insufficient_information"|"medically_restricted"|"temporarily_blocked"|"unsupported";reasonCodes:string[];warnings:string[]};

const canonical=(value:unknown):string=>{
  if(Array.isArray(value))return`[${value.map(canonical).join(",")}]`;
  if(value&&typeof value==="object")return`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
};
export const trainingFingerprint=(value:unknown)=>createHash("sha256").update(canonical(value)).digest("hex");
export const materialTrainingInput=(input:TrainingProgramInput)=>{
  const material:Partial<TrainingProgramInput>={...input};
  delete material.operationalMetadata;delete material.requestId;return material;
};

export function evaluatePlanningEligibility(raw:unknown,now=new Date()):PlanningEligibility{
  const parsed=trainingProgramInputSchema.safeParse(raw);
  if(!parsed.success)return{status:"insufficient_information",reasonCodes:["input_contract_invalid"],warnings:[]};
  const input=parsed.data;
  if(input.athlete.ageCategory!=="adult")return{status:"unsupported",reasonCodes:["unsupported_age_population"],warnings:[]};
  const activePain=input.readiness.find(signal=>signal.type==="pain"&&
    ["high","acute"].includes(signal.severity)&&Date.parse(signal.validUntil)>=now.getTime());
  if(activePain)return{status:"temporarily_blocked",reasonCodes:["acute_pain_reported"],warnings:[]};
  const clinician=input.restrictions.find(restriction=>restriction.authority==="clinician"&&
    restriction.medicalClearance!=="provided"&&(!restriction.expiresAt||Date.parse(restriction.expiresAt)>=now.getTime()));
  if(clinician)return{status:"medically_restricted",reasonCodes:["unresolved_clinician_restriction"],warnings:[]};
  const stale=input.readiness.filter(signal=>Date.parse(signal.validUntil)<now.getTime());
  if(stale.length)return{status:"review_required",reasonCodes:["stale_readiness"],warnings:["Refresh readiness before approval."]};
  if(input.history.adverseResponses>0)return{status:"eligible_with_warnings",reasonCodes:["adverse_response_history"],warnings:["Coach review of prior adverse response is required."]};
  return{status:"eligible",reasonCodes:[],warnings:[]};
}

export function validateObjectiveGraph(input:TrainingProgramInput){
  const ids=new Set(input.objectives.map(item=>item.id));
  const errors:string[]=[];
  for(const objective of input.objectives){
    for(const dependency of objective.dependencies)if(!ids.has(dependency))errors.push(`missing_dependency:${objective.id}:${dependency}`);
  }
  const visiting=new Set<string>(),visited=new Set<string>();
  const visit=(id:string)=>{
    if(visiting.has(id)){errors.push(`cycle:${id}`);return;}
    if(visited.has(id))return;visiting.add(id);
    input.objectives.find(item=>item.id===id)?.dependencies.forEach(visit);
    visiting.delete(id);visited.add(id);
  };
  input.objectives.forEach(item=>visit(item.id));
  return{valid:errors.length===0,errors};
}

const dateAt=(start:string,offset:number)=>{
  const value=new Date(`${start}T00:00:00.000Z`);value.setUTCDate(value.getUTCDate()+offset);return value.toISOString().slice(0,10);
};
const weekdayAt=(start:string,offset:number)=>{
  const value=new Date(`${start}T00:00:00.000Z`);value.setUTCDate(value.getUTCDate()+offset);
  const day=value.getUTCDay();return day===0?7:day;
};
const exercise=(id:string,objectiveIds:string[])=>{
  const item=approvedExercise(id);
  return{exerciseId:item.id,catalogVersion:TRAINING_CATALOG_VERSION as typeof TRAINING_CATALOG_VERSION,dosage:item.defaultDosage,
    objectiveIds,rationale:`Approved catalog exercise supports ${objectiveIds.join(", ")}.`,
    ruleIds:["TPI-CATALOG-001"]};
};

function selectKeyOffsets(input:TrainingProgramInput){
  const competitionDates=new Set(input.competitions.map(item=>item.date));
  const available=[0,1,2,3,4,5,6].filter(offset=>
    input.context.availableWeekdays.includes(weekdayAt(input.context.startDate,offset))&&
    !competitionDates.has(dateAt(input.context.startDate,offset)));
  const first=available[0],second=available.find(offset=>first!=null&&offset-first>=2);
  if(first==null||second==null)throw new Error("No weekly structure satisfies two separated key days.");
  return[first,second]as const;
}

export function validateTrainingPlan(input:TrainingProgramInput,sessions:PlanSession[]):PlanValidation{
  const errors:{code:string;message:string;ruleId:string}[]=[];
  const warnings:{code:string;message:string;ruleId:string}[]=[];
  const reviewItems:{code:string;message:string;ruleId:string}[]=[];
  const competitionDates=new Set(input.competitions.map(item=>item.date));
  const maxv=sessions.filter(item=>item.type==="max_velocity").map(item=>item.weekday).sort();
  for(let index=1;index<maxv.length;index++)if(maxv[index]-maxv[index-1]<2)
    errors.push({code:"insufficient_maxv_recovery",message:"Max-velocity sessions require separation.",ruleId:"TPI-REST-MAXV-001"});
  if(sessions.filter(item=>item.highIntensity).length>3)
    errors.push({code:"excessive_high_intensity_days",message:"More than three high-intensity days.",ruleId:"TPI-HI-WEEK-001"});
  sessions.forEach((session,index)=>{
    if(session.durationMinutes>input.context.maximumSessionMinutes)
      errors.push({code:"session_duration_exceeded",message:`Day ${index+1} exceeds availability.`,ruleId:"TPI-DURATION-001"});
    if(competitionDates.has(dateAt(input.context.startDate,index))&&session.type!=="competition")
      errors.push({code:"competition_not_protected",message:`Competition day ${index+1} has training.`,ruleId:"TPI-COMP-001"});
    for(const item of session.exercises){
      try{approvedExercise(item.exerciseId);}catch{
        errors.push({code:"unknown_exercise",message:`Unknown exercise ${item.exerciseId}.`,ruleId:"TPI-CATALOG-001"});
      }
    }
  });
  if(input.history.adverseResponses>0)reviewItems.push({code:"prior_adverse_response",message:"Coach must review prior adverse response.",ruleId:"TPI-APPROVAL-001"});
  return{version:TRAINING_VALIDATION_VERSION,status:errors.length?"invalid":reviewItems.length?"review_required":warnings.length?"valid_with_warnings":"valid",
    errors,warnings,reviewItems,evidenceRequests:input.readiness.length?[]:["Current readiness input"]};
}

export function generateDraftTrainingPlan(raw:unknown,options:{planId?:string;createdAt?:string}={}):TrainingPlanSnapshot{
  const input=trainingProgramInputSchema.parse(raw),eligibility=evaluatePlanningEligibility(input,new Date(input.operationalMetadata.requestedAt));
  if(!["eligible","eligible_with_warnings"].includes(eligibility.status))throw new Error(`planning_ineligible:${eligibility.status}:${eligibility.reasonCodes.join(",")}`);
  const graph=validateObjectiveGraph(input);if(!graph.valid)throw new Error(`objective_graph_invalid:${graph.errors.join(",")}`);
  const [first,second]=selectKeyOffsets(input);
  const primary=input.objectives.find(item=>item.allocation==="primary")??input.objectives[0];
  const secondary=input.objectives.find(item=>item.allocation==="secondary")??primary;
  const maintenance=input.objectives.find(item=>item.allocation==="maintenance");
  const competitionByDate=new Map(input.competitions.map(item=>[item.date,item]));
  const sessions:PlanSession[]=Array.from({length:7},(_,offset)=>{
    const weekday=weekdayAt(input.context.startDate,offset),date=dateAt(input.context.startDate,offset);
    if(competitionByDate.has(date))return{id:`day-${offset+1}`,weekday,type:"competition",templateId:"competition-v1",
      durationMinutes:Math.min(120,input.context.maximumSessionMinutes),objectiveIds:[primary.id],exercises:[],highIntensity:true,
      rationale:"Competition day is protected.",ruleIds:["TPI-COMP-001"]};
    if(!input.context.availableWeekdays.includes(weekday))return{id:`day-${offset+1}`,weekday,type:"rest",
      templateId:"rest-v1",durationMinutes:0,objectiveIds:[],exercises:[],highIntensity:false,
      rationale:"Athlete availability or preferred rest structure protects this day.",ruleIds:["TPI-DURATION-001"]};
    if(offset===first){
      const maxVelocity=primary.category==="max_velocity";
      const sprintId=maxVelocity?"fly-20m":"standing-acceleration-20m";
      return{id:`day-${offset+1}`,weekday,type:maxVelocity?"max_velocity":"acceleration",templateId:maxVelocity?"maxv-quality-v1":"acceleration-quality-v1",
        durationMinutes:75,objectiveIds:[primary.id],exercises:[exercise("progressive-sprint-warmup",[primary.id]),exercise(sprintId,[primary.id])],
        highIntensity:true,rationale:"First key session serves the activated primary objective.",ruleIds:["TPI-REST-MAXV-001"]};
    }
    if(offset===second)return{id:`day-${offset+1}`,weekday,type:"acceleration",templateId:"acceleration-power-v1",
      durationMinutes:85,objectiveIds:[secondary.id],exercises:[exercise("progressive-sprint-warmup",[secondary.id]),
      exercise("standing-acceleration-20m",[secondary.id]),...(input.context.facilities.includes("weight_room")&&input.context.equipment.includes("trap_bar")?[exercise("trap-bar-jump-rpe",[secondary.id])]:[])],
      highIntensity:true,rationale:"Second key day is separated and coordinates sprint with optional power work.",ruleIds:["TPI-REST-MAXV-001"]};
    if(maintenance&&offset===Math.min(6,second+2))return{id:`day-${offset+1}`,weekday,type:"tempo",templateId:"tempo-maintenance-v1",
      durationMinutes:45,objectiveIds:[maintenance.id],exercises:[exercise("extensive-tempo-100m",[maintenance.id])],highIntensity:false,
      rationale:"Low-intensity volume is separated from key sprint volume.",ruleIds:["TPI-HI-WEEK-001"]};
    return{id:`day-${offset+1}`,weekday,type:"recovery",templateId:"recovery-v1",durationMinutes:25,objectiveIds:[],
      exercises:[exercise("mobility-recovery",[primary.id])],highIntensity:false,rationale:"Recovery supports quality between key exposures.",ruleIds:["TPI-REST-MAXV-001"]};
  });
  const validation=validateTrainingPlan(input,sessions);if(validation.status==="invalid")throw new Error(`plan_validation_failed:${validation.errors.map(item=>item.code).join(",")}`);
  const sprintExercises=sessions.flatMap(item=>item.exercises).filter(item=>item.dosage.kind==="sprint");
  const volume=(category:string)=>sprintExercises.filter(item=>approvedExercise(item.exerciseId).category===category)
    .reduce((sum,item)=>sum+(item.dosage.kind==="sprint"?item.dosage.sets*item.dosage.repetitions*item.dosage.distanceM:0),0);
  const total=sprintExercises.reduce((sum,item)=>sum+(item.dosage.kind==="sprint"?item.dosage.sets*item.dosage.repetitions*item.dosage.distanceM:0),0);
  const inputFingerprint=trainingFingerprint(materialTrainingInput(input));
  const materialPlan={athleteId:input.athleteId,sourceManifestId:input.sourceManifest.id,startDate:input.context.startDate,
    phase:input.context.seasonPhase,objectives:input.objectives,sessions,catalogVersion:TRAINING_CATALOG_VERSION,ruleSetVersion:TRAINING_RULESET_VERSION};
  const snapshot={
    contractVersion:TRAINING_PLAN_CONTRACT_VERSION,planId:options.planId??randomUUID(),planVersion:1,
    athleteId:input.athleteId,ownerId:input.ownerId,sourceManifestId:input.sourceManifest.id,inputFingerprint,
    planFingerprint:trainingFingerprint(materialPlan),engineVersion:TRAINING_PROGRAM_ENGINE_VERSION,
    catalogVersion:TRAINING_CATALOG_VERSION,ruleSetVersion:TRAINING_RULESET_VERSION,validationVersion:TRAINING_VALIDATION_VERSION,
    startDate:input.context.startDate,endDate:dateAt(input.context.startDate,6),phase:input.context.seasonPhase,
    objectives:input.objectives,sessions,exposure:{totalSprintM:total,accelerationM:volume("acceleration"),
      maximumVelocityM:volume("max_velocity"),lowIntensityTempoM:volume("tempo"),
      highIntensityDays:sessions.filter(item=>item.highIntensity).length},
    load:{neuralIntensity:7,mechanicalIntensity:7,sprintVolumeM:total,highSpeedExposureM:volume("max_velocity"),
      accelerationExposureM:volume("acceleration"),plyometricContacts:0,
      strengthSessions:sessions.filter(item=>item.type==="strength_power"||item.exercises.some(ex=>approvedExercise(ex.exerciseId).category==="power")).length,
      metabolicDemand:4,recoveryCost:6},validation,
    explanations:[
      {decisionId:"phase",explanation:`${input.context.seasonPhase} came from the athlete's supplied season context.`,ruleIds:["TPI-COMP-001"],sourceIds:[input.sourceManifest.id]},
      {decisionId:"primary",explanation:`${primary.category} is primary because the activated upstream allocation marked it primary.`,ruleIds:["TPI-APPROVAL-001"],sourceIds:[primary.sourcePriorityId,primary.sourceRecommendationId]},
      {decisionId:"weekly-structure",explanation:"Key days are separated by recovery and competition dates are protected.",ruleIds:["TPI-REST-MAXV-001","TPI-COMP-001"],sourceIds:[input.requestId]},
    ],
    approval:{requirement:input.requiredCoachApproval||validation.status==="review_required"?"coach_required":"athlete_permitted",approved:false as const},
    lifecycle:"draft"as const,previousPlanId:null,createdAt:options.createdAt??input.operationalMetadata.requestedAt,
  };
  return trainingPlanSnapshotSchema.parse(snapshot);
}

export type TrainingImpact="full_regeneration"|"microcycle_regeneration"|"session_modification"|"readiness_day_adjustment"|"no_material_impact";
export function classifyTrainingImpact(change:"manifest"|"restriction"|"competition"|"catalog"|"rule_set"|"availability"|"readiness"|"telemetry"):TrainingImpact{
  if(["manifest","restriction","catalog","rule_set"].includes(change))return"full_regeneration";
  if(["competition","availability"].includes(change))return"microcycle_regeneration";
  if(change==="readiness")return"readiness_day_adjustment";
  return"no_material_impact";
}
