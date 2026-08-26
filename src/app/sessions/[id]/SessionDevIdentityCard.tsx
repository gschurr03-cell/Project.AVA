import registry from "@/../validation/stationary-validation-registry.json";

/**
 * Phase 0 (Stationary Sprint Analysis Roadmap v4.0) — developer-only
 * identification card, added specifically so no future screenshot, report,
 * or prompt has to guess which real session/analysis/FPS it came from (see
 * docs/phase-0-validation-registry-report.md).
 *
 * Deliberately NOT part of `VideoOverlay.tsx`/the debug HUD: Phase 0 was
 * explicitly forbidden from modifying overlays, so this renders as its own
 * small, separate, server-rendered card on the session page instead. It
 * reads only already-fetched fields and the static validation registry —
 * no new query, no client state, no algorithm/analysis behavior change.
 *
 * Dev-only: renders nothing outside development (mirrors the existing
 * `process.env.NODE_ENV !== "production"` convention already used for
 * debug-only output elsewhere in this codebase, e.g. VideoOverlay.tsx's
 * `[world-lock-runtime]` logging).
 */
export default function SessionDevIdentityCard({
  sessionId,
  sourceFilename,
  verifiedSourceFps,
  isReferenceBenchmark,
  analysisId,
  analysisStatus,
  pipelineVersion,
  poseBackendVersion,
}: {
  sessionId: string;
  sourceFilename: string | null;
  verifiedSourceFps: number | null;
  isReferenceBenchmark: boolean;
  analysisId: string | null;
  analysisStatus: string | null;
  pipelineVersion: string | null;
  poseBackendVersion: string | null;
}) {
  if (process.env.NODE_ENV === "production") return null;

  const benchmarkKey =
    (registry as { benchmarks?: Array<{ benchmarkKey: string; sessionId: string }> }).benchmarks?.find(
      (b) => b.sessionId === sessionId,
    )?.benchmarkKey ?? null;

  const rows: Array<[string, string]> = [
    ["session", sessionId],
    ["analysis", analysisId ?? "—"],
    ["source fps (verified)", verifiedSourceFps != null ? verifiedSourceFps.toFixed(3) : "—"],
    ["source filename", sourceFilename ?? "—"],
    ["benchmark key", benchmarkKey ?? "(not registered)"],
    ["protected", isReferenceBenchmark ? "yes" : "no"],
    ["pipeline version", pipelineVersion ?? "—"],
    ["pose backend", poseBackendVersion ?? "—"],
    ["analysis status", analysisStatus ?? "—"],
  ];

  return (
    <div
      data-testid="session-dev-identity-card"
      className="mt-3 rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[10px] leading-relaxed text-[#7e8797]"
    >
      <p className="mb-1 font-semibold text-[#b3bccb]">dev identity (Phase 0)</p>
      {rows.map(([label, value]) => (
        <div key={label} className="flex gap-2">
          <span className="w-36 shrink-0 text-[#55617a]">{label}</span>
          <span className="break-all">{value}</span>
        </div>
      ))}
    </div>
  );
}
