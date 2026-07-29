import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FEATURES } from "@/lib/config/features";
import { createClient } from "@/lib/supabase/server";
import type { AthleteDigitalTwin, MechanicalBaseline } from "@/lib/digitalTwin";
import { digitalTwinSummarySchema } from "./catalog";

export default async function AthleteIntelligencePage({
  searchParams,
}: { searchParams: Promise<{ athleteId?: string }> }) {
  if (!FEATURES.athleteDigitalTwin || !FEATURES.digitalTwinDashboard) notFound();
  const { athleteId } = await searchParams;
  if (!athleteId) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await supabase.rpc("get_athlete_digital_twin_summary", { p_athlete_id: athleteId });
  if (error) notFound();
  const parsed = digitalTwinSummarySchema.safeParse(data);
  if (!parsed.success) notFound();
  const twin = parsed.data.activeTwin;
  return <main className="ava-carbon min-h-screen p-5 text-white sm:p-8"><div className="mx-auto max-w-7xl">
    <Link href={`/athletes/${athleteId}`} className="text-sm text-[#b3bccb]">← Athlete profile</Link>
    <header className="mt-7"><p className="text-xs font-bold uppercase tracking-[.24em] text-[#2f80ed]">Athlete intelligence</p><h1 className="mt-2 text-3xl font-semibold">{twin?.identity.fullName ?? "Digital Twin"}</h1><p className="mt-2 max-w-3xl text-[#b3bccb]">A versioned longitudinal memory of stored evidence. Historical source outputs are never rewritten.</p></header>
    {twin ? <TwinDashboard twin={twin} snapshotCount={parsed.data.snapshots.length} auditCount={parsed.data.auditEvents}/> :
      <section className="mt-8 rounded-2xl border border-dashed border-white/10 p-8"><h2 className="font-semibold">No active Digital Twin snapshot</h2><p className="mt-2 text-sm text-[#7e8797]">Finalize and promote compatible versioned athlete evidence before this dashboard can display intelligence. No sample history is fabricated.</p></section>}
  </div></main>;
}

function TwinDashboard({ twin, snapshotCount, auditCount }: { twin: AthleteDigitalTwin; snapshotCount: number; auditCount: number }) {
  return <div className="mt-8 space-y-6">
    <section className="grid gap-4 md:grid-cols-4">
      <Stat label="Twin confidence" value={`${twin.confidenceScore.level} · ${twin.confidenceScore.score}/100`}/>
      <Stat label="Timeline events" value={String(twin.timeline.length)}/>
      <Stat label="Twin snapshots" value={String(snapshotCount)}/>
      <Stat label="Audit events" value={String(auditCount)}/>
    </section>
    <section className="grid gap-6 lg:grid-cols-2">
      <Panel title="Mechanical evolution"><div className="space-y-5">{twin.mechanicalBaselines.length?twin.mechanicalBaselines.map(baseline=><MetricEvolution key={`${baseline.metric}:${baseline.compatibilityKey}`} twin={twin} baseline={baseline}/>):<Empty text="No compatible three-session baseline yet."/ >}</div></Panel>
      <Panel title="Movement fingerprint & archetypes"><p className="text-sm text-[#b3bccb]">{twin.mechanicalFingerprint?.summary ?? "No promoted movement fingerprint."}</p><div className="mt-4 flex flex-wrap gap-2">{twin.movementArchetype.length?twin.movementArchetype.map(item=><span key={item.archetype} className="rounded-full border border-[#f5c451]/30 px-3 py-1 text-xs text-[#f5c451]">{item.archetype.replaceAll("_"," ")} · {Math.round(item.confidence*100)}%</span>):<Empty text="No evidence-backed archetype signals."/ >}</div></Panel>
      <Panel title="Strength evolution"><TrendList trends={twin.trendHistory.filter(trend=>trend.trendKind==="strength")}/></Panel>
      <Panel title="Longitudinal trends"><TrendList trends={twin.trendHistory.filter(trend=>trend.trendKind!=="strength")}/></Panel>
      <Panel title="Priority history"><EventList events={twin.priorityHistory}/></Panel>
      <Panel title="Recommendation memory">{twin.recommendationHistory.length?<ul className="space-y-3">{twin.recommendationHistory.map(item=><li key={item.recommendationId} className="rounded-xl bg-white/[.035] p-3"><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-[#b3bccb]">{item.implementationStatus.replaceAll("_"," ")} · observed association: {item.effectDirection.replaceAll("_"," ")}</p></li>)}</ul>:<Empty text="No recommendation follow-up has been recorded."/ >}</Panel>
      <Panel title="Coach memory"><EventList events={twin.coachMemory}/></Panel>
      <Panel title="Timeline"><EventList events={[...twin.timeline].reverse().slice(0,12)}/></Panel>
    </section>
    <section className="rounded-2xl border border-white/10 bg-[#101827] p-5"><h2 className="font-semibold">Data quality and unknowns</h2><p className="mt-2 text-sm text-[#b3bccb]">{twin.dataQuality.compatibleAnalysisCount} compatible analyses · {twin.dataQuality.excludedEventCount} excluded analyses</p><p className="mt-2 text-xs text-[#7e8797]">{twin.unknownVariables.length?twin.unknownVariables.join(" · "):"No unknown variables recorded."}</p></section>
  </div>;
}
function Stat({label,value}:{label:string;value:string}){return <div className="rounded-xl border border-white/[.06] bg-[#182233] p-4"><p className="text-xs text-[#7e8797]">{label}</p><p className="mt-2 font-semibold">{value}</p></div>}
function Panel({title,children}:{title:string;children:React.ReactNode}){return <section className="rounded-2xl border border-white/10 bg-[#101827] p-5"><h2 className="mb-4 font-semibold">{title}</h2>{children}</section>}
function Empty({text}:{text:string}){return <p className="text-sm text-[#7e8797]">{text}</p>}
function EventList({events}:{events:AthleteDigitalTwin["timeline"]}){return events.length?<ul className="space-y-2">{events.map(event=><li key={event.eventId} className="rounded-lg bg-white/[.035] p-3"><p className="text-sm">{event.payload.kind.replaceAll("_"," ")}</p><p className="mt-1 text-xs text-[#7e8797]">{new Date(event.occurredAt).toLocaleDateString()} · {event.sourceVersion}</p></li>)}</ul>:<Empty text="No stored events."/>}
function TrendList({trends}:{trends:AthleteDigitalTwin["trendHistory"]}){return trends.length?<ul className="space-y-2">{trends.map(trend=><li key={trend.trendId} className="rounded-lg bg-white/[.035] p-3"><div className="flex justify-between gap-3"><p className="text-sm">{trend.metric}</p><span className="text-xs text-[#f5c451]">{trend.classification.replaceAll("_"," ")}</span></div><p className="mt-1 text-xs text-[#7e8797]">{trend.trendKind.replaceAll("_"," ")} · n={trend.sampleSize} · {Math.round(trend.confidence*100)}% confidence</p></li>)}</ul>:<Empty text="No compatible trend evidence."/>}
function MetricEvolution({twin,baseline}:{twin:AthleteDigitalTwin;baseline:MechanicalBaseline}){const values=twin.timeline.flatMap(event=>event.payload.kind==="analysis"&&event.compatibilityKey===baseline.compatibilityKey?event.payload.metrics.filter(metric=>metric.metric===baseline.metric&&metric.unit===baseline.unit).map(metric=>metric.value):[]);const min=Math.min(...values),max=Math.max(...values),range=max-min||1,path=values.map((value,index)=>`${index?"L":"M"} ${values.length===1?50:5+index*90/(values.length-1)} ${85-(value-min)/range*65}`).join(" ");return <div><div className="flex justify-between text-sm"><span>{baseline.metric}</span><span>{baseline.mean} {baseline.unit} · n={baseline.sampleSize}</span></div><svg viewBox="0 0 100 100" role="img" aria-label={`${baseline.metric} compatible history`} className="mt-2 h-24 w-full rounded-lg bg-black/20"><path d={path} fill="none" stroke="#2f80ed" strokeWidth="2"/></svg></div>}
