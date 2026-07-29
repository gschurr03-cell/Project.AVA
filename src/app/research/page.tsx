import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";

import { FEATURES } from "@/lib/config/features";
import { createClient } from "@/lib/supabase/server";

const summarySchema = z.object({
  sources: z.number(), claims: z.number(), reviewQueue: z.number(), conflicts: z.number(),
  metricDefinitions: z.number(), auditEvents: z.number(),
  recentSources: z.array(z.object({
    id: z.string(), title: z.string(), sourceType: z.string(), reviewStatus: z.string(), retracted: z.boolean(),
  })),
  recentClaims: z.array(z.object({
    id: z.string(), statement: z.string(), evidenceGrade: z.string(),
    consensusStatus: z.string(), reviewStatus: z.string(),
  })),
});

export default async function ResearchWorkspace() {
  if (!FEATURES.researchKnowledgeEngine || !FEATURES.researchAdminWorkspace) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await supabase.rpc("get_research_workspace_summary");
  if (error) {
    console.warn("[research-workspace] reviewer access denied or migration unavailable", { code: error.code });
    notFound();
  }
  const parsed = summarySchema.safeParse(data);
  if (!parsed.success) notFound();
  const summary = parsed.data;
  const counts = [
    ["Sources", summary.sources], ["Claims", summary.claims], ["Review queue", summary.reviewQueue],
    ["Conflicts", summary.conflicts], ["Metric definitions", summary.metricDefinitions],
    ["Audit events", summary.auditEvents],
  ];
  return (
    <main className="ava-carbon min-h-screen px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#2f80ed]">Restricted reviewer workspace</p>
          <h1 className="mt-2 text-3xl font-semibold">Research Knowledge</h1>
          <p className="mt-2 max-w-3xl text-[#b3bccb]">Review scientific sources and precise claims. No record becomes production evidence without an auditable human decision.</p>
        </header>
        <section aria-label="Research workspace summary" className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {counts.map(([label, value]) => <div key={label} className="rounded-xl border border-white/[0.08] bg-[#101827] p-4"><p className="text-xs text-[#7e8797]">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}
        </section>
        <nav className="mt-8 flex flex-wrap gap-2 text-sm" aria-label="Research workspace sections">
          {["Sources","Claims","Review Queue","Evidence Graph","Metric Definitions","Conflicting Evidence","Internal Discoveries","Validation Studies","Audit History"].map((item) => <span key={item} className="rounded-full border border-white/10 px-3 py-1.5 text-[#b3bccb]">{item}</span>)}
        </nav>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Section title="Sources">
            {summary.recentSources.length ? summary.recentSources.map((source) => (
              <Link key={source.id} href={`/research/sources/${source.id}`} className="block rounded-xl border border-white/[0.08] p-4 hover:border-[#2f80ed]/50">
                <div className="flex justify-between gap-3"><h3 className="font-semibold">{source.title}</h3>{source.retracted ? <span className="text-xs text-[#3b8eff]">Retracted</span> : null}</div>
                <p className="mt-1 text-xs text-[#7e8797]">{source.sourceType} · {source.reviewStatus}</p>
              </Link>
            )) : <Empty>No sources have been submitted.</Empty>}
          </Section>
          <Section title="Claims and review queue">
            {summary.recentClaims.length ? summary.recentClaims.map((claim) => (
              <Link key={claim.id} href={`/research/claims/${claim.id}`} className="block rounded-xl border border-white/[0.08] p-4 hover:border-[#2f80ed]/50">
                <h3 className="font-medium">{claim.statement}</h3>
                <p className="mt-1 text-xs text-[#7e8797]">{claim.evidenceGrade} · {claim.consensusStatus} · {claim.reviewStatus}</p>
              </Link>
            )) : <Empty>No claims are awaiting review.</Empty>}
          </Section>
        </div>
        <p className="mt-8 rounded-xl border border-[#f5c451]/30 bg-[#f5c451]/10 p-4 text-sm text-[#f5c451]">Automated extraction and bulk production approval are disabled. Source ingestion remains metadata-only until licensed document storage and scanning are operational.</p>
      </div>
    </main>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-white/[0.08] bg-[#101827] p-5"><h2 className="mb-4 text-xl font-semibold">{title}</h2><div className="space-y-3">{children}</div></section>;
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-white/[0.025] p-4 text-sm text-[#7e8797]">{children}</p>;
}
