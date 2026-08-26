// Phase 4.2H (Part B) — real coast-distance audit. For each of the 4 real
// benchmarks, walks the real, freshly-rerun pose artifact (with Phase 4.2G's
// provenance fields now correctly threaded through — see the Phase 4.2H
// report for the real gap this fixed) and reconstructs every
// verified-confirmation "coast" interval (the stretch of frames between one
// identity-verified detector confirmation and the next), reporting real,
// measured evidence: elapsed time, frame count, pixel/frame-width
// displacement, background-risk trend, trajectory residual, and the actual
// outcome.
//
//   node scripts/phase-4-2h-coast-distance-audit.mjs

import { readFileSync } from "node:fs";

const FILES = {
  gav: "tmp/phase42h/gav.pose.json",
  vanni240: "tmp/phase42h/vanni240.pose.json",
  vanni120: "tmp/phase42h/vanni120.pose.json",
  vanni60: "tmp/phase42h/vanni60.pose.json",
};

function summarize(name, path) {
  const d = JSON.parse(readFileSync(path, "utf8"));
  const frames = d.frames;
  const width = frames[0]?.sourceWidth ?? 1;

  // Walk frames, splitting into coast intervals at every verified
  // (detected/reacquired) confirmation.
  const intervals = [];
  let cur = null;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const verified = f.boxOrigin === "detected" || f.boxOrigin === "reacquired";
    if (verified) {
      if (cur) intervals.push(cur);
      cur = { startFrame: i, frames: [], endedBy: "next_confirmation" };
      continue;
    }
    if (cur) cur.frames.push(f);
  }
  if (cur) {
    cur.endedBy = "clip_end";
    intervals.push(cur);
  }

  const rows = intervals
    .filter((iv) => iv.frames.length > 0)
    .map((iv) => {
      const fs = iv.frames;
      const last = fs[fs.length - 1];
      const timeMsValues = fs.map((f) => f.timeSinceVerifiedDetectorMs).filter((v) => v != null);
      const distFwValues = fs.map((f) => f.distanceSinceVerifiedDetectorFrameWidths).filter((v) => v != null);
      const bgRiskValues = fs.map((f) => f.backgroundRiskFeatureRatio).filter((v) => v != null);
      const trajResValues = fs.map((f) => f.trajectoryResidualPx).filter((v) => v != null);
      const anyProtection = fs.some((f) => f.flowProtectionActive);
      const anyFrozenSuspect = fs.some((f) => f.boxOrigin === "frozen_suspect");
      const finalOrigin = last.boxOrigin;
      const finalTrackState = last.trackState;
      let outcome = "safe";
      if (anyFrozenSuspect) outcome = "false_lock_then_corrected";
      else if (finalTrackState === "reacquiring" || finalTrackState === "lost" || finalTrackState === "terminated") outcome = "reacquisition_or_exit";
      else if (anyProtection) outcome = "degraded_but_protected";
      else if (bgRiskValues.length && Math.max(...bgRiskValues) >= 0.4) outcome = "elevated_risk_unprotected";
      return {
        startFrame: iv.startFrame,
        frameCount: fs.length,
        peakTimeMs: timeMsValues.length ? Math.max(...timeMsValues) : null,
        peakDistFw: distFwValues.length ? Math.max(...distFwValues) : null,
        peakBgRisk: bgRiskValues.length ? Math.max(...bgRiskValues) : null,
        peakTrajResPx: trajResValues.length ? Math.max(...trajResValues) : null,
        peakTrajResFw: trajResValues.length ? Math.max(...trajResValues) / width : null,
        anyProtection,
        anyFrozenSuspect,
        finalOrigin,
        finalTrackState,
        endedBy: iv.endedBy,
        outcome,
      };
    });

  const outcomeCounts = {};
  for (const r of rows) outcomeCounts[r.outcome] = (outcomeCounts[r.outcome] ?? 0) + 1;

  console.log(`\n=== ${name} (${frames.length} frames, width=${width}px) ===`);
  console.log(`  intervals: ${rows.length}, outcome breakdown: ${JSON.stringify(outcomeCounts)}`);
  const peakTimes = rows.map((r) => r.peakTimeMs).filter((v) => v != null);
  const peakDists = rows.map((r) => r.peakDistFw).filter((v) => v != null);
  if (peakTimes.length) {
    console.log(`  peakTimeMs per interval: min=${Math.min(...peakTimes).toFixed(1)} max=${Math.max(...peakTimes).toFixed(1)} median=${median(peakTimes).toFixed(1)}`);
  }
  if (peakDists.length) {
    console.log(`  peakDistFw per interval: min=${Math.min(...peakDists).toFixed(4)} max=${Math.max(...peakDists).toFixed(4)} median=${median(peakDists).toFixed(4)}`);
  }
  // Longest / riskiest intervals, printed in full for manual inspection.
  const risky = rows.filter((r) => r.outcome !== "safe");
  console.log(`  non-safe intervals (${risky.length}):`);
  for (const r of risky) {
    console.log(`    frame ${r.startFrame} +${r.frameCount}f  peakTimeMs=${r.peakTimeMs?.toFixed(1)} peakDistFw=${r.peakDistFw?.toFixed(4)} peakBgRisk=${r.peakBgRisk?.toFixed(2)} peakTrajResFw=${r.peakTrajResFw?.toFixed(4)} outcome=${r.outcome} endedBy=${r.endedBy} finalTrackState=${r.finalTrackState}`);
  }
  return rows;
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const all = {};
for (const [name, path] of Object.entries(FILES)) {
  all[name] = summarize(name, path);
}

console.log("\n\n=== Cross-benchmark summary ===");
for (const [name, rows] of Object.entries(all)) {
  const safe = rows.filter((r) => r.outcome === "safe").length;
  console.log(`${name}: ${rows.length} intervals, ${safe} safe, ${rows.length - safe} non-safe`);
}
