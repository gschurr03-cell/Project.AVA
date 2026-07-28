import type { AnalysisProvenance, ExplainableAnalysisResult } from "@/lib/analysis/resultContract";
import { AvaPanel } from "@/components/ava/AvaPanel";

export default function AnalysisMethodPanel({
  provenance,
  result,
  legacy,
}: {
  provenance: AnalysisProvenance | null;
  result: ExplainableAnalysisResult | null;
  legacy: boolean;
}) {
  // MVP metric scope is locked to the five primary sprint metrics. Advanced timing
  // derivatives (ground contact / flight time, knee/trunk angles, stiffness, etc.) are
  // not part of the MVP, so they must not surface here as "Unavailable" either.
  const MVP_METRIC_NAME = /velocity|speed|stride|step|length|frequency|cadence/i;
  const unavailable = (result?.measurements ?? []).filter(
    (m) => m.result.status !== "available" && MVP_METRIC_NAME.test(m.name),
  );
  return (
    <AvaPanel title="Analysis method" eyebrow="Provenance">
      {legacy || !provenance ? (
        <p className="text-sm text-[#f5c451]">
          Legacy analysis — complete provenance is unavailable, so direct historical comparison is
          restricted.
        </p>
      ) : (
        <div className="space-y-3 text-sm text-[#b3bccb]">
          <p>
            MediaPipe {provenance.poseModelVersion} · {provenance.experimental ? "Experimental" : "validated"}{" "}
            {provenance.analysisFps} FPS analysis · source {provenance.originalSourceFps.toFixed(2)} FPS
          </p>
          {provenance.experimental && (
            <p className="text-[#f5c451]">
              Stored separately as {provenance.compatibilityGroup}; validated comparisons and
              predictions are disabled.
            </p>
          )}
          <p>
            {provenance.analysisPipelineVersion} · {provenance.metricSchemaVersion} ·{" "}
            {provenance.globalAnalysisConfidence.label ?? "insufficient"} confidence
          </p>
          {unavailable.length > 0 && (
            <ul className="space-y-1">
              {unavailable.map((measurement) => (
                <li key={measurement.metricId}>
                  <span className="text-[#f5f7fb]">{measurement.name}: Unavailable</span>
                  {measurement.result.reasonCode
                    ? ` — ${measurement.result.reasonCode.replaceAll("_", " ")}`
                    : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </AvaPanel>
  );
}
