// Phase 5.0C (Parts B, C) — contact-readiness timelines for all four
// benchmarks, plus a full missing-foot-sample taxonomy for Vanni 240.
// Operates on the real, current Phase 5.0B production artifacts — no
// reimplementation of any production algorithm.
//
//   node scripts/phase-5-0c-contact-readiness-audit.mjs <label> <pose.json>

import { readFileSync, writeFileSync } from "node:fs";

const label = process.argv[2];
const posePath = process.argv[3];
const d = JSON.parse(readFileSync(posePath, "utf8"));
const W = d.width, H = d.height, FPS = d.fps;
const frames = d.frames;

const VIS_FLOOR = 0.4;
const STRIP_ORIGINS = new Set(["predicted", "invalid", "frozen_suspect"]);
const SIDES = {
  left: ["left_ankle", "left_heel", "left_toe"],
  right: ["right_ankle", "right_heel", "right_toe"],
};

function localizationVerifiedFrame(f) {
  // Part B/C taxonomy uses AVA's own EXISTING, already-established
  // scientific-eligibility contract (measurements.ts:548 / VideoOverlay.tsx:577,
  // unmodified since Phase 4.2C): a frame is eligible unless boxOrigin is
  // predicted/invalid/frozen_suspect. `tracked` IS eligible by this
  // existing contract, even for a degenerate/off-frame box (Part A's own
  // finding — frame 964 is `tracked`, eligible by today's rule, and that
  // is PRECISELY the real gap this phase's own secondary-recovery
  // eligibility contract (Part D, a NEW, stricter gate) must not inherit).
  return !STRIP_ORIGINS.has(f.boxOrigin);
}

function coastRiskElevated(f) {
  // A SEPARATE, stricter signal — used only by Part D's own new secondary-
  // recovery eligibility contract, never by Part B/C's taxonomy (which
  // must reflect today's real, established system, not a new one).
  return f.localizationVerified === false && f.coastRiskState && f.coastRiskState !== "recently_confirmed" && f.coastRiskState !== "normal_coast" && f.coastRiskState !== "corroborated_long_coast";
}

// ---------- Part B: contact-readiness timeline ----------
function classifyReadiness(f, side) {
  const kp = f.keypoints || {};
  const joints = SIDES[side];
  const stripped = STRIP_ORIGINS.has(f.boxOrigin);
  if (stripped || !kp || Object.keys(kp).length === 0) return "contact_pose_unavailable";
  const locVerified = localizationVerifiedFrame(f);
  if (!locVerified) return "contact_localization_unverified";
  if (f.identityContinuityScore != null && f.identityContinuityScore < 0.5) return "contact_identity_uncertain";
  if (f.cropContainmentState === "crop_extremity_clipped" || f.cropContainmentState === "crop_foot_at_risk") return "contact_crop_at_risk";
  const present = joints.filter((j) => kp[j] && (kp[j].visibility ?? kp[j].score) >= VIS_FLOOR);
  if (present.length === 3) return "contact_ready";
  if (present.length > 0) return "contact_partially_ready";
  return "contact_landmark_missing";
}

const readinessRows = [];
for (const f of frames) {
  const kp = f.keypoints || {};
  const row = { i: f.sourceFrameIndex, tMs: f.tMs, boxOrigin: f.boxOrigin };
  for (const side of ["left", "right"]) {
    const joints = SIDES[side];
    const present = joints.map((j) => !!(kp[j] && (kp[j].visibility ?? kp[j].score) >= VIS_FLOOR));
    row[side] = {
      ankleAvailable: present[0], heelAvailable: present[1], footIndexAvailable: present[2],
      allThreeAvailable: present.every(Boolean),
      state: classifyReadiness(f, side),
    };
  }
  row.localizationVerified = localizationVerifiedFrame(f);
  row.coastRiskElevated = coastRiskElevated(f);
  row.cropContainmentState = f.cropContainmentState ?? null;
  readinessRows.push(row);
}

function countStates(side) {
  const c = {};
  for (const r of readinessRows) { const s = r[side].state; c[s] = (c[s] ?? 0) + 1; }
  return c;
}
const part_b_summary = {
  frameCount: frames.length,
  left: countStates("left"),
  right: countStates("right"),
};

// ---------- Part C: missing-foot-sample taxonomy (Vanni 240 only, but
// computed generically so it can run against any benchmark for cross-check). ----------
const CATEGORIES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
function boneLenPx(kp, a, b, w, h) {
  const ka = kp[a], kb = kp[b];
  if (!ka || !kb) return null;
  return Math.hypot((ka.x - kb.x) * w, (ka.y - kb.y) * h);
}
// Clip-wide median shin length (knee->ankle), per side, for anatomical checks.
function medianShin(side) {
  const vals = [];
  for (const f of frames) {
    if (STRIP_ORIGINS.has(f.boxOrigin)) continue;
    const kp = f.keypoints || {};
    const w = f.sourceWidth || W, h = f.sourceHeight || H;
    const v = boneLenPx(kp, `${side}_knee`, `${side}_ankle`, w, h);
    if (v != null) vals.push(v);
  }
  vals.sort((a, b) => a - b);
  return vals.length ? vals[Math.floor(vals.length / 2)] : null;
}
const medianShinLeft = medianShin("left");
const medianShinRight = medianShin("right");

const taxonomyCounts = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0, I: 0, J: 0 };
const taxonomyExamples = { A: [], B: [], C: [], D: [], E: [], F: [], G: [], H: [], I: [], J: [] };
let totalSamples = 0;

for (const f of frames) {
  const kp = f.keypoints || {};
  const w = f.sourceWidth || W, h = f.sourceHeight || H;
  for (const side of ["left", "right"]) {
    for (const jointSuffix of ["ankle", "heel", "toe"]) {
      const joint = `${side}_${jointSuffix}`;
      totalSamples += 1;
      const k = kp[joint];
      const present = !!k;
      const passesVis = present && (k.visibility ?? k.score) >= VIS_FLOOR;

      // G. Localization scientifically unverified — checked FIRST, the most
      // fundamental gate; a missing/low sample here is never attributable
      // to a later-stage cause.
      if (!localizationVerifiedFrame(f)) {
        taxonomyCounts.G += present && passesVis ? 0 : 1;
        if (present && passesVis) { /* landmark exists despite unverified localization — not a "missing" sample at all; falls through below */ } else {
          if (taxonomyExamples.G.length < 5) taxonomyExamples.G.push(f.sourceFrameIndex);
          continue;
        }
      }
      if (present && passesVis) continue; // not a missing sample

      // H. Pose/crop frame provenance mismatch.
      if (f.cropSourceFrameIndex != null && f.poseSourceFrameIndex != null && f.cropSourceFrameIndex !== f.poseSourceFrameIndex) {
        taxonomyCounts.H += 1;
        if (taxonomyExamples.H.length < 5) taxonomyExamples.H.push(f.sourceFrameIndex);
        continue;
      }

      // A. Foot outside source image — the localization box itself is
      // beyond the frame boundary (real, direct evidence: box edge < 0 or
      // > 1 in normalized source space).
      const box = f.scientificAthleteBox;
      const boxOffImage = box && (box.x < -0.02 || box.y < -0.02 || box.x + box.width > 1.02 || box.y + box.height > 1.02);
      if (boxOffImage) {
        taxonomyCounts.A += 1;
        if (taxonomyExamples.A.length < 5) taxonomyExamples.A.push(f.sourceFrameIndex);
        continue;
      }

      // B. Foot outside scientific crop (crop-normalized position outside
      // [0,1], or the containment classifier already flagged extremity
      // clipping/foot-at-risk for this frame).
      const cropRect = f.cropRect;
      let clippedByCrop = false;
      if (present && cropRect) {
        const cnx = cropRect.x1 > cropRect.x0 ? (k.x - cropRect.x0) / (cropRect.x1 - cropRect.x0) : 0.5;
        const cny = cropRect.y1 > cropRect.y0 ? (k.y - cropRect.y0) / (cropRect.y1 - cropRect.y0) : 0.5;
        clippedByCrop = cnx < 0 || cnx > 1 || cny < 0 || cny > 1;
      }
      if (!present && (f.cropContainmentState === "crop_extremity_clipped")) {
        taxonomyCounts.B += 1;
        if (taxonomyExamples.B.length < 5) taxonomyExamples.B.push(f.sourceFrameIndex);
        continue;
      }
      if (present && clippedByCrop) {
        taxonomyCounts.B += 1;
        if (taxonomyExamples.B.length < 5) taxonomyExamples.B.push(f.sourceFrameIndex);
        continue;
      }

      // D. Present but fails the visibility/confidence integrity gate.
      if (present && !passesVis) {
        taxonomyCounts.D += 1;
        if (taxonomyExamples.D.length < 5) taxonomyExamples.D.push(f.sourceFrameIndex);
        continue;
      }

      // E. Landmark exists (and passes vis) but anatomical validity would
      // reject it (only reachable if present+passesVis, i.e. never for a
      // truly ABSENT landmark — included for completeness/cross-check).
      if (present && passesVis) {
        const shin = boneLenPx(kp, `${side}_knee`, `${side}_ankle`, w, h);
        const medianShinRef = side === "left" ? medianShinLeft : medianShinRight;
        if (shin != null && medianShinRef && (shin / medianShinRef < 0.4 || shin / medianShinRef > 2.2)) {
          taxonomyCounts.E += 1;
          if (taxonomyExamples.E.length < 5) taxonomyExamples.E.push(f.sourceFrameIndex);
          continue;
        }
      }

      // F. Temporal continuity rejection — AVA's primary pass performs NO
      // explicit temporal landmark rejection today (confirmed: no such
      // stage exists in mediapipe_pose_runner.py's pass-2 loop — Phase
      // 5.0A's own audit). Structurally 0 in the CURRENT baseline;
      // included for completeness against the task's own required
      // category list.
      // (never reached for an absent landmark — no code path assigns it)

      // I. Left/right identity ambiguous — approximated via
      // skeletonOwnershipRatio when available (a real, already-computed
      // per-point ownership signal from Phase 4.2I); a low value on an
      // otherwise-absent landmark suggests ownership confusion rather than
      // simple absence.
      if (!present && f.skeletonOwnershipRatio != null && f.skeletonOwnershipRatio < 0.3) {
        taxonomyCounts.I += 1;
        if (taxonomyExamples.I.length < 5) taxonomyExamples.I.push(f.sourceFrameIndex);
        continue;
      }

      // C. Inside crop (per the crop-normalized check above, not flagged
      // as clipped) but MediaPipe simply produced no landmark at all.
      if (!present) {
        taxonomyCounts.C += 1;
        if (taxonomyExamples.C.length < 5) taxonomyExamples.C.push(f.sourceFrameIndex);
        continue;
      }

      // J. Other / unclassified.
      taxonomyCounts.J += 1;
      if (taxonomyExamples.J.length < 5) taxonomyExamples.J.push(f.sourceFrameIndex);
    }
  }
}

const totalMissing = Object.values(taxonomyCounts).reduce((a, b) => a + b, 0);
const taxonomyPct = {};
for (const cat of CATEGORIES) taxonomyPct[cat] = totalMissing ? +((taxonomyCounts[cat] / totalMissing) * 100).toFixed(2) : 0;

const output = {
  label, posePath, frameCount: frames.length,
  part_b: part_b_summary,
  part_c: { totalFootJointSamples: totalSamples, totalMissing, counts: taxonomyCounts, percentages: taxonomyPct, examples: taxonomyExamples },
};
console.log(JSON.stringify(output, null, 2));
writeFileSync(`tmp/phase50c-${label}-readiness.json`, JSON.stringify({ ...output, readinessRows }, null, 2));
