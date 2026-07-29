import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/nav/AppShell";
import { createClient } from "@/lib/supabase/server";
import { loadCoachingRecommendations } from "@/lib/coachingRecommendations/loadContext";
import RecommendationCard from "./RecommendationCard";

export default async function CoachingRecommendationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { result, sessionName, found } = await loadCoachingRecommendations(id);
  if (!found) notFound();

  return (
    <AppShell userEmail={user.email ?? ""}>
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#3b8eff]">Sprint Intelligence</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#f5f7fb]">Coaching Recommendations</h1>
          </div>
          <Link href={`/sessions/${id}`} className="shrink-0 text-sm font-medium text-[#b3bccb] hover:text-[#f5f7fb]">← {sessionName}</Link>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-[#b3bccb]">Focused training directions based on the highest-impact findings.</p>
        <p className="mt-1 text-xs text-[#7e8797]">AVA provides intervention ideas, not a complete workout plan.</p>
      </header>

      {!result || result.status !== "ok" ? (
        <section className="rounded-2xl border border-white/[0.08] bg-[#182233] p-8 text-center">
          <h2 className="text-lg font-semibold text-[#f5f7fb]">
            {result?.status === "no_reliable_limiter" ? "No focused change is recommended" : "Insufficient evidence"}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-[#b3bccb]">
            {result?.status === "no_reliable_limiter"
              ? "AVA did not identify a meaningful, confidently supported limiter. Preserve current mechanics and collect another compatible session."
              : "Calibration or valid-step evidence is not sufficient to generate responsible coaching directions."}
          </p>
        </section>
      ) : (
        <div className="space-y-6">
          <section className="rounded-2xl border border-[#2f80ed]/30 bg-[#2f80ed]/[0.06] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#3b8eff]">Primary training direction</p>
            <h2 className="mt-1 text-lg font-semibold text-[#f5f7fb]">{result.primaryDirection}</h2>
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-[#7e8797]">Start with</p>
            <ol className="mt-2 space-y-1 text-sm text-[#d8dee9]">
              {result.startWith.map((item, index) => <li key={item}>{index + 1}. {item}</li>)}
            </ol>
          </section>

          {result.recommendations.length > 0 && (
            <section aria-labelledby="recommended-actions">
              <h2 id="recommended-actions" className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-[#f5f7fb]">Recommended actions</h2>
              <div className="space-y-4">{result.recommendations.map((r, i) => <RecommendationCard key={r.id} recommendation={r} rank={i + 1} />)}</div>
            </section>
          )}
          {result.monitoring.length > 0 && (
            <section aria-labelledby="monitoring">
              <h2 id="monitoring" className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-[#f5f7fb]">What to monitor</h2>
              {result.monitoring.map((r) => <RecommendationCard key={r.id} recommendation={r} />)}
            </section>
          )}
          {result.assessments.length > 0 && (
            <section aria-labelledby="assessment">
              <h2 id="assessment" className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-[#f5f7fb]">Additional testing</h2>
              {result.assessments.map((r) => <RecommendationCard key={r.id} recommendation={r} />)}
            </section>
          )}
          <section className="rounded-2xl border border-white/[0.06] bg-[#101827] p-5">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">Important limitations</h2>
            {result.limitations.map((item) => <p key={item} className="mt-2 text-xs leading-relaxed text-[#b3bccb]">{item}</p>)}
            <p className="mt-3 text-[10px] text-[#596274]">Recommendation model: {result.modelVersion}</p>
          </section>
        </div>
      )}
    </AppShell>
  );
}
