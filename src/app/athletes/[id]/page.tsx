import Link from "next/link";

import AppShell from "@/components/nav/AppShell";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { sessionDisplayName, STATUS_LABELS } from "@/lib/sessions";
import { analysisTypeConfig } from "@/lib/analysisTypes";
import {
  PROFILE_FIELDS,
  formatProfileValue,
  type AthleteProfileValues,
} from "@/lib/athletes/profile";
import AthleteProfileForm from "./AthleteProfileForm";
import VideoUpload from "./VideoUpload";
import CoachNotesPanel from "./CoachNotesPanel";
import {
  VIDEO_BIOMECHANICS_CONSENT_TYPE,
  VIDEO_BIOMECHANICS_CONSENT_VERSION,
} from "@/lib/privacy/consent";

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
      "id, full_name, height_cm, weight_kg, leg_length_cm, trochanter_height_m, personal_best_60m, personal_best_100m, personal_best_200m, goal_60m, goal_100m, goal_200m",
    )
    .eq("id", id)
    .single();

  if (!athlete) notFound();
  const { data: consent } = await supabase.from("user_consents").select("accepted_at")
    .eq("user_id", user.id)
    .eq("consent_type", VIDEO_BIOMECHANICS_CONSENT_TYPE)
    .eq("consent_version", VIDEO_BIOMECHANICS_CONSENT_VERSION)
    .maybeSingle();

  // Narrow the athlete row to just the profile fields for the form + display.
  const profileValues = Object.fromEntries(
    PROFILE_FIELDS.map((def) => [def.key, athlete[def.key] ?? null]),
  ) as AthleteProfileValues;
  const hasAnyProfile = PROFILE_FIELDS.some((def) => profileValues[def.key] != null);

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, name, original_filename, video_path, status, created_at, analysis_type")
    .eq("athlete_id", athlete.id)
    .order("created_at", { ascending: false });

  const sessionCount = sessions?.length ?? 0;
  const { data: coachNotes } = await supabase.from("coach_notes")
    .select("*").eq("athlete_id", athlete.id)
    .order("pinned", { ascending: false }).order("updated_at", { ascending: false }).limit(50);

  return (
    <AppShell userEmail={user.email ?? ""}>
      <Link href="/dashboard" className="text-sm text-[#b3bccb] transition hover:text-[#f5f7fb]">
        ← Back to athletes
      </Link>

      <div className="mb-6 mt-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#2f80ed]">
          Athlete
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#f5f7fb]">
          {athlete.full_name}
        </h1>
        <p className="mt-1 text-sm text-[#7e8797]">
          Athlete dashboard, session history, and progress tracking.
        </p>
      </div>

      {profileError && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-[#e46464]/40 bg-[#e46464]/10 px-3 py-2 text-sm text-[#e46464]"
        >
          {profileError}
        </p>
      )}
      {saved && (
        <p className="mb-4 rounded-xl border border-[#f5c451]/40 bg-[#f5c451]/10 px-3 py-2 text-sm text-[#f5c451]">
          Profile saved.
        </p>
      )}

      <section className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.06] bg-[#182233] p-4 sm:col-span-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7e8797]">
            AVA Performance Score
          </p>
          <p className="mt-2 text-2xl font-bold text-[#b3bccb]">Not enough trusted data</p>
          <p className="mt-1 text-xs text-[#7e8797]">
            The trusted-only score is computed live per session. Open a session to see its AVA
            Performance Score.
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-[#182233] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7e8797]">
            Sessions
          </p>
          <p className="mt-2 text-3xl font-bold text-[#f5f7fb]">{sessionCount}</p>
          <p className="mt-1 text-xs text-[#7e8797]">Total uploaded</p>
        </div>
      </section>
      <Link
        href={`/athletes/${athlete.id}/progress`}
        className="mb-8 flex items-center justify-between rounded-2xl border border-[#2f80ed]/35 bg-[#2f80ed]/10 p-5 transition hover:bg-[#2f80ed]/15"
      >
        <span>
          <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-[#3b8eff]">Athlete Progress Center</span>
          <span className="mt-1 block text-lg font-semibold text-[#f5f7fb]">See longitudinal performance</span>
          <span className="block text-sm text-[#b3bccb]">Trends, PBs, limiter evolution, and analysis comparisons.</span>
        </span>
        <span className="text-2xl text-[#3b8eff]">→</span>
      </Link>

      {/* Physical & Performance Profile — collapsed by default (Day 75) to reduce
          page clutter; all fields + the edit form remain inside. */}
      <details className="group mb-8 rounded-2xl border border-white/[0.06] bg-[#101827]/95 p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
          <span className="text-lg font-semibold text-[#f5f7fb]">
            Physical &amp; Performance Profile
            <span className="ml-2 text-xs font-normal text-[#7e8797]">
              {hasAnyProfile ? "reference measurements & targets" : "not set yet"}
            </span>
          </span>
          <svg
            className="h-4 w-4 shrink-0 text-[#7e8797] transition-transform duration-150 group-open:rotate-90"
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
          <p className="mb-4 text-xs text-[#7e8797]">
            Reference measurements and target times. Stored for future calibration and personal-best
            prediction — not yet used in any metric calculation.
          </p>

          {hasAnyProfile ? (
            <dl className="mb-6 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-3">
              {PROFILE_FIELDS.map((def) => (
                <div
                  key={def.key}
                  className="flex justify-between gap-2 border-b border-white/[0.06] py-1"
                >
                  <dt className="text-[#7e8797]">{def.label}</dt>
                  <dd className="font-medium text-[#f5f7fb]">
                    {formatProfileValue(profileValues[def.key], def.unit)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mb-6 text-sm text-[#7e8797]">
              No profile details yet. Add them below to have them on hand for upcoming calibration
              and PB-prediction features.
            </p>
          )}

          <AthleteProfileForm athleteId={athlete.id} values={profileValues} />
        </div>
      </details>

      <section className="mb-8 rounded-2xl border border-white/[0.06] bg-[#101827]/95 p-5">
        <h2 className="mb-1 text-lg font-semibold text-[#f5f7fb]">Performance Trends</h2>
        <p className="text-sm text-[#b3bccb]">Not enough trusted data.</p>
        <p className="mt-2 text-xs leading-5 text-[#7e8797]">
          AVA now tracks trusted-only outputs (AVA Performance Score, top speed, average velocity,
          peak stride length, frequency, stride retention). These are computed live per session and
          aren&apos;t yet stored across sessions, so athlete-level trends will appear once trusted
          metrics are persisted. Ground contact and flight time are not trusted yet and are
          excluded.
        </p>
      </section>
      <CoachNotesPanel athleteId={athlete.id} notes={coachNotes ?? []} />

      <section className="mb-8 rounded-2xl border border-white/[0.06] bg-[#101827]/95 p-5">
        <h2 className="mb-3 text-lg font-semibold text-[#f5f7fb]">Upload a sprint video</h2>
        <VideoUpload athleteId={athlete.id} consentAccepted={Boolean(consent)} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-[#f5f7fb]">Sessions</h2>
        {sessions && sessions.length > 0 ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/sessions/${s.id}`}
                  className="block rounded-xl border border-white/[0.06] bg-[#182233] p-4 transition hover:border-[#2f80ed]/40 hover:bg-[#223047]"
                >
                  <span className="block truncate font-semibold text-[#f5f7fb]">
                    {sessionDisplayName(s)}
                  </span>
                  {s.analysis_type === "acceleration" && (
                    <span className="mt-1 block text-xs text-[#f5c451]">
                      {analysisTypeConfig(s.analysis_type).analysisTitle}
                    </span>
                  )}
                  <span className="mt-2 flex items-center gap-2 text-xs text-[#7e8797]">
                    <span className="rounded border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[#b3bccb]">
                      {STATUS_LABELS[s.status] ?? s.status}
                    </span>
                    {new Date(s.created_at).toLocaleString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[#b3bccb]">No sessions yet. Upload a video to get started.</p>
        )}
      </section>
    </AppShell>
  );
}
