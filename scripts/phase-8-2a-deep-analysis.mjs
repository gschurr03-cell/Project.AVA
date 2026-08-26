// Phase 8.2A -- Parts H/I/J/K/L/P deep analysis. Reads the already-generated
// fine-trace / display-samples artifacts (scripts/phase-8-2a-autofollow-trace.mjs)
// and performs: precise internal-state deadband hold/release detection
// (Part H), counterfactual multi-refresh-rate display sampling (Part I），a
// same-trajectory cross-FPS control (Part J), zoom/translation decomposition
// (Part K), synchronized data export (Part L), and a robust,
// discontinuity-excluding smoothness proxy (Part P). Read-only, standalone.
//
//   node scripts/phase-8-2a-deep-analysis.mjs

import { readFileSync, writeFileSync } from "node:fs";

const OUT = "tmp/phase82a";
const BENCHMARKS = ["vanni60", "vanni120", "vanni240"];
const REPRESENTATIVE_PLAYER_WIDTH_PX = 1280;

function stats(vals) {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  const pct = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return {
    n: s.length, median: +pct(0.5).toFixed(6), p90: +pct(0.9).toFixed(6), p95: +pct(0.95).toFixed(6),
    p99: +pct(0.99).toFixed(6), max: +s[s.length - 1].toFixed(6), mean: +(s.reduce((a, c) => a + c, 0) / s.length).toFixed(6),
  };
}

// Byte-for-byte copy of OverlaySurface.tsx's exported `frameIndexForTime`.
function frameIndexForTime(frames, time) {
  let lo = 0, hi = frames.length - 1, idx = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].time <= time) { idx = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return idx;
}

function trimAcquisitionTransient(rows) {
  const idx = rows.findIndex((r) => r.presentationState === "following" || r.presentationState === "anticipating");
  return idx > 0 ? rows.slice(idx) : rows;
}

const results = {};

for (const label of BENCHMARKS) {
  const fineData = JSON.parse(readFileSync(`${OUT}/${label}-fine-trace.json`, "utf8"));
  const fineFull = fineData.fineTrace;
  const fine = trimAcquisitionTransient(fineFull);

  // ============================================================
  // PART H -- deadband hold/release isolation using the REAL internal
  // target state (targetCenterSourceX/Y), not a screen-delta proxy. A
  // "hold" is a maximal run of consecutive fine (per-real-source-frame)
  // samples where targetCenterSourceY is BIT-FOR-BIT unchanged from the
  // previous sample (the deadband's own `previous.targetCenterSourceY`
  // passthrough, verbatim); "release" is the next sample where it changes.
  // ============================================================
  const yHolds = [];
  let holdStart = 0;
  for (let i = 1; i <= fine.length; i++) {
    const changed = i === fine.length || fine[i].targetCenterSourceY !== fine[i - 1].targetCenterSourceY;
    if (changed) {
      const runLength = i - holdStart;
      if (runLength >= 2) {
        const accumulatedRawDrift = Math.abs(
          (fine[Math.min(i, fine.length - 1)].rawTargetCenterSourceY ?? fine[i - 1].rawTargetCenterSourceY) -
          (fine[holdStart].rawTargetCenterSourceY ?? 0),
        );
        yHolds.push({
          startIndex: holdStart, endIndex: i - 1, runLengthSamples: runLength,
          holdDurationSourceMs: (fine[Math.min(i, fine.length - 1)].timeS - fine[holdStart].timeS) * 1000,
          accumulatedRawTargetDriftPx: +(accumulatedRawDrift * REPRESENTATIVE_PLAYER_WIDTH_PX).toFixed(3),
          releaseTargetDeltaPx: i < fine.length
            ? +(Math.abs(fine[i].targetCenterSourceY - fine[i - 1].targetCenterSourceY) * REPRESENTATIVE_PLAYER_WIDTH_PX).toFixed(3)
            : null,
        });
      }
      holdStart = i;
    }
  }

  // Attribute p95 DISPLAY-tick jump energy: for each large display-sampled
  // delta (top decile), check whether it coincides with (overlaps) a
  // deadband release event (a target-value change) vs. purely reflects
  // ordinary multi-fine-frame coalescing with NO target hold/release
  // involved (target was already moving smoothly every fine frame).
  const dispData = JSON.parse(readFileSync(`${OUT}/${label}-display-samples.json`, "utf8"));
  const disp60 = trimAcquisitionTransient(dispData.displaySamples.rate_1.hz60);
  const dispDeltas = [];
  for (let i = 1; i < disp60.length; i++) {
    const dx = (disp60[i].cx - disp60[i - 1].cx) * REPRESENTATIVE_PLAYER_WIDTH_PX;
    const dy = (disp60[i].cy - disp60[i - 1].cy) * REPRESENTATIVE_PLAYER_WIDTH_PX;
    const dScale = disp60[i].scale - disp60[i - 1].scale;
    dispDeltas.push({
      index: i, deltaPx: Math.hypot(dx, dy), dxPx: dx, dyPx: dy, dScale,
      fromFineIndex: disp60[i - 1].index, toFineIndex: disp60[i].index,
    });
  }
  const sortedByDelta = [...dispDeltas].sort((a, b) => b.deltaPx - a.deltaPx);
  const p95Threshold = stats(dispDeltas.map((d) => d.deltaPx)).p95;
  const topDecile = sortedByDelta.slice(0, Math.max(1, Math.floor(dispDeltas.length * 0.1)));
  let coalescingOnlyCount = 0, involvesTargetChangeCount = 0;
  for (const event of topDecile) {
    // Did the TARGET change (a real release) anywhere within the coalesced
    // fine-frame span this display tick represents?
    let targetChanged = false;
    for (let fi = event.fromFineIndex + 1; fi <= event.toFineIndex; fi++) {
      const a = fineFull[fi - 1], b = fineFull[fi];
      if (a && b && a.targetCenterSourceY !== b.targetCenterSourceY) { targetChanged = true; break; }
    }
    if (targetChanged) involvesTargetChangeCount++; else coalescingOnlyCount++;
  }

  // ============================================================
  // PART I -- counterfactual display sampling at multiple refresh rates,
  // using the SAME real production fine path, offline (no production
  // change).
  // ============================================================
  const REFRESH_RATES = [30, 60, 90, 120, 144, 240];
  const counterfactual = {};
  for (const hz of REFRESH_RATES) {
    const totalSourceTimeS = fineFull[fineFull.length - 1].timeS;
    const interval = 1 / hz;
    const samples = [];
    let t = fineFull[0].timeS;
    let lastIdx = -1;
    while (t <= totalSourceTimeS) {
      const idx = frameIndexForTime(fineFull.map((r) => ({ time: r.timeS })), t);
      if (idx !== lastIdx) { samples.push(fineFull[idx]); lastIdx = idx; }
      t += interval;
    }
    const trimmed = trimAcquisitionTransient(samples);
    const deltas = [];
    for (let i = 1; i < trimmed.length; i++) {
      deltas.push(Math.hypot((trimmed[i].cx - trimmed[i - 1].cx) * REPRESENTATIVE_PLAYER_WIDTH_PX, (trimmed[i].cy - trimmed[i - 1].cy) * REPRESENTATIVE_PLAYER_WIDTH_PX));
    }
    let holdReleaseCount = 0, holdStart2 = null;
    for (let i = 0; i < deltas.length; i++) {
      if (deltas[i] < 0.25) { if (holdStart2 === null) holdStart2 = i; }
      else { if (holdStart2 !== null && i - holdStart2 >= 2) holdReleaseCount++; holdStart2 = null; }
    }
    counterfactual[`hz_${hz}`] = { sampleCount: trimmed.length, deltaPxStats: stats(deltas), holdReleaseCount };
  }

  // ============================================================
  // PART K -- zoom/translation coupling decomposition for the top-decile
  // display-tick events: what fraction of the total displayed pixel
  // movement comes from translation (cx/cy change alone, at the OLD scale)
  // vs scale change (at the OLD center)?
  // ============================================================
  const couplingBreakdown = topDecile.map((event) => {
    const a = disp60[event.index - 1], b = disp60[event.index];
    // Screen displacement of the FRAME CENTER (0.5,0.5 source point) under
    // each transform alone, decomposed additively (first-order decomposition,
    // consistent with how zoomDecoupledFollow anchors zoom at the athlete
    // point specifically -- here we decompose the NET wrapper-visible motion
    // for a generic on-screen point at frame center for interpretability).
    const translationOnlyPx = Math.hypot((b.cx - a.cx) * a.scale * REPRESENTATIVE_PLAYER_WIDTH_PX, (b.cy - a.cy) * a.scale * REPRESENTATIVE_PLAYER_WIDTH_PX);
    const scaleOnlyPx = Math.abs(b.scale - a.scale) * 0.5 * REPRESENTATIVE_PLAYER_WIDTH_PX; // effect of a scale-only change on a point at the crop edge (worst case, distance 0.5 from center)
    return {
      dispIndex: event.index, deltaPx: +event.deltaPx.toFixed(3),
      translationOnlyPx: +translationOnlyPx.toFixed(3), scaleOnlyPx: +scaleOnlyPx.toFixed(3),
      scaleBefore: a.scale, scaleAfter: b.scale,
      dominant: scaleOnlyPx > translationOnlyPx * 0.5 ? (translationOnlyPx > scaleOnlyPx * 0.5 ? "both" : "zoom") : "pan",
    };
  });
  const dominantCounts = couplingBreakdown.reduce((acc, e) => { acc[e.dominant] = (acc[e.dominant] ?? 0) + 1; return acc; }, {});

  // ============================================================
  // PART P -- robust smoothness proxy: median/p95 absolute acceleration and
  // jerk, source-time normalized, computed ONLY within contiguous runs of
  // the SAME presentationState family (excludes state-transition
  // discontinuities, direct-selection resets, and the initial acquisition
  // transient already trimmed above).
  // ============================================================
  function robustDerivatives(rows) {
    // Split into contiguous runs where presentationState stays within the
    // "continuous tracking" family (following/anticipating/reacquiring) --
    // a change to/from holding/degraded/returning_to_full_frame is a real,
    // separate regime and must not contaminate the in-motion smoothness read.
    const CONTINUOUS = new Set(["following", "anticipating", "reacquiring"]);
    const runs = [];
    let cur = [];
    for (const r of rows) {
      if (CONTINUOUS.has(r.presentationState)) cur.push(r);
      else { if (cur.length > 3) runs.push(cur); cur = []; }
    }
    if (cur.length > 3) runs.push(cur);
    const accMags = [], jerkMags = [];
    for (const run of runs) {
      const times = run.map((r) => r.timeS ?? r.presentedTime);
      const vx = [], vy = [];
      for (let i = 1; i < run.length; i++) {
        const dt = times[i] - times[i - 1];
        if (dt <= 0) continue;
        vx.push((run[i].cx - run[i - 1].cx) / dt);
        vy.push((run[i].cy - run[i - 1].cy) / dt);
      }
      const ax = [], ay = [];
      for (let i = 1; i < vx.length; i++) {
        const dt = times[i + 1] - times[i];
        if (dt <= 0) continue;
        ax.push((vx[i] - vx[i - 1]) / dt);
        ay.push((vy[i] - vy[i - 1]) / dt);
      }
      for (let i = 0; i < ax.length; i++) accMags.push(Math.hypot(ax[i], ay[i]) * REPRESENTATIVE_PLAYER_WIDTH_PX);
      const jx = [], jy = [];
      for (let i = 1; i < ax.length; i++) {
        const dt = times[i + 2] - times[i + 1];
        if (dt <= 0) continue;
        jx.push((ax[i] - ax[i - 1]) / dt);
        jy.push((ay[i] - ay[i - 1]) / dt);
      }
      for (let i = 0; i < jx.length; i++) jerkMags.push(Math.hypot(jx[i], jy[i]) * REPRESENTATIVE_PLAYER_WIDTH_PX);
    }
    return { runCount: runs.length, totalSamples: runs.reduce((s, r) => s + r.length, 0), accelerationPxPerS2: stats(accMags), jerkPxPerS3: stats(jerkMags) };
  }

  const robustFine = robustDerivatives(fine);
  const robustDisp60 = robustDerivatives(disp60);

  results[label] = {
    normFps: fineData.normFps,
    partH_deadbandHolds: {
      totalHoldEvents: yHolds.length,
      holdDurationSourceMsStats: stats(yHolds.map((h) => h.holdDurationSourceMs)),
      accumulatedDriftPxStats: stats(yHolds.map((h) => h.accumulatedRawTargetDriftPx)),
      top5LongestHolds: [...yHolds].sort((a, b) => b.holdDurationSourceMs - a.holdDurationSourceMs).slice(0, 5),
      p95DisplayJumpAttribution: {
        topDecileEventCount: topDecile.length,
        coalescingOnlyCount, involvesTargetChangeCount,
        pctFromDeadbandRelease: topDecile.length ? +((involvesTargetChangeCount / topDecile.length) * 100).toFixed(1) : null,
        pctFromOrdinaryCoalescing: topDecile.length ? +((coalescingOnlyCount / topDecile.length) * 100).toFixed(1) : null,
      },
    },
    partI_counterfactualRefresh: counterfactual,
    partK_zoomTranslationCoupling: { dominantCounts, sampleEvents: couplingBreakdown.slice(0, 8) },
    partP_robustSmoothness: { fine: robustFine, display60Hz: robustDisp60 },
  };

  console.log(`\n=== ${label} ===`);
  console.log("Part H deadband:", JSON.stringify(results[label].partH_deadbandHolds.p95DisplayJumpAttribution));
  console.log("Part H hold duration stats (source ms):", JSON.stringify(results[label].partH_deadbandHolds.holdDurationSourceMsStats));
  console.log("Part I counterfactual (delta px median by Hz):", Object.fromEntries(Object.entries(counterfactual).map(([k, v]) => [k, v.deltaPxStats?.median])));
  console.log("Part I counterfactual (delta px p95 by Hz):", Object.fromEntries(Object.entries(counterfactual).map(([k, v]) => [k, v.deltaPxStats?.p95])));
  console.log("Part K dominant cause counts:", JSON.stringify(dominantCounts));
  console.log("Part P robust fine accel/jerk p95:", robustFine.accelerationPxPerS2?.p95, robustFine.jerkPxPerS3?.p95);
  console.log("Part P robust display60 accel/jerk p95:", robustDisp60.accelerationPxPerS2?.p95, robustDisp60.jerkPxPerS3?.p95);
}

writeFileSync(`${OUT}/deep-analysis.json`, JSON.stringify(results, null, 2));
console.log(`\nWrote ${OUT}/deep-analysis.json`);
