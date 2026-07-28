import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root=process.cwd(),out=path.join(root,".training-longitudinal-sanity-tmp"),require=createRequire(import.meta.url);
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
try{
  writeFileSync(path.join(out,"tsconfig.json"),JSON.stringify({compilerOptions:{outDir:out,rootDir:path.join(root,"src"),
    module:"commonjs",target:"es2022",skipLibCheck:true,esModuleInterop:true,strict:true,moduleResolution:"node"},
    files:[path.join(root,"src/lib/trainingProgram/index.ts")]}));
  execFileSync("npx",["tsc","-p",path.join(out,"tsconfig.json")],{cwd:root,stdio:"inherit"});
  const training=require(path.join(out,"lib/trainingProgram/index.js"));
  const input=training.TRAINING_PROGRAM_FIXTURE,plan=training.generateTrainingProgramFixture();
  const at="2026-07-18T12:00:00.000Z",date="2026-07-18";
  const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
  const event=(n,type,payload={},extra={})=>({eventVersion:1,eventId:id(100+n),sequence:n,athleteId:input.athleteId,
    ownerId:input.ownerId,occurredAt:at,effectiveDate:date,source:"system",sourceAuthority:"system",type,
    planId:plan.planId,planVersion:1,sessionId:null,exerciseId:null,payload,confidence:.9,
    provenance:{sourceId:`fixture-${n}`,capturedAt:at,contractVersion:"fixture-v1"},idempotencyKey:`fixture-${n}`,...extra});
  const events=[
    event(1,"plan_approved"),event(2,"plan_activated"),
    event(3,"session_scheduled",{}, {sessionId:"day-1"}),
    event(4,"session_completed",{completedFraction:1,qualityMaintained:true},{sessionId:"day-1",exerciseId:"fly-20m"}),
    event(5,"session_scheduled",{}, {sessionId:"day-3"}),
    event(6,"session_completed",{completedFraction:1,qualityMaintained:true},{sessionId:"day-3",exerciseId:"fly-20m"}),
    event(7,"session_modified",{completedFraction:.9,qualityMaintained:true},{sessionId:"day-5",exerciseId:"fly-20m"}),
    event(8,"session_skipped",{rescheduled:false},{sessionId:"day-6"}),
    event(9,"readiness_submitted",{severity:"moderate"}),
    event(10,"coach_review_completed",{decision:"hold_volume"}),
    event(11,"sprint_analysis_activated",{manifestId:id(900)}),
  ];
  const state=training.reduceTrainingEvents(events,{ownerId:input.ownerId,athleteId:input.athleteId});
  const replay=training.reduceTrainingEvents([...events].reverse(),{ownerId:input.ownerId,athleteId:input.athleteId});
  assert.equal(state.fingerprint,replay.fingerprint);
  assert.equal(state.currentPlan.status,"active");assert.equal(state.exposure.completed,2);
  const duplicate=training.reduceTrainingEvents([...events,events[3]],{ownerId:input.ownerId,athleteId:input.athleteId});
  assert.equal(duplicate.exposure.completed,2);assert.equal(duplicate.ignoredDuplicateEventIds.length,1);
  const checkpoint=training.reduceTrainingEvents([events[3]],{ownerId:input.ownerId,athleteId:input.athleteId,checkpoint:state});
  assert.equal(checkpoint.exposure.completed,2);assert.ok(checkpoint.ignoredDuplicateEventIds.includes(events[3].eventId));
  const future={...events[0],eventId:id(998),eventVersion:2,type:"future_training_signal"};
  const futureSafe=training.reduceTrainingEvents([future],{ownerId:input.ownerId,athleteId:input.athleteId});
  assert.deepEqual(futureSafe.ignoredFutureEventIds,[future.eventId]);
  assert.throws(()=>training.reduceTrainingEvents([{...events[0],ownerId:id(999)}],{ownerId:input.ownerId,athleteId:input.athleteId}),/scope_mismatch/);
  const comparable=training.evaluateComparability({sessionType:"maxv",protocolVersion:"1",measurementMethod:"timing",engineVersion:"1"},
    {sessionType:"maxv",protocolVersion:"1",measurementMethod:"timing",engineVersion:"1"});
  assert.equal(comparable.classification,"comparable");
  assert.equal(training.evaluateComparability({sessionType:"a",protocolVersion:"1",measurementMethod:"x",engineVersion:"1"},
    {sessionType:"b",protocolVersion:"1",measurementMethod:"x",engineVersion:"1"}).classification,"noncomparable");
  const qualities=Object.values(state.sessionOutcomes).slice(0,2).map(completion=>training.evaluateSessionQuality({completion,timingConsistency:.97,repetitionDegradationPercent:2}));
  assert.ok(qualities.every(x=>x.mayInfluenceProgression));
  const adaptation=training.evaluateAdaptation({comparability:comparable,quality:qualities,performanceChanges:[.015,.02],
    evidenceEventIds:[events[3].eventId,events[5].eventId],objectiveIds:[input.objectives[0].id]});
  assert.equal(adaptation.classification,"likely_positive");
  assert.equal(training.evaluateProgression({state,qualities,adaptation,fatigue:"normal",competitionWithinDays:10,coachApproved:false}).outcome,"review_required");
  assert.deepEqual(training.evaluatePlateauRegression({comparableExposureCount:5,changes:[-.02,-.03],plannedUnload:true,taper:false,measurementMismatch:false}),
    {plateau:"no_plateau",regression:"planned_reduction_not_regression",confidence:.9});
  const mesocycle=training.generateMesocycle({...input,competitions:[]},{mesocycleId:id(700),durationWeeks:4,createdAt:at});
  assert.equal(mesocycle.weeks.length,4);assert.equal(mesocycle.lifecycle,"draft");
  assert.ok(mesocycle.weeks.every(x=>x.microcycle.lifecycle==="draft"));
  assert.equal(training.generateMesocycle({...input,competitions:[]},{mesocycleId:id(700),durationWeeks:4,createdAt:at}).fingerprint,mesocycle.fingerprint);
  assert.throws(()=>training.generateMesocycle(input,{mesocycleId:id(700),durationWeeks:7,createdAt:at}),/out_of_bounds/);
  const patch=training.createTrainingPlanPatch({patchId:id(800),sourcePlanId:plan.planId,sourcePlanVersion:1,targetPlanVersion:2,
    trigger:"readiness_decline",operations:[{kind:"reduce_volume",path:"sessions.day-5",previousValue:1,newValue:.8}],
    ruleIds:["TPI-HI-WEEK-001"],validation:{valid:true,errors:[]},approvalRequirement:"coach_required",effectiveDate:date,
    provenance:{eventIds:[events[8].eventId],engineVersion:training.TRAINING_PROGRAM_ENGINE_VERSION}});
  assert.equal(patch.targetPlanVersion,2);assert.ok(patch.fingerprint);
  assert.throws(()=>training.createTrainingPlanPatch({...patch,targetPlanVersion:1,fingerprint:undefined}),/new_revision/);
  assert.equal(training.evaluateLongitudinalChangeImpact("missed_low_priority_session").level,"no_material_impact");
  assert.equal(training.evaluateLongitudinalChangeImpact("pain_report").level,"immediate_pause");
  const tolerance=training.evaluateTolerance({domain:"max_velocity",activeRestriction:false,exposures:[1,2,3].map((n)=>({
    eventId:id(300+n),comparable:true,completed:true,qualityMaintained:true,adverseResponse:false,loadRatioToRecent:1}))});
  assert.equal(tolerance.state,"tolerated");
  assert.equal(training.evaluateTolerance({domain:"max_velocity",activeRestriction:false,exposures:[]}).state,"unknown");
  const effectiveness=training.evaluateProgramEffectiveness({adaptations:[adaptation],qualities,adherenceRatio:.85,
    adverseResponseCount:0,readinessStable:true,coachSatisfied:true,athleteAcceptable:true,schedulingFeasible:true});
  assert.equal(effectiveness.classification,"likely_effective");
  const season=training.createTrainingSeason({seasonId:id(910),ownerId:input.ownerId,athleteId:input.athleteId,
    eventFocus:["100m"],startDate:"2026-07-01",endDate:"2026-09-30",
    blocks:[{id:"competition",kind:"competition",startDate:"2026-07-01",endDate:"2026-09-30"}],
    competitions:[{id:"meet-1",date:"2026-08-01",priority:"primary_target",travel:false,status:"scheduled"}],availability:[]});
  assert.ok(season.fingerprint);
  assert.equal(training.evaluateInterruption({cause:"facility_closure",durationDays:1,clinicianRestriction:false,
    readiness:"good",competitionWithinDays:null}).reentry,"resume_unchanged");
  assert.equal(training.evaluateInterruption({cause:"injury_restriction",durationDays:2,clinicianRestriction:true,
    readiness:"reduced",competitionWithinDays:5}).reentry,"clinician_clearance_required");
  const planning=training.createLongitudinalPlanningSnapshot({state,seasonId:season.seasonId,mesocycleId:mesocycle.mesocycleId,
    microcycleId:mesocycle.weeks[0].microcycle.planId,pendingSessionIds:["day-7"],adaptations:[adaptation],
    tolerances:[tolerance],fatigueState:"normal",nextDecisionPoint:"2026-07-25"});
  assert.equal(planning.status,"draft_planning_manifest");assert.ok(planning.fingerprint);
  const audit=training.appendProgramAudit(events);assert.equal(audit.length,events.length);assert.equal(audit[0].sequence,1);
  const pain=event(12,"pain_reported",{severity:"acute",stoppedForPain:true},{sessionId:"day-5"});
  const safetyState=training.reduceTrainingEvents([...events,pain],{ownerId:input.ownerId,athleteId:input.athleteId});
  assert.equal(training.evaluateProgression({state:safetyState,qualities,adaptation,fatigue:"recovery_required",competitionWithinDays:4,coachApproved:true}).outcome,"blocked");
  const pkg=training.createOfflineTrainingPackage({contractVersion:training.TRAINING_MOBILE_CONTRACT_VERSION,packageId:id(850),
    ownerId:input.ownerId,athleteId:input.athleteId,planId:plan.planId,planVersion:1,approvalStatus:"active",
    generatedAt:at,validUntil:"2026-07-20T12:00:00.000Z",lastSynchronizedAt:at,revocationVersion:1,
    currentWeek:{startDate:plan.startDate,endDate:plan.endDate,sessions:plan.sessions},warnings:[],competitionContext:[]});
  assert.equal(training.evaluateOfflinePlanSafety(pkg,{now:at,knownRevocationVersion:2,currentOwnerId:input.ownerId,currentAthleteId:input.athleteId,online:false}).usable,false);
  const ordered=training.prioritizeOfflineEvents([
    {id:"a",type:"session_completed",payload:{},createdAt:at,priority:"normal",idempotencyKey:"a"},
    {id:"b",type:"pain_reported",payload:{},createdAt:at,priority:"safety_critical",idempotencyKey:"b"}]);
  assert.equal(ordered[0].type,"pain_reported");
  console.log("training longitudinal sanity: passed");
}finally{rmSync(out,{recursive:true,force:true})}
