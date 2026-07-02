import type {
  CoachingReport,
  CoachingInsight,
  CoachingPriority,
} from "@/lib/coaching/types";

/**
 * Presentation only: renders a {@link CoachingReport} produced by the coaching
 * engine. All coaching logic lives in `@/lib/coaching`; this component performs
 * no metric analysis of its own.
 */
export default function InsightPanel({ report }: { report: CoachingReport }) {
  return (
    <section className="mt-6 rounded border bg-gray-50 p-4">
      <h2 className="mb-4 text-lg font-semibold text-lane">AVA Coaching Report</h2>

      <div className="mb-6 rounded border bg-white p-4">
        <p className="text-sm font-medium text-gray-500">Technique Score</p>
        <p className="mt-1 text-3xl font-bold text-lane">{report.techniqueScore}</p>
      </div>

      <div className="mb-6">
        <h3 className="mb-2 text-base font-semibold text-gray-800">Coach Summary</h3>
        <p className="text-sm text-gray-600">{report.summary}</p>
      </div>

      <div className="mb-6">
        <h3 className="mb-2 text-base font-semibold text-gray-800">Top Priorities</h3>
        {report.priorities.length === 0 ? (
          <p className="text-sm text-gray-500">No urgent priorities found.</p>
        ) : (
          <div className="space-y-2">
            {report.priorities.map((priority: CoachingPriority) => (
              <div key={priority.id} className="rounded border bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-gray-800">{priority.title}</p>
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs uppercase text-gray-600">
                    {priority.priority}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  <span className="font-medium">Recommendation:</span> {priority.recommendation}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  <span className="font-medium">Impact:</span> {priority.impact}
                </p>
                <ul className="mt-1 list-disc pl-5 text-xs text-gray-400">
                  {priority.evidence.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-base font-semibold text-gray-800">Detailed Insights</h3>
        {report.insights.length === 0 ? (
          <p className="text-sm text-gray-500">No detailed insights were generated.</p>
        ) : (
          <div className="space-y-2">
            {report.insights.map((insight: CoachingInsight) => (
              <div key={insight.id} className="rounded border bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-gray-800">{insight.title}</p>
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs uppercase text-gray-600">
                    {insight.severity}
                  </span>
                </div>
                <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">
                  {insight.category}
                </p>
                <p className="mt-1 text-sm text-gray-500">{insight.explanation}</p>
                <p className="mt-2 text-sm text-gray-600">
                  <span className="font-medium">Recommendation:</span> {insight.recommendation}
                </p>
                <ul className="mt-1 list-disc pl-5 text-xs text-gray-400">
                  {insight.evidence.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
