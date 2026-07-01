// Runtime sanity for the pose backends (there is no test runner yet).
//
//   node scripts/pose-sanity.mjs
//
// Compiles the biomechanics TS modules to a throwaway dir inside the project
// (so `zod` resolves from node_modules), runs assertions against the real
// compiled output, then cleans up. Proves the MediaPipe mapping/validation and
// that the mock + processVideo orchestration are unaffected.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".pose-sanity-tmp");

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
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
  const { poseSequenceSchema, keypointSchema, CANONICAL_JOINTS } = require(path.join(out, "pose.js"));
  const { MediaPipePoseBackend, buildPoseSequence, mapFrameToKeypoints, MEDIAPIPE_LANDMARK_INDEX } =
    require(path.join(out, "mediapipe/index.js"));
  const { processVideo } = require(path.join(out, "video/index.js"));

  // Build a sample MediaPipe result: 33 landmarks + world landmarks, 2 frames.
  const landmark = (i) => ({ x: 0.5 + i * 0.001, y: 0.4 + i * 0.001, z: 0.01, visibility: 0.9, presence: 0.95 });
  const world = (i) => ({ x: i * 0.01, y: i * 0.02, z: i * 0.03 });
  const frame = () => ({
    landmarks: Array.from({ length: 33 }, (_, i) => landmark(i)),
    worldLandmarks: Array.from({ length: 33 }, (_, i) => world(i)),
  });
  const sampleResult = { fps: 30, width: 1044, height: 596, frames: [frame(), frame()] };
  const sampleService = { async run() { return sampleResult; } };

  // 1. createPoseBackend("mediapipe") returns a backend object.
  const mp = createPoseBackend("mediapipe");
  check(`createPoseBackend("mediapipe") → name=${mp.name} model=${mp.modelVersion}`,
    mp instanceof MediaPipePoseBackend && mp.name === "mediapipe" && mp.modelVersion === "mediapipe-pose-0.1");

  // 1b. default (no injected service) throws only when inference is attempted.
  let threw = false;
  try { await mp.estimate({ signedUrl: "x" }); } catch (e) { threw = /not available/.test(e.message); }
  check(`default estimate() throws at inference time`, threw);

  // 2. landmark mapping → valid canonical keypoints (all 13, correct indices, world preserved).
  const kps = mapFrameToKeypoints(frame());
  const missing = CANONICAL_JOINTS.filter((j) => !(j in kps));
  check(`mapFrameToKeypoints → all ${CANONICAL_JOINTS.length} joints (missing: ${missing.join(",") || "none"})`, missing.length === 0);
  const noseIdxOk = MEDIAPIPE_LANDMARK_INDEX.nose === 0 && MEDIAPIPE_LANDMARK_INDEX.right_toe === 32;
  check(`landmark indices wired (nose=0, right_toe=32)`, noseIdxOk);
  const ankle = kps.left_ankle; // index 27
  const worldOk = ankle && ankle.world && Math.abs(ankle.world.z - 27 * 0.03) < 1e-9;
  check(`left_ankle keypoint valid + world preserved (score=${ankle?.score}, world.z=${ankle?.world?.z?.toFixed(3)})`,
    keypointSchema.safeParse(ankle).success && worldOk);

  // 3. output validates through poseSequenceSchema.
  const seq = buildPoseSequence(sampleResult);
  check(`buildPoseSequence → backend=${seq.backend} ${seq.frames.length} frames; schema ${poseSequenceSchema.safeParse(seq).success ? "valid" : "INVALID"}`,
    seq.backend === "mediapipe" && seq.frames.length === 2 && poseSequenceSchema.safeParse(seq).success);

  // 4. mock backend still passes.
  const mock = createPoseBackend("mock");
  const mockSeq = await mock.estimate({ width: 1044, height: 596, durationS: 2, fps: 30 });
  check(`mock backend still valid (${mockSeq.frames.length} frames, backend=${mockSeq.backend})`,
    mockSeq.backend === "mock" && poseSequenceSchema.safeParse(mockSeq).success);

  // 5. processVideo accepts an injected MediaPipe backend with zero orchestration change.
  const injected = new MediaPipePoseBackend(sampleService);
  const viaProcess = await processVideo({ signedUrl: "https://x/v.mp4", width: 1044, height: 596, durationS: 2, fps: 30 }, { backend: injected });
  check(`processVideo(injected mediapipe) → backend=${viaProcess.backend}, ${viaProcess.frames.length} frames, schema valid`,
    viaProcess.backend === "mediapipe" && poseSequenceSchema.safeParse(viaProcess).success);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
