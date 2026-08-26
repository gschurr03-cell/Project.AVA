// Phase 9.2B Part U -- before/after proximal-joint jitter measurement for the
// display-only `stepSkeletonSmoothing` pass added to VideoOverlay.tsx.
//
// `stepSkeletonSmoothing` and its four constants are copied verbatim below
// (VideoOverlay.tsx is a "use client" component with a large, unrelated
// import graph -- same documented tsc-to-tmp-dir constraint as every prior
// phase's *-interpolation-metrics.mjs / *-metrics.mjs script). `verifyLiveSourceMatch`
// below fails loudly if the live source ever diverges from this copy.
//
// Method: for each of the 4 real benchmark pose artifacts, feed every real
// frame's real (tMs, proximal-joint xy) through the real smoothing step, in
// source-time order, exactly as VideoOverlay.tsx's draw loop does (one
// state carried forward, reset only by the function's own internal rules).
// Then compute the SAME normalized frame-to-frame jitter-velocity statistic
// Phase 9.2A used (per-joint displacement / athlete-height-px / dt), before
// (raw) vs after (smoothed), for proximal/mid-limb/distal joint groups, plus
// the smoothed-minus-raw bias (should be ~0 mean, bounded) as the "lag/error
// introduced" figure Part U requires.
//
// Read-only, standalone. Not imported by any src/ file, not on any build path.
//
//   node scripts/phase-9-2b-jitter-metrics.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(root, "tmp/phase92b");
mkdirSync(OUT_DIR, { recursive: true });

const BENCHMARKS = {
  gav: path.join(root, "tmp/phase80a/gav.pose.json"),
  vanni240: path.join(root, "tmp/phase80a/vanni240.pose.json"),
  vanni120: path.join(root, "tmp/phase80a/vanni120.pose.json"),
  vanni60: path.join(root, "tmp/phase80a/vanni60.pose.json"),
};

// --- verbatim copy of VideoOverlay.tsx's stepSkeletonSmoothing + constants ---
const SKELETON_SMOOTHED_JOINT_NAMES = ["leftShoulder", "rightShoulder", "leftHip", "rightHip"];
const SKELETON_SMOOTHING_TIME_CONSTANT_S = 0.025;
const SKELETON_SMOOTHING_MAX_JUMP_NORMALIZED = 0.08;
const SKELETON_SMOOTHING_MAX_DT_S = 0.5;

function stepSkeletonSmoothing(previous, rawJoints, timeS) {
  const dt = previous ? timeS - previous.timeS : Infinity;
  const hardReset = !previous || !(dt > 0) || dt > SKELETON_SMOOTHING_MAX_DT_S;
  const alpha = hardReset ? 1 : 1 - Math.exp(-dt / SKELETON_SMOOTHING_TIME_CONSTANT_S);
  const joints = {};
  for (const name of SKELETON_SMOOTHED_JOINT_NAMES) {
    const raw = rawJoints[name];
    if (!raw) continue;
    const prevJoint = hardReset ? undefined : previous.joints[name];
    if (!prevJoint) {
      joints[name] = { x: raw.x, y: raw.y };
      continue;
    }
    const jump = Math.hypot(raw.x - prevJoint.x, raw.y - prevJoint.y);
    if (jump > SKELETON_SMOOTHING_MAX_JUMP_NORMALIZED) {
      joints[name] = { x: raw.x, y: raw.y };
      continue;
    }
    joints[name] = {
      x: prevJoint.x + (raw.x - prevJoint.x) * alpha,
      y: prevJoint.y + (raw.y - prevJoint.y) * alpha,
    };
  }
  return { timeS, joints };
}

function verifyLiveSourceMatch() {
  const src = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
  const checks = [
    'export const SKELETON_SMOOTHED_JOINT_NAMES = ["leftShoulder", "rightShoulder", "leftHip", "rightHip"] as const;',
    "export const SKELETON_SMOOTHING_TIME_CONSTANT_S = 0.025;",
    "export const SKELETON_SMOOTHING_MAX_JUMP_NORMALIZED = 0.08;",
    "export const SKELETON_SMOOTHING_MAX_DT_S = 0.5;",
    "export function stepSkeletonSmoothing(",
    "const hardReset = !previous || !(dt > 0) || dt > SKELETON_SMOOTHING_MAX_DT_S;",
    "const alpha = hardReset ? 1 : 1 - Math.exp(-dt / SKELETON_SMOOTHING_TIME_CONSTANT_S);",
    "if (jump > SKELETON_SMOOTHING_MAX_JUMP_NORMALIZED) {",
    "skeletonSmoothingRef.current = stepSkeletonSmoothing(skeletonSmoothingRef.current, rawProximalJoints, currentTime);",
  ];
  for (const c of checks) {
    if (!src.includes(c)) throw new Error(`Live source no longer matches this script's verbatim copy: ${JSON.stringify(c)}`);
  }
}
verifyLiveSourceMatch();

// snake_case (pose artifact) <-> camelCase (production joint name) map, for
// exactly the 4 smoothed joints plus the mid-limb/distal comparison groups.
const JOINT_MAP = {
  left_shoulder: "leftShoulder", right_shoulder: "rightShoulder",
  left_hip: "leftHip", right_hip: "rightHip",
  left_elbow: "leftElbow", right_elbow: "rightElbow",
  left_knee: "leftKnee", right_knee: "rightKnee",
  left_wrist: "leftWrist", right_wrist: "rightWrist",
  left_ankle: "leftAnkle", right_ankle: "rightAnkle",
};
const PROXIMAL = ["left_shoulder", "right_shoulder", "left_hip", "right_hip"];
const MID_LIMB = ["left_elbow", "right_elbow", "left_knee", "right_knee"];
const DISTAL = ["left_wrist", "right_wrist", "left_ankle", "right_ankle"];

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function stats(vals) {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  const pct = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return { n: s.length, median: +pct(0.5).toFixed(4), p95: +pct(0.95).toFixed(4), max: +s[s.length - 1].toFixed(4) };
}

const report = {};

for (const [label, posePath] of Object.entries(BENCHMARKS)) {
  const d = JSON.parse(readFileSync(posePath, "utf8"));
  const frames = d.frames;

  // Run the real smoothing step, in real source-time order, once per frame --
  // exactly as VideoOverlay.tsx's draw loop invokes it once per rendered frame.
  let state = null;
  const smoothedByFrame = [];
  for (const f of frames) {
    const raw = {};
    for (const snake of PROXIMAL) {
      const camel = JOINT_MAP[snake];
      const kp = f.keypoints[snake];
      if (kp) raw[camel] = { x: kp.x, y: kp.y };
    }
    state = stepSkeletonSmoothing(state, raw, f.tMs / 1000);
    smoothedByFrame.push(state.joints);
  }

  // Bias (Part U "lag/error introduced"): smoothed-minus-raw displacement,
  // normalized by athlete height, for every frame where both exist.
  const biasNormalized = [];
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const heightPx = f.athleteBoundingBoxSource ? Math.abs(f.athleteBoundingBoxSource.y1 - f.athleteBoundingBoxSource.y0) : null;
    if (!heightPx) continue;
    for (const snake of PROXIMAL) {
      const camel = JOINT_MAP[snake];
      const kp = f.keypoints[snake];
      const sm = smoothedByFrame[i][camel];
      if (kp && sm) biasNormalized.push(dist(kp, sm) / heightPx);
    }
  }

  // Jitter velocity (identical metric/thresholds to Phase 9.2A's own script):
  // frame-to-frame normalized displacement / dt, raw vs smoothed, per group.
  function jitterFor(getPoint) {
    const byJoint = { proximal: [], midLimb: [], distal: [] };
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1], b = frames[i];
      const dt = (b.tMs - a.tMs) / 1000;
      if (!(dt > 0) || dt > 0.05) continue;
      const heightPx = a.athleteBoundingBoxSource ? Math.abs(a.athleteBoundingBoxSource.y1 - a.athleteBoundingBoxSource.y0) : null;
      if (!heightPx) continue;
      for (const [group, joints] of [["proximal", PROXIMAL], ["midLimb", MID_LIMB], ["distal", DISTAL]]) {
        for (const snake of joints) {
          const p0 = getPoint(i - 1, snake);
          const p1 = getPoint(i, snake);
          if (!p0 || !p1) continue;
          byJoint[group].push((dist(p0, p1) / heightPx) / dt);
        }
      }
    }
    return { proximal: stats(byJoint.proximal), midLimb: stats(byJoint.midLimb), distal: stats(byJoint.distal) };
  }

  const rawGetPoint = (i, snake) => frames[i].keypoints[snake] ?? null;
  const smoothedGetPoint = (i, snake) => {
    const camel = JOINT_MAP[snake];
    if (PROXIMAL.includes(snake)) return smoothedByFrame[i][camel] ?? null;
    return frames[i].keypoints[snake] ?? null; // mid-limb/distal: never touched by smoothing
  };

  const before = jitterFor(rawGetPoint);
  const after = jitterFor(smoothedGetPoint);

  report[label] = {
    frameCount: frames.length,
    before, after,
    coordinateBiasNormalized: stats(biasNormalized),
    midLimbDistalUnchanged: JSON.stringify(before.midLimb) === JSON.stringify(after.midLimb) && JSON.stringify(before.distal) === JSON.stringify(after.distal),
  };

  console.log(`\n=== ${label} ===`);
  console.log(`  proximal jitter (athlete-heights/s)  p95: BEFORE ${before.proximal?.p95}  AFTER ${after.proximal?.p95}   max: BEFORE ${before.proximal?.max}  AFTER ${after.proximal?.max}`);
  console.log(`  midLimb  jitter p95: BEFORE ${before.midLimb?.p95}  AFTER ${after.midLimb?.p95}  (unchanged: ${JSON.stringify(before.midLimb) === JSON.stringify(after.midLimb)})`);
  console.log(`  distal   jitter p95: BEFORE ${before.distal?.p95}  AFTER ${after.distal?.p95}  (unchanged: ${JSON.stringify(before.distal) === JSON.stringify(after.distal)})`);
  console.log(`  coordinate bias (smoothed-raw, normalized) p95: ${report[label].coordinateBiasNormalized?.p95}  max: ${report[label].coordinateBiasNormalized?.max}`);
}

writeFileSync(path.join(OUT_DIR, "jitter-before-after.json"), JSON.stringify(report, null, 2));
console.log(`\nWrote ${path.join(OUT_DIR, "jitter-before-after.json")}`);
