import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/nav/AppShell";

const topics = [
  ["Getting started", "Complete an athlete profile, review the recording guide, upload a supported video, confirm timing gates, and start analysis."],
  ["Uploading a video", "MP4, MOV, and M4V files up to 512 MB are accepted. Processing supports clips up to 60 seconds."],
  ["Calibration and timing gates", "Use the Timing Workspace to confirm the measured zone. The Analysis page is read-only so measurement geometry cannot change accidentally."],
  ["Average Step Length", "Average of valid opposite-foot steps within the measured zone."],
  ["Peak Step Length", "Highest rolling average of four consecutive valid step lengths."],
  ["Step Frequency", "Calculated from valid step intervals within the measured zone."],
  ["Average Velocity", "Measured-zone distance divided by torso boundary-crossing time."],
  ["Peak Velocity", "Fastest valid individual step interval calculated from step distance divided by step time."],
  ["Limiting Factors and recommendations", "Findings are ranked performance patterns. Recommendations are focused directions, not full programs or diagnoses."],
  ["Reports", "The protected report reflects the selected analysis and can be printed or saved through the browser."],
  ["Analysis failures", "Your session remains saved. Follow the action shown, retry when offered, or submit the safe support reference."],
  ["Account and privacy", "Settings provides deletion-request status. The retention page explains current source-video handling."],
] as const;

export default async function HelpPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/help");
  return <AppShell userEmail={user.email ?? ""}><div className="space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-[#3b8eff]">Beta help</p><h1 className="mt-1 text-3xl font-bold text-white">Help Center</h1><p className="mt-2 text-sm text-[#b3bccb]">Current product behavior, recording preparation, and recovery guidance.</p></div>
    <div className="flex flex-wrap gap-3"><Link href="/help/recording" className="rounded-lg bg-[#2f80ed] px-4 py-2 text-sm font-semibold text-white">Recording guide</Link><Link href="/support" className="rounded-lg border border-white/10 px-4 py-2 text-sm text-[#d8dde6]">Contact support</Link><Link href="/onboarding" className="rounded-lg border border-white/10 px-4 py-2 text-sm text-[#d8dde6]">Reopen onboarding</Link></div>
    <div className="grid gap-3 md:grid-cols-2">{topics.map(([title,body])=><section key={title} className="rounded-xl border border-white/10 bg-[#182233] p-5"><h2 className="font-semibold text-white">{title}</h2><p className="mt-2 text-sm leading-6 text-[#b3bccb]">{body}</p></section>)}</div>
    <section className="rounded-xl border border-[#f5c451]/25 bg-[#f5c451]/5 p-5"><h2 className="font-semibold text-[#f5c451]">Scientific boundary</h2><p className="mt-2 text-sm leading-6 text-[#d8dde6]">AVA Sprint analyzes movement and performance patterns from video. It does not diagnose injury, medical conditions, muscular weakness, or tissue capacity. Technical and physical associations require professional interpretation and may require additional testing.</p></section>
  </div></AppShell>;
}

