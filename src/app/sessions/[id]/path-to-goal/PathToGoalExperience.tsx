import type {
  PathToGoalView,
  LimiterCard,
  RecommendationCard,
  TargetRow,
  LeftRightAnalysis,
} from "@/lib/intelligence/performanceGap/presentation";
import type { Confidence, EvidenceCategory, PerformanceNode } from "@/lib/intelligence/performanceGap";

/**
 * Path To Goal — the primary coaching experience (Part B). Presentational only;
 * consumes the pure view-model. Renders the athlete's roadmap from current → goal
 * with a clear visual hierarchy: headline → breakdown → limiters → targets →
 * recommendations → left/right, every value tagged measured/estimated/inferred/
 * unknown so an estimate can never be mistaken for a measurement.
 */

const EVIDENCE_TONE: Record<EvidenceCategory, string> = {
  measured: "border-[#89d46a]/40 bg-[#89d46a]/10 text-[#89d46a]",
  estimated: "border-[#f5c451]/40 bg-[#f5c451]/10 text-[#f5c451]",
  inferred: "border-[#b3bccb]/30 bg-white/[0.04] text-[#b3bccb]",
  unknown: "border-white/10 bg-white/[0.03] text-[#7e8797]",
};

function EvidenceBadge({ confidence }: { confidence: Confidence }) {
  const c = confidence.category;
  const pct = confidence.score != null ? ` ${Math.round(confidence.score * 100)}%` : "";
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${EVIDENCE_TONE[c]}`}
      title={confidence.rationale ?? c}
    >
      {c}
      {c === "estimated" || c === "inferred" ? pct : ""}
    </span>
  );
}

const fmt = (v: number | null | undefined, unit = "", dp = 2) =>
  v == null ? "—" : `${Number(v).toFixed(dp)}${unit ? ` ${unit}` : ""}`;

function TreeNode({ node, depth = 0 }: { node: PerformanceNode; depth?: number }) {
  return (
    <div className={depth > 0 ? "mt-1.5 border-l border-white/10 pl-3" : ""}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-[#f5f7fb]">{node.label}</span>
        <EvidenceBadge confidence={node.confidence} />
      </div>
      {node.association && <p className="mt-0.5 text-[11px] leading-4 text-[#7e8797]">{node.association}</p>}
      {node.children.map((c) => (
        <TreeNode key={c.id} node={c} depth={depth + 1} />
      ))}
    </div>
  );
}

function LimiterCardView({ card }: { card: LimiterCard }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#101827] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#2f80ed]">
            Priority #{card.rank} · {card.expectedImprovement} expected gain
          </p>
          <h3 className="mt-1 text-xl font-bold tracking-tight text-[#f5f7fb]">{card.label}</h3>
        </div>
        <div className="flex items-center gap-2">
          <EvidenceBadge confidence={card.confidence} />
          {card.contributionPct != null && (
            <span className="rounded-lg bg-[#2f80ed]/10 px-2.5 py-1 text-sm font-bold text-[#e46464]">
              {card.contributionPct}% of remaining gap
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Current" value={fmt(card.current)} />
        <Stat label="Estimated Target" value={fmt(card.target)} tone="gold" />
        <Stat label="Remaining Gap" value={card.gap != null ? `+${fmt(card.gap)}` : "—"} />
        <Stat label="Gap %" value={card.percentGap != null ? `${card.percentGap.toFixed(1)}%` : "—"} />
      </div>

      <p className="mt-4 text-sm leading-6 text-[#C7C8CC]">{card.whyItMatters}</p>
      {card.estimatedTimeGainS != null && (
        <p className="mt-1 text-xs text-[#b3bccb]">
          Estimated time available from closing this gap:{" "}
          <span className="font-semibold text-[#f5c451]">~{card.estimatedTimeGainS.toFixed(2)} s</span> (estimated)
        </p>
      )}

      {(card.associatedTechnicalPatterns.length > 0 || card.associatedMuscleGroups.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[#7e8797]">
          {card.associatedTechnicalPatterns.length > 0 && (
            <span>
              <span className="font-semibold text-[#b3bccb]">Associated patterns:</span>{" "}
              {card.associatedTechnicalPatterns.join(", ")}
            </span>
          )}
          {card.associatedMuscleGroups.length > 0 && (
            <span>
              <span className="font-semibold text-[#b3bccb]">Associated muscle groups:</span>{" "}
              {card.associatedMuscleGroups.join(", ")}
            </span>
          )}
        </div>
      )}

      {/* Expandable explainability — where the recommendation came from. */}
      {card.tree && (
        <details className="group mt-3">
          <summary className="cursor-pointer list-none text-xs font-semibold text-[#b3bccb] hover:text-[#f5f7fb] [&::-webkit-details-marker]:hidden">
            <span className="inline-block transition group-open:rotate-90">▸</span> Why? Supporting evidence &amp;
            reasoning
          </summary>
          <div className="mt-2 rounded-lg border border-white/[0.06] bg-[#0f0f11] p-3">
            <ul className="mb-2 list-disc space-y-0.5 pl-4 text-[11px] text-[#7e8797]">
              {card.evidence.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <TreeNode node={card.tree.root} />
            {card.recommendedInterventions.length > 0 && (
              <p className="mt-2 text-[11px] text-[#b3bccb]">
                <span className="font-semibold">Suggested interventions:</span>{" "}
                {card.recommendedInterventions.join(", ")}
              </p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "gold" }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#0f0f11] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7e8797]">{label}</p>
      <p className={`mt-0.5 text-base font-bold ${tone === "gold" ? "text-[#f5c451]" : "text-[#f5f7fb]"}`}>{value}</p>
    </div>
  );
}

function TargetRowView({ row }: { row: TargetRow }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-[#f5f7fb]">{row.label}</span>
        <EvidenceBadge confidence={row.confidence} />
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-[#b3bccb]">{fmt(row.current)}</span>
        <span className="text-[#7e8797]">→</span>
        <span className="font-semibold text-[#f5c451]">{fmt(row.target)}</span>
        <span className="w-20 text-right text-[#e46464]">
          {row.gap != null ? `${row.lowerIsBetter ? "−" : "+"}${fmt(row.gap)}` : "—"}
        </span>
      </div>
    </div>
  );
}

function RecommendationCardView({ card }: { card: RecommendationCard }) {
  const List = ({ title, items }: { title: string; items: string[] }) =>
    items.length === 0 ? null : (
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7e8797]">{title}</p>
        <p className="mt-0.5 text-xs text-[#b3bccb]">{items.join(", ")}</p>
      </div>
    );
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#101827] p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="text-base font-semibold text-[#f5f7fb]">{card.title}</h4>
        <EvidenceBadge confidence={card.confidence} />
      </div>
      <p className="mt-1 text-sm leading-6 text-[#C7C8CC]">{card.reason}</p>

      {card.estimatedRaceTimeGainS && (
        <p className="mt-2 text-sm">
          <span className="font-semibold text-[#f5f7fb]">Estimated time improvement:</span>{" "}
          <span className="text-[#f5c451]">
            {card.estimatedRaceTimeGainS.min.toFixed(2)}–{card.estimatedRaceTimeGainS.max.toFixed(2)} s
          </span>{" "}
          <span className="text-[10px] uppercase tracking-[0.12em] text-[#7e8797]">estimated · not guaranteed</span>
        </p>
      )}

      {card.estimatedEffects.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-[#7e8797]">
          {card.estimatedEffects.map((e) => (
            <li key={e.metricId}>
              {e.label}: {e.direction === "increase" ? "+" : "−"}
              {Math.abs(e.delta)} {e.unit} <span className="text-[#7e8797]">(estimated)</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <List title="Muscle groups" items={card.associatedMuscleGroups} />
        <List title="Drills" items={card.drills} />
        <List title="Strength" items={card.strengthWork} />
        <List title="Mobility" items={card.mobilityWork} />
        <List title="Sprint sessions" items={card.sprintSessions} />
      </div>
      <p className="mt-3 text-[10px] text-[#7e8797]">Evidence: {card.evidenceSource}</p>
    </div>
  );
}

const LR_TONE: Record<LeftRightAnalysis["classification"], string> = {
  normal_variation: "text-[#89d46a]",
  moderate_asymmetry: "text-[#f5c451]",
  performance_limiter: "text-[#e46464]",
  review_recommended: "text-[#e46464]",
};
const LR_LABEL: Record<LeftRightAnalysis["classification"], string> = {
  normal_variation: "Normal variation",
  moderate_asymmetry: "Moderate asymmetry",
  performance_limiter: "Performance limiter",
  review_recommended: "Review recommended",
};

function LeftRightView({ a }: { a: LeftRightAnalysis }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#101827] p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-[#f5f7fb]">{a.label}</span>
        <EvidenceBadge confidence={a.confidence} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
        <Stat label="Left" value={fmt(a.left)} />
        <Stat label="Right" value={fmt(a.right)} />
        <Stat label="Diff" value={a.differencePct != null ? `${a.differencePct.toFixed(1)}%` : "—"} />
      </div>
      <p className={`mt-2 text-xs font-semibold ${LR_TONE[a.classification]}`}>
        {LR_LABEL[a.classification]}{" "}
        <span className="font-normal text-[#7e8797]">
          (target ≤ {a.targetDifferencePct}% — perfect symmetry not required)
        </span>
      </p>
      <p className="mt-1 text-[11px] leading-4 text-[#7e8797]">{a.note}</p>
      {a.associatedTechnicalPatterns.length > 0 && (
        <p className="mt-1 text-[11px] text-[#7e8797]">Associated: {a.associatedTechnicalPatterns.join(", ")}</p>
      )}
    </div>
  );
}

export default function PathToGoalExperience({ view }: { view: PathToGoalView }) {
  const h = view.headline;
  return (
    <div className="space-y-8">
      {/* CURRENT → GOAL → GAP headline */}
      <section className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-[#1a1416] to-[#101827] p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#2f80ed]">Path To Goal</p>
        <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-[#7e8797]">Current · {h.distanceM}m</p>
            <p className="text-3xl font-bold text-[#f5f7fb]">{h.currentTimeS != null ? h.currentTimeS.toFixed(2) : "—"}</p>
          </div>
          <span className="pb-2 text-2xl text-[#7e8797]">→</span>
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-[#7e8797]">Goal</p>
            <p className="text-3xl font-bold text-[#f5c451]">{h.goalTimeS != null ? h.goalTimeS.toFixed(2) : "—"}</p>
          </div>
          <span className="pb-2 text-2xl text-[#7e8797]">=</span>
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-[#7e8797]">Remaining Gap</p>
            <p className="text-3xl font-bold text-[#e46464]">
              {h.remainingGapS != null ? h.remainingGapS.toFixed(2) : "—"}
            </p>
          </div>
        </div>
        {h.currentAvgVelocityMps != null && h.requiredAvgVelocityMps != null && (
          <p className="mt-3 text-xs text-[#b3bccb]">
            Average velocity {h.currentAvgVelocityMps.toFixed(2)} → required{" "}
            <span className="text-[#f5c451]">{h.requiredAvgVelocityMps.toFixed(2)}</span> m/s
          </p>
        )}
      </section>

      {/* Performance breakdown */}
      {view.breakdown.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold tracking-tight text-[#f5f7fb]">Performance Breakdown</h2>
          <div className="space-y-2">
            {view.breakdown.map((b) => (
              <div key={b.metricId} className="flex items-center gap-3">
                <span className="w-44 shrink-0 text-sm text-[#b3bccb]">{b.label}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-[#2f80ed]" style={{ width: `${Math.min(100, b.contributionPct)}%` }} />
                </div>
                <span className="w-12 shrink-0 text-right text-sm font-semibold text-[#f5f7fb]">
                  {Math.round(b.contributionPct)}%
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-[#7e8797]">Estimated contribution of each limiter to the remaining gap.</p>
        </section>
      )}

      {/* Training priorities (quantified limiters) */}
      {view.limiterCards.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold tracking-tight text-[#f5f7fb]">Training Priorities</h2>
          <div className="space-y-4">
            {view.limiterCards.map((c) => (
              <LimiterCardView key={c.metricId} card={c} />
            ))}
          </div>
        </section>
      )}

      {/* Required targets */}
      <section>
        <h2 className="mb-2 text-lg font-semibold tracking-tight text-[#f5f7fb]">Required Targets</h2>
        <div className="rounded-2xl border border-white/[0.06] bg-[#101827] px-5 py-2">
          {view.targetRows.map((r) => (
            <TargetRowView key={r.metricId} row={r} />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-[#7e8797]">
          Estimated requirements are derived from your current values and goal — not fixed benchmarks.
        </p>
      </section>

      {/* Left / right */}
      {view.leftRight.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold tracking-tight text-[#f5f7fb]">Left / Right Analysis</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {view.leftRight.map((a) => (
              <LeftRightView key={a.metricId} a={a} />
            ))}
          </div>
        </section>
      )}

      {/* Recommendations */}
      {view.recommendationCards.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold tracking-tight text-[#f5f7fb]">Recommended Interventions</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {view.recommendationCards.map((c) => (
              <RecommendationCardView key={c.recommendationId} card={c} />
            ))}
          </div>
        </section>
      )}

      <p className="text-[11px] leading-5 text-[#7e8797]">
        AVA builds a personalized roadmap from your current performance to your target, and is scientifically honest
        about uncertainty: every value is labelled <span className="text-[#89d46a]">measured</span>,{" "}
        <span className="text-[#f5c451]">estimated</span>, <span className="text-[#b3bccb]">inferred</span>, or{" "}
        <span className="text-[#7e8797]">unknown</span>. Estimates are never guarantees. Model{" "}
        {view.provenance.configVersion}.
      </p>
    </div>
  );
}
