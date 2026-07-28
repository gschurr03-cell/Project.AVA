import { AvaStatusPill } from "@/components/ava/AvaStatusPill";
import type { WorkoutResult } from "@/lib/intelligence/workoutBuilder";

/**
 * "AVA Session Plan" — presentation only. Renders the coach-ready session built for
 * the top trusted recommendation (goal, warm-up, 3–5 main pieces, one sprint
 * integration, a next-session metric goal, and a trust note). When AVA can't build a
 * plan (untrusted recommendation / weak recording) it shows the honest fallback line
 * instead of an empty or broken plan. No logic of its own.
 */
export default function SessionPlanCard({ result }: { result: WorkoutResult }) {
  return (
    <div className="mt-4 rounded-2xl border border-white/[0.08] bg-[#101827] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#f5c451]">
          AVA Session Plan
        </p>
        {result.available && (
          <div className="flex items-center gap-2">
            <AvaStatusPill label={result.plan.sessionType.replace(/_/g, " ")} tone="gold" />
            <span className="text-xs text-[#7e8797]">~{result.plan.estimatedDurationMin} min</span>
          </div>
        )}
      </div>

      {!result.available ? (
        <p className="mt-2 text-sm text-[#b3bccb]">{result.message}</p>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm font-semibold text-[#f5f7fb]">{result.plan.goal}</p>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7e8797]">
              Warm-up focus
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-[#b3bccb]">
              {result.plan.warmupFocus.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7e8797]">
              Main set
            </p>
            <div className="mt-1.5 space-y-1.5">
              {result.plan.mainExercises.map((ex, i) => (
                <div
                  key={ex.exerciseId}
                  className="rounded-lg border border-white/[0.06] bg-[#182233] px-3 py-2"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-sm font-semibold text-[#f5f7fb]">
                      {i + 1}. {ex.name}
                    </span>
                    <span className="text-sm font-medium text-[#f5c451]">{ex.prescription}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-[#7e8797]">{ex.purpose}</p>
                  <p className="mt-1 text-xs text-[#b3bccb]">
                    <span className="font-semibold text-[#f5f7fb]">Cue:</span> {ex.cue}
                  </p>
                  <p className="mt-0.5 text-xs text-[#7e8797]">
                    Rest {ex.rest} · {ex.stopRule}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {result.plan.sprintIntegration && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7e8797]">
                Sprint integration
              </p>
              <div className="mt-1.5 rounded-lg border border-[#2f80ed]/25 bg-[#2f80ed]/[0.05] px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-sm font-semibold text-[#f5f7fb]">
                    {result.plan.sprintIntegration.name}
                  </span>
                  <span className="text-sm font-medium text-[#f5c451]">
                    {result.plan.sprintIntegration.prescription}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#b3bccb]">
                  <span className="font-semibold text-[#f5f7fb]">Cue:</span>{" "}
                  {result.plan.sprintIntegration.cue}
                </p>
                <p className="mt-0.5 text-xs text-[#7e8797]">Rest {result.plan.sprintIntegration.rest}</p>
              </div>
            </div>
          )}

          <p className="text-sm text-[#b3bccb]">
            <span className="font-semibold text-[#f5f7fb]">Next session goal:</span>{" "}
            {result.plan.nextSessionMetricGoal}
          </p>
          <p className="text-xs italic text-[#7e8797]">{result.plan.trustNote}</p>
        </div>
      )}
    </div>
  );
}
