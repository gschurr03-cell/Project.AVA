import { AvaPanel } from "@/components/ava/AvaPanel";
import { AvaStatusPill } from "@/components/ava/AvaStatusPill";
import type {
  Recommendation,
  RecommendationReport,
  Severity,
} from "@/lib/intelligence/recommendations";
import {
  selectExercisesForRecommendation,
  type ExerciseSelectionContext,
  type SelectedExercise,
} from "@/lib/intelligence/exerciseSelection";
import EvidenceMoments from "./EvidenceMoments";
import { buildWorkoutPlan } from "@/lib/intelligence/workoutBuilder";
import SessionPlanCard from "./SessionPlanCard";

/** How many trusted recommendations to headline. */
const TOP_N = 3;

const SEVERITY_TONE: Record<Severity, "red" | "gold" | "gray"> = {
  high: "red",
  moderate: "gold",
  low: "gray",
};

type TrustBadge = "Trusted" | "Estimate" | "Needs higher FPS" | "Needs better tracking";

/** Derive the trust badge from the recommendation's own trust + confidence + category. */
function trustBadge(rec: Recommendation): TrustBadge {
  if (rec.category === "experimental") return "Needs higher FPS";
  if (!rec.trusted) return rec.category === "asymmetry" ? "Needs higher FPS" : "Needs better tracking";
  return rec.confidence === "high" ? "Trusted" : "Estimate";
}

const BADGE_TONE: Record<TrustBadge, "gold" | "silver" | "bronze"> = {
  Trusted: "gold",
  Estimate: "silver",
  "Needs higher FPS": "bronze",
  "Needs better tracking": "bronze",
};

function Evidence({ evidence }: { evidence: Recommendation["metricEvidence"] }) {
  if (evidence.length === 0) return null;
  return (
    <ul className="mt-3 space-y-2">
      {evidence.map((e) => (
        <li key={e.label} className="rounded-lg border border-white/[0.06] bg-[#182233] px-3 py-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b3bccb]">
              {e.label}
            </span>
            <span className="text-sm font-semibold text-[#f5f7fb]">
              {e.value}
              {e.benchmark ? (
                <span className="ml-2 text-xs font-medium text-[#7e8797]">vs {e.benchmark}</span>
              ) : null}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#7e8797]">{e.interpretation}</p>
        </li>
      ))}
    </ul>
  );
}

const EX_TRUST_LABEL: Record<SelectedExercise["exercise"]["trust"], string> = {
  trusted: "Trusted",
  estimate: "Estimate",
  experimental: "Needs higher FPS",
};
const EX_TRUST_TONE: Record<SelectedExercise["exercise"]["trust"], "gold" | "silver" | "bronze"> = {
  trusted: "gold",
  estimate: "silver",
  experimental: "bronze",
};

function ExerciseItem({ picked }: { picked: SelectedExercise }) {
  const ex = picked.exercise;
  const rx = ex.prescription;
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#101827] px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="text-sm font-semibold text-[#f5f7fb]">{ex.name}</h5>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7e8797]">
            {ex.level}
          </span>
          <AvaStatusPill label={EX_TRUST_LABEL[ex.trust]} tone={EX_TRUST_TONE[ex.trust]} />
        </div>
      </div>
      <p className="mt-1 text-xs leading-5 text-[#7e8797]">
        <span className="font-semibold text-[#b3bccb]">Why:</span> {picked.why}
      </p>
      {ex.cues[0] && (
        <p className="mt-1 text-xs leading-5 text-[#b3bccb]">
          <span className="font-semibold text-[#f5c451]">Cue:</span> {ex.cues[0]}
        </p>
      )}
      <p className="mt-1 text-xs text-[#7e8797]">
        {rx.sets} × {rx.reps} · {rx.intensity} · rest {rx.rest} · {rx.frequency}
      </p>
    </div>
  );
}

function RecommendedExercises({ picks }: { picks: SelectedExercise[] }) {
  if (picks.length === 0) return null;
  // The engine already returns a deduplicated 2–3. Cap defensively at the
  // presentation boundary so any legacy/oversized input is still reduced here, and
  // there is no "Show more" affordance — this is the focused priority set, not a
  // browsable library.
  const top = picks.slice(0, 3);
  return (
    <div className="mt-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7e8797]">
        Highest-impact interventions
      </p>
      <p className="mt-0.5 text-[11px] leading-4 text-[#7e8797]">
        This week&apos;s priorities — options, not all in one session.
      </p>
      <div className="mt-1.5 space-y-1.5">
        {top.map((p) => (
          <ExerciseItem key={p.exercise.id} picked={p} />
        ))}
      </div>
    </div>
  );
}

function RecommendationBlock({
  rec,
  lead,
  context,
}: {
  rec: Recommendation;
  lead: boolean;
  context: ExerciseSelectionContext;
}) {
  const badge = trustBadge(rec);
  const picks = selectExercisesForRecommendation(rec, {
    ...context,
    weakSide: null,
    severity: rec.severity,
    confidence: rec.confidence,
    metricEvidenceLabels: rec.metricEvidence.map((e) => e.label),
  });
  return (
    <div
      className={`rounded-xl border p-4 ${
        lead ? "border-[#2f80ed]/25 bg-[#2f80ed]/[0.05]" : "border-white/[0.06] bg-[#101827]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7e8797]">
            {lead ? "Top priority" : "Also worth addressing"} · {rec.category.replace("_", " ")}
          </p>
          <h3 className="mt-1 text-base font-semibold tracking-tight text-[#f5f7fb]">{rec.title}</h3>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <AvaStatusPill label={rec.severity} tone={SEVERITY_TONE[rec.severity]} />
          <AvaStatusPill label={badge} tone={BADGE_TONE[badge]} />
        </div>
      </div>

      <Evidence evidence={rec.metricEvidence} />

      <EvidenceMoments moments={rec.evidenceMoments} />

      <p className="mt-3 text-sm leading-6 text-[#C7C8CC]">{rec.whyItMatters}</p>

      <div className="mt-3 rounded-lg border border-white/[0.06] bg-[#0f0f11] px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f5c451]">
          Coach cue
        </p>
        <p className="mt-0.5 text-sm text-[#f5f7fb]">{rec.coachingCue}</p>
      </div>

      {rec.trainingFocus.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7e8797]">
            Training focus
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[#b3bccb]">
            {rec.trainingFocus.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-sm text-[#b3bccb]">
        <span className="font-semibold text-[#f5f7fb]">Next session:</span> {rec.nextSessionGoal}
      </p>

      <RecommendedExercises picks={picks} />
    </div>
  );
}

/**
 * Coaching Recommendations V2 — presentation only. Renders the ranked, trusted
 * recommendations from the deterministic engine (top 1–3), each with its measured
 * evidence, why it matters, a coach cue, training focus, a next-session goal, and a
 * trust badge. FPS-gated items render in a separate, muted "coming soon" strip and
 * never mix with the trusted priorities. No logic of its own.
 */
export default function CoachingRecommendationsCard({
  report,
  context,
}: {
  report: RecommendationReport;
  context: ExerciseSelectionContext;
}) {
  if (!report.available) return null;

  const top = report.recommendations.slice(0, TOP_N);

  // Session plan for the TOP recommendation only (keeps the coach focused on one
  // priority). Untrusted / recording-setup limiters yield the honest fallback message.
  const topRec = report.recommendations[0];
  const workout = topRec
    ? buildWorkoutPlan(topRec, {
        ...context,
        weakSide: null,
        severity: topRec.severity,
        confidence: topRec.confidence,
        metricEvidenceLabels: topRec.metricEvidence.map((e) => e.label),
      })
    : null;

  return (
    <AvaPanel eyebrow="Coaching Recommendations" title="What to work on next">
      {top.length > 0 ? (
        <div className="space-y-3">
          {top.map((rec, i) => (
            <RecommendationBlock key={rec.id} rec={rec} lead={i === 0} context={context} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-[#b3bccb]">
          No trusted limiting factor stands out in this rep — the measured metrics are within their
          target bands.
        </p>
      )}

      {workout && <SessionPlanCard result={workout} />}

      {/* The "coming soon · experimental" strip (ground-contact & stiffness coaching,
          120fps-gated) is a future-metric placeholder outside the locked MVP scope and
          is intentionally not rendered. */}
    </AvaPanel>
  );
}
