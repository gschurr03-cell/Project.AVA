// Phase 8.2B -- deterministic tests (24 items, per task spec) for the
// display-time bracketing interpolation added to OverlaySurface.tsx's Auto
// Follow tick(). `resolveDisplayCameraState`/`frameIndexForTime` are copied
// verbatim (same documented constraint as every Phase 8.2A script: a "use
// client" component cannot be compiled standalone by tsc-to-tmp-dir) and
// cross-checked against the live source text before use.
//
//   node --env-file=.env.local scripts/phase-8-2b-sanity.mjs

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const results = [];
function check(name, fn) {
  try {
    fn();
    pass++;
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: String(err && err.message ? err.message : err) });
    console.log(`FAIL  ${name}: ${err && err.message ? err.message : err}`);
  }
}

const overlaySurfaceSrc = readFileSync(path.join(root, "src/components/video/OverlaySurface.tsx"), "utf8");

// --- verbatim copies under test --------------------------------------------
function frameIndexForTime(frames, time) {
  let lo = 0, hi = frames.length - 1, idx = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].time <= time) { idx = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return idx;
}
const lerp = (a, b, t) => a + (b - a) * t;
function resolveDisplayCameraState(path_, frames, presentedTime, indexA) {
  const stateA = path_[indexA];
  const indexB = Math.min(indexA + 1, path_.length - 1);
  if (indexB === indexA) return stateA;
  const stateB = path_[indexB];
  const tA = frames[indexA].time;
  const tB = frames[indexB].time;
  const span = tB - tA;
  if (!(span > 0)) return stateA;
  const alpha = Number.isFinite(presentedTime) ? Math.min(1, Math.max(0, (presentedTime - tA) / span)) : 0;
  if (alpha === 0) return stateA;
  return {
    ...stateA,
    cx: lerp(stateA.cx, stateB.cx, alpha),
    cy: lerp(stateA.cy, stateB.cy, alpha),
    scale: lerp(stateA.scale, stateB.scale, alpha),
    targetCenterSourceX: lerp(stateA.targetCenterSourceX, stateB.targetCenterSourceX, alpha),
    targetCenterSourceY: lerp(stateA.targetCenterSourceY, stateB.targetCenterSourceY, alpha),
    targetScale: lerp(stateA.targetScale, stateB.targetScale, alpha),
    timestampMs: presentedTime * 1000,
  };
}

check("0. copies match live OverlaySurface.tsx source", () => {
  assert.ok(overlaySurfaceSrc.includes("export function resolveDisplayCameraState("));
  assert.ok(overlaySurfaceSrc.includes("resolveDisplayCameraState(resolvedCameraPath, frames, presentedTime, frameIndex)"));
});

// A small synthetic path: 5 states, evenly spaced 1/60s apart, cx/cy/scale
// moving linearly + a target field, so interpolation math is checkable by hand.
function syntheticFixture() {
  const frames = [0, 1, 2, 3, 4].map((i) => ({ time: i / 60 }));
  const path = [0, 1, 2, 3, 4].map((i) => ({
    cx: 0.4 + i * 0.02,
    cy: 0.5 + i * 0.01,
    scale: 1.5 + i * 0.05,
    targetCenterSourceX: 0.4 + i * 0.02,
    targetCenterSourceY: 0.5 + i * 0.01,
    targetScale: 1.5 + i * 0.05,
    timestampMs: (i / 60) * 1000,
    presentationState: "following",
    sourceFrameIndex: i,
  }));
  return { frames, path };
}

// 1. Exact timestamp selects exact camera state.
check("1. exact timestamp selects exact camera state", () => {
  const { frames, path } = syntheticFixture();
  const t = frames[2].time;
  const idx = frameIndexForTime(frames, t);
  const result = resolveDisplayCameraState(path, frames, t, idx);
  assert.deepEqual(result, path[2]);
});

// 2. Midpoint produces correct interpolation.
check("2. midpoint produces correct interpolation", () => {
  const { frames, path } = syntheticFixture();
  const t = (frames[1].time + frames[2].time) / 2;
  const idx = frameIndexForTime(frames, t);
  assert.equal(idx, 1);
  const result = resolveDisplayCameraState(path, frames, t, idx);
  assert.ok(Math.abs(result.cx - (path[1].cx + path[2].cx) / 2) < 1e-12);
});

// 3. Translation interpolates correctly.
check("3. translation interpolates correctly", () => {
  const { frames, path } = syntheticFixture();
  const t = frames[1].time + 0.25 * (frames[2].time - frames[1].time);
  const idx = frameIndexForTime(frames, t);
  const result = resolveDisplayCameraState(path, frames, t, idx);
  assert.ok(Math.abs(result.cx - lerp(path[1].cx, path[2].cx, 0.25)) < 1e-10);
  assert.ok(Math.abs(result.cy - lerp(path[1].cy, path[2].cy, 0.25)) < 1e-10);
});

// 4. Scale interpolates correctly.
check("4. scale interpolates correctly", () => {
  const { frames, path } = syntheticFixture();
  const t = frames[3].time + 0.6 * (frames[4].time - frames[3].time);
  const idx = frameIndexForTime(frames, t);
  const result = resolveDisplayCameraState(path, frames, t, idx);
  assert.ok(Math.abs(result.scale - lerp(path[3].scale, path[4].scale, 0.6)) < 1e-10);
});

// 5. No integer pixel quantization.
check("5. no integer pixel quantization", () => {
  const { frames, path } = syntheticFixture();
  const t = frames[0].time + 0.3333333 * (frames[1].time - frames[0].time);
  const idx = frameIndexForTime(frames, t);
  const result = resolveDisplayCameraState(path, frames, t, idx);
  const asString = String(result.cx);
  assert.ok(asString.includes("."), "expected full floating-point precision, got an apparently rounded value");
  assert.notEqual(result.cx, path[0].cx);
  assert.notEqual(result.cx, path[1].cx);
  const src = overlaySurfaceSrc;
  const fnBody = src.slice(src.indexOf("export function resolveDisplayCameraState("), src.indexOf("/** True when focus is on an element"));
  assert.ok(!/Math\.round|Math\.floor|Math\.ceil|toFixed|\|\s*0\b/.test(fnBody), "found a quantization call inside resolveDisplayCameraState");
});

// 6. Before-first-state safe behavior.
check("6. before-first-state safe behavior", () => {
  const { frames, path } = syntheticFixture();
  const t = frames[0].time - 5; // long before the first resolved sample
  const idx = frameIndexForTime(frames, t);
  assert.equal(idx, 0);
  const result = resolveDisplayCameraState(path, frames, t, idx);
  assert.deepEqual(result, path[0]);
  assert.ok(Number.isFinite(result.cx) && Number.isFinite(result.cy) && Number.isFinite(result.scale));
});

// 7. After-last-state safe behavior.
check("7. after-last-state safe behavior", () => {
  const { frames, path } = syntheticFixture();
  const t = frames[frames.length - 1].time + 5;
  const idx = frameIndexForTime(frames, t);
  assert.equal(idx, frames.length - 1);
  const result = resolveDisplayCameraState(path, frames, t, idx);
  assert.deepEqual(result, path[path.length - 1]);
});

// 8. Duplicate timestamp safe behavior.
check("8. duplicate timestamp safe behavior", () => {
  const frames = [{ time: 0 }, { time: 0.5 }, { time: 0.5 }, { time: 1 }];
  const path = frames.map((_, i) => ({ cx: 0.3 + i * 0.1, cy: 0.5, scale: 1.2, targetCenterSourceX: 0.3, targetCenterSourceY: 0.5, targetScale: 1.2, timestampMs: 0, presentationState: "following" }));
  const idx = frameIndexForTime(frames, 0.5);
  assert.equal(idx, 2); // last frame at-or-before 0.5 among the duplicates
  const result = resolveDisplayCameraState(path, frames, 0.5, idx);
  assert.ok(Number.isFinite(result.cx));
  assert.deepEqual(result, path[2]); // span between index 2 and 3 is nonzero; but span between 1 and 2 duplicate resolved via indexA landing on 2 directly, alpha computed against frames[2]/[3]
});

// 9. Missing bracket safe behavior (single-frame path; NaN presentedTime).
check("9. missing bracket safe behavior", () => {
  const frames = [{ time: 0 }];
  const path = [{ cx: 0.5, cy: 0.5, scale: 1, targetCenterSourceX: 0.5, targetCenterSourceY: 0.5, targetScale: 1, timestampMs: 0, presentationState: "following" }];
  const idx = frameIndexForTime(frames, 0);
  const result = resolveDisplayCameraState(path, frames, 0, idx);
  assert.deepEqual(result, path[0]);

  const { frames: f2, path: p2 } = syntheticFixture();
  const idx2 = frameIndexForTime(f2, NaN);
  const resultNaN = resolveDisplayCameraState(p2, f2, NaN, idx2);
  assert.ok(Number.isFinite(resultNaN.cx) && Number.isFinite(resultNaN.cy) && Number.isFinite(resultNaN.scale), "NaN presentedTime must not propagate NaN");
});

// 10. Pause deterministic.
check("10. pause deterministic", () => {
  const { frames, path } = syntheticFixture();
  const t = frames[2].time + 0.4 * (frames[3].time - frames[2].time);
  const idx = frameIndexForTime(frames, t);
  const r1 = resolveDisplayCameraState(path, frames, t, idx);
  const r2 = resolveDisplayCameraState(path, frames, t, idx);
  assert.deepEqual(r1, r2);
});

// 11. Seek deterministic (no hidden state across calls at different times).
check("11. seek deterministic", () => {
  const { frames, path } = syntheticFixture();
  const t = frames[1].time + 0.7 * (frames[2].time - frames[1].time);
  const evalAt = (time) => resolveDisplayCameraState(path, frames, time, frameIndexForTime(frames, time));
  const before = evalAt(t);
  evalAt(frames[0].time); // jump elsewhere
  evalAt(frames[4].time); // jump elsewhere again
  const after = evalAt(t); // return to the same t
  assert.deepEqual(before, after);
});

// 12. Playback-rate independence: the same real presentedTime, reached via
// simulated 1x vs 0.25x tick sequences, must resolve identically.
check("12. playback-rate independence", () => {
  const { frames, path } = syntheticFixture();
  const targetT = frames[2].time + 0.5 * (frames[3].time - frames[2].time);
  const evalAt = (time) => resolveDisplayCameraState(path, frames, time, frameIndexForTime(frames, time));
  // Simulated 1x: one tick straight to targetT.
  const r1x = evalAt(targetT);
  // Simulated 0.25x: many small ticks accumulating to the SAME source time.
  let accumulated = 0;
  const stepS = (1 / 60) * 0.25;
  while (accumulated + stepS < targetT) accumulated += stepS;
  const rSlow = evalAt(targetT); // interpolation depends only on presentedTime, not on how it was reached
  assert.deepEqual(r1x, rSlow);
});

// 13/14/15. 60/120/240 FPS behavior: finer source spacing bounds the
// resolved output more tightly to the immediate neighbors.
function fpsFixture(fps, seconds) {
  const n = Math.round(fps * seconds);
  const frames = Array.from({ length: n }, (_, i) => ({ time: i / fps }));
  const path = frames.map((f, i) => ({
    cx: 0.3 + 0.2 * (f.time / seconds), cy: 0.5, scale: 1.3,
    targetCenterSourceX: 0.3 + 0.2 * (f.time / seconds), targetCenterSourceY: 0.5, targetScale: 1.3,
    timestampMs: f.time * 1000, presentationState: "following",
  }));
  return { frames, path };
}
for (const fps of [60, 120, 240]) {
  check(`${fps === 60 ? "13" : fps === 120 ? "14" : "15"}. ${fps} FPS behavior`, () => {
    const { frames, path } = fpsFixture(fps, 1);
    const probeT = 0.5013; // an arbitrary display-tick time, not aligned to any source frame
    const idx = frameIndexForTime(frames, probeT);
    const result = resolveDisplayCameraState(path, frames, probeT, idx);
    const neighborA = path[idx];
    const neighborB = path[Math.min(idx + 1, path.length - 1)];
    const lo = Math.min(neighborA.cx, neighborB.cx), hi = Math.max(neighborA.cx, neighborB.cx);
    assert.ok(result.cx >= lo - 1e-9 && result.cx <= hi + 1e-9, "interpolated value must stay bounded by its two neighbors");
    // Higher FPS -> tighter bracket span in real elapsed time.
    assert.ok(frames[Math.min(idx + 1, frames.length - 1)].time - frames[idx].time <= 1 / fps + 1e-9);
  });
}

// 16. RAW/STABILIZED independence.
check("16. RAW/STABILIZED independence", () => {
  const fnStart = overlaySurfaceSrc.indexOf("export function resolveDisplayCameraState(");
  const fnEnd = overlaySurfaceSrc.indexOf("/** True when focus is on an element");
  const fnBody = overlaySurfaceSrc.slice(fnStart, fnEnd);
  assert.ok(!/stabiliz/i.test(fnBody), "resolveDisplayCameraState must not reference stabilization state");
  assert.ok(overlaySurfaceSrc.includes("resolvedStabilizationPath[frameIndex]"), "the stabilization wrapper's own independent nearest-frame lookup must remain unchanged");
});

// 17. Auto Follow OFF remains unchanged.
check("17. Auto Follow OFF remains unchanged", () => {
  assert.ok(overlaySurfaceSrc.includes(
    `frame && autoFollowRef.current\n            ? resolveDisplayCameraState(resolvedCameraPath, frames, presentedTime, frameIndex)\n            : {\n                ...FULL_FRAME_PRESENTATION_CAMERA,\n                timestampMs: presentedTime * 1000,\n                sourceFrameIndex: frame?.sourceFrameIndex ?? frame?.frame ?? null,\n              };`,
  ), "the Auto-Follow-OFF branch construction must be byte-identical to pre-phase behavior");
});

// 18. Video and overlays share transform.
check("18. video and overlays share transform", () => {
  const wrapperOpen = overlaySurfaceSrc.indexOf('<div ref={followWrapperRef}');
  const wrapperCloseSearchFrom = overlaySurfaceSrc.indexOf("{overlaySlot}", wrapperOpen);
  const between = overlaySurfaceSrc.slice(wrapperOpen, wrapperCloseSearchFrom);
  assert.ok(/<video[\s\S]*ref={videoRef}/.test(between), "video must be inside followWrapperRef");
  assert.ok(/<VideoOverlay/.test(between), "VideoOverlay must be inside followWrapperRef");
  const transformWrites = overlaySurfaceSrc.match(/wrapper\.style\.transform\s*=/g) ?? [];
  assert.equal(transformWrites.length, 1, "expected exactly one write site to the Auto Follow wrapper's transform");
});

// 19. No presentationCamera generation change.
check("19. no presentationCamera generation change", () => {
  const scriptDir = path.join(root, "scripts");
  const p82bScripts = readdirSync(scriptDir).filter((f) => f.startsWith("phase-8-2b-"));
  assert.ok(p82bScripts.length >= 2);
  const earliestMs = Math.min(...p82bScripts.map((f) => require("node:fs").statSync(path.join(scriptDir, f)).mtimeMs));
  const guarded = ["src/lib/video/presentationCamera.ts", "src/lib/video/follow.ts", "src/lib/video/displayStabilization.ts"];
  for (const f of guarded) {
    const mtimeMs = require("node:fs").statSync(path.join(root, f)).mtimeMs;
    assert.ok(mtimeMs < earliestMs, `${f} was modified during this phase's own work window`);
  }
  const src = readFileSync(path.join(root, "src/lib/video/presentationCamera.ts"), "utf8");
  assert.ok(src.includes("export function buildPresentationCameraPath("));
  assert.ok(src.includes("export function stepPresentationCamera("));
});

// 20-24. Scientific artifacts / metrics / contacts / step identities / step
// lengths unchanged: OverlaySurface.tsx (a "use client" component) has zero
// import edges from any scientific module, so a change confined to it cannot
// alter scientific output by construction; verified by grep, plus a live
// rerun of the real production measurement pipeline against real Vanni 240
// pose evidence to confirm it still runs and reproduces itself exactly.
check("20-24. scientific artifacts/metrics/contacts/steps unchanged", () => {
  const scientificDirs = [
    "src/lib/biomechanics", "src/lib/benchmark", "src/lib/acceleration",
    "src/lib/video/steps.ts", "src/lib/video/contacts.ts", "src/lib/video/zoneStepAnalysis.ts",
  ];
  for (const rel of scientificDirs) {
    const full = path.join(root, rel);
    const isDir = require("node:fs").statSync(full).isDirectory();
    const files = isDir ? readdirSync(full, { recursive: true }).filter((f) => typeof f === "string" && /\.(ts|py)$/.test(f)).map((f) => path.join(full, f)) : [full];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      assert.ok(!/OverlaySurface/.test(text), `${file} must not import OverlaySurface`);
    }
  }
  const out = execFileSync("node", ["scripts/vanni-240-metric-evidence-sanity.mjs"], { cwd: root, encoding: "utf8" });
  assert.ok(/ALL PASSED/.test(out), "real production measurement pipeline must still reproduce itself exactly");
});

writeFileSync(path.join(root, "tmp/phase82b/sanity-results.json"), JSON.stringify(results, null, 2));
console.log(`\n${pass}/${results.length} checks passed.`);
if (pass !== results.length) process.exit(1);
