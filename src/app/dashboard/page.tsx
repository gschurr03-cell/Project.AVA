import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { summarizeAthlete, type TrendDirection } from "@/lib/coaching/trends";
import { logout } from "@/app/login/actions";
import { createAthlete } from "./actions";

const TREND_CHIP: Record<TrendDirection, { chip: string; arrow: string; label: string }> = {
  improving: { chip: "bg-green-100 text-green-700", arrow: "↑", label: "Improving" },
  declining: { chip: "bg-red-100 text-red-700", arrow: "↓", label: "Declining" },
  plateauing: { chip: "bg-gray-100 text-gray-600", arrow: "→", label: "Plateauing" },
  insufficient: { chip: "bg-gray-100 text-gray-500", arrow: "·", label: "No trend yet" },
};

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
    <main className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-lane">Your athletes</h1>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span>{user.email}</span>
          <form action={logout}>
            <button type="submit" className="rounded border px-3 py-1 hover:bg-gray-50">
              Sign out
            </button>
          </form>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <form action={createAthlete} className="mb-6 flex gap-2">
        <input
          name="full_name"
          required
          placeholder="New athlete name"
          className="flex-1 rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-lane px-4 py-2 text-white">
          Add athlete
        </button>
      </form>

      {athletes && athletes.length > 0 ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {athletes.map((a) => {
            const snapshot = summarizeAthlete(byAthlete.get(a.id) ?? []);
            const trend = TREND_CHIP[snapshot.techniqueTrend.direction];
            return (
              <li key={a.id}>
                <Link
                  href={`/athletes/${a.id}`}
                  className="block rounded border p-4 hover:border-lane hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-lane">{a.full_name}</span>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${trend.chip}`}>
                      {trend.arrow} {trend.label}
                    </span>
                  </div>

                  {snapshot.sessionsAnalyzed > 0 ? (
                    <div className="mt-3 flex items-end gap-4">
                      <div>
                        <p className="text-2xl font-bold text-gray-800">{snapshot.latestTechnique}</p>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">
                          Technique score
                        </p>
                      </div>
                      <p className="pb-1 text-xs text-gray-500">
                        {snapshot.sessionsAnalyzed} session{snapshot.sessionsAnalyzed === 1 ? "" : "s"} analyzed
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-gray-500">No analyzed sessions yet.</p>
                  )}

                  <span className="mt-3 block text-xs text-gray-400">
                    Added {new Date(a.created_at).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-gray-600">No athletes yet. Add one to get started.</p>
      )}
    </main>
  );
}
