import { notFound, redirect } from "next/navigation";
import { FEATURES } from "@/lib/config/features";
import { createClient } from "@/lib/supabase/server";
import type { ProjectionOutput } from "@/lib/projectionEngine";
import { projectionDeveloperSummarySchema } from "./catalog";

export default async function ProjectionsPage() {
  if (!FEATURES.performanceProjectionEngine || !FEATURES.projectionDeveloperUi) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await supabase.rpc("get_projection_developer_summary");
  if (error) notFound();
  const parsed = projectionDeveloperSummarySchema.safeParse(data);
  if (!parsed.success) notFound();
  return (
    <main className="ava-carbon min-h-screen p-6 text-white">
      <div className="mx-auto max-w-7xl">
        <header>
          <p className="text-xs font-bold uppercase tracking-[.24em] text-[#2f80ed]">Restricted developer workspace</p>
          <h1 className="mt-2 text-3xl font-semibold">Performance projections</h1>
          <p className="mt-2 max-w-3xl text-[#b3bccb]">
            Compatible longitudinal trajectories with explicit uncertainty. These are
            evidence-bounded scenarios, not race-time guesses, guarantees, or genetic ceilings.
          </p>
        </header>
        {parsed.data.snapshots.length ? (
          <section className="mt-8 grid gap-6">
            {parsed.data.snapshots.map((snapshot) => (
              <ProjectionCard key={snapshot.id} output={snapshot.output} createdAt={snapshot.createdAt} />
            ))}
          </section>
        ) : (
          <section className="mt-8 rounded-2xl border border-dashed border-white/10 p-8">
            <h2 className="font-semibold">No projection snapshots</h2>
            <p className="mt-2 text-sm text-[#7e8797]">
              Generate only from compatible athlete history and reviewed structured evidence.
              No demonstration values are fabricated.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}

function ProjectionCard({ output, createdAt }: { output: ProjectionOutput; createdAt: string }) {
  const scenarios = [
    ["Conservative", output.conservativeCase],
    ["Expected", output.expectedCase],
    ["Best case", output.bestCase],
  ] as const;
  return (
    <article className="rounded-2xl border border-white/10 bg-[#101827] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[.18em] text-[#7e8797]">{output.projectionType.replaceAll("_", " ")}</p>
          <h2 className="mt-1 text-xl font-semibold">{output.targetMetric}</h2>
          <p className="mt-1 text-sm text-[#b3bccb]">{output.trajectoryType.replaceAll("_", " ")} · {output.timeHorizon.label}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-[#f5c451]">{output.projectionConfidence.level} · {output.projectionConfidence.score}/100</p>
          <p className="mt-1 text-xs text-[#7e8797]">{new Date(createdAt).toLocaleDateString()}</p>
        </div>
      </div>
      {output.status === "available" ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {scenarios.map(([label, value]) => (
              <div key={label} className="rounded-xl bg-white/[.035] p-4">
                <p className="text-xs text-[#7e8797]">{label}</p>
                <p className="mt-1 text-lg font-semibold">{value} {output.unit}</p>
              </div>
            ))}
          </div>
          <ScenarioCurve output={output} />
        </>
      ) : <p className="mt-5 rounded-xl border border-[#f5c451]/30 bg-[#f5c451]/10 p-4 text-sm text-[#f5c451]">No numeric projection: {output.warnings.join(" ")}</p>}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <TextList title="Major limiters" items={output.majorLimiters.map(item => `${item.category}: ${item.severity}`)} />
        <TextList title="Unknowns" items={output.unknownVariables} />
        <TextList title="Would invalidate" items={output.invalidationConditions} />
      </div>
      <p className="mt-5 text-xs text-[#7e8797]">{output.engineVersion} · {output.projectionId}</p>
    </article>
  );
}

function ScenarioCurve({ output }: { output: ProjectionOutput }) {
  if (output.conservativeCase == null || output.expectedCase == null || output.bestCase == null) return null;
  const values = [output.conservativeCase, output.expectedCase, output.bestCase];
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const y = (value: number) => 82 - ((value - min) / range) * 64;
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label="Conservative expected and best-case projection interval" className="mt-5 h-36 w-full rounded-xl bg-black/20 p-2">
      <path d={`M 5 ${y(output.conservativeCase)} L 50 ${y(output.expectedCase)} L 95 ${y(output.bestCase)}`} fill="none" stroke="#2f80ed" strokeWidth="2" />
      {values.map((value, index) => <circle key={index} cx={[5, 50, 95][index]} cy={y(value)} r="2.5" fill="#f5f7fb"><title>{value} {output.unit}</title></circle>)}
    </svg>
  );
}

function TextList({ title, items }: { title: string; items: string[] }) {
  return <div><h3 className="text-sm font-semibold">{title}</h3>{items.length ? <ul className="mt-2 space-y-1 text-xs text-[#b3bccb]">{items.map((item, index) => <li key={`${item}:${index}`}>• {item}</li>)}</ul> : <p className="mt-2 text-xs text-[#7e8797]">None supplied.</p>}</div>;
}
