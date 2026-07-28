import { AvaPanel } from "@/components/ava/AvaPanel";
import { AvaStatusPill } from "@/components/ava/AvaStatusPill";
import type { Real30Timing } from "@/lib/analysis/experimental30";

const value = (number: number, digits: number) => number.toFixed(digits);

export default function Experimental30TimingCard({ timing, invalidReason }: { timing: Real30Timing; invalidReason?: string | null }) {
  if (invalidReason) return (
    <AvaPanel eyebrow="Experimental 30 FPS" title="30 m timing withheld">
      <div className="flex flex-wrap gap-2"><AvaStatusPill label="Invalid gate propagation" tone="gold" /></div>
      <p className="mt-4 text-sm leading-6 text-[#f5f7fb]">{invalidReason}</p>
      <p className="mt-2 text-xs text-[#b3bccb]">The immutable failed analysis remains available for engineering audit, but its time and velocity are excluded from history, benchmarks, predictions, and recommendations.</p>
    </AvaPanel>
  );
  return (
    <AvaPanel eyebrow="Experimental 30 FPS" title="30 m Fly">
      <div className="flex flex-wrap gap-2">
        <AvaStatusPill label="Experimental" tone="gold" />
        <AvaStatusPill label="Smooth pan" tone="gray" />
        <AvaStatusPill label="Calibrated 30 m" tone="gray" />
        <AvaStatusPill label="World-gate torso timing" tone="gray" />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[#f5c451]/25 bg-[#f5c451]/[0.07] p-4">
          <p className="text-xs uppercase tracking-wide text-[#b3bccb]">Reported fly time</p>
          <p className="mt-1 text-3xl font-semibold text-[#f5f7fb]">{value(timing.reportedFlyTimeSeconds, 2)} s</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-wide text-[#b3bccb]">Reported average velocity</p>
          <p className="mt-1 text-2xl font-semibold text-[#f5f7fb]">{value(timing.reportedAverageVelocityMps, 3)} m/s</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-wide text-[#b3bccb]">Timing uncertainty</p>
          <p className="mt-1 text-2xl font-semibold text-[#f5f7fb]">±{value(timing.combinedUncertaintySeconds, 3)} s</p>
          <p className="mt-1 text-xs capitalize text-[#b3bccb]">{timing.confidenceLabel} confidence</p>
        </div>
      </div>
      <p className="mt-4 text-xs text-[#b3bccb]">
        Experimental native-30 FPS result. Reported time ceilings conservatively to the next hundredth;
        reported velocity is calculated from that reported time.
      </p>
      <details className="mt-4 rounded-xl border border-white/[0.07] bg-[#081019] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[#f5f7fb]">Advanced timing evidence</summary>
        <div className="mt-4 grid gap-2 text-xs text-[#b3bccb] sm:grid-cols-2">
          <p>Raw time: <span className="text-[#f5f7fb]">{value(timing.rawFlyTimeSeconds, 9)} s</span></p>
          <p>Raw velocity: <span className="text-[#f5f7fb]">{value(timing.rawAverageVelocityMps, 6)} m/s</span></p>
          <p>Start crossing: frames {timing.startCrossing.frameBefore}–{timing.startCrossing.frameAfter}, fraction {value(timing.startCrossing.interpolationFraction, 6)}</p>
          <p>Finish crossing: frames {timing.finishCrossing.frameBefore}–{timing.finishCrossing.frameAfter}, fraction {value(timing.finishCrossing.interpolationFraction, 6)}</p>
          <p>Source / analysis FPS: {value(timing.sourceEvidence.sourceFps, 6)} / {timing.sourceEvidence.analysisFps}</p>
          <p>Zone / anchors: V{timing.zoneVersion} · start V{timing.startAnchorVersion} · finish V{timing.finishAnchorVersion}</p>
          <p>Timing / crossing: {timing.schemaVersion} · {timing.startCrossing.crossingModelVersion}</p>
          <p>Gate propagation: {timing.propagationModelVersion}</p>
          <p>External 2.77 difference: {value(timing.externalReference.absoluteDifferenceSeconds, 6)} s ({value(timing.externalReference.percentageDifference, 2)}%)</p>
          <p>Compatibility: {timing.externalReference.compatibilityStatus.replace("_", " ")}</p>
          <p>Result hash: <span className="font-mono text-[#f5f7fb]">{timing.resultHash}</span></p>
        </div>
        <p className="mt-3 text-xs text-[#7e8797]">{timing.externalReference.caveat}</p>
      </details>
    </AvaPanel>
  );
}
