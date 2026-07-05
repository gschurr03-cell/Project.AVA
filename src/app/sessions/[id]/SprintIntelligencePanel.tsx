import type { ReactNode } from "react";
import type {
  IntelligenceConfidence,
  Limiter,
  SprintIntelligenceReport,
} from "@/lib/intelligence";
import { buildCoachingInsights, type CoachingInsight, type InsightPriority } from "@/lib/coaching/insights";
import type { SprintMeasurements } from "@/lib/benchmark/measurements";

/**
 * Sprint Intelligence 2.0 (Day 70) — presentation only. Reads like a sprint coach:
 * an overall assessment, the biggest opportunity, what's holding speed back, one
 * primary recommendation, the supporting evidence (citing the trusted metrics that
 * produced it), confidence, a training focus, and a single takeaway.
 *
 * All analysis comes from `@/lib/intelligence` — this file only reframes that report
 * into coaching language. Because the engine already withholds frame-quantized
 * contact/flight limiters at ≤60 fps (Day 69), recommendations here are never built
 * from estimated 60 fps timing.
 */

const CONFIDENCE_BADGE: Record<IntelligenceConfidence, string> = {
  high: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-gray-200 text-gray-600",
};

const CONFIDENCE_WORDS: Record<IntelligenceConfidence, string> = {
  high: "High — the recording quality and evidence strongly support this read.",
  medium: "Moderate — the evidence points this way, but more of the run in frame would sharpen it.",
  low: "Low — treat this as a direction to explore, not a firm conclusion. See what would sharpen it below.",
};

/** Positive, coach-voice framing of the opportunity behind each limiter. */
const OPPORTUNITY: Record<string, string> = {
  strideLength: "developing longer, more powerful strides",
  stepFrequency: "raising your turnover so the legs reset faster",
  groundContact: "getting off the ground faster on each step",
  flightTime: "projecting further through each stride",
};

/** The counterpart a limiter is most often confused with, for comparative framing. */
const COUNTERPART: Record<string, { id: string; word: string }> = {
  strideLength: { id: "stepFrequency", word: "turnover" },
  stepFrequency: { id: "strideLength", word: "stride length" },
};

const LABEL = "text-xs font-semibold uppercase tracking-wide text-gray-400";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className={LABEL}>{title}</p>
      <div className="mt-1 text-sm leading-relaxed text-gray-700">{children}</div>
    </div>
  );
}

/** "Your stride length is limiting speed more than turnover" when we can tell. */
function comparativeLine(primary: Limiter, all: Limiter[]): string | null {
  const cp = COUNTERPART[primary.metricId];
  if (!cp) return null;
  // If the counterpart is NOT itself a flagged limiter, it's the relatively stronger
  // quality — so the primary is holding speed back more than it is.
  const counterpartIsLimiter = all.some((l) => l.metricId === cp.id);
  if (counterpartIsLimiter) return null;
  const opp = OPPORTUNITY[primary.metricId] ?? "this quality";
  return `Your ${primary.title.toLowerCase()} is limiting top speed more than your ${cp.word} is. Focus on ${opp} — that should produce bigger gains than simply trying to move the legs faster.`;
}

function takeaway(primary: Limiter): string {
  const drill = primary.drills[0];
  const opp = OPPORTUNITY[primary.metricId] ?? "your primary limiter";
  return drill
    ? `Prioritise ${opp}. Start with ${drill.name.toLowerCase()} — ${drill.coachingCue.toLowerCase()}`
    : `Prioritise ${opp} in the next training block.`;
}

function ConfidenceBadge({ confidence }: { confidence: IntelligenceConfidence }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${CONFIDENCE_BADGE[confidence]}`}>
      {confidence} confidence
    </span>
  );
}

const PRIORITY_BADGE: Record<InsightPriority, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-gray-100 text-gray-600",
};

/**
 * One structured coaching insight (Sprint Intelligence v2): observation →
 * biomechanical explanation → performance consequence → corrective focus → drills →
 * priority. Reads like an elite coach reviewing the run.
 */
function InsightCard({ insight }: { insight: CoachingInsight }) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-gray-800">{insight.metric}</p>
        <div className="flex items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${PRIORITY_BADGE[insight.priority]}`}>
            {insight.priority} priority
          </span>
          {insight.confidence !== "high" && (
            <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-amber-600">
              directional
            </span>
          )}
        </div>
      </div>

      <p className={`mt-3 ${LABEL}`}>Observation</p>
      <p className="text-sm text-gray-700">{insight.observation}</p>

      <p className={`mt-2 ${LABEL}`}>Why</p>
      <p className="text-sm text-gray-600">{insight.explanation}</p>

      <p className={`mt-2 ${LABEL}`}>Performance effect</p>
      <p className="text-sm text-gray-600">{insight.consequence}</p>

      <p className={`mt-2 ${LABEL}`}>Corrective focus</p>
      <p className="text-sm text-gray-600">{insight.correctiveFocus}</p>

      <p className={`mt-2 ${LABEL}`}>Suggested drills</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-gray-600">
        {insight.drills.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>

      <p className="mt-2 text-xs text-gray-400">{insight.confidenceNote}</p>
    </div>
  );
}

export default function SprintIntelligencePanel({
  report,
  measurements = null,
  timingReliable = true,
  legLengthCm = null,
}: {
  report: SprintIntelligenceReport;
  measurements?: SprintMeasurements | null;
  timingReliable?: boolean;
  legLengthCm?: number | null;
}) {
  const primary = report.primaryLimiter;
  const insights = measurements
    ? buildCoachingInsights({ measurements, timingReliable, legLengthCm })
    : [];
  const allLimiters = [primary, ...report.secondaryLimiters].filter((l): l is Limiter => !!l);
  const comparative = primary ? comparativeLine(primary, allLimiters) : null;
  const observedGaps = primary?.affectedPhases.filter((p) => !p.observed) ?? [];

  return (
    <section className="mb-8 space-y-5 rounded-xl border bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-lane">Sprint Intelligence</h2>
        {report.confidence && <ConfidenceBadge confidence={report.confidence} />}
      </div>

      {/* Overall assessment */}
      <Section title="Overall assessment">
        <p>{report.headline}</p>
        {report.performanceContext && <p className="mt-1 text-gray-600">{report.performanceContext}</p>}
      </Section>

      {report.available && primary ? (
        <>
          {/* Biggest opportunity */}
          <div className="rounded-lg border border-lane/20 bg-lane/5 p-4">
            <p className={LABEL}>Biggest opportunity</p>
            <p className="mt-1 text-base font-semibold text-gray-900">
              {OPPORTUNITY[primary.metricId]
                ? OPPORTUNITY[primary.metricId].replace(/^\w/, (c) => c.toUpperCase())
                : primary.title}
            </p>
            <p className="mt-1 text-sm text-gray-700">{comparative ?? primary.why}</p>
          </div>

          {/* What's holding speed back */}
          <Section title="What's holding speed back">
            <p>{primary.why}</p>
          </Section>

          {/* Primary recommendation */}
          <Section title="Primary recommendation">
            <p>{primary.coachingFocus}</p>
            {primary.drills.length > 0 && (
              <div className="mt-2 space-y-2">
                {primary.drills.slice(0, 3).map((d) => (
                  <div key={d.id} className="rounded border bg-gray-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-gray-800">{d.name}</p>
                      <span className="text-xs text-gray-400">{d.difficulty}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-gray-600">{d.coachingCue}</p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Supporting evidence — cites the trusted metrics */}
          {primary.reasoning.length > 0 && (
            <Section title="Supporting evidence">
              <ul className="list-disc space-y-0.5 pl-5 text-gray-600">
                {primary.reasoning.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </Section>
          )}

          {/* Also worth addressing (secondary) */}
          {report.secondaryLimiters.length > 0 && (
            <Section title="Also worth addressing">
              <ul className="space-y-1">
                {report.secondaryLimiters.map((l) => (
                  <li key={l.key} className="text-gray-700">
                    <span className="font-medium">{l.title}</span> — {l.coachingFocus}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Training focus */}
          <Section title="Training focus">
            <p>
              {allLimiters
                .map((l) => l.drills[0]?.name)
                .filter((v): v is string => !!v)
                .slice(0, 3)
                .join(" · ") || primary.coachingFocus}
            </p>
          </Section>

          {/* Confidence */}
          {report.confidence && (
            <Section title="Confidence">
              <p>{CONFIDENCE_WORDS[report.confidence]}</p>
            </Section>
          )}

          {/* Today's takeaway */}
          <div className="rounded-lg bg-gray-900 p-4 text-white">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Today&apos;s takeaway</p>
            <p className="mt-1 text-sm font-medium">{takeaway(primary)}</p>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-medium text-green-800">
            No single limiter stands out — the trusted metrics are well balanced for this athlete.
            Keep building overall speed and revisit as the training block progresses.
          </p>
        </div>
      )}

      {/* Coaching insights (Day 76) — metric-driven, elite-coach structured advice:
          observation → why → performance effect → corrective focus → drills → priority. */}
      {insights.length > 0 && (
        <Section title="Coaching insights">
          <div className="mt-1 space-y-3">
            {insights.map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </div>
        </Section>
      )}

      {/* What would sharpen this analysis (data gaps, coach-voiced) */}
      {(report.dataGaps.length > 0 || observedGaps.length > 0) && (
        <div className="rounded-md border border-sky-200 bg-sky-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
            What would sharpen this read
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-sky-900">
            {observedGaps.length > 0 && (
              <li>
                <span className="font-medium">Capture the full run</span> — this clip ends before some
                phases, so AVA can&apos;t yet evaluate them ({observedGaps.map((p) => p.label).join(", ")}
                ).
              </li>
            )}
            {report.dataGaps.map((g) => (
              <li key={g.what}>
                <span className="font-medium">{g.what}</span> — {g.wouldImprove}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.warnings.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-amber-700">
          {report.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <p className="text-xs text-gray-400">{report.method}</p>
    </section>
  );
}
