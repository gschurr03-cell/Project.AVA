import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import Module from "node:module";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".progress-center-sanity-tmp");
const require = createRequire(import.meta.url);
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return originalResolve.call(this, request.startsWith("@/") ? path.join(out, request.slice(2)) : request, ...rest);
};
let ok = true;
const check = (label, condition) => { console.log(`${condition ? "PASS" : "FAIL"}  ${label}`); if (!condition) ok = false; };
const metrics = (top, stride, frequency, contact = 110, flight = 120) => ({
  timingPolicyVersion: "CONSERVATIVE_TIMING_POLICY_V1",
  rawTimingMetrics: { groundContactTimeMs: contact, flightTimeMs: flight },
  reportedTimingMetrics: { groundContactTimeMs: contact, flightTimeMs: flight },
  topSpeedMps: top, avgStrideLengthM: stride, strideFrequencyHz: frequency,
  groundContactTimeMs: contact, flightTimeMs: flight, peakKneeFlexionDeg: 55, avgTrunkLeanDeg: 8,
});
const row = (id, sessionId, date, values, extra = {}) => ({
  id, sessionId, sessionName: `Session ${sessionId}`, sessionCreatedAt: date,
  analysisCreatedAt: date, completedAt: date, status: "complete", metrics: values,
  analysisFps: 120, sourceFps: 120, calibrationPresent: true, analysisType: "fly",
  isCurrentWorking: true, ...extra,
});

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  const config = path.join(out, "tsconfig.json");
  writeFileSync(config, JSON.stringify({ compilerOptions: {
    outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022",
    strict: true, skipLibCheck: true, esModuleInterop: true, moduleResolution: "node",
    baseUrl: root, paths: { "@/*": ["src/*"] },
  }, files: [path.join(root, "src/lib/progressCenter/engine.ts")] }));
  execFileSync("npx", ["tsc", "-p", config], { cwd: root, stdio: "inherit" });
  const { buildProgressCenter, compareProgressPoints } = require(path.join(out, "lib/progressCenter/engine.js"));
  const input = [
    row("a1", "s1", "2026-01-10T00:00:00Z", metrics(10, 2.1, 4.3)),
    row("a2-old", "s2", "2026-02-10T00:00:00Z", metrics(10.2, 2.15, 4.35), { isCurrentWorking: false }),
    row("a2", "s2", "2026-02-11T00:00:00Z", metrics(10.4, 2.2, 4.4), { isCurrentWorking: true }),
    row("a3", "s3", "2026-03-10T00:00:00Z", metrics(10.6, 2.3, 4.55, 100)),
  ];
  const first = buildProgressCenter(input, new Date("2026-07-01T00:00:00Z"));
  const repeated = buildProgressCenter(input, new Date("2026-07-01T00:00:00Z"));
  check("one canonical analysis per session", first.points.length === 3 && first.points.some((p) => p.analysisId === "a2") && !first.points.some((p) => p.analysisId === "a2-old"));
  check("historical values exactly equal stored analysis values", first.points[0].metrics.peakVelocity.value === 10 && first.points[2].metrics.groundContact.value === 100);
  check("stored and derived provenance are distinguished", first.points.every((p) => p.metrics.peakVelocity.source === "stored" && p.metrics.confidence.source === "derived"));
  check("trend direction respects metric semantics", first.trends.find((t) => t.key === "peakVelocity").direction === "improving" && first.trends.find((t) => t.key === "groundContact").direction === "improving");
  check("PB is original point with best stored value", first.trends.find((t) => t.key === "peakVelocity").personalBest.analysisId === "a3");
  check("insights cite measured session count and percent", first.insights.some((text) => /3 measured sessions/.test(text) && /%/.test(text)));
  check("limiter evolution uses High/Medium/Resolved states", first.limiterEvolution.every((item) => item.points.every((p) => ["High", "Medium", "Resolved"].includes(p.status))));
  const comparison = compareProgressPoints(first.points[0], first.points[2]);
  check("comparison is deterministic and direction-aware", comparison.metrics.find((m) => m.key === "peakVelocity").direction === "improved" && comparison.metrics.find((m) => m.key === "groundContact").direction === "improved");
  check("identical input produces identical report", JSON.stringify(first) === JSON.stringify(repeated));
  check("no historical point duplicates a session", new Set(first.points.map((p) => p.sessionId)).size === first.points.length);
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);

