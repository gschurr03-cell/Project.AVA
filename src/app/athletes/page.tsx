import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAthlete } from "@/app/dashboard/actions";
import AppShell from "@/components/nav/AppShell";

function analysisAthleteId(row: { sessions: unknown }): string | null {
  const s = row.sessions;
  const one = Array.isArray(s) ? s[0] : s;
  return one && typeof one === "object" && "athlete_id" in one ? ((one as { athlete_id: string }).athlete_id ?? null) : null;
}

/** Athletes index — the roster with an at-a-glance analyzed-session count + profile link. */
export default async function AthletesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const { new: openNew } = await searchParams;
  const focusAdd = openNew === "1";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: athletes }, { data: analyses }] = await Promise.all([
    supabase.from("athletes").select("id, full_name, created_at").order("full_name", { ascending: true }),
    supabase.from("analyses").select("id, created_at, sessions!analyses_session_id_fkey!inner(athlete_id)").eq("status", "complete"),
  ]);

  const byAthlete = new Map<string, number>();
  for (const row of analyses ?? []) {
    const id = analysisAthleteId(row);
    if (id) byAthlete.set(id, (byAthlete.get(id) ?? 0) + 1);
  }

  return (
    <AppShell userEmail={user.email ?? ""}>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#3b8eff]">Roster</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#f5f7fb]">Athletes</h1>
        </div>
        <form action={createAthlete} className="flex gap-2">
          <input name="full_name" required autoFocus={focusAdd} placeholder="New athlete name" className="w-44 rounded-lg border border-white/[0.08] bg-[#182233] px-3 py-2 text-sm text-[#f5f7fb] placeholder:text-[#7e8797] focus:border-[#2f80ed]/50 focus:outline-none" />
          <button type="submit" className="rounded-lg bg-[#2f80ed] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#3b8eff]">Add</button>
        </form>
      </div>

      {athletes?.length ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {athletes.map((a) => (
            <li key={a.id}>
              <Link href={`/athletes/${a.id}`} className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#182233] p-4 shadow-[0_8px_30px_rgba(0,0,0,0.24)] transition hover:border-[#2f80ed]/40 hover:bg-[#223047]">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#223047] text-sm font-semibold text-[#b3bccb]">
                  {a.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-[#f5f7fb]">{a.full_name}</span>
                  <span className="mt-0.5 block text-xs text-[#7e8797]">{byAthlete.get(a.id) ?? 0} analyzed · added {new Date(a.created_at).toLocaleDateString()}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[#b3bccb]">No athletes yet. Add one to get started.</p>
      )}
    </AppShell>
  );
}
