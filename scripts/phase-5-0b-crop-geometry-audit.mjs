// Phase 5.0B (Parts B, C, D) — real crop-geometry audit against the current
// production pose artifacts for all four registry benchmarks. Operates
// directly on the raw, persisted artifact JSON (cropRect, scientificAthleteBox,
// athleteBoundingBoxSource, keypoints) — no reimplementation of any
// production algorithm, pure read-only measurement.
//
//   node scripts/phase-5-0b-crop-geometry-audit.mjs <label> <pose.json>

import { readFileSync, writeFileSync } from "node:fs";

const label = process.argv[2];
const posePath = process.argv[3];
const d = JSON.parse(readFileSync(posePath, "utf8"));
const frames = d.frames;
const W = d.width, H = d.height;
const FPS = d.fps;

const JOINTS = [
  "nose", "left_wrist", "right_wrist", "left_hip", "right_hip",
  "left_knee", "right_knee", "left_ankle", "right_ankle",
  "left_heel", "right_heel", "left_toe", "right_toe",
];
const FOOT_JOINTS = ["left_ankle", "right_ankle", "left_heel", "right_heel", "left_toe", "right_toe"];
const STRIP_ORIGINS = new Set(["predicted", "invalid", "frozen_suspect"]);
const VIS_FLOOR = 0.4;

function px(kp, w, h) { return kp ? { x: kp.x * w, y: kp.y * h } : null; }
function boxCenterFromXYWH(b, w, h) { return b ? { x: (b.x + b.width / 2) * w, y: (b.y + b.height / 2) * h } : null; }
function boxCenterFromX0Y0X1Y1(b, w, h) { return b ? { x: ((b.x0 + b.x1) / 2) * w, y: ((b.y0 + b.y1) / 2) * h } : null; }
function dist(a, b) { return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null; }

// ---------- Part B: joint-to-crop-boundary margin analysis ----------
const jointMargins = {}; // joint -> array of { i, tMs, minMarginPx, minMarginNormCrop, minMarginNormAthleteHeight, marginL, marginR, marginT, marginB, clippedOutsideCropNormSpace }
for (const j of JOINTS) jointMargins[j] = [];
const missingImmediatelyAfterLowMargin = {}; // joint -> {lowMarginCount, missingNextCount, baseMissingCount, totalNextEligible}
for (const j of JOINTS) missingImmediatelyAfterLowMargin[j] = { lowMarginFollowedByMissing: 0, lowMarginTotal: 0, allFollowedByMissing: 0, allTotal: 0 };

const clippedJointFrames = {}; // joint -> count of frames where crop-normalized position is outside [0,1]
for (const j of JOINTS) clippedJointFrames[j] = 0;

for (let idx = 0; idx < frames.length; idx++) {
  const f = frames[idx];
  const cropRect = f.cropRect;
  const stripped = STRIP_ORIGINS.has(f.boxOrigin);
  const w = f.sourceWidth || W, h = f.sourceHeight || H;
  const isFullFrameFallback = cropRect && Math.abs(cropRect.x0) < 1e-9 && Math.abs(cropRect.y0) < 1e-9 && Math.abs(cropRect.x1 - 1) < 1e-9 && Math.abs(cropRect.y1 - 1) < 1e-9;
  const athleteHeightPx = f.scientificAthleteBox ? f.scientificAthleteBox.height * h : null;
  const cropWidthPx = cropRect ? (cropRect.x1 - cropRect.x0) * w : null;

  const kp = f.keypoints || {};
  for (const j of JOINTS) {
    const k = kp[j];
    const present = !!k && !stripped;
    const lowMarginPrev = jointMargins[j].length && jointMargins[j][jointMargins[j].length - 1].i === idx - 1 && jointMargins[j][jointMargins[j].length - 1].minMarginNormCrop != null && jointMargins[j][jointMargins[j].length - 1].minMarginNormCrop < 0.05;
    if (jointMargins[j].length && jointMargins[j][jointMargins[j].length - 1].i === idx - 1) {
      missingImmediatelyAfterLowMargin[j].allTotal += 1;
      if (!present) missingImmediatelyAfterLowMargin[j].allFollowedByMissing += 1;
      if (lowMarginPrev) {
        missingImmediatelyAfterLowMargin[j].lowMarginTotal += 1;
        if (!present) missingImmediatelyAfterLowMargin[j].lowMarginFollowedByMissing += 1;
      }
    }
    if (!present || !cropRect || !k.x && k.x !== 0) continue;
    if ((k.visibility ?? k.score) < VIS_FLOOR) continue;
    const jx = k.x * w, jy = k.y * h;
    const marginL = jx - cropRect.x0 * w;
    const marginR = cropRect.x1 * w - jx;
    const marginT = jy - cropRect.y0 * h;
    const marginB = cropRect.y1 * h - jy;
    const minMargin = Math.min(marginL, marginR, marginT, marginB);
    // Crop-normalized position (independent recompute, not trusting keypointsCropSpace) —
    // outside [0,1] means MediaPipe extrapolated this joint beyond the visible crop.
    const cnx = cropRect.x1 > cropRect.x0 ? (k.x - cropRect.x0) / (cropRect.x1 - cropRect.x0) : 0.5;
    const cny = cropRect.y1 > cropRect.y0 ? (k.y - cropRect.y0) / (cropRect.y1 - cropRect.y0) : 0.5;
    const clipped = cnx < 0 || cnx > 1 || cny < 0 || cny > 1;
    if (clipped) clippedJointFrames[j] += 1;
    jointMargins[j].push({
      i: f.sourceFrameIndex, tMs: f.tMs, minMarginPx: minMargin,
      minMarginNormCrop: cropWidthPx ? minMargin / cropWidthPx : null,
      minMarginNormAthleteHeight: athleteHeightPx ? minMargin / athleteHeightPx : null,
      marginL, marginR, marginT, marginB, clipped, isFullFrameFallback,
    });
  }
}

function bucketize(rows) {
  const buckets = { "0-2%": 0, "2-5%": 0, "5-10%": ">10%".slice(0, 0) + ">10%", ">10%": 0 };
  const out = { "0-2%": 0, "2-5%": 0, "5-10%": 0, ">10%": 0 };
  for (const r of rows) {
    if (r.minMarginNormCrop == null) continue;
    const pct = r.minMarginNormCrop * 100;
    if (pct < 0) { out["0-2%"] += 1; continue; } // already clipped
    if (pct <= 2) out["0-2%"] += 1;
    else if (pct <= 5) out["2-5%"] += 1;
    else if (pct <= 10) out["5-10%"] += 1;
    else out[">10%"] += 1;
  }
  return out;
}

const part_b = {};
for (const j of JOINTS) {
  const rows = jointMargins[j];
  part_b[j] = {
    validFrames: rows.length,
    minBoundaryMarginPx: rows.length ? Math.min(...rows.map((r) => r.minMarginPx)) : null,
    meanMinBoundaryMarginPx: rows.length ? rows.reduce((s, r) => s + r.minMarginPx, 0) / rows.length : null,
    buckets: bucketize(rows),
    clippedFrames: clippedJointFrames[j],
    missingAfterLowMargin: missingImmediatelyAfterLowMargin[j].lowMarginTotal
      ? missingImmediatelyAfterLowMargin[j].lowMarginFollowedByMissing / missingImmediatelyAfterLowMargin[j].lowMarginTotal
      : null,
    missingBaseRate: missingImmediatelyAfterLowMargin[j].allTotal
      ? missingImmediatelyAfterLowMargin[j].allFollowedByMissing / missingImmediatelyAfterLowMargin[j].allTotal
      : null,
    lowMarginSampleSize: missingImmediatelyAfterLowMargin[j].lowMarginTotal,
  };
}

// Frame 430-550 detail for vanni240 (foot joints only), always computed —
// harmless/empty for other benchmarks/frame ranges.
const detailWindow = {};
for (const j of FOOT_JOINTS) {
  detailWindow[j] = jointMargins[j].filter((r) => r.i >= 430 && r.i <= 550).map((r) => ({
    i: r.i, minMarginPx: Math.round(r.minMarginPx), minMarginNormCrop: r.minMarginNormCrop != null ? +r.minMarginNormCrop.toFixed(4) : null, clipped: r.clipped,
  }));
}

// ---------- Part C: crop lag ----------
const lagRows = [];
for (const f of frames) {
  if (STRIP_ORIGINS.has(f.boxOrigin)) continue;
  const cropRect = f.cropRect;
  const loc = f.scientificAthleteBox;
  const athleteBox = f.athleteBoundingBoxSource; // raw pose-derived bbox this frame, x0/y0/x1/y1
  if (!cropRect || !loc) continue;
  const w = f.sourceWidth || W, h = f.sourceHeight || H;
  const isFullFrameFallback = Math.abs(cropRect.x0) < 1e-9 && Math.abs(cropRect.y0) < 1e-9 && Math.abs(cropRect.x1 - 1) < 1e-9 && Math.abs(cropRect.y1 - 1) < 1e-9;
  if (isFullFrameFallback) continue;
  const cropCenter = boxCenterFromX0Y0X1Y1(cropRect, w, h);
  const locCenter = boxCenterFromXYWH(loc, w, h);
  const athleteCenter = athleteBox ? boxCenterFromX0Y0X1Y1(athleteBox, w, h) : null;
  const cropHalfWidthPx = ((cropRect.x1 - cropRect.x0) * w) / 2;
  const athleteHalfExtentPx = athleteBox ? Math.max(((athleteBox.x1 - athleteBox.x0) * w) / 2, ((athleteBox.y1 - athleteBox.y0) * h) / 2) : null;
  lagRows.push({
    i: f.sourceFrameIndex, tMs: f.tMs,
    cropCenter, locCenter, athleteCenter,
    locToAthleteResidualPx: athleteCenter ? dist(locCenter, athleteCenter) : null,
    cropToLocResidualPx: dist(cropCenter, locCenter),
    cropToAthleteResidualPx: athleteCenter ? dist(cropCenter, athleteCenter) : null,
    horizLagPx: athleteCenter ? cropCenter.x - athleteCenter.x : null,
    vertLagPx: athleteCenter ? cropCenter.y - athleteCenter.y : null,
    cropHalfWidthPx, athleteHalfExtentPx,
    sizeSufficient: athleteHalfExtentPx != null ? cropHalfWidthPx >= athleteHalfExtentPx : null,
  });
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
const velCropX = [], velAthleteX = [];
for (let k = 1; k < lagRows.length; k++) {
  const a = lagRows[k - 1], b = lagRows[k];
  if (b.i !== a.i + 1 || !a.athleteCenter || !b.athleteCenter) continue;
  velCropX.push(b.cropCenter.x - a.cropCenter.x);
  velAthleteX.push(b.athleteCenter.x - a.athleteCenter.x);
}
const MAX_LAG = 8;
let bestLag = 0, bestCorr = -Infinity;
const lagCorrs = {};
for (let lag = -MAX_LAG; lag <= MAX_LAG; lag++) {
  let a, b;
  if (lag >= 0) { a = velAthleteX.slice(lag); b = velCropX.slice(0, velCropX.length - lag); }
  else { a = velAthleteX.slice(0, velAthleteX.length + lag); b = velCropX.slice(-lag); }
  const c = pearson(a, b);
  lagCorrs[lag] = c;
  if (c != null && c > bestCorr) { bestCorr = c; bestLag = lag; }
}

const validLocRes = lagRows.map((r) => r.locToAthleteResidualPx).filter((v) => v != null);
const validCropLocRes = lagRows.map((r) => r.cropToLocResidualPx).filter((v) => v != null);
const validCropAthRes = lagRows.map((r) => r.cropToAthleteResidualPx).filter((v) => v != null);
function meanArr(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; }
function maxArr(a) { return a.length ? Math.max(...a) : null; }

// Vanni-240-specific 470-527 window deep dive (harmless for other benchmarks).
const win = lagRows.filter((r) => r.i >= 470 && r.i <= 527);
let firstLagFrame = null, peakLagFrame = null, peakLagVal = -Infinity, recoveryFrame = null;
const LAG_ONSET_PX = 40; // a real, meaningful onset threshold (well above ordinary jitter)
for (const r of win) {
  if (r.cropToAthleteResidualPx != null) {
    if (firstLagFrame == null && r.cropToAthleteResidualPx > LAG_ONSET_PX) firstLagFrame = r.i;
    if (r.cropToAthleteResidualPx > peakLagVal) { peakLagVal = r.cropToAthleteResidualPx; peakLagFrame = r.i; }
  }
}
const afterWin = lagRows.filter((r) => r.i > 527 && r.i <= 620);
for (const r of afterWin) {
  if (r.cropToAthleteResidualPx != null && r.cropToAthleteResidualPx < LAG_ONSET_PX) { recoveryFrame = r.i; break; }
}
const windowMeanCropToLoc = meanArr(win.map((r) => r.cropToLocResidualPx).filter((v) => v != null));
const windowMeanLocToAthlete = meanArr(win.map((r) => r.locToAthleteResidualPx).filter((v) => v != null));
const windowSizeInsufficientRate = win.filter((r) => r.sizeSufficient === false).length / Math.max(1, win.filter((r) => r.sizeSufficient != null).length);

const part_c = {
  usableFrames: lagRows.length,
  locToAthleteResidualPx: { mean: meanArr(validLocRes), max: maxArr(validLocRes) },
  cropToLocResidualPx: { mean: meanArr(validCropLocRes), max: maxArr(validCropLocRes) },
  cropToAthleteResidualPx: { mean: meanArr(validCropAthRes), max: maxArr(validCropAthRes) },
  meanOffsetFrameWidths: meanArr(validCropAthRes) != null ? meanArr(validCropAthRes) / W : null,
  bestLagFrames: bestLag, bestLagMs: bestLag * (1000 / FPS), bestLagCorrelation: bestCorr, zeroLagCorrelation: lagCorrs[0],
  sizeSufficientRate: lagRows.filter((r) => r.sizeSufficient != null).length
    ? lagRows.filter((r) => r.sizeSufficient === true).length / lagRows.filter((r) => r.sizeSufficient != null).length
    : null,
  vanni240Window_470_527: {
    firstLagFrame, peakLagFrame, peakLagVal: peakLagVal === -Infinity ? null : peakLagVal, recoveryFrame,
    durationFrames: firstLagFrame != null && recoveryFrame != null ? recoveryFrame - firstLagFrame : null,
    windowMeanCropToLocResidualPx: windowMeanCropToLoc,
    windowMeanLocToAthleteResidualPx: windowMeanLocToAthlete,
    windowSizeInsufficientRate,
    diagnosis: windowMeanLocToAthlete > windowMeanCropToLoc
      ? "dominant cause: box_tracker's own localization lag (loc-to-athlete residual exceeds plan_crops' own added crop-to-loc residual)"
      : "dominant cause: plan_crops' own smoothing/bounding adds more lag on top of an already-reasonable localization box",
  },
};

// ---------- Part D: crop utilization ----------
const utilRows = [];
for (const f of frames) {
  if (STRIP_ORIGINS.has(f.boxOrigin)) continue;
  const cropRect = f.cropRect;
  const athleteBox = f.athleteBoundingBoxSource;
  if (!cropRect || !athleteBox) continue;
  const isFullFrameFallback = Math.abs(cropRect.x0) < 1e-9 && Math.abs(cropRect.y0) < 1e-9 && Math.abs(cropRect.x1 - 1) < 1e-9 && Math.abs(cropRect.y1 - 1) < 1e-9;
  if (isFullFrameFallback) continue;
  const w = f.sourceWidth || W, h = f.sourceHeight || H;
  const cropWidthPx = (cropRect.x1 - cropRect.x0) * w;
  const cropHeightPx = (cropRect.y1 - cropRect.y0) * h;
  const athleteWidthPx = (athleteBox.x1 - athleteBox.x0) * w;
  const athleteHeightPx = (athleteBox.y1 - athleteBox.y0) * h;
  const kp = f.keypoints || {};
  const feetY = FOOT_JOINTS.map((j) => kp[j]).filter((k) => k && (k.visibility ?? k.score) >= VIS_FLOOR).map((k) => k.y * h);
  const headY = kp.nose && (kp.nose.visibility ?? kp.nose.score) >= VIS_FLOOR ? kp.nose.y * h : null;
  const footToBottomPx = feetY.length ? cropRect.y1 * h - Math.max(...feetY) : null;
  const headToTopPx = headY != null ? headY - cropRect.y0 * h : null;
  utilRows.push({
    i: f.sourceFrameIndex,
    athleteWidthOverCropWidth: cropWidthPx > 0 ? athleteWidthPx / cropWidthPx : null,
    athleteHeightOverCropHeight: cropHeightPx > 0 ? athleteHeightPx / cropHeightPx : null,
    utilization: cropWidthPx > 0 && cropHeightPx > 0 ? (athleteWidthPx * athleteHeightPx) / (cropWidthPx * cropHeightPx) : null,
    footToBottomPx, headToTopPx,
    cropWidthPx, cropHeightPx,
  });
}
function pct(arr, p) {
  const v = arr.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.floor(v.length * p))];
}
const part_d = {
  usableFrames: utilRows.length,
  athleteWidthOverCropWidth: { mean: meanArr(utilRows.map((r) => r.athleteWidthOverCropWidth).filter((v) => v != null)), p50: pct(utilRows.map((r) => r.athleteWidthOverCropWidth), 0.5), p90: pct(utilRows.map((r) => r.athleteWidthOverCropWidth), 0.9) },
  athleteHeightOverCropHeight: { mean: meanArr(utilRows.map((r) => r.athleteHeightOverCropHeight).filter((v) => v != null)), p50: pct(utilRows.map((r) => r.athleteHeightOverCropHeight), 0.5), p90: pct(utilRows.map((r) => r.athleteHeightOverCropHeight), 0.9) },
  utilization: { mean: meanArr(utilRows.map((r) => r.utilization).filter((v) => v != null)), p50: pct(utilRows.map((r) => r.utilization), 0.5), p90: pct(utilRows.map((r) => r.utilization), 0.9) },
  footToBottomPx: { mean: meanArr(utilRows.map((r) => r.footToBottomPx).filter((v) => v != null)), min: utilRows.map((r) => r.footToBottomPx).filter((v) => v != null).length ? Math.min(...utilRows.map((r) => r.footToBottomPx).filter((v) => v != null)) : null },
  headToTopPx: { mean: meanArr(utilRows.map((r) => r.headToTopPx).filter((v) => v != null)), min: utilRows.map((r) => r.headToTopPx).filter((v) => v != null).length ? Math.min(...utilRows.map((r) => r.headToTopPx).filter((v) => v != null)) : null },
};

const summary = { label, posePath, frameCount: frames.length, fps: FPS, width: W, height: H, part_b, part_c, part_d, detailWindow_430_550: detailWindow };
console.log(JSON.stringify(summary, null, 2));
writeFileSync(`tmp/phase50b-${label}-summary.json`, JSON.stringify(summary, null, 2));
writeFileSync(`tmp/phase50b-${label}-lagRows.json`, JSON.stringify(lagRows, null, 2));
writeFileSync(`tmp/phase50b-${label}-utilRows.json`, JSON.stringify(utilRows, null, 2));
