import { notFound, redirect } from "next/navigation";
import { FEATURES } from "@/lib/config/features";
import { performanceOptimizationStateSchema } from "@/lib/performanceOptimization";
import { createClient } from "@/lib/supabase/server";
import { readActivatedOrLegacySnapshot } from "@/lib/intelligence/orchestration/serverSnapshotResolver";
import { IntelligenceEmpty, IntelligencePanel, IntelligenceStat } from "@/components/intelligence/IntelligencePrimitives";

export default async function OptimizationPage({
  searchParams,
}: { searchParams: Promise<{ athleteId?: string }> }) {
  if (!FEATURES.performanceOptimizationLayer || !FEATURES.optimizationDashboard) notFound();
  const { athleteId } = await searchParams;
  if (!athleteId) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const data = await readActivatedOrLegacySnapshot({
    client: supabase as unknown as Parameters<typeof readActivatedOrLegacySnapshot>[0]["client"],
    athleteId, engineId: "performance_optimization",
    readLegacy: async () => {
      const result = await supabase.rpc("get_cached_performance_optimization" as never,
        { p_athlete_id: athleteId } as never);
      return result.error ? null : result.data;
    },
  });
  const parsed = performanceOptimizationStateSchema.safeParse(data);
  if (!parsed.success) notFound();
  const state = parsed.data;
  return <main className="ava-carbon min-h-screen p-6 text-white">
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[.24em] text-[#2f80ed]">Cached decision intelligence</p>
        <h1 className="mt-2 text-3xl font-semibold">Performance Optimization</h1>
        <p className="mt-2 text-[#b3bccb]">Highest evidence-bounded return on limited training time. This view never recomputes on open.</p>
      </header>
      <section className="grid gap-4 md:grid-cols-3">
        <IntelligenceStat label="Optimization score" value={`${state.optimizationScore}/100`}/>
        <IntelligenceStat label="Confidence" value={`${state.confidence.level} · ${state.confidence.score}/100`}/>
        <IntelligenceStat label="Expected gain" value={state.expectedPerformanceGain.classification.replaceAll("_", " ")}/>
      </section>
      <IntelligencePanel title="Investment order">
        {state.recommendedInvestmentOrder.map((decision) =>
          <Decision key={decision.candidateId} decision={decision}/>)}
      </IntelligencePanel>
      <div className="grid gap-6 lg:grid-cols-2">
        <IntelligencePanel title="Deferred and opportunity cost">
          {state.deferredFocuses.map((decision) =>
            <Decision key={decision.candidateId} decision={decision}/>)}
          {state.tradeoffs.map((tradeoff) =>
            <p key={`${tradeoff.chosenCandidateId}:${tradeoff.alternativeCandidateId}`}
              className="mt-2 text-xs text-[#f5c451]">{tradeoff.explanation}</p>)}
        </IntelligencePanel>
        <IntelligencePanel title="Dependencies">
          {state.dependencyGraph.length ? state.dependencyGraph.map((edge) =>
            <p key={edge.edgeId} className="mb-2 text-sm text-[#b3bccb]">
              {edge.prerequisiteCandidateId} → {edge.unlockedCandidateId} · {Math.round(edge.strength * 100)}%
            </p>) : <IntelligenceEmpty>No explicit stored relationship.</IntelligenceEmpty>}
        </IntelligencePanel>
        <IntelligencePanel title="Maintenance and monitoring">
          {[...state.maintenanceFocuses, ...state.monitoringFocuses].map((decision) =>
            <Decision key={decision.candidateId} decision={decision}/>)}
        </IntelligencePanel>
        <IntelligencePanel title="Decision trace">
          {state.trace.map((trace) =>
            <p key={trace.candidateId} className="mb-2 text-xs text-[#7e8797]">
              {trace.candidateId} · {trace.finalScore}/100 · {trace.impactComponents.length} components · {trace.modifiers.length} modifiers
            </p>)}
        </IntelligencePanel>
      </div>
      <p className="text-xs text-[#7e8797]">{state.engineVersion} · deterministic · zero external model calls</p>
    </div>
  </main>;
}
function Decision({ decision }: {
  decision: ReturnType<typeof performanceOptimizationStateSchema.parse>["recommendedInvestmentOrder"][number],
}) {
  return <article className="mb-3 rounded-xl bg-white/[.035] p-4">
    <div className="flex justify-between gap-3"><p className="font-semibold">{decision.candidate.title}</p>
      <p className="text-sm text-[#f5c451]">{decision.optimizationScore}/100</p></div>
    <p className="mt-2 text-xs text-[#7e8797]">{decision.whySelectedOrDeferred}</p>
  </article>;
}
