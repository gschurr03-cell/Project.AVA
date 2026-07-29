import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAthlete } from "./actions";
import AppShell from "@/components/nav/AppShell";
import { assessProfileReadiness } from "@/lib/beta/profileReadiness";
import { ONBOARDING_VERSION } from "@/lib/beta/config";

/** Extract the joined athlete_id whether Supabase returns it as an object or array. */
function analysisAthleteId(row: { sessions: unknown }): string | null {
  const s = row.sessions;
  const one = Array.isArray(s) ? s[0] : s;
  return one && typeof one === "object" && "athlete_id" in one
    ? ((one as { athlete_id: string }).athlete_id ?? null)
    : null;
}

function athleteName(row: { athletes: unknown }): string {
  const a = Array.isArray(row.athletes) ? row.athletes[0] : row.athletes;
  return a && typeof a === "object" && "full_name" in a ? String((a as { full_name: string }).full_name) : "Athlete";
}

const ACTIVE = new Set(["queued", "analyzing", "running", "processing", "uploaded"]);

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#182233] p-5 shadow-[0_8px_30px_rgba(0,0,0,0.24)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#b3bccb]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === "failed" ? "#e46464" : status === "complete" ? "#89d46a" : ACTIVE.has(status) ? "#f5c451" : "#7e8797";
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />;
}

/**
 * The command center — the coach's post-login landing. Concise cards answer "what's
 * processing, what needs attention, what's recent, and what can I do next", each routing
 * into a deeper page. No analysis math or calibration logic here (presentation only).
 */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: athletes }, { data: sessions }, { data: analyses }, { data: onboarding }] = await Promise.all([
    supabase.from("athletes").select("id, full_name, created_at, height_cm, leg_length_cm, trochanter_height_m, sex, personal_best_60m, personal_best_100m, personal_best_200m").order("created_at", { ascending: false }),
    supabase
      .from("sessions")
      .select("id, name, original_filename, status, created_at, analysis_type, calibration_known_distance_m, distance_m, athlete_id, athletes(full_name)")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("analyses").select("id, created_at, sessions!inner(athlete_id)").eq("status", "complete").order("created_at", { ascending: false }),
    supabase.from("onboarding_states").select("state,onboarding_version").eq("user_id", user.id).maybeSingle(),
  ]);

  const analyzedByAthlete = new Map<string, number>();
  for (const row of analyses ?? []) {
    const id = analysisAthleteId(row);
    if (id) analyzedByAthlete.set(id, (analyzedByAthlete.get(id) ?? 0) + 1);
  }

  const all = sessions ?? [];
  const processing = all.filter((s) => ACTIVE.has(s.status));
  const failed = all.filter((s) => s.status === "failed");
  const recent = all.filter((s) => s.status === "complete").slice(0, 6);
  const greeting = (user.email ?? "coach").split("@")[0];
  const primaryAthlete = athletes?.[0] ?? null;
  const readiness = primaryAthlete ? assessProfileReadiness(primaryAthlete) : null;
  const showOnboarding = !onboarding || onboarding.onboarding_version !== ONBOARDING_VERSION ||
    !["completed","dismissed"].includes(onboarding.state);

  const label = (s: (typeof all)[number]) => s.name ?? s.original_filename ?? "Session";
  const dist = (s: (typeof all)[number]) => s.calibration_known_distance_m ?? s.distance_m ?? null;

  return (
    <AppShell userEmail={user.email ?? ""}>
      {/* 1. Welcome / context */}
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#3b8eff]">Command Center</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#f5f7fb]">Welcome back, {greeting}</h1>
        <p className="mt-1 text-sm text-[#b3bccb]">
          {athletes?.length ?? 0} athlete{(athletes?.length ?? 0) === 1 ? "" : "s"} · {all.length} recent session{all.length === 1 ? "" : "s"}
          {processing.length > 0 ? ` · ${processing.length} processing` : ""}
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-6 rounded-xl border border-[#e46464]/40 bg-[#e46464]/10 px-3 py-2 text-sm text-[#e46464]">{error}</p>
      )}
      {showOnboarding && <section className="mb-6 flex flex-col gap-3 rounded-xl border border-[#3b8eff]/30 bg-[#2f80ed]/10 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-white">Prepare for your first AVA analysis</h2><p className="mt-1 text-sm text-[#b3bccb]">Review what AVA measures, recording setup, and scientific boundaries.</p></div><Link href="/onboarding" className="shrink-0 rounded-lg bg-[#2f80ed] px-4 py-2 text-center text-sm font-semibold text-white">Continue onboarding</Link></section>}
      {readiness && readiness.status !== "fully_individualized" && <section className="mb-6 flex flex-col gap-3 rounded-xl border border-white/10 bg-[#182233] p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-white">{readiness.status==="analysis_ready"?"Profile supports core analysis":"Profile is partially individualized"} · {readiness.completionPercent}%</h2><p className="mt-1 text-sm text-[#b3bccb]">{readiness.affectedFeatures[0] ?? "Optional context can improve supported comparisons."}</p></div><Link href={`/athletes/${primaryAthlete!.id}`} className="shrink-0 text-sm font-semibold text-[#3b8eff]">Improve profile →</Link></section>}

      {/* 2. Quick actions */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Link href="/coach" className="rounded-lg bg-[#2f80ed] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#3b8eff]">Open Command Center</Link>
        <Link href="/athletes" className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#b3bccb] transition hover:bg-white/[0.08]">Athletes</Link>
        <Link href="/sessions" className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#b3bccb] transition hover:bg-white/[0.08]">Sessions</Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 3. Active / processing */}
        <Card title={`Processing${processing.length ? ` · ${processing.length}` : ""}`}>
          {processing.length ? (
            <ul className="space-y-2">
              {processing.slice(0, 5).map((s) => (
                <li key={s.id}>
                  <Link href={`/sessions/${s.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-white/[0.04]">
                    <StatusDot status={s.status} />
                    <span className="min-w-0 flex-1 truncate text-sm text-[#f5f7fb]">{label(s)}</span>
                    <span className="shrink-0 text-xs text-[#7e8797]">{athleteName(s)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#7e8797]">No analyses processing right now.</p>
          )}
        </Card>

        {/* 9. Needs attention */}
        <Card title={`Needs attention${failed.length ? ` · ${failed.length}` : ""}`}>
          {failed.length ? (
            <ul className="space-y-2">
              {failed.slice(0, 5).map((s) => (
                <li key={s.id}>
                  <Link href={`/sessions/${s.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-white/[0.04]">
                    <StatusDot status={s.status} />
                    <span className="min-w-0 flex-1 truncate text-sm text-[#f5f7fb]">{label(s)}</span>
                    <span className="shrink-0 text-xs text-[#e46464]">Failed</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#7e8797]">Nothing needs attention. Nice.</p>
          )}
        </Card>

        {/* 4. Recent runs */}
        <Card title="Recent runs" action={<Link href="/sessions" className="text-xs font-semibold text-[#3b8eff] hover:underline">View all</Link>}>
          {recent.length ? (
            <ul className="space-y-2">
              {recent.map((s) => (
                <li key={s.id}>
                  <Link href={`/sessions/${s.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-white/[0.04]">
                    <StatusDot status="complete" />
                    <span className="min-w-0 flex-1 truncate text-sm text-[#f5f7fb]">{label(s)}</span>
                    <span className="shrink-0 text-xs text-[#7e8797]">
                      {dist(s) ? `${dist(s)}m · ` : ""}{new Date(s.created_at).toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#7e8797]">No completed runs yet.</p>
          )}
        </Card>

        {/* 5. Athlete overview */}
        <Card title="Athletes" action={<Link href="/athletes" className="text-xs font-semibold text-[#3b8eff] hover:underline">View all</Link>}>
          {athletes?.length ? (
            <ul className="space-y-2">
              {athletes.slice(0, 5).map((a) => {
                const n = analyzedByAthlete.get(a.id) ?? 0;
                return (
                  <li key={a.id}>
                    <Link href={`/athletes/${a.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-white/[0.04]">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#223047] text-[11px] font-semibold text-[#b3bccb]">
                        {a.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-[#f5f7fb]">{a.full_name}</span>
                      <span className="shrink-0 text-xs text-[#7e8797]">{n} analyzed</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-[#7e8797]">No athletes yet.</p>
          )}
          <form action={createAthlete} className="mt-3 flex gap-2 border-t border-white/[0.06] pt-3">
            <input name="full_name" required placeholder="New athlete name" className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-[#101827] px-3 py-2 text-sm text-[#f5f7fb] placeholder:text-[#7e8797] focus:border-[#2f80ed]/50 focus:outline-none" />
            <button type="submit" className="shrink-0 rounded-lg bg-[#2f80ed] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#3b8eff]">Add</button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
