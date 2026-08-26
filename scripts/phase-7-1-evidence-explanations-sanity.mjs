import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import Module from "node:module";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, ".phase-7-1-explanations-tmp");
const require = createRequire(import.meta.url);
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return originalResolve.call(this, request.startsWith("@/") ? path.join(out, request.slice(2)) : request, ...rest);
};
let count = 0;
let ok = true;
const check = (label, condition) => {
  count += 1; console.log(`${condition ? "PASS" : "FAIL"} ${count}. ${label}`); if (!condition) ok = false;
};

rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
try {
  writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
    compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022",
      strict: true, skipLibCheck: true, esModuleInterop: true, moduleResolution: "node", baseUrl: root,
      paths: { "@/*": ["src/*"] } },
    files: [path.join(root, "src/lib/intelligence/evidenceExplanations.ts")],
  }));
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: "inherit" });
  const x = require(path.join(out, "lib/intelligence/evidenceExplanations.js"));
  const s = require(path.join(out, "lib/intelligence/scientificEvidence.js"));
  const provenance = (reason = null, overrides = {}) => ({ schemaVersion: "scientific-evidence-v1", metricId: "frequencyHz",
    value: reason ? null : 4.8, available: !reason, reason, evidenceClass: reason ? "unsupported" : "derived_verified",
    contributingFrames: [10, 20], contributingTimeRanges: [[100, 200]],
    inputValues: { validContacts: 8, eligibleIntervals: 7, velocityWindows: 2 }, dependencies: ["CONTACT_ACCEPTED"],
    excludedEvidence: [{ frame: 30, reason: "coverage_insufficient" }], calculationVersion: "scientific-evidence-v1",
    atoms: [], legacyProvenanceIncomplete: false, ...overrides });
  const evidence = (metric, status = "available", reason = null, value = 1) => ({ metric, label: metric, status,
    value: status === "available" ? value : null, unit: "", reasonCode: reason, confidenceCategory: null,
    provenance: { sourceWindows: null, contactCount: 8, verifiedStrideCount: 7, calibrationSource: null,
      timingSource: null, requiredCrossings: null, crossingsVerified: null, evidenceQuality: null,
      scientific: provenance(reason, { metricId: metric, value: status === "available" ? value : null, available: status === "available" }) } });

  const policies = Object.values(x.EVIDENCE_REASON_POLICIES);
  check("every canonical reason has athlete wording", s.CANONICAL_EVIDENCE_REASONS.length === policies.length && policies.every((p) => p.athlete));
  check("every canonical reason has coach wording", policies.every((p) => p.coach));
  check("every canonical reason has developer description", policies.every((p) => p.developer));
  const unknown = evidence("zoneTimeS", "unavailable", "future_reason"); unknown.provenance.scientific = undefined;
  check("unsupported reason falls back safely", /timing was unavailable/.test(x.explainMetricEvidence(unknown, "athlete").message));
  check("finish crossing reason maps correctly", /finish crossing/.test(x.explainMetricEvidence(evidence("zoneTimeS", "unavailable", "finish_crossing_unavailable"), "athlete").message));
  check("Average Velocity inherits Zone Time dependency", /Zone Time/.test(x.explainMetricEvidence(evidence("avgVelocityMps", "unavailable", "finish_crossing_unavailable"), "athlete").message));
  const duplicateRoot = x.consolidateRootCauses([evidence("zoneTimeS", "unavailable", "finish_crossing_unavailable"), evidence("avgVelocityMps", "unavailable", "finish_crossing_unavailable")], "athlete");
  check("root cause is not duplicated", duplicateRoot.length === 1 && duplicateRoot[0].affectedMetrics.length === 2);
  check("insufficient contacts maps correctly", /ground contacts/.test(x.explainMetricEvidence(evidence("frequencyHz", "unavailable", "insufficient_contact_evidence"), "athlete").message));
  check("localization uncertainty maps neutrally", /could not verify the athlete/.test(x.explainMetricEvidence(evidence("frequencyHz", "unavailable", "athlete_tracking_unreliable"), "athlete").message));
  check("pose unavailable maps correctly", /Body-position evidence/.test(x.explainMetricEvidence(evidence("frequencyHz", "unavailable", "pose_unavailable"), "athlete").message));
  check("FPS issue maps correctly", /frame rate/.test(x.explainMetricEvidence(evidence("groundContactTimeMs", "unavailable", "fps_temporal_resolution_insufficient"), "athlete").message));
  check("calibration issue maps correctly", /not been calibrated/.test(x.explainMetricEvidence(evidence("avgStrideLengthM", "unavailable", "not_calibrated"), "athlete").message));
  check("guidance only appears when supported", x.explainMetricEvidence(evidence("frequencyHz", "unavailable", "identity_uncertain"), "athlete").guidance.length === 0);
  const consumerFiles = ["src/app/sessions/[id]/PerformanceSummaryCard.tsx", "src/lib/intelligence/evidenceExplanations.ts"].map((f) => readFileSync(path.join(root, f), "utf8")).join("\n");
  check("no consumer confidence percentages", !/confidence[^\n]{0,30}%/i.test(consumerFiles));
  check("available Step Frequency cites contacts", /8 verified ground contacts/.test(x.explainMetricEvidence(evidence("frequencyHz"), "coach").message));
  check("available Step Length cites intervals", /7 eligible step intervals/.test(x.explainMetricEvidence(evidence("avgStrideLengthM"), "coach").message));
  const coverage = { measuredZoneFraction: .6, missingEarlyZoneReason: "missing", missingLateZoneReason: null, firstMeasuredPositionM: 8, lastMeasuredPositionM: 20 };
  check("partial coverage language accurate", /middle and finish portions/.test(x.explainZoneCoverage(coverage, "athlete")) && !/%/.test(x.explainZoneCoverage(coverage, "athlete")));
  check("session summary derives from Phase 7.0 state", x.buildSessionEvidenceSummary([evidence("zoneTimeS")], "athlete").state === "timing_only");
  check("legacy reason maps through canonical reason", x.explainMetricEvidence(evidence("frequencyHz", "unavailable", "insufficient_step_evidence"), "athlete").reasonCode === "insufficient_step_intervals");
  const dev = x.explainMetricEvidence(evidence("frequencyHz"), "developer");
  check("developer detail contains provenance", dev.sourceEvidence?.contributingFrames[0] === 10 && dev.technicalDetail != null);
  const athlete = x.explainMetricEvidence(evidence("frequencyHz"), "athlete");
  check("athlete detail does not expose raw provenance", athlete.sourceEvidence === null && athlete.dependencyPath.length === 0 && athlete.technicalDetail === null);
  const originalValue = evidence("frequencyHz", "available", null, 4.848484848484849);
  x.explainMetricEvidence(originalValue, "athlete");
  check("metric values remain unchanged", originalValue.value === 4.848484848484849);
  x.buildSessionEvidenceSummary([originalValue], "coach");
  check("scientific evidence eligibility unchanged", originalValue.status === "available");
  const benchmarkValues = [4.848484848484849, 3.103448275862069, 3.6206896551724137, 4.385953327434329];
  const payloads = benchmarkValues.map((value) => x.buildSessionEvidenceSummary([evidence("frequencyHz", "available", null, value)], "coach"));
  check("four benchmark explanation payloads deterministic", JSON.stringify(payloads) === JSON.stringify(benchmarkValues.map((value) => x.buildSessionEvidenceSummary([evidence("frequencyHz", "available", null, value)], "coach"))));
  console.log(`\n${count}/24 passed`);
} finally { rmSync(out, { recursive: true, force: true }); }
process.exit(ok && count === 24 ? 0 : 1);
