import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { sessionDisplayName, STATUS_LABELS } from "@/lib/sessions";
import {
  PROFILE_FIELDS,
  formatProfileValue,
  type AthleteProfileValues,
} from "@/lib/athletes/profile";
import AthleteProfileForm from "./AthleteProfileForm";
import VideoUpload from "./VideoUpload";

/**
 * The legacy Technique Score (and its trends) was built on the coaching engine, which
 * consumes not-yet-trusted temporal metrics (ground contact, flight time) and the raw
 * worker frequency. It has been replaced by the trusted-only AVA Performance Score,
 * which is computed LIVE per session from calibrated metrics. Historical analyses
 * don't yet persist trusted metrics, so the athlete-level score/trends honestly show
 * "Not enough trusted data" — open a session for its AVA Performance Score.
 */

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

  const sessionCount = sessions?.length ?? 0;

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

      <section className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4 sm:col-span-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">
            AVA Performance Score
          </p>
          <p className="mt-2 text-2xl font-bold text-[#A0A2A8]">Not enough trusted data</p>
          <p className="mt-1 text-xs text-[#6B7280]">
            The trusted-only score is computed live per session. Open a session to see its AVA
            Performance Score.
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">Sessions</p>
          <p className="mt-2 text-3xl font-bold text-[#F5F5F7]">{sessionCount}</p>
          <p className="mt-1 text-xs text-[#6B7280]">Total uploaded</p>
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
        <h2 className="mb-1 text-lg font-semibold text-[#F5F5F7]">Performance Trends</h2>
        <p className="text-sm text-[#A0A2A8]">Not enough trusted data.</p>
        <p className="mt-2 text-xs leading-5 text-[#6B7280]">
          AVA now tracks trusted-only outputs (AVA Performance Score, top speed, average velocity,
          peak stride length, frequency, stride retention). These are computed live per session and
          aren&apos;t yet stored across sessions, so athlete-level trends will appear once trusted
          metrics are persisted. Ground contact and flight time are not trusted yet and are excluded.
        </p>
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
