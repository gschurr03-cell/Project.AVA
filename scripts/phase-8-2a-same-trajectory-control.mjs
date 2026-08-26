// Phase 8.2A Part J -- same-trajectory, different-SOURCE-FPS control.
// Takes the REAL Vanni 240 pose evidence (the highest-resolution real
// capture available) and DECIMATES the actual input frame array (keeps
// every 2nd/4th real frame, exactly as if pose evidence had only been
// available at ~120/~60 fps for this SAME athlete run), then re-runs the
// REAL, unmodified `buildPresentationCameraPath` on each decimated input.
// This isolates SOURCE FPS as a variable while holding the athlete/run
// identical -- unlike Part I (same computed path, different DISPLAY
// sampling), this tests whether feeding the algorithm coarser SOURCE
// evidence changes the algorithm's own OUTPUT trajectory, separate from how
// densely a display can show it.
//
// Read-only, standalone. Not imported by any src/ file, not on any build path.
//
//   node --env-file=.env.local scripts/phase-8-2a-same-trajectory-control.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".p82a-control-tmp");
const OUT_DIR = path.join(root, "tmp/phase82a");

const sessionId = "31fe352b-f00f-4a80-b20a-17c2ab08ec5a"; // vanni240, highest real source fps
const posePath = path.join(root, "tmp/phase80a/vanni240.pose.json");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: s, error } = await db.from("sessions").select("id, fps, fps_override").eq("id", sessionId).single();
if (error) { console.error(error); process.exit(1); }

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const orig = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return orig.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};

function frameIndexForTime(frames, time) {
  let lo = 0, hi = frames.length - 1, idx = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].time <= time) { idx = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return idx;
}
function stats(vals) {
  if (!vals.length) return null;
  const sorted = [...vals].sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return { n: sorted.length, median: +pct(0.5).toFixed(6), p95: +pct(0.95).toFixed(6), max: +sorted[sorted.length - 1].toFixed(6) };
}
function trimAcquisitionTransient(rows) {
  const idx = rows.findIndex((r) => r.presentationState === "following" || r.presentationState === "anticipating");
  return idx > 0 ? rows.slice(idx) : rows;
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
    return { frame: f.index, sourceFrameIndex: f.sourceFrameIndex, time: f.tMs / 1000, landmarks, boxOrigin: f.boxOrigin, trackState: f.trackState };
  });
  const baseFrames = buildOverlayFrames({ ...seq, frames: rawFrames });
  const rawFps = Number(s.fps) || seq.fps;
  const normFps = normalizeFps(rawFps);
  const overlayFrames240 = s.fps_override && Number.isFinite(Number(s.fps_override))
    ? applyFpsOverride(baseFrames, normalizeFps(Number(s.fps_override)))
    : applyFpsOverride(baseFrames, normFps);

  // Decimate the REAL input (same athlete run, same real pose evidence) to
  // simulate "what if this run had only been captured at ~1/2 or ~1/4 this
  // FPS" -- keep every Nth frame, exactly as evidence-limited capture would.
  const decimate = (frames, stride) => frames.filter((_, i) => i % stride === 0);
  const input240 = overlayFrames240; // native, ~240fps
  const input120sim = decimate(overlayFrames240, 2); // simulated ~120fps
  const input60sim = decimate(overlayFrames240, 4); // simulated ~60fps

  const REPRESENTATIVE_PLAYER_WIDTH_PX = 1280;
  function analyze(inputFrames, displayHz) {
    const path_ = buildPresentationCameraPath(inputFrames);
    const rows = inputFrames.map((f, i) => ({ time: f.time, timeS: f.time, cx: path_[i].cx, cy: path_[i].cy, scale: path_[i].scale, presentationState: path_[i].presentationState }));
    const trimmedFine = trimAcquisitionTransient(rows);
    const fineDeltas = [];
    for (let i = 1; i < trimmedFine.length; i++) fineDeltas.push(Math.hypot((trimmedFine[i].cx - trimmedFine[i - 1].cx) * REPRESENTATIVE_PLAYER_WIDTH_PX, (trimmedFine[i].cy - trimmedFine[i - 1].cy) * REPRESENTATIVE_PLAYER_WIDTH_PX));

    // Display-sample this input's OWN resolved path at a fixed 60Hz, so all
    // three (native 240, simulated 120, simulated 60) are compared under the
    // SAME display constraint.
    const total = rows[rows.length - 1].timeS;
    const interval = 1 / displayHz;
    const disp = [];
    let t = rows[0].timeS, lastIdx = -1;
    while (t <= total) {
      const idx = frameIndexForTime(rows, t);
      if (idx !== lastIdx) { disp.push(rows[idx]); lastIdx = idx; }
      t += interval;
    }
    const trimmedDisp = trimAcquisitionTransient(disp);
    const dispDeltas = [];
    for (let i = 1; i < trimmedDisp.length; i++) dispDeltas.push(Math.hypot((trimmedDisp[i].cx - trimmedDisp[i - 1].cx) * REPRESENTATIVE_PLAYER_WIDTH_PX, (trimmedDisp[i].cy - trimmedDisp[i - 1].cy) * REPRESENTATIVE_PLAYER_WIDTH_PX));
    return { inputFrameCount: inputFrames.length, fineDeltaPxStats: stats(fineDeltas), displaySampledDeltaPxStats: stats(dispDeltas) };
  }

  const result = {
    native240: analyze(input240, 60),
    simulated120FromSameRun: analyze(input120sim, 60),
    simulated60FromSameRun: analyze(input60sim, 60),
  };
  console.log(JSON.stringify(result, null, 2));
  writeFileSync(path.join(OUT_DIR, "same-trajectory-control.json"), JSON.stringify(result, null, 2));
  console.log(`\nWrote ${path.join(OUT_DIR, "same-trajectory-control.json")}`);
} finally {
  Module._resolveFilename = orig;
  rmSync(out, { recursive: true, force: true });
}
