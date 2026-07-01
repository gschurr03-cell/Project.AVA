// Runtime sanity for the MediaPipe Python runtime wiring.
//
//   node scripts/mediapipe-sanity.mjs
//
// Proves the service/mapping are wired correctly WITHOUT requiring mediapipe or
// opencv to be installed: a missing/unavailable runtime must fail cleanly with
// an actionable error, while all the pure mapping/validation stays real. Compiles
// the TS lib to a throwaway dir (so `zod` resolves), asserts, then cleans up.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".mediapipe-sanity-tmp");
const runnerPy = path.join(root, "src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py");

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  // (1) Python runner exists.
  check(`python runner exists: ${path.relative(root, runnerPy)}`, existsSync(runnerPy));

  execFileSync(
    "npx",
    [
      "tsc",
      "src/lib/biomechanics/video/index.ts",
      "src/lib/biomechanics/mediapipe/index.ts",
      "--outDir",
      out,
      "--module",
      "commonjs",
      "--target",
      "es2022",
      "--skipLibCheck",
      "--esModuleInterop",
    ],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );

  const { createPoseBackend } = require(path.join(out, "pose-backend.js"));
  const { poseSequenceSchema } = require(path.join(out, "pose.js"));
  const { PythonMediaPipePoseService, buildPoseSequence, mediaPipeResultSchema } = require(
    path.join(out, "mediapipe/index.js"),
  );

  // (2) TS service constructs.
  const service = new PythonMediaPipePoseService({ runnerPath: runnerPy, timeoutMs: 30000 });
  check(`PythonMediaPipePoseService constructs`, typeof service.run === "function");

  // (3) Missing video path fails cleanly (deps not installed here → import error).
  let cleanFail = false;
  let failMsg = "";
  try {
    await service.run({ signedUrl: "/nonexistent/does-not-exist.mp4" });
  } catch (e) {
    cleanFail = e instanceof Error && e.message.length > 0;
    failMsg = e.message;
  }
  check(`missing video path fails cleanly: ${JSON.stringify(failMsg.slice(0, 120))}`, cleanFail);

  // (4) Sample/fake MediaPipe result still validates through the schema.
  const sampleFrame = {
    landmarks: Array.from({ length: 33 }, (_, i) => ({ x: 0.5, y: 0.4, z: 0.01, visibility: 0.9 })),
    worldLandmarks: Array.from({ length: 33 }, (_, i) => ({ x: i * 0.01, y: i * 0.02, z: i * 0.03, visibility: 0.9 })),
  };
  const sample = { fps: 30, width: 1044, height: 596, frames: [sampleFrame, sampleFrame] };
  check(`mediaPipeResultSchema validates sample`, mediaPipeResultSchema.safeParse(sample).success);

  // (5) buildPoseSequence validates through poseSequenceSchema.
  const seq = buildPoseSequence(sample);
  check(`buildPoseSequence → backend=${seq.backend} ${seq.frames.length} frames; schema valid`,
    seq.backend === "mediapipe" && poseSequenceSchema.safeParse(seq).success);

  // (6) Mock backend still passes.
  const mockSeq = await createPoseBackend("mock").estimate({ width: 1044, height: 596, durationS: 2, fps: 30 });
  check(`mock backend still valid (${mockSeq.frames.length} frames)`,
    mockSeq.backend === "mock" && poseSequenceSchema.safeParse(mockSeq).success);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
