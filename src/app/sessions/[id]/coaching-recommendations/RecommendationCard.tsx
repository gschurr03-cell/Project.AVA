import type { CoachingRecommendation } from "@/lib/coachingRecommendations";
import { CONFIDENCE_LABEL_TEXT } from "@/lib/limitingFactors";

const LABELS: Record<CoachingRecommendation["category"], string> = {
  technical_focus: "Technical Focus",
  drill_idea: "Drill Idea",
  resisted_sprint: "Resisted Sprint",
  plyometric_emphasis: "Plyometric / Elastic Emphasis",
  strength_emphasis: "Strength Emphasis",
  rhythm_focus: "Rhythm & Frequency",
  assessment: "Additional Testing",
  monitoring: "Monitoring",
};

const STATUS: Record<CoachingRecommendation["status"], string> = {
  recommended: "Recommended",
  conditional: "Conditional",
  monitor_only: "Monitor Only",
  additional_testing: "Additional Testing Suggested",
  insufficient_evidence: "Insufficient Evidence",
  not_applicable: "Not Applicable",
};

export default function RecommendationCard({
  recommendation,
  rank,
}: {
  recommendation: CoachingRecommendation;
  rank?: number;
}) {
  const cautionId = `${recommendation.id.replace(/[^a-zA-Z0-9_-]/g, "-")}-caution`;
  return (
    <article
      tabIndex={0}
      aria-describedby={recommendation.cautions.length ? cautionId : undefined}
      className="rounded-2xl border border-white/[0.08] bg-[#182233] p-5 outline-none transition focus-visible:ring-2 focus-visible:ring-[#3b8eff]/70"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#3b8eff]">
            {rank ? `${rank}. ` : ""}{LABELS[recommendation.category]}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-[#f5f7fb]">{recommendation.title}</h3>
        </div>
        <div className="text-right text-xs text-[#b3bccb]">
          <p className="font-semibold text-[#f5f7fb]">{STATUS[recommendation.status]}</p>
          <p>
            {CONFIDENCE_LABEL_TEXT[recommendation.confidence.label]}
            {recommendation.confidence.score != null ? ` · ${Math.round(recommendation.confidence.score * 100)}%` : ""}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-[#d8dee9]">{recommendation.summary}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">Why this was recommended</h4>
          <p className="mt-1 text-sm leading-relaxed text-[#b3bccb]">{recommendation.rationale}</p>
        </div>
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">Addresses</h4>
          <ul className="mt-1 space-y-1 text-sm text-[#b3bccb]">
            {recommendation.limiterIds.map((id) => <li key={id}>• {id.replaceAll("_", " ")}</li>)}
          </ul>
        </div>
      </div>

      {recommendation.implementationGuidance.length > 0 && (
        <div className="mt-4">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">Suggested direction</h4>
          <ul className="mt-1 space-y-1 text-sm text-[#d8dee9]">
            {recommendation.implementationGuidance.map((item) => <li key={item}>• {item}</li>)}
          </ul>
        </div>
      )}
      {recommendation.observationCues.length > 0 && (
        <div className="mt-4">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">What to observe</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {recommendation.observationCues.map((cue) => (
              <span key={cue} className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-xs text-[#d8dee9]">{cue}</span>
            ))}
          </div>
        </div>
      )}
      {recommendation.cautions.length > 0 && (
        <div id={cautionId} className="mt-4 rounded-xl border border-[#f5c451]/20 bg-[#f5c451]/[0.05] p-3">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#f5c451]">Important caution</h4>
          {recommendation.cautions.map((item) => <p key={item} className="mt-1 text-xs leading-relaxed text-[#d8cda4]">{item}</p>)}
        </div>
      )}
      <details className="mt-4 border-t border-white/[0.06] pt-3">
        <summary className="cursor-pointer text-xs font-semibold text-[#8fb9ff]">Evidence and confidence details</summary>
        <ul className="mt-2 space-y-1 text-xs text-[#7e8797]">
          {recommendation.evidenceReferences.map((e, index) => (
            <li key={`${e.limiterId}-${e.label}-${index}`}>{e.label}: {e.value}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs leading-relaxed text-[#7e8797]">{recommendation.confidence.explanation}</p>
      </details>
    </article>
  );
}
