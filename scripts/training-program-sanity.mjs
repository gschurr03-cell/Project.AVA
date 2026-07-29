import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root=process.cwd(),out=path.join(root,".training-program-sanity-tmp"),require=createRequire(import.meta.url);
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
try{
  writeFileSync(path.join(out,"tsconfig.json"),JSON.stringify({compilerOptions:{
    outDir:out,rootDir:path.join(root,"src"),module:"commonjs",target:"es2022",skipLibCheck:true,
    esModuleInterop:true,strict:true,moduleResolution:"node"
  },files:[path.join(root,"src/lib/trainingProgram/index.ts")]}));
  execFileSync("npx",["tsc","-p",path.join(out,"tsconfig.json")],{cwd:root,stdio:"inherit"});
  const training=require(path.join(out,"lib/trainingProgram/index.js"));
  const input=training.TRAINING_PROGRAM_FIXTURE,plan=training.generateTrainingProgramFixture();
  assert.ok(training.TRAINING_EXERCISE_CATALOG.length>=40);
  for(const id of["falling-start-20m","block-start-30m","sled-start-20m","hill-acceleration-30m",
    "wicket-run","speed-endurance-120m","pogo-hops","depth-jump","back-squat","romanian-deadlift",
    "nordic-curl","power-clean","mobility-circuit","pool-recovery"])
    assert.equal(training.approvedExercise(id).id,id);
  assert.equal(training.approvedExercise("depth-jump").advancedFeatureGate,"advanced_depth_jumps");
  assert.equal(training.TRAINING_SESSION_TEMPLATES.length,9);
  training.TRAINING_SESSION_TEMPLATES.forEach(template=>assert.equal(training.trainingSessionTemplate(template.id).id,template.id));
  assert.equal(plan.lifecycle,"draft");assert.equal(plan.approval.approved,false);
  assert.equal(plan.sessions.length,7);assert.notEqual(plan.validation.status,"invalid");
  assert.ok(plan.sessions.filter(x=>x.highIntensity).length<=3);
  assert.ok(plan.sessions.every(x=>x.exercises.every(item=>training.approvedExercise(item.exerciseId))));
  assert.ok(plan.explanations.every(x=>x.ruleIds.length&&x.sourceIds.length));
  for(const days of [3,4,5,6]){
    const weekdays=days===3?[1,3,5]:Array.from({length:days},(_,index)=>index+1);
    const variant={...input,context:{...input.context,availableWeekdays:weekdays},competitions:[]};
    const week=training.generateDraftTrainingPlan(variant);
    assert.equal(week.sessions.filter(item=>item.type!=="rest").length,days);
  }
  assert.equal(training.evaluatePlanningEligibility(input,new Date(input.operationalMetadata.requestedAt)).status,"eligible");
  const repeat=training.generateDraftTrainingPlan(input,{planId:plan.planId,createdAt:plan.createdAt});
  assert.equal(JSON.stringify(repeat),JSON.stringify(plan));assert.equal(repeat.planFingerprint,plan.planFingerprint);
  const metadata={...input,operationalMetadata:{traceId:"other-trace",requestedAt:input.operationalMetadata.requestedAt}};
  assert.equal(training.generateDraftTrainingPlan(metadata,{planId:plan.planId,createdAt:plan.createdAt}).planFingerprint,plan.planFingerprint);
  const changed={...input,context:{...input.context,maximumSessionMinutes:70}};
  assert.throws(()=>training.generateDraftTrainingPlan(changed),/plan_validation_failed/);
  const pain={...input,readiness:[{...input.readiness[0],id:"pain",type:"pain",severity:"acute"}]};
  assert.equal(training.evaluatePlanningEligibility(pain,new Date(input.operationalMetadata.requestedAt)).status,"temporarily_blocked");
  const graphCycle={...input,objectives:input.objectives.map((x,i)=>({...x,dependencies:[input.objectives[(i+1)%input.objectives.length].id]}))};
  assert.equal(training.validateObjectiveGraph(graphCycle).valid,false);
  const unsafe={...input,restrictions:[{id:"restriction",authority:"clinician",affectedRegion:"lower_body",
    prohibitedCategories:["max_velocity"],permittedCategories:[],maximumIntensityPercent:null,maximumVolume:null,
    startsAt:input.operationalMetadata.requestedAt,reviewAt:null,expiresAt:null,medicalClearance:"not_provided",
    provenance:{source:"clinician",sourceId:"clinician-1",capturedAt:input.operationalMetadata.requestedAt,confidence:1}}]};
  assert.equal(training.evaluatePlanningEligibility(unsafe,new Date(input.operationalMetadata.requestedAt)).status,"medically_restricted");
  assert.throws(()=>training.authorizePlanTransition("draft","approved","athlete",plan.validation),/reviewer_role_not_authorized/);
  assert.equal(training.classifyTrainingImpact("readiness"),"readiness_day_adjustment");
  const built=training.buildSessionFromTemplate({templateId:"max-velocity-day-v1",sessionId:"built-1",
    weekday:2,objective:input.objectives[0],programInput:input,historicalUsage:{"fly-20m":2},
    enabledAdvancedFeatures:new Set()});
  assert.equal(built.session.type,"max_velocity");assert.ok(built.trace.every(item=>item.sourceIds.length));
  assert.equal(training.buildSessionFromTemplate({templateId:"max-velocity-day-v1",sessionId:"built-1",
    weekday:2,objective:input.objectives[0],programInput:input,historicalUsage:{"fly-20m":2},
    enabledAdvancedFeatures:new Set()}).session.exercises.map(x=>x.exerciseId).join(","),
    built.session.exercises.map(x=>x.exerciseId).join(","));
  const adherence=(status,quality=true)=>({id:crypto.randomUUID(),ownerId:input.ownerId,athleteId:input.athleteId,
    planId:plan.planId,planVersion:1,sessionId:"day-1",status,completedFraction:status==="completed"?1:.5,
    perceivedIntensity:7,qualityMaintained:quality,notesCategory:"none",occurredAt:input.operationalMetadata.requestedAt,
    idempotencyKey:crypto.randomUUID()});
  const progress=training.decideAdaptation([adherence("completed"),adherence("completed")],
    {readiness:"good",coachApproved:true,restrictionChanged:false});
  assert.equal(progress.kind,"progress");
  assert.equal(training.decideAdaptation([adherence("pain_reported",false)],
    {readiness:"good",coachApproved:true,restrictionChanged:false}).kind,"recovery_only");
  const revisedSession=training.applyAdaptationToSession(plan.sessions.find(x=>x.highIntensity),progress);
  assert.ok(revisedSession.ruleIds.includes("TPI-PROGRESS-001"));
  const revision=training.createPlanRevision({revisionId:crypto.randomUUID(),snapshot:plan,state:"created",
    previous:null,reviewerId:null,rationale:"Initial deterministic draft.",createdAt:plan.createdAt});
  assert.equal(revision.snapshot.planFingerprint,plan.planFingerprint);
  assert.equal(training.analyzeProgramChange("new_competition"),"microcycle_regeneration");
  assert.equal(training.analyzeProgramChange("readiness_improved"),"no_change");
  console.log("training program sanity: passed");
}finally{rmSync(out,{recursive:true,force:true})}
