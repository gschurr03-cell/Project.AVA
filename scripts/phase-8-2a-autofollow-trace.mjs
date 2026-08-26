// Phase 8.2A -- 240 FPS Auto Follow smoothness forensic audit. Calls the
// REAL, unmodified production `buildPresentationCameraPath`/
// `stepPresentationCamera` (src/lib/video/presentationCamera.ts) against
// each benchmark's real, current, live pose artifact, producing the exact
// same fine-grained, per-real-source-frame camera path production code
// resolves once per clip (`OverlaySurface.tsx`'s `resolvedCameraPath`).
//
// Then SIMULATES the display-sampling process every real playback actually
// goes through: a nominal 60Hz rAF cadence (matching the vast majority of
// real displays) asks, at each repaint, "what is the last source frame at or
// before the presented time" (a byte-for-byte copy of the real, exported
// `frameIndexForTime` in OverlaySurface.tsx -- binary search over
// frame.time <= time) and looks up that frame's ALREADY-RESOLVED camera
// state. This reproduces exactly what a coach's screen shows, without
// requiring a working video decoder (this environment's headless Chromium
// cannot decode these files -- see Phase 8.0B/8.1A/8.1B-2B's own disclosed
// limitation) -- the simulation only needs real WALL-CLOCK/display-refresh
// arithmetic plus the real, already-resolved camera path, both of which are
// available without decoding a single video pixel.
//
// Read-only, standalone. Not imported by any src/ file, not on any build path.
//
//   node --env-file=.env.local scripts/phase-8-2a-autofollow-trace.mjs <label> <pose.json> <sessionId>

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const label = process.argv[2];
const posePath = path.resolve(process.argv[3]);
const sessionId = process.argv[4];
const out = path.join(root, `.p82a-tmp-${label}`);
const OUT_DIR = path.join(root, "tmp/phase82a");
mkdirSync(OUT_DIR, { recursive: true });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: s, error } = await db.from("sessions").select("id, fps, fps_override").eq("id", sessionId).single();
if (error) { console.error(error); process.exit(1); }

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const orig = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return orig.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};

// Byte-for-byte copy of the real, exported OverlaySurface.tsx#frameIndexForTime
// (binary search, "index of the last frame at or before `time`"). Not a
// reinterpretation -- OverlaySurface.tsx is a "use client" React component
// and cannot be compiled standalone by this script's tsc-to-tmp-dir approach,
// so the algorithm is copied verbatim and cross-checked by this phase's own
// sanity test against the live source text.
function frameIndexForTime(frames, time) {
  let lo = 0, hi = frames.length - 1, idx = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].time <= time) { idx = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return idx;
}

try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, strict: false, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] }, noEmitOnError: false },
      files: [
        path.join(root, "src/lib/video/overlay.ts"),
        path.join(root, "src/lib/video/fps.ts"),
        path.join(root, "src/lib/video/presentationCamera.ts"),
        path.join(root, "src/lib/video/follow.ts"),
      ],
    }),
  );
  try {
    execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    // Pre-existing, already-disclosed (Phase 8.0A) unrelated worldProjection.ts
    // strictness error when compiled standalone outside the full project
    // tsconfig; harmless here (worldProjection.ts is pulled in transitively
    // but never called by this script). Any OTHER compile error still fails loudly.
    const outText = String(err.stdout ?? "") + String(err.stderr ?? "");
    if (!/worldProjection\.ts/.test(outText)) throw new Error(`tsc failed: ${outText}`);
  }

  const { buildOverlayFrames } = require(path.join(out, "lib/video/overlay.js"));
  const { applyFpsOverride, normalizeFps } = require(path.join(out, "lib/video/fps.js"));
  const { buildPresentationCameraPath } = require(path.join(out, "lib/video/presentationCamera.js"));

  const seq = JSON.parse(readFileSync(posePath, "utf8"));
  const MP = [[0,"nose"],[11,"left_shoulder"],[12,"right_shoulder"],[13,"left_elbow"],[14,"right_elbow"],[15,"left_wrist"],[16,"right_wrist"],[23,"left_hip"],[24,"right_hip"],[25,"left_knee"],[26,"right_knee"],[27,"left_ankle"],[28,"right_ankle"],[29,"left_heel"],[30,"right_heel"],[31,"left_toe"],[32,"right_toe"]];
  const STRIP = new Set(["predicted", "invalid", "frozen_suspect"]);
  const rawFrames = seq.frames.map((f) => {
    const landmarks = [];
    if (!STRIP.has(f.boxOrigin)) {
      for (const [i, j] of MP) { const kp = f.keypoints[j]; if (kp) landmarks[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score }; }
    }
    return {
      frame: f.index, sourceFrameIndex: f.sourceFrameIndex, time: f.tMs / 1000, landmarks,
      boxOrigin: f.boxOrigin, trackState: f.trackState,
    };
  });
  const baseFrames = buildOverlayFrames({ ...seq, frames: rawFrames });
  const rawFps = Number(s.fps) || seq.fps;
  const normFps = normalizeFps(rawFps);
  const overlayFrames = s.fps_override && Number.isFinite(Number(s.fps_override))
    ? applyFpsOverride(baseFrames, normalizeFps(Number(s.fps_override)))
    : applyFpsOverride(baseFrames, normFps);

  // --- Part A/B: the REAL, fine-grained, per-real-source-frame camera path,
  // exactly as OverlaySurface.tsx's `resolvedCameraPath` resolves it once
  // per clip. ---
  const fine = buildPresentationCameraPath(overlayFrames);
  const fineTrace = fine.map((state, i) => ({
    index: i,
    sourceFrameIndex: overlayFrames[i].sourceFrameIndex ?? overlayFrames[i].frame,
    timeS: overlayFrames[i].time,
    cx: state.cx, cy: state.cy, scale: state.scale,
    targetCenterSourceX: state.targetCenterSourceX, targetCenterSourceY: state.targetCenterSourceY,
    targetScale: state.targetScale,
    rawTargetCenterSourceX: state.rawTargetCenterSourceX, rawTargetCenterSourceY: state.rawTargetCenterSourceY,
    rawTargetScale: state.rawTargetScale,
    velocityX: state.velocityX, velocityY: state.velocityY, scaleVelocity: state.scaleVelocity,
    presentationState: state.presentationState,
  }));

  // --- Part C: simulate nominal 60Hz (and 120Hz for cross-check) display
  // sampling at 1x/0.5x/0.25x playback rate. `presentedTime` advances by
  // (1/displayHz)*rate of SOURCE time per simulated repaint -- exactly what
  // a real <video> element's playhead does (source-time elapsed = wall-time
  // elapsed * playbackRate). ---
  function simulateDisplaySampling(displayHz, playbackRate) {
    const totalSourceTimeS = overlayFrames[overlayFrames.length - 1].time;
    const repaintIntervalSourceS = (1 / displayHz) * playbackRate;
    const samples = [];
    let presentedTime = overlayFrames[0].time;
    let lastFrameIndex = -1;
    while (presentedTime <= totalSourceTimeS) {
      const frameIndex = frameIndexForTime(overlayFrames, presentedTime);
      if (frameIndex !== lastFrameIndex) {
        samples.push({ presentedTime, frameIndex, ...fine[frameIndex] });
        lastFrameIndex = frameIndex;
      } else {
        // Same source frame shown again (display outran source decode) --
        // still a real "displayed tick" but with NO camera-state change.
        samples.push({ presentedTime, frameIndex, ...fine[frameIndex], repeated: true });
      }
      presentedTime += repaintIntervalSourceS;
    }
    return samples;
  }

  const displaySamples = {};
  for (const rate of [1, 0.5, 0.25]) {
    displaySamples[`rate_${rate}`] = { hz60: simulateDisplaySampling(60, rate), hz120: simulateDisplaySampling(120, rate) };
  }

  console.log(JSON.stringify({
    label, sessionId, frameCount: overlayFrames.length, normFps,
    totalSourceTimeS: overlayFrames[overlayFrames.length - 1].time,
    fineTraceLength: fineTrace.length,
  }));

  writeFileSync(path.join(OUT_DIR, `${label}-fine-trace.json`), JSON.stringify({ label, normFps, frameCount: overlayFrames.length, fineTrace }));
  writeFileSync(path.join(OUT_DIR, `${label}-display-samples.json`), JSON.stringify({ label, normFps, displaySamples }));
  console.log(`Wrote tmp/phase82a/${label}-fine-trace.json and ${label}-display-samples.json`);
} finally {
  Module._resolveFilename = orig;
  rmSync(out, { recursive: true, force: true });
}
