// Runtime sanity for the analysis-worker metric mapping.
//
//   node scripts/worker-analysis-sanity.mjs
//
// Validates toAnalysisMetrics() without needing Python/MediaPipe: partial and
// empty analysis results must map to a schema-valid AnalysisMetrics payload,
// warnings must be preserved, and it must never throw. Runs the real pipeline
// on the artifact if present.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".worker-analysis-sanity-tmp");
const artifact = path.join(root, "artifacts/pose-sequences/test.pose.json");

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

const result = (metrics, warnings = []) => ({
  metrics: { analyzedFrames: 0, eventCount: 0, stepCount: 0, strideCount: 0, ...metrics },
  events: [],
  steps: [],
  strides: [],
  angles: [],
  warnings,
  source: "pose_sequence",
});

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  execFileSync(
    "npx",
    ["tsc", "src/lib/biomechanics/worker/index.ts", "src/lib/biomechanics/analysis/index.ts", "--outDir", out, "--module", "commonjs", "--target", "es2022", "--skipLibCheck", "--esModuleInterop", "--strict"],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );
  const { toAnalysisMetrics, CALIBRATION_WARNING } = require(path.join(out, "worker/index.js"));
  const { analysisMetricsSchema } = require(path.join(out, "types.js"));
  const { analyzeSprint } = require(path.join(out, "analysis/index.js"));

  const valid = (m) => analysisMetricsSchema.safeParse(m).success;

  // (1) Partial metrics → valid payload, real values preserved, placeholders 0.
  const partial = toAnalysisMetrics(result({ strideFrequencyHz: 2.5, avgGroundContactMs: 120, avgTrunkLeanDeg: 5.2 }));
  check(`partial → schema-valid AnalysisMetrics`, valid(partial.metrics));
  check(`partial preserves real values (strideHz=${partial.metrics.strideFrequencyHz}, gc=${partial.metrics.groundContactTimeMs}, trunk=${partial.metrics.avgTrunkLeanDeg})`,
    partial.metrics.strideFrequencyHz === 2.5 && partial.metrics.groundContactTimeMs === 120 && partial.metrics.avgTrunkLeanDeg === 5.2);
  check(`partial → uncomputed fields degrade to 0 (flight=${partial.metrics.flightTimeMs}, speed=${partial.metrics.topSpeedMps}, strideLen=${partial.metrics.avgStrideLengthM})`,
    partial.metrics.flightTimeMs === 0 && partial.metrics.topSpeedMps === 0 && partial.metrics.avgStrideLengthM === 0);

  // (2) Warnings preserved (analysis warnings + calibration warning).
  const warned = toAnalysisMetrics(result({}, ["Metrics are partial; some values could not be computed."]));
  check(`warnings preserved (${warned.warnings.length}: includes analysis + calibration)`,
    warned.warnings.includes("Metrics are partial; some values could not be computed.") && warned.warnings.includes(CALIBRATION_WARNING));

  // (3) No throw on empty/sparse result.
  let threw = false;
  let empty;
  try { empty = toAnalysisMetrics(result({})); } catch { threw = true; }
  check(`empty result → no throw, all-zero valid metrics`, !threw && valid(empty.metrics) && empty.metrics.strideFrequencyHz === 0);

  // (4) peakKneeFlexionDeg = flexion (180 − deepest interior angle).
  const bothKnees = toAnalysisMetrics(result({ peakLeftKneeFlexionDeg: 30, peakRightKneeFlexionDeg: 20 }));
  const oneKnee = toAnalysisMetrics(result({ peakLeftKneeFlexionDeg: 42 }));
  check(`peakKneeFlexionDeg = 180 − min interior: min(30,20)=20 → 160; single-leg 42 → 138`,
    bothKnees.metrics.peakKneeFlexionDeg === 160 && oneKnee.metrics.peakKneeFlexionDeg === 138);

  // (5) Real artifact end-to-end (optional).
  if (existsSync(artifact)) {
    const seq = JSON.parse(readFileSync(artifact, "utf8"));
    const mapped = toAnalysisMetrics(analyzeSprint(seq));
    console.log(
      `real artifact → mapped metrics valid=${valid(mapped.metrics)}: ` +
        `strideHz=${mapped.metrics.strideFrequencyHz}, gc=${mapped.metrics.groundContactTimeMs}ms, ` +
        `flight=${mapped.metrics.flightTimeMs}ms, peakKnee=${mapped.metrics.peakKneeFlexionDeg}°, ` +
        `trunk=${mapped.metrics.avgTrunkLeanDeg}° | warnings=${mapped.warnings.length}`,
    );
    check(`real artifact → schema-valid mapped metrics`, valid(mapped.metrics));
  } else {
    console.log("real artifact: (not present — skipping optional check)");
  }

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
