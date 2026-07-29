import{execFileSync}from"node:child_process";import{existsSync,mkdirSync,readFileSync,rmSync,writeFileSync}from"node:fs";
import Module,{createRequire}from"node:module";import path from"node:path";import{fileURLToPath}from"node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),out=path.join(root,".intelligence-architecture-sanity-tmp");
const require=createRequire(import.meta.url),resolve=Module._resolveFilename;Module._resolveFilename=function(request,...rest){return resolve.call(this,request.startsWith("@/")?path.join(out,request.slice(2)):request,...rest)};
let ok=true;const check=(label,value)=>{console.log(`${value?"PASS":"FAIL"}  ${label}`);if(!value)ok=false};
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
try{
writeFileSync(path.join(out,"tsconfig.json"),JSON.stringify({compilerOptions:{outDir:out,rootDir:path.join(root,"src"),module:"commonjs",target:"es2022",jsx:"react-jsx",skipLibCheck:true,esModuleInterop:true,strict:true,moduleResolution:"node",baseUrl:root,paths:{"@/*":["src/*"]}},files:[path.join(root,"src/lib/intelligence/index.ts")]}));
execFileSync("npx",["tsc","-p",path.join(out,"tsconfig.json")],{cwd:root,stdio:["ignore","inherit","inherit"]});
const intelligence=require(path.join(out,"lib/intelligence/index.js")),validation=intelligence.validateIntelligenceArchitecture();
check("central registry contains every declared intelligence engine",intelligence.INTELLIGENCE_ENGINE_REGISTRY.length===14&&intelligence.INTELLIGENCE_ENGINE_REGISTRY.some(x=>x.engineId==="training_program"));
check("registry entries are unique, versioned, owned and tested",new Set(intelligence.INTELLIGENCE_ENGINE_REGISTRY.map(x=>x.engineId)).size===14&&intelligence.INTELLIGENCE_ENGINE_REGISTRY.every(x=>x.engineVersion&&x.owner&&x.tests.length&&x.documentation.length&&x.contract.versioned));
check("pipeline and dependency validation passes without cycles",validation.valid&&validation.errors.length===0);
check("canonical pipeline preserves single RCI influence application",intelligence.INTELLIGENCE_PIPELINE_EDGES.filter(([from,to])=>from==="root_cause_recommendation_adapter"&&to==="recommendation").length===1);
check("offline contracts have compatible cache policies",intelligence.INTELLIGENCE_ENGINE_REGISTRY.every(x=>!x.contract.offlineCompatible||x.cachePolicy.offlineCompatible));
check("stable shared fingerprint preserves historical FNV output",intelligence.stableFingerprint({a:1})==="fnv1a-8b9e4511"&&intelligence.stableHashHex({a:1})==="8b9e4511");
check("shared confidence terminology preserves current thresholds",[[75,"High"],[55,"Moderate"],[30,"Low"],[29,"Insufficient"]].every(([score,level])=>intelligence.confidenceLevel100(score)===level));
check("all registry documentation and declared sanity scripts exist",intelligence.INTELLIGENCE_ENGINE_REGISTRY.every(x=>x.documentation.every(file=>existsSync(path.join(root,file)))&&x.tests.every(command=>{const script=command.replace("npm run ","");return JSON.parse(readFileSync(path.join(root,"package.json"),"utf8")).scripts[script]})));
const engineSources=["src/lib/intelligence/interpretations/evaluate.ts","src/lib/intelligence/recommendationEngine/evaluate.ts","src/lib/intelligence/priorityEngine/evaluate.ts","src/lib/adaptiveCoaching/engine.ts","src/lib/performanceOptimization/engine.ts","src/lib/rootCause/engine.ts","src/lib/rootCauseRecommendation/engine.ts"].map(file=>readFileSync(path.join(root,file),"utf8"));
check("intelligence engines share one fingerprint implementation",engineSources.every(text=>/shared\/fingerprint/.test(text))&&engineSources.every(text=>!/2166136261/.test(text)));
const features=readFileSync(path.join(root,"src/lib/config/features.ts"),"utf8");
check("intelligence feature flags remain centralized",/rootCauseRecommendationRolloutMode/.test(features)&&/adaptiveCoachingEngine/.test(features)&&/performanceOptimizationLayer/.test(features));
const migrations=[41,42,43,44,45,46].map(n=>readFileSync(path.join(root,"supabase/migrations",`00${n}_${["performance_projection_foundation","athlete_digital_twin_foundation","adaptive_coaching_state_foundation","performance_optimization_foundation","root_cause_intelligence_foundation","root_cause_recommendation_adapter"][n-41]}.sql`),"utf8"));
check("snapshot migrations consistently enforce RLS and immutable writes",migrations.every(text=>/enable row level security/.test(text)&&/No direct|No update|immutable/i.test(text)));
check("new shared infrastructure is deterministic and provider free",!/Math\.random|randomUUID|openai|anthropic|gemini|claude|gpt/i.test(readFileSync(path.join(root,"src/lib/intelligence/shared/fingerprint.ts"),"utf8")));
}finally{rmSync(out,{recursive:true,force:true})}
if(!ok)process.exit(1);console.log("\\nIntelligence architecture consolidation sanity checks passed.");
