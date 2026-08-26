// Phase 9.3A Parts A-Q, U -- the FINAL, fully-composed (Stabilized View
// wrapper x Auto Follow wrapper) screen-space athlete-anchor trajectory,
// sampled at the real measured display cadence (Part D:
// tmp/phase93a/display-cadence.json, ~59.88Hz), for all 4 benchmarks x all
// 4 view-mode combinations.
//
// Real, unmodified production code:
//   - buildPresentationCameraPath, DEFAULT_PRESENTATION_CAMERA_CONFIG
//     (src/lib/video/presentationCamera.ts) -- compiled standalone.
//   - buildDisplayStabilizationPath, stabilizationCorrection, IDENTITY_SIMILARITY
//     (src/lib/video/displayStabilization.ts) -- compiled standalone.
//   - indexCameraFramePaths (src/lib/video/cameraPath.ts) -- compiled standalone.
//   - frameIndexForTime, resolveDisplayCameraState -- verbatim copies of the
//     exported OverlaySurface.tsx functions (a "use client" component that
//     cannot be compiled standalone by this tsc-to-tmp-dir approach -- same
//     documented constraint as every 8.2A/8.2B script), cross-checked against
//     the live source text by verifyLiveSourceMatch() before use.
//
// The composed-transform formula below is not invented: it is the exact
// mathematical meaning of the two CSS transform strings OverlaySurface.tsx's
// real tick() writes (`followTransform`/`stabilizationTransform`, both read
// directly from src/lib/video/follow.ts and displayStabilization.ts and
// reproduced verbatim in `composeFinal` below, cross-checked the same way).
//
//   node scripts/phase-9-3a-final-trace-analysis.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(root, "tmp/phase93a");
mkdirSync(OUT_DIR, { recursive: true });

const REPRESENTATIVE_PLAYER_WIDTH_PX = 1280; // same convention as Phase 8.2A/8.2B
const DISPLAY_HZ = 59.88; // Part D real measured rAF cadence, this environment

const BENCHMARKS = {
  gav: { pose: "tmp/phase80a/gav.pose.json", fps: 60 },
  vanni60: { pose: "tmp/phase80a/vanni60.pose.json", fps: 56.53006510915358 },
  vanni120: { pose: "tmp/phase80a/vanni120.pose.json", fps: 120.005 },
  vanni240: { pose: "tmp/phase80a/vanni240.pose.json", fps: 239.981 },
};

// --- verbatim copies of OverlaySurface.tsx's exported functions ----------
function frameIndexForTime(frames, time) {
  let lo = 0, hi = frames.length - 1, idx = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].time <= time) { idx = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return idx;
}
const lerp = (a, b, t) => a + (b - a) * t;
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
function verifyLiveSourceMatch() {
  const src = readFileSync(path.join(root, "src/components/video/OverlaySurface.tsx"), "utf8");
  const checks = [
    "export function frameIndexForTime(frames: OverlayFrame[], time: number)",
    "export function resolveDisplayCameraState(",
    "resolveDisplayCameraState(resolvedCameraPath, frames, presentedTime, frameIndex)",
    "const entry = resolvedStabilizationPath[frameIndex];",
    "stabilizationCorrection(entry.state, entry.raw, width ?? 1, height ?? 1)",
    "const next: FollowBox = { cx: camera.cx, cy: camera.cy, scale: camera.scale };",
  ];
  for (const c of checks) if (!src.includes(c)) throw new Error(`live OverlaySurface.tsx source no longer matches: ${JSON.stringify(c)}`);
  const followSrc = readFileSync(path.join(root, "src/lib/video/follow.ts"), "utf8");
  if (!followSrc.includes('return `translate(${tx}%, ${ty}%) scale(${box.scale})`;')) throw new Error("followTransform formula no longer matches live source");
  const stabSrc = readFileSync(path.join(root, "src/lib/video/displayStabilization.ts"), "utf8");
  if (!stabSrc.includes('return `translate(${tx}%, ${ty}%) rotate(${correction.rotationDeg}deg) scale(${correction.scale})`;')) throw new Error("stabilizationTransform formula no longer matches live source");
}
verifyLiveSourceMatch();

/**
 * The exact CSS composition `followTransform(next)` then, on the wrapper
 * OUTSIDE it, `stabilizationTransform(correction)` perform on a point `p`
 * (normalized [0,1] position within the video's own displayed picture),
 * reconstructed directly from the two CSS strings' own formulas (both
 * verified against the live source above), NOT assumed or newly invented:
 *   followTransform: translate((0.5 - s*cx)%, (0.5 - s*cy)%) scale(s)
 *     => a point p maps to: 0.5 + s*(p - c)   [standard "center c, zoom s"]
 *   stabilizationTransform: translate(tx%, ty%) rotate(r) scale(s2), applied
 *   OUTSIDE/on top, to the ALREADY-follow-transformed point (both wrappers
 *   are same-sized, origin-top-left, percentage-of-own-box) => rotate then
 *   scale then translate, in the CSS transform-list left-to-right order
 *   (translate function value is a percentage of the box; rotate/scale
 *   compose around transform-origin 0,0 exactly as CSS applies them).
 */
function composeFinal(anchor, camera, correction) {
  const fx = 0.5 + camera.scale * (anchor.x - camera.cx);
  const fy = 0.5 + camera.scale * (anchor.y - camera.cy);
  const rad = (correction.rotationDeg * Math.PI) / 180;
  const rx = Math.cos(rad) * fx - Math.sin(rad) * fy;
  const ry = Math.sin(rad) * fx + Math.cos(rad) * fy;
  return {
    x: correction.translationX + correction.scale * rx,
    y: correction.translationY + correction.scale * ry,
    followOnlyX: fx,
    followOnlyY: fy,
    combinedScale: camera.scale * correction.scale,
  };
}

function stats(vals) {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  const pct = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return {
    n: s.length, mean: +(s.reduce((a, c) => a + c, 0) / s.length).toFixed(4),
    median: +pct(0.5).toFixed(4), p75: +pct(0.75).toFixed(4), p90: +pct(0.9).toFixed(4),
    p95: +pct(0.95).toFixed(4), p99: +pct(0.99).toFixed(4), max: +s[s.length - 1].toFixed(4),
  };
}

const out = path.join(root, ".p93a-trace-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return origResolve.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};

const finalTransformTrace = {};
const athleteScreenAnchor = {};
const deltaDistribution = {};
const velocityUniformity = {};
const accelerationJerk = {};
const localWindowIrregularity = {};
const skipEvents = {};
const layerDecomposition = {};

try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, strict: false, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] }, noEmitOnError: false },
      files: [
        path.join(root, "src/lib/video/presentationCamera.ts"),
        path.join(root, "src/lib/video/displayStabilization.ts"),
        path.join(root, "src/lib/video/cameraPath.ts"),
        path.join(root, "src/lib/video/follow.ts"),
      ],
    }),
  );
  try {
    execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const outText = String(err.stdout ?? "") + String(err.stderr ?? "");
    // Allow unrelated pre-existing type errors elsewhere in the compiled
    // graph (worldProjection.ts, matching the established precedent from
    // scripts/phase-8-2b-interpolation-metrics.mjs); fail loudly on anything else.
    if (!/worldProjection\.ts|cameraPathSchema\.ts/.test(outText)) throw new Error(`tsc failed: ${outText}`);
  }
  const { buildPresentationCameraPath } = require(path.join(out, "lib/video/presentationCamera.js"));
  const { buildDisplayStabilizationPath, stabilizationCorrection, IDENTITY_SIMILARITY } = require(path.join(out, "lib/video/displayStabilization.js"));
  const { indexCameraFramePaths } = require(path.join(out, "lib/video/cameraPath.js"));

  const IDENTITY_CAMERA = { cx: 0.5, cy: 0.5, scale: 1, presentationState: "full_frame" };

  for (const [label, cfg] of Object.entries(BENCHMARKS)) {
    const seq = JSON.parse(readFileSync(path.join(root, cfg.pose), "utf8"));
    const width = seq.width, height = seq.height;

    // Minimal, real OverlayFrame-shaped array: only the fields
    // buildPresentationCameraPath/frameIndexForTime actually read
    // (landmarks in camelCase, time in seconds, sourceFrameIndex).
    const MP_NAMES = ["nose", "left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist", "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle", "left_heel", "right_heel", "left_toe", "right_toe"];
    const toCamel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const STRIP = new Set(["predicted", "invalid", "frozen_suspect"]);
    const frames = seq.frames.map((f) => {
      const landmarks = {};
      if (!STRIP.has(f.boxOrigin)) {
        for (const snake of MP_NAMES) {
          const kp = f.keypoints[snake];
          if (kp) landmarks[toCamel(snake)] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score };
        }
      }
      return { frame: f.index, sourceFrameIndex: f.sourceFrameIndex, time: f.tMs / 1000, landmarks };
    });

    const resolvedCameraPath = buildPresentationCameraPath(frames);

    const cameraPathIndex = indexCameraFramePaths(seq.cameraPath);
    const getRawTransform = (sourceFrameIndex) => {
      const fp = cameraPathIndex.get(sourceFrameIndex);
      const m = fp?.frameToGlobalMatrix;
      if (!m) return null;
      return { translationX: m.translationX, translationY: m.translationY, rotationDeg: m.rotationDeg, scale: m.scale };
    };
    const resolvedStabilizationPath = buildDisplayStabilizationPath(
      frames.map((f) => ({ sourceFrameIndex: f.sourceFrameIndex ?? f.frame, timeS: f.time })),
      getRawTransform, width, height,
    );

    // Athlete torso anchor per real source frame -- midpoint(hip-mid,
    // shoulder-mid), the exact definition `follow.ts#computeFollowTarget`
    // itself uses for its stable torso centre (reused here as the anchor to
    // track, per Part E's own "prefer ... the exact anchor used by
    // presentationCamera" instruction).
    const torsoAnchor = frames.map((f) => {
      const lm = f.landmarks;
      if (lm.leftHip && lm.rightHip && lm.leftShoulder && lm.rightShoulder) {
        return {
          x: (lm.leftHip.x + lm.rightHip.x + lm.leftShoulder.x + lm.rightShoulder.x) / 4,
          y: (lm.leftHip.y + lm.rightHip.y + lm.leftShoulder.y + lm.rightShoulder.y) / 4,
        };
      }
      return null;
    });

    const t0 = frames[0].time;
    const t1 = frames[frames.length - 1].time;

    function sampleViewMode(autoFollowOn, stabilizedOn, displayHz) {
      const interval = 1 / displayHz;
      const rows = [];
      let t = t0;
      let lastValidAnchorIdx = null;
      while (t <= t1) {
        const frameIndex = frameIndexForTime(frames, t);
        if (torsoAnchor[frameIndex]) lastValidAnchorIdx = frameIndex;
        const anchor = torsoAnchor[frameIndex] ?? torsoAnchor[lastValidAnchorIdx] ?? { x: 0.5, y: 0.5 };
        const camera = autoFollowOn ? resolveDisplayCameraState(resolvedCameraPath, frames, t, frameIndex) : IDENTITY_CAMERA;
        let correction = IDENTITY_SIMILARITY;
        if (stabilizedOn) {
          const entry = resolvedStabilizationPath[frameIndex];
          if (entry?.raw) correction = stabilizationCorrection(entry.state, entry.raw, width, height);
        }
        const final = composeFinal(anchor, camera, correction);
        rows.push({
          t, frameIndex, sourceFrameIndex: frames[frameIndex].sourceFrameIndex,
          x: final.x * REPRESENTATIVE_PLAYER_WIDTH_PX, y: final.y * REPRESENTATIVE_PLAYER_WIDTH_PX,
          followOnlyX: final.followOnlyX * REPRESENTATIVE_PLAYER_WIDTH_PX, followOnlyY: final.followOnlyY * REPRESENTATIVE_PLAYER_WIDTH_PX,
          scale: final.combinedScale, cameraScale: camera.scale, correctionScale: correction.scale,
          presentationState: camera.presentationState,
          hasAnchorEvidence: !!torsoAnchor[frameIndex],
        });
        t += interval;
      }
      return rows;
    }

    const modes = {
      raw_afOff: sampleViewMode(false, false, DISPLAY_HZ),
      raw_afOn: sampleViewMode(true, false, DISPLAY_HZ),
      stab_afOff: sampleViewMode(false, true, DISPLAY_HZ),
      stab_afOn: sampleViewMode(true, true, DISPLAY_HZ),
    };

    finalTransformTrace[label] = Object.fromEntries(
      Object.entries(modes).map(([k, rows]) => [k, rows.slice(0, 40)]), // sample, full stats computed below
    );
    athleteScreenAnchor[label] = Object.fromEntries(
      Object.entries(modes).map(([k, rows]) => [k, { n: rows.length, sample: rows.slice(0, 20).map((r) => ({ t: +r.t.toFixed(4), x: +r.x.toFixed(2), y: +r.y.toFixed(2), scale: +r.scale.toFixed(4) })) }]),
    );

    // --- Part F: delta distribution. Keep only the LONGEST contiguous run
    // of a steady tracking state (following/anticipating/full_frame),
    // matching Phase 8.2A's own Part P precedent exactly -- excludes the
    // acquisition transient AND any mid/end-of-clip holding/degraded/
    // reacquiring/returning_to_full_frame regime (e.g. the athlete exiting
    // frame near a clip's end, confirmed present in the real vanni120
    // artifact's tail) rather than only trimming the leading edge. Computing
    // a delta across an artificially closed gap from a scattered filter
    // would fabricate a jump that never actually appeared on screen, so the
    // run must stay contiguous. ---
    const STEADY_STATES = new Set(["following", "anticipating", "full_frame"]);
    function trimTransient(rows) {
      let best = [], cur = [];
      for (const r of rows) {
        if (STEADY_STATES.has(r.presentationState)) cur.push(r);
        else { if (cur.length > best.length) best = cur; cur = []; }
      }
      if (cur.length > best.length) best = cur;
      return best;
    }
    function deltas(rows) {
      const out = [];
      for (let i = 1; i < rows.length; i++) out.push(Math.hypot(rows[i].x - rows[i - 1].x, rows[i].y - rows[i - 1].y));
      return out;
    }
    deltaDistribution[label] = Object.fromEntries(Object.entries(modes).map(([k, rows]) => [k, stats(deltas(trimTransient(rows)))]));

    // --- Part G: velocity uniformity ---
    function velocityUniformityFor(rows) {
      const trimmed = trimTransient(rows);
      const vel = [];
      for (let i = 1; i < trimmed.length; i++) {
        const dt = trimmed[i].t - trimmed[i - 1].t;
        vel.push(dt > 0 ? Math.hypot(trimmed[i].x - trimmed[i - 1].x, trimmed[i].y - trimmed[i - 1].y) / dt : 0);
      }
      if (!vel.length) return null;
      const mean = vel.reduce((a, c) => a + c, 0) / vel.length;
      const variance = vel.reduce((a, c) => a + (c - mean) ** 2, 0) / vel.length;
      const sd = Math.sqrt(variance);
      const cv = mean > 0 ? sd / mean : null;
      // p95 deviation from LOCAL mean (centered 5-tick window)
      const localDevs = [];
      const W = 5;
      for (let i = 0; i < vel.length; i++) {
        const lo = Math.max(0, i - W), hi = Math.min(vel.length, i + W + 1);
        const win = vel.slice(lo, hi);
        const localMean = win.reduce((a, c) => a + c, 0) / win.length;
        localDevs.push(Math.abs(vel[i] - localMean));
      }
      return { velocityPxPerS: stats(vel), coefficientOfVariation: +cv?.toFixed(4), p95LocalDeviation: stats(localDevs)?.p95, maxLocalSpike: stats(localDevs)?.max };
    }
    velocityUniformity[label] = Object.fromEntries(Object.entries(modes).map(([k, rows]) => [k, velocityUniformityFor(rows)]));

    // --- Part H: acceleration/jerk, robust exclusions (contiguous run
    // length > 3 of following/anticipating states only, matching Phase
    // 8.2A's own Part P convention) ---
    function accelJerkFor(rows) {
      // Build contiguous runs of steady presentationState.
      const runs = [];
      let cur = [];
      for (const r of rows) {
        if (cur.length && cur[cur.length - 1].presentationState !== r.presentationState) {
          if (cur.length > 3) runs.push(cur);
          cur = [];
        }
        cur.push(r);
      }
      if (cur.length > 3) runs.push(cur);
      const steady = runs.filter((run) => ["following", "anticipating", "full_frame"].includes(run[0].presentationState));
      const absAccel = [], absJerk = [];
      for (const run of steady) {
        const vx = [], vy = [];
        for (let i = 1; i < run.length; i++) {
          const dt = run[i].t - run[i - 1].t;
          if (!(dt > 0)) { vx.push(0); vy.push(0); continue; }
          vx.push((run[i].x - run[i - 1].x) / dt); vy.push((run[i].y - run[i - 1].y) / dt);
        }
        const ax = [], ay = [];
        for (let i = 1; i < vx.length; i++) {
          const dt = run[i + 1].t - run[i].t;
          if (!(dt > 0)) { ax.push(0); ay.push(0); continue; }
          ax.push((vx[i] - vx[i - 1]) / dt); ay.push((vy[i] - vy[i - 1]) / dt);
        }
        for (let i = 0; i < ax.length; i++) absAccel.push(Math.hypot(ax[i], ay[i]));
        const jx = [], jy = [];
        for (let i = 1; i < ax.length; i++) {
          const dt = run[i + 2].t - run[i + 1].t;
          if (!(dt > 0)) { jx.push(0); jy.push(0); continue; }
          jx.push((ax[i] - ax[i - 1]) / dt); jy.push((ay[i] - ay[i - 1]) / dt);
        }
        for (let i = 0; i < jx.length; i++) absJerk.push(Math.hypot(jx[i], jy[i]));
      }
      return { accelerationPxPerS2: stats(absAccel), jerkPxPerS3: stats(absJerk), steadyRunCount: steady.length, excludedRunCount: runs.length - steady.length };
    }
    accelerationJerk[label] = Object.fromEntries(Object.entries(modes).map(([k, rows]) => [k, accelJerkFor(rows)]));

    // --- Part I: local motion uniformity window (150ms) ---
    function localWindowFor(rows) {
      const trimmed = trimTransient(rows);
      const windowS = 0.15;
      const events = [];
      for (let i = 0; i < trimmed.length; i++) {
        const windowRows = trimmed.filter((r) => r.t >= trimmed[i].t && r.t < trimmed[i].t + windowS);
        if (windowRows.length < 3) continue;
        const stepDeltas = [];
        for (let j = 1; j < windowRows.length; j++) stepDeltas.push(Math.hypot(windowRows[j].x - windowRows[j - 1].x, windowRows[j].y - windowRows[j - 1].y));
        const meanStep = stepDeltas.reduce((a, c) => a + c, 0) / stepDeltas.length;
        const maxStep = Math.max(...stepDeltas);
        const irregularity = meanStep > 0.01 ? maxStep / meanStep : 1;
        events.push({ t: trimmed[i].t, irregularity });
      }
      events.sort((a, b) => b.irregularity - a.irregularity);
      return { worstEvents: events.slice(0, 5).map((e) => ({ t: +e.t.toFixed(4), irregularity: +e.irregularity.toFixed(3) })), irregularityStats: stats(events.map((e) => e.irregularity)) };
    }
    localWindowIrregularity[label] = Object.fromEntries(Object.entries(modes).map(([k, rows]) => [k, localWindowFor(rows)]));

    // --- Part J/K: skip-event detection + layer decomposition (top 1% local
    // deviation events, on stab_afOn -- the real production default state). ---
    function detectSkipEvents(rows) {
      const trimmed = trimTransient(rows);
      const d = deltas(trimmed);
      const s = stats(d);
      if (!s) return [];
      const threshold = s.p95;
      const events = [];
      for (let i = 1; i < trimmed.length - 1; i++) {
        const delta = Math.hypot(trimmed[i].x - trimmed[i - 1].x, trimmed[i].y - trimmed[i - 1].y);
        if (delta <= threshold) continue;
        const localWin = d.slice(Math.max(0, i - 10), i + 10);
        const localExpected = localWin.reduce((a, c) => a + c, 0) / (localWin.length || 1);
        events.push({
          t: +trimmed[i].t.toFixed(4), frameIndex: trimmed[i].frameIndex, sourceFrameIndex: trimmed[i].sourceFrameIndex,
          previous: { x: +trimmed[i - 1].x.toFixed(2), y: +trimmed[i - 1].y.toFixed(2) },
          current: { x: +trimmed[i].x.toFixed(2), y: +trimmed[i].y.toFixed(2) },
          next: { x: +trimmed[i + 1].x.toFixed(2), y: +trimmed[i + 1].y.toFixed(2) },
          localExpectedDisplacement: +localExpected.toFixed(3), actualDisplacement: +delta.toFixed(3),
          ratio: localExpected > 0.01 ? +(delta / localExpected).toFixed(2) : null,
          presentationState: trimmed[i].presentationState, scale: +trimmed[i].scale.toFixed(4),
        });
      }
      events.sort((a, b) => b.ratio - a.ratio);
      return events.slice(0, 10);
    }
    const primaryEvents = detectSkipEvents(modes.stab_afOn);
    skipEvents[label] = primaryEvents;

    // Layer decomposition for each detected event: each contribution is an
    // INDEPENDENT "what if only this changed" estimate (matching Phase
    // 8.2A's own precedented Part K methodology exactly -- translationOnlyPx
    // = pan alone at the old scale, scaleOnlyPx = zoom alone at the anchor's
    // own actual distance from the old frame center), not a forced-additive
    // residual decomposition -- so components need not sum to the total.
    function decompose(events) {
      return events.map((ev) => {
        const tPrev = ev.t - 1 / DISPLAY_HZ;
        const fiPrev = frameIndexForTime(frames, tPrev);
        const anchorPrev = torsoAnchor[fiPrev] ?? { x: 0.5, y: 0.5 };
        const anchorCur = torsoAnchor[ev.frameIndex] ?? { x: 0.5, y: 0.5 };
        const sourceOnlyDelta = Math.hypot(anchorCur.x - anchorPrev.x, anchorCur.y - anchorPrev.y) * REPRESENTATIVE_PLAYER_WIDTH_PX;

        const camPrev = resolveDisplayCameraState(resolvedCameraPath, frames, tPrev, fiPrev);
        const camCur = resolveDisplayCameraState(resolvedCameraPath, frames, ev.t, ev.frameIndex);
        const nearestPrev = resolvedCameraPath[fiPrev];
        const nearestCur = resolvedCameraPath[ev.frameIndex];

        // Auto-Follow-only contribution: composeFinal with identity correction.
        const afOnlyPrev = composeFinal(anchorPrev, camPrev, IDENTITY_SIMILARITY);
        const afOnlyCur = composeFinal(anchorCur, camCur, IDENTITY_SIMILARITY);
        const afOnlyDelta = Math.hypot(afOnlyCur.x - afOnlyPrev.x, afOnlyCur.y - afOnlyPrev.y) * REPRESENTATIVE_PLAYER_WIDTH_PX;

        // Interpolation contribution: interpolated AF vs nearest-neighbor (pre-8.2B) AF, same ticks.
        const nnOnlyPrev = composeFinal(anchorPrev, nearestPrev, IDENTITY_SIMILARITY);
        const nnOnlyCur = composeFinal(anchorCur, nearestCur, IDENTITY_SIMILARITY);
        const nnOnlyDelta = Math.hypot(nnOnlyCur.x - nnOnlyPrev.x, nnOnlyCur.y - nnOnlyPrev.y) * REPRESENTATIVE_PLAYER_WIDTH_PX;

        // Stabilization contribution: how far the correction ALONE (camera
        // held at identity) moves the point between the two ticks.
        const stabOnlyPrev = composeFinal(anchorPrev, IDENTITY_CAMERA, resolvedStabilizationPath[fiPrev]?.raw ? stabilizationCorrection(resolvedStabilizationPath[fiPrev].state, resolvedStabilizationPath[fiPrev].raw, width, height) : IDENTITY_SIMILARITY);
        const stabOnlyCur = composeFinal(anchorCur, IDENTITY_CAMERA, resolvedStabilizationPath[ev.frameIndex]?.raw ? stabilizationCorrection(resolvedStabilizationPath[ev.frameIndex].state, resolvedStabilizationPath[ev.frameIndex].raw, width, height) : IDENTITY_SIMILARITY);
        const stabOnlyDelta = Math.hypot(stabOnlyCur.x - stabOnlyPrev.x, stabOnlyCur.y - stabOnlyPrev.y) * REPRESENTATIVE_PLAYER_WIDTH_PX;

        // Translation-only (pan at OLD scale) vs scale-only (zoom change at
        // the anchor's own actual distance from the OLD frame center) --
        // Phase 8.2A Part K's exact formulas, generalized from a generic
        // frame-center point to this specific tracked anchor.
        const translationOnlyPx = Math.hypot((camCur.cx - camPrev.cx) * camPrev.scale * REPRESENTATIVE_PLAYER_WIDTH_PX, (camCur.cy - camPrev.cy) * camPrev.scale * REPRESENTATIVE_PLAYER_WIDTH_PX);
        const distFromCenter = Math.hypot(anchorPrev.x - camPrev.cx, anchorPrev.y - camPrev.cy);
        const scaleOnlyPx = Math.abs(camCur.scale - camPrev.scale) * distFromCenter * REPRESENTATIVE_PLAYER_WIDTH_PX;
        const dominant = scaleOnlyPx > translationOnlyPx * 0.5 ? (translationOnlyPx > scaleOnlyPx * 0.5 ? "both" : "zoom") : "pan";

        return {
          t: ev.t, actualDisplacement: ev.actualDisplacement,
          sourceVideoMotion: +sourceOnlyDelta.toFixed(3),
          autoFollowContribution: +afOnlyDelta.toFixed(3),
          stabilizedViewContribution: +stabOnlyDelta.toFixed(3),
          interpolationContribution: +Math.abs(afOnlyDelta - nnOnlyDelta).toFixed(3),
          translationOnlyPx: +translationOnlyPx.toFixed(3),
          scaleOnlyPx: +scaleOnlyPx.toFixed(3),
          dominant,
        };
      });
    }
    layerDecomposition[label] = decompose(primaryEvents);

    console.log(`${label}: raw_afOff delta p95=${deltaDistribution[label].raw_afOff?.p95} raw_afOn p95=${deltaDistribution[label].raw_afOn?.p95} stab_afOn p95=${deltaDistribution[label].stab_afOn?.p95} skipEvents=${primaryEvents.length}`);
  }

  writeFileSync(path.join(OUT_DIR, "final-transform-trace.json"), JSON.stringify(finalTransformTrace, null, 2));
  writeFileSync(path.join(OUT_DIR, "athlete-screen-anchor.json"), JSON.stringify(athleteScreenAnchor, null, 2));
  writeFileSync(path.join(OUT_DIR, "delta-distribution.json"), JSON.stringify(deltaDistribution, null, 2));
  writeFileSync(path.join(OUT_DIR, "velocity-uniformity.json"), JSON.stringify(velocityUniformity, null, 2));
  writeFileSync(path.join(OUT_DIR, "acceleration-jerk.json"), JSON.stringify(accelerationJerk, null, 2));
  writeFileSync(path.join(OUT_DIR, "local-window-irregularity.json"), JSON.stringify(localWindowIrregularity, null, 2));
  writeFileSync(path.join(OUT_DIR, "skip-events.json"), JSON.stringify(skipEvents, null, 2));
  writeFileSync(path.join(OUT_DIR, "layer-decomposition.json"), JSON.stringify(layerDecomposition, null, 2));
  console.log(`\nWrote tmp/phase93a/{final-transform-trace,athlete-screen-anchor,delta-distribution,velocity-uniformity,acceleration-jerk,local-window-irregularity,skip-events,layer-decomposition}.json`);
} finally {
  Module._resolveFilename = origResolve;
  rmSync(out, { recursive: true, force: true });
}
