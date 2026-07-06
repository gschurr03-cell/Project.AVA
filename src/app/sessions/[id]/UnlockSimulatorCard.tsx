import { AvaPanel } from "@/components/ava/AvaPanel";
import type { TrochanterEvaluation } from "@/lib/intelligence/trochanterOptimizer";

/**
 * Trochanter Stride-Length Optimizer + Unlock Simulator (Day 82).
 *
 * Shows PEAK stride length relative to the athlete's body proportions (peak trochanter
 * ratio), the current band, and the next target — then projects top speed under simple
 * "what-if" scenarios using ONLY the trusted values and the sprint identity
 * velocity = stride length × frequency. AVA "stride length" = opposite-foot contact
 * distance. It is a mathematical projection, NOT a performance prediction.
 */

const FREQ_STEPS = [0.05, 0.1, 0.15] as const;

interface ScenarioRow {
  label: string;
  formula: string;
  projected: number;
  gain: number;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#19191C] p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">{label}</p>
      <p className={`mt-1 text-lg font-bold tracking-tight ${accent ? "text-[#E4C25A]" : "text-[#F5F5F7]"}`}>
        {value}
      </p>
    </div>
  );
}

function ScenarioGroup({
  title,
  note,
  rows,
}: {
  title: string;
  note: string;
  rows: ScenarioRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4">
      <p className="text-sm font-semibold text-[#F5F5F7]">{title}</p>
      <p className="mt-0.5 text-xs text-[#6B7280]">{note}</p>
      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <p className="text-sm text-[#F5F5F7]">{r.label}</p>
              <p className="font-mono text-xs text-[#6B7280]">{r.formula}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-[#F5F5F7]">{r.projected.toFixed(2)} m/s</p>
              <p className={`text-xs font-semibold ${r.gain > 0 ? "text-[#E4C25A]" : "text-[#6B7280]"}`}>
                {r.gain > 0 ? "+" : ""}
                {r.gain.toFixed(2)} m/s vs current
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function UnlockSimulatorCard({
  evaluation,
  peakStrideLengthM,
  avgStrideLengthM,
  frequencyHz,
}: {
  evaluation: TrochanterEvaluation;
  peakStrideLengthM: number;
  avgStrideLengthM: number | null;
  frequencyHz: number;
}) {
  const e = evaluation;
  const r = (v: number) => v.toFixed(2);
  // Simulator input is the PEAK stride length (best expressed strides).
  const current = peakStrideLengthM * frequencyHz;
  const olympicMinStride = e.olympicRangeStepLengthM.min;

  const row = (label: string, stride: number, freq: number): ScenarioRow => {
    const projected = stride * freq;
    return {
      label,
      formula: `${r(stride)} m × ${r(freq)} Hz`,
      projected,
      gain: projected - current,
    };
  };

  // A — peak stride → next trochanter target, frequency constant.
  const scenarioA: ScenarioRow[] =
    e.nextTargetStepLengthM != null
      ? [row(`Peak stride → next target (${e.nextTargetRatio?.toFixed(2)}×)`, e.nextTargetStepLengthM, frequencyHz)]
      : [];

  // B — peak stride → Olympic minimum (2.50× trochanter), frequency constant.
  const scenarioB: ScenarioRow[] = [row("Peak stride → Olympic minimum (2.50×)", olympicMinStride, frequencyHz)];

  // C — frequency +0.05 / +0.10 / +0.15 Hz, peak stride constant.
  const scenarioC: ScenarioRow[] = FREQ_STEPS.map((d) =>
    row(`Frequency +${d.toFixed(2)} Hz`, peakStrideLengthM, frequencyHz + d),
  );

  // D — peak stride → next target AND frequency +0.05 / +0.10 Hz.
  const scenarioD: ScenarioRow[] =
    e.nextTargetStepLengthM != null
      ? [0.05, 0.1].map((d) =>
          row(`Peak stride → next target + frequency +${d.toFixed(2)} Hz`, e.nextTargetStepLengthM as number, frequencyHz + d),
        )
      : [];

  return (
    <AvaPanel eyebrow="Trochanter Stride Length Optimizer" title="Unlock Simulator">
      {e.reviewFlag && (
        <div className="-mt-3 mb-4 rounded-lg border border-[#CD7F32]/40 bg-[#CD7F32]/10 p-3 text-xs text-[#E0A063]">
          Peak stride ratio is unusually high ({r(e.ratio)}× of trochanter length) — flag for review;
          this may be a measurement or calibration issue.
        </div>
      )}

      {/* Body-proportion header (peak stride) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Peak stride length" value={`${r(peakStrideLengthM)} m`} accent />
        {avgStrideLengthM != null && (
          <Stat label="Average stride length" value={`${r(avgStrideLengthM)} m`} />
        )}
        <Stat label="Trochanter length" value={`${r(e.trochanterLengthM)} m`} />
        <Stat label="Peak ratio" value={`${r(e.ratio)}×`} accent />
        <Stat label="Current band" value={e.label} />
        <Stat
          label="Next target"
          value={
            e.nextTargetRatio != null && e.nextTargetStepLengthM != null
              ? `${r(e.nextTargetRatio)}× = ${r(e.nextTargetStepLengthM)} m`
              : "At top band"
          }
          accent
        />
        <Stat
          label="Olympic caliber range"
          value={`2.50×–2.70× = ${r(e.olympicRangeStepLengthM.min)}–${r(e.olympicRangeStepLengthM.max)} m`}
        />
      </div>

      {/* Scenarios */}
      <div className="mt-4">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">
            Unlock scenarios · peak stride × frequency
          </p>
          <p className="font-mono text-xs text-[#6B7280]">current {r(current)} m/s</p>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <ScenarioGroup
            title="A · Longer stride"
            note="Reach the next trochanter target, frequency held constant."
            rows={scenarioA}
          />
          <ScenarioGroup
            title="B · Olympic stride length"
            note="Reach the Olympic minimum (2.50×), frequency held constant."
            rows={scenarioB}
          />
          <ScenarioGroup
            title="C · Faster turnover"
            note="Raise frequency, peak stride held constant."
            rows={scenarioC}
          />
          <ScenarioGroup
            title="D · Both together"
            note="Reach the next stride target and raise frequency."
            rows={scenarioD}
          />
        </div>
      </div>

      <p className="mt-4 text-xs leading-5 text-[#6B7280]">
        Mathematical projection only. Uses AVA peak stride length when available. Not a guaranteed
        performance prediction.
      </p>
    </AvaPanel>
  );
}
