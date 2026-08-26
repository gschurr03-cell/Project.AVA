// Phase 4.2J (Part A) — maps every short Vanni 240 disagreement interval by
// comparing the TRUE original Phase 1/2 pose artifact (analysis snapshot
// `4b425ebf-6998-42d3-8105-0b5dfedcf93b`, confirmed via independent
// re-measurement to reproduce the exact hand-verified Phase 1/2 baseline —
// combinedStepFrequencyHz 4.858299595141699, validContacts 11,
// reportedZoneTimeS 2.2) against the current Phase 4.2I artifact, real
// frame-by-frame, using real torso-position divergence (not synthetic).
//
//   node scripts/phase-4-2j-short-interval-inventory.mjs

import { readFileSync, writeFileSync } from "node:fs";

const orig = JSON.parse(readFileSync("tmp/phase42j/original-vanni240.pose.json", "utf8"));
const cur = JSON.parse(readFileSync("tmp/phase42i-final/vanni240.pose.json", "utf8"));

function torsoPoint(f) {
  const kp = f.keypoints || {};
  const vis = (p) => p && (p.visibility ?? 1) >= 0.4;
  const mid = (a, b) => (vis(a) && vis(b) ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null);
  const sh = mid(kp.left_shoulder, kp.right_shoulder);
  const hip = mid(kp.left_hip, kp.right_hip);
  if (sh && hip) return { x: (sh.x + hip.x) / 2, y: (sh.y + hip.y) / 2 };
  return sh || hip || null;
}

const rows = [];
for (let i = 0; i < cur.frames.length; i++) {
  const of = orig.frames[i];
  const cf = cur.frames[i];
  const ot = torsoPoint(of);
  const ct = torsoPoint(cf);
  let torsoResidualPx = null;
  if (ot && ct) {
    torsoResidualPx = Math.hypot((ot.x - ct.x) * cf.sourceWidth, (ot.y - ct.y) * cf.sourceHeight);
  }
  rows.push({
    i,
    tMs: cf.tMs,
    origBoxOrigin: of.boxOrigin,
    curBoxOrigin: cf.boxOrigin,
    origHasTorso: !!ot,
    curHasTorso: !!ct,
    torsoResidualPx,
    poseBoundsIoU: cf.poseBoundsIoU ?? null,
    backgroundRiskFeatureRatio: cf.backgroundRiskFeatureRatio ?? null,
    skeletonOwnershipRatio: cf.skeletonOwnershipRatio ?? null,
    trajectoryResidualFrameWidths: cf.trajectoryResidualFrameWidths ?? null,
    poseCorroboratesLocalization: cf.poseCorroboratesLocalization ?? null,
  });
}

// A "disagreement" frame: real torso divergence >= 20px (a real, meaningful
// pixel-space disagreement, well above sub-pixel noise) between the two
// independently-produced pose results, OR original has a torso but current
// does not (current lost evidence the original had).
const DISAGREE_PX = 20;
const disagreements = rows.filter((r) => (r.torsoResidualPx !== null && r.torsoResidualPx >= DISAGREE_PX) || (r.origHasTorso && !r.curHasTorso));

// Group into contiguous intervals (source-frame-adjacent).
const intervals = [];
let cur_iv = null;
for (const r of disagreements) {
  if (cur_iv && r.i === cur_iv.end + 1) {
    cur_iv.end = r.i;
    cur_iv.rows.push(r);
  } else {
    if (cur_iv) intervals.push(cur_iv);
    cur_iv = { start: r.i, end: r.i, rows: [r] };
  }
}
if (cur_iv) intervals.push(cur_iv);

const FPS = 239.981;
console.log(`Total disagreement frames: ${disagreements.length} / ${rows.length}`);
console.log(`Grouped into ${intervals.length} contiguous intervals\n`);

const enriched = intervals.map((iv) => {
  const durationMs = (rows[iv.end].tMs - rows[iv.start].tMs) + (1000 / FPS);
  const durationFrames = iv.end - iv.start + 1;
  const maxResidual = Math.max(...iv.rows.map((r) => r.torsoResidualPx || 0));
  const meanIoU = iv.rows.filter((r) => r.poseBoundsIoU !== null).length
    ? iv.rows.filter((r) => r.poseBoundsIoU !== null).reduce((a, r) => a + r.poseBoundsIoU, 0) / iv.rows.filter((r) => r.poseBoundsIoU !== null).length
    : null;
  const minIoU = iv.rows.filter((r) => r.poseBoundsIoU !== null).length
    ? Math.min(...iv.rows.filter((r) => r.poseBoundsIoU !== null).map((r) => r.poseBoundsIoU))
    : null;
  return {
    startFrame: iv.start, endFrame: iv.end, durationFrames, durationMs,
    maxTorsoResidualPx: maxResidual, meanPoseBoundsIoU: meanIoU, minPoseBoundsIoU: minIoU,
    curBoxOrigins: [...new Set(iv.rows.map((r) => r.curBoxOrigin))],
    short: durationMs < 300, // "short" per Part A's own instruction: source-time units
  };
});

console.log("=== ALL disagreement intervals ===");
for (const e of enriched) {
  console.log(`frame ${e.startFrame}-${e.endFrame} (${e.durationFrames}f, ${e.durationMs.toFixed(1)}ms) ${e.short ? "SHORT" : "LONG"} maxResidual=${e.maxTorsoResidualPx.toFixed(1)}px meanIoU=${e.meanPoseBoundsIoU?.toFixed(3) ?? "n/a"} minIoU=${e.minPoseBoundsIoU?.toFixed(3) ?? "n/a"} origins=${e.curBoxOrigins.join(",")}`);
}

const shortIntervals = enriched.filter((e) => e.short);
console.log(`\n=== SHORT intervals (< 300ms): ${shortIntervals.length} ===`);

writeFileSync("tmp/phase42j/short-interval-inventory.json", JSON.stringify({ rows, intervals: enriched, shortIntervals }, null, 2));
console.log("\nFull per-frame data written to tmp/phase42j/short-interval-inventory.json");
