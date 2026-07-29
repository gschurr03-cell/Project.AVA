import{INTELLIGENCE_ENGINE_REGISTRY,INTELLIGENCE_PIPELINE_EDGES}from"./registry";
import{engineRegistryEntrySchema}from"./shared/contracts";
export type ArchitectureValidation={valid:boolean;errors:string[];warnings:string[]};
export function validateIntelligenceArchitecture():ArchitectureValidation{
  const errors:string[]=[],warnings:string[]=[],ids=new Set<string>();
  for(const raw of INTELLIGENCE_ENGINE_REGISTRY){
    const parsed=engineRegistryEntrySchema.safeParse(raw);
    if(!parsed.success){errors.push(`Invalid registry entry: ${raw.engineId}`);continue}
    if(ids.has(raw.engineId))errors.push(`Duplicate engine ID: ${raw.engineId}`);ids.add(raw.engineId);
    if(raw.contract.offlineCompatible&&!raw.cachePolicy.offlineCompatible)
      errors.push(`${raw.engineId} declares offline output without offline cache policy.`);
    if(raw.lifecycle==="production"&&raw.status==="deprecated")
      errors.push(`${raw.engineId} cannot be production and deprecated.`);
  }
  for(const engine of INTELLIGENCE_ENGINE_REGISTRY)for(const dependency of engine.dependencies)
    if(!ids.has(dependency))errors.push(`${engine.engineId} has missing dependency ${dependency}.`);
  const outgoing=new Map<string,string[]>();
  for(const[from,to]of INTELLIGENCE_PIPELINE_EDGES){
    if(!ids.has(from)||!ids.has(to)){errors.push(`Pipeline edge references missing engine: ${from} -> ${to}`);continue}
    outgoing.set(from,[...(outgoing.get(from)??[]),to]);
  }
  const visiting=new Set<string>(),visited=new Set<string>();
  const visit=(id:string)=>{
    if(visiting.has(id)){errors.push(`Synchronous pipeline cycle detected at ${id}.`);return}
    if(visited.has(id))return;visiting.add(id);
    for(const next of outgoing.get(id)??[])visit(next);
    visiting.delete(id);visited.add(id);
  };[...ids].sort().forEach(visit);
  const pipelineIncoming=new Map<string,string>(
    INTELLIGENCE_PIPELINE_EDGES.map(([from,to])=>[to,from]),
  );
  for(const engine of INTELLIGENCE_ENGINE_REGISTRY)
    if(engine.pipelinePredecessor&&pipelineIncoming.get(engine.engineId)!==engine.pipelinePredecessor)
      errors.push(`${engine.engineId} predecessor metadata disagrees with pipeline.`);
  warnings.push("Coach Report consumes analysis Priority output; it does not yet consume cached Adaptive Coaching state.");
  warnings.push("Mobile is a cache consumer boundary, not a registered engine; a native iOS client is still absent.");
  return{valid:errors.length===0,errors:errors.sort(),warnings};
}
