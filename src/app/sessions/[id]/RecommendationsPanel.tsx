import { getExercise, type CoachingRecommendation } from "@/lib/coaching/recommendations";

/**
 * Presentation only: renders the ranked training recommendations produced by the
 * deterministic engine in `@/lib/coaching/recommendations`. The highest-scored
 * recommendation is shown in full as the "Top Priority"; the rest render as
 * compact "Secondary Priorities". No logic of its own.
 */

const BADGE_BASE = "rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide";
const NEUTRAL_BADGE = "bg-gray-100 text-gray-600";
const LABEL = "text-xs font-semibold uppercase tracking-wide text-gray-400";

/** Badge colour by recommendation priority (high/medium/low). */
const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-gray-100 text-gray-600",
};

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`${BADGE_BASE} ${PRIORITY_BADGE[priority] ?? NEUTRAL_BADGE}`}>{priority}</span>
  );
}

function SupportingMetrics({ metrics }: { metrics: CoachingRecommendation["supportingMetrics"] }) {
  if (metrics.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-sm text-gray-600">
      {metrics.map((metric) => (
        <li key={metric.label}>
          <span className="font-medium">{metric.label}:</span> {metric.value}
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
    <div className="rounded border bg-gray-50 p-3">
      <p className="font-medium text-gray-800">{exercise.name}</p>

      <p className={`mt-2 ${LABEL}`}>Purpose</p>
      <p className="text-sm text-gray-600">{exercise.purpose}</p>

      <p className={`mt-2 ${LABEL}`}>Cue</p>
      <p className="text-sm text-gray-600">{exercise.coachingCue}</p>

      <p className={`mt-2 ${LABEL}`}>Difficulty</p>
      <p className="text-sm text-gray-600">{exercise.difficulty}</p>
    </div>
  );
}

/** One-line drill summary for secondary recommendations. */
function ExerciseCompact({ id }: { id: string }) {
  const exercise = getExercise(id);
  if (!exercise) return null;
  return (
    <li>
      <span className="font-medium text-gray-700">{exercise.name}</span> — {exercise.coachingCue} (
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
      <section className="mt-6 rounded-lg border bg-gray-50 p-5">
        <h2 className="text-xl font-bold text-lane">Recommendations</h2>
        <p className="mt-2 text-sm text-gray-500">No recommendations available.</p>
      </section>
    );
  }

  const [top, ...secondary] = recommendations;

  return (
    <section className="mt-6 space-y-6 rounded-lg border bg-gray-50 p-5">
      <h2 className="text-xl font-bold text-lane">Recommendations</h2>

      {/* Top priority */}
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <p className={LABEL}>Top Priority</p>
          <div className="flex items-center gap-2">
            <PriorityBadge priority={top.priority} />
            <span className="text-xs font-medium text-gray-500">{top.confidence}% confidence</span>
          </div>
        </div>

        <h3 className="mt-2 text-lg font-semibold text-gray-800">{top.title}</h3>

        <p className={`mt-3 ${LABEL}`}>Why this matters</p>
        <p className="text-sm text-gray-600">{top.rationale}</p>

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
          <h3 className="mb-2 text-base font-semibold text-gray-800">Secondary Priorities</h3>
          <div className="space-y-3">
            {secondary.map((recommendation) => (
              <div key={recommendation.id} className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-gray-800">{recommendation.title}</p>
                  <div className="flex items-center gap-2">
                    <PriorityBadge priority={recommendation.priority} />
                    <span className="text-xs font-medium text-gray-500">
                      {recommendation.confidence}%
                    </span>
                  </div>
                </div>

                <p className="mt-2 text-sm text-gray-600">{recommendation.explanation}</p>

                <SupportingMetrics metrics={recommendation.supportingMetrics} />

                {recommendation.drills.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-gray-500">
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
    </section>
  );
}
