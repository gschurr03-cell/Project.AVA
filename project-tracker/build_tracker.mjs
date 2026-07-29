import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "project-tracker");
const docs = path.join(root, "docs/engineering-system");
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(docs, { recursive: true });
const date = "2026-07-18";

const epicDefs = [
  ["001","Engineering Foundation","Reproducible repository, builds and engineering governance","DevOps or Platform Engineer","M0",57],
  ["002","Architecture and Result Authority","One versioned source for analysis, manifests and intelligence","Backend Engineer","M2",58],
  ["003","Identity, Authentication and Authorization","Secure identity and tenant isolation across clients","Security Engineer","M1",55],
  ["004","Video Ingestion and Storage","Reliable validated upload, retention and deletion","Backend Engineer","M2",51],
  ["005","Worker and Analysis Reliability","Deployable observable MediaPipe job execution","Computer Vision Engineer","M2",65],
  ["006","Metrics, Confidence and Scientific Validation","Scientifically responsible metrics, confidence and claims","Data or Scientific Engineer","M3",30],
  ["007","Reports and Coaching Intelligence","Consistent reports, root cause, recommendations and priorities","Backend Engineer","M3",53],
  ["008","Native iOS Platform","Signed connected accessible native athlete workflow","Native iOS Engineer","M2",38],
  ["009","Training and Longitudinal Coaching","Persisted coach-approved safe training lifecycle","Backend Engineer","M4",34],
  ["010","Security, Privacy and Legal","Protect data and constrain claims and release risk","Security Engineer","M6",48],
  ["011","Infrastructure, Operations and Observability","Isolated environments, recovery, telemetry and capacity","DevOps or Platform Engineer","M1",31],
  ["012","CI, Testing and Release Engineering","Enforced evidence-producing quality and supply-chain gates","QA Engineer","M0",47],
  ["013","History, Benchmarks and Athlete Progress","Compatible longitudinal and comparison truth","Data or Scientific Engineer","M3",45],
  ["014","Beta, App Store and Public Launch","Controlled progression through release stages","Product or Operations Lead","M6",24],
  ["015","Coach Operations and Notifications","Least-privilege review, escalation and communication","Product or Operations Lead","M5",25],
  ["016","Technical Debt and Documentation","Reduce ambiguity without derailing the critical path","Backend Engineer","M0",45],
];
const epics = epicDefs.map(([n,title,objective,owner,milestone,current]) => ({
  epic_id:`AVA-EPIC-${n}`, title, objective,
  included_scope: objective, excluded_scope:"Unverified expansion outside audited AVA Sprint scope",
  audit_evidence:["docs/audit/ava-codebase-audit-summary.md","docs/backlog/ava-master-engineering-backlog.md"],
  completion_definition:"All child tasks meet the definition of complete with required environment evidence.",
  release_stage:milestone==="M0"?"Foundation":milestone==="M1"?"Staging":milestone==="M2"?"Native vertical slice":
    milestone==="M3"?"Scientific beta":milestone==="M4"?"Training beta":milestone==="M5"?"Coach operations":"Closed beta",
  dependencies:[], current_percentage:current, target_percentage:100, owner_type:owner,
  risk_level:["006","009","010"].includes(n)?"Critical":"High",
}));

const epicByFinding = [
  1,11,11,11,3,8,8,8,5,11,11,10,11,6,6,6,2,2,7,9,9,8,9,6,8,4,4,5,5,12,12,12,12,12,10,8,10,11,14,16,16,11,15,15,5,6,13,13,6,14,
];
const ownerByEpic = Object.fromEntries(epics.map(e=>[e.epic_id,e.owner_type]));
const subsystemByEpic = Object.fromEntries(epics.map(e=>[e.epic_id,e.title]));

const backlog = fs.readFileSync(path.join(root,"docs/backlog/ava-master-engineering-backlog.md"),"utf8");
const rows = backlog.split("\n").filter(line=>/^\| AVA-\d{3} \|/.test(line)).slice(0,50).map(line=>{
  const c=line.split("|").slice(1,-1).map(v=>v.trim());
  return {id:c[0],title:c[1],system:c[2],severity:c[3],priority:c[4],effort:c[5],dependency:c[6],acceptance:c[7]};
});
if(rows.length!==50) throw new Error(`Expected 50 audited findings, found ${rows.length}`);

const externalFindingNumbers=new Set([2,3,4,8,9,10,11,13,14,15,24,25,28,31,34,36,37,38,42,48,50]);
const inProgress=new Set([5,6,7,12,16,17,26,27]);
const deferred=new Set([20,21,22,23,43,48,50]);
const sprintMap = {
  1:"SPRINT-01",30:"SPRINT-01",32:"SPRINT-01",39:"SPRINT-01",40:"SPRINT-01",
  2:"SPRINT-02",3:"SPRINT-02",4:"SPRINT-02",5:"SPRINT-02",10:"SPRINT-02",11:"SPRINT-02",13:"SPRINT-02",38:"SPRINT-02",
  6:"SPRINT-03",12:"SPRINT-03",16:"SPRINT-03",17:"SPRINT-03",
  7:"SPRINT-04",8:"SPRINT-04",25:"SPRINT-04",36:"SPRINT-04",
  26:"SPRINT-05",27:"SPRINT-05",
  9:"SPRINT-06",18:"SPRINT-06",19:"SPRINT-06",28:"SPRINT-06",29:"SPRINT-06",34:"SPRINT-06",45:"SPRINT-06",46:"SPRINT-06",47:"SPRINT-06",49:"SPRINT-06",
  14:"SPRINT-07",15:"SPRINT-07",24:"SPRINT-07",37:"SPRINT-07",
  20:"SPRINT-08",21:"SPRINT-08",
  22:"SPRINT-09",23:"SPRINT-09",43:"SPRINT-09",
  42:"SPRINT-10",44:"SPRINT-10",
  31:"SPRINT-11",33:"SPRINT-11",35:"SPRINT-11",41:"SPRINT-11",
  48:"SPRINT-12",50:"SPRINT-12",
};
const milestoneByEpic={1:"M0",2:"M2",3:"M1",4:"M2",5:"M2",6:"M3",7:"M3",8:"M2",9:"M4",10:"M6",11:"M1",12:"M0",13:"M3",14:"M6",15:"M5",16:"M0"};
const releaseStageByMilestone={M0:"Foundation",M1:"Staging",M2:"Native vertical slice",M3:"Scientific beta",M4:"Training beta",M5:"Coach operations",M6:"Closed beta"};

function taskId(n){return `AVA-${String(n).padStart(4,"0")}`}
function idsFromDependency(raw){
  return [...raw.matchAll(/\d{3}/g)].map(m=>taskId(Number(m[0]))).filter(id=>Number(id.slice(4))<=50);
}
const features=[],stories=[],tasks=[];
for(let i=0;i<rows.length;i++){
  const n=i+1,row=rows[i],epic=`AVA-EPIC-${String(epicByFinding[i]).padStart(3,"0")}`;
  const feature=`AVA-FEAT-${String(n).padStart(3,"0")}`,story=`AVA-STORY-${String(n).padStart(3,"0")}`;
  const milestone=milestoneByEpic[epicByFinding[i]];
  const status=inProgress.has(n)?"In Progress":deferred.has(n)?"Deferred":externalFindingNumbers.has(n)?"Blocked":"Ready";
  features.push({
    feature_id:feature,parent_epic:epic,title:row.title,outcome:row.acceptance,current_state:status,
    desired_state:"Verified Complete",audit_evidence:[row.id],dependencies:idsFromDependency(row.dependency),
    acceptance_summary:row.acceptance,release_stage:releaseStageByMilestone[milestone],status,
    estimated_effort_range:row.effort,
  });
  stories.push({
    story_id:story,parent_feature:feature,actor:ownerByEpic[epic],
    outcome:`Deliver ${row.title.toLowerCase()} with auditable evidence.`,
    rationale:`Closes audited finding ${row.id}.`,acceptance_criteria:[row.acceptance],
    dependencies:idsFromDependency(row.dependency),test_type:row.system.includes("iOS")?"Native/device":
      row.system.includes("Science")?"Scientific/reference":"Unit, integration and release gate",
    release_stage:releaseStageByMilestone[milestone],
  });
  tasks.push({
    task_id:taskId(n),title:row.title,epic_id:epic,feature_id:feature,story_id:story,
    subsystem:row.system,description:`Implement and verify ${row.title.toLowerCase()} without replacing working systems.`,
    reason:`Audited ${row.severity}/${row.priority} finding ${row.id}.`,source_finding_ids:[row.id],
    implementation_boundaries:"Preserve canonical architecture; no unrelated scope expansion.",
    likely_files:["See feature-specific audit and repository inventory"],
    dependency_ids:idsFromDependency(row.dependency),prerequisite_decisions:row.dependency.match(/[A-Za-z]/)?[row.dependency]:[],
    acceptance_criteria:[row.acceptance],tests_required:["Relevant unit/contract tests","Integration or environment evidence required by definition of complete"],
    documentation_required:["Update tracker evidence and affected runbook/architecture document"],
    security_impact:["Security","Authz","Privacy","Upload","Supply chain"].some(x=>row.system.includes(x))?"Direct":"Review",
    scientific_impact:["Science","Metrics","Reports","Intelligence"].some(x=>row.system.includes(x))?"Direct":"None",
    data_migration_impact:["Database","Training","History"].some(x=>row.system.includes(x))?"Possible":"None",
    rollout_requirement:"Feature flag or staged rollout when behavior changes",
    rollback_requirement:"Document rollback before deployment",priority:row.priority,severity:row.severity,
    effort:row.effort,confidence:"Medium",status,release_stage:releaseStageByMilestone[milestone],
    sprint_id:sprintMap[n]??null,milestone_id:milestone,blocked_by_external:externalFindingNumbers.has(n),
    owner_type:ownerByEpic[epic],completion_evidence:[],created_date:date,updated_date:date,
  });
}

const milestoneDefs=[
 ["M0","Engineering Baseline Controlled","Tracker, reproducible build and controlled source truth",[1,30,32,39,40]],
 ["M1","Staging Foundation Verified","Isolated environment, authorization, recovery and telemetry",[2,3,4,5,10,11,13,38]],
 ["M2","Native Analysis Vertical Slice","Signed native capture through one canonical result",[6,7,8,9,12,17,25,26,27,28,29,34,36,45,46,47,49]],
 ["M3","Scientific Beta Gate","Eligible reference evidence and enforced metric/claim gates",[14,15,16,18,19,24,48]],
 ["M4","Training Vertical Slice","Persisted coach-approved training lifecycle",[20,21,22,23]],
 ["M5","Coach Operations Ready","Least-privilege operations and notifications",[43,44]],
 ["M6","Closed-Beta Readiness","Security, legal, support, capacity and release controls",[31,33,35,37,41,42]],
 ["M7","Closed Beta Active","Controlled real cohort and weekly monitoring",[]],
 ["M8","TestFlight Candidate","Signing, archive and device stability",[8,25,36]],
 ["M9","Public Launch Candidate","Production scale and public launch gates",[50]],
];
const milestones=milestoneDefs.map(([id,title,purpose,nums])=>({
 milestone_id:id,title,purpose,entry_criteria:["All hard dependencies satisfied"],
 task_ids:nums.map(taskId),exit_criteria:["All required tasks Verified Complete","Evidence linked"],
 evidence:["Tracker task completion evidence"],release_decision:"GO only after exit criteria",current_percentage:id==="M0"?45:0,
}));
const sprintDefs=[
 ["SPRINT-01","Baseline and Source-of-Truth Decisions","Control the engineering baseline and release truth"],
 ["SPRINT-02","Staging and Data Protection","Establish isolated recoverable authorized staging"],
 ["SPRINT-03","Mobile API Foundation","Versioned secure mobile provider and canonical safe result"],
 ["SPRINT-04","Native Authentication and Networking","Signed native session, profile and environment flow"],
 ["SPRINT-05","Native Upload","Recoverable verified mobile video upload"],
 ["SPRINT-06","Analysis and Canonical Result","Real worker execution and immutable result compatibility"],
 ["SPRINT-07","Scientific and Physical Evidence","Reference cohort, device evidence and claim review"],
 ["SPRINT-08","Training Persistence and Approval","Durable coach-controlled plan lifecycle"],
 ["SPRINT-09","Native Training and Safety Events","Safe offline execution, adherence and notification"],
 ["SPRINT-10","Closed-Beta Operations","Capacity, least-privilege operations and support"],
 ["SPRINT-11","Quality and Security Hardening","Supply chain, tests, CSP and maintainability"],
 ["SPRINT-12","Launch Readiness","Benchmark governance and public-launch program"],
];
const sprints=sprintDefs.map(([id,title,outcome],index)=>{
 const sprintTasks=tasks.filter(t=>t.sprint_id===id);
 return {sprint_id:id,title,duration_days:5,primary_outcome:outcome,task_ids:sprintTasks.map(t=>t.task_id),
 dependencies:[...new Set(sprintTasks.flatMap(t=>t.dependency_ids))].filter(d=>!sprintTasks.some(t=>t.task_id===d)),
 estimated_effort:sprintTasks.map(t=>t.effort).join("+"),p0_count:sprintTasks.filter(t=>t.priority==="P0").length,
 p1_count:sprintTasks.filter(t=>t.priority==="P1").length,
 entry_criteria:["All external/hard dependencies available"],exit_criteria:["Every committed task Verified Complete or explicitly replanned"],
 test_plan:["Run task-required gates and regression suite"],documentation_plan:["Update tracker and sprint implementation report"],
 expected_percentage_impact:index<7?"Evidence-dependent 1–4 points":"Evidence-dependent; no automatic credit",
 };
});
const dependencies=tasks.flatMap(t=>t.dependency_ids.map(dep=>({
 dependency_id:`DEP-${dep}-${t.task_id}`,from_task_id:dep,to_task_id:t.task_id,type:"hard technical dependency",
 rationale:`${t.task_id} names ${dep} as an audited prerequisite.`,
})));
const risks=JSON.parse("["+fs.readFileSync(path.join(root,"docs/audit/risk-register.md"),"utf8")
 .split("\n").filter(l=>/^\| R\d{2} \|/.test(l)).map(l=>{
   const c=l.split("|").slice(1,-1).map(v=>v.trim());
   const mapping={R01:[5],R02:[14,15,16,34],R03:[16,37],R04:[20,21,23,37],R05:[11,12,27],
    R06:[26,27],R07:[9,10,28,29],R08:[22,23],R09:[23,43],R10:[3,31,35],R11:[12,27],
    R12:[7,8,25,36],R13:[17,18,34,47],R14:[13,42],R15:[17,24,37]};
   return JSON.stringify({risk_id:c[0],risk:c[1],likelihood:c[2],impact:c[3],current_control:c[5],
    mitigating_task_ids:(mapping[c[0]]??[]).map(taskId),residual_risk:"Unaccepted until evidence exists",
    milestone:"M6",evidence_required:c[6]});
 }).join(",")+"]");
const decisions=[
 {decision_id:"DEC-001",question:"Which provider/account will host isolated staging?",recommendation:"Use a separate Supabase project plus existing web/worker architecture.",tasks_blocked:["AVA-0002","AVA-0004","AVA-0009","AVA-0010","AVA-0011"],deadline_milestone:"M1",owner_type:"Founder Decision",status:"Open"},
 {decision_id:"DEC-002",question:"Which activated record is canonical across web and native?",recommendation:"Versioned immutable activated result; legacy reads remain until equivalence.",tasks_blocked:["AVA-0017","AVA-0018"],deadline_milestone:"M2",owner_type:"Founder Decision",status:"Recommended"},
 {decision_id:"DEC-003",question:"Which metrics are permitted in coach and athlete beta?",recommendation:"Only registry-supported metrics; keep peak velocity/contact time hidden.",tasks_blocked:["AVA-0015","AVA-0016","AVA-0049"],deadline_milestone:"M3",owner_type:"Founder Decision",status:"Open"},
 {decision_id:"DEC-004",question:"Does training ship in the first coach beta?",recommendation:"No; enable only after persistence, approval and safety events.",tasks_blocked:["AVA-0020","AVA-0021","AVA-0022","AVA-0023"],deadline_milestone:"M4",owner_type:"Founder Decision",status:"Open"},
 {decision_id:"DEC-005",question:"What are retention and deletion defaults?",recommendation:"Shortest viable retention with explicit backup limitations.",tasks_blocked:["AVA-0012","AVA-0027","AVA-0037"],deadline_milestone:"M1",owner_type:"Founder Decision",status:"Open"},
 {decision_id:"DEC-006",question:"Are minors excluded from initial beta?",recommendation:"Exclude until consent, safeguarding and legal review exist.",tasks_blocked:["AVA-0037"],deadline_milestone:"M6",owner_type:"Founder Decision",status:"Open"},
];

const writeJSON=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+"\n");
writeJSON("ava-epics.json",epics);writeJSON("ava-features.json",features);writeJSON("ava-stories.json",stories);
writeJSON("ava-tasks.json",tasks);writeJSON("ava-sprints.json",sprints);writeJSON("ava-milestones.json",milestones);
writeJSON("ava-dependencies.json",dependencies);writeJSON("ava-risks.json",risks);writeJSON("ava-decisions.json",decisions);
const csvHeaders=Object.keys(tasks[0]);
const csvValue=v=>`"${(Array.isArray(v)?v.join(";"):typeof v==="object"?JSON.stringify(v):v??"").toString().replaceAll('"','""')}"`;
fs.writeFileSync(path.join(out,"ava-tasks.csv"),csvHeaders.join(",")+"\n"+tasks.map(t=>csvHeaders.map(h=>csvValue(t[h])).join(",")).join("\n")+"\n");

const table=(headers,rows)=>`| ${headers.join(" | ")} |\n| ${headers.map(()=>"-").join(" | ")} |\n${rows.map(r=>`| ${r.join(" | ")} |`).join("\n")}\n`;
fs.writeFileSync(path.join(docs,"epic-register.md"),"# Epic register\n\n"+table(
 ["Epic","Title","Objective","Owner","Milestone","Current","Target","Risk"],
 epics.map(e=>[e.epic_id,e.title,e.objective,e.owner_type,e.release_stage,`${e.current_percentage}%`,"100%",e.risk_level])));
fs.writeFileSync(path.join(docs,"feature-register.md"),"# Feature register\n\n"+table(
 ["Feature","Epic","Outcome","Status","Priority source","Release","Effort"],
 features.map((f,i)=>[f.feature_id,f.parent_epic,f.outcome,f.status,rows[i].id,f.release_stage,f.estimated_effort_range])));
fs.writeFileSync(path.join(docs,"audit-to-tracker-traceability.md"),"# Audit-to-tracker traceability\n\nEvery audited item maps one-to-one in this first normalization. Broad findings remain decomposable during definition-of-ready review; IDs are never reused.\n\n"+table(
 ["Original","Title","Source","Sev/Pri","Epic","Feature","Story","Task","Disposition"],
 rows.map((r,i)=>[r.id,r.title,"ava-master-engineering-backlog.md",`${r.severity}/${r.priority}`,tasks[i].epic_id,tasks[i].feature_id,tasks[i].story_id,tasks[i].task_id,"Mapped 1:1"])));
fs.writeFileSync(path.join(docs,"dependency-register.md"),"# Dependency register\n\n"+table(
 ["ID","Prerequisite","Dependent","Type","Rationale"],dependencies.map(d=>[d.dependency_id,d.from_task_id,d.to_task_id,d.type,d.rationale])));
fs.writeFileSync(path.join(docs,"milestone-register.md"),"# Milestone register\n\n"+table(
 ["Milestone","Title","Purpose","Tasks","Exit","Current"],milestones.map(m=>[m.milestone_id,m.title,m.purpose,m.task_ids.join(", "),m.exit_criteria.join("; "),`${m.current_percentage}%`])));
fs.writeFileSync(path.join(docs,"initial-12-sprint-roadmap.md"),"# Initial 12-sprint roadmap\n\nSprints are one week and begin only when entry criteria are met.\n\n"+table(
 ["Sprint","Title","Outcome","Tasks","Effort","P0/P1","Dependencies"],sprints.map(s=>[s.sprint_id,s.title,s.primary_outcome,s.task_ids.join(", "),s.estimated_effort,`${s.p0_count}/${s.p1_count}`,s.dependencies.join(", ")||"None"])));
fs.writeFileSync(path.join(docs,"risk-to-task-map.md"),"# Risk-to-task map\n\n"+table(
 ["Risk","Risk statement","Impact","Mitigating tasks","Residual","Milestone"],risks.map(r=>[r.risk_id,r.risk,r.impact,r.mitigating_task_ids.join(", "),r.residual_risk,r.milestone])));
fs.writeFileSync(path.join(docs,"founder-decision-queue.md"),"# Founder decision queue\n\n"+table(
 ["Decision","Question","Recommendation","Blocked tasks","Deadline","Status"],decisions.map(d=>[d.decision_id,d.question,d.recommendation,d.tasks_blocked.join(", "),d.deadline_milestone,d.status])));

console.log(JSON.stringify({epics:epics.length,features:features.length,stories:stories.length,tasks:tasks.length,
 priorities:Object.fromEntries(["P0","P1","P2","P3","P4","P5"].map(p=>[p,tasks.filter(t=>t.priority===p).length])),
 statuses:Object.fromEntries(["Verified Complete","In Progress","Ready","Blocked","Needs Investigation","Deferred"].map(s=>[s,tasks.filter(t=>t.status===s).length]))},null,2));
