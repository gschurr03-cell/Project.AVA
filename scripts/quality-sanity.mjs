// Runtime sanity for Day 70 — Recording Quality Engine (recording/quality.ts).
//
//   node scripts/quality-sanity.mjs
//
// Compiles src/lib/recording/quality.ts and asserts the explainable rules:
//   • an excellent 60 fps recording → high score, spatial metrics certified,
//     contact/flight estimated, nothing unavailable;
//   • no calibration → spatial metrics unavailable;
//   • 120 fps → contact/flight certified;
//   • panning + no compensation → camera fails;
//   • summarisePoseQuality derives fill / confidence / missing from frames.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".quality-sanity-tmp");

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

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  const tsconfigPath = path.join(out, "tsconfig.json");
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022",
        skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node",
        baseUrl: root, paths: { "@/*": ["src/*"] },
      },
      files: [path.join(root, "src/lib/recording/quality.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", tsconfigPath], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { buildRecordingQuality, summarisePoseQuality } = require(path.join(out, "lib/recording/quality.js"));

  const excellent = {
    fps: 59.94, width: 1920, height: 1080, codec: "h264",
    cameraStatic: true, cameraConfidence: "high", cameraAvailable: true,
    calibrationPresent: true, athleteFillFraction: 0.28, trackingCoverage: 0.97,
    poseConfidence: 0.85, missingFrameFraction: 0.02,
  };
  const rEx = buildRecordingQuality(excellent);
  const keys = (list) => list.map((m) => m.key);
  check("excellent 60fps → rating excellent", rEx.rating === "excellent");
  check("excellent → score ≥ 85, stars 5", rEx.score >= 85 && rEx.stars === 5);
  check("excellent → spatial+freq certified", ["zoneTime", "avgVelocity", "maxVelocity", "stepLength", "stepFrequency"].every((k) => keys(rEx.certified).includes(k)));
  check("excellent → contact/flight estimated (60fps)", keys(rEx.estimated).includes("groundContact") && keys(rEx.estimated).includes("flightTime"));
  check("excellent → nothing unavailable", rEx.unavailable.length === 0);
  check("every factor explains why", rEx.factors.every((f) => f.why.length > 10));
  check("every metric judgement explains why", [...rEx.certified, ...rEx.estimated].every((m) => m.why.length > 10));

  // 120 fps → timing certified, none estimated.
  const r120 = buildRecordingQuality({ ...excellent, fps: 120 });
  check("120fps → contact/flight certified", keys(r120.certified).includes("groundContact") && keys(r120.certified).includes("flightTime"));
  check("120fps → nothing estimated", r120.estimated.length === 0);

  // No calibration → spatial unavailable, lower score.
  const rNoCal = buildRecordingQuality({ ...excellent, calibrationPresent: false });
  check("no calibration → step length unavailable", keys(rNoCal.unavailable).includes("stepLength") && keys(rNoCal.unavailable).includes("avgVelocity"));
  check("no calibration → score drops below excellent", rNoCal.score < rEx.score && rNoCal.rating !== "excellent");

  // Panning without compensation → camera factor fails; poor spatial.
  const rPan = buildRecordingQuality({ ...excellent, cameraStatic: false, cameraAvailable: false, cameraConfidence: "unavailable" });
  const camFactor = rPan.factors.find((f) => f.key === "camera");
  check("panning uncompensated → camera factor fails", camFactor.status === "fail");
  check("panning uncompensated → spatial downgraded (not all certified)", rPan.certified.length < rEx.certified.length);

  // Weak tracking → spatial + timing unavailable.
  const rWeak = buildRecordingQuality({ ...excellent, trackingCoverage: 0.3, poseConfidence: 0.3 });
  check("weak tracking → spatial unavailable", keys(rWeak.unavailable).includes("stepLength"));
  check("weak tracking → contact/flight unavailable", keys(rWeak.unavailable).includes("groundContact"));
  check("weak tracking → rating poor/fair", rWeak.rating === "poor" || rWeak.rating === "fair");

  // summarisePoseQuality on synthetic frames.
  const kp = (y) => ({ x: 0.5, y, visibility: 0.9 });
  const frames = [];
  for (let i = 0; i < 10; i++) {
    frames.push({
      frame: i, time: i / 60,
      landmarks: i < 8
        ? { nose: kp(0.30), leftShoulder: kp(0.35), rightShoulder: kp(0.35), leftHip: kp(0.55), rightHip: kp(0.55), leftAnkle: kp(0.85), rightAnkle: kp(0.85), leftHeel: kp(0.86), rightHeel: kp(0.86) }
        : {}, // 2 frames with no pose → missing
      angles: {}, centerOfMass: { x: 0.5, y: 0.5 }, velocity: null,
    });
  }
  const pq = summarisePoseQuality(frames);
  check("pose summary → athlete fill ≈ 0.55 (ankle 0.85 − nose 0.30)", Math.abs(pq.athleteFillFraction - 0.55) < 0.02);
  check("pose summary → confidence ≈ 0.9", Math.abs(pq.poseConfidence - 0.9) < 0.02);
  check("pose summary → missing ≈ 0.2 (2 of 10 untracked)", Math.abs(pq.missingFrameFraction - 0.2) < 1e-9);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
