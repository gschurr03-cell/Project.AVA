import { AvaPanel } from "@/components/ava/AvaPanel";
import type { AccelerationMetrics } from "@/lib/acceleration/metrics";

const value = (number: number | null, digits = 2) =>
  number == null ? "—" : number.toFixed(digits);

export default function AccelerationMetricsPanel({ metrics }: { metrics: AccelerationMetrics }) {
  const stats = [
    ["Finish distance", value(metrics.finishDistanceM, 0), "m"],
    ["Finish crossing", value(metrics.finishCrossingTime, 3), "s clip time"],
    ["Run time", value(metrics.runTime, 3), "s"],
    ["0–10m", value(metrics.splits.m10S), "s"],
    ["0–20m", value(metrics.splits.m20S), "s"],
    ["0–30m", value(metrics.splits.m30S), "s"],
    ["Average velocity", value(metrics.averageVelocityMps), "m/s"],
    ["Early acceleration", value(metrics.earlyAccelerationMps2), "m/s²"],
    ["Peak velocity", value(metrics.peakVelocity), "m/s"],
    ["Distance to peak", value(metrics.distanceToPeakVelocity, 1), "m"],
  ];
  return (
    <AvaPanel eyebrow="Acceleration Analysis" title="Acceleration Profile">
      <p className="mb-4 text-sm text-[#A0A2A8]">
        Set the finish gate distance. AVA detects the start instant automatically.
      </p>
      {metrics.status === "needs_review" && (
        <div className="mb-4 rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/10 p-3 text-sm text-[#E4C25A]">
          Needs review — hand leave from the ground could not be confidently detected. No
          start-based acceleration metrics were generated.
        </div>
      )}
      {metrics.startEvent.type === "FIRST_DETECTED_MOVEMENT" && (
        <p className="mb-4 text-xs text-[#A0A2A8]">
          Start event: First detected movement · frame {metrics.startEvent.frame} ·{" "}
          {metrics.startEvent.timestamp?.toFixed(3)} s ·{" "}
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
      {metrics.segmentVelocities.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {metrics.segmentVelocities.map((segment) => (
            <span
              key={segment.endM}
              className="rounded-full border border-white/[0.08] px-3 py-1 text-xs text-[#A0A2A8]"
            >
              {segment.startM}–{segment.endM}m: {segment.velocityMps.toFixed(2)} m/s
            </span>
          ))}
        </div>
      )}
      <div className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 text-sm text-[#A0A2A8]">
        <span className="font-semibold text-[#F5F5F7]">Stride data:</span>{" "}
        {metrics.strideMetrics.status === "ready"
          ? `${metrics.strideMetrics.strideCount} strides · ${value(metrics.strideMetrics.averageStrideLengthM)} m average`
          : `${metrics.strideMetrics.status.replace("_", " ")} — ${metrics.strideMetrics.reason}`}
      </div>
      <p className="mt-4 text-sm text-[#A0A2A8]">{metrics.summary}</p>
      <details className="mt-4 rounded-lg border border-white/[0.08] bg-black/20 p-3 text-xs text-[#A0A2A8]">
        <summary className="cursor-pointer font-semibold text-[#6B7280]">
          Temporary acceleration debug
        </summary>
        <pre className="mt-2 whitespace-pre-wrap font-mono">
          {JSON.stringify(
            {
              resultType: metrics.resultType,
              status: metrics.status,
              startEvent: metrics.startEvent,
              splitCount: Object.values(metrics.splits).filter((item) => item != null).length,
              finishDistanceM: metrics.finishDistanceM,
              finishCrossingTime: metrics.finishCrossingTime,
              runTime: metrics.runTime,
              missingReason: metrics.status.startsWith("ready")
                ? null
                : metrics.warnings.join(" | "),
            },
            null,
            2,
          )}
        </pre>
      </details>
      {metrics.warnings.map((warning) => (
        <p key={warning} className="mt-2 text-xs text-[#E4C25A]">
          {warning}
        </p>
      ))}
    </AvaPanel>
  );
}
