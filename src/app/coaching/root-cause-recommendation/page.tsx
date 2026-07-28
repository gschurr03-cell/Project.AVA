import{notFound,redirect}from"next/navigation";
import{FEATURES}from"@/lib/config/features";
import{adapterContextSchema}from"@/lib/rootCauseRecommendation";
import{createClient}from"@/lib/supabase/server";
import{IntelligenceEmpty as Empty,IntelligencePanel as Panel,IntelligenceStat as Stat}from"@/components/intelligence/IntelligencePrimitives";
import{readActivatedOrLegacySnapshot}from"@/lib/intelligence/orchestration/serverSnapshotResolver";
export default async function Page({searchParams}:{searchParams:Promise<{athleteId?:string}>}){
if(!FEATURES.rootCauseRecommendationDashboardEnabled)notFound();
const{athleteId}=await searchParams;if(!athleteId)notFound();const supabase=await createClient();
const{data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
const data=await readActivatedOrLegacySnapshot({
client:supabase as unknown as Parameters<typeof readActivatedOrLegacySnapshot>[0]["client"],
athleteId,engineId:"root_cause_recommendation_adapter",readLegacy:async()=>{
const result=await supabase.rpc("get_cached_root_cause_recommendation_context"as never,
{p_athlete_id:athleteId}as never);return result.error?null:result.data;}});
const parsed=adapterContextSchema.safeParse(data);if(!parsed.success)notFound();const state=parsed.data;
return <main className="ava-carbon min-h-screen p-6 text-white"><div className="mx-auto max-w-7xl space-y-6">
<header><p className="text-xs font-bold uppercase tracking-[.24em] text-[#2f80ed]">Cached integration intelligence</p>
<h1 className="mt-2 text-3xl font-semibold">Root Cause → Recommendation</h1>
<p className="mt-2 text-[#b3bccb]">Staged, deterministic adapter inspection. Page open never recomputes.</p></header>
<section className="grid gap-4 md:grid-cols-4"><Stat label="Rollout" value={state.rolloutMode}/>
<Stat label="Mappings" value={`${state.appliedMappings.length}/${state.candidateMappings.length} applied`}/>
<Stat label="Rejected" value={String(state.rejectedMappings.length)}/>
<Stat label="Fail closed" value={state.failClosed?"Yes":"No"}/></section>
<div className="grid gap-6 lg:grid-cols-2"><Panel title="Recommendation contexts">
{state.recommendationContexts.length?state.recommendationContexts.map(item=><article key={item.recommendationId}
className="mb-3 rounded-xl bg-white/[.035] p-4"><div className="flex justify-between gap-3">
<p className="font-semibold">{item.catalogEntryId}</p><p className="text-[#f5c451]">
{item.appliedRelevanceModifier>=0?"+":""}{item.appliedRelevanceModifier}</p></div>
<p className="mt-2 text-xs text-[#b3bccb]">{item.relationshipType.replaceAll("_"," ")}</p>
<p className="mt-2 text-xs text-[#7e8797]">{item.wordingContext}</p></article>):<Empty/>}</Panel>
<Panel title="Mapping decisions">{state.candidateMappings.map(item=><p key={`${item.mappingId}:${item.hypothesisId}`}
className="mb-2 text-xs text-[#b3bccb]">{item.mappingId} · {item.accepted?"accepted":"rejected"} · proposed {item.proposedModifier} · applied {item.appliedModifier}</p>)}</Panel>
<Panel title="Unmapped and ambiguous"><p className="text-sm text-[#b3bccb]">
{state.unmappedHypotheses.length} unmapped · {state.ambiguousMappings.length} ambiguous</p></Panel>
<Panel title="Confidence and safety">{state.safetyDecisions.map(item=><p key={item}
className="mb-2 text-xs text-[#b3bccb]">{item}</p>)}</Panel>
<Panel title="Competing hypotheses">{state.competingHypotheses.map(item=><p key={item}
className="mb-2 text-xs text-[#b3bccb]">{item}</p>)}</Panel>
<Panel title="Unknowns and evidence requests"><p className="text-sm text-[#b3bccb]">
{state.unknownVariables.length} unknown(s) · {state.evidenceRequests.length} request(s)</p></Panel>
<Panel title="Shadow comparison">{state.shadowComparison?<p className="text-sm text-[#b3bccb]">
{state.shadowComparison.mappingIds.length} mapping(s) · {state.shadowComparison.orderingDifferences.length} ordering difference(s)</p>:<Empty/>}</Panel>
<Panel title="Deterministic trace"><p className="text-sm text-[#b3bccb]">
{state.trace.length} trace entries · {state.adapterVersion} · {state.mappingRegistryVersion}</p></Panel></div>
</div></main>}
