import { AvaPanel } from "@/components/ava/AvaPanel";
import type { AccelerationMetrics } from "@/lib/acceleration/metrics";

const value = (number: number | null, digits = 2) =>
  number == null ? "—" : number.toFixed(digits);

export default function AccelerationMetricsPanel({ metrics }: { metrics: AccelerationMetrics }) {
  const stats = [
    ["0–10m", value(metrics.split10mS), "s"],
    ["0–20m", value(metrics.split20mS), "s"],
    ["0–30m", value(metrics.split30mS), "s"],
    ["Average velocity", value(metrics.averageVelocityMps), "m/s"],
    ["Early acceleration", value(metrics.earlyAccelerationMps2), "m/s²"],
    ["Peak velocity", value(metrics.peakVelocityMps), "m/s"],
    ["Distance to peak", value(metrics.distanceToPeakVelocityM, 1), "m"],
  ];
  return (
    <AvaPanel eyebrow="Acceleration Analysis" title="Acceleration Profile">
      {metrics.status === "needs_review" && (
        <div className="mb-4 rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/10 p-3 text-sm text-[#E4C25A]">
          Needs review — hand leave from the ground could not be confidently detected. No
          start-based acceleration metrics were generated.
        </div>
      )}
      {metrics.startEvent.status === "detected" && (
        <p className="mb-4 text-xs text-[#A0A2A8]">
          t=0: hand leaves ground · frame {metrics.startEvent.frame} ·{" "}
          {metrics.startEvent.timeS?.toFixed(3)} s ·{" "}
          {Math.round(metrics.startEvent.confidence * 100)}% confidence
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([label, metric, unit]) => (
          <div key={label} className="rounded-xl border border-white/[0.06] bg-[#19191C] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6B7280]">
              {label}
            </p>
            <p className="mt-1 text-2xl font-bold text-[#F5F5F7]">
              {metric} <span className="text-sm text-[#A0A2A8]">{unit}</span>
            </p>
          </div>
        ))}
      </div>
      {metrics.segments.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {metrics.segments.map((segment) => (
            <span
              key={segment.endM}
              className="rounded-full border border-white/[0.08] px-3 py-1 text-xs text-[#A0A2A8]"
            >
              {segment.startM}–{segment.endM}m: {segment.averageVelocityMps.toFixed(2)} m/s
            </span>
          ))}
        </div>
      )}
      <p className="mt-4 text-sm text-[#A0A2A8]">{metrics.summary}</p>
      {metrics.warnings.map((warning) => (
        <p key={warning} className="mt-2 text-xs text-[#E4C25A]">
          {warning}
        </p>
      ))}
    </AvaPanel>
  );
}
