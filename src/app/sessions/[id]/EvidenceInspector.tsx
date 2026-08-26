import type { TrustedMetrics } from "@/lib/intelligence/trustedMetrics";
import { explainMetricEvidence, explainZoneCoverage } from "@/lib/intelligence/evidenceExplanations";

/** Feature-gated by the session page's existing developerDiagnostics switch. */
export default function EvidenceInspector({ trusted }: { trusted: TrustedMetrics }) {
  return (
    <details className="rounded-2xl border border-white/[0.08] bg-[#101827] p-5">
      <summary className="cursor-pointer text-sm font-semibold text-[#b3bccb]">Scientific evidence inspector</summary>
      <div className="mt-4 space-y-3">
        {trusted.evidence.map((evidence) => {
          const explanation = explainMetricEvidence(evidence, "developer");
          const provenance = evidence.provenance.scientific;
          return (
            <article key={evidence.metric} className="rounded-xl border border-white/[0.06] bg-[#182233] p-4 text-xs">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold text-[#f5f7fb]">{evidence.label}</h3>
                <span className={evidence.status === "available" ? "text-emerald-300" : "text-amber-300"}>{evidence.status}</span>
              </div>
              <p className="mt-2 text-[#b3bccb]">{explanation.message}</p>
              {explanation.technicalDetail && <p className="mt-1 text-[#7e8797]">{explanation.technicalDetail}</p>}
              <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                <div><dt className="text-[#7e8797]">Dependencies</dt><dd>{explanation.dependencyPath.join(", ") || "None"}</dd></div>
                <div><dt className="text-[#7e8797]">Calculation version</dt><dd>{provenance?.calculationVersion ?? "Legacy artifact"}</dd></div>
                <div><dt className="text-[#7e8797]">Contributing frames</dt><dd>{provenance?.contributingFrames.join(", ") || "Not present in artifact"}</dd></div>
                <div><dt className="text-[#7e8797]">Excluded evidence</dt><dd>{provenance?.excludedEvidence.length ?? 0} item(s)</dd></div>
              </dl>
            </article>
          );
        })}
        {explainZoneCoverage(trusted.zoneCoverage, "developer") && (
          <p className="text-xs text-[#7e8797]">{explainZoneCoverage(trusted.zoneCoverage, "developer")}</p>
        )}
      </div>
    </details>
  );
}
