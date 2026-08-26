// Phase 5.0A (Parts 2, 3, 4, 6, 8) — pose fidelity audit against the real,
// current production pose artifacts for all four registry benchmarks.
// Operates directly on the raw, persisted artifact JSON (the exact schema
// `pose.ts`/`MediaPipeTypes.ts` validate) — no reimplementation of any
// production algorithm, pure read-only measurement.
//
//   node scripts/phase-5-0a-landmark-audit.mjs <label> <pose.json>

import { readFileSync, writeFileSync } from "node:fs";

const label = process.argv[2];
const posePath = process.argv[3];
const d = JSON.parse(readFileSync(posePath, "utf8"));
const frames = d.frames;
const W = d.width, H = d.height;
const FPS = d.fps;

const FOOT_JOINTS = ["left_ankle", "right_ankle", "left_heel", "right_heel", "left_toe", "right_toe"];
const CANONICAL_JOINTS = [
  "nose", "left_shoulder", "right_shoulder", "left_hip", "right_hip",
  "left_knee", "right_knee", "left_ankle", "right_ankle", "left_heel", "right_heel",
  "left_toe", "right_toe", "left_elbow", "right_elbow", "left_wrist", "right_wrist",
];
const STRIP_ORIGINS = new Set(["predicted", "invalid", "frozen_suspect"]);
const VIS_FLOOR = 0.4; // AVA's own contact-detection visibility floor (steps.ts/contacts.ts)

const SEGMENTS = [
  ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
  ["left_hip", "left_knee"], ["right_hip", "right_knee"],
  ["left_knee", "left_ankle"], ["right_knee", "right_ankle"],
  ["left_ankle", "left_heel"], ["right_ankle", "right_heel"],
  ["left_heel", "left_toe"], ["right_heel", "right_toe"],
  ["left_hip", "right_hip"], ["left_shoulder", "right_shoulder"],
];

function px(kp, w, h) { return kp ? { x: kp.x * w, y: kp.y * h } : null; }
function dist(a, b) { return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null; }

// ---------- Part 2: per-frame landmark audit (foot joints) ----------
const perFrame = [];
for (const f of frames) {
  const kp = f.keypoints || {};
  const stripped = STRIP_ORIGINS.has(f.boxOrigin);
  const row = {
    sourceFrameIndex: f.sourceFrameIndex, tMs: f.tMs, boxOrigin: f.boxOrigin,
    localizationOrigin: f.localizationOrigin, strippedByGate: stripped,
  };
  for (const j of FOOT_JOINTS) {
    const k = kp[j];
    row[j] = k ? { x: k.x, y: k.y, score: k.score, visibility: k.visibility ?? k.score } : null;
  }
  const present = CANONICAL_JOINTS.filter((j) => kp[j] != null);
  row.completeness = present.length / CANONICAL_JOINTS.length;
  perFrame.push(row);
}

// ---------- Part 6: attribute foot-evidence loss to MediaPipe vs AVA gate ----------
// For each foot joint, per-frame outcome relative to the REAL contact-detection
// floor (VIS_FLOOR): mediapipe_never_produced (key absent), mediapipe_low_confidence
// (present, raw score < floor — MediaPipe's own uncertainty), ava_gate_stripped
// (present, raw score >= floor, but this frame's whole landmark set was zeroed by
// the boxOrigin predicted/invalid/frozen_suspect gate before contact detection ever
// runs — measurements.ts:548-552 / VideoOverlay.tsx:577), usable (present, score >=
// floor, not gated).
const attribution = { mediapipe_never_produced: 0, mediapipe_low_confidence: 0, ava_gate_stripped: 0, usable: 0 };
const perJointAttribution = {};
for (const j of FOOT_JOINTS) perJointAttribution[j] = { mediapipe_never_produced: 0, mediapipe_low_confidence: 0, ava_gate_stripped: 0, usable: 0 };
for (const f of frames) {
  const kp = f.keypoints || {};
  const stripped = STRIP_ORIGINS.has(f.boxOrigin);
  for (const j of FOOT_JOINTS) {
    const k = kp[j];
    let cat;
    if (!k) cat = "mediapipe_never_produced";
    else if (stripped) cat = "ava_gate_stripped";
    else if ((k.visibility ?? k.score) < VIS_FLOOR) cat = "mediapipe_low_confidence";
    else cat = "usable";
    attribution[cat] += 1;
    perJointAttribution[j][cat] += 1;
  }
}

// ---------- Part 3: skeleton accuracy proxy (bone-length plausibility) ----------
// No manual ground-truth joint annotation exists for any of these four clips
// (disclosed limitation — see report Section 4). This computes a real, objective,
// code-derived PROXY: each bone segment's pixel length should stay close to that
// segment's own clip-wide median (a moving skeleton's limb lengths do not change;
// large deviations indicate a landmark has drifted off the true joint). Only
// computed on frames whose landmarks were NOT stripped by the boxOrigin gate.
const segLengths = {};
for (const [a, b] of SEGMENTS) segLengths[`${a}->${b}`] = [];
for (const f of frames) {
  if (STRIP_ORIGINS.has(f.boxOrigin)) continue;
  const kp = f.keypoints || {};
  const w = f.sourceWidth || W, h = f.sourceHeight || H;
  for (const [a, b] of SEGMENTS) {
    const ka = kp[a], kb = kp[b];
    if (!ka || !kb) continue;
    if ((ka.visibility ?? ka.score) < VIS_FLOOR || (kb.visibility ?? kb.score) < VIS_FLOOR) continue;
    const dpx = dist(px(ka, w, h), px(kb, w, h));
    if (dpx != null) segLengths[`${a}->${b}`].push({ i: f.sourceFrameIndex, dpx });
  }
}
function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const segStats = {};
const IMPLAUSIBLE_LOW = 0.5, IMPLAUSIBLE_HIGH = 1.8; // ratio-to-median bounds a rigid bone cannot cross
let totalSegSamples = 0, totalImplausible = 0;
const implausibleFrames = [];
for (const [seg, samples] of Object.entries(segLengths)) {
  const med = median(samples.map((s) => s.dpx));
  let implausible = 0;
  for (const s of samples) {
    const ratio = med > 0 ? s.dpx / med : null;
    if (ratio != null && (ratio < IMPLAUSIBLE_LOW || ratio > IMPLAUSIBLE_HIGH)) {
      implausible += 1;
      implausibleFrames.push({ seg, frame: s.i, dpx: s.dpx, medianPx: med, ratio });
    }
  }
  segStats[seg] = {
    n: samples.length, medianPx: med,
    p10: samples.length ? [...samples.map((s) => s.dpx)].sort((a, b) => a - b)[Math.floor(samples.length * 0.1)] : null,
    p90: samples.length ? [...samples.map((s) => s.dpx)].sort((a, b) => a - b)[Math.floor(samples.length * 0.9)] : null,
    implausibleCount: implausible,
    implausibleRate: samples.length ? implausible / samples.length : null,
  };
  totalSegSamples += samples.length;
  totalImplausible += implausible;
}

// ---------- Part 4: skeleton latency (box-vs-pose cross-correlation) ----------
// Real, MEASURED lag between the localization box's own motion and the pose
// skeleton's own motion — not estimated. Uses only frames where BOTH a
// scientificAthleteBox AND a confident hip midpoint exist, in a single
// contiguous run (no cross-gap interpolation).
const latencyRows = [];
for (const f of frames) {
  const box = f.scientificAthleteBox;
  const kp = f.keypoints || {};
  const lh = kp.left_hip, rh = kp.right_hip;
  if (!box || !lh || !rh) continue;
  if ((lh.visibility ?? lh.score) < VIS_FLOOR || (rh.visibility ?? rh.score) < VIS_FLOOR) continue;
  const w = f.sourceWidth || W, h = f.sourceHeight || H;
  const torsoX = ((lh.x + rh.x) / 2) * w;
  const torsoY = ((lh.y + rh.y) / 2) * h;
  const boxCx = (box.x + box.width / 2) * w;
  const boxCy = (box.y + box.height / 2) * h;
  latencyRows.push({ i: f.sourceFrameIndex, tMs: f.tMs, torsoX, torsoY, boxCx, boxCy });
}
function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  const ma = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const mb = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : null;
}
// Build velocity series only across strictly-consecutive source frames (a real
// gap must never be bridged as if it were a real, measured velocity sample).
const velTorsoX = [], velBoxX = [];
for (let k = 1; k < latencyRows.length; k++) {
  const a = latencyRows[k - 1], b = latencyRows[k];
  if (b.i !== a.i + 1) continue;
  velTorsoX.push(b.torsoX - a.torsoX);
  velBoxX.push(b.boxCx - a.boxCx);
}
const MAX_LAG = 8;
let bestLag = 0, bestCorr = -Infinity;
const lagCorrs = {};
for (let lag = -MAX_LAG; lag <= MAX_LAG; lag++) {
  let a, b;
  if (lag >= 0) { a = velTorsoX.slice(lag); b = velBoxX.slice(0, velBoxX.length - lag); }
  else { a = velTorsoX.slice(0, velTorsoX.length + lag); b = velBoxX.slice(-lag); }
  const c = pearson(a, b);
  lagCorrs[lag] = c;
  if (c != null && c > bestCorr) { bestCorr = c; bestLag = lag; }
}
const meanOffsetPxAtZero = latencyRows.length ? latencyRows.reduce((s, r) => s + (r.torsoX - r.boxCx), 0) / latencyRows.length : null;
const meanAbsOffsetPxAtZero = latencyRows.length ? latencyRows.reduce((s, r) => s + Math.abs(r.torsoX - r.boxCx), 0) / latencyRows.length : null;

// ---------- Part 8: developer-only pose quality score (interpretable, not opaque) ----------
// Each component is documented and independently inspectable — never a hidden
// weighted ML score. All components are in [0,1]; overall = unweighted mean of
// the 7 components below (equal weighting, disclosed, not tuned to any target).
const qualityRows = [];
let prevTorso = null;
const torsoVelocities = [];
for (const f of frames) {
  const kp = f.keypoints || {};
  const lh = kp.left_hip, rh = kp.right_hip;
  let torso = null;
  if (lh && rh && (lh.visibility ?? lh.score) >= VIS_FLOOR && (rh.visibility ?? rh.score) >= VIS_FLOOR) {
    torso = { x: (lh.x + rh.x) / 2 * (f.sourceWidth || W), y: (lh.y + rh.y) / 2 * (f.sourceHeight || H) };
  }
  let jitter = null;
  if (torso && prevTorso) jitter = Math.hypot(torso.x - prevTorso.x, torso.y - prevTorso.y);
  if (torso) prevTorso = torso;
  if (jitter != null) torsoVelocities.push(jitter);
}
const medianTorsoVel = median(torsoVelocities) || 1;
prevTorso = null;
for (const f of frames) {
  const kp = f.keypoints || {};
  const stripped = STRIP_ORIGINS.has(f.boxOrigin);
  const ankles = ["left_ankle", "right_ankle"].map((j) => kp[j]).filter((k) => k && !stripped);
  const feet = FOOT_JOINTS.map((j) => kp[j]).filter((k) => k && !stripped);
  const present = CANONICAL_JOINTS.filter((j) => kp[j] != null && !stripped);
  const ankleCertainty = ankles.length ? ankles.reduce((s, k) => s + (k.visibility ?? k.score), 0) / ankles.length : 0;
  const footCertainty = feet.length ? feet.reduce((s, k) => s + (k.visibility ?? k.score), 0) / feet.length : 0;
  const completeness = present.length / CANONICAL_JOINTS.length;
  const lh = kp.left_hip, rh = kp.right_hip;
  let torso = null;
  if (!stripped && lh && rh && (lh.visibility ?? lh.score) >= VIS_FLOOR && (rh.visibility ?? rh.score) >= VIS_FLOOR) {
    torso = { x: (lh.x + rh.x) / 2 * (f.sourceWidth || W), y: (lh.y + rh.y) / 2 * (f.sourceHeight || H) };
  }
  let stability = null;
  if (torso && prevTorso) {
    const v = Math.hypot(torso.x - prevTorso.x, torso.y - prevTorso.y);
    stability = Math.max(0, 1 - Math.abs(v - medianTorsoVel) / (3 * medianTorsoVel));
  }
  if (torso) prevTorso = torso;
  // Limb continuity / anatomical plausibility for THIS frame: fraction of
  // measurable segments within the clip-wide plausible ratio band.
  let segOk = 0, segTotal = 0;
  if (!stripped) {
    const w = f.sourceWidth || W, h = f.sourceHeight || H;
    for (const [a, b] of SEGMENTS) {
      const ka = kp[a], kb = kp[b];
      if (!ka || !kb) continue;
      if ((ka.visibility ?? ka.score) < VIS_FLOOR || (kb.visibility ?? kb.score) < VIS_FLOOR) continue;
      const dpx = dist(px(ka, w, h), px(kb, w, h));
      const med = segStats[`${a}->${b}`]?.medianPx;
      if (dpx == null || !med) continue;
      segTotal += 1;
      if (dpx / med >= IMPLAUSIBLE_LOW && dpx / med <= IMPLAUSIBLE_HIGH) segOk += 1;
    }
  }
  const limbContinuity = segTotal > 0 ? segOk / segTotal : null;
  const landmarkPersistence = stripped ? 0 : (present.length > 0 ? 1 : 0);
  const contactReadinessL = !stripped && ["left_ankle", "left_heel", "left_toe"].every((j) => kp[j] && (kp[j].visibility ?? kp[j].score) >= VIS_FLOOR) ? 1 : 0;
  const contactReadinessR = !stripped && ["right_ankle", "right_heel", "right_toe"].every((j) => kp[j] && (kp[j].visibility ?? kp[j].score) >= VIS_FLOOR) ? 1 : 0;
  const contactReadiness = (contactReadinessL + contactReadinessR) / 2;
  const components = { ankleCertainty, footCertainty, completeness, stability, limbContinuity, landmarkPersistence, contactReadiness };
  const usable = Object.values(components).filter((v) => v != null);
  const overall = usable.length ? usable.reduce((s, v) => s + v, 0) / usable.length : 0;
  qualityRows.push({ i: f.sourceFrameIndex, tMs: f.tMs, boxOrigin: f.boxOrigin, ...components, overall });
}
function meanOf(rows, key) {
  const vals = rows.map((r) => r[key]).filter((v) => v != null);
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}

const summary = {
  label, posePath, frameCount: frames.length, fps: FPS, width: W, height: H,
  part2_footJointCompleteness: Object.fromEntries(FOOT_JOINTS.map((j) => [
    j, { presentFrames: frames.filter((f) => f.keypoints?.[j]).length, meanScoreWhenPresent: meanOf(frames.map((f) => ({ v: f.keypoints?.[j] ? (f.keypoints[j].visibility ?? f.keypoints[j].score) : null })), "v") },
  ])),
  part3_boneLengthPlausibility: { totalSegmentSamples: totalSegSamples, implausibleCount: totalImplausible, implausibleRate: totalSegSamples ? totalImplausible / totalSegSamples : null, perSegment: segStats, worstImplausibleExamples: implausibleFrames.sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio))).slice(0, 10) },
  part4_skeletonLatency: {
    usableFramePairs: velTorsoX.length, bestLagFrames: bestLag, bestLagMs: bestLag * (1000 / FPS), bestLagCorrelation: bestCorr,
    zeroLagCorrelation: lagCorrs[0], lagCorrelations: lagCorrs,
    meanOffsetPxAtZeroLag: meanOffsetPxAtZero, meanAbsOffsetPxAtZeroLag: meanAbsOffsetPxAtZero,
    meanOffsetFrameWidthsAtZeroLag: meanOffsetPxAtZero != null ? meanOffsetPxAtZero / W : null,
  },
  part6_footEvidenceAttribution: { overall: attribution, perJoint: perJointAttribution },
  part8_poseQualityScore: {
    meanOverall: meanOf(qualityRows, "overall"),
    meanAnkleCertainty: meanOf(qualityRows, "ankleCertainty"),
    meanFootCertainty: meanOf(qualityRows, "footCertainty"),
    meanCompleteness: meanOf(qualityRows, "completeness"),
    meanStability: meanOf(qualityRows, "stability"),
    meanLimbContinuity: meanOf(qualityRows, "limbContinuity"),
    meanLandmarkPersistence: meanOf(qualityRows, "landmarkPersistence"),
    meanContactReadiness: meanOf(qualityRows, "contactReadiness"),
    worstFrames: [...qualityRows].sort((a, b) => a.overall - b.overall).slice(0, 10).map((r) => ({ i: r.i, overall: r.overall.toFixed(3), boxOrigin: r.boxOrigin })),
  },
};

console.log(JSON.stringify(summary, null, 2));
writeFileSync(`tmp/phase50a-${label}-full.json`, JSON.stringify({ summary, perFrame, qualityRows, latencyRows }, null, 2));
