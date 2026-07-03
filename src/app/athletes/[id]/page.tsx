import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { buildAthleteHistory } from "@/lib/coaching/athlete";
import { buildAthleteTrends } from "@/lib/coaching/trends";
import { buildTrainingFocus } from "@/lib/coaching/focus";
import { createClient } from "@/lib/supabase/server";
import { sessionDisplayName, STATUS_LABELS } from "@/lib/sessions";
import {
  PROFILE_FIELDS,
  formatProfileValue,
  type AthleteProfileValues,
} from "@/lib/athletes/profile";
import AthleteProfileForm from "./AthleteProfileForm";
import TrainingFocusPanel from "./TrainingFocusPanel";
import VideoUpload from "./VideoUpload";

function formatScore(value: number | null) {
  return value == null ? "—" : String(value);
}

function formatChange(value: number | null) {
  if (value == null) return "No previous session";
  if (value === 0) return "No change";
  return `${value > 0 ? "+" : ""}${value} since last`;
}

function formatTrendNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/** Text-only trend card: latest value, change first→latest, and point count. */
function TrendCard({ title, values, unit }: { title: string; values: number[]; unit?: string }) {
  const latest = values[values.length - 1];
  const change = latest - values[0];
  const changeText = `${change > 0 ? "+" : ""}${formatTrendNumber(change)}`;

  return (
    <div className="rounded border bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{title}</p>
      <p className="mt-2 text-3xl font-bold text-gray-800">
        {formatTrendNumber(latest)}
        {unit ? <span className="ml-1 text-base font-medium text-gray-400">{unit}</span> : null}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        {changeText} from first · {values.length} points
      </p>
    </div>
  );
}

export default async function AthletePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error: profileError, saved } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: athlete } = await supabase
    .from("athletes")
    .select(
      "id, full_name, height_cm, weight_kg, leg_length_cm, personal_best_60m, personal_best_100m, personal_best_200m, goal_60m, goal_100m, goal_200m",
    )
    .eq("id", id)
    .single();

  if (!athlete) notFound();

  // Narrow the athlete row to just the profile fields for the form + display.
  const profileValues = Object.fromEntries(
    PROFILE_FIELDS.map((def) => [def.key, athlete[def.key] ?? null]),
  ) as AthleteProfileValues;
  const hasAnyProfile = PROFILE_FIELDS.some((def) => profileValues[def.key] != null);

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

  const trends = buildAthleteTrends(completedAnalyses ?? []);

  const trainingFocus = buildTrainingFocus(completedAnalyses ?? []);

  const trend =
    history.techniqueChange == null
      ? "—"
      : history.improving
        ? "Improving"
        : history.techniqueChange < 0
          ? "Declining"
          : "Stable";

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

      {profileError && (
        <p
          role="alert"
          className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {profileError}
        </p>
      )}
      {saved && (
        <p className="mb-4 rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">
          Profile saved.
        </p>
      )}

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

      <section className="mb-8 rounded border bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold">Physical &amp; Performance Profile</h2>
        <p className="mb-4 text-xs text-gray-500">
          Reference measurements and target times. Stored for future calibration and personal-best
          prediction — not yet used in any metric calculation.
        </p>

        {hasAnyProfile ? (
          <dl className="mb-6 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-3">
            {PROFILE_FIELDS.map((def) => (
              <div key={def.key} className="flex justify-between gap-2 border-b py-1">
                <dt className="text-gray-500">{def.label}</dt>
                <dd className="font-medium text-gray-800">
                  {formatProfileValue(profileValues[def.key], def.unit)}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mb-6 text-sm text-gray-500">
            No profile details yet. Add them below to have them on hand for upcoming calibration and
            PB-prediction features.
          </p>
        )}

        <AthleteProfileForm athleteId={athlete.id} values={profileValues} />
      </section>

      <section className="mb-8 rounded border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Recent Progress</h2>
        {history.totalSessions > 0 ? (
          <ul className="divide-y">
            <li className="flex items-center justify-between py-2">
              <span className="flex items-center gap-2 text-sm text-gray-700">
                <span className="text-green-600">✓</span>
                Latest technique score
              </span>
              <span className="text-sm font-semibold text-gray-800">
                {formatScore(history.latestTechniqueScore)}
              </span>
            </li>
            <li className="flex items-center justify-between py-2">
              <span className="flex items-center gap-2 text-sm text-gray-700">
                <span className="text-green-600">✓</span>
                Average technique score
              </span>
              <span className="text-sm font-semibold text-gray-800">
                {formatScore(history.averageTechniqueScore)}
              </span>
            </li>
            <li className="flex items-center justify-between py-2">
              <span className="flex items-center gap-2 text-sm text-gray-700">
                <span className="text-green-600">✓</span>
                Best technique score
              </span>
              <span className="text-sm font-semibold text-gray-800">
                {formatScore(history.bestTechniqueScore)}
              </span>
            </li>
            <li className="flex items-center justify-between py-2">
              <span className="flex items-center gap-2 text-sm text-gray-700">
                <span className="text-green-600">✓</span>
                Sessions analyzed
              </span>
              <span className="text-sm font-semibold text-gray-800">{history.totalSessions}</span>
            </li>
            <li className="flex items-center justify-between py-2">
              <span className="flex items-center gap-2 text-sm text-gray-700">
                <span className="text-green-600">✓</span>
                Current trend
              </span>
              <span className="text-sm font-semibold text-gray-800">{trend}</span>
            </li>
          </ul>
        ) : (
          <p className="text-sm text-gray-500">
            No analyzed sessions yet. Upload and analyze a sprint to start tracking progress.
          </p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Performance Trends</h2>
        {trends.techniqueScores.length >= 2 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TrendCard title="Technique Score" values={trends.techniqueScores} />
            <TrendCard title="Ground Contact" values={trends.groundContactTimes} unit="ms" />
            <TrendCard title="Flight Time" values={trends.flightTimes} unit="ms" />
            <TrendCard title="Stride Frequency" values={trends.strideFrequencies} unit="Hz" />
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            Analyze at least two sessions to unlock trend tracking.
          </p>
        )}
      </section>

      <section className="mb-8">
        <TrainingFocusPanel focus={trainingFocus} />
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
