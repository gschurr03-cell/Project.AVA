import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),out=path.join(root,".digital-twin-sanity-tmp");
const require=createRequire(import.meta.url),originalResolve=Module._resolveFilename;
Module._resolveFilename=function(request,...rest){return originalResolve.call(this,request.startsWith("@/")?path.join(out,request.slice(2)):request,...rest)};
let ok=true;const check=(label,condition)=>{console.log(`${condition?"PASS":"FAIL"}  ${label}`);if(!condition)ok=false};
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
try{
  writeFileSync(path.join(out,"tsconfig.json"),JSON.stringify({compilerOptions:{outDir:out,rootDir:path.join(root,"src"),module:"commonjs",target:"es2022",skipLibCheck:true,esModuleInterop:true,strict:true,moduleResolution:"node",baseUrl:root,paths:{"@/*":["src/*"]}},files:[path.join(root,"src/lib/digitalTwin/index.ts")]}));
  execFileSync("npx",["tsc","-p",path.join(out,"tsconfig.json")],{cwd:root,stdio:["ignore","inherit","inherit"]});
  const engine=require(path.join(out,"lib/digitalTwin/index.js"));
  const date=i=>new Date(Date.UTC(2026,i,1)).toISOString();
  const analysis=(i,speed,cadence=4.5,compatibilityKey="protocol-v1")=>({
    eventId:`analysis-${i}`,athleteId:"athlete-1",occurredAt:date(i),recordedAt:date(i),
    sourceVersion:"analysis-v1",compatibilityKey,confidence:.9,payload:{kind:"analysis",analysisId:`a-${i}`,sessionId:`s-${i}`,status:"validated",reportId:null,metrics:[
      {metric:"topSpeedMps",value:speed,unit:"m/s",higherIsBetter:true,confidence:.9},
      {metric:"cadenceHz",value:cadence,unit:"Hz",higherIsBetter:true,confidence:.85},
    ]},
  });
  const recommendation={eventId:"rec-1",athleteId:"athlete-1",occurredAt:date(2),recordedAt:date(2),sourceVersion:"ava-recommendations-v1",compatibilityKey:"protocol-v1",confidence:.8,payload:{kind:"recommendation",recommendationId:"rec-1",recommendationKey:"front-side",title:"Monitor front-side mechanics",context:"Compatible max-velocity sessions",implementationStatus:"implemented",targetMetric:"topSpeedMps",followUp:{baselineValue:9.2,latestValue:9.5,unit:"m/s",higherIsBetter:true,compatibilityKey:"protocol-v1",evidenceIds:["analysis-2","analysis-5"]},futureApplicability:"limited"}};
  const earlierRecommendation={...recommendation,eventId:"rec-0",occurredAt:date(1),recordedAt:date(1),payload:{...recommendation.payload,recommendationId:"rec-0",implementationStatus:"not_implemented",followUp:null}};
  const priority=i=>({eventId:`priority-${i}`,athleteId:"athlete-1",occurredAt:date(i),recordedAt:date(i),sourceVersion:"ava-priorities-v1",compatibilityKey:"protocol-v1",confidence:.8,payload:{kind:"priority",priorityId:`p-${i}`,recommendationId:"rec-1",category:"front_side_mechanics",title:"Front-side mechanics",expectedImpact:"Moderate"}});
  const coach={eventId:"coach-1",athleteId:"athlete-1",occurredAt:date(4),recordedAt:date(4),sourceVersion:"coach-memory-v1",compatibilityKey:null,confidence:1,payload:{kind:"coach_interaction",interactionId:"coach-1",action:"accepted_recommendation",linkedEntityId:"rec-1",note:"Accepted for the next block.",rating:4,reminderAt:null}};
  const strength={eventId:"change-1",athleteId:"athlete-1",occurredAt:date(5),recordedAt:date(5),sourceVersion:"validated-change-v1",compatibilityKey:"protocol-v1",confidence:.85,payload:{kind:"validated_change",metric:"topSpeedMps",direction:"improved",previousValue:9.2,currentValue:9.9,unit:"m/s",higherIsBetter:true,evidenceIds:["analysis-2","analysis-5"]}};
  const baseInput=(timeline,overrides={})=>({athleteId:"athlete-1",twinId:"twin-1",snapshotId:"snapshot-1",generatedAt:date(5),identity:{fullName:"Synthetic Sprinter",sex:"F",dateOfBirth:null,heightCm:170,weightKg:62,trainingAgeYears:3},competitionProfile:{primaryEvents:["100m","relay"],competitionLevel:"university",currentSeason:"2026"},timeline,mechanicalFingerprint:null,archetypeSignals:[{signalKey:"frequency_dominance",confidence:.8,supportingEventIds:["analysis-1","analysis-2"],sourceVersion:"fingerprint-v1"},{signalKey:"technical_strength",confidence:.7,supportingEventIds:["analysis-2"],sourceVersion:"interpretation-v1"}],previousSnapshot:null,unknownVariables:["sleep consistency"],...overrides});
  const initialEvents=[analysis(0,9),analysis(1,9.3),analysis(2,9.6)];
  const initial=engine.buildAthleteDigitalTwin(baseInput(initialEvents,{generatedAt:date(2)}));
  check("history accumulation preserves and orders immutable events",initial.timeline.length===3&&initial.timeline[0].eventId==="analysis-0");
  check("three compatible analyses create mean median variance confidence and sources",initial.mechanicalBaselines.some(x=>x.metric==="topSpeedMps"&&x.sampleSize===3&&x.mean===9.3&&x.sourceEventIds.length===3));
  check("rapid compatible progression is detected",initial.trendHistory.find(x=>x.metric==="topSpeedMps")?.classification==="rapid_adaptation");
  check("stable mechanics are detected independently",initial.trendHistory.find(x=>x.metric==="cadenceHz")?.classification==="stable");
  check("regression is detected with metric direction preserved",engine.buildTwinTrends([analysis(0,9.6),analysis(1,9.3),analysis(2,9)]).find(x=>x.metric==="topSpeedMps")?.classification==="regressing");
  check("highly variable history outranks a misleading linear slope",engine.buildTwinTrends([analysis(0,9),analysis(1,10),analysis(2,8.5),analysis(3,10.2)]).find(x=>x.metric==="topSpeedMps")?.classification==="highly_variable");
  check("small nonzero change is classified as plateau",engine.buildTwinTrends([analysis(0,9),analysis(1,9.005),analysis(2,9.01)]).find(x=>x.metric==="topSpeedMps")?.classification==="plateau");
  check("flat early evidence followed by improvement detects delayed adaptation",engine.buildTwinTrends([analysis(0,9),analysis(1,9),analysis(2,9),analysis(3,9),analysis(4,9.1),analysis(5,9.2)]).find(x=>x.metric==="topSpeedMps")?.classification==="delayed_adaptation");
  const fullEvents=[...initialEvents,analysis(3,9.7),analysis(4,9.8),analysis(5,9.9),earlierRecommendation,recommendation,priority(2),priority(3),priority(4),coach,strength];
  const firstSnapshot=engine.createDigitalTwinSnapshot({snapshotId:"snapshot-1",twin:initial,previousSnapshotId:null,reason:"Initial compatible baseline",createdAt:date(2)});
  const updated=engine.buildAthleteDigitalTwin(baseInput(fullEvents,{snapshotId:"snapshot-2",generatedAt:date(5),previousSnapshot:firstSnapshot}));
  check("baseline updates from additional compatible history",updated.mechanicalBaselines.find(x=>x.metric==="topSpeedMps")?.sampleSize===6&&updated.mechanicalBaselines.find(x=>x.metric==="topSpeedMps")?.mean>initial.mechanicalBaselines.find(x=>x.metric==="topSpeedMps").mean);
  const followedRecommendation=updated.recommendationHistory.find(x=>x.recommendationId==="rec-1");
  check("recommendation memory stores implementation and non-causal observed effect",followedRecommendation.effectDirection==="improved"&&followedRecommendation.effectSize>0&&followedRecommendation.causalClaimAllowed===false);
  check("recommendation adherence becomes a formal longitudinal trend",updated.trendHistory.some(x=>x.trendKind==="recommendation_adherence"&&x.classification==="improving"));
  check("priority recurrence becomes a formal longitudinal trend",updated.trendHistory.some(x=>x.trendKind==="priority_recurrence"&&x.classification==="recurring"));
  check("validated improvement becomes strength evolution evidence",updated.trendHistory.some(x=>x.trendKind==="strength"&&x.metric==="topSpeedMps"));
  check("coach memory and recurring priority remain auditable",updated.coachMemory.length===1&&updated.priorityHistory.length===3&&updated.riskFlags.some(x=>x.type==="recurring_priority"));
  check("multiple deterministic archetypes retain snapshot history",updated.movementArchetype.length===2&&updated.movementArchetype.every(x=>x.history.length===2&&x.experimental));
  check("more evidence increases twin confidence",updated.confidenceScore.score>initial.confidenceScore.score);
  const decayed=engine.buildAthleteDigitalTwin(baseInput(fullEvents,{snapshotId:"snapshot-decayed",generatedAt:"2027-07-01T00:00:00.000Z",previousSnapshot:firstSnapshot}));
  check("missing months decay confidence without deleting history",decayed.confidenceScore.score<updated.confidenceScore.score&&decayed.timeline.length===updated.timeline.length);
  const duplicate=engine.accumulateTimeline([...initialEvents,initialEvents[0]]);
  check("exact history replay is idempotent",duplicate.timeline.length===3&&duplicate.duplicateCount===1);
  check("event ID collision fails closed",(()=>{try{engine.accumulateTimeline([...initialEvents,{...initialEvents[0],confidence:.2}]);return false}catch{return true}})());
  const incompatible=engine.buildMechanicalBaselines([...initialEvents,analysis(6,12,4.5,"other"),analysis(7,12.2,4.5,"other")]);
  check("minority incompatible history never changes dominant baseline",incompatible.find(x=>x.metric==="topSpeedMps")?.mean===9.3);
  const updatedSnapshot=engine.createDigitalTwinSnapshot({snapshotId:"snapshot-2",twin:updated,previousSnapshotId:"snapshot-1",reason:"Accumulated follow-up",createdAt:date(5)});
  const comparison=engine.compareDigitalTwinSnapshots(firstSnapshot,updatedSnapshot);
  check("snapshot comparison reports added truth without mutating prior snapshot",comparison.addedEventIds.length===10&&firstSnapshot.twin.timeline.length===3);
  const major=engine.assessDigitalTwinSnapshotUpdate(firstSnapshot,updated);
  check("material event accumulation creates a deterministic major-update decision",major.majorUpdate&&major.addedEventIds.length===10&&major.reasons.length>0);
  check("no historical change creates no redundant major snapshot",engine.createMajorUpdateSnapshot({snapshotId:"snapshot-3",current:updated,previous:updatedSnapshot,createdAt:date(6)})===null);
  check("persistence serializers preserve validated athlete identity",engine.serializeTimelineEventForPersistence(strength).p_athlete_id==="athlete-1"&&engine.serializeTwinSnapshotForPersistence(updatedSnapshot).p_snapshot.snapshotId==="snapshot-2");
  check("rollback selects an immutable historical snapshot",engine.selectRollbackSnapshot([firstSnapshot,updatedSnapshot],"snapshot-1","athlete-1").snapshotId==="snapshot-1");
  check("supported event contract includes track, hurdles, relay and future fields",["60m","100m","200m","400m","hurdles","relay","future_field_event"].every(x=>engine.athleteEventSchema.safeParse(x).success));
  const migration=readFileSync(path.join(root,"supabase/migrations/0042_athlete_digital_twin_foundation.sql"),"utf8");
  check("timeline and snapshots are append-only and owner scoped",/no update\/delete policy/i.test(migration)&&/a\.coach_id=auth\.uid\(\)/.test(migration)&&/No athlete data is seeded/.test(migration));
  check("rollback changes only active pointer and appends audit",/active_snapshot_id=excluded\.active_snapshot_id/.test(migration)&&/insert into public\.athlete_digital_twin_audit/.test(migration));
  check("event append is owner-scoped, idempotent, and collision-safe",/append_athlete_timeline_event/.test(migration)&&/on conflict\(athlete_id,event_id\) do nothing/.test(migration)&&/historical event identity collision/.test(migration));
  check("snapshot append, activation and audit are one owner-scoped transaction",/append_and_activate_athlete_digital_twin_snapshot/.test(migration)&&/append_and_activate_snapshot/.test(migration)&&/snapshot athlete identity mismatch/.test(migration));
  check("direct timeline and snapshot writes have no client insert policy",!/for insert with check/i.test(migration));
  check("projection ownership migration uses actual coach_id",/athletes\.coach_id = auth\.uid\(\)/.test(readFileSync(path.join(root,"supabase/migrations/0041_performance_projection_foundation.sql"),"utf8")));
  check("engine never generates recommendations or predictions",typeof engine.generateRecommendations==="undefined"&&typeof engine.buildPerformanceProjection==="undefined");
}finally{rmSync(out,{recursive:true,force:true})}
if(!ok)process.exit(1);console.log("\\nAthlete Digital Twin sanity checks passed.");
