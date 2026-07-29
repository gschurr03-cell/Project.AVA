import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { FEATURES } from "@/lib/config/features";
import {
  runDiscovery, toResearchSample, type Discovery, type DiscoveryAnalysisRow,
} from "@/lib/research/discovery";
import { createClient } from "@/lib/supabase/server";

const sectionNames: Array<[Discovery["discoveryType"], string]> = [
  ["correlation", "Correlations"],
  ["cluster", "Clusters"],
  ["outlier", "Outliers"],
];

export default async function DiscoveryPage() {
  if (
    process.env.NODE_ENV === "production" ||
    !FEATURES.developerDiagnostics ||
    !FEATURES.biomechanicsDiscovery ||
    !FEATURES.discoveryDeveloperUi
  ) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rows, error } = await supabase
    .from("analyses")
    .select(
      "id,session_id,completed_at,result_payload,experimental,validation_status,compatibility_group,timing_compatibility_group,analysis_pipeline_version,metric_schema_version,model_version,sessions!analyses_session_id_fkey!inner(athlete_id)",
    )
    .eq("status", "complete")
    .eq("excluded_from_history_trends", false)
    .order("completed_at", { ascending: false })
    .limit(500);
  if (error) console.error("[discovery] RLS-scoped research read failed", error);
  const samples = (rows ?? []).flatMap((row) => {
    const sample = toResearchSample(row as unknown as DiscoveryAnalysisRow);
    return sample ? [sample] : [];
  });
  // A fixed timestamp derived from the latest input makes page recomposition
  // deterministic. It is provenance, not the browser request time.
  const generatedAt = samples.map((sample) => sample.capturedAt).sort().at(-1)
    ?? "1970-01-01T00:00:00.000Z";
  const result = runDiscovery(samples, generatedAt);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#f5c451]">
          Development only · Experimental research
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Biomechanics Discovery</h1>
        <p className="mt-3 max-w-3xl text-[#b3bccb]">
          Exploratory patterns from trusted, compatible analyses visible through your
          authenticated RLS scope. Nothing on this page becomes athlete advice.
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs">
          <Pill>{result.sampleSize} compatible samples</Pill>
          <Pill>{result.compatibilityKey ?? "No compatible cohort"}</Pill>
          <Pill>{result.engineVersion}</Pill>
        </div>
      </header>

      {result.warnings.map((warning) => (
        <p key={warning} className="mb-3 rounded-xl border border-[#f5c451]/30 bg-[#f5c451]/10 p-4 text-sm text-[#f5c451]">
          {warning}
        </p>
      ))}

      {sectionNames.map(([type, title]) => {
        const discoveries = result.discoveries.filter((item) => item.discoveryType === type);
        return <DiscoverySection key={type} title={title} discoveries={discoveries} />;
      })}

      <section className="mt-8 rounded-2xl border border-white/[0.08] bg-[#101827] p-5">
        <h2 className="text-xl font-semibold">Movement fingerprints</h2>
        {result.fingerprints.length ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {result.fingerprints.map((fingerprint) => (
              <article key={fingerprint.athleteId} className="rounded-xl border border-white/[0.08] p-4">
                <h3 className="font-semibold">Athlete {fingerprint.athleteId.slice(0, 8)}</h3>
                <p className="mt-1 text-sm text-[#b3bccb]">
                  {fingerprint.sampleSize} sessions · consistency {fingerprint.consistencyScore ?? "unavailable"}
                  {fingerprint.consistencyScore == null ? "" : "/100"} · {fingerprint.confidence} confidence
                </p>
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  {fingerprint.typicalMetrics.map((metric) => (
                    <div key={metric.metric} className="rounded-lg bg-white/[0.035] p-3">
                      <dt className="text-xs text-[#7e8797]">{metric.metric}</dt>
                      <dd>{metric.mean} {metric.unit} <span className="text-xs text-[#7e8797]">± {metric.standardDeviation}</span></dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        ) : <EmptyState text="At least two compatible sessions per athlete are required." />}
      </section>

      <section className="mt-8 rounded-2xl border border-white/[0.08] bg-[#101827] p-5">
        <h2 className="text-xl font-semibold">Discovery timeline</h2>
        <div className="mt-4 space-y-3">
          {result.discoveries.length ? result.discoveries.map((item) => (
            <div key={item.id} className="flex gap-4 border-l border-[#2f80ed]/50 pl-4">
              <time className="text-xs text-[#7e8797]">{new Date(item.generatedAt).toLocaleDateString()}</time>
              <p className="text-sm">{item.title}</p>
            </div>
          )) : <EmptyState text="Emerging discoveries will appear after cohort thresholds are met." />}
        </div>
      </section>
    </main>
  );
}

function DiscoverySection({ title, discoveries }: { title: string; discoveries: Discovery[] }) {
  return (
    <section className="mt-8 rounded-2xl border border-white/[0.08] bg-[#101827] p-5">
      <h2 className="text-xl font-semibold">{title}</h2>
      {discoveries.length ? <div className="mt-4 grid gap-4 lg:grid-cols-2">{discoveries.map((item) => (
        <article key={item.id} className="rounded-xl border border-white/[0.08] p-4">
          <div className="flex flex-wrap justify-between gap-2">
            <h3 className="font-semibold">{item.title}</h3><Pill>Experimental</Pill>
          </div>
          <p className="mt-2 text-sm text-[#b3bccb]">{item.description}</p>
          <p className="mt-3 text-xs text-[#7e8797]">
            n={item.sampleSize} · {item.statisticalStrength} statistical strength · {item.confidence} confidence
          </p>
          <p className="mt-2 text-xs text-[#f5c451]">Requires independent validation</p>
        </article>
      ))}</div> : <EmptyState text="No pattern met the conservative discovery threshold." />}
    </section>
  );
}
function Pill({ children }: { children: ReactNode }) {
  return <span className="max-w-full truncate rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[#b3bccb]">{children}</span>;
}
function EmptyState({ text }: { text: string }) {
  return <p className="mt-4 rounded-xl bg-white/[0.025] p-4 text-sm text-[#7e8797]">{text}</p>;
}
