import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requestAccountDeletion } from "./actions";
export default async function AccountPage({searchParams}:{searchParams:Promise<{error?:string;requested?:string}>}){
  const params=await searchParams,supabase=await createClient(),{data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  const [{data:request},{data:profile}]=await Promise.all([
    supabase.from("account_deletion_requests").select("status,requested_at").eq("user_id",user.id).in("status",["requested","acknowledged","processing"]).maybeSingle(),
    supabase.from("profiles").select("role").eq("id",user.id).single(),
  ]);
  return <main className="ava-carbon mx-auto min-h-screen max-w-2xl p-8 text-white"><Link href="/dashboard" className="text-sm text-[#b3bccb]">← Dashboard</Link><h1 className="mt-8 text-3xl font-bold">Account & privacy</h1><p className="mt-2 text-sm text-[#7e8797]">{user.email}</p>
    <div className="mt-6 flex flex-wrap gap-4 text-sm"><Link href="/privacy" className="text-[#3b8eff]">Privacy draft</Link><Link href="/terms" className="text-[#3b8eff]">Terms draft</Link><Link href="/disclaimer" className="text-[#3b8eff]">Scientific disclaimer</Link><Link href="/data-retention" className="text-[#3b8eff]">Data retention</Link><Link href="/help" className="text-[#3b8eff]">Help</Link><Link href="/onboarding" className="text-[#3b8eff]">Reopen onboarding</Link><Link href="/support" className="text-[#3b8eff]">Support or data export</Link>{profile?.role==="admin"&&<Link href="/admin/operations" className="text-[#f5c451]">Beta operations</Link>}</div>
    <section className="mt-10 rounded-xl border border-amber-400/20 bg-amber-400/5 p-5"><h2 className="font-semibold">Request account deletion</h2><p className="mt-2 text-sm leading-6 text-[#b3bccb]">This creates a reviewed deletion request; it does not instantly erase data. Videos, profiles, sessions, and saved analyses are included in the requested scope. Limited operational records may require temporary retention.</p>
    {params.error&&<p role="alert" className="mt-3 text-sm text-amber-200">{params.error}</p>}
    {request||params.requested?<p role="status" className="mt-4 text-sm text-amber-200">Deletion request received{request?.requested_at?` on ${new Date(request.requested_at).toLocaleDateString()}`:""}.</p>:<form action={requestAccountDeletion} className="mt-4"><label className="text-xs text-[#7e8797]">Type DELETE MY ACCOUNT<input name="confirmation" required className="mt-1 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"/></label><button className="mt-3 rounded-lg border border-amber-400/40 px-4 py-2 text-sm text-amber-100">Submit deletion request</button></form>}</section>
  </main>;
}
