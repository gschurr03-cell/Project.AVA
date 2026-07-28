import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { FEATURES } from "@/lib/config/features";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  source: z.object({
    id:z.string(),title:z.string(),source_type:z.string(),metadata:z.unknown(),
    doi:z.string().nullable(),pmid:z.string().nullable(),access_status:z.string(),
    license_status:z.string(),review_status:z.string(),ingestion_status:z.string(),
    retracted:z.boolean(),expression_of_concern:z.boolean(),
    correction_notice:z.string().nullable(),version:z.number(),created_at:z.string(),
  }),
  claims:z.array(z.object({id:z.string(),statement:z.string(),evidenceGrade:z.string(),reviewStatus:z.string(),supportType:z.string(),directness:z.string()})),
  audit:z.array(z.unknown()),
});
export default async function SourceDetail({params}:{params:Promise<{id:string}>}){
  if(!FEATURES.researchKnowledgeEngine||!FEATURES.researchAdminWorkspace)notFound();
  const {id}=await params,supabase=await createClient(),{data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  const {data,error}=await supabase.rpc("get_research_source_detail",{p_source_id:id});
  if(error)notFound();const parsed=schema.safeParse(data);if(!parsed.success)notFound();
  const {source,claims,audit}=parsed.data;
  return <main className="ava-carbon min-h-screen p-6 text-white"><article className="mx-auto max-w-4xl"><Link href="/research" className="text-sm text-[#b3bccb]">← Research</Link><p className="mt-8 text-xs uppercase tracking-widest text-[#2f80ed]">Source detail · v{source.version}</p><h1 className="mt-2 text-3xl font-semibold">{source.title}</h1><p className="mt-3 text-[#b3bccb]">{source.source_type} · {source.review_status} · {source.ingestion_status}</p>{source.retracted?<p className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">Retracted sources cannot support production claims.</p>:null}<dl className="mt-6 grid gap-3 sm:grid-cols-2"><Item label="DOI" value={source.doi??"Unavailable"}/><Item label="PMID" value={source.pmid??"Unavailable"}/><Item label="Access" value={source.access_status}/><Item label="License" value={source.license_status}/><Item label="Correction" value={source.correction_notice??"None recorded"}/><Item label="Expression of concern" value={source.expression_of_concern?"Yes":"No"}/></dl><section className="mt-8"><h2 className="text-xl font-semibold">Linked claims</h2>{claims.map(c=><Link key={c.id} href={`/research/claims/${c.id}`} className="mt-3 block rounded-xl border border-white/10 p-4"><p>{c.statement}</p><p className="mt-1 text-xs text-[#7e8797]">{c.supportType} · {c.directness} · {c.evidenceGrade}</p></Link>)}</section><section className="mt-8"><h2 className="text-xl font-semibold">Audit history</h2><p className="mt-2 text-sm text-[#b3bccb]">{audit.length} immutable event(s)</p></section></article></main>;
}
function Item({label,value}:{label:string;value:string}){return <div className="rounded-xl bg-white/[.035] p-4"><dt className="text-xs text-[#7e8797]">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>}

