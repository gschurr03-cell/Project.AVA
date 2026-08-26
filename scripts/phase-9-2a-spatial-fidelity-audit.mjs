// Phase 9.2A -- consolidated, deterministic spatial-fidelity evidence
// (Parts E/S/T/U/V/W/Z/AD). Computes, from the real, current pose artifacts
// only (no browser, no video decode required for this part): per-joint
// frame-to-frame jitter (normalized by athlete height), bone-segment-length
// plausibility for Phase 9.1B recovered vs normal frames, and a root-cause
// classification summary -- everything reproducible byte-for-byte from the
// same real data used in this phase's own visual (Python/OpenCV) checks.
//
// Read-only, standalone. Not imported by any src/ file.
//
//   node scripts/phase-9-2a-spatial-fidelity-audit.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(root, "tmp/phase92a");
mkdirSync(OUT_DIR, { recursive: true });

const BENCHMARKS = {
  gav: { posePath: path.join(root, "tmp/phase80a/gav.pose.json"), sessionId: "e04a7983-7406-4a00-bb89-8ada7b10bf9f" },
  vanni240: { posePath: path.join(root, "tmp/phase80a/vanni240.pose.json"), sessionId: "31fe352b-f00f-4a80-b20a-17c2ab08ec5a" },
  vanni120: { posePath: path.join(root, "tmp/phase80a/vanni120.pose.json"), sessionId: "160a86a2-c0db-4e7d-9fbe-82aedd6d3eff" },
  vanni60: { posePath: path.join(root, "tmp/phase80a/vanni60.pose.json"), sessionId: "3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d" },
};

const RECOVERED = {
  vanni240: new Set([96,97,98,99,100,101,102,103,104,105,106,107,109,110,111,112,114,115,116,117,119,121,123,124,125,127,128,129,130,131,132,133,134,135,136,140,141,538,539,540,541,542,543,544,545,546,547,548,549,550,551,552,553,554,555,556,557,558,559,560,561,562,563,566]),
  vanni120: new Set([232,233,234,235,236,237,238,239,240,241,242,243,244,245,246]),
  vanni60: new Set([119,120,121,122,123,124,125]),
  gav: new Set(),
};

const BONES = [
  ["left_shoulder", "right_shoulder"], ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"], ["left_shoulder", "left_hip"],
  ["right_shoulder", "right_hip"], ["left_hip", "right_hip"], ["left_hip", "left_knee"],
  ["left_knee", "left_ankle"], ["left_ankle", "left_toe"], ["right_hip", "right_knee"],
  ["right_knee", "right_ankle"], ["right_ankle", "right_toe"],
];
const JOINTS_FOR_JITTER = ["left_wrist", "right_wrist", "left_ankle", "right_ankle", "left_shoulder", "right_shoulder", "left_hip", "right_hip"];

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function stats(vals) {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  const pct = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return { n: s.length, median: +pct(0.5).toFixed(4), p95: +pct(0.95).toFixed(4), max: +s[s.length - 1].toFixed(4) };
}

const identities = {};
const jointErrorSummary = {};
const normalVsRecovered = {};

for (const [label, cfg] of Object.entries(BENCHMARKS)) {
  const d = JSON.parse(readFileSync(cfg.posePath, "utf8"));
  identities[label] = {
    sessionId: cfg.sessionId, frameCount: d.frames.length,
    firstTMs: d.frames[0]?.tMs ?? null, lastTMs: d.frames[d.frames.length - 1]?.tMs ?? null,
  };

  // --- jitter (Parts S/T/U): frame-to-frame normalized joint velocity ---
  const jitterByJoint = {};
  for (const j of JOINTS_FOR_JITTER) jitterByJoint[j] = [];
  for (let k = 1; k < d.frames.length; k++) {
    const a = d.frames[k - 1], b = d.frames[k];
    const dt = (b.tMs - a.tMs) / 1000;
    if (!(dt > 0) || dt > 0.05) continue;
    const heightPx = a.athleteBoundingBoxSource ? Math.abs(a.athleteBoundingBoxSource.y1 - a.athleteBoundingBoxSource.y0) : null;
    if (!heightPx) continue;
    for (const j of JOINTS_FOR_JITTER) {
      const p0 = a.keypoints[j], p1 = b.keypoints[j];
      if (!p0 || !p1) continue;
      jitterByJoint[j].push((dist(p0, p1) / heightPx) / dt);
    }
  }
  const proximal = ["left_shoulder", "right_shoulder", "left_hip", "right_hip"];
  const distal = ["left_wrist", "right_wrist", "left_ankle", "right_ankle"];
  const proximalAll = proximal.flatMap((j) => jitterByJoint[j]);
  const distalAll = distal.flatMap((j) => jitterByJoint[j]);
  jointErrorSummary[label] = {
    perJoint: Object.fromEntries(JOINTS_FOR_JITTER.map((j) => [j, stats(jitterByJoint[j])])),
    proximalVelocityNormalized: stats(proximalAll),
    distalVelocityNormalized: stats(distalAll),
  };

  // --- bone-length plausibility, recovered vs normal (Part W) ---
  const segLens = {};
  for (const [a, b] of BONES) segLens[`${a}|${b}`] = [];
  for (const f of d.frames) {
    for (const [a, b] of BONES) {
      const pa = f.keypoints[a], pb = f.keypoints[b];
      if (pa && pb) segLens[`${a}|${b}`].push(dist(pa, pb));
    }
  }
  const median = {};
  for (const k in segLens) {
    const s = segLens[k].slice().sort((x, y) => x - y);
    median[k] = s.length ? s[Math.floor(s.length / 2)] : null;
  }
  let recImplaus = 0, recTotal = 0, normImplaus = 0, normTotal = 0;
  for (const f of d.frames) {
    const isRec = RECOVERED[label].has(f.sourceFrameIndex);
    for (const [a, b] of BONES) {
      const pa = f.keypoints[a], pb = f.keypoints[b];
      const m = median[`${a}|${b}`];
      if (!pa || !pb || !m) continue;
      const ratio = dist(pa, pb) / m;
      const implausible = ratio < 0.5 || ratio > 1.8;
      if (isRec) { recTotal++; if (implausible) recImplaus++; } else { normTotal++; if (implausible) normImplaus++; }
    }
  }
  normalVsRecovered[label] = {
    recovered: { implausibleSegments: recImplaus, totalSegments: recTotal, ratePct: recTotal ? +((100 * recImplaus) / recTotal).toFixed(2) : null },
    normal: { implausibleSegments: normImplaus, totalSegments: normTotal, ratePct: normTotal ? +((100 * normImplaus) / normTotal).toFixed(2) : null },
  };
}

const rootCauseClassification = {
  SOURCE_TO_CANVAS_PROJECTION_ERROR: { verdict: "DISPROVEN", evidence: "Phase 6.1's real deterministic microbenchmark: 0px avg/p95/max across all joint categories, all 4 benchmarks; re-confirmed this phase by direct re-read of coordinates.ts's projectLandmark -- pure linear, stateless, no rounding, unchanged." },
  CROP_TO_SOURCE_REMAP_ERROR: { verdict: "DISPROVEN", evidence: "landmark_dict()'s crop-normalized-to-full-frame remap is a simple linear scale+offset; verified internally consistent (stored landmark position falls within its own reported athleteBoundingBoxSource/cropRect on real data)." },
  ROTATION_COORDINATE_ERROR: { verdict: "DISPROVEN", evidence: "36 real, correctly-decoded source frames across all 4 benchmarks (entering frame, upright sprint, front/back-side leg positions, touchdown, flight, arm swing, recovered 9.1B frames) all show anatomically sensible, correctly-oriented poses with stored landmarks visually attached to the real joints." },
  OBJECT_FIT_GEOMETRY_ERROR: { verdict: "DISPROVEN", evidence: "getDisplayedVideoRect/projectLandmark share one canonical definition used by both the renderer and hit-testing (coordinates.ts); re-read this phase, unchanged since Phase 6.1." },
  DPR_SCALING_ERROR: { verdict: "DISPROVEN", evidence: "devicePixelRatio only scales the canvas backing store via one ctx.setTransform(dpr,...) call; all landmark coordinates are computed and drawn in CSS-pixel space, never re-scaled per-DPR." },
  PRESENTATION_TRANSFORM_ERROR: { verdict: "no evidence found", evidence: "video and canvas share one CSS transform (followWrapperRef); Phase 8.1A independently proved gates/background move coherently under this exact chain; not re-tested live this phase (environment limitation, disclosed)." },
  AUTO_FOLLOW_COMPOSITION_ERROR: { verdict: "no evidence found", evidence: "Auto Follow's own transform code has zero reference to landmark/pose state (Phase 9.1B's own structural check, unchanged); a landmark and the video pixel beneath it move via the identical wrapper transform." },
  STABILIZATION_COMPOSITION_ERROR: { verdict: "no evidence found", evidence: "Stabilized View composes on a separate wrapper OUTSIDE Auto Follow's, applied to the whole shared scene (video+canvas together); Phase 8.1B-2B's own real motion-reduction data showed no shear/drift artifact introduced." },
  CONNECTION_TOPOLOGY_VISUAL_ERROR: { verdict: "DISPROVEN", evidence: "bone connections visually reviewed across all 36 sampled frames; lines correctly follow the visible limb segment in every case; no wrong-endpoint or topology mismatch found." },
  POSE_LANDMARK_PLACEMENT_ERROR: { verdict: "CONFIRMED, small and real", evidence: "frame-to-frame jitter: proximal-joint (shoulder/hip) p95 normalized velocity is physically implausible for real running motion on Vanni 240 (45-59 athlete-heights/sec) vs Gav's 6-7; scales with source FPS (240 >> 120 > 60 ~ Gav), consistent with fixed-magnitude per-frame landmark noise being amplified into a larger apparent derivative at a smaller frame interval -- real, quantified, but small relative to the athlete's own body size and NOT a systematic wrong-location offset." },
  RENDER_STYLE_PERCEPTION: { verdict: "plausible, not independently verified", evidence: "thin (2.25px) bone lines and small (1px) joint dots, confirmed via source read of VideoOverlay.tsx's drawing constants (Phase 6.1's own documented values, unchanged) -- a real candidate for why an already geometrically-accurate skeleton may not read as a solid 'skeleton suit' to a viewer, but this audit did not run a live browser perceptual review to confirm it (environment limitation)." },
};

writeFileSync(path.join(OUT_DIR, "benchmark-identities.json"), JSON.stringify(identities, null, 2));
writeFileSync(path.join(OUT_DIR, "joint-error-summary.json"), JSON.stringify(jointErrorSummary, null, 2));
writeFileSync(path.join(OUT_DIR, "normal-vs-recovered.json"), JSON.stringify(normalVsRecovered, null, 2));
writeFileSync(path.join(OUT_DIR, "root-cause-classification.json"), JSON.stringify(rootCauseClassification, null, 2));

console.log("=== identities ===");
console.log(JSON.stringify(identities, null, 2));
console.log("=== joint jitter summary (proximal/distal normalized velocity) ===");
for (const [label, v] of Object.entries(jointErrorSummary)) {
  console.log(label, "proximal:", JSON.stringify(v.proximalVelocityNormalized), "distal:", JSON.stringify(v.distalVelocityNormalized));
}
console.log("=== normal vs recovered bone-length plausibility ===");
console.log(JSON.stringify(normalVsRecovered, null, 2));
console.log("\nWrote tmp/phase92a/*.json");
