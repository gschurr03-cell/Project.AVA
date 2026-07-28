import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),out=path.join(root,".adaptive-coaching-sanity-tmp");
const require=createRequire(import.meta.url),originalResolve=Module._resolveFilename;
Module._resolveFilename=function(request,...rest){return originalResolve.call(this,request.startsWith("@/")?path.join(out,request.slice(2)):request,...rest)};
let ok=true;const check=(label,condition)=>{console.log(`${condition?"PASS":"FAIL"}  ${label}`);if(!condition)ok=false};
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
try{
  writeFileSync(path.join(out,"tsconfig.json"),JSON.stringify({compilerOptions:{outDir:out,rootDir:path.join(root,"src"),module:"commonjs",target:"es2022",skipLibCheck:true,esModuleInterop:true,strict:true,moduleResolution:"node",baseUrl:root,paths:{"@/*":["src/*"]}},files:[path.join(root,"src/lib/adaptiveCoaching/index.ts"),path.join(root,"src/lib/performanceOptimization/index.ts"),path.join(root,"src/lib/digitalTwin/index.ts")]}));
  execFileSync("npx",["tsc","-p",path.join(out,"tsconfig.json")],{cwd:root,stdio:["ignore","inherit","inherit"]});
  const coaching=require(path.join(out,"lib/adaptiveCoaching/index.js")),optimizer=require(path.join(out,"lib/performanceOptimization/index.js")),twinEngine=require(path.join(out,"lib/digitalTwin/index.js"));
  const date=i=>new Date(Date.UTC(2026,i,1)).toISOString();
  const analysis=i=>({eventId:`analysis-${i}`,athleteId:"athlete-1",occurredAt:date(i),recordedAt:date(i),sourceVersion:"analysis-v1",compatibilityKey:"protocol-v1",confidence:.9,payload:{kind:"analysis",analysisId:`a-${i}`,sessionId:`s-${i}`,status:"validated",reportId:null,metrics:[{metric:"topSpeedMps",value:9+i*.1,unit:"m/s",higherIsBetter:true,confidence:.9}]}});
  const recommendation=(id,key,status,future,followUp)=>({eventId:id,athleteId:"athlete-1",occurredAt:date(4),recordedAt:date(4),sourceVersion:"ava-recommendations-v1",compatibilityKey:"protocol-v1",confidence:.8,payload:{kind:"recommendation",recommendationId:id,recommendationKey:key,title:key,context:"Structured synthetic fixture",implementationStatus:status,targetMetric:"topSpeedMps",followUp,futureApplicability:future}});
  const priorities=[2,3,4].map(i=>({eventId:`priority-${i}`,athleteId:"athlete-1",occurredAt:date(i),recordedAt:date(i),sourceVersion:"ava-priorities-v1",compatibilityKey:"protocol-v1",confidence:.8,payload:{kind:"priority",priorityId:`p-${i}`,recommendationId:"rec-accel",category:"acceleration",title:"Acceleration",expectedImpact:"High",priorityKind:"action"}}));
  const events=[analysis(0),analysis(1),analysis(2),analysis(3),analysis(4),...priorities,
    recommendation("rec-effective","maintenance","implemented","supported",{baselineValue:9,latestValue:9.3,unit:"m/s",higherIsBetter:true,compatibilityKey:"protocol-v1",evidenceIds:["analysis-0","analysis-3"]}),
    recommendation("rec-retire","retire","implemented","not_supported",{baselineValue:9,latestValue:9,unit:"m/s",higherIsBetter:true,compatibilityKey:"protocol-v1",evidenceIds:["analysis-0","analysis-3"]})];
  const twin=twinEngine.buildAthleteDigitalTwin({athleteId:"athlete-1",twinId:"twin-1",snapshotId:"twin-snapshot-1",generatedAt:date(5),identity:{fullName:"Synthetic Athlete",sex:"F",dateOfBirth:null,heightCm:170,weightKg:62,trainingAgeYears:3},competitionProfile:{primaryEvents:["100m"],competitionLevel:"university",currentSeason:"2026"},timeline:events,mechanicalFingerprint:null,archetypeSignals:[],previousSnapshot:null,unknownVariables:["sleep"]});
  const evidence=id=>[{evidenceId:`evidence-${id}`,sourceType:"priority",sourceVersion:"ava-priorities-v1",structuredLabel:`Validated ${id} evidence`,confidence:.8,validated:true}];
  const candidate=(id,overrides={})=>({candidateId:id,priorityId:`priority-${id}`,recommendationId:`rec-${id}`,recommendationKey:id,category:id,title:`${id} focus`,objective:`Preserve the existing ${id} objective.`,priorityKind:"action",confidence:.8,expectedImpact:"Moderate",safetyTier:"tier_2",status:"validated",competitionSafe:true,applicableEvents:["100m"],applicableDevelopmentStages:["developing"],supportingEvidence:evidence(id),historicalSessionCount:3,monitoringPlan:{metricKeys:["topSpeedMps"],successSignal:"Stored monitoring success signal.",regressionSignal:"Stored monitoring regression signal.",minimumSessions:2,reviewWindowDays:21},sourceVersions:{recommendation:"ava-recommendations-v1",priority:"ava-priorities-v1"},...overrides});
  const candidates=[
    candidate("acceleration",{expectedImpact:"High",confidence:.9,historicalSessionCount:5}),
    candidate("rhythm",{expectedImpact:"Moderate",confidence:.85}),
    candidate("posture",{expectedImpact:"Low",confidence:.7}),
    candidate("maintenance",{recommendationId:"rec-effective",priorityKind:"strength"}),
    candidate("retire",{recommendationId:"rec-retire"}),
    candidate("limited",{status:"limited"}),
  ];
  const optimizationCandidate=(candidate,index)=>({candidate,expectedRacePerformanceInfluence:.9-index*.08,potentialImprovement:.8-index*.05,probabilityOfSuccess:.8,athleteSpecificity:.85,researchSupport:.7,benchmarkEvidence:.7,projectionConfidence:.65,benchmarkSimilarity:.75,phaseTransfer:.7,eventTransfer:.7,evidenceQuality:.8,expectedPersistence:.8,maintenanceCost:.2,historicalEffectiveness:.4,recommendationAdherence:.8,capturedBenefit:.1,priorInvestmentCount:0,adaptationProfile:"steady_responder",plateauDetected:false,changeRisk:"low",preferredSeasonStages:["specific_preparation"],researchEvidenceIds:[`research-${candidate.candidateId}`],benchmarkComparisonIds:[`benchmark-${candidate.candidateId}`],projectionIds:[`projection-${candidate.candidateId}`],unknownVariables:[]});
  const schedule={scheduleVersion:"schedule-v1",nextCompetitionAt:null,event:null,importance:null};
  const optimize=(candidateList=candidates,overrides=[],competitionSchedule=schedule,digitalTwin=twin,dependencyGraph=[],interactions=[])=>optimizer.evaluatePerformanceOptimization({optimizationId:`optimization-${competitionSchedule.scheduleVersion}-${overrides.map(x=>x.overrideId).join("-")}`,athleteId:"athlete-1",generatedAt:date(5),digitalTwin,candidates:candidateList.map(optimizationCandidate),dependencyGraph,interactions,coachOverrides:overrides,competitionSchedule,seasonContext:{stage:"specific_preparation",circuit:"outdoor",contextVersion:"season-v1"},measurementQuality:.9,researchVersion:"research-v1",benchmarkVersion:"benchmark-v1",projectionVersion:"projection-v1",priorityVersion:"priority-v1",recommendationVersion:"recommendation-v1",unknownVariables:["sleep"]});
  const optimizationState=optimize();
  check("optimization is deterministic and token independent",JSON.stringify(optimize())===JSON.stringify(optimizationState)&&optimizationState.computePolicy.externalModelCalls===0);
  check("optimizer exposes every impact component and modifier",optimizationState.trace.every(x=>x.impactComponents.length===14&&x.modifiers.length>=9));
  check("optimizer limits investment to two and records deferred opportunity cost",optimizationState.recommendedInvestmentOrder.length===2&&optimizationState.deferredFocuses.length&&optimizationState.tradeoffs.length);
  check("expected gain remains normalized and is not represented as race time",!optimizationState.expectedPerformanceGain.calibratedToRaceTime&&optimizationState.expectedPerformanceGain.normalizedExpected>=0);
  check("strength, incomplete evidence and unsupported history receive explicit dispositions",optimizationState.maintenanceFocuses.some(x=>x.candidateId==="maintenance")&&optimizationState.monitoringFocuses.some(x=>x.candidateId==="limited")&&optimizationState.retiredFocuses.some(x=>x.candidateId==="retire"));
  const edgeEvidence=evidence("edge")[0],dependency={edgeId:"edge-posture-rhythm",prerequisiteCandidateId:"posture",unlockedCandidateId:"rhythm",strength:1,evidence:[edgeEvidence],sourceVersion:"graph-v1"};
  const withDependency=optimize(candidates,[],schedule,twin,[dependency]);
  check("explicit dependency is traced and can increase prerequisite return",withDependency.dependencyGraph.length===1&&withDependency.trace.find(x=>x.candidateId==="posture").modifiers.find(x=>x.modifier==="dependency_unlock").multiplier>1);
  let cycleRejected=false;try{optimize(candidates,[],schedule,twin,[dependency,{...dependency,edgeId:"edge-rhythm-posture",prerequisiteCandidateId:"rhythm",unlockedCandidateId:"posture"}])}catch{cycleRejected=true}
  check("dependency cycles fail closed",cycleRejected);
  const positive={interactionId:"interaction-positive",sourceCandidateId:"posture",targetCandidateId:"rhythm",effect:"positive",magnitude:1,evidence:[edgeEvidence],sourceVersion:"interaction-v1"};
  const negative={...positive,interactionId:"interaction-negative",effect:"negative"};
  const pos=optimize(candidates,[],schedule,twin,[],[positive]),neg=optimize(candidates,[],schedule,twin,[],[negative]);
  check("only explicit positive and negative interactions affect return",pos.trace.find(x=>x.candidateId==="posture").finalScore>neg.trace.find(x=>x.candidateId==="posture").finalScore);
  const captured=candidates.map(x=>x.candidateId==="acceleration"?x:x),capturedInput=captured.map(optimizationCandidate);
  capturedInput[0]={...capturedInput[0],capturedBenefit:.95,priorInvestmentCount:10,plateauDetected:true};
  const diminished=optimizer.evaluatePerformanceOptimization({optimizationId:"optimization-diminished",athleteId:"athlete-1",generatedAt:date(5),digitalTwin:twin,candidates:capturedInput,dependencyGraph:[],interactions:[],coachOverrides:[],competitionSchedule:schedule,seasonContext:{stage:"specific_preparation",circuit:"outdoor",contextVersion:"season-v1"},measurementQuality:.9,researchVersion:"research-v1",benchmarkVersion:"benchmark-v1",projectionVersion:"projection-v1",priorityVersion:"priority-v1",recommendationVersion:"recommendation-v1",unknownVariables:["sleep"]});
  check("captured benefit, repeated investment and plateau produce diminishing returns",diminished.trace.find(x=>x.candidateId==="acceleration").modifiers.find(x=>x.modifier==="diminishing_returns").multiplier<.5);
  const overrideActions=["accept","reject","lower_ranking","raise_ranking","lock","disable"];
  check("all structured optimizer override actions parse and remain auditable",overrideActions.every(action=>{try{return optimize(candidates,[{overrideId:`override-${action}`,candidateId:"rhythm",action,reasonCode:"coach_judgment",createdAt:date(5),sourceVersion:"override-v1"}]).overrideAudit[0].action===action}catch{return false}}));
  const baseInput={athleteId:"athlete-1",coachingStateId:"state-1",generatedAt:date(5),digitalTwin:twin,optimizationState,competitionSchedule:schedule,seasonStage:"specific_preparation",trainingPhase:"maximum_velocity",developmentStage:"developing",measurementQuality:.9,researchVersion:"research-v1",benchmarkVersion:"benchmark-v1",unknownVariables:["sleep"],processedTriggers:[{triggerId:"twin-trigger-1",type:"digital_twin_update",sourceId:"twin-snapshot-1",occurredAt:date(5)}],previousState:null};
  const state=coaching.evaluateAdaptiveCoaching(baseInput);
  check("same structured input produces byte-equivalent CoachingState",JSON.stringify(coaching.evaluateAdaptiveCoaching(baseInput))===JSON.stringify(state));
  check("primary focus is deterministic highest-value candidate",state.currentPrimaryFocus?.candidateId==="acceleration");
  check("active improvement coaching is intentionally limited to two focuses",state.secondaryFocuses.length===1&&state.currentPrimaryFocus&&state.monitoringFocuses.some(x=>x.candidateId==="posture"));
  check("strength/effective recommendation becomes maintenance",state.maintenanceFocuses.some(x=>x.candidateId==="maintenance"));
  check("not-supported recommendation history retires priority",state.retiredPriorities.some(x=>x.candidateId==="retire"));
  check("limited candidate becomes monitoring, not active coaching",state.monitoringFocuses.some(x=>x.candidateId==="limited"));
  check("decision chain includes evidence, history, confidence, explanation, unknowns, review and version",state.currentPrimaryFocus.evidence.length&&state.currentPrimaryFocus.historicalSupport.length&&state.currentPrimaryFocus.confidence>0&&state.currentPrimaryFocus.explanation&&state.currentPrimaryFocus.unknownVariables.length&&state.currentPrimaryFocus.reviewAt&&state.currentPrimaryFocus.engineVersion);
  check("output includes season, adaptation, memory, freshness, next evaluation and warnings",state.seasonContext.stage==="specific_preparation"&&state.adaptationSummary.length&&state.recommendationMemory.length&&state.dataFreshness.status==="aging"&&state.nextEvaluation.reviewAt&&Array.isArray(state.activeWarnings));
  const retained=coaching.evaluateAdaptiveCoaching({...baseInput,coachingStateId:"state-2",previousState:{coachingStateId:state.coachingStateId,generatedAt:state.generatedAt,inputFingerprint:state.inputFingerprint,primaryCandidateId:"acceleration"}});
  check("coaching evolution records retained primary focus without rewriting history",retained.coachingEvolution.change==="retained"&&retained.coachingEvolution.previousPrimaryCandidateId==="acceleration");
  const nearSchedule={scheduleVersion:"schedule-v2",nextCompetitionAt:addDays(date(5),7),event:"100m",importance:"high"},nearCandidates=candidates.map(x=>x.candidateId==="acceleration"?{...x,competitionSafe:false}:x);
  const nearCompetition=coaching.evaluateAdaptiveCoaching({...baseInput,coachingStateId:"state-competition",competitionSchedule:nearSchedule,optimizationState:optimize(nearCandidates,[],nearSchedule)});
  check("competition mode moves unsafe new focus to monitoring",nearCompetition.monitoringFocuses.some(x=>x.candidateId==="acceleration")&&nearCompetition.competitionAdjustments.some(x=>x.candidateId==="acceleration"&&x.adjustment==="moved_to_monitoring"));
  const pastSchedule={scheduleVersion:"schedule-past",nextCompetitionAt:date(4),event:"100m",importance:"high"};
  const pastCompetition=coaching.evaluateAdaptiveCoaching({...baseInput,coachingStateId:"state-past-competition",competitionSchedule:pastSchedule,optimizationState:optimize(nearCandidates,[],pastSchedule)});
  check("past competition never leaves protection mode stuck on",pastCompetition.seasonContext.daysToCompetition===null&&pastCompetition.currentPrimaryFocus?.candidateId==="acceleration");
  const optimizationOverride={overrideId:"override-1",candidateId:"rhythm",action:"lock",reasonCode:"coach_judgment",createdAt:date(5),sourceVersion:"coach-override-v1"};
  const overridden=coaching.evaluateAdaptiveCoaching({...baseInput,coachingStateId:"state-override",optimizationState:optimize(candidates,[optimizationOverride])});
  check("structured coach override is deterministic and traceable",overridden.currentPrimaryFocus?.candidateId==="rhythm");
  check("coach override is applied once by optimizer and preserved by coaching",overridden.invalidationContext.overrideIds.includes("override-1")&&overridden.invalidationContext.optimizationId);
  const staleTwin={...twin,confidenceScore:{...twin.confidenceScore,lastEvidenceAt:date(0)}};
  const stale=coaching.evaluateAdaptiveCoaching({...baseInput,coachingStateId:"state-stale",generatedAt:"2027-01-01T00:00:00.000Z",digitalTwin:staleTwin,optimizationState:optimize(candidates,[],schedule,staleTwin)});
  check("stale evidence caps confidence and emits warning",stale.dataFreshness.status==="stale"&&stale.coachingConfidence.score<=49&&stale.activeWarnings.some(x=>/stale/i.test(x)));
  const appOpen={triggerId:"open-1",type:"app_open",sourceId:"mobile-open",occurredAt:date(5)};
  check("app open always serves cache without regeneration",!coaching.shouldRegenerateCoachingState(state,appOpen).regenerate);
  const trigger={triggerId:"new-analysis-1",type:"new_completed_analysis",sourceId:"analysis-6",occurredAt:date(6)};
  check("new completed analysis invalidates cached state",coaching.shouldRegenerateCoachingState(state,trigger).regenerate);
  check("processed trigger replay is idempotent",!coaching.shouldRegenerateCoachingState(state,baseInput.processedTriggers[0]).regenerate);
  const offline=coaching.buildOfflineCoachingCache({state,reportIds:["report-1"],recommendationIds:["rec-1"],benchmarkComparisonIds:["comparison-1"],projectionIds:["projection-1"],drillLibraryVersion:"drills-v1",syncedAt:date(5)});
  check("portable offline cache retains core state and queued mutation capabilities",offline.coachingState.coachingStateId==="state-1"&&["adherence","note","coach_feedback","reminder","upload"].every(x=>offline.queuedMutationsSupported.includes(x)));
  check("compute policy guarantees zero external model calls and deterministic fallback",state.computePolicy.externalModelCalls===0&&state.computePolicy.deterministicFallback&&state.computePolicy.servedFromCacheOnOpen);
  const sourceFiles=readdirSync(path.join(root,"src/lib/adaptiveCoaching")).filter(x=>x.endsWith(".ts")).map(x=>readFileSync(path.join(root,"src/lib/adaptiveCoaching",x),"utf8")).join("\\n");
  const optimizationFiles=readdirSync(path.join(root,"src/lib/performanceOptimization")).filter(x=>x.endsWith(".ts")).map(x=>readFileSync(path.join(root,"src/lib/performanceOptimization",x),"utf8")).join("\\n");
  check("core engine imports no token-priced provider SDK",!/openai|anthropic|gemini|claude|gpt/i.test(sourceFiles));
  check("core contract contains no raw pose, pixel, video, chat or LLM input",!/landmark|mediapipe|pixel|video frame|raw chat|llm.generated/i.test(readFileSync(path.join(root,"src/lib/adaptiveCoaching/contracts.ts"),"utf8")));
  check("randomness is prohibited in implementation",!/Math\.random|randomUUID/.test(sourceFiles));
  check("optimization imports no LLM provider and contains no randomness",!/openai|anthropic|gemini|claude|gpt|Math\\.random|randomUUID/i.test(optimizationFiles));
  check("engine exports no recommendation or performance prediction generator",typeof coaching.generateRecommendations==="undefined"&&typeof coaching.buildPerformanceProjection==="undefined");
  const migration=readFileSync(path.join(root,"supabase/migrations/0043_adaptive_coaching_state_foundation.sql"),"utf8");
  const optimizationMigration=readFileSync(path.join(root,"supabase/migrations/0044_performance_optimization_foundation.sql"),"utf8");
  check("cached state is immutable, owner-scoped and unseeded",/No direct insert\/update\/delete policy/.test(migration)&&/a\.coach_id=auth\.uid\(\)/.test(migration)&&/No coaching values are seeded/.test(migration));
  check("app open cannot enter invalidation queue",/app open does not invalidate CoachingState/.test(migration)&&!/trigger_type text[^;]+app_open/.test(migration));
  check("state append enforces token-free policy and input-fingerprint idempotency",/token-free policy mismatch/.test(migration)&&/on conflict\(athlete_id,input_fingerprint\) do nothing/.test(migration)&&/CoachingState fingerprint collision/.test(migration));
  check("cached read performs no evaluation",/Single cached CoachingState served on app open/.test(migration));
  check("optimization cache is immutable, owner scoped and unseeded",/No direct insert\/update\/delete policy/.test(optimizationMigration)&&/a\.coach_id=auth\.uid\(\)/.test(optimizationMigration)&&/No optimization values are seeded/.test(optimizationMigration));
  check("optimization append is token-free, deterministic and fingerprint-idempotent",/token-free policy mismatch/.test(optimizationMigration)&&/externalModelCalls/.test(optimizationMigration)&&/input_fingerprint\) do nothing/.test(optimizationMigration)&&/fingerprint collision/.test(optimizationMigration));
  check("optimization app open is cache-only and cannot invalidate",/App open never invalidates or recomputes optimization/.test(optimizationMigration)&&/app open does not invalidate PerformanceOptimizationState/.test(optimizationMigration));
}finally{rmSync(out,{recursive:true,force:true})}
if(!ok)process.exit(1);console.log("\\nAdaptive Coaching Intelligence Engine sanity checks passed.");
function addDays(iso,days){return new Date(Date.parse(iso)+days*86400000).toISOString()}
