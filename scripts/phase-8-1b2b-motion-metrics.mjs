// Phase 8.1B-2B Part S -- before/after (RAW vs STABILIZED) motion metrics for
// Vanni 240, Vanni 120, Vanni 60's real post-exit tails. Calls the REAL,
// unmodified production `displayStabilization.ts` module directly against
// each benchmark's real, current, live-verified `cameraPath` artifact
// (`frameToGlobalMatrix`, the exact same per-frame data VideoOverlay.tsx's
// gate/contact rendering already consumes). Read-only, standalone.
//
//   node scripts/phase-8-1b2b-motion-metrics.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".p81b2b-metrics-tmp");
const OUT_DIR = path.join(root, "tmp/phase81b2b");
mkdirSync(OUT_DIR, { recursive: true });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const orig = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return orig.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};

const BENCHMARKS = {
  vanni120: { pose: "tmp/phase80a/vanni120.pose.json", refFrame: 295, endFrame: 482, fps: 120.005 },
  vanni240: { pose: "tmp/phase80a/vanni240.pose.json", refFrame: 560, endFrame: 1019, fps: 239.981 },
  vanni60: { pose: "tmp/phase80a/vanni60.pose.json", refFrame: 145, endFrame: 232, fps: 56.53006510915358 },
};

function stats(vals) {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  return {
    median: +s[Math.floor(s.length / 2)].toFixed(4),
    p95: +s[Math.min(s.length - 1, Math.floor(s.length * 0.95))].toFixed(4),
    max: +s[s.length - 1].toFixed(4),
    mean: +(s.reduce((a, c) => a + c, 0) / s.length).toFixed(4),
  };
}

try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, strict: false, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] }, noEmitOnError: false },
      files: [path.join(root, "src/lib/video/displayStabilization.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });

  const {
    buildDisplayStabilizationPath,
    applySimilarityToPoint,
    similarityDivergencePx,
  } = require(path.join(out, "lib/video/displayStabilization.js"));

  const W = 1920, H = 1080;
  const BG_CENTER = { x: 0.5, y: 0.5 };
  const FAR_ANCHOR = { x: 0.95, y: 0.95 }; // worst-case lever-arm point, matching Phase 8.1A/8.1B methodology

  const summary = {};

  for (const [label, cfg] of Object.entries(BENCHMARKS)) {
    const seq = JSON.parse(readFileSync(path.join(root, cfg.pose), "utf8"));
    const fpByIndex = new Map(seq.cameraPath.framePaths.map((r) => [r.frameIndex, r]));
    const timeline = [];
    for (let i = cfg.refFrame; i <= cfg.endFrame; i++) {
      timeline.push({ sourceFrameIndex: i, timeS: i / cfg.fps });
    }
    const getRaw = (idx) => {
      const row = fpByIndex.get(idx);
      const m = row?.frameToGlobalMatrix;
      if (!m) return null;
      return { translationX: m.translationX, translationY: m.translationY, rotationDeg: m.rotationDeg, scale: m.scale };
    };
    const pathEntries = buildDisplayStabilizationPath(timeline, getRaw, W, H);

    // Fixed-anchor screen position under RAW (raw per-frame transform inverse
    // applied conceptually the same way VideoOverlay's globalPointToFrame
    // does) vs STABILIZED (smoothed transform). Both expressed as the
    // anchor's displacement from its OWN first-frame position, for BOTH
    // bgCenter (translation-dominated read) and a far corner (rotation
    // lever-arm-dominated read), matching Phase 8.1A/8.1B's own methodology.
    const rawBg = [], stabBg = [], rawFar = [], stabFar = [];
    const rawFrameDeltas = [], stabFrameDeltas = [];
    const rawRotDeltas = [], stabRotDeltas = [];
    const lagPx = [];
    let prevRaw = null, prevStab = null;
    const refRawBg = applySimilarityToPoint(pathEntries[0].raw ?? { translationX: 0, translationY: 0, rotationDeg: 0, scale: 1 }, BG_CENTER, W, H);
    const refStabBg = applySimilarityToPoint(pathEntries[0].state.smoothed, BG_CENTER, W, H);
    const refRawFar = applySimilarityToPoint(pathEntries[0].raw ?? { translationX: 0, translationY: 0, rotationDeg: 0, scale: 1 }, FAR_ANCHOR, W, H);
    const refStabFar = applySimilarityToPoint(pathEntries[0].state.smoothed, FAR_ANCHOR, W, H);

    for (const entry of pathEntries) {
      const raw = entry.raw;
      if (!raw) continue;
      const rawBgP = applySimilarityToPoint(raw, BG_CENTER, W, H);
      const stabBgP = applySimilarityToPoint(entry.state.smoothed, BG_CENTER, W, H);
      const rawFarP = applySimilarityToPoint(raw, FAR_ANCHOR, W, H);
      const stabFarP = applySimilarityToPoint(entry.state.smoothed, FAR_ANCHOR, W, H);
      rawBg.push(Math.hypot((rawBgP.x - refRawBg.x) * W, (rawBgP.y - refRawBg.y) * H));
      stabBg.push(Math.hypot((stabBgP.x - refStabBg.x) * W, (stabBgP.y - refStabBg.y) * H));
      rawFar.push(Math.hypot((rawFarP.x - refRawFar.x) * W, (rawFarP.y - refRawFar.y) * H));
      stabFar.push(Math.hypot((stabFarP.x - refStabFar.x) * W, (stabFarP.y - refStabFar.y) * H));
      if (prevRaw) {
        const prevRawBgP = applySimilarityToPoint(prevRaw, BG_CENTER, W, H);
        rawFrameDeltas.push(Math.hypot((rawBgP.x - prevRawBgP.x) * W, (rawBgP.y - prevRawBgP.y) * H));
        rawRotDeltas.push(Math.abs(raw.rotationDeg - prevRaw.rotationDeg));
      }
      if (prevStab) {
        const prevStabBgP = applySimilarityToPoint(prevStab, BG_CENTER, W, H);
        stabFrameDeltas.push(Math.hypot((stabBgP.x - prevStabBgP.x) * W, (stabBgP.y - prevStabBgP.y) * H));
        stabRotDeltas.push(Math.abs(entry.state.smoothed.rotationDeg - prevStab.rotationDeg));
      }
      lagPx.push(similarityDivergencePx(raw, entry.state.smoothed, W, H));
      prevRaw = raw;
      prevStab = entry.state.smoothed;
    }

    summary[label] = {
      window: { refFrame: cfg.refFrame, endFrame: cfg.endFrame, fps: cfg.fps, frameCount: pathEntries.length },
      raw: {
        bgCenterScreenMotionPx: stats(rawBg),
        farAnchorScreenMotionPx: stats(rawFar),
        frameToFrameTranslationDeltaPx: stats(rawFrameDeltas),
        frameToFrameRotationDeltaDeg: stats(rawRotDeltas),
      },
      stabilized: {
        bgCenterScreenMotionPx: stats(stabBg),
        farAnchorScreenMotionPx: stats(stabFar),
        frameToFrameTranslationDeltaPx: stats(stabFrameDeltas),
        frameToFrameRotationDeltaDeg: stats(stabRotDeltas),
      },
      stabilizationLagPx: stats(lagPx),
      motionClassHistogram: pathEntries.reduce((h, e) => { h[e.state.motionClass] = (h[e.state.motionClass] ?? 0) + 1; return h; }, {}),
    };
    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(summary[label], null, 1));
  }

  writeFileSync(path.join(OUT_DIR, "motion-metrics.json"), JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${path.join(OUT_DIR, "motion-metrics.json")}`);
} finally {
  Module._resolveFilename = orig;
  rmSync(out, { recursive: true, force: true });
}
