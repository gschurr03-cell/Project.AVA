import { AvaPanel } from "@/components/ava/AvaPanel";
import type { AccelerationMetrics } from "@/lib/acceleration/metrics";
import {
  buildAccelerationLimitingFactors,
  buildAccelerationRecommendations,
} from "@/lib/acceleration/limitingFactors";
import { buildAccelerationSummary } from "@/lib/acceleration/summary";
import { computeCombinedAccelerationLimiters } from "@/lib/acceleration/mechanicsPipeline";
import type { MechanicalProgression } from "@/lib/acceleration/mechanicsProgression";

const fmt = (n: number | null | undefined, digits = 2) => (n == null ? "—" : n.toFixed(digits));

interface HighlightPoint {
  x: number;
  y: number;
  label: string;
  color?: string;
}

/** A minimal, self-contained inline SVG line chart — no chart library exists in this repo yet. */
function LineChart({
  points,
  width = 560,
  height = 170,
  yLabel,
  highlights = [],
}: {
  points: { x: number; y: number }[];
  width?: number;
  height?: number;
  yLabel: string;
  highlights?: HighlightPoint[];
}) {
  if (points.length < 2) {
    return <p className="text-xs text-[#7e8797]">Not enough data points to chart {yLabel}.</p>;
  }
  const pad = 30;
  const allX = [...points.map((p) => p.x), ...highlights.map((h) => h.x)];
  const allY = [...points.map((p) => p.y), ...highlights.map((h) => h.y)];
  const xMin = Math.min(...allX);
  const xMax = Math.max(...allX) || 1;
  const yMin = Math.min(0, ...allY);
  const yMax = Math.max(...allY) * 1.15 || 1;
  const sx = (x: number) => pad + ((x - xMin) / (xMax - xMin || 1)) * (width - pad * 2);
  const sy = (y: number) => height - pad - ((y - yMin) / (yMax - yMin || 1)) * (height - pad * 2);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={yLabel}>
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#2a3548" strokeWidth={1} />
      <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#2a3548" strokeWidth={1} />
      <path d={path} fill="none" stroke="#2f80ed" strokeWidth={2} />
      {points.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={2.5} fill="#2f80ed" />
      ))}
      {highlights.map((h, i) => (
        <g key={`h-${i}`}>
          <circle cx={sx(h.x)} cy={sy(h.y)} r={5} fill={h.color ?? "#f5c451"} stroke="#0b1220" strokeWidth={1.5} />
          <text x={sx(h.x) + 7} y={sy(h.y) - 7} fontSize={9} fill={h.color ?? "#f5c451"} fontWeight={700}>
            {h.label}
          </text>
        </g>
      ))}
      <text x={pad} y={16} fontSize={10} fill="#7e8797">
        {yLabel}
      </text>
    </svg>
  );
}

/** Hides the chart in favor of an honest note when there aren't enough
 *  reliable observations to plot a trend (Part 15) — never renders a
 *  misleading two-point line from sparse/low-confidence mechanics data. */
function MechanicalProgressionChart({ title, progression }: { title: string; progression: MechanicalProgression }) {
  if (progression.observationCount < 3) {
    return (
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7e8797]">{title}</p>
        <p className="text-xs text-[#7e8797]">Not enough reliable observations.</p>
      </div>
    );
  }
  return (
    <div>
      <LineChart yLabel={title} points={progression.series.map((p) => ({ x: p.distanceM, y: p.value }))} />
      {progression.findings.length > 0 && (
        <ul className="mt-1 list-inside list-disc text-[10px] text-[#7e8797]">
          {progression.findings.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 border-t border-white/[0.06] pt-5 first:mt-0 first:border-0 first:pt-0">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-[#7e8797]">{title}</h3>
      {children}
    </div>
  );
}

const RATING_LABEL: Record<string, string> = {
  strong: "Strong",
  developing: "Developing",
  needs_focus: "Needs focus",
  insufficient_data: "Insufficient data",
};
const RATING_COLOR: Record<string, string> = {
  strong: "#89d46a",
  developing: "#f5c451",
  needs_focus: "#e46464",
  insufficient_data: "#7e8797",
};

export default function AccelerationAnalysisPanel({
  metrics,
  athlete,
}: {
  metrics: AccelerationMetrics;
  athlete: {
    heightCm: number | null;
    legLengthCm: number | null;
    trochanterHeightM: number | null;
    weightKg: number | null;
    primaryEvent: string | null;
  } | null;
}) {
  const hasV2 = Boolean(metrics.markerSplits && metrics.intervalMetrics && metrics.steps);
  const progression = metrics.progression ?? null;
  const mechanics = metrics.mechanics ?? null;
  const stepLimiters = hasV2
    ? buildAccelerationLimitingFactors({
        analysis: {
          intervalMetrics: metrics.intervalMetrics!,
          steps: metrics.steps!,
          asymmetries: metrics.asymmetries ?? null,
          progression,
          warnings: metrics.warnings,
          peakVelocityMps: metrics.peakVelocityDetail?.velocityMps ?? null,
          fpsAdequate: metrics.quality?.fpsAdequate ?? false,
        },
        athlete,
      })
    : [];
  // Merges Phase 2 step-level limiters with Phase 3 mechanics-derived limiters
  // (Part 13) — both are pure functions of already-persisted data, computed
  // here at render time, mirroring how `stepLimiters` itself is derived.
  const limiters = computeCombinedAccelerationLimiters({
    stepLimiters,
    mechanics,
    steps: metrics.steps ?? [],
    progression,
  });
  const recommendations = buildAccelerationRecommendations(limiters);
  const summaryCard = hasV2
    ? buildAccelerationSummary({
        limiters,
        recommendations,
        progression,
        peakVelocityMps: metrics.peakVelocityDetail?.velocityMps ?? null,
      })
    : null;

  const velocityHighlights: HighlightPoint[] = [];
  const accelerationHighlights: HighlightPoint[] = [];
  if (progression?.peakVelocityGain) {
    const gainPoint = progression.velocityCurve.find((p) => p.stepNumber === progression.peakVelocityGain!.stepNumber);
    if (gainPoint) velocityHighlights.push({ x: gainPoint.distanceM, y: gainPoint.velocityMps, label: "Largest gain", color: "#f5c451" });
  }
  if (progression) {
    const peakVPoint = progression.velocityCurve.reduce(
      (best, p) => (p.velocityMps > (best?.velocityMps ?? -Infinity) ? p : best),
      progression.velocityCurve[0],
    );
    if (peakVPoint) velocityHighlights.push({ x: peakVPoint.distanceM, y: peakVPoint.velocityMps, label: "Peak velocity", color: "#2f80ed" });
    if (progression.peakAcceleration) {
      accelerationHighlights.push({ x: progression.peakAcceleration.distanceM, y: progression.peakAcceleration.value, label: "Peak accel.", color: "#89d46a" });
    }
    if (progression.accelerationDeclineStep) {
      const declinePoint = progression.accelerationCurve.find((p) => p.stepNumber === progression.accelerationDeclineStep!.stepNumber);
      if (declinePoint?.accelerationMps2 != null) {
        accelerationHighlights.push({ x: declinePoint.distanceM, y: declinePoint.accelerationMps2, label: "Decline starts", color: "#e46464" });
      }
    }
  }

  return (
    <AvaPanel eyebrow="Acceleration Analysis" title="Acceleration Profile">
      {/* 0. Summary card (Part 8) — understandable in under 30 seconds. */}
      {summaryCard && (
        <Section title="At a glance">
          <div className="mb-3 flex items-center gap-2">
            <span
              className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide"
              style={{ backgroundColor: `${RATING_COLOR[summaryCard.rating]}22`, color: RATING_COLOR[summaryCard.rating] }}
            >
              {RATING_LABEL[summaryCard.rating]}
            </span>
            <span className="text-xs text-[#7e8797]">{summaryCard.ratingExplanation}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SummaryStat label="Biggest strength" value={summaryCard.biggestStrength} />
            <SummaryStat label="Biggest limiter" value={summaryCard.biggestLimiter ?? "None identified"} />
            <SummaryStat label="Peak velocity" value={summaryCard.peakVelocityMps != null ? `${summaryCard.peakVelocityMps.toFixed(2)} m/s` : "—"} />
            <SummaryStat label="Peak acceleration" value={summaryCard.peakAccelerationMps2 != null ? `${summaryCard.peakAccelerationMps2.toFixed(2)} m/s²` : "—"} />
            <SummaryStat label="Most efficient phase" value={summaryCard.mostEfficientPhase ?? "—"} />
            <SummaryStat label="Primary recommendation" value={summaryCard.primaryRecommendation ?? "—"} />
          </div>
        </Section>
      )}

      {/* 1. Summary */}
      <Section title="Summary">
        {metrics.status === "needs_review" && (
          <div className="mb-3 rounded-lg border border-[#f5c451]/30 bg-[#f5c451]/10 p-3 text-sm text-[#f5c451]">
            Needs review — the start instant could not be confidently detected. Confirm a start frame manually to
            unlock metrics.
          </div>
        )}
        {hasV2 && metrics.analysisZone && (
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#7e8797]">
            Analysis Zone: {metrics.analysisZone.entryDistanceM}–{metrics.analysisZone.exitDistanceM} m
          </p>
        )}
        <p className="text-sm text-[#b3bccb]">{metrics.summary}</p>
        {metrics.startEvent.type === "FIRST_DETECTED_MOVEMENT" && (
          <p className="mt-2 text-xs text-[#7e8797]">
            Zone Start Event: {metrics.startEvent.provenance === "manual" ? "manually confirmed" : "auto-detected"} ·
            frame {metrics.startEvent.frame} · {metrics.startEvent.timestamp?.toFixed(3)} s
            {metrics.startEvent.provenance !== "manual" &&
              ` · ${Math.round(metrics.startEvent.confidence * 100)}% confidence`}
          </p>
        )}
        {metrics.warnings.map((w) => (
          <p key={w} className="mt-2 text-xs text-[#f5c451]">
            {w}
          </p>
        ))}
      </Section>

      {/* 2. Distance splits */}
      <Section title="Distance splits">
        {hasV2 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {metrics.markerSplits!.map((split) => (
              <div key={split.label} className="rounded-xl border border-white/[0.06] bg-[#182233] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">{split.label}</p>
                <p className="mt-1 text-2xl font-bold text-[#f5f7fb]">
                  {fmt(split.elapsedTimeS, 3)} <span className="text-sm text-[#b3bccb]">s</span>
                </p>
                <p className="mt-1 text-[10px] text-[#7e8797]">
                  {split.quality === "unavailable" ? "unavailable" : "interpolated"} · ±
                  {(split.frameEquivalentTimeS / 2).toFixed(3)}s
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(["m10S", "m20S", "m30S"] as const).map((key) => (
              <div key={key} className="rounded-xl border border-white/[0.06] bg-[#182233] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">
                  0–{key.replace("m", "").replace("S", "")}m
                </p>
                <p className="mt-1 text-2xl font-bold text-[#f5f7fb]">
                  {fmt(metrics.splits[key], 3)} <span className="text-sm text-[#b3bccb]">s</span>
                </p>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[10px] text-[#7e8797]">
          Video-derived movement splits, not official reaction-inclusive race splits.
        </p>
      </Section>

      {/* 3. Velocity & acceleration vs distance (Part 1, Part 7) */}
      <Section title="Velocity &amp; acceleration progression">
        {progression && progression.velocityCurve.length >= 2 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <LineChart yLabel="Velocity vs Distance (m/s)" points={progression.velocityCurve.map((p) => ({ x: p.distanceM, y: p.velocityMps }))} highlights={velocityHighlights} />
            </div>
            <div>
              <LineChart
                yLabel="Acceleration vs Distance (m/s²)"
                points={progression.accelerationCurve.filter((p) => p.accelerationMps2 != null).map((p) => ({ x: p.distanceM, y: p.accelerationMps2! }))}
                highlights={accelerationHighlights}
              />
            </div>
          </div>
        ) : hasV2 && metrics.intervalMetrics!.some((m) => m.velocityMps != null) ? (
          <LineChart
            yLabel="Velocity (m/s)"
            points={metrics.intervalMetrics!.filter((m) => m.velocityMps != null).map((m) => ({ x: m.endM, y: m.velocityMps! }))}
          />
        ) : (
          <p className="text-xs text-[#7e8797]">No complete interval velocity was observed.</p>
        )}
        {progression && !progression.smoothness.smooth && (
          <p className="mt-2 text-xs text-[#f5c451]">
            {progression.smoothness.velocityDrops.length > 0 &&
              `Velocity dropped at step${progression.smoothness.velocityDrops.length > 1 ? "s" : ""} ${progression.smoothness.velocityDrops.map((d) => d.stepNumber).join(", ")}. `}
            {progression.smoothness.accelerationSpikes.length > 0 &&
              `Acceleration outlier at step${progression.smoothness.accelerationSpikes.length > 1 ? "s" : ""} ${progression.smoothness.accelerationSpikes.map((s) => s.stepNumber).join(", ")}.`}
          </p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-white/[0.06] bg-[#182233] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">Average velocity</p>
            <p className="mt-1 text-2xl font-bold text-[#f5f7fb]">
              {fmt(metrics.averageVelocityMps)} <span className="text-sm text-[#b3bccb]">m/s</span>
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-[#182233] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">Peak velocity</p>
            <p className="mt-1 text-2xl font-bold text-[#f5f7fb]">
              {fmt(metrics.peakVelocityDetail?.velocityMps ?? metrics.peakVelocity)}{" "}
              <span className="text-sm text-[#b3bccb]">m/s</span>
            </p>
            <p className="mt-1 text-[10px] text-[#7e8797]">
              at {fmt(metrics.peakVelocityDetail?.distanceM, 1)} m
            </p>
          </div>
          {hasV2 &&
            metrics.intervalMetrics!.map((m) => (
              <div key={`${m.startM}-${m.endM}`} className="rounded-xl border border-white/[0.06] bg-[#182233] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">
                  {m.startM}–{m.endM}m accel.
                </p>
                <p className="mt-1 text-2xl font-bold text-[#f5f7fb]">
                  {fmt(m.accelerationMps2)} <span className="text-sm text-[#b3bccb]">m/s²</span>
                </p>
              </div>
            ))}
        </div>
      </Section>

      {/* 4. Step progression (Part 2) */}
      {hasV2 && metrics.steps!.length > 0 && (
        <Section title="Step progression">
          <div className="grid gap-4 sm:grid-cols-2">
            <LineChart
              yLabel="Step Length Progression (m)"
              points={metrics.steps!.map((s) => ({ x: s.stepNumber, y: s.stepLengthM }))}
            />
            <LineChart
              yLabel="Step Frequency Progression (Hz)"
              points={metrics.steps!.map((s) => ({ x: s.stepNumber, y: s.stepFrequencyHz }))}
            />
          </div>
          {progression && (
            <div className="mt-3 rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 text-xs text-[#b3bccb]">
              <p>
                Step length is <strong className="text-[#f5f7fb]">{progression.stepProgression.stepLengthTrend.replace(/_/g, " ")}</strong>; step
                frequency is <strong className="text-[#f5f7fb]">{progression.stepProgression.stepFrequencyTrend.replace(/_/g, " ")}</strong>.
              </p>
              {progression.stepProgression.divergence !== "insufficient_data" && (
                <p className="mt-1">Pattern: {progression.stepProgression.divergence.replace(/_/g, " ")}.</p>
              )}
              {progression.stepProgression.mostEfficientStep && (
                <p className="mt-1">
                  Largest single-step velocity gain: step {progression.stepProgression.mostEfficientStep.stepNumber} (
                  {progression.stepProgression.mostEfficientStep.distanceM.toFixed(1)} m), +
                  {progression.stepProgression.mostEfficientStep.velocityGainMps.toFixed(2)} m/s.
                </p>
              )}
            </div>
          )}
        </Section>
      )}

      {/* 5. Step-by-step table */}
      {hasV2 && metrics.steps!.length > 0 && (
        <Section title="Step-by-step table">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[#7e8797]">
                  <th className="py-1 pr-3">#</th>
                  <th className="py-1 pr-3">Side</th>
                  <th className="py-1 pr-3">Distance (m)</th>
                  <th className="py-1 pr-3">Step length (m)</th>
                  <th className="py-1 pr-3">Step time (s)</th>
                  <th className="py-1 pr-3">Freq (Hz)</th>
                  <th className="py-1 pr-3">Velocity (m/s)</th>
                  <th className="py-1 pr-3">Contact (s)</th>
                  <th className="py-1 pr-3">Quality</th>
                </tr>
              </thead>
              <tbody className="text-[#b3bccb]">
                {metrics.steps!.map((s) => (
                  <tr key={s.stepNumber} className="border-t border-white/[0.05]">
                    <td className="py-1 pr-3">{s.stepNumber}</td>
                    <td className="py-1 pr-3 capitalize">{s.side}</td>
                    <td className="py-1 pr-3">{s.contactDistanceM.toFixed(2)}</td>
                    <td className="py-1 pr-3">{s.stepLengthM.toFixed(2)}</td>
                    <td className="py-1 pr-3">{s.stepTimeS.toFixed(3)}</td>
                    <td className="py-1 pr-3">{s.stepFrequencyHz.toFixed(2)}</td>
                    <td className="py-1 pr-3">{s.intervalVelocityMps.toFixed(2)}</td>
                    <td className="py-1 pr-3">{s.contactTimeS != null ? s.contactTimeS.toFixed(3) : "—"}</td>
                    <td className="py-1 pr-3">{s.dataQuality}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* 6a. Mechanical progression (Phase 3, Part 6-9/15) — trunk, touchdown,
          shin, pelvis by contact. Any chart without enough reliable
          observations is hidden in favor of an honest note (Part 15). */}
      {mechanics && (
        <Section title="Mechanical progression">
          <div className="grid gap-4 sm:grid-cols-2">
            <MechanicalProgressionChart title="Trunk angle by contact (° from vertical)" progression={mechanics.trunkProgression} />
            <MechanicalProgressionChart title="Touchdown position vs. center of mass (normalized)" progression={mechanics.touchdownProgression} />
            <MechanicalProgressionChart title="Shin angle by contact (° from vertical)" progression={mechanics.shinProgression} />
            <MechanicalProgressionChart title="Pelvis height proxy by contact (trend only)" progression={mechanics.pelvisProgression} />
          </div>
          {mechanics.strategyClassification.label !== "insufficient_data" && (
            <div className="mt-3 rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 text-xs text-[#b3bccb]">
              <p>
                Acceleration-strategy pattern:{" "}
                <strong className="text-[#f5f7fb]">{mechanics.strategyClassification.label.replace(/_/g, " ")}</strong>
              </p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {mechanics.strategyClassification.evidence.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-[#7e8797]">
                Descriptive only — reflects the measured pattern in this run, not a diagnosis or a universal ideal.
              </p>
            </div>
          )}
          {mechanics.quality.warnings.map((w) => (
            <p key={w} className="mt-2 text-[10px] text-[#f5c451]">
              {w}
            </p>
          ))}
        </Section>
      )}

      {/* 6. Left/right balance (Part 3) */}
      {hasV2 && metrics.asymmetries && (
        <Section title="Left / right balance">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-white/[0.06] bg-[#182233] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">Left step length</p>
              <p className="mt-1 text-xl font-bold text-[#f5f7fb]">{fmt(metrics.asymmetries.leftStepAverageM)} m</p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-[#182233] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">Right step length</p>
              <p className="mt-1 text-xl font-bold text-[#f5f7fb]">{fmt(metrics.asymmetries.rightStepAverageM)} m</p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-[#182233] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">Asymmetry</p>
              <p className="mt-1 text-xl font-bold text-[#f5f7fb]">
                {fmt(metrics.asymmetries.stepLengthAsymmetryPct, 1)}%{" "}
                {progression && !progression.leftRight.meaningfulStepLengthAsymmetry && (
                  <span className="text-xs font-normal text-[#7e8797]">(not meaningful)</span>
                )}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-[#182233] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">Trend</p>
              <p className="mt-1 text-xl font-bold text-[#f5f7fb] capitalize">
                {metrics.asymmetries.trend.replace(/_/g, " ")}
              </p>
            </div>
          </div>
          {progression && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs text-[#b3bccb]">
              <div>
                <p className="text-[#7e8797]">Left contact time</p>
                <p className="text-[#f5f7fb]">{fmt(progression.leftRight.leftContactTimeS, 3)} s</p>
              </div>
              <div>
                <p className="text-[#7e8797]">Right contact time</p>
                <p className="text-[#f5f7fb]">{fmt(progression.leftRight.rightContactTimeS, 3)} s</p>
              </div>
              <div>
                <p className="text-[#7e8797]">Left velocity contribution</p>
                <p className="text-[#f5f7fb]">{progression.leftRight.leftVelocityContributionMps.toFixed(2)} m/s</p>
              </div>
              <div>
                <p className="text-[#7e8797]">Right velocity contribution</p>
                <p className="text-[#f5f7fb]">{progression.leftRight.rightVelocityContributionMps.toFixed(2)} m/s</p>
              </div>
            </div>
          )}
          {mechanics && mechanics.asymmetries.some((a) => ["touchdownOffset", "trunkAngle", "shinAngle"].includes(a.metric)) && (
            <div className="mt-4 border-t border-white/[0.06] pt-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#7e8797]">Mechanical asymmetry</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 text-xs text-[#b3bccb]">
                {mechanics.asymmetries
                  .filter((a) => ["touchdownOffset", "trunkAngle", "shinAngle"].includes(a.metric))
                  .map((a) => (
                    <div key={a.metric}>
                      <p className="text-[#7e8797] capitalize">{a.metric.replace(/([A-Z])/g, " $1")}</p>
                      <p className="text-[#f5f7fb]">
                        {a.observationCount < 3
                          ? "Not enough reliable observations"
                          : `${fmt(a.absoluteDifference, 2)} diff${!a.persistent ? " (not persistent)" : ""}`}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* 7. Limiting factors */}
      {limiters.length > 0 && (
        <Section title="Limiting factors">
          <div className="space-y-3">
            {limiters.map((l) => (
              <div key={l.id} className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
                <p className="text-sm font-semibold text-[#f5f7fb]">
                  #{l.rank} {l.title}
                </p>
                <p className="mt-1 text-xs text-[#b3bccb]">{l.summary}</p>
                {l.evidence.some((e) => e.kind === "comparison") && (
                  <p className="mt-1 text-[10px] text-[#7e8797]">
                    {l.evidence.find((e) => e.kind === "comparison")?.value}
                  </p>
                )}
                {l.possiblePhysicalAssociations.length > 0 && (
                  <p className="mt-2 text-[10px] text-[#7e8797]">
                    Commonly associated with: {l.possiblePhysicalAssociations.map((a) => a.muscleGroups?.join(", ")).join("; ")} —{" "}
                    {l.possiblePhysicalAssociations[0]?.disclaimer}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 8. Focused recommendations */}
      {recommendations.length > 0 && (
        <Section title="Focused recommendations">
          <div className="grid gap-3 sm:grid-cols-2">
            {recommendations.map((r) => (
              <div key={r.title} className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
                <p className="text-sm font-semibold text-[#f5f7fb]">{r.title}</p>
                <p className="mt-1 text-xs text-[#b3bccb]">{r.why}</p>
                {r.caution && <p className="mt-1 text-[10px] text-[#f5c451]">Caution: {r.caution}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 9. Recording and analysis quality */}
      <Section title="Recording and analysis quality">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs text-[#b3bccb]">
          <div>
            <p className="text-[#7e8797]">FPS</p>
            <p className="text-[#f5f7fb]">
              {metrics.quality?.fps ?? "—"} {metrics.quality && !metrics.quality.fpsAdequate ? "(below 60 fps)" : ""}
            </p>
          </div>
          <div>
            <p className="text-[#7e8797]">Calibrated coverage</p>
            <p className="text-[#f5f7fb]">
              {metrics.quality ? `${metrics.quality.calibratedCoverageMinM}–${metrics.quality.calibratedCoverageMaxM} m` : "—"}
            </p>
          </div>
          <div>
            <p className="text-[#7e8797]">Detected contacts</p>
            <p className="text-[#f5f7fb]">{metrics.quality?.contactCount ?? 0}</p>
          </div>
          <div>
            <p className="text-[#7e8797]">Zone Start Event</p>
            <p className="text-[#f5f7fb] capitalize">{metrics.quality?.startEventProvenance ?? "automatic"}</p>
          </div>
        </div>
        {hasV2 && metrics.stepsStatus !== "ready" && (
          <p className="mt-3 text-xs text-[#f5c451]">{metrics.stepsReason}</p>
        )}
      </Section>
    </AvaPanel>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#182233] p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7e8797]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#f5f7fb]">{value}</p>
    </div>
  );
}
