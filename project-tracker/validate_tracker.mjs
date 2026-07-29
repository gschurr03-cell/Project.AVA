import fs from "node:fs";
import path from "node:path";

const root=process.cwd(),dir=path.join(root,"project-tracker");
const load=name=>JSON.parse(fs.readFileSync(path.join(dir,name),"utf8"));
const tasks=load("ava-tasks.json"),epics=load("ava-epics.json"),features=load("ava-features.json"),
 stories=load("ava-stories.json"),sprints=load("ava-sprints.json"),milestones=load("ava-milestones.json"),
 dependencies=load("ava-dependencies.json"),risks=load("ava-risks.json"),decisions=load("ava-decisions.json");
const errors=[];
const unique=(values,label)=>{const seen=new Set;for(const v of values){if(seen.has(v))errors.push(`duplicate ${label}: ${v}`);seen.add(v)}return seen};
const taskIDs=unique(tasks.map(x=>x.task_id),"task"),epicIDs=unique(epics.map(x=>x.epic_id),"epic"),
 featureIDs=unique(features.map(x=>x.feature_id),"feature"),storyIDs=unique(stories.map(x=>x.story_id),"story"),
 sprintIDs=unique(sprints.map(x=>x.sprint_id),"sprint"),milestoneIDs=unique(milestones.map(x=>x.milestone_id),"milestone");
for(const f of features)if(!epicIDs.has(f.parent_epic))errors.push(`${f.feature_id} invalid epic`);
for(const s of stories)if(!featureIDs.has(s.parent_feature))errors.push(`${s.story_id} invalid feature`);
for(const t of tasks){
 if(!epicIDs.has(t.epic_id)||!featureIDs.has(t.feature_id)||!storyIDs.has(t.story_id))errors.push(`${t.task_id} invalid hierarchy`);
 if(t.sprint_id&&!sprintIDs.has(t.sprint_id))errors.push(`${t.task_id} invalid sprint`);
 if(!milestoneIDs.has(t.milestone_id))errors.push(`${t.task_id} invalid milestone`);
 if(!["P0","P1","P2","P3","P4","P5"].includes(t.priority))errors.push(`${t.task_id} invalid priority`);
 if(!["S0","S1","S2","S3","S4","S5"].includes(t.severity))errors.push(`${t.task_id} invalid severity`);
 if(!["Verified Complete","In Progress","Ready","Blocked","Needs Investigation","Deferred","Removed","Duplicate"].includes(t.status))errors.push(`${t.task_id} invalid status`);
 if(["P0","P1"].includes(t.priority)&&(!t.acceptance_criteria.length||!t.tests_required.length))errors.push(`${t.task_id} lacks critical evidence requirements`);
 for(const d of t.dependency_ids)if(!taskIDs.has(d))errors.push(`${t.task_id} invalid dependency ${d}`);
}
for(const s of sprints)for(const id of s.task_ids)if(!taskIDs.has(id))errors.push(`${s.sprint_id} invalid task ${id}`);
for(const m of milestones)for(const id of m.task_ids)if(!taskIDs.has(id))errors.push(`${m.milestone_id} invalid task ${id}`);
for(const d of dependencies)if(!taskIDs.has(d.from_task_id)||!taskIDs.has(d.to_task_id))errors.push(`${d.dependency_id} invalid reference`);
const visiting=new Set,visited=new Set,map=new Map(tasks.map(t=>[t.task_id,t.dependency_ids]));
function visit(id){if(visiting.has(id)){errors.push(`hard dependency cycle at ${id}`);return}if(visited.has(id))return;visiting.add(id);for(const d of map.get(id)??[])visit(d);visiting.delete(id);visited.add(id)}
for(const id of taskIDs)visit(id);
const mapped=new Set(tasks.flatMap(t=>t.source_finding_ids));
for(let i=1;i<=50;i++){const id=`AVA-${String(i).padStart(3,"0")}`;if(!mapped.has(id))errors.push(`unmapped finding ${id}`)}
const priority=Object.fromEntries(["P0","P1","P2","P3","P4","P5"].map(p=>[p,tasks.filter(t=>t.priority===p).length]));
const baselineTasks=tasks.filter(t=>t.source_finding_ids.some(id=>/^AVA-(?:00[1-9]|0[1-4][0-9]|050)$/.test(id)));
if(baselineTasks.length!==50)errors.push(`expected 50 original audit tasks, got ${baselineTasks.length}`);
const baselinePriority=Object.fromEntries(["P0","P1","P2","P3","P4","P5"].map(p=>[p,baselineTasks.filter(t=>t.priority===p).length]));
if(JSON.stringify(baselinePriority)!==JSON.stringify({P0:20,P1:22,P2:7,P3:0,P4:1,P5:0}))
 errors.push(`original priority reconciliation mismatch ${JSON.stringify(baselinePriority)}`);
if(risks.some(r=>["Critical"].includes(r.impact)&&!r.mitigating_task_ids.length))errors.push("critical risk without task");
if(!decisions.length)errors.push("decision queue empty");
if(errors.length){console.error(errors.join("\n"));process.exit(1)}
console.log(JSON.stringify({valid:true,invalidReferences:0,circularDependencies:0,duplicateIDs:0,
 counts:{epics:epics.length,features:features.length,stories:stories.length,tasks:tasks.length,sprints:sprints.length,milestones:milestones.length},
 priority,baselinePriority},null,2));
