import { AvaPanel } from "@/components/ava/AvaPanel";
import type { TrustedMetricConfidence } from "@/lib/confidence";
import type { TrustedMetrics } from "@/lib/intelligence/trustedMetrics";
import {
  buildSessionEvidenceSummary,
  explainMetricEvidence,
  explainZoneCoverage,
  type EvidenceExplanation,
} from "@/lib/intelligence/evidenceExplanations";

/**
 * MVP Sprint Metrics — the locked, source-of-truth card. It renders the shared
 * {@link TrustedMetrics} object directly, so every other customer-facing surface shows
 * the same numbers. The MVP scientific output is exactly FIVE metrics: Average Step
 * Length, Peak Step Length, Step Frequency, Average Velocity, Peak Velocity. Step length
 * is opposite-foot (left↔right) contact distance; "stride length" is not used in the MVP.
 * Peak Step Length is the highest rolling four-consecutive-step average length; Peak
 * Velocity is the engine's peak single-stride velocity (stable, avoids single-step
 * frame-quantization outliers). No advanced timing derivatives (contact/flight time,
 * duty factor, oscillation, etc.) appear anywhere in the MVP. No selection logic lives
 * here — the one place that choice is made is `buildTrustedMetrics`.
 *
 * Day 98: each of the five metrics renders from its OWN evidence
 * (`trusted.evidence`, from `@/lib/intelligence/metricEvidence`) — one
 * metric's missing evidence never hides a different metric that has its own.
 * An unavailable metric shows "Unavailable" plus its real reason, never "—"
 * as an unexplained blank and never a fabricated value.
 */

function BigStat({
  label,
  value,
  unit,
  sub,
  explanation,
}: {
  label: string;
  value: string | null;
  unit: string;
  sub?: string;
  /** Present (even if `value` is non-null) means this metric is unavailable;
   *  when set, `value`/`unit`/`sub` are ignored in favor of the reason. */
  explanation?: EvidenceExplanation;
}) {
  const unavailable = explanation !== undefined;
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#182233] p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7e8797]">{label}</p>
      {unavailable ? (
        <>
          <p className="mt-1 text-lg font-bold tracking-tight text-[#7e8797]">Unavailable</p>
          <p className="mt-0.5 text-xs text-[#7e8797]">
            {explanation?.message ?? "AVA could not verify the evidence required for this metric."}
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 text-3xl font-extrabold tracking-tight text-[#f5f7fb]">
            {value}
            <span className="ml-1 text-base font-medium text-[#b3bccb]">{unit}</span>
          </p>
          {sub && <p className="mt-0.5 text-xs text-[#7e8797]">{sub}</p>}
        </>
      )}
    </div>
  );
}

export type SprintResultState = "verified" | "partial" | "unavailable";

/**
 * The single decision point for the card's headline title. Day 98: driven
 * ENTIRELY by each metric's own, already-evaluated availability (`trusted.*`,
 * sourced from `evaluateMetricEvidence`) — there is no separate whole-
 * recording override here anymore. A session that lost athlete tracking for
 * most of its length but still has real, individually-verified evidence for
 * one or more metrics is "partial", not blanket "unavailable": the metrics
 * that passed their own evidence contract are always rendered.
 */
export function deriveSprintResultState(trusted: TrustedMetrics): SprintResultState {
  const coreMetrics = [
    trusted.avgStrideLengthM,
    trusted.peakStrideLengthM,
    trusted.frequencyHz,
    trusted.avgVelocityMps,
    trusted.topSpeedMps,
  ];
  const availableCount = coreMetrics.filter((v) => v != null).length;
  if (availableCount === 0) return "unavailable";
  if (availableCount < coreMetrics.length || trusted.zoneTimeS == null) return "partial";
  return "verified";
}

export default function PerformanceSummaryCard({
  trusted,
  confidence,
  calibrationComplete,
  resultStatus,
}: {
  trusted: TrustedMetrics | null;
  confidence: TrustedMetricConfidence | null;
  calibrationComplete: boolean;
  resultStatus: "current" | "superseded" | "pending";
}) {
  const n = (v: number | null | undefined, d = 2) => (v == null ? "—" : v.toFixed(d));

  if (!trusted || !confidence) {
    const updating = calibrationComplete && resultStatus !== "current";
    return (
      <AvaPanel eyebrow="Sprint Metrics" title={updating ? "Analysis updating" : "Awaiting calibration"}>
        <p className="text-sm text-[#b3bccb]">
          {updating
            ? "Your confirmed timing gates and known distance are saved. AVA is calculating the five sprint metrics against the latest calibration."
            : "Set Gate A, Gate B, and a known distance in the Timing Workspace to unlock average step length, peak step length, step frequency, average velocity, and peak velocity for this run."}
        </p>
      </AvaPanel>
    );
  }

  const state = deriveSprintResultState(trusted);
  const evidenceFor = (metric: string) => trusted.evidence.find((e) => e.metric === metric) ?? null;
  const explanationFor = (metric: string) => {
    const evidence = evidenceFor(metric);
    return evidence ? explainMetricEvidence(evidence, "athlete") : undefined;
  };
  const summary = buildSessionEvidenceSummary(trusted.evidence, "athlete");
  const coverageMessage = explainZoneCoverage(trusted.zoneCoverage, "athlete");
  const recordingFix = summary.rootCauses.find((cause) => cause.actionText)?.actionText ?? null;

  if (state === "unavailable") {
    // Zero of the five core metrics cleared their own evidence contract — every
    // metric's specific reason is still available in `trusted.evidence` (see the
    // Sprint Metrics breakdown elsewhere), but the headline card is honest that
    // nothing here is measurable yet rather than showing five empty reasons.
    return (
      <AvaPanel eyebrow="Sprint Metrics" title="Analysis unavailable">
        <p className="text-sm text-[#b3bccb]">
          {summary.message}
        </p>
        {summary.rootCauses[0] && <p className="mt-2 text-sm text-[#7e8797]">{summary.rootCauses[0].message}</p>}
        {recordingFix && <p className="mt-2 text-sm text-[#b3bccb]">How to improve this recording: {recordingFix}</p>}
      </AvaPanel>
    );
  }

  // Zone context — "20 m zone · 1.92 s" — shown alongside the output. Degrades
  // gracefully: distance-only when the time isn't verified, omitted entirely
  // when even the distance is unavailable. The time NEVER appears unless
  // `trusted.zoneTimeS` is verified (see `buildTrustedMetrics`) — it is never a
  // clip-duration, pose-track, or contact-span fallback.
  const zoneContext =
    trusted.zoneDistanceM != null
      ? `${trusted.zoneDistanceM} m zone${trusted.zoneTimeS != null ? ` · ${n(trusted.zoneTimeS)} s` : " · time unverified"}`
      : null;

  return (
    <AvaPanel eyebrow="Sprint Metrics" title={state === "verified" ? "Verified Performance" : "Partial Results"}>
      {zoneContext && (
        <div className="-mt-3 mb-4 inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-semibold text-[#b3bccb]">
          {zoneContext}
        </div>
      )}
      {state === "partial" && (
        <p className="-mt-1 mb-3 text-xs text-[#7e8797]">
          {summary.message}
        </p>
      )}
      {state === "partial" && recordingFix && (
        <details className="-mt-1 mb-3 text-xs text-[#b3bccb]">
          <summary className="cursor-pointer text-[#8fbfff]">How to improve this recording</summary>
          <p className="mt-1">{recordingFix}</p>
        </details>
      )}
      {/* Day 99 (Part 8) — a step-length/velocity average is real evidence from
          only PART of the zone if that's all the pose data supports; say so
          explicitly rather than presenting a sub-window average as if it
          covered the full distance. */}
      {coverageMessage && (
          <p className="-mt-1 mb-3 text-xs text-amber-300/90">
            {coverageMessage}
          </p>
      )}
      {/* MVP locked scope: exactly these five metrics, each independent. Peak Step Length
          and Peak Velocity are rolling four-consecutive-step aggregates (not single steps). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <BigStat
          label="Average step length"
          value={n(trusted.avgStrideLengthM)}
          unit="m"
          sub="Average opposite-foot (L↔R)"
          explanation={trusted.avgStrideLengthM == null ? explanationFor("avgStrideLengthM") : undefined}
        />
        <BigStat
          label="Peak step length"
          value={n(trusted.peakStrideLengthM)}
          unit="m"
          sub="Best rolling 4-step average"
          explanation={trusted.peakStrideLengthM == null ? explanationFor("peakStrideLengthM") : undefined}
        />
        <BigStat
          label="Step frequency"
          value={n(trusted.frequencyHz)}
          unit="Hz"
          sub="Across calibrated zone"
          explanation={trusted.frequencyHz == null ? explanationFor("frequencyHz") : undefined}
        />
        <BigStat
          label="Average velocity"
          value={n(trusted.avgVelocityMps)}
          unit="m/s"
          sub={`${trusted.zoneDistanceM != null ? Math.round(trusted.zoneDistanceM) : 30} m average`}
          explanation={trusted.avgVelocityMps == null ? explanationFor("avgVelocityMps") : undefined}
        />
        <BigStat
          label="Peak velocity"
          value={n(trusted.topSpeedMps)}
          unit="m/s"
          sub="Peak single-stride"
          explanation={trusted.topSpeedMps == null ? explanationFor("topSpeedMps") : undefined}
        />
      </div>
    </AvaPanel>
  );
}
