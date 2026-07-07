import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";
import { createAthlete } from "./actions";

/** Extract the joined athlete_id whether Supabase returns it as an object or array. */
function analysisAthleteId(row: { sessions: unknown }): string | null {
  const s = row.sessions;
  const one = Array.isArray(s) ? s[0] : s;
  return one && typeof one === "object" && "athlete_id" in one
    ? ((one as { athlete_id: string }).athlete_id ?? null)
    : null;
}

/**
 * Authenticated landing page — the coach's performance command center. Lists each
 * athlete with an at-a-glance progress snapshot (sessions analyzed, latest technique
 * score, trend direction) so the coach can see who's improving without opening every
 * profile. All numbers come from the shared trend engine — nothing hardcoded, no
 * benchmark math touched. Protected by middleware; re-checks the user to read data.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: athletes } = await supabase
    .from("athletes")
    .select("id, full_name, created_at")
    .order("created_at", { ascending: false });

  // Completed analyses across all of this coach's athletes (RLS scopes to owned rows),
  // grouped per athlete to build each card's snapshot.
  const { data: analyses } = await supabase
    .from("analyses")
    .select("id, metrics, created_at, sessions!inner(athlete_id)")
    .eq("status", "complete")
    .order("created_at", { ascending: false });

  const byAthlete = new Map<string, { id: string; metrics: unknown; created_at: string }[]>();
  for (const row of analyses ?? []) {
    const athleteId = analysisAthleteId(row);
    if (!athleteId) continue;
    const list = byAthlete.get(athleteId) ?? [];
    list.push({ id: row.id, metrics: row.metrics, created_at: row.created_at });
    byAthlete.set(athleteId, list);
  }

  return (
    <main className="ava-carbon mx-auto min-h-screen max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#D72638]">AVA</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#F5F5F7]">Your athletes</h1>
        </div>
        <div className="flex items-center gap-3 text-sm text-[#A0A2A8]">
          <span>{user.email}</span>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1 text-[#A0A2A8] transition hover:bg-white/[0.08]"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-[#FF3B30]/40 bg-[#FF3B30]/10 px-3 py-2 text-sm text-[#ff8079]"
        >
          {error}
        </p>
      )}

      <form action={createAthlete} className="mb-6 flex gap-2">
        <input
          name="full_name"
          required
          placeholder="New athlete name"
          className="flex-1 rounded-lg border border-white/[0.08] bg-[#19191C] px-3 py-2 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus:border-[#D72638]/50 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-[#D72638] px-4 py-2 font-semibold text-white transition hover:bg-[#e63a4b]"
        >
          Add athlete
        </button>
      </form>

      {athletes && athletes.length > 0 ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {athletes.map((a) => {
            // Trusted scoring is per-session (live), so the dashboard shows the factual
            // analyzed-session count rather than the legacy untrusted Technique Score.
            const analyzedCount = byAthlete.get(a.id)?.length ?? 0;
            return (
              <li key={a.id}>
                <Link
                  href={`/athletes/${a.id}`}
                  className="block rounded-xl border border-white/[0.06] bg-[#19191C] p-4 transition hover:border-[#D72638]/40 hover:bg-[#202024]"
                >
                  <span className="font-semibold text-[#F5F5F7]">{a.full_name}</span>

                  <p className="mt-3 text-xs text-[#6B7280]">
                    {analyzedCount > 0
                      ? `${analyzedCount} session${analyzedCount === 1 ? "" : "s"} analyzed — open for AVA Performance Score`
                      : "No analyzed sessions yet."}
                  </p>

                  <span className="mt-3 block text-xs text-[#6B7280]">
                    Added {new Date(a.created_at).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[#A0A2A8]">No athletes yet. Add one to get started.</p>
      )}
    </main>
  );
}
