import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { submitFeedback, submitSupportRequest } from "./actions";

export default async function SupportPage({searchParams}:{searchParams:Promise<{error?:string;submitted?:string;feedback?:string}>}) {
  const params=await searchParams;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  return <main className="ava-carbon min-h-screen p-6 text-white"><div className="mx-auto max-w-3xl">
    <div className="flex items-center justify-between"><Link href={user?"/dashboard":"/"} className="text-sm text-[#b3bccb]">← AVA</Link><Link href="/help" className="text-sm text-[#3b8eff]">Help Center</Link></div>
    <h1 className="mt-7 text-3xl font-bold">Support and beta feedback</h1>
    <p className="mt-2 text-sm leading-6 text-[#b3bccb]">Requests are stored for operator review. Automated support email and guaranteed response times are not configured. Never submit passwords, authentication links, private video URLs, or access tokens.</p>
    {!user ? <section className="mt-8 rounded-xl border border-white/10 bg-[#182233] p-5"><p className="text-sm text-[#d8dde6]">Sign in to create a traceable request with safe diagnostic context.</p><Link href="/login?next=/support" className="mt-4 inline-block rounded-lg bg-[#2f80ed] px-4 py-2 text-sm font-semibold">Sign in</Link></section> : <>
      {params.error&&<p role="alert" className="mt-5 rounded-lg border border-[#e46464]/30 bg-[#e46464]/10 p-3 text-sm text-[#e46464]">{params.error}</p>}
      {params.submitted&&<p role="status" className="mt-5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200">Request saved. Reference: <strong>{params.submitted}</strong>. Keep this reference for follow-up.</p>}
      {params.feedback&&<p role="status" className="mt-5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200">Thank you. Your beta feedback was saved.</p>}
      <section className="mt-8 rounded-2xl border border-white/10 bg-[#182233] p-6"><h2 className="text-xl font-semibold">Report a problem or request data help</h2><p className="mt-1 text-xs text-[#7e8797]">Signed in as {user.email}. Session and analysis references are optional.</p>
      <form action={submitSupportRequest} className="mt-5 grid gap-4">
        <label className="text-sm">Category<select name="category" required className="mt-1 block w-full rounded-lg border border-white/10 bg-[#101827] p-2"><option value="">Select</option>{["authentication","profile","upload","calibration","analysis_failure","result_question","report","privacy","account_deletion","data_export","other"].map(x=><option key={x} value={x}>{x.replaceAll("_"," ")}</option>)}</select></label>
        <label className="text-sm">Subject<input name="subject" required minLength={3} maxLength={120} className="mt-1 block w-full rounded-lg border border-white/10 bg-[#101827] p-2"/></label>
        <label className="text-sm">What happened?<textarea name="message" required minLength={10} maxLength={4000} rows={5} className="mt-1 block w-full rounded-lg border border-white/10 bg-[#101827] p-2"/></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Session ID (optional)<input name="session_id" className="mt-1 block w-full rounded-lg border border-white/10 bg-[#101827] p-2"/></label><label className="text-sm">Analysis ID (optional)<input name="analysis_id" className="mt-1 block w-full rounded-lg border border-white/10 bg-[#101827] p-2"/></label></div>
        <input type="hidden" name="current_route" value="/support"/><button className="w-fit rounded-lg bg-[#2f80ed] px-5 py-2 text-sm font-semibold">Submit support request</button>
      </form></section>
      <section className="mt-6 rounded-2xl border border-white/10 bg-[#182233] p-6"><h2 className="text-xl font-semibold">Share beta feedback</h2><form action={submitFeedback} className="mt-4 grid gap-4">
        <label className="text-sm">Topic<select name="feedback_category" required className="mt-1 block w-full rounded-lg border border-white/10 bg-[#101827] p-2">{["confusing_workflow","recording_guidance","analysis_speed","metric_understanding","limiter_quality","recommendation_usefulness","report_usefulness","feature_request","general"].map(x=><option key={x} value={x}>{x.replaceAll("_"," ")}</option>)}</select></label>
        <fieldset><legend className="text-sm">Was the experience useful?</legend><div className="mt-2 flex gap-5">{["yes","partly","no"].map(x=><label key={x} className="text-sm"><input type="radio" name="usefulness" value={x} className="mr-2 accent-[#2f80ed]"/>{x}</label>)}</div></fieldset>
        <label className="text-sm">Comment (optional)<textarea name="comment" maxLength={2000} rows={3} className="mt-1 block w-full rounded-lg border border-white/10 bg-[#101827] p-2"/></label>
        <label className="text-sm"><input type="checkbox" name="may_contact" className="mr-2 accent-[#2f80ed]"/>AVA may contact me about this feedback.</label><input type="hidden" name="current_route" value="/support"/><button className="w-fit rounded-lg border border-white/15 px-5 py-2 text-sm font-semibold">Submit feedback</button>
      </form></section>
    </>}
  </div></main>;
}

