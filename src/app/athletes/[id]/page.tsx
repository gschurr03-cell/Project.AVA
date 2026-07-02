import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { buildAthleteHistory } from "@/lib/coaching/athlete";
import { createClient } from "@/lib/supabase/server";
import { sessionDisplayName, STATUS_LABELS } from "@/lib/sessions";
import VideoUpload from "./VideoUpload";

function formatScore(value: number | null) {
  return value == null ? "—" : String(value);
}

function formatChange(value: number | null) {
  if (value == null) return "No previous session";
  if (value === 0) return "No change";
  return `${value > 0 ? "+" : ""}${value} since last`;
}

export default async function AthletePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: athlete } = await supabase
    .from("athletes")
    .select("id, full_name")
    .eq("id", id)
    .single();

  if (!athlete) notFound();

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, name, original_filename, video_path, status, created_at")
    .eq("athlete_id", athlete.id)
    .order("created_at", { ascending: false });

  const { data: completedAnalyses } = await supabase
    .from("analyses")
    .select("id, metrics, created_at, sessions!inner(athlete_id)")
    .eq("status", "complete")
    .eq("sessions.athlete_id", athlete.id)
    .order("created_at", { ascending: false })
    .limit(10);

  const { summary: history } = buildAthleteHistory(
    completedAnalyses ?? [],
  );

  return (
    <main className="mx-auto max-w-5xl p-8">
      <Link href="/dashboard" className="text-sm text-gray-500 hover:underline">
        ← Back to athletes
      </Link>

      <div className="mb-6 mt-2">
        <h1 className="text-3xl font-bold text-lane">{athlete.full_name}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Athlete dashboard, session history, and progress tracking.
        </p>
      </div>

      <section className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded border bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Latest Score
          </p>
          <p className="mt-2 text-3xl font-bold text-lane">
            {formatScore(history.latestTechniqueScore)}
          </p>
          <p className="mt-1 text-xs text-gray-500">{formatChange(history.techniqueChange)}</p>
        </div>

        <div className="rounded border bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Average Score
          </p>
          <p className="mt-2 text-3xl font-bold text-gray-800">
            {formatScore(history.averageTechniqueScore)}
          </p>
          <p className="mt-1 text-xs text-gray-500">Last {history.totalSessions} analyzed</p>
        </div>

        <div className="rounded border bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Best Score
          </p>
          <p className="mt-2 text-3xl font-bold text-gray-800">
            {formatScore(history.bestTechniqueScore)}
          </p>
          <p className="mt-1 text-xs text-gray-500">Personal best analysis</p>
        </div>

        <div className="rounded border bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Sessions
          </p>
          <p className="mt-2 text-3xl font-bold text-gray-800">{sessions?.length ?? 0}</p>
          <p className="mt-1 text-xs text-gray-500">Total uploaded</p>
        </div>

        <div className="rounded border bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Trend
          </p>
          <p className="mt-2 text-2xl font-bold text-gray-800">
            {history.techniqueChange == null
              ? "—"
              : history.improving
                ? "Improving"
                : history.techniqueChange < 0
                  ? "Declining"
                  : "Stable"}
          </p>
          <p className="mt-1 text-xs text-gray-500">Latest vs previous</p>
        </div>
      </section>

      <section className="mb-8 rounded border p-4">
        <h2 className="mb-3 text-lg font-semibold">Upload a sprint video</h2>
        <VideoUpload athleteId={athlete.id} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Sessions</h2>
        {sessions && sessions.length > 0 ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/sessions/${s.id}`}
                  className="block rounded border p-4 hover:border-lane hover:bg-gray-50"
                >
                  <span className="block truncate font-medium text-lane">
                    {sessionDisplayName(s)}
                  </span>
                  <span className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                    <span className="rounded bg-gray-100 px-2 py-0.5">
                      {STATUS_LABELS[s.status] ?? s.status}
                    </span>
                    {new Date(s.created_at).toLocaleString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-600">No sessions yet. Upload a video to get started.</p>
        )}
      </section>
    </main>
  );
}
