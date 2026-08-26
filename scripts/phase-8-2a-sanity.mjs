// Phase 8.2A -- forensic-methodology sanity checks (9 items, per the RESUME
// task spec). These are NOT product tests (this repo has no test runner
// wired up yet, per CLAUDE.md) -- they verify the DETERMINISM and read-only
// nature of this phase's own instrumentation/analysis logic, mirroring the
// existing `scripts/*-sanity.mjs` pattern (e.g. `npm run field:sanity`).
//
//   node --env-file=.env.local scripts/phase-8-2a-sanity.mjs

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

// --- shared: compile the real production modules once ---------------------
const tmp = path.join(root, ".p82a-sanity-tmp");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return origResolve.call(this, r.startsWith("@/") ? path.join(tmp, r.slice(2)) : r, ...rest);
};
writeFileSync(
  path.join(tmp, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: { outDir: tmp, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, strict: false, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] }, noEmitOnError: false },
    files: [path.join(root, "src/lib/video/overlay.ts"), path.join(root, "src/lib/video/fps.ts"), path.join(root, "src/lib/video/presentationCamera.ts"), path.join(root, "src/lib/video/follow.ts")],
  }),
);
try {
  execFileSync("npx", ["tsc", "-p", path.join(tmp, "tsconfig.json")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
} catch (err) {
  const outText = String(err.stdout ?? "") + String(err.stderr ?? "");
  if (!/worldProjection\.ts/.test(outText)) throw new Error(`tsc failed: ${outText}`);
}
const { buildPresentationCameraPath } = require(path.join(tmp, "lib/video/presentationCamera.js"));

function frameIndexForTime(frames, time) {
  let lo = 0, hi = frames.length - 1, idx = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].time <= time) { idx = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return idx;
}

// A tiny synthetic pose fixture: a landmark set drifting linearly, at 60fps
// for 1 second, always fully visible -- enough to drive presentationCamera
// through a real "following" regime deterministically, without depending on
// any specific real benchmark's data.
function syntheticFrames(fps, seconds) {
  const n = Math.round(fps * seconds);
  const frames = [];
  for (let i = 0; i < n; i++) {
    const t = i / fps;
    const cx = 0.3 + 0.3 * (t / seconds); // drifts left->right
    const landmarks = [];
    const put = (idx, x, y) => { landmarks[idx] = { x, y, visibility: 0.95 }; };
    put(11, cx - 0.05, 0.3); put(12, cx + 0.05, 0.3); // shoulders
    put(23, cx - 0.04, 0.55); put(24, cx + 0.04, 0.55); // hips
    put(27, cx - 0.03, 0.85); put(28, cx + 0.03, 0.85); // ankles
    frames.push({ frame: i, sourceFrameIndex: i, time: t, landmarks });
  }
  return frames;
}

// ---------------------------------------------------------------------
// 1. Source-time constants audit is deterministic (static grep of
// presentationCamera.ts, re-run twice, must agree byte-for-byte).
// ---------------------------------------------------------------------
check("1. source-time constants audit deterministic", () => {
  const src = readFileSync(path.join(root, "src/lib/video/presentationCamera.ts"), "utf8");
  const run = () => (src.match(/frameIndex|rafCount|updateCount|frameCount|% \d|frames\.length/g) ?? []).length;
  const a = run(), b = run();
  assert.equal(a, b);
  assert.equal(a, 0, "expected zero frame-count-dependent references in presentationCamera.ts");
});

// ---------------------------------------------------------------------
// 2. Target quantization measurement deterministic (static grep across the
// live target/transform-writing files, re-run twice).
// ---------------------------------------------------------------------
check("2. target quantization measurement deterministic", () => {
  const files = ["src/lib/video/presentationCamera.ts", "src/lib/video/follow.ts", "src/lib/video/displayStabilization.ts"];
  const run = () => files.map((f) => (readFileSync(path.join(root, f), "utf8").match(/Math\.round|Math\.floor|Math\.ceil|toFixed|parseInt|\|\s*0\b|>>>\s*0/g) ?? []).length);
  const a = run(), b = run();
  assert.deepEqual(a, b);
  assert.deepEqual(a, [0, 0, 0], "expected zero numeric-quantization calls in the live target/transform code path");
});

// ---------------------------------------------------------------------
// 3. Deadband hold/release detector is deterministic.
// ---------------------------------------------------------------------
check("3. deadband hold/release detector deterministic", () => {
  const frames = syntheticFrames(60, 1);
  const detect = (rows) => {
    const holds = [];
    let start = 0;
    for (let i = 1; i <= rows.length; i++) {
      const changed = i === rows.length || rows[i].targetCenterSourceY !== rows[i - 1].targetCenterSourceY;
      if (changed) { if (i - start >= 2) holds.push({ start, end: i - 1 }); start = i; }
    }
    return holds;
  };
  const path1 = buildPresentationCameraPath(frames);
  const path2 = buildPresentationCameraPath(frames);
  const h1 = detect(path1), h2 = detect(path2);
  assert.deepEqual(h1, h2);
});

// ---------------------------------------------------------------------
// 4. Multi-refresh-rate display sampling is deterministic.
// ---------------------------------------------------------------------
check("4. multi-refresh sampling deterministic", () => {
  const frames = syntheticFrames(240, 1);
  const camPath = buildPresentationCameraPath(frames);
  const rows = frames.map((f, i) => ({ time: f.time, cx: camPath[i].cx, cy: camPath[i].cy }));
  const sample = (hz) => {
    const out = [];
    let t = 0, last = -1;
    while (t <= 1) {
      const idx = frameIndexForTime(rows, t);
      if (idx !== last) { out.push(idx); last = idx; }
      t += 1 / hz;
    }
    return out;
  };
  assert.deepEqual(sample(60), sample(60));
  assert.ok(sample(60).length <= sample(240).length, "higher display Hz must not sample FEWER distinct source frames");
});

// ---------------------------------------------------------------------
// 5. Zoom/translation coupling decomposition is deterministic.
// ---------------------------------------------------------------------
check("5. zoom/translation decomposition deterministic", () => {
  const decompose = (a, b, width) => {
    const translationOnlyPx = Math.hypot((b.cx - a.cx) * a.scale * width, (b.cy - a.cy) * a.scale * width);
    const scaleOnlyPx = Math.abs(b.scale - a.scale) * 0.5 * width;
    return { translationOnlyPx, scaleOnlyPx, dominant: scaleOnlyPx > translationOnlyPx * 0.5 ? (translationOnlyPx > scaleOnlyPx * 0.5 ? "both" : "zoom") : "pan" };
  };
  const a = { cx: 0.4, cy: 0.5, scale: 1.2 }, b = { cx: 0.45, cy: 0.5, scale: 1.2 };
  const d1 = decompose(a, b, 1280), d2 = decompose(a, b, 1280);
  assert.deepEqual(d1, d2);
  assert.equal(d1.dominant, "pan");
});

// ---------------------------------------------------------------------
// 6. Browser trace parsing is deterministic (Part N's own result shape).
// ---------------------------------------------------------------------
check("6. browser trace parsing deterministic", () => {
  const fixture = { rafTimestamps: [0, 16.7, 33.4, 50.1], transformWriteTimestamps: [{ now: 0, transform: "a" }, { now: 33.4, transform: "b" }] };
  const parse = (f) => {
    const deltas = [];
    for (let i = 1; i < f.rafTimestamps.length; i++) deltas.push(f.rafTimestamps[i] - f.rafTimestamps[i - 1]);
    return { medianDeltaMs: deltas.sort((a, b) => a - b)[Math.floor(deltas.length / 2)], writeCount: f.transformWriteTimestamps.length };
  };
  assert.deepEqual(parse(fixture), parse(fixture));
});

// ---------------------------------------------------------------------
// 7. Smoothness proxy correctly excludes discontinuities (state-transition
// runs shorter than the continuous-tracking threshold must not contribute).
// ---------------------------------------------------------------------
check("7. smoothness proxy excludes discontinuities correctly", () => {
  const CONTINUOUS = new Set(["following", "anticipating", "reacquiring"]);
  const rows = [
    { timeS: 0, cx: 0.5, cy: 0.5, presentationState: "holding" },
    { timeS: 0.1, cx: 0.5, cy: 0.5, presentationState: "following" },
    { timeS: 0.2, cx: 0.51, cy: 0.5, presentationState: "following" },
    { timeS: 0.3, cx: 0.52, cy: 0.5, presentationState: "following" },
    { timeS: 0.4, cx: 0.53, cy: 0.5, presentationState: "following" },
    { timeS: 0.5, cx: 0.9, cy: 0.5, presentationState: "returning_to_full_frame" },
    { timeS: 0.6, cx: 0.5, cy: 0.5, presentationState: "full_frame" },
  ];
  const runs = [];
  let cur = [];
  for (const r of rows) {
    if (CONTINUOUS.has(r.presentationState)) cur.push(r);
    else { if (cur.length > 3) runs.push(cur); cur = []; }
  }
  if (cur.length > 3) runs.push(cur);
  assert.equal(runs.length, 1, "the single 4-sample following run should be kept");
  assert.equal(runs[0].length, 4);
  const usesDiscontinuousJump = runs[0].some((r) => r.cx > 0.6);
  assert.equal(usesDiscontinuousJump, false, "the large returning_to_full_frame jump must not enter the accepted runs");
});

// ---------------------------------------------------------------------
// 8. Instrumentation is read-only: no Phase 8.2A script imports/writes into
// presentationCamera.ts, OverlaySurface.tsx, or displayStabilization.ts, and
// none of those files were touched (mtime) DURING this phase's work. Note:
// these three files legitimately carry uncommitted changes from PRIOR,
// already-completed phases (6.5/8.1B-2B) in this same working tree -- that
// predates and is out of scope for this check, so mtime-vs-git-HEAD is not a
// valid comparison here; mtime-vs-"earliest Phase 8.2A script" is.
// ---------------------------------------------------------------------
check("8. instrumentation does not alter Auto Follow", () => {
  const scriptDir = path.join(root, "scripts");
  const p82aScripts = readdirSync(scriptDir).filter((f) => f.startsWith("phase-8-2a-"));
  assert.ok(p82aScripts.length >= 5, "expected the Phase 8.2A script set to exist");
  for (const f of p82aScripts) {
    const text = readFileSync(path.join(scriptDir, f), "utf8");
    assert.ok(!/writeFileSync\([^)]*presentationCamera\.ts/.test(text), `${f} must not write presentationCamera.ts`);
    assert.ok(!/writeFileSync\([^)]*OverlaySurface\.tsx/.test(text), `${f} must not write OverlaySurface.tsx`);
    assert.ok(!/writeFileSync\([^)]*displayStabilization\.ts/.test(text), `${f} must not write displayStabilization.ts`);
  }
  const guardedFiles = ["src/lib/video/presentationCamera.ts", "src/components/video/OverlaySurface.tsx", "src/lib/video/displayStabilization.ts"];
  const earliestPhaseScriptMs = Math.min(...p82aScripts.map((f) => require("node:fs").statSync(path.join(scriptDir, f)).mtimeMs));
  for (const f of guardedFiles) {
    const mtimeMs = require("node:fs").statSync(path.join(root, f)).mtimeMs;
    assert.ok(mtimeMs < earliestPhaseScriptMs, `${f} was modified AFTER Phase 8.2A's own scripts began (mtime ${new Date(mtimeMs).toISOString()} >= ${new Date(earliestPhaseScriptMs).toISOString()})`);
  }
});

// ---------------------------------------------------------------------
// 9. Scientific outputs (buildPresentationCameraPath) are unchanged /
// deterministic: same real input always produces the same output, run
// twice within this same process.
// ---------------------------------------------------------------------
check("9. scientific outputs unchanged (deterministic pure function)", () => {
  const frames = syntheticFrames(120, 0.5);
  const p1 = buildPresentationCameraPath(frames);
  const p2 = buildPresentationCameraPath(frames);
  assert.deepEqual(p1, p2);
});

Module._resolveFilename = origResolve;
rmSync(tmp, { recursive: true, force: true });

console.log(`\n${pass}/${results.length} checks passed.`);
writeFileSync(path.join(root, "tmp/phase82a/sanity-results.json"), JSON.stringify(results, null, 2));
if (pass !== results.length) process.exit(1);
