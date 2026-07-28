import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/nav/AppShell";

function athleteName(row: { athletes: unknown }): string {
  const a = Array.isArray(row.athletes) ? row.athletes[0] : row.athletes;
  return a && typeof a === "object" && "full_name" in a ? String((a as { full_name: string }).full_name) : "Athlete";
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  complete: { label: "Complete", color: "#89d46a" },
  failed: { label: "Failed", color: "#e46464" },
  analyzing: { label: "Processing", color: "#f5c451" },
  queued: { label: "Queued", color: "#f5c451" },
  running: { label: "Processing", color: "#f5c451" },
  processing: { label: "Processing", color: "#f5c451" },
  uploaded: { label: "Uploaded", color: "#7e8797" },
};

/** Sessions index — recent runs across all athletes with status, athlete, date, type, distance. */
export default async function SessionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, name, original_filename, status, created_at, analysis_type, calibration_known_distance_m, distance_m, athletes(full_name)")
    .order("created_at", { ascending: false })
    .limit(60);

  const rows = sessions ?? [];

  return (
    <AppShell userEmail={user.email ?? ""}>
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#3b8eff]">History</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#f5f7fb]">Sessions</h1>
      </div>

      {rows.length ? (
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#182233] shadow-[0_8px_30px_rgba(0,0,0,0.24)]">
          <div className="hidden grid-cols-[1fr_140px_120px_110px_110px] gap-4 border-b border-white/[0.06] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797] sm:grid">
            <span>Session</span><span>Athlete</span><span>Type</span><span>Distance</span><span>Status</span>
          </div>
          <ul>
            {rows.map((s) => {
              const meta = STATUS_META[s.status] ?? { label: s.status, color: "#7e8797" };
              const dist = s.calibration_known_distance_m ?? s.distance_m;
              return (
                <li key={s.id} className="border-b border-white/[0.05] last:border-0">
                  <Link href={`/sessions/${s.id}`} className="grid grid-cols-1 gap-1 px-5 py-3 transition hover:bg-white/[0.04] sm:grid-cols-[1fr_140px_120px_110px_110px] sm:items-center sm:gap-4">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-[#f5f7fb]">{s.name ?? s.original_filename ?? "Session"}</span>
                      <span className="block text-xs text-[#7e8797] sm:hidden">{athleteName(s)} · {new Date(s.created_at).toLocaleDateString()}</span>
                    </span>
                    <span className="hidden truncate text-sm text-[#b3bccb] sm:block">{athleteName(s)}</span>
                    <span className="hidden text-sm text-[#b3bccb] sm:block">{s.analysis_type ?? "—"}</span>
                    <span className="hidden text-sm text-[#b3bccb] sm:block">{dist ? `${dist} m` : "—"}</span>
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: meta.color }} />
                      <span className="text-xs font-medium text-[#b3bccb]">{meta.label}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-[#b3bccb]">No sessions yet.</p>
      )}
    </AppShell>
  );
}
