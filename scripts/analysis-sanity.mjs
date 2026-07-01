// Runtime sanity for the combined sprint analysis.
//
//   node scripts/analysis-sanity.mjs
//
// Compiles the analysis module (which pulls events/strides/angles) to a
// throwaway dir, asserts the full pipeline on a synthetic running sequence,
// checks that sparse data degrades to partial metrics + warnings (never throws),
// and prints a full summary from the real artifact if present.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".analysis-sanity-tmp");
const artifact = path.join(root, "artifacts/pose-sequences/test.pose.json");

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

// Synthetic sprint: antiphase foot oscillation (→ alternating contacts) with a
// full set of confident joints on every frame (→ angles on every frame).
function synth({ frames = 90, fps = 30, cadence = 1.5, footAmp = 0.08, footBase = 0.85, score = 0.9 } = {}) {
  const kp = (x, y) => ({ x, y, score, visibility: score });
  const f = [];
  for (let i = 0; i < frames; i++) {
    const t = i / fps;
    const lFoot = footBase + footAmp * Math.sin(2 * Math.PI * cadence * t);
    const rFoot = footBase + footAmp * Math.sin(2 * Math.PI * cadence * t + Math.PI);
    const lKnee = 0.68 + footAmp * 0.4 * Math.sin(2 * Math.PI * cadence * t);
    const rKnee = 0.68 + footAmp * 0.4 * Math.sin(2 * Math.PI * cadence * t + Math.PI);
    f.push({
      index: i,
      tMs: (i / fps) * 1000,
      keypoints: {
        nose: kp(0.5, 0.1),
        left_shoulder: kp(0.45, 0.3),
        right_shoulder: kp(0.55, 0.3),
        left_hip: kp(0.46, 0.5),
        right_hip: kp(0.54, 0.5),
        left_knee: kp(0.46, lKnee),
        right_knee: kp(0.54, rKnee),
        left_ankle: kp(0.46, lFoot - 0.03),
        right_ankle: kp(0.54, rFoot - 0.03),
        left_heel: kp(0.45, lFoot - 0.01),
        right_heel: kp(0.55, rFoot - 0.01),
        left_toe: kp(0.48, lFoot),
        right_toe: kp(0.58, rFoot),
      },
    });
  }
  return { backend: "synthetic", modelVersion: "synthetic", coordSpace: "normalized", fps, width: 1920, height: 1080, frames: f };
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  execFileSync(
    "npx",
    // --strict so zod infers required keypoint types (angles module needs it).
    ["tsc", "src/lib/biomechanics/analysis/index.ts", "--outDir", out, "--module", "commonjs", "--target", "es2022", "--skipLibCheck", "--esModuleInterop", "--strict"],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );
  const { analyzeSprint } = require(path.join(out, "analysis/index.js"));

  // (1) Synthetic → events, steps, strides, angles, and metrics.
  const r = analyzeSprint(synth());
  const m = r.metrics;
  check(`arrays populated (events=${r.events.length}, steps=${r.steps.length}, strides=${r.strides.length}, angles=${r.angles.length})`,
    r.events.length > 0 && r.steps.length > 0 && r.strides.length > 0 && r.angles.length > 0);
  check(`counts match (eventCount=${m.eventCount}, stepCount=${m.stepCount}, strideCount=${m.strideCount}, analyzedFrames=${m.analyzedFrames})`,
    m.eventCount === r.events.length && m.stepCount === r.steps.length && m.strideCount === r.strides.length && m.analyzedFrames === r.angles.length);
  check(`core metrics present (stepT=${m.avgStepTimeMs}ms, gc=${m.avgGroundContactMs}ms, flight=${m.avgFlightTimeMs}ms, stepHz=${m.stepFrequencyHz}, strideHz=${m.strideFrequencyHz})`,
    [m.avgStepTimeMs, m.avgStrideTimeMs, m.avgGroundContactMs, m.avgFlightTimeMs, m.stepFrequencyHz, m.strideFrequencyHz].every((v) => typeof v === "number"));
  check(`knee flexion + trunk lean present (peakL=${m.peakLeftKneeFlexionDeg}, peakR=${m.peakRightKneeFlexionDeg}, trunk=${m.avgTrunkLeanDeg})`,
    typeof m.peakLeftKneeFlexionDeg === "number" && typeof m.peakRightKneeFlexionDeg === "number" && typeof m.avgTrunkLeanDeg === "number");
  check(`stepFrequencyHz consistent with avgStepTimeMs`, Math.abs(m.stepFrequencyHz - 1000 / m.avgStepTimeMs) < 0.01);
  check(`result is typed (source, warnings array)`, r.source === "pose_sequence" && Array.isArray(r.warnings));

  // includeRawArrays: false → arrays empty, metrics still present.
  const noRaw = analyzeSprint(synth(), { includeRawArrays: false });
  check(`includeRawArrays:false → empty arrays, metrics kept`,
    noRaw.events.length === 0 && noRaw.steps.length === 0 && noRaw.metrics.eventCount > 0 && typeof noRaw.metrics.avgStepTimeMs === "number");

  // (2) Sparse data → partial metrics + warnings, no throw.
  const sparse = analyzeSprint(synth({ score: 0.2 })); // all keypoints below threshold
  check(`sparse (low confidence) → no throw, zero counts`, sparse.metrics.eventCount === 0 && sparse.metrics.analyzedFrames === 0);
  check(`sparse → warnings present (${sparse.warnings.length})`, sparse.warnings.length > 0 && sparse.warnings.some((w) => /partial|No /.test(w)));
  const empty = analyzeSprint({ backend: "x", modelVersion: "x", coordSpace: "normalized", fps: 30, width: 1, height: 1, frames: [] });
  check(`empty sequence → warnings, no throw`, empty.warnings.length > 0 && empty.metrics.eventCount === 0);

  // (3) Real artifact summary.
  if (existsSync(artifact)) {
    const seq = JSON.parse(readFileSync(artifact, "utf8"));
    const res = analyzeSprint(seq);
    const x = res.metrics;
    console.log("real artifact analysis:");
    console.log(`  analyzedFrames   ${x.analyzedFrames}`);
    console.log(`  eventCount       ${x.eventCount}`);
    console.log(`  stepCount        ${x.stepCount}`);
    console.log(`  strideCount      ${x.strideCount}`);
    console.log(`  avgStepTimeMs    ${x.avgStepTimeMs ?? "n/a"}`);
    console.log(`  avgGroundContactMs ${x.avgGroundContactMs ?? "n/a"}`);
    console.log(`  avgFlightTimeMs  ${x.avgFlightTimeMs ?? "n/a"}`);
    console.log(`  stepFrequencyHz  ${x.stepFrequencyHz ?? "n/a"}`);
    console.log(`  strideFrequencyHz ${x.strideFrequencyHz ?? "n/a"}`);
    console.log(`  peakKneeFlexion  L=${x.peakLeftKneeFlexionDeg ?? "n/a"} R=${x.peakRightKneeFlexionDeg ?? "n/a"}`);
    console.log(`  avgTrunkLeanDeg  ${x.avgTrunkLeanDeg ?? "n/a"}`);
    console.log(`  warnings         ${res.warnings.length ? res.warnings.join(" | ") : "(none)"}`);
    check(`real artifact analysis returned a typed result`, res.source === "pose_sequence");
  } else {
    console.log("real artifact: (not present — skipping optional summary)");
  }

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
