import { AvaPanel } from "@/components/ava/AvaPanel";
import { AVA_BADGE, type AvaTone } from "@/lib/design/ava";
import { getExercise, type CoachingRecommendation } from "@/lib/coaching/recommendations";

/**
 * Presentation only: renders the ranked training recommendations produced by the
 * deterministic engine in `@/lib/coaching/recommendations`. The highest-scored
 * recommendation is shown in full as the "Top Priority"; the rest render as
 * compact "Secondary Priorities". No logic of its own.
 */

const BADGE_BASE = "rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide border";
const LABEL = "text-xs font-semibold uppercase tracking-wide text-[#6B7280]";

/** Urgency tone by recommendation priority (high/medium/low). */
const PRIORITY_TONE: Record<string, AvaTone> = {
  high: "alert",
  medium: "bronze",
  low: "gray",
};

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`${BADGE_BASE} ${AVA_BADGE[PRIORITY_TONE[priority] ?? "gray"]}`}>
      {priority}
    </span>
  );
}

function SupportingMetrics({ metrics }: { metrics: CoachingRecommendation["supportingMetrics"] }) {
  if (metrics.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-sm text-[#A0A2A8]">
      {metrics.map((metric) => (
        <li key={metric.label}>
          <span className="font-medium text-[#F5F5F7]">{metric.label}:</span> {metric.value}
        </li>
      ))}
    </ul>
  );
}

/** Full drill detail (name, purpose, cue, difficulty) for the top recommendation. */
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

/** One-line drill summary for secondary recommendations. */
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

export default function RecommendationsPanel({
  recommendations,
}: {
  recommendations: CoachingRecommendation[];
}) {
  if (recommendations.length === 0) {
    return (
      <AvaPanel eyebrow="Training Plan" title="Recommendations">
        <p className="text-sm text-[#A0A2A8]">No recommendations available.</p>
      </AvaPanel>
    );
  }

  const [top, ...secondary] = recommendations;

  return (
    <AvaPanel eyebrow="Training Plan" title="Recommendations">
      <div className="space-y-6">
        {/* Top priority */}
        <div className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className={LABEL}>Top Priority</p>
            <div className="flex items-center gap-2">
              <PriorityBadge priority={top.priority} />
              <span className="text-xs font-medium text-[#6B7280]">{top.confidence}% confidence</span>
            </div>
          </div>

          <h3 className="mt-2 text-lg font-semibold text-[#F5F5F7]">{top.title}</h3>

          <p className={`mt-3 ${LABEL}`}>Why this matters</p>
          <p className="text-sm text-[#A0A2A8]">{top.rationale}</p>

          <p className={`mt-3 ${LABEL}`}>Supporting Metrics</p>
          <SupportingMetrics metrics={top.supportingMetrics} />

          {top.drills.length > 0 && (
            <>
              <p className={`mt-3 ${LABEL}`}>Recommended Exercises</p>
              <div className="mt-1 space-y-2">
                {top.drills.map((id) => (
                  <ExerciseDetail key={id} id={id} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Secondary priorities */}
        {secondary.length > 0 && (
          <div>
            <h3 className="mb-2 text-base font-semibold text-[#F5F5F7]">Secondary Priorities</h3>
            <div className="space-y-3">
              {secondary.map((recommendation) => (
                <div
                  key={recommendation.id}
                  className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-[#F5F5F7]">{recommendation.title}</p>
                    <div className="flex items-center gap-2">
                      <PriorityBadge priority={recommendation.priority} />
                      <span className="text-xs font-medium text-[#6B7280]">
                        {recommendation.confidence}%
                      </span>
                    </div>
                  </div>

                  <p className="mt-2 text-sm text-[#A0A2A8]">{recommendation.explanation}</p>

                  <SupportingMetrics metrics={recommendation.supportingMetrics} />

                  {recommendation.drills.length > 0 && (
                    <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-[#6B7280]">
                      {recommendation.drills.map((id) => (
                        <ExerciseCompact key={id} id={id} />
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AvaPanel>
  );
}
