import { notFound, redirect } from "next/navigation";
import { FEATURES } from "@/lib/config/features";
import { rootCauseStateSchema } from "@/lib/rootCause";
import { createClient } from "@/lib/supabase/server";
import { IntelligenceEmpty, IntelligencePanel, IntelligenceStat } from "@/components/intelligence/IntelligencePrimitives";
import { readActivatedOrLegacySnapshot } from "@/lib/intelligence/orchestration/serverSnapshotResolver";

export default async function RootCausesPage({searchParams}:{
  searchParams:Promise<{athleteId?:string}>;
}){
  if(!FEATURES.rootCauseIntelligence||!FEATURES.rootCauseDashboard)notFound();
  const{athleteId}=await searchParams;if(!athleteId)notFound();
  const supabase=await createClient(),{data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  const data=await readActivatedOrLegacySnapshot({
    client:supabase as unknown as Parameters<typeof readActivatedOrLegacySnapshot>[0]["client"],
    athleteId,engineId:"root_cause",readLegacy:async()=>{
      const result=await supabase.rpc("get_cached_root_cause_state" as never,
        {p_athlete_id:athleteId} as never);
      return result.error?null:result.data;
    },
  });
  const parsed=rootCauseStateSchema.safeParse(data);if(!parsed.success)notFound();
  const state=parsed.data;
  return <main className="ava-carbon min-h-screen p-6 text-white">
    <div className="mx-auto max-w-6xl space-y-6">
      <header><p className="text-xs font-bold uppercase tracking-[.24em] text-[#2f80ed]">
        Cached causal intelligence</p><h1 className="mt-2 text-3xl font-semibold">
        Root Cause Intelligence</h1><p className="mt-2 text-[#b3bccb]">
        Evidence-bounded hypotheses, never claims of certain causality. This view does not compute on open.</p></header>
      <section className="grid gap-4 md:grid-cols-3">
        <IntelligenceStat label="Confidence" value={`${state.confidence.level} · ${state.confidence.score}/100`}/>
        <IntelligenceStat label="Hypotheses" value={String(state.rootCauseHypotheses.length)}/>
        <IntelligenceStat label="Evidence requests" value={String(state.requiredEvidence.length)}/>
      </section>
      <IntelligencePanel title="Current hypotheses">{state.rootCauseHypotheses.map((item)=>
        <article key={item.hypothesisId} className="mb-3 rounded-xl bg-white/[.035] p-4">
          <div className="flex justify-between gap-3"><p className="font-semibold">
            {item.limiterKey.replaceAll("_"," ")}</p><p className="text-[#f5c451]">
            {Math.round(item.confidence*100)}%</p></div>
          <p className="mt-2 text-sm text-[#b3bccb]">{item.description}</p>
          <p className="mt-2 text-xs text-[#7e8797]">{item.explanation}</p>
        </article>)}</IntelligencePanel>
      <div className="grid gap-6 lg:grid-cols-2">
        <IntelligencePanel title="Competing hypotheses">{state.competingHypotheses.map(item=>
          <p key={item.hypothesisId} className="mb-2 text-sm text-[#b3bccb]">
            #{item.rank} · {item.hypothesisId} · {Math.round(item.relativeSupport*100)}% relative support
          </p>)}</IntelligencePanel>
        <IntelligencePanel title="Causal network">{state.dependencyNetwork.length?state.dependencyNetwork.map(edge=>
          <p key={edge.edgeId} className="mb-2 text-sm text-[#b3bccb]">
            {edge.sourceLimiter.replaceAll("_"," ")} → {edge.targetLimiter.replaceAll("_"," ")}
          </p>):<IntelligenceEmpty>No supported stored relationship.</IntelligenceEmpty>}</IntelligencePanel>
        <IntelligencePanel title="Symptoms">{state.secondarySymptoms.map(item=>
          <p key={item.interpretationId} className="mb-2 text-sm text-[#b3bccb]">
            {item.interpretationId} · {item.relationship.replaceAll("_"," ")}</p>)}</IntelligencePanel>
        <IntelligencePanel title="Required evidence">{state.requiredEvidence.length?state.requiredEvidence.map(item=>
          <p key={item.requestId} className="mb-2 text-sm text-[#b3bccb]">{item.reason}</p>):<IntelligenceEmpty>No supported stored relationship.</IntelligenceEmpty>}</IntelligencePanel>
        <IntelligencePanel title="Research and benchmarks"><p className="text-sm text-[#b3bccb]">
          {state.supportingResearch.length} reviewed research link(s) · {state.supportingBenchmarks.length} compatible benchmark link(s)</p></IntelligencePanel>
        <IntelligencePanel title="Coach feedback"><p className="text-sm text-[#b3bccb]">
          {state.coachOverrides.length} structured action(s) preserved in audit.</p></IntelligencePanel>
      </div>
      <p className="text-xs text-[#7e8797]">{state.engineVersion} · deterministic · zero external model calls</p>
    </div></main>;
}
