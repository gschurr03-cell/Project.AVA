// Runtime sanity for the calibration engine.
//
//   node scripts/calibration-sanity.mjs
//
// Compiles the calibration module (which pulls the overlay + step helpers) to a
// throwaway dir and asserts: scale resolution priority (manual > legLength >
// knownDistance), the metres-per-pixel maths against a known synthetic scale,
// the confidence ladder, the "needs calibration" path, and that outputs are
// deterministic and never fabricated when data is missing.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".calibration-sanity-tmp");

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  const mapped = request.startsWith("@/") ? path.join(out, request.slice(2)) : request;
  return originalResolve.call(this, mapped, ...rest);
};

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};
const approx = (a, b, tol = 0.02) => a != null && Math.abs(a - b) <= tol;

// Frame is 1000x500 px. We place the athlete at a KNOWN real scale of
// 0.01 m/px (so leg pixels × 0.01 = leg metres). Leg length 0.9 m → 90 px.
// COM advances 4 px/frame → at 30 fps and 0.01 m/px that's 1.2 m/s.
const W = 1000;
const H = 500;
const MPP = 0.01; // ground-truth metres per pixel

function synthFrames({ frames = 60, fps = 30, legPx = 90, comStartX = 100, comStepPx = 4 } = {}) {
  const nx = (px) => px / W;
  const ny = (px) => px / H;
  const kp = (px, py) => ({ x: nx(px), y: ny(py), visibility: 0.9 });
  const out = [];
  for (let i = 0; i < frames; i++) {
    const t = i / fps;
    const comXpx = comStartX + comStepPx * i;
    const hipY = 200;
    const ankleY = hipY + legPx; // straight leg, exactly `legPx` tall (fixed)
    // Heel/toe oscillate so the step detector finds contacts; the ANKLE (used
    // for leg length) stays fixed so the recovered scale is exactly `legPx`.
    const bob = 12 * Math.sin(2 * Math.PI * 2 * t);
    out.push({
      frame: i,
      time: t,
      landmarks: {
        leftHip: kp(comXpx - 15, hipY),
        rightHip: kp(comXpx + 15, hipY),
        leftAnkle: kp(comXpx - 15, ankleY),
        rightAnkle: kp(comXpx + 15, ankleY),
        leftHeel: kp(comXpx - 16, ankleY + bob),
        rightHeel: kp(comXpx + 16, ankleY - bob),
        leftFootIndex: kp(comXpx - 12, ankleY + bob),
        rightFootIndex: kp(comXpx + 18, ankleY - bob),
      },
      angles: {},
      centerOfMass: { x: nx(comXpx), y: ny(hipY) },
      velocity: null,
      footContact: { left: false, right: false },
    });
  }
  return out;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  const tsconfigPath = path.join(out, "tsconfig.json");
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        outDir: out,
        rootDir: path.join(root, "src"),
        module: "commonjs",
        target: "es2022",
        skipLibCheck: true,
        esModuleInterop: true,
        strict: true,
        moduleResolution: "node",
        baseUrl: root,
        paths: { "@/*": ["src/*"] },
      },
      files: [path.join(root, "src/lib/calibration/index.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", tsconfigPath], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
  const { buildCalibrationReport, resolveScale, estimateScaleFromLegLength } = require(
    path.join(out, "lib/calibration/index.js"),
  );

  const base = { legLengthCm: 90, knownDistanceM: null, frameWidth: W, frameHeight: H, frames: synthFrames() };

  // (1) Needs calibration when there is no signal at all.
  const none = buildCalibrationReport({ ...base, legLengthCm: null, frames: synthFrames() });
  check("no leg length + no distance → not calibrated", none.calibrated === false && none.scale === null);
  check("needs-calibration warns about leg length", none.warnings.some((w) => /leg length/i.test(w)));

  // (2) Leg-length scale recovers the ground-truth metres-per-pixel (0.9 m / 90 px).
  const legScale = estimateScaleFromLegLength(synthFrames(), 90, W, H);
  check("leg-length scale ≈ ground truth mpp", legScale && approx(legScale.metersPerPixel, MPP, 0.001));
  check("leg-length scale is method=legLength, medium confidence", legScale.method === "legLength" && legScale.confidence === "medium");

  // (3) Scale priority: manual beats leg length beats known distance.
  const manual = resolveScale({ ...base, manualMetersPerPixel: 0.02 });
  check("manual scale wins with high confidence", manual.method === "manual" && manual.confidence === "high");
  const known = resolveScale({ legLengthCm: null, knownDistanceM: 10, frameWidth: W, frameHeight: H, frames: synthFrames() });
  check("known-distance used only as low-confidence fallback", known.method === "knownDistance" && known.confidence === "low");

  // (4) Full report: real-world estimates present, velocity ≈ 4 px/frame × 30 fps × 0.01 = 1.2 m/s.
  const report = buildCalibrationReport(base);
  check("report is calibrated with a leg-length scale", report.calibrated === true && report.scale.method === "legLength");
  const byKey = Object.fromEntries(report.measurements.map((m) => [m.key, m]));
  check("has step, stride, velocities, distance", ["stepLength", "strideLength", "avgVelocity", "topVelocity", "distanceCovered"].every((k) => k in byKey));
  check(`avg velocity ≈ 1.2 m/s (got ${byKey.avgVelocity.value?.toFixed(3)})`, approx(byKey.avgVelocity.value, 1.2, 0.05));
  check("distance covered ≈ 4px×59×0.01 = 2.36 m", approx(byKey.distanceCovered.value, (4 * 59) * MPP, 0.05));
  check("every measurement carries a confidence", report.measurements.every((m) => m.value == null || m.confidence));
  check("top velocity confidence ≤ avg velocity confidence", ["low", "medium", "high"].indexOf(byKey.topVelocity.confidence) <= ["low", "medium", "high"].indexOf(byKey.avgVelocity.confidence));

  // (5) Determinism.
  const again = buildCalibrationReport(base);
  check("deterministic report", JSON.stringify(again) === JSON.stringify(report));

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
