// Phase 8.1A -- analyzes the raw per-frame world-lock traces produced by
// scripts/phase-8-1a-transform-trace.mjs (tmp/phase81a/{label}-trace.json).
// Read-only, standalone; not imported by any src/ file.
//
//   node scripts/phase-8-1a-drift-analysis.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const BENCHMARKS = ["gav", "vanni240", "vanni120", "vanni60"];
const KEYS = ["startC1", "startC2", "finishC1", "finishC2", "bgTopLeft", "bgTopRight", "bgBottomLeft", "bgBottomRight", "bgCenter"];
const GATE_KEYS = ["startC1", "startC2", "finishC1", "finishC2"];
const BG_KEYS = ["bgTopLeft", "bgTopRight", "bgBottomLeft", "bgBottomRight", "bgCenter"];

const summary = {};

for (const label of BENCHMARKS) {
  const d = JSON.parse(readFileSync(`tmp/phase81a/${label}-trace.json`, "utf8"));
  const W = d.W, H = d.H;

  // Reference frame: 5 frames after the real, verified finish-gate crossing
  // (zone exit), clamped inside the clip -- "shortly after the athlete exits
  // the measurement zone," per the task's own definition (Part B).
  const rawRef = (d.finishCrossingFrame ?? d.lastContact?.sourceFrameIndex ?? 0) + 5;
  const refIdx = Math.max(0, Math.min(d.totalFrames - 1, rawRef));
  const ref = d.trace.find((t) => t.frameIndex === refIdx);

  const perKey = {};
  for (const k of KEYS) {
    if (!ref?.[k]) { perKey[k] = null; continue; }
    const rx = ref[k].x, ry = ref[k].y;
    const rows = d.trace.filter((row) => row.frameIndex >= refIdx && row[k]);
    const dists = rows.map((row) => ({
      frameIndex: row.frameIndex,
      dxPx: (row[k].x - rx) * W,
      dyPx: (row[k].y - ry) * H,
    })).map((r) => ({ ...r, distPx: Math.hypot(r.dxPx, r.dyPx) }));
    if (!dists.length) { perKey[k] = null; continue; }
    const sorted = [...dists].sort((a, b) => a.distPx - b.distPx);
    const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
    const xsSorted = [...dists].sort((a, b) => Math.abs(a.dxPx) - Math.abs(b.dxPx));
    const ysSorted = [...dists].sort((a, b) => Math.abs(a.dyPx) - Math.abs(b.dyPx));
    perKey[k] = {
      n: dists.length,
      medianTotalPx: +pct(0.5).distPx.toFixed(3),
      p95TotalPx: +pct(0.95).distPx.toFixed(3),
      maxTotalPx: +pct(1.0).distPx.toFixed(3),
      maxAtFrame: pct(1.0).frameIndex,
      medianXPx: +xsSorted[Math.floor(xsSorted.length / 2)].dxPx.toFixed(3),
      p95XPx: +xsSorted[Math.min(xsSorted.length - 1, Math.floor(xsSorted.length * 0.95))].dxPx.toFixed(3),
      maxXPx: +xsSorted[xsSorted.length - 1].dxPx.toFixed(3),
      medianYPx: +ysSorted[Math.floor(ysSorted.length / 2)].dyPx.toFixed(3),
      p95YPx: +ysSorted[Math.min(ysSorted.length - 1, Math.floor(ysSorted.length * 0.95))].dyPx.toFixed(3),
      maxYPx: +ysSorted[ysSorted.length - 1].dyPx.toFixed(3),
      lastFrameDxPx: +dists[dists.length - 1].dxPx.toFixed(3),
      lastFrameDyPx: +dists[dists.length - 1].dyPx.toFixed(3),
    };
  }

  // Drift onset: first frame (after ref) where |displacement| for bgCenter
  // exceeds 1.0px and stays above 1.0px for at least 10 consecutive
  // available frames (excludes single-frame noise).
  let onsetFrame = null;
  const centerRows = d.trace.filter((row) => row.frameIndex >= refIdx && row.bgCenter);
  const rx = ref?.bgCenter?.x, ry = ref?.bgCenter?.y;
  if (rx != null) {
    const disps = centerRows.map((row) => ({
      frameIndex: row.frameIndex,
      distPx: Math.hypot((row.bgCenter.x - rx) * W, (row.bgCenter.y - ry) * H),
    }));
    for (let i = 0; i < disps.length; i++) {
      if (disps[i].distPx < 1.0) continue;
      const window = disps.slice(i, i + 10);
      if (window.length === 10 && window.every((w) => w.distPx >= 1.0)) { onsetFrame = disps[i].frameIndex; break; }
    }
  }

  // framePath state histogram in the post-reference tail.
  const tailStates = {};
  for (const row of d.trace) {
    if (row.frameIndex < refIdx) continue;
    tailStates[row.framePathState] = (tailStates[row.framePathState] ?? 0) + 1;
  }
  const tailConfidences = d.trace.filter((r) => r.frameIndex >= refIdx && r.framePathState === "anchored").map((r) => r.framePathConfidence);

  // Coherence check: does the gate group move the same direction/magnitude as
  // the background-anchor group at the max-drift frame? (Case 3/4 vs Case 2.)
  const maxFrame = perKey.bgCenter?.maxAtFrame ?? null;
  let coherence = null;
  if (maxFrame != null) {
    const row = d.trace.find((t) => t.frameIndex === maxFrame);
    if (row) {
      const gateDx = GATE_KEYS.map((k) => row[k] && ref[k] ? (row[k].x - ref[k].x) * W : null).filter((v) => v != null);
      const gateDy = GATE_KEYS.map((k) => row[k] && ref[k] ? (row[k].y - ref[k].y) * H : null).filter((v) => v != null);
      const bgDx = BG_KEYS.map((k) => row[k] && ref[k] ? (row[k].x - ref[k].x) * W : null).filter((v) => v != null);
      const bgDy = BG_KEYS.map((k) => row[k] && ref[k] ? (row[k].y - ref[k].y) * H : null).filter((v) => v != null);
      const mean = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
      coherence = {
        atFrame: maxFrame,
        gateMeanDxPx: mean(gateDx), gateMeanDyPx: mean(gateDy),
        bgMeanDxPx: mean(bgDx), bgMeanDyPx: mean(bgDy),
      };
    }
  }

  summary[label] = {
    totalFrames: d.totalFrames,
    W, H,
    zoneExitTimeS: d.zoneExitTimeS,
    finishCrossingFrame: d.finishCrossingFrame,
    lastContactFrame: d.lastContact?.sourceFrameIndex ?? null,
    lastPoseFrame: d.lastPoseFrame?.sourceFrameIndex ?? null,
    referenceFrame: refIdx,
    normFps: d.normFps,
    perKey,
    driftOnsetFrame: onsetFrame,
    driftOnsetVsZoneExitFrames: onsetFrame != null ? onsetFrame - refIdx : null,
    driftOnsetVsLastContactFrames: onsetFrame != null && d.lastContact ? onsetFrame - d.lastContact.sourceFrameIndex : null,
    driftOnsetVsLastPoseFrames: onsetFrame != null && d.lastPoseFrame ? onsetFrame - d.lastPoseFrame.sourceFrameIndex : null,
    tailFramePathStateHistogram: tailStates,
    tailAnchoredConfidenceMin: tailConfidences.length ? Math.min(...tailConfidences) : null,
    tailAnchoredConfidenceMax: tailConfidences.length ? Math.max(...tailConfidences) : null,
    coherenceAtMaxDrift: coherence,
  };

  console.log(`\n=== ${label} ===`);
  console.log(`totalFrames=${d.totalFrames} zoneExitTimeS=${d.zoneExitTimeS} finishCrossFrame=${d.finishCrossingFrame} lastContact=${summary[label].lastContactFrame} lastPose=${summary[label].lastPoseFrame} refFrame=${refIdx}`);
  console.log(`tail frames after ref: ${d.totalFrames - refIdx}, framePathState histogram: ${JSON.stringify(tailStates)}, anchored confidence range: ${summary[label].tailAnchoredConfidenceMin}-${summary[label].tailAnchoredConfidenceMax}`);
  console.log(`drift onset frame (sustained >=1px, bgCenter): ${onsetFrame} (offset from ref: ${summary[label].driftOnsetVsZoneExitFrames} frames, from last contact: ${summary[label].driftOnsetVsLastContactFrames}, from last pose: ${summary[label].driftOnsetVsLastPoseFrames})`);
  console.log(`bgCenter: median=${perKey.bgCenter?.medianTotalPx}px p95=${perKey.bgCenter?.p95TotalPx}px max=${perKey.bgCenter?.maxTotalPx}px @frame ${perKey.bgCenter?.maxAtFrame} (dx=${perKey.bgCenter?.maxXPx}, dy=${perKey.bgCenter?.maxYPx}) lastFrame dx=${perKey.bgCenter?.lastFrameDxPx} dy=${perKey.bgCenter?.lastFrameDyPx}`);
  console.log(`startC1 (gate): median=${perKey.startC1?.medianTotalPx}px p95=${perKey.startC1?.p95TotalPx}px max=${perKey.startC1?.maxTotalPx}px @frame ${perKey.startC1?.maxAtFrame} (dx=${perKey.startC1?.maxXPx}, dy=${perKey.startC1?.maxYPx})`);
  console.log(`coherence at max drift frame: ${JSON.stringify(coherence)}`);
}

mkdirSync("tmp/phase81a", { recursive: true });
writeFileSync("tmp/phase81a/drift-summary.json", JSON.stringify(summary, null, 2));
console.log("\nWrote tmp/phase81a/drift-summary.json");
