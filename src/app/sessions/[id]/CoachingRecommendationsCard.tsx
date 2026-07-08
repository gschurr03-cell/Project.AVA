import { AvaPanel } from "@/components/ava/AvaPanel";
import { AvaStatusPill } from "@/components/ava/AvaStatusPill";
import type {
  Recommendation,
  RecommendationReport,
  Severity,
} from "@/lib/intelligence/recommendations";

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
        <li key={e.label} className="rounded-lg border border-white/[0.06] bg-[#19191C] px-3 py-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#A0A2A8]">
              {e.label}
            </span>
            <span className="text-sm font-semibold text-[#F5F5F7]">
              {e.value}
              {e.benchmark ? (
                <span className="ml-2 text-xs font-medium text-[#6B7280]">vs {e.benchmark}</span>
              ) : null}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#8a8a90]">{e.interpretation}</p>
        </li>
      ))}
    </ul>
  );
}

function RecommendationBlock({ rec, lead }: { rec: Recommendation; lead: boolean }) {
  const badge = trustBadge(rec);
  return (
    <div
      className={`rounded-xl border p-4 ${
        lead ? "border-[#D72638]/25 bg-[#D72638]/[0.05]" : "border-white/[0.06] bg-[#141416]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6B7280]">
            {lead ? "Top priority" : "Also worth addressing"} · {rec.category.replace("_", " ")}
          </p>
          <h3 className="mt-1 text-base font-semibold tracking-tight text-[#F5F5F7]">{rec.title}</h3>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <AvaStatusPill label={rec.severity} tone={SEVERITY_TONE[rec.severity]} />
          <AvaStatusPill label={badge} tone={BADGE_TONE[badge]} />
        </div>
      </div>

      <Evidence evidence={rec.metricEvidence} />

      <p className="mt-3 text-sm leading-6 text-[#C7C8CC]">{rec.whyItMatters}</p>

      <div className="mt-3 rounded-lg border border-white/[0.06] bg-[#0f0f11] px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#D4AF37]">
          Coach cue
        </p>
        <p className="mt-0.5 text-sm text-[#F5F5F7]">{rec.coachingCue}</p>
      </div>

      {rec.trainingFocus.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6B7280]">
            Training focus
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[#A0A2A8]">
            {rec.trainingFocus.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-sm text-[#A0A2A8]">
        <span className="font-semibold text-[#F5F5F7]">Next session:</span> {rec.nextSessionGoal}
      </p>
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
export default function CoachingRecommendationsCard({ report }: { report: RecommendationReport }) {
  if (!report.available) return null;

  const top = report.recommendations.slice(0, TOP_N);

  return (
    <AvaPanel eyebrow="Coaching Recommendations" title="What to work on next">
      {top.length > 0 ? (
        <div className="space-y-3">
          {top.map((rec, i) => (
            <RecommendationBlock key={rec.id} rec={rec} lead={i === 0} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-[#A0A2A8]">
          No trusted limiting factor stands out in this rep — the measured metrics are within their
          target bands.
        </p>
      )}

      {report.experimental.length > 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-[#D4AF37]/30 bg-[#121214] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#D4AF37]">
            Coming soon · experimental
          </p>
          {report.experimental.map((rec) => (
            <div key={rec.id} className="mt-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-[#F5F5F7]">{rec.title}</h4>
                <AvaStatusPill label={trustBadge(rec)} tone="bronze" />
              </div>
              <p className="mt-1 text-xs leading-5 text-[#8a8a90]">{rec.whyItMatters}</p>
              <p className="mt-1 text-xs text-[#A0A2A8]">
                <span className="font-semibold text-[#F5F5F7]">Next session:</span>{" "}
                {rec.nextSessionGoal}
              </p>
            </div>
          ))}
        </div>
      )}
    </AvaPanel>
  );
}
