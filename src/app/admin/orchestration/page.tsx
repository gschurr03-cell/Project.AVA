import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { IntelligenceEmpty, IntelligencePanel, IntelligenceStat } from "@/components/intelligence/IntelligencePrimitives";
import { FEATURES } from "@/lib/config/features";
import { INTELLIGENCE_ENGINE_REGISTRY } from "@/lib/intelligence/registry";
import { createClient } from "@/lib/supabase/server";

const dashboardSchema = z.object({
  plans: z.array(z.object({
    id: z.string(), state: z.string(), pipeline_version: z.string(),
    created_at: z.string(), started_at: z.string().nullable(), completed_at: z.string().nullable(),
  })),
  jobs: z.array(z.object({
    id: z.string(), execution_plan_id: z.string(), engine_id: z.string(),
    engine_version: z.string(), state: z.string(), attempt_count: z.number(),
    cache_hit: z.boolean().nullable(), failure_code: z.string().nullable(), created_at: z.string(),
  })),
  activeSnapshot: z.record(z.unknown()).nullable(),
  retries: z.array(z.object({
    execution_job_id: z.string(), attempt_number: z.number(), failure_kind: z.string(),
    failure_code: z.string(), delay_ms: z.number(), created_at: z.string(),
  })),
});
const operationsSchema = z.object({
  shadowRuns: z.array(z.object({ id:z.string(),status:z.string(),created_at:z.string() })),
  comparisons: z.array(z.object({ id:z.string(),readiness:z.string(),blocker_reasons:z.array(z.unknown()),created_at:z.string() })),
  replays: z.array(z.object({ id:z.string(),state:z.string(),cache_mode:z.string(),created_at:z.string() })),
  deadLetters: z.array(z.object({ id:z.string(),engine_id:z.string(),failure_classification:z.string(),
    review_state:z.string(),replay_eligibility:z.string(),created_at:z.string() })),
  health: z.object({state:z.string(),reasons:z.array(z.unknown()),metrics:z.record(z.unknown()),evaluated_at:z.string()}).nullable(),
  readiness: z.object({ready:z.boolean(),gates:z.array(z.unknown()),evaluated_at:z.string()}).nullable(),
});
export default async function OrchestrationPage({
  searchParams,
}: { searchParams: Promise<{ athleteId?: string }> }) {
  if (!FEATURES.intelligenceOrchestrationDashboard) notFound();
  const { athleteId } = await searchParams;
  if (!athleteId) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await supabase.rpc("get_intelligence_orchestration_dashboard" as never,
    { p_athlete_id: athleteId } as never);
  if (error) notFound();
  const parsed = dashboardSchema.safeParse(data);
  if (!parsed.success) notFound();
  const view = parsed.data;
  const operationsResult=await supabase.rpc("get_orchestration_operational_dashboard" as never,
    {p_athlete_id:athleteId,p_limit:25} as never);
  const operations=operationsSchema.safeParse(operationsResult.data);
  const operational=operations.success?operations.data:null;
  const running = view.jobs.filter((job) => job.state === "running");
  const queued = view.jobs.filter((job) => ["queued", "waiting", "ready", "retrying"].includes(job.state));
  const hits = view.jobs.filter((job) => job.cache_hit === true).length;
  const misses = view.jobs.filter((job) => job.cache_hit === false).length;
  return <main className="ava-carbon min-h-screen p-6 text-white">
    <div className="mx-auto max-w-7xl space-y-6">
      <header><p className="text-xs font-bold uppercase tracking-[.24em] text-[#2f80ed]">Trusted orchestration telemetry</p>
        <h1 className="mt-2 text-3xl font-semibold">Intelligence Orchestration</h1>
        <p className="mt-2 text-[#b3bccb]">Owner-scoped, cached execution state. Opening this view never runs an engine.</p></header>
      <section className="grid gap-4 md:grid-cols-4">
        <IntelligenceStat label="Running" value={String(running.length)}/>
        <IntelligenceStat label="Queued" value={String(queued.length)}/>
        <IntelligenceStat label="Cache hits" value={String(hits)}/>
        <IntelligenceStat label="Cache misses" value={String(misses)}/>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <IntelligencePanel title="Registry-derived pipeline graph">
          {INTELLIGENCE_ENGINE_REGISTRY.map((engine) => <p key={engine.engineId} className="mb-2 text-sm text-[#b3bccb]">
            {engine.pipelinePredecessor ? `${engine.pipelinePredecessor} → ` : ""}{engine.engineId} · {engine.engineVersion}
          </p>)}
        </IntelligencePanel>
        <IntelligencePanel title="Engine jobs">
          {view.jobs.length ? view.jobs.slice(0, 30).map((job) => <p key={job.id} className="mb-2 text-sm text-[#b3bccb]">
            {job.engine_id} · <span className="text-white">{job.state}</span> · attempt {job.attempt_count}
            {job.failure_code ? ` · ${job.failure_code}` : ""}
          </p>) : <IntelligenceEmpty>No execution jobs.</IntelligenceEmpty>}
        </IntelligencePanel>
        <IntelligencePanel title="Execution history">
          {view.plans.length ? view.plans.map((plan) => <p key={plan.id} className="mb-2 text-sm text-[#b3bccb]">
            {plan.pipeline_version} · <span className="text-white">{plan.state}</span> · {new Date(plan.created_at).toLocaleString()}
          </p>) : <IntelligenceEmpty>No execution history.</IntelligenceEmpty>}
        </IntelligencePanel>
        <IntelligencePanel title="Retry history and activation">
          <p className="mb-3 text-sm text-[#b3bccb]">{view.activeSnapshot ? "An active atomic pipeline manifest is available." : "No active pipeline manifest."}</p>
          {view.retries.map((retry) => <p key={`${retry.execution_job_id}:${retry.attempt_number}`} className="mb-2 text-xs text-[#7e8797]">
            {retry.failure_code} · attempt {retry.attempt_number} · {retry.delay_ms} ms
          </p>)}
        </IntelligencePanel>
        <IntelligencePanel title="Shadow validation">
          {operational?.shadowRuns.length?operational.shadowRuns.map(run=><p key={run.id}
            className="mb-2 text-sm text-[#b3bccb]">{run.status} · {new Date(run.created_at).toLocaleString()}</p>)
            :<IntelligenceEmpty>No shadow runs.</IntelligenceEmpty>}
          <p className="mt-3 text-xs text-[#7e8797]">{operational?.comparisons.length??0} comparison report(s)</p>
        </IntelligencePanel>
        <IntelligencePanel title="Health and cutover readiness">
          <p className="text-sm text-[#b3bccb]">Health: <span className="text-white">{operational?.health?.state??"validation incomplete"}</span></p>
          <p className="mt-2 text-sm text-[#b3bccb]">Cutover: <span className="text-white">
            {operational?.readiness?.ready?"ready":"blocked"}</span></p>
          <p className="mt-3 text-xs text-[#7e8797]">Rollout {FEATURES.intelligenceOrchestrationRolloutMode} · reads {FEATURES.intelligenceOrchestrationReadMode}</p>
        </IntelligencePanel>
        <IntelligencePanel title="Replay and intervention">
          <p className="text-sm text-[#b3bccb]">{operational?.replays.length??0} replay run(s) · {operational?.deadLetters.length??0} dead letter(s)</p>
          {operational?.deadLetters.map(item=><p key={item.id} className="mt-2 text-xs text-[#7e8797]">
            {item.engine_id} · {item.failure_classification} · {item.review_state} · replay {item.replay_eligibility}
          </p>)}
        </IntelligencePanel>
      </div>
    </div>
  </main>;
}
