// Phase R3D Part G -- feeds CURRENT (and BASELINE) corrected-orientation real
// production localization/pose evidence into the UNCHANGED contact detector
// (src/lib/video/steps.ts, via buildOverlayFrames + detectStepMarks), using
// the SAME real-function-compilation technique phase-r3a-missing-contact-
// trace.mjs already established (compiles the real overlay.ts/fps.ts/steps.ts
// via tsc to a temp dir, requires them -- never reimplements the algorithm).
//
//   node scripts/phase-r3d-contact-detector-replay.mjs
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(root, "tmp/phaseR3D");
mkdirSync(OUT_DIR, { recursive: true });

const RUNS = {
  current: "tmp/phaseR3D/current-production-full-run.json",
  baseline: "tmp/phaseR3D/baseline-full-run.json",
};

// Standard MediaPipe 33-point index -> AVA canonical joint name, matching
// src/lib/video/loadOverlayFrames.ts's own MP_INDEX_TO_JOINT exactly (same
// indices), so buildOverlayFrames sees the identical shape it does in real
// production (server loader), not an approximation.
const MP_INDEX_TO_JOINT = [
  [0, "nose"], [11, "left_shoulder"], [12, "right_shoulder"],
  [13, "left_elbow"], [14, "right_elbow"], [15, "left_wrist"], [16, "right_wrist"],
  [23, "left_hip"], [24, "right_hip"], [25, "left_knee"], [26, "right_knee"],
  [27, "left_ankle"], [28, "right_ankle"], [29, "left_heel"], [30, "right_heel"],
  [31, "left_toe"], [32, "right_toe"],
];

const out = path.join(root, ".r3d-tmp-compile");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return origResolve.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};

const results = {};
try {
  writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
    compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, strict: false, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] }, noEmitOnError: false },
    files: [path.join(root, "src/lib/video/overlay.ts"), path.join(root, "src/lib/video/fps.ts"), path.join(root, "src/lib/video/steps.ts")],
  }));
  try { execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (err) { const t = String(err.stdout ?? "") + String(err.stderr ?? ""); if (!/worldProjection\.ts/.test(t)) throw new Error(t); }

  const { buildOverlayFrames } = require(path.join(out, "lib/video/overlay.js"));
  const { applyFpsOverride, normalizeFps } = require(path.join(out, "lib/video/fps.js"));
  const { detectStepMarks, stripUnstableLandmarks, DEFAULT_STEP_CONFIG } = require(path.join(out, "lib/video/steps.js"));

  for (const [label, runPath] of Object.entries(RUNS)) {
    const run = JSON.parse(readFileSync(path.join(root, runPath), "utf8"));
    const rawFrames = run.frames.map((f) => {
      const landmarks = [];
      for (const [mpIndex, joint] of MP_INDEX_TO_JOINT) {
        // f.landmarks is the REAL raw 33-point MediaPipe array this phase's
        // real production run emitted -- position == MediaPipe index.
        const kp = f.landmarks && f.landmarks[mpIndex];
        if (kp) landmarks[mpIndex] = { x: kp.x, y: kp.y, visibility: kp.visibility };
      }
      return {
        frame: f.index, sourceFrameIndex: f.sourceFrameIndex, time: f.timestampMs / 1000,
        landmarks, boxOrigin: f.boxOrigin, trackState: f.trackState,
        identityContinuityScore: f.identityContinuityScore,
      };
    });
    const baseFrames = buildOverlayFrames({ fps: run.fps, width: run.width, height: run.height, backend: "mediapipe", frames: rawFrames });
    const overlayFrames = applyFpsOverride(baseFrames, normalizeFps(run.fps));
    const strippedFrames = stripUnstableLandmarks(overlayFrames);
    const contacts = detectStepMarks(strippedFrames, DEFAULT_STEP_CONFIG);

    const early = contacts.filter((c) => c.time <= 0.5);
    results[label] = {
      totalContacts: contacts.length,
      earlyContacts: early.map((c) => ({ side: c.side, sourceFrameIndex: c.sourceFrameIndex, timeS: c.time, confidence: c.confidence ?? null })),
    };
    console.log(`${label}: ${contacts.length} total contacts, ${early.length} within first 500ms`);
    for (const c of early) console.log(`  ${c.side} @ sourceFrame${c.sourceFrameIndex} t=${c.time.toFixed(4)}s`);
  }

  writeFileSync(path.join(OUT_DIR, "contact-detector-replay-raw.json"), JSON.stringify(results, null, 2));
  console.log(`\nWrote ${OUT_DIR}/contact-detector-replay-raw.json`);
} finally {
  Module._resolveFilename = origResolve;
  rmSync(out, { recursive: true, force: true });
}
