// Phase 8.2A -- analyzes the raw traces produced by
// scripts/phase-8-2a-autofollow-trace.mjs. Computes, for both the FULL
// (fine, per-real-source-frame) camera path and the SIMULATED-DISPLAY
// (subsampled at nominal 60/120Hz) path: frame-to-frame delta distributions,
// per-source-second-normalized velocity/acceleration/jerk, micro-hold/
// release event detection, and a simple jerk-energy smoothness proxy.
// Read-only, standalone.
//
//   node scripts/phase-8-2a-autofollow-analysis.mjs

import { readFileSync, writeFileSync } from "node:fs";

const BENCHMARKS = ["vanni60", "vanni120", "vanni240"];
const OUT = "tmp/phase82a";

function stats(vals) {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  const pct = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return {
    n: s.length,
    median: +pct(0.5).toFixed(6), p90: +pct(0.9).toFixed(6), p95: +pct(0.95).toFixed(6),
    p99: +pct(0.99).toFixed(6), max: +s[s.length - 1].toFixed(6), mean: +(s.reduce((a, c) => a + c, 0) / s.length).toFixed(6),
  };
}

// Screen-space px, assuming a representative 1280 CSS-px-wide player (used
// only to express normalized deltas in a human-interpretable unit; the
// underlying analysis is unit-agnostic and works identically in normalized
// units -- Part N asks for an objective proxy, not a literal measured
// on-screen size).
const REPRESENTATIVE_PLAYER_WIDTH_PX = 1280;

function derivativesFromPositions(times, xs, ys, scales) {
  // First derivative (velocity), second (acceleration), third (jerk), all
  // computed from REAL consecutive-sample dt (source seconds) -- never a
  // frame-count constant.
  const vx = [], vy = [], vs = [];
  for (let i = 1; i < times.length; i++) {
    const dt = times[i] - times[i - 1];
    if (dt <= 0) { vx.push(0); vy.push(0); vs.push(0); continue; }
    vx.push((xs[i] - xs[i - 1]) / dt);
    vy.push((ys[i] - ys[i - 1]) / dt);
    vs.push((scales[i] - scales[i - 1]) / dt);
  }
  const ax = [], ay = [];
  for (let i = 1; i < vx.length; i++) {
    const dt = times[i + 1] - times[i];
    if (dt <= 0) { ax.push(0); ay.push(0); continue; }
    ax.push((vx[i] - vx[i - 1]) / dt);
    ay.push((vy[i] - vy[i - 1]) / dt);
  }
  const jx = [], jy = [];
  for (let i = 1; i < ax.length; i++) {
    const dt = times[i + 2] - times[i + 1];
    if (dt <= 0) { jx.push(0); jy.push(0); continue; }
    jx.push((ax[i] - ax[i - 1]) / dt);
    jy.push((ay[i] - ay[i - 1]) / dt);
  }
  return { vx, vy, vs, ax, ay, jx, jy };
}

function deltaPx(a, b) {
  return Math.hypot((a.cx - b.cx) * REPRESENTATIVE_PLAYER_WIDTH_PX, (a.cy - b.cy) * REPRESENTATIVE_PLAYER_WIDTH_PX);
}

function analyzeSequence(rows, labelSuffix) {
  const times = rows.map((r) => r.timeS ?? r.presentedTime);
  const xs = rows.map((r) => r.cx);
  const ys = rows.map((r) => r.cy);
  const scales = rows.map((r) => r.scale);
  const deltasPx = [];
  let zeroDeltaCount = 0, nonzeroDeltaCount = 0;
  for (let i = 1; i < rows.length; i++) {
    const d = deltaPx(rows[i], rows[i - 1]);
    deltasPx.push(d);
    if (d < 1e-9) zeroDeltaCount++; else nonzeroDeltaCount++;
  }
  const scaleDeltas = [];
  for (let i = 1; i < rows.length; i++) scaleDeltas.push(Math.abs(scales[i] - scales[i - 1]));

  const { vx, vy, ax, ay, jx, jy } = derivativesFromPositions(times, xs, ys, scales);
  const velMagPxPerS = vx.map((v, i) => Math.hypot(v, vy[i]) * REPRESENTATIVE_PLAYER_WIDTH_PX);
  const accMagPxPerS2 = ax.map((a, i) => Math.hypot(a, ay[i]) * REPRESENTATIVE_PLAYER_WIDTH_PX);
  const jerkMagPxPerS3 = jx.map((j, i) => Math.hypot(j, jy[i]) * REPRESENTATIVE_PLAYER_WIDTH_PX);

  // Simple, non-over-engineered smoothness proxy (Part N): mean of the
  // squared jerk magnitude ("jerk energy") over the whole sequence,
  // normalized by TOTAL SOURCE-TIME DURATION (so different-length windows
  // are comparable per-second, not per-sample).
  const totalDurationS = times[times.length - 1] - times[0];
  const jerkEnergy = jerkMagPxPerS3.reduce((s, j) => s + j * j, 0);
  const jerkEnergyPerSecond = totalDurationS > 0 ? jerkEnergy / totalDurationS : null;

  // Micro-hold detection (Part L/D): a "hold" is a run of consecutive
  // samples where the CSS-px delta between consecutive frames stays under
  // 0.25px (visually imperceptible), immediately followed by a delta at
  // least 4x the hold-run's own max delta (a "release").
  const HOLD_THRESHOLD_PX = 0.25;
  const RELEASE_RATIO = 4;
  const holdReleaseEvents = [];
  let holdStart = null, holdMaxDelta = 0;
  for (let i = 0; i < deltasPx.length; i++) {
    const d = deltasPx[i];
    if (d < HOLD_THRESHOLD_PX) {
      if (holdStart === null) holdStart = i;
      holdMaxDelta = Math.max(holdMaxDelta, d);
    } else {
      if (holdStart !== null && i - holdStart >= 2 && d >= Math.max(RELEASE_RATIO * holdMaxDelta, 0.5)) {
        holdReleaseEvents.push({
          holdStartIndex: holdStart, holdEndIndex: i - 1, holdLengthSamples: i - holdStart,
          holdLengthSourceMs: (times[i] - times[holdStart]) * 1000,
          releaseDeltaPx: +d.toFixed(4), holdMaxDeltaPx: +holdMaxDelta.toFixed(4),
        });
      }
      holdStart = null; holdMaxDelta = 0;
    }
  }

  return {
    label: labelSuffix,
    sampleCount: rows.length,
    totalDurationS: +totalDurationS.toFixed(4),
    perSampleDeltaPx: stats(deltasPx),
    perSampleScaleDelta: stats(scaleDeltas),
    velocityPxPerSourceSecond: stats(velMagPxPerS),
    accelerationPxPerSourceSecond2: stats(accMagPxPerS2),
    jerkPxPerSourceSecond3: stats(jerkMagPxPerS3),
    zeroDeltaSampleCount: zeroDeltaCount,
    nonzeroDeltaSampleCount: nonzeroDeltaCount,
    holdReleaseEventCount: holdReleaseEvents.length,
    holdReleaseEventsTop10ByRelease: holdReleaseEvents.sort((a, b) => b.releaseDeltaPx - a.releaseDeltaPx).slice(0, 10),
    jerkEnergyPerSecond: jerkEnergyPerSecond != null ? +jerkEnergyPerSecond.toFixed(2) : null,
  };
}

// Excludes the one-time INITIAL ACQUISITION transient (the legitimate,
// expected single large jump from the identity/full-frame start state to the
// athlete's first real observed position -- a startup event, not the
// steady-state "in-motion" smoothness the user is describing). Trims to the
// first sample whose presentationState has reached "following"/"anticipating"/
// "reacquiring" at least once, i.e. real continuous tracking has begun.
function trimAcquisitionTransient(rows) {
  const idx = rows.findIndex((r) => r.presentationState === "following" || r.presentationState === "anticipating");
  return idx > 0 ? rows.slice(idx) : rows;
}

const summary = {};
for (const label of BENCHMARKS) {
  const fineData = JSON.parse(readFileSync(`${OUT}/${label}-fine-trace.json`, "utf8"));
  const dispData = JSON.parse(readFileSync(`${OUT}/${label}-display-samples.json`, "utf8"));

  const fineAnalysis = analyzeSequence(trimAcquisitionTransient(fineData.fineTrace), "fine_per_source_frame");

  const perRate = {};
  for (const rateKey of Object.keys(dispData.displaySamples)) {
    perRate[rateKey] = {
      hz60: analyzeSequence(trimAcquisitionTransient(dispData.displaySamples[rateKey].hz60), `display_60hz_${rateKey}`),
      hz120: analyzeSequence(trimAcquisitionTransient(dispData.displaySamples[rateKey].hz120), `display_120hz_${rateKey}`),
    };
  }

  summary[label] = { normFps: fineData.normFps, frameCount: fineData.frameCount, fine: fineAnalysis, display: perRate };

  console.log(`\n=== ${label} (normFps=${fineData.normFps}) ===`);
  console.log("FINE (per real source frame):");
  console.log("  perSampleDeltaPx:", JSON.stringify(fineAnalysis.perSampleDeltaPx));
  console.log("  jerkPxPerSourceSecond3 p95/max:", fineAnalysis.jerkPxPerSourceSecond3?.p95, fineAnalysis.jerkPxPerSourceSecond3?.max);
  console.log("  jerkEnergyPerSecond:", fineAnalysis.jerkEnergyPerSecond);
  console.log("  holdReleaseEventCount:", fineAnalysis.holdReleaseEventCount);
  console.log("DISPLAY-SAMPLED @60Hz, rate=1x:");
  const d60 = perRate.rate_1.hz60;
  console.log("  perSampleDeltaPx:", JSON.stringify(d60.perSampleDeltaPx));
  console.log("  jerkPxPerSourceSecond3 p95/max:", d60.jerkPxPerSourceSecond3?.p95, d60.jerkPxPerSourceSecond3?.max);
  console.log("  jerkEnergyPerSecond:", d60.jerkEnergyPerSecond);
  console.log("  holdReleaseEventCount:", d60.holdReleaseEventCount);
  console.log("  top hold->release event:", JSON.stringify(d60.holdReleaseEventsTop10ByRelease[0] ?? null));
}

writeFileSync(`${OUT}/analysis-summary.json`, JSON.stringify(summary, null, 2));
console.log(`\nWrote ${OUT}/analysis-summary.json`);
