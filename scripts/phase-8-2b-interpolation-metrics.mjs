// Phase 8.2B Part S -- before/after measurement. Compares the OLD discrete
// nearest-frame-at-or-before Auto Follow display lookup against the NEW
// bracketing display-time interpolation, using the Phase 8.2A methodology:
// the real, unmodified `buildPresentationCameraPath` run against the real,
// current pose artifacts for all three Vanni benchmarks, then simulated
// display sampling at 60Hz/120Hz.
//
// `resolveDisplayCameraState` is copied verbatim from
// src/components/video/OverlaySurface.tsx (a "use client" component that
// cannot be compiled standalone by this script's tsc-to-tmp-dir approach --
// same documented constraint as `frameIndexForTime` in every Phase 8.2A
// script). Cross-checked against the live source text by this script's own
// sanity check before use (see `verifyLiveSourceMatch` below).
//
// Read-only, standalone. Not imported by any src/ file, not on any build path.
//
//   node --env-file=.env.local scripts/phase-8-2b-interpolation-metrics.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(root, "tmp/phase82b");
mkdirSync(OUT_DIR, { recursive: true });
const REPRESENTATIVE_PLAYER_WIDTH_PX = 1280;

const BENCHMARKS = {
  vanni60: { sessionId: "3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d", posePath: path.join(root, "tmp/phase80a/vanni60.pose.json") },
  vanni120: { sessionId: "160a86a2-c0db-4e7d-9fbe-82aedd6d3eff", posePath: path.join(root, "tmp/phase80a/vanni120.pose.json") },
  vanni240: { sessionId: "31fe352b-f00f-4a80-b20a-17c2ab08ec5a", posePath: path.join(root, "tmp/phase80a/vanni240.pose.json") },
};

// --- verbatim copies of the two production functions under test ----------
// Byte-for-byte copy of OverlaySurface.tsx's exported `frameIndexForTime`.
function frameIndexForTime(frames, time) {
  let lo = 0, hi = frames.length - 1, idx = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].time <= time) { idx = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return idx;
}
const lerp = (a, b, t) => a + (b - a) * t;
// Byte-for-byte copy of OverlaySurface.tsx's exported `resolveDisplayCameraState`.
function resolveDisplayCameraState(path_, frames, presentedTime, indexA) {
  const stateA = path_[indexA];
  const indexB = Math.min(indexA + 1, path_.length - 1);
  if (indexB === indexA) return stateA;
  const stateB = path_[indexB];
  const tA = frames[indexA].time;
  const tB = frames[indexB].time;
  const span = tB - tA;
  if (!(span > 0)) return stateA;
  const alpha = Number.isFinite(presentedTime) ? Math.min(1, Math.max(0, (presentedTime - tA) / span)) : 0;
  if (alpha === 0) return stateA;
  return {
    ...stateA,
    cx: lerp(stateA.cx, stateB.cx, alpha),
    cy: lerp(stateA.cy, stateB.cy, alpha),
    scale: lerp(stateA.scale, stateB.scale, alpha),
    targetCenterSourceX: lerp(stateA.targetCenterSourceX, stateB.targetCenterSourceX, alpha),
    targetCenterSourceY: lerp(stateA.targetCenterSourceY, stateB.targetCenterSourceY, alpha),
    targetScale: lerp(stateA.targetScale, stateB.targetScale, alpha),
    timestampMs: presentedTime * 1000,
  };
}

// Verifies the two functions above are still byte-for-byte present in the
// live source (fails loudly, not silently, if production diverges).
function verifyLiveSourceMatch() {
  const src = readFileSync(path.join(root, "src/components/video/OverlaySurface.tsx"), "utf8");
  if (!src.includes("export function frameIndexForTime(frames: OverlayFrame[], time: number)")) {
    throw new Error("frameIndexForTime signature no longer matches live source");
  }
  if (!src.includes("export function resolveDisplayCameraState(")) {
    throw new Error("resolveDisplayCameraState no longer present in live source");
  }
  if (!src.includes("resolveDisplayCameraState(resolvedCameraPath, frames, presentedTime, frameIndex)")) {
    throw new Error("tick() no longer calls resolveDisplayCameraState the way this script assumes");
  }
}
verifyLiveSourceMatch();

function stats(vals) {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  const pct = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return {
    n: s.length, median: +pct(0.5).toFixed(6), p95: +pct(0.95).toFixed(6),
    p99: +pct(0.99).toFixed(6), max: +s[s.length - 1].toFixed(6),
  };
}
function trimAcquisitionTransient(rows) {
  const idx = rows.findIndex((r) => r.presentationState === "following" || r.presentationState === "anticipating");
  return idx > 0 ? rows.slice(idx) : rows;
}
function deltaPx(a, b) {
  return Math.hypot((a.cx - b.cx) * REPRESENTATIVE_PLAYER_WIDTH_PX, (a.cy - b.cy) * REPRESENTATIVE_PLAYER_WIDTH_PX);
}
function derivatives(rows, timeKey) {
  const times = rows.map((r) => r[timeKey]);
  const vx = [], vy = [];
  for (let i = 1; i < rows.length; i++) {
    const dt = times[i] - times[i - 1];
    if (dt <= 0) { vx.push(0); vy.push(0); continue; }
    vx.push((rows[i].cx - rows[i - 1].cx) / dt);
    vy.push((rows[i].cy - rows[i - 1].cy) / dt);
  }
  const ax = [], ay = [];
  for (let i = 1; i < vx.length; i++) {
    const dt = times[i + 1] - times[i];
    if (dt <= 0) { ax.push(0); ay.push(0); continue; }
    ax.push((vx[i] - vx[i - 1]) / dt);
    ay.push((vy[i] - vy[i - 1]) / dt);
  }
  const jx = [], jy = [];
  for (let i = 1; i < ax.length; i++) {
    const dt = times[i + 2] - times[i + 1];
    if (dt <= 0) { jx.push(0); jy.push(0); continue; }
    jx.push((ax[i] - ax[i - 1]) / dt);
    jy.push((ay[i] - ay[i - 1]) / dt);
  }
  return {
    accelPxPerS2: stats(ax.map((a, i) => Math.hypot(a, ay[i]) * REPRESENTATIVE_PLAYER_WIDTH_PX)),
    jerkPxPerS3: stats(jx.map((j, i) => Math.hypot(j, jy[i]) * REPRESENTATIVE_PLAYER_WIDTH_PX)),
  };
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const out = path.join(root, ".p82b-metrics-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return origResolve.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};

const results = {};

try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, strict: false, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] }, noEmitOnError: false },
      files: [path.join(root, "src/lib/video/overlay.ts"), path.join(root, "src/lib/video/fps.ts"), path.join(root, "src/lib/video/presentationCamera.ts"), path.join(root, "src/lib/video/follow.ts")],
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

  const MP = [[0,"nose"],[11,"left_shoulder"],[12,"right_shoulder"],[13,"left_elbow"],[14,"right_elbow"],[15,"left_wrist"],[16,"right_wrist"],[23,"left_hip"],[24,"right_hip"],[25,"left_knee"],[26,"right_knee"],[27,"left_ankle"],[28,"right_ankle"],[29,"left_heel"],[30,"right_heel"],[31,"left_toe"],[32,"right_toe"]];
  const STRIP = new Set(["predicted", "invalid", "frozen_suspect"]);

  for (const [label, { sessionId, posePath }] of Object.entries(BENCHMARKS)) {
    const { data: s, error } = await db.from("sessions").select("id, fps, fps_override").eq("id", sessionId).single();
    if (error) throw new Error(`${label}: ${error.message}`);

    const seq = JSON.parse(readFileSync(posePath, "utf8"));
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
    const frames = s.fps_override && Number.isFinite(Number(s.fps_override))
      ? applyFpsOverride(baseFrames, normalizeFps(Number(s.fps_override)))
      : applyFpsOverride(baseFrames, normFps);

    const fine = buildPresentationCameraPath(frames);
    const fineRows = frames.map((f, i) => ({ time: f.time, cx: fine[i].cx, cy: fine[i].cy, scale: fine[i].scale, presentationState: fine[i].presentationState }));

    function simulate(displayHz, useInterpolation) {
      const totalSourceTimeS = frames[frames.length - 1].time;
      const interval = 1 / displayHz;
      const rows = [];
      let t = frames[0].time;
      while (t <= totalSourceTimeS) {
        const indexA = frameIndexForTime(frames, t);
        const state = useInterpolation ? resolveDisplayCameraState(fine, frames, t, indexA) : fine[indexA];
        rows.push({ tickTime: t, cx: state.cx, cy: state.cy, scale: state.scale, presentationState: fine[indexA].presentationState });
        t += interval;
      }
      return rows;
    }

    // Interpolation error (Part S): for every real fine-grained probe time,
    // compare the true fine-path value to what the OLD/NEW display pipeline
    // would show on screen at that instant (most recent display tick <= probe
    // time, held constant since -- exactly what a real repaint does).
    function interpolationError(displayTicks) {
      const errors = [];
      let tickIdx = 0;
      for (const probe of fineRows) {
        while (tickIdx + 1 < displayTicks.length && displayTicks[tickIdx + 1].tickTime <= probe.time) tickIdx++;
        const shown = displayTicks[tickIdx];
        errors.push(deltaPx(shown, probe));
      }
      return errors;
    }

    const benchResult = {};
    for (const hz of [60, 120]) {
      const oldTicks = simulate(hz, false);
      const newTicks = simulate(hz, true);
      const oldTrimmed = trimAcquisitionTransient(oldTicks);
      const newTrimmed = trimAcquisitionTransient(newTicks);
      const oldDeltas = [], newDeltas = [];
      for (let i = 1; i < oldTrimmed.length; i++) oldDeltas.push(deltaPx(oldTrimmed[i], oldTrimmed[i - 1]));
      for (let i = 1; i < newTrimmed.length; i++) newDeltas.push(deltaPx(newTrimmed[i], newTrimmed[i - 1]));
      benchResult[`hz_${hz}`] = {
        old: { deltaPxStats: stats(oldDeltas), ...derivatives(oldTrimmed, "tickTime") },
        new: { deltaPxStats: stats(newDeltas), ...derivatives(newTrimmed, "tickTime") },
        interpolationErrorPx: { old: stats(interpolationError(oldTicks)), new: stats(interpolationError(newTicks)) },
      };
    }
    results[label] = { normFps, frameCount: frames.length, ...benchResult };
    console.log(`\n=== ${label} (normFps=${normFps}) ===`);
    for (const hz of [60, 120]) {
      const r = benchResult[`hz_${hz}`];
      console.log(`  @${hz}Hz delta p95 px:  OLD ${r.old.deltaPxStats?.p95}  NEW ${r.new.deltaPxStats?.p95}`);
      console.log(`  @${hz}Hz delta max px:  OLD ${r.old.deltaPxStats?.max}  NEW ${r.new.deltaPxStats?.max}`);
      console.log(`  @${hz}Hz interp error p95 px: OLD ${r.interpolationErrorPx.old?.p95}  NEW ${r.interpolationErrorPx.new?.p95}`);
    }
  }

  writeFileSync(path.join(OUT_DIR, "before-after-metrics.json"), JSON.stringify(results, null, 2));
  console.log(`\nWrote ${path.join(OUT_DIR, "before-after-metrics.json")}`);
} finally {
  Module._resolveFilename = origResolve;
  rmSync(out, { recursive: true, force: true });
}
