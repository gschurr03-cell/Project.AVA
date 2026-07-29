import { AvaPanel } from "@/components/ava/AvaPanel";
import { calculateManualTiming, timingSetupSchema, timingTrust } from "@/lib/calibration/timingSetup";

export default function TimingSetupStatusCard({
  setup,
  analysisFps,
}: {
  setup: unknown;
  analysisFps: 30 | 60;
}) {
  const parsed = timingSetupSchema.safeParse(setup);
  if (!parsed.success) return null;
  const trust = timingTrust(parsed.data, analysisFps);
  let manual = null;
  if (parsed.data.setupMode === "manual_crossing" && trust.timingEligible) {
    try {
      manual = calculateManualTiming(parsed.data, 1 / analysisFps);
    } catch {
      manual = null;
    }
  }
  return (
    <AvaPanel eyebrow="Timing setup" title={trust.buttonState}>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-white/10 px-2.5 py-1 text-[#b3bccb]">{parsed.data.setupMode.replaceAll("_", " ")}</span>
        <span className="rounded-full border border-white/10 px-2.5 py-1 text-[#b3bccb]">{trust.compatibilityGroup}</span>
        {parsed.data.setupMode === "manual_crossing" && <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-amber-200">Experimental</span>}
      </div>
      {manual ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">{manual.label}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-[#f5f7fb]">{manual.reportedTimeS.toFixed(2)} s</p>
          <p className="mt-1 text-sm text-[#b3bccb]">
            {manual.reportedVelocityMps.toFixed(2)} m/s · uncertainty ±{manual.uncertaintyS.toFixed(3)} s · {parsed.data.distance.status.replaceAll("_", " ")}
          </p>
          <details className="mt-3 text-xs text-[#8C8E94]"><summary className="cursor-pointer">Advanced evidence</summary>
            <p className="mt-2">Raw time {manual.rawTimeS.toFixed(6)} s · body reference {parsed.data.bodyReference} · setup v{parsed.data.setupVersion}</p>
          </details>
        </div>
      ) : (
        <p className="mt-3 text-sm text-[#b3bccb]">
          {parsed.data.setupMode === "technique_only"
            ? "Mechanics analysis remains available. Zone timing is intentionally disabled."
            : trust.reasonCodes.join(" · ").replaceAll("_", " ")}
        </p>
      )}
    </AvaPanel>
  );
}
