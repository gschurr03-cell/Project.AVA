import { getExercise } from "@/lib/coaching/recommendations";
import type { FocusArea, FocusTrend, TrainingFocus } from "@/lib/coaching/focus";

/**
 * Presentation only: renders the athlete-level training focus produced by the
 * deterministic engine in `@/lib/coaching/focus`. The top-ranked focus is shown
 * in full as the block's "Primary Focus"; the rest render as compact secondary
 * areas. All copy and drills come from the engine — no logic here beyond
 * resolving drill ids and choosing badge styling.
 */

const LABEL = "text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]";

/** Coach-facing text + colour for a limiter's session-over-session direction. */
const TREND_STYLE: Record<FocusTrend, { label: string; className: string }> = {
  worsening: { label: "Worsening", className: "border border-[#FF3B30]/40 bg-[#FF3B30]/12 text-[#FF7A70]" },
  improving: { label: "Improving", className: "border border-[#D4AF37]/40 bg-[#D4AF37]/12 text-[#E4C25A]" },
  steady: { label: "Steady", className: "border border-white/10 bg-white/[0.05] text-[#A0A2A8]" },
};

function TrendBadge({ trend }: { trend: FocusTrend }) {
  const style = TREND_STYLE[trend];
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${style.className}`}
    >
      {style.label}
    </span>
  );
}

function persistenceLabel(area: FocusArea): string {
  return `${area.occurrences} of ${area.sessionsAnalyzed} sessions · ${area.persistencePct}% persistence`;
}

/** Full drill detail (name, purpose, cue, difficulty) for the primary focus. */
function ExerciseDetail({ id }: { id: string }) {
  const exercise = getExercise(id);
  if (!exercise) return null;
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
      <p className="font-medium text-[#F5F5F7]">{exercise.name}</p>

      <p className={`mt-2 ${LABEL}`}>Purpose</p>
      <p className="text-sm text-[#A0A2A8]">{exercise.purpose}</p>

      <p className={`mt-2 ${LABEL}`}>Cue</p>
      <p className="text-sm text-[#A0A2A8]">{exercise.coachingCue}</p>

      <p className={`mt-2 ${LABEL}`}>Difficulty</p>
      <p className="text-sm text-[#A0A2A8]">{exercise.difficulty}</p>
    </div>
  );
}

/** One-line drill summary for secondary focus areas. */
function ExerciseCompact({ id }: { id: string }) {
  const exercise = getExercise(id);
  if (!exercise) return null;
  return (
    <li>
      <span className="font-medium text-[#A0A2A8]">{exercise.name}</span> — {exercise.coachingCue} (
      {exercise.difficulty})
    </li>
  );
}

export default function TrainingFocusPanel({ focus }: { focus: TrainingFocus }) {
  // Nothing analyzed yet — the athlete page shows its own empty states, but keep
  // this self-contained so the panel is safe to render unconditionally.
  if (focus.sessionsAnalyzed === 0) {
    return (
      <section className="rounded-2xl border border-white/[0.06] bg-[#121214]/95 p-5">
        <h2 className="text-lg font-semibold">Training Focus</h2>
        <p className="mt-2 text-sm text-[#6B7280]">
          Analyze a sprint to surface this athlete&rsquo;s primary training focus.
        </p>
      </section>
    );
  }

  if (focus.allClear || !focus.primary) {
    return (
      <section className="rounded-2xl border border-white/[0.06] bg-[#121214]/95 p-5">
        <h2 className="text-lg font-semibold">Training Focus</h2>
        <p className="mt-2 text-sm text-[#A0A2A8]">
          <span className="mr-1 text-[#E4C25A]">✓</span>
          Across the last {focus.sessionsAnalyzed}{" "}
          {focus.sessionsAnalyzed === 1 ? "session" : "sessions"}, every key metric is within its
          target range. Maintain the current program.
        </p>
      </section>
    );
  }

  const { primary } = focus;
  const secondary = focus.areas.slice(1);

  return (
    <section className="space-y-6 rounded-2xl border border-white/[0.06] bg-[#121214]/95 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Training Focus</h2>
        <span className="text-xs text-[#6B7280]">
          Across {focus.sessionsAnalyzed} analyzed{" "}
          {focus.sessionsAnalyzed === 1 ? "session" : "sessions"}
        </span>
      </div>

      {/* Primary focus */}
      <div className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4">
        <div className="flex items-center justify-between gap-3">
          <p className={LABEL}>Primary Focus</p>
          <div className="flex items-center gap-2">
            <TrendBadge trend={primary.trend} />
            <span className="text-xs font-medium text-[#6B7280]">
              Focus score {primary.focusScore}
            </span>
          </div>
        </div>

        <h3 className="mt-2 text-lg font-semibold text-[#F5F5F7]">
          {primary.title}
          <span className="ml-2 align-middle text-xs font-medium uppercase tracking-wide text-[#6B7280]">
            {primary.category}
          </span>
        </h3>

        <p className="mt-1 text-xs text-[#6B7280]">{persistenceLabel(primary)}</p>

        <p className={`mt-3 ${LABEL}`}>What to work on</p>
        <p className="text-sm text-[#A0A2A8]">{primary.explanation}</p>

        <p className={`mt-3 ${LABEL}`}>Why this matters</p>
        <p className="text-sm text-[#A0A2A8]">{primary.rationale}</p>

        <p className={`mt-3 ${LABEL}`}>Latest reading</p>
        <ul className="mt-1 space-y-0.5 text-sm text-[#A0A2A8]">
          {primary.supportingMetrics.map((metric) => (
            <li key={metric.label}>
              <span className="font-medium">{metric.label}:</span> {metric.value}
            </li>
          ))}
        </ul>

        {primary.drills.length > 0 && (
          <>
            <p className={`mt-3 ${LABEL}`}>Recommended Exercises</p>
            <div className="mt-1 space-y-2">
              {primary.drills.map((id) => (
                <ExerciseDetail key={id} id={id} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Secondary focus areas */}
      {secondary.length > 0 && (
        <div>
          <h3 className="mb-2 text-base font-semibold text-[#F5F5F7]">Secondary Focus Areas</h3>
          <div className="space-y-3">
            {secondary.map((area) => (
              <div key={area.id} className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#F5F5F7]">{area.title}</p>
                    <p className="mt-0.5 text-xs text-[#6B7280]">{persistenceLabel(area)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendBadge trend={area.trend} />
                    <span className="text-xs font-medium text-[#6B7280]">{area.focusScore}</span>
                  </div>
                </div>

                <p className="mt-2 text-sm text-[#A0A2A8]">{area.explanation}</p>

                {area.drills.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-[#6B7280]">
                    {area.drills.map((id) => (
                      <ExerciseCompact key={id} id={id} />
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
