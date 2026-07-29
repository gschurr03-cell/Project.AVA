import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin, safeOperationalReference } from "@/lib/beta/authorization";
import { ANALYSIS_SUBMISSION_ENABLED } from "@/lib/beta/config";
import { classifyAnalysisFailure } from "@/lib/beta/failureCategories";

const active = ["queued","claimed","downloading","validating","processing","generating_results","uploading_artifacts","completing","retry_scheduled"];
export default async function OperationsPage(){
  const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  if(!await requireAdmin(supabase,user.id))notFound();
  const service=createServiceClient();
  const since=new Date(Date.now()-24*60*60*1000).toISOString();
  const [{data:jobs},{data:support},{data:deletions},{data:audit}]=await Promise.all([
    service.from("analysis_jobs").select("id,analysis_id,session_id,status,attempt_count,max_attempts,created_at,started_at,updated_at,heartbeat_at,worker_version,failure_category,last_error_code,last_error_stage,user_message,user_action_required,manual_retry_allowed").order("updated_at",{ascending:false}).limit(100),
    service.from("support_requests").select("id,safe_reference_id,category,subject,status,created_at,session_id,analysis_id").order("created_at",{ascending:false}).limit(30),
    service.from("account_deletion_requests").select("id,user_id,status,requested_at").order("requested_at",{ascending:false}).limit(30),
    service.from("beta_audit_events").select("id,action,target_type,target_id,created_at").order("created_at",{ascending:false}).limit(30),
  ]);
  const rows=jobs??[];const counts=(status:string)=>rows.filter(j=>j.status===status).length;
  const latestHeartbeat=rows.map(j=>j.heartbeat_at).filter(Boolean).sort().at(-1)??null;
  const heartbeatAge=latestHeartbeat?Date.now()-new Date(latestHeartbeat).getTime():null;
  const workerHealth=heartbeatAge==null?"unknown":heartbeatAge<5*60_000?"healthy":heartbeatAge<15*60_000?"degraded":"unavailable";
  return <main className="ava-carbon min-h-screen p-6 text-white"><div className="mx-auto max-w-6xl"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-[#3b8eff]">Restricted</p><h1 className="text-3xl font-bold">Beta operations</h1></div><Link href="/dashboard" className="text-sm text-[#b3bccb]">Dashboard</Link></div>
  <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
    ["Active",rows.filter(j=>active.includes(j.status)).length],["Retrying",counts("retry_scheduled")],["Failed",counts("failed")+counts("dead_lettered")],["Completed today",rows.filter(j=>j.status==="completed"&&j.updated_at>=since).length],
  ].map(([label,value])=><section key={label} className="rounded-xl border border-white/10 bg-[#182233] p-4"><p className="text-xs uppercase tracking-wider text-[#7e8797]">{label}</p><p className="mt-1 text-3xl font-bold">{value}</p></section>)}</div>
  <section className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-white/10 bg-[#182233] p-4"><p className="text-xs text-[#7e8797]">Worker health</p><p className="mt-1 font-semibold capitalize">{workerHealth}</p><p className="text-xs text-[#7e8797]">{latestHeartbeat?`Last heartbeat ${new Date(latestHeartbeat).toLocaleString()}`:"No heartbeat evidence"}</p></div><div className="rounded-xl border border-white/10 bg-[#182233] p-4"><p className="text-xs text-[#7e8797]">Submissions</p><p className="mt-1 font-semibold">{ANALYSIS_SUBMISSION_ENABLED?"Enabled":"Paused"}</p><p className="text-xs text-[#7e8797]">Read-only environment configuration</p></div><div className="rounded-xl border border-white/10 bg-[#182233] p-4"><p className="text-xs text-[#7e8797]">Release</p><p className="mt-1 font-semibold">{process.env.AVA_RELEASE_VERSION??"development"}</p><p className="text-xs text-[#7e8797]">{process.env.AVA_ENVIRONMENT??"local"}</p></div></section>
  <section className="mt-6 overflow-x-auto rounded-xl border border-white/10 bg-[#182233] p-5"><h2 className="font-semibold">Recent jobs</h2><table className="mt-4 min-w-[850px] w-full text-left text-xs"><thead className="text-[#7e8797]"><tr><th>Reference</th><th>Status</th><th>Age</th><th>Attempt</th><th>Stage/category</th><th>Worker</th><th>Action</th></tr></thead><tbody>{rows.slice(0,30).map(job=><tr key={job.id} className="border-t border-white/5"><td className="py-3">{safeOperationalReference(job.analysis_id,"AVA")}</td><td>{job.status}</td><td>{Math.round((Date.now()-new Date(job.created_at).getTime())/60_000)}m</td><td>{job.attempt_count}/{job.max_attempts}</td><td>{job.last_error_stage??classifyAnalysisFailure(job.failure_category??job.last_error_code)}</td><td>{job.worker_version??"—"}</td><td>{job.manual_retry_allowed?"Eligible for runbook retry":"Inspect only"}</td></tr>)}</tbody></table></section>
  <div className="mt-6 grid gap-5 lg:grid-cols-2"><section className="rounded-xl border border-white/10 bg-[#182233] p-5"><h2 className="font-semibold">Support queue</h2><ul className="mt-3 space-y-3">{support?.length?support.map(item=><li key={item.id} className="border-t border-white/5 pt-3"><p className="text-sm font-semibold">{item.safe_reference_id} · {item.category}</p><p className="text-sm text-[#b3bccb]">{item.subject}</p><p className="text-xs text-[#7e8797]">{item.status} · {new Date(item.created_at).toLocaleString()}</p></li>):<li className="text-sm text-[#7e8797]">No requests.</li>}</ul></section><section className="rounded-xl border border-white/10 bg-[#182233] p-5"><h2 className="font-semibold">Deletion intake</h2><ul className="mt-3 space-y-3">{deletions?.length?deletions.map(item=><li key={item.id} className="border-t border-white/5 pt-3 text-sm"><span className="font-semibold">{safeOperationalReference(item.id,"DEL")}</span> · {item.status}<p className="text-xs text-[#7e8797]">{new Date(item.requested_at).toLocaleString()} · process with deletion runbook</p></li>):<li className="text-sm text-[#7e8797]">No requests.</li>}</ul></section></div>
  <section className="mt-6 rounded-xl border border-white/10 bg-[#182233] p-5"><h2 className="font-semibold">Sensitive-action audit</h2><ul className="mt-3 space-y-2">{audit?.length?audit.map(item=><li key={item.id} className="text-xs text-[#b3bccb]">{new Date(item.created_at).toLocaleString()} · {item.action} · {item.target_type} {item.target_id?safeOperationalReference(item.target_id,"REF"):""}</li>):<li className="text-sm text-[#7e8797]">No beta operator actions recorded.</li>}</ul></section>
  </div></main>;
}

