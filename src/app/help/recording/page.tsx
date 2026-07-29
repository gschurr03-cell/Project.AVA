import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const checklist = ["The full measured zone is visible.","The athlete stays visible through the zone.","The camera is stable.","The recording uses a supported side angle.","The athlete is large enough to distinguish body positions.","Lighting is sufficient.","The highest practical frame rate is selected; 60 FPS or higher is preferred.","Calibration references are visible or can be configured."];
const troubleshooting = [
  ["Athlete leaves frame","A new recording is usually required. Widen the view and keep the full zone visible."],
  ["Camera pans too aggressively","Retry only if AVA marked the result usable; otherwise use a steadier or stationary recording."],
  ["Gates cannot be placed","Confirm the zone is visible and return to the Timing Workspace. A new recording may be required."],
  ["No calibration reference","Add a known-distance reference in the Timing Workspace. Do not guess the distance."],
  ["Low frame rate","Use 60 FPS or higher where possible. Low-rate footage may be withheld for authoritative timing."],
  ["Dark or blocked video","Record again with better light and an unobstructed side view."],
  ["Upload fails","Check the connection and retry. AVA reuses the incomplete session safely."],
  ["No valid steps or tracking failure","The athlete may be too small, blocked, or outside the zone. Review framing before recording again."],
] as const;
export default async function RecordingGuide(){
  const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login?next=/help/recording");
  return <main className="ava-carbon min-h-screen p-6 text-white"><div className="mx-auto max-w-3xl"><Link href="/help" className="text-sm text-[#b3bccb]">← Help</Link><h1 className="mt-6 text-3xl font-bold">Record an analyzable sprint</h1><p className="mt-2 text-[#b3bccb]">This checklist reduces preventable failures but cannot guarantee pose or measurement quality.</p>
  <section className="mt-7 rounded-2xl border border-white/10 bg-[#182233] p-6"><h2 className="text-xl font-semibold">Before recording</h2><div className="mt-4 space-y-3">{checklist.map(item=><label key={item} className="flex items-start gap-3 text-sm text-[#d8dde6]"><input type="checkbox" className="mt-1 accent-[#2f80ed]"/><span>{item}</span></label>)}</div></section>
  <section className="mt-6"><h2 className="text-xl font-semibold">Troubleshooting</h2><div className="mt-3 space-y-3">{troubleshooting.map(([title,body])=><details key={title} className="rounded-xl border border-white/10 bg-[#182233] p-4"><summary className="cursor-pointer font-semibold">{title}</summary><p className="mt-2 text-sm leading-6 text-[#b3bccb]">{body}</p></details>)}</div></section></div></main>;
}

