import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { buildAthleteHistory } from "@/lib/coaching/athlete";
import { buildAthleteTrends, analyzeTrend, type TrendDirection } from "@/lib/coaching/trends";
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

const TREND_STYLE: Record<TrendDirection, { chip: string; arrow: string }> = {
  improving: { chip: "border border-[#D4AF37]/40 bg-[#D4AF37]/12 text-[#E4C25A]", arrow: "↑" },
  declining: { chip: "border border-[#FF3B30]/40 bg-[#FF3B30]/12 text-[#FF7A70]", arrow: "↓" },
  plateauing: { chip: "border border-white/10 bg-white/[0.05] text-[#A0A2A8]", arrow: "→" },
  insufficient: { chip: "border border-white/10 bg-white/[0.05] text-[#6B7280]", arrow: "·" },
};

/**
 * Trend card (Day 76): the latest value plus a MEANINGFUL read — direction, rate,
 * and confidence — from {@link analyzeTrend}, not just a raw first→latest delta.
 */
function TrendCard({
  title,
  values,
  unit,
  higherIsBetter,
}: {
  title: string;
  values: number[];
  unit?: string;
  higherIsBetter: boolean;
}) {
  const latest = values[values.length - 1];
  const signal = analyzeTrend(values, { higherIsBetter, unit });
  const style = TREND_STYLE[signal.direction];

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">{title}</p>
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${style.chip}`}>
          {style.arrow} {signal.direction}
        </span>
      </div>
      <p className="mt-2 text-3xl font-bold text-[#F5F5F7]">
        {formatTrendNumber(latest)}
        {unit ? <span className="ml-1 text-base font-medium text-[#6B7280]">{unit}</span> : null}
      </p>
      <p className="mt-1 text-xs text-[#A0A2A8]">{signal.summary}</p>
      {signal.direction !== "insufficient" && (
        <p className="mt-0.5 text-[11px] text-[#6B7280]">{signal.confidence} confidence · {values.length} sessions</p>
      )}
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
    <main className="ava-carbon mx-auto min-h-screen max-w-5xl p-8">
      <Link href="/dashboard" className="text-sm text-[#A0A2A8] transition hover:text-[#F5F5F7]">
        ← Back to athletes
      </Link>

      <div className="mb-6 mt-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#D72638]">Athlete</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#F5F5F7]">{athlete.full_name}</h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Athlete dashboard, session history, and progress tracking.
        </p>
      </div>

      {profileError && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-[#FF3B30]/40 bg-[#FF3B30]/10 px-3 py-2 text-sm text-[#ff8079]"
        >
          {profileError}
        </p>
      )}
      {saved && (
        <p className="mb-4 rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 py-2 text-sm text-[#E4C25A]">
          Profile saved.
        </p>
      )}

      <section className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">Latest Score</p>
          <p className="mt-2 text-3xl font-bold text-[#E4C25A]">
            {formatScore(history.latestTechniqueScore)}
          </p>
          <p className="mt-1 text-xs text-[#6B7280]">{formatChange(history.techniqueChange)}</p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">Average Score</p>
          <p className="mt-2 text-3xl font-bold text-[#F5F5F7]">
            {formatScore(history.averageTechniqueScore)}
          </p>
          <p className="mt-1 text-xs text-[#6B7280]">Last {history.totalSessions} analyzed</p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">Best Score</p>
          <p className="mt-2 text-3xl font-bold text-[#F5F5F7]">
            {formatScore(history.bestTechniqueScore)}
          </p>
          <p className="mt-1 text-xs text-[#6B7280]">Personal best analysis</p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">Sessions</p>
          <p className="mt-2 text-3xl font-bold text-[#F5F5F7]">{sessions?.length ?? 0}</p>
          <p className="mt-1 text-xs text-[#6B7280]">Total uploaded</p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">Trend</p>
          <p className="mt-2 text-2xl font-bold text-[#F5F5F7]">
            {history.techniqueChange == null
              ? "—"
              : history.improving
                ? "Improving"
                : history.techniqueChange < 0
                  ? "Declining"
                  : "Stable"}
          </p>
          <p className="mt-1 text-xs text-[#6B7280]">Latest vs previous</p>
        </div>
      </section>

      {/* Physical & Performance Profile — collapsed by default (Day 75) to reduce
          page clutter; all fields + the edit form remain inside. */}
      <details className="group mb-8 rounded-2xl border border-white/[0.06] bg-[#121214]/95 p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
          <span className="text-lg font-semibold text-[#F5F5F7]">
            Physical &amp; Performance Profile
            <span className="ml-2 text-xs font-normal text-[#6B7280]">
              {hasAnyProfile ? "reference measurements & targets" : "not set yet"}
            </span>
          </span>
          <svg
            className="h-4 w-4 shrink-0 text-[#6B7280] transition-transform duration-150 group-open:rotate-90"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
              clipRule="evenodd"
            />
          </svg>
        </summary>

        <div className="mt-3 border-t border-white/[0.06] pt-3">
          <p className="mb-4 text-xs text-[#6B7280]">
            Reference measurements and target times. Stored for future calibration and personal-best
            prediction — not yet used in any metric calculation.
          </p>

          {hasAnyProfile ? (
            <dl className="mb-6 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-3">
              {PROFILE_FIELDS.map((def) => (
                <div key={def.key} className="flex justify-between gap-2 border-b border-white/[0.06] py-1">
                  <dt className="text-[#6B7280]">{def.label}</dt>
                  <dd className="font-medium text-[#F5F5F7]">
                    {formatProfileValue(profileValues[def.key], def.unit)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mb-6 text-sm text-[#6B7280]">
              No profile details yet. Add them below to have them on hand for upcoming calibration and
              PB-prediction features.
            </p>
          )}

          <AthleteProfileForm athleteId={athlete.id} values={profileValues} />
        </div>
      </details>

      <section className="mb-8 rounded-2xl border border-white/[0.06] bg-[#121214]/95 p-5">
        <h2 className="mb-3 text-lg font-semibold text-[#F5F5F7]">Recent Progress</h2>
        {history.totalSessions > 0 ? (
          <ul className="divide-y divide-white/[0.06]">
            {[
              ["Latest technique score", formatScore(history.latestTechniqueScore)],
              ["Average technique score", formatScore(history.averageTechniqueScore)],
              ["Best technique score", formatScore(history.bestTechniqueScore)],
              ["Sessions analyzed", String(history.totalSessions)],
              ["Current trend", trend],
            ].map(([label, value]) => (
              <li key={label} className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2 text-sm text-[#A0A2A8]">
                  <span className="text-[#E4C25A]">✓</span>
                  {label}
                </span>
                <span className="text-sm font-semibold text-[#F5F5F7]">{value}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[#6B7280]">
            No analyzed sessions yet. Upload and analyze a sprint to start tracking progress.
          </p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-[#F5F5F7]">Performance Trends</h2>
        {trends.techniqueScores.length >= 2 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TrendCard title="Technique Score" values={trends.techniqueScores} higherIsBetter />
            <TrendCard title="Ground Contact" values={trends.groundContactTimes} unit="ms" higherIsBetter={false} />
            <TrendCard title="Flight Time" values={trends.flightTimes} unit="ms" higherIsBetter />
            <TrendCard title="Frequency" values={trends.strideFrequencies} unit="Hz" higherIsBetter />
          </div>
        ) : (
          <p className="text-sm text-[#6B7280]">
            Analyze at least two sessions to unlock trend tracking.
          </p>
        )}
      </section>

      <section className="mb-8">
        <TrainingFocusPanel focus={trainingFocus} />
      </section>

      <section className="mb-8 rounded-2xl border border-white/[0.06] bg-[#121214]/95 p-5">
        <h2 className="mb-3 text-lg font-semibold text-[#F5F5F7]">Upload a sprint video</h2>
        <VideoUpload athleteId={athlete.id} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-[#F5F5F7]">Sessions</h2>
        {sessions && sessions.length > 0 ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/sessions/${s.id}`}
                  className="block rounded-xl border border-white/[0.06] bg-[#19191C] p-4 transition hover:border-[#D72638]/40 hover:bg-[#202024]"
                >
                  <span className="block truncate font-semibold text-[#F5F5F7]">
                    {sessionDisplayName(s)}
                  </span>
                  <span className="mt-2 flex items-center gap-2 text-xs text-[#6B7280]">
                    <span className="rounded border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[#A0A2A8]">
                      {STATUS_LABELS[s.status] ?? s.status}
                    </span>
                    {new Date(s.created_at).toLocaleString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[#A0A2A8]">No sessions yet. Upload a video to get started.</p>
        )}
      </section>
    </main>
  );
}
