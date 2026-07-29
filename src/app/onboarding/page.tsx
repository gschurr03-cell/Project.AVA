import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ONBOARDING_VERSION } from "@/lib/beta/config";
import { saveOnboarding } from "./actions";

const steps = [
  { title: "What AVA measures", body: "AVA measures Average Step Length, Peak Step Length, Step Frequency, Average Velocity, and Peak Velocity inside the confirmed zone. It also provides ranked limiting factors, evidence-linked explanations, and focused training directions." },
  { title: "Record a valid sprint", body: "Use a stable side angle. Keep the athlete and full measured zone visible, avoid zoom, use sufficient lighting, and record at 60 FPS or higher when practical." },
  { title: "Complete the athlete profile", body: "A name is enough for core workflow. Height, leg or trochanter length, event context, and personal bests improve supported comparisons; missing values are never treated as zero." },
  { title: "Review the result", body: "AVA shows measurement quality, five authoritative metrics, limiting factors, explanations, focused recommendations, and a printable professional report. Processing continues after upload if you leave the page." },
  { title: "Scientific boundary", body: "AVA identifies movement and performance patterns and possible associations. It does not diagnose injury, medical conditions, muscular weakness, or tissue capacity. Additional testing and professional interpretation may be required." },
] as const;

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string; error?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding");
  const { data: saved } = await supabase.from("onboarding_states").select("*").eq("user_id", user.id).maybeSingle();
  const requested = Number(params.step ?? saved?.current_step ?? 1);
  const current = Math.max(1, Math.min(5, requested));
  const item = steps[current - 1];
  return <main className="ava-carbon min-h-screen px-5 py-10 text-white">
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#3b8eff]">Beta onboarding · {current} of 5</p><Link href="/help" className="text-sm text-[#b3bccb]">Help</Link></div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[#2f80ed]" style={{width:`${current*20}%`}}/></div>
      <section className="mt-8 rounded-2xl border border-white/10 bg-[#182233] p-7">
        <h1 className="text-3xl font-bold">{item.title}</h1><p className="mt-4 leading-7 text-[#b3bccb]">{item.body}</p>
        {current === 2 && <Link href="/help/recording" className="mt-5 inline-block text-sm font-semibold text-[#3b8eff]">Open the recording checklist →</Link>}
        <form action={saveOnboarding} className="mt-8">
          <input type="hidden" name="step" value={current < 5 ? current + 1 : 5}/>
          {current === 5 && <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-[#d8dde6]"><input name="scientific_boundary" type="checkbox" required className="mt-1 accent-[#2f80ed]"/><span>I understand AVA is a performance-analysis tool and does not provide medical diagnosis or injury clearance.</span></label>}
          {params.error && <p role="alert" className="mt-4 text-sm text-[#e46464]">{params.error}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            {current > 1 && <Link href={`/onboarding?step=${current-1}`} className="rounded-lg border border-white/10 px-4 py-2 text-sm">Back</Link>}
            <button name="intent" value={current === 5 ? "complete" : "progress"} className="rounded-lg bg-[#2f80ed] px-5 py-2 text-sm font-semibold">{current === 5 ? "Complete onboarding" : "Continue"}</button>
            {current < 5 && <button name="intent" value="dismiss" className="px-4 py-2 text-sm text-[#7e8797]">Skip optional guide</button>}
          </div>
        </form>
      </section>
      <p className="mt-5 text-xs text-[#7e8797]">Guide version {ONBOARDING_VERSION}. You can reopen it from Settings or Help.</p>
    </div>
  </main>;
}

