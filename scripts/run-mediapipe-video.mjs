// Real video → PoseSequence runner.
//
//   npm run mediapipe:video -- <path/to/video.mp4> [--maxFrames N] [--fps N]
//
// Runs the real MediaPipe backend (Python runtime) on an actual video via the
// existing PoseBackend contract, validates the returned PoseSequence, and writes
// it to artifacts/pose-sequences/<name>.pose.json. Fails cleanly (no partial
// artifact) if the path/args are bad or the Python deps are missing.
//
// It compiles the TS lib to a throwaway dir (so `zod` resolves) — the same
// approach as the sanity scripts — then drives MediaPipePoseBackend directly.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, existsSync, writeFileSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = path.join(root, ".mediapipe-video-tmp");

function fail(message, code = 1) {
  console.error(`error: ${message}`);
  process.exit(code);
}

// --- parse args ---
const argv = process.argv.slice(2);
let videoArg;
let maxFrames;
let fps;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--maxFrames") maxFrames = Number(argv[++i]);
  else if (a === "--fps") fps = Number(argv[++i]);
  else if (!a.startsWith("--") && videoArg === undefined) videoArg = a;
  else fail(`unexpected argument: ${a}`);
}

if (!videoArg) {
  fail("no video path provided.\n  usage: npm run mediapipe:video -- <path/to/video.mp4> [--maxFrames N] [--fps N]");
}
if (maxFrames !== undefined && (!Number.isFinite(maxFrames) || maxFrames <= 0)) {
  fail("--maxFrames must be a positive number");
}
if (fps !== undefined && (!Number.isFinite(fps) || fps <= 0)) {
  fail("--fps must be a positive number");
}

const isUrl = /^https?:\/\//i.test(videoArg);
const input = isUrl ? videoArg : path.resolve(videoArg);
if (!isUrl && !existsSync(input)) {
  fail(`video not found: ${input}`);
}

// --- compile the lib, then run ---
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
let exitCode = 0;
try {
  execFileSync(
    "npx",
    [
      "tsc",
      "src/lib/biomechanics/mediapipe/index.ts",
      "--outDir",
      tmp,
      "--module",
      "commonjs",
      "--target",
      "es2022",
      "--skipLibCheck",
      "--esModuleInterop",
    ],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );

  const { MediaPipePoseBackend } = require(path.join(tmp, "mediapipe/index.js"));
  const { poseSequenceSchema } = require(path.join(tmp, "pose.js"));

  const runnerPath = path.join(root, "src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py");
  const backend = MediaPipePoseBackend.withPythonRuntime({ runnerPath });

  const opts = {};
  if (fps !== undefined) opts.fps = fps;
  if (maxFrames !== undefined) opts.maxFrames = maxFrames;

  // The backend already validates internally; this throws a clean, actionable
  // error if the Python runtime/deps are unavailable.
  const seq = await backend.estimate({ signedUrl: input }, opts);

  // Belt-and-suspenders: never write an artifact that isn't schema-valid.
  const parsed = poseSequenceSchema.safeParse(seq);
  if (!parsed.success) {
    throw new Error(`returned PoseSequence failed validation: ${JSON.stringify(parsed.error.issues[0])}`);
  }

  const counts = seq.frames.map((f) => Object.keys(f.keypoints).length);
  const minK = counts.length ? Math.min(...counts) : 0;
  const maxK = counts.length ? Math.max(...counts) : 0;

  // Write atomically (temp file → rename) so a crash can't leave partial JSON.
  const baseName = path.basename(isUrl ? new URL(input).pathname : input).replace(/\.[^.]+$/, "");
  const outDir = path.join(root, "artifacts", "pose-sequences");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${baseName || "video"}.pose.json`);
  const tmpOut = `${outPath}.tmp`;
  writeFileSync(tmpOut, JSON.stringify(seq, null, 2));
  renameSync(tmpOut, outPath);

  console.log("MediaPipe video run complete:");
  console.log(`  backend         ${seq.backend}`);
  console.log(`  modelVersion    ${seq.modelVersion}`);
  console.log(`  fps             ${seq.fps}`);
  console.log(`  resolution      ${seq.width}x${seq.height}`);
  console.log(`  frames          ${seq.frames.length}`);
  console.log(`  keypoints/frame ${minK}..${maxK} of 13`);
  console.log(`  output          ${path.relative(root, outPath)}`);
} catch (err) {
  // Report and set a failure code, but let `finally` clean up the temp dir
  // before we exit (process.exit would skip it).
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(exitCode);
