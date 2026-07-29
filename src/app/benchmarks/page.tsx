import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FEATURES } from "@/lib/config/features";
import { createClient } from "@/lib/supabase/server";
import { benchmarkCatalogSchema } from "./catalog";

export default async function BenchmarksPage(){
  if(!FEATURES.eliteBenchmarkEngine||!FEATURES.benchmarkDeveloperUi)notFound();
  const supabase=await createClient(),{data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
  const{data,error}=await supabase.rpc("get_benchmark_developer_catalog");if(error)notFound();
  const parsed=benchmarkCatalogSchema.safeParse(data);if(!parsed.success)notFound();
  return <main className="ava-carbon min-h-screen p-6 text-white"><div className="mx-auto max-w-7xl"><header><p className="text-xs font-bold uppercase tracking-[.24em] text-[#2f80ed]">Restricted developer workspace</p><h1 className="mt-2 text-3xl font-semibold">Benchmark datasets</h1><p className="mt-2 max-w-3xl text-[#b3bccb]">Verified population distributions only. Validation recordings and unsupported legacy “elite” constants are excluded.</p><Link href="/comparisons" className="mt-4 inline-block text-sm text-[#3b8eff]">Open comparison visualizations →</Link></header><section className="mt-8 grid gap-5 lg:grid-cols-2">{parsed.data.datasets.length?parsed.data.datasets.map(({id,contract,reviewStatus,active})=><article key={id} className="rounded-2xl border border-white/10 bg-[#101827] p-5"><div className="flex justify-between gap-3"><h2 className="text-xl font-semibold">{contract.datasetName}</h2><span className="text-xs text-[#f5c451]">{active?"Active":"Inactive"}</span></div><p className="mt-2 text-sm text-[#b3bccb]">{contract.comparisonLevel} · v{contract.datasetVersion} · n={contract.sampleSize} · {reviewStatus}</p><p className="mt-3 text-sm">{contract.population.sex.join(", ")} · {contract.population.events.join(", ")} · {contract.population.competitionLevels.join(", ")}</p><div className="mt-4 flex flex-wrap gap-2">{contract.entries.map(entry=><span key={entry.entryId} className="rounded-full border border-white/10 px-3 py-1 text-xs">{entry.metric} · {entry.phase}</span>)}</div><p className="mt-4 text-xs text-[#7e8797]">{contract.limitations.join(" ")}</p></article>):<Empty/>}</section><p className="mt-8 text-xs text-[#7e8797]">Audit events: {parsed.data.auditEvents}</p></div></main>
}
function Empty(){return <div className="rounded-2xl border border-dashed border-white/10 p-8 text-[#7e8797]"><h2 className="font-semibold text-white">No verified datasets</h2><p className="mt-2 text-sm">Import and review a licensed population dataset through Research Knowledge before comparisons become available.</p></div>}

