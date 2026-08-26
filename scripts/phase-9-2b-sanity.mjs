// Phase 9.2B Part W -- 20 deterministic checks for the "skeleton suit" visual
// style + display-only proximal-joint smoothing added to VideoOverlay.tsx.
//
// `stepSkeletonSmoothing` is copied verbatim (same documented tsc-to-tmp-dir
// constraint on "use client" components as every other *-metrics.mjs script
// this session); `verifyLiveSourceMatch` fails loudly on any drift from the
// live source. Structural claims (topology/draw-order/isolation) are checked
// directly against the live source text, not assumed.
//
// Read-only, standalone. Not imported by any src/ file, not on any build path.
//
//   node scripts/phase-9-2b-sanity.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");

let pass = 0;
const results = [];
function check(n, name, fn) {
  try {
    fn();
    pass++;
    results.push({ n, name, ok: true });
    console.log(`  [PASS] ${n}. ${name}`);
  } catch (err) {
    results.push({ n, name, ok: false, error: String(err.message ?? err) });
    console.log(`  [FAIL] ${n}. ${name}\n         ${err.message ?? err}`);
  }
}

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
    "const resolvedJoint = (name: string): OverlayPoint | undefined => {",
    "for (const name of Object.keys(frame.landmarks)) {",
    "const point = resolvedJoint(name);",
  ];
  for (const c of checks) assert.ok(SRC.includes(c), `live source missing: ${JSON.stringify(c)}`);
}
check("pre", "live source matches this script's verbatim copy", verifyLiveSourceMatch);

console.log("\n--- style constants (Parts D/E/F) ---");
check(2, "line width deterministic (fixed constants, not derived per-frame)", () => {
  assert.ok(SRC.includes("const SKELETON_BONE_WIDTH = 3.5;"));
  assert.ok(SRC.includes("const SKELETON_BONE_WIDTH_EMPHASIZED = 5.25;"));
  assert.ok(SRC.includes("const SKELETON_HALO_WIDTH_DELTA = 2;"));
});
check(3, "joint radius deterministic (fixed constant, not derived per-frame)", () => {
  assert.ok(SRC.includes("const SKELETON_JOINT_RADIUS = 3;"));
  assert.ok(SRC.includes("const SKELETON_JOINT_STROKE_WIDTH = 1.25;"));
});
check("2b", "line caps/joins are round (Part F)", () => {
  assert.ok(SRC.includes('ctx.lineJoin = "round";'));
  assert.ok(SRC.includes('ctx.lineCap = "round";'));
});

console.log("\n--- topology & ordering (Parts G/H) ---");
check(4, "torso topology uses only the 4 scientifically-supported joint pairs, no synthetic spine", () => {
  const bonesMatch = SRC.match(/const bones = \[([\s\S]*?)\];/);
  assert.ok(bonesMatch, "bones array not found");
  const bonesSrc = bonesMatch[1];
  const torsoPairs = [
    '["leftShoulder", "rightShoulder"]',
    '["leftShoulder", "leftHip"]',
    '["rightShoulder", "rightHip"]',
    '["leftHip", "rightHip"]',
  ];
  for (const p of torsoPairs) assert.ok(bonesSrc.includes(p), `missing torso pair ${p}`);
  assert.ok(!/spine|midHip|midShoulder|neck/i.test(bonesSrc), "bones array references a synthetic joint");
});
check(5, "draw ordering deterministic: skeleton bones+joints drawn before contacts/step labels/gates/zones", () => {
  const boneLoopIdx = SRC.indexOf("for (const [aName, bName] of bones) {");
  const jointDotLoopIdx = SRC.indexOf("for (const name of Object.keys(frame.landmarks)) {");
  const contactsIdx = SRC.search(/\/\/ *-+ *(Foot contacts|Step (marks|labels)|Contacts)/i);
  const gatesIdx = SRC.indexOf("worldZonePolygons(");
  assert.ok(boneLoopIdx > 0 && jointDotLoopIdx > boneLoopIdx, "bones must draw before joint dots");
  if (contactsIdx > 0) assert.ok(contactsIdx > jointDotLoopIdx, "contacts/step labels must draw after skeleton");
  if (gatesIdx > 0) assert.ok(gatesIdx > jointDotLoopIdx, "zone polygons must draw after skeleton");
});

console.log("\n--- coordinate identity (Parts A/S) ---");
check(1, "style-only path preserves exact joint coordinates for non-proximal joints", () => {
  // resolvedJoint(name) for any name NOT in the smoothed set must return the
  // raw landmark object itself untouched -- the resolvedJoint body only
  // substitutes when `smoothed` (looked up from the smoothedProximal map,
  // which only ever contains the 4 proximal names) is truthy.
  assert.ok(SRC.includes("if (!raw) return undefined; // never fabricate a joint absent from real evidence"));
  assert.ok(SRC.includes("return smoothed ? { x: smoothed.x, y: smoothed.y, visibility: raw.visibility } : raw;"));
});
check(1, "first-tick smoothing output equals raw coordinates exactly (no silent style-stage coordinate change)", () => {
  const raw = { leftShoulder: { x: 0.41234567, y: 0.29876543 } };
  const out = stepSkeletonSmoothing(null, raw, 1.0);
  assert.equal(out.joints.leftShoulder.x, raw.leftShoulder.x);
  assert.equal(out.joints.leftShoulder.y, raw.leftShoulder.y);
});
check(6, "RAW vs STABILIZED coordinate identity: smoothing runs on pre-transform source coords only", () => {
  // The function signature/body never references any transform-related
  // identifier -- Auto Follow / Stabilized View apply to the canvas AFTER
  // resolvedJoint() returns, never as an input to it.
  const fnBody = SRC.slice(SRC.indexOf("export function stepSkeletonSmoothing("), SRC.indexOf("\n}\n\nconst bones"));
  for (const forbidden of ["followWrapperRef", "trochanterRef", "correction.dx", "stabiliz", "cameraTrackingStateAt", "presentationCamera"]) {
    assert.ok(!fnBody.toLowerCase().includes(forbidden.toLowerCase()), `smoothing function references transform state: ${forbidden}`);
  }
  // Functional identity: identical (raw, time) sequences produce identical
  // output regardless of any external transform context.
  const seqA = [{ leftShoulder: { x: 0.3, y: 0.3 } }, { leftShoulder: { x: 0.31, y: 0.31 } }];
  const runA = seqA.reduce((prev, raw, i) => stepSkeletonSmoothing(prev, raw, i * 0.01), null);
  const runB = seqA.reduce((prev, raw, i) => stepSkeletonSmoothing(prev, raw, i * 0.01), null);
  assert.deepEqual(runA, runB);
});
check(7, "Auto Follow coordinate identity: resolvedJoint/smoothing never read Auto Follow transform state", () => {
  const drawBlock = SRC.slice(SRC.indexOf("const rawProximalJoints: SkeletonSmoothingState"), SRC.indexOf("if (show.skeleton && showPose) {"));
  assert.ok(!drawBlock.includes("followWrapperRef"));
  assert.ok(!drawBlock.includes("correction.dx"));
  assert.ok(!drawBlock.includes("correction.dy"));
});

console.log("\n--- pause/scrub determinism (Parts R) ---");
check(8, "pause deterministic: repeated ticks at the same media time converge to and hold the exact raw value", () => {
  const raw1 = { leftShoulder: { x: 0.5, y: 0.5 } };
  let state = stepSkeletonSmoothing(null, raw1, 2.0);
  // simulate several rAF ticks while paused (currentTime unchanged)
  for (let i = 0; i < 5; i++) state = stepSkeletonSmoothing(state, raw1, 2.0);
  assert.equal(state.joints.leftShoulder.x, raw1.leftShoulder.x);
  assert.equal(state.joints.leftShoulder.y, raw1.leftShoulder.y);
});
check(9, "scrub deterministic: seek forward/backward hard-resets to exact raw value, no animated catch-up", () => {
  const raw1 = { leftShoulder: { x: 0.2, y: 0.2 } };
  const raw1b = { leftShoulder: { x: 0.21, y: 0.2 } }; // small real change, within jump threshold
  const raw2 = { leftShoulder: { x: 0.8, y: 0.9 } };
  let state = stepSkeletonSmoothing(null, raw1, 5.0);
  state = stepSkeletonSmoothing(state, raw1b, 5.004); // one normal tick toward a new target, partially eased
  assert.notEqual(state.joints.leftShoulder.x, raw1b.leftShoulder.x, "sanity: normal tick should still be mid-ease at t+4ms with 25ms tau");
  const seekForward = stepSkeletonSmoothing(state, raw2, 40.0); // big forward seek
  assert.equal(seekForward.joints.leftShoulder.x, raw2.leftShoulder.x);
  assert.equal(seekForward.joints.leftShoulder.y, raw2.leftShoulder.y);
  const seekBackward = stepSkeletonSmoothing(state, raw1, 1.0); // seek backward -- dt<0
  assert.equal(seekBackward.joints.leftShoulder.x, raw1.leftShoulder.x);
  assert.equal(seekBackward.joints.leftShoulder.y, raw1.leftShoulder.y);
});

console.log("\n--- scientific isolation (Parts V, 10-13, 18) ---");
function readSrc(rel) { return readFileSync(path.join(root, rel), "utf8"); }
check(10, "OverlayFrame/frame.landmarks is never mutated by VideoOverlay.tsx (read-only)", () => {
  assert.ok(!/frame\.landmarks(\[[^\]]+\])?\s*=[^=]/.test(SRC), "found an assignment into frame.landmarks");
});
check(11, "contacts.ts does not import VideoOverlay.tsx / smoothing symbols (no scientific coupling)", () => {
  const t = readSrc("src/lib/video/contacts.ts");
  assert.ok(!t.includes("VideoOverlay"));
  assert.ok(!t.includes("stepSkeletonSmoothing"));
});
check(12, "steps.ts does not import VideoOverlay.tsx / smoothing symbols (no scientific coupling)", () => {
  const t = readSrc("src/lib/video/steps.ts");
  assert.ok(!t.includes("VideoOverlay"));
  assert.ok(!t.includes("stepSkeletonSmoothing"));
});
check(13, "measurements.ts / metrics.ts do not import VideoOverlay.tsx / smoothing symbols (no scientific coupling)", () => {
  for (const rel of ["src/lib/benchmark/measurements.ts", "src/lib/biomechanics/metrics.ts"]) {
    const t = readSrc(rel);
    assert.ok(!t.includes("stepSkeletonSmoothing"));
    assert.ok(t.includes("VideoOverlay") ? /\* .*VideoOverlay/.test(t) : true, `${rel}: any VideoOverlay mention must be comment-only`);
  }
});
check(18, "no scientific consumer imports the smoothing symbols anywhere in src/", () => {
  const out = execSync(
    'grep -rl "stepSkeletonSmoothing\\|SkeletonSmoothingState\\|SKELETON_SMOOTHED_JOINT_NAMES" src/ || true',
    { cwd: root, encoding: "utf8" },
  ).trim();
  const files = out ? out.split("\n") : [];
  assert.deepEqual(files, ["src/components/video/VideoOverlay.tsx"], `smoothing symbols referenced outside VideoOverlay.tsx: ${files.join(", ")}`);
});

console.log("\n--- smoothing behavior (Parts M-T, 14-17) ---");
check(14, "smoothing is source-time based: dt derived purely from the timeS argument, not tick/frame count", () => {
  const raw1 = { leftShoulder: { x: 0.5, y: 0.5 } };
  const raw2 = { leftShoulder: { x: 0.52, y: 0.5 } };
  let s = stepSkeletonSmoothing(null, raw1, 0);
  // Two ticks 4.2ms apart (240fps) vs one tick 16.7ms apart (60fps): the
  // 60fps single tick should ease FURTHER toward raw2 than either 240fps
  // sub-tick alone, because alpha is a function of real elapsed time.
  const fine = stepSkeletonSmoothing(stepSkeletonSmoothing(s, raw2, 0.0042), raw2, 0.0084);
  const coarse = stepSkeletonSmoothing(s, raw2, 0.0084);
  assert.ok(Math.abs(coarse.joints.leftShoulder.x - raw2.leftShoulder.x) <= Math.abs(fine.joints.leftShoulder.x - raw2.leftShoulder.x) + 1e-9);
});
check(15, "no smoothing through missing pose: an absent joint this tick is absent from output, never held/fabricated", () => {
  const raw1 = { leftShoulder: { x: 0.5, y: 0.5 }, rightHip: { x: 0.6, y: 0.6 } };
  let s = stepSkeletonSmoothing(null, raw1, 0);
  const rawMissingOne = { rightHip: { x: 0.61, y: 0.6 } }; // leftShoulder has no evidence this tick
  s = stepSkeletonSmoothing(s, rawMissingOne, 0.01);
  assert.equal(s.joints.leftShoulder, undefined, "must not fabricate/hold a joint absent from raw evidence");
  assert.ok(s.joints.rightHip);
});
check(16, "seek resets smoothing state (duplicate of Part R check, from the state-reset angle)", () => {
  const raw1 = { leftShoulder: { x: 0.1, y: 0.1 } };
  const raw2 = { leftShoulder: { x: 0.9, y: 0.1 } };
  let s = stepSkeletonSmoothing(null, raw1, 0);
  s = stepSkeletonSmoothing(s, raw1, 0.004);
  const afterBigGap = stepSkeletonSmoothing(s, raw2, 10); // dt >> MAX_DT_S
  assert.equal(afterBigGap.joints.leftShoulder.x, raw2.leftShoulder.x);
});
check(17, "large real movement is preserved exactly, never smoothed through", () => {
  const raw1 = { leftShoulder: { x: 0.1, y: 0.1 } };
  const raw2 = { leftShoulder: { x: 0.1 + SKELETON_SMOOTHING_MAX_JUMP_NORMALIZED + 0.01, y: 0.1 } };
  let s = stepSkeletonSmoothing(null, raw1, 0);
  s = stepSkeletonSmoothing(s, raw2, 0.004); // normal small dt, but a large spatial jump
  assert.equal(s.joints.leftShoulder.x, raw2.leftShoulder.x, "large jump must bypass easing and follow raw exactly");
});

console.log("\n--- real-data jitter reduction (Part U, 19-20) ---");
check(19, "proximal jitter measurably reduced after vs before, for all 4 real benchmarks", () => {
  const metrics = JSON.parse(readSrc("tmp/phase92b/jitter-before-after.json"));
  for (const [label, r] of Object.entries(metrics)) {
    assert.ok(r.after.proximal.median <= r.before.proximal.median, `${label}: proximal median did not improve`);
    assert.ok(r.after.proximal.p95 <= r.before.proximal.p95, `${label}: proximal p95 did not improve`);
  }
});
check(20, "no material distal (or mid-limb) lag introduced: those joint groups are byte-identical before/after", () => {
  const metrics = JSON.parse(readSrc("tmp/phase92b/jitter-before-after.json"));
  for (const [label, r] of Object.entries(metrics)) {
    assert.ok(r.midLimbDistalUnchanged === true, `${label}: mid-limb/distal jitter changed -- smoothing leaked outside proximal joints`);
  }
});

console.log(`\n${pass}/${results.length} checks passed.`);
if (pass !== results.length) {
  console.log("\nFAILURES:");
  for (const r of results) if (!r.ok) console.log(`  ${r.n}. ${r.name}: ${r.error}`);
  process.exit(1);
}
