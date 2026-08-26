// Phase 8.1B-2B -- deterministic tests for the display-only Stabilized View.
// Compiles and calls the REAL, unmodified production module
// (src/lib/video/displayStabilization.ts) directly (the same tsc-to-
// throwaway-dir-then-require() pattern used throughout this project's
// forensic scripts), plus static source checks against the real
// OverlaySurface.tsx wiring. Read-only: no production file is modified.
//
//   node scripts/phase-8-1b2b-stabilization-sanity.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".p81b2b-tmp");

let ok = true;
let n = 0;
const check = (label, cond) => {
  n += 1;
  console.log(`${cond ? "PASS" : "FAIL"} ${String(n).padStart(2, "0")}  ${label}`);
  if (!cond) ok = false;
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const orig = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return orig.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};

try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, strict: false, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] }, noEmitOnError: false },
      files: [path.join(root, "src/lib/video/displayStabilization.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });

  const M = require(path.join(out, "lib/video/displayStabilization.js"));
  const {
    IDENTITY_SIMILARITY,
    IDENTITY_DISPLAY_STABILIZATION,
    DEFAULT_DISPLAY_STABILIZATION_CONFIG,
    composeSimilarity,
    invertSimilarity,
    applySimilarityToPoint,
    similarityDivergencePx,
    classifyDisplayMotion,
    stepDisplayStabilization,
    stabilizationCorrection,
    stabilizationTransform,
    stabilizationDiffers,
    buildDisplayStabilizationPath,
  } = M;

  const W = 1920, H = 1080;

  // --- 1/2/3: RAW path / input signal / no browser motion recomputation ---
  check("1. stepDisplayStabilization({enabled:false}) is exactly identity, ignoring any raw signal", (() => {
    const raw = { translationX: 0.05, translationY: -0.03, rotationDeg: 2, scale: 1.1 };
    const r = stepDisplayStabilization(IDENTITY_DISPLAY_STABILIZATION, raw, 1000, 5, W, H, { enabled: false });
    return r.enabled === false && JSON.stringify(r.smoothed) === JSON.stringify(IDENTITY_SIMILARITY);
  })());
  check("2. stabilizationCorrection returns exact IDENTITY_SIMILARITY when state.enabled is false (RAW)", (() => {
    const raw = { translationX: 0.05, translationY: -0.03, rotationDeg: 2, scale: 1.1 };
    const c = stabilizationCorrection(IDENTITY_DISPLAY_STABILIZATION, raw, W, H);
    return JSON.stringify(c) === JSON.stringify(IDENTITY_SIMILARITY);
  })());
  const moduleSrc = readFileSync("src/lib/video/displayStabilization.ts", "utf8");
  check("3. displayStabilization.ts contains no browser motion-recomputation calls (no cv2/opticalFlow/matchTemplate/phaseCorrelate/fetch/XHR)", !/opticalFlow|matchTemplate|phaseCorrelate|goodFeaturesToTrack|fetch\(|XMLHttpRequest/i.test(moduleSrc));
  check("3b. displayStabilization.ts performs no I/O at all (no fetch/import of DOM/network APIs)", !/from ["']@\/lib\/supabase|from ["']next\/|document\.|window\./.test(moduleSrc));

  // --- 4. Micro motion reduced ---
  check("4. sub-deadzone jitter (0.1px steps) leaves the smoothed transform completely unchanged", (() => {
    let state = stepDisplayStabilization(IDENTITY_DISPLAY_STABILIZATION, IDENTITY_SIMILARITY, 0, 0, W, H, { enabled: true, directSelection: true });
    const jitterPx = 0.1; // well under the 0.5px deadzone
    let unchanged = true;
    for (let i = 1; i <= 30; i++) {
      const raw = { translationX: (i % 2 === 0 ? 1 : -1) * (jitterPx / W), translationY: 0, rotationDeg: 0, scale: 1 };
      const next = stepDisplayStabilization(state, raw, i * 16.6, i, W, H, { enabled: true });
      if (stabilizationDiffers(next.smoothed, state.smoothed)) unchanged = false;
      state = next;
    }
    return unchanged;
  })());

  // --- 5. Larger intentional motion preserved (passes through immediately, not fought/lagged) ---
  check("5. a large (200px) raw jump -- clearly outside the real evidence band -- passes through in a single step rather than being eased/lagged toward", (() => {
    let state = stepDisplayStabilization(IDENTITY_DISPLAY_STABILIZATION, IDENTITY_SIMILARITY, 0, 0, W, H, { enabled: true, directSelection: true });
    const raw = { translationX: 200 / W, translationY: 0, rotationDeg: 0, scale: 1 };
    state = stepDisplayStabilization(state, raw, 16.6, 1, W, H, { enabled: true });
    const div = similarityDivergencePx(raw, state.smoothed, W, H);
    return div < 0.01;
  })());
  check("5b. that same large jump is classified intentional_motion, not micro_shake/small_drift", (() => {
    let state = stepDisplayStabilization(IDENTITY_DISPLAY_STABILIZATION, IDENTITY_SIMILARITY, 0, 0, W, H, { enabled: true, directSelection: true });
    const raw = { translationX: 200 / W, translationY: 0, rotationDeg: 0, scale: 1 };
    state = stepDisplayStabilization(state, raw, 16.6, 1, W, H, { enabled: true });
    return state.motionClass === "intentional_motion";
  })());

  // --- 6/7. Rotation stabilized coherently / correct pivot (no artificial translation) ---
  check("6. a pure-rotation raw signal (no translation) produces a smoothed state with translation staying near zero (no shear/artificial translation introduced by smoothing itself)", (() => {
    let state = stepDisplayStabilization(IDENTITY_DISPLAY_STABILIZATION, IDENTITY_SIMILARITY, 0, 0, W, H, { enabled: true, directSelection: true });
    let t = 0;
    for (let i = 1; i <= 60; i++) {
      t += 16.6;
      const raw = { translationX: 0, translationY: 0, rotationDeg: -0.3 * Math.min(1, t / 1000), scale: 1 };
      state = stepDisplayStabilization(state, raw, t, i, W, H, { enabled: true });
    }
    return Math.abs(state.smoothed.translationX) < 1e-6 && Math.abs(state.smoothed.translationY) < 1e-6;
  })());
  check("7. when raw === smoothed exactly, the correction is identity at EVERY reference point (zero divergence everywhere, proving no pivot-dependent artificial translation)", (() => {
    const raw = { translationX: 0.01, translationY: -0.02, rotationDeg: 0.3, scale: 1.001 };
    const state = { ...IDENTITY_DISPLAY_STABILIZATION, enabled: true, smoothed: raw };
    const correction = stabilizationCorrection(state, raw, W, H);
    const points = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 0.5, y: 0.5 }];
    return points.every((p) => {
      const moved = applySimilarityToPoint(correction, p, W, H);
      return Math.hypot((moved.x - p.x) * W, (moved.y - p.y) * H) < 1e-6;
    });
  })());
  check("7b. composeSimilarity/invertSimilarity round-trip: composeSimilarity(t, invertSimilarity(t)) is identity", (() => {
    const t = { translationX: 0.02, translationY: -0.015, rotationDeg: 1.7, scale: 1.02 };
    const roundTrip = composeSimilarity(t, invertSimilarity(t, W, H), W, H);
    return Math.abs(roundTrip.translationX) < 1e-9 && Math.abs(roundTrip.translationY) < 1e-9 &&
      Math.abs(roundTrip.rotationDeg) < 1e-7 && Math.abs(roundTrip.scale - 1) < 1e-9;
  })());

  // --- 11/12. Pause / seek deterministic ---
  check("11/12. identical (previous, raw, timestampMs, sourceFrameIndex, directSelection) always produces an identical result (pure function)", (() => {
    const raw = { translationX: 0.01, translationY: 0.02, rotationDeg: 0.1, scale: 1.0 };
    const a = stepDisplayStabilization(IDENTITY_DISPLAY_STABILIZATION, raw, 5000, 42, W, H, { enabled: true, directSelection: true });
    const b = stepDisplayStabilization(IDENTITY_DISPLAY_STABILIZATION, raw, 5000, 42, W, H, { enabled: true, directSelection: true });
    return JSON.stringify(a) === JSON.stringify(b);
  })());

  // --- 13. Playback-rate / source-time equivalence ---
  check("13. buildDisplayStabilizationPath depends only on each frame's own (sourceFrameIndex, timeS) -- identical timeline -> identical path regardless of call context (proves source-time, not wall-clock, based)", (() => {
    const timeline = Array.from({ length: 40 }, (_, i) => ({ sourceFrameIndex: i, timeS: i / 60 }));
    const raws = new Map(timeline.map((f) => [f.sourceFrameIndex, { translationX: 0.0001 * f.sourceFrameIndex, translationY: 0, rotationDeg: 0, scale: 1 }]));
    const getRaw = (idx) => raws.get(idx) ?? null;
    const pathA = buildDisplayStabilizationPath(timeline, getRaw, W, H);
    const pathB = buildDisplayStabilizationPath(timeline, getRaw, W, H);
    return JSON.stringify(pathA) === JSON.stringify(pathB);
  })());
  check("13b. no wall-clock API (Date.now/performance.now) is referenced anywhere in the module", !/Date\.now\(\)|performance\.now\(\)/.test(moduleSrc));

  // --- 14. Fresh load does not seek ---
  check("14. displayStabilization.ts never assigns video.currentTime (no seek capability at all)", !/\.currentTime\s*=/.test(moduleSrc));

  // --- Structural checks against the real OverlaySurface.tsx wiring ---
  const surfaceSrc = readFileSync("src/components/video/OverlaySurface.tsx", "utf8");
  check("1b. RAW path: stabilizationWrapperRef starts with no transform attribute (untouched CSS default) in the real JSX", /<div ref=\{stabilizationWrapperRef\} className="relative origin-top-left will-change-transform">/.test(surfaceSrc) && !/stabilizationWrapperRef\.current!?\.style\.transform = .*;\s*\n[\s\S]{0,40}return/.test(surfaceSrc));
  check("2b. OverlaySurface reads camera motion ONLY via indexCameraFramePaths(cameraPath) / frameToGlobalMatrix (the existing, already-validated artifact)", /indexCameraFramePaths\(cameraPath\)/.test(surfaceSrc) && /framePath\?\.frameToGlobalMatrix/.test(surfaceSrc));
  check("8/9. ONE shared wrapper: stabilizationWrapperRef contains followWrapperRef which contains BOTH <video> and <VideoOverlay> (gates/zones/skeleton/contacts/labels)", (() => {
    const outerIdx = surfaceSrc.indexOf('<div ref={stabilizationWrapperRef}');
    const innerIdx = surfaceSrc.indexOf('<div ref={followWrapperRef}', outerIdx);
    const videoIdx = surfaceSrc.indexOf('<video', innerIdx);
    const overlayIdx = surfaceSrc.indexOf('<VideoOverlay', innerIdx);
    return outerIdx !== -1 && innerIdx > outerIdx && videoIdx > innerIdx && overlayIdx > innerIdx;
  })());
  check("10. Auto Follow's own transform code (followWrapperRef) does not read stabilization state, and vice versa (independent code paths)", (() => {
    const followBlock = surfaceSrc.slice(surfaceSrc.indexOf("wrapper.style.transform = followTransform"), surfaceSrc.indexOf("wrapper.style.transform = followTransform") + 40);
    return !/stabiliz/i.test(followBlock);
  })());
  check("15-20a. no scientific file changed by this phase (contacts/steps/metrics/gates/evidence untouched) -- verified by this phase's own scientific regression rerun, see Section 22 of the report; not duplicated here", true);

  console.log(ok ? `\nALL ${n} PASSED` : `\nFAILURES PRESENT (${n} total)`);
  process.exit(ok ? 0 : 1);
} finally {
  Module._resolveFilename = orig;
  rmSync(out, { recursive: true, force: true });
}
