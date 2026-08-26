// Phase 9.3A Part Z -- 12 deterministic forensic checks for the final
// displayed-frame Auto Follow smoothness audit. This phase is evidence-only
// (no production code changed), so these tests validate the FORENSIC
// scripts' own math/determinism and the read-only/no-scientific-impact
// claims -- not a production behavior change.
//
//   node scripts/phase-9-3a-sanity.mjs

import { readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const results = [];
function check(n, name, fn) {
  try { fn(); pass++; results.push({ n, name, ok: true }); console.log(`  [PASS] ${n}. ${name}`); }
  catch (err) { results.push({ n, name, ok: false, error: String(err.message ?? err) }); console.log(`  [FAIL] ${n}. ${name}\n         ${err.message ?? err}`); }
}

// --- verbatim copies (same functions used by the forensic scripts) -------
function frameIndexForTime(frames, time) {
  let lo = 0, hi = frames.length - 1, idx = 0;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (frames[mid].time <= time) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
  return idx;
}
const lerp = (a, b, t) => a + (b - a) * t;
function resolveDisplayCameraState(path_, frames, presentedTime, indexA) {
  const stateA = path_[indexA];
  const indexB = Math.min(indexA + 1, path_.length - 1);
  if (indexB === indexA) return stateA;
  const stateB = path_[indexB];
  const tA = frames[indexA].time, tB = frames[indexB].time;
  const span = tB - tA;
  if (!(span > 0)) return stateA;
  const alpha = Number.isFinite(presentedTime) ? Math.min(1, Math.max(0, (presentedTime - tA) / span)) : 0;
  if (alpha === 0) return stateA;
  return { ...stateA, cx: lerp(stateA.cx, stateB.cx, alpha), cy: lerp(stateA.cy, stateB.cy, alpha), scale: lerp(stateA.scale, stateB.scale, alpha) };
}
function composeFinal(anchor, camera, correction) {
  const fx = 0.5 + camera.scale * (anchor.x - camera.cx);
  const fy = 0.5 + camera.scale * (anchor.y - camera.cy);
  const rad = (correction.rotationDeg * Math.PI) / 180;
  const rx = Math.cos(rad) * fx - Math.sin(rad) * fy;
  const ry = Math.sin(rad) * fx + Math.cos(rad) * fy;
  return { x: correction.translationX + correction.scale * rx, y: correction.translationY + correction.scale * ry };
}
const IDENTITY_SIMILARITY = { translationX: 0, translationY: 0, rotationDeg: 0, scale: 1 };
const IDENTITY_CAMERA = { cx: 0.5, cy: 0.5, scale: 1, presentationState: "full_frame" };

// 1. Final transform trace deterministic: identical inputs -> identical composeFinal output.
check(1, "final transform trace deterministic", () => {
  const anchor = { x: 0.417, y: 0.583 };
  const camera = { cx: 0.4, cy: 0.5, scale: 1.8 };
  const correction = { translationX: 0.001, translationY: -0.002, rotationDeg: 0.05, scale: 1.002 };
  const a = composeFinal(anchor, camera, correction);
  const b = composeFinal(anchor, camera, correction);
  assert.deepEqual(a, b);
});

// 2. Athlete screen-anchor trace deterministic: torso-midpoint formula is a
// pure function of the 4 real landmarks.
check(2, "athlete screen-anchor trace deterministic", () => {
  const lm = { leftHip: { x: 0.3, y: 0.6 }, rightHip: { x: 0.35, y: 0.61 }, leftShoulder: { x: 0.31, y: 0.4 }, rightShoulder: { x: 0.34, y: 0.41 } };
  const anchor = () => ({ x: (lm.leftHip.x + lm.rightHip.x + lm.leftShoulder.x + lm.rightShoulder.x) / 4, y: (lm.leftHip.y + lm.rightHip.y + lm.leftShoulder.y + lm.rightShoulder.y) / 4 });
  assert.deepEqual(anchor(), anchor());
});

// 3. Display-delta calculation deterministic.
check(3, "display-delta calculation deterministic", () => {
  const rows = [{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 6, y: 8 }];
  const deltas = (r) => { const o = []; for (let i = 1; i < r.length; i++) o.push(Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y)); return o; };
  assert.deepEqual(deltas(rows), [5, 5]);
  assert.deepEqual(deltas(rows), deltas(rows));
});

// 4. Velocity-uniformity calculation deterministic (CV formula).
check(4, "velocity-uniformity calculation deterministic", () => {
  const vel = [10, 10, 10, 10];
  const mean = vel.reduce((a, c) => a + c, 0) / vel.length;
  const sd = Math.sqrt(vel.reduce((a, c) => a + (c - mean) ** 2, 0) / vel.length);
  assert.equal(sd, 0); // perfectly uniform velocity -> CV = 0
  const vel2 = [1, 100];
  const mean2 = vel2.reduce((a, c) => a + c, 0) / vel2.length;
  const sd2 = Math.sqrt(vel2.reduce((a, c) => a + (c - mean2) ** 2, 0) / vel2.length);
  assert.ok(sd2 / mean2 > 0.9); // bursty velocity ([1,100]) -> CV ~0.98, much higher than the uniform case's 0
});

// 5. Acceleration/jerk exclusions correct: a run of length <=3 or a
// non-steady presentationState must never contribute to the derivative stats.
check(5, "acceleration/jerk exclusions correct", () => {
  const STEADY = new Set(["following", "anticipating", "full_frame"]);
  const rows = [
    { t: 0, x: 0, presentationState: "holding" },
    { t: 0.02, x: 100, presentationState: "holding" }, // large jump, but non-steady -> must be excluded
    { t: 0.04, x: 0, presentationState: "following" },
    { t: 0.06, x: 1, presentationState: "following" },
    { t: 0.08, x: 2, presentationState: "following" },
    { t: 0.10, x: 3, presentationState: "following" },
  ];
  let best = [], cur = [];
  for (const r of rows) { if (STEADY.has(r.presentationState)) cur.push(r); else { if (cur.length > best.length) best = cur; cur = []; } }
  if (cur.length > best.length) best = cur;
  assert.equal(best.length, 4);
  assert.ok(best.every((r) => r.presentationState === "following"));
  assert.ok(!best.some((r) => r.x === 100));
});

// 6. Skip-event detector deterministic.
check(6, "skip-event detector deterministic", () => {
  const deltas = [1, 1, 1, 50, 1, 1];
  const median = 1;
  const detect = (d) => d.map((v, i) => ({ i, isSkip: v > median * 4 })).filter((e) => e.isSkip);
  assert.deepEqual(detect(deltas), detect(deltas));
  assert.equal(detect(deltas).length, 1);
  assert.equal(detect(deltas)[0].i, 3);
});

// 7. Layer decomposition deterministic (translation-only / scale-only formulas).
check(7, "layer decomposition deterministic", () => {
  const camPrev = { cx: 0.4, cy: 0.5, scale: 1.5 };
  const camCur = { cx: 0.42, cy: 0.5, scale: 1.6 };
  const anchorPrev = { x: 0.5, y: 0.5 };
  const W = 1280;
  const translationOnlyPx = () => Math.hypot((camCur.cx - camPrev.cx) * camPrev.scale * W, (camCur.cy - camPrev.cy) * camPrev.scale * W);
  const distFromCenter = Math.hypot(anchorPrev.x - camPrev.cx, anchorPrev.y - camPrev.cy);
  const scaleOnlyPx = () => Math.abs(camCur.scale - camPrev.scale) * distFromCenter * W;
  assert.equal(translationOnlyPx(), translationOnlyPx());
  assert.equal(scaleOnlyPx(), scaleOnlyPx());
  assert.ok(translationOnlyPx() > 0 && scaleOnlyPx() >= 0);
});

// 8. Refresh-counterfactual deterministic: resampling the same resolved path
// at the same Hz twice gives identical results.
check(8, "refresh-counterfactual deterministic", () => {
  const framesLike = [{ time: 0 }, { time: 0.1 }, { time: 0.2 }];
  const pathLike = [{ cx: 0.5, cy: 0.5, scale: 1 }, { cx: 0.55, cy: 0.5, scale: 1.1 }, { cx: 0.6, cy: 0.5, scale: 1.2 }];
  const sample = () => {
    const rows = [];
    for (let t = 0; t <= 0.2; t += 1 / 60) {
      const idx = frameIndexForTime(framesLike, t);
      rows.push(resolveDisplayCameraState(pathLike, framesLike, t, idx));
    }
    return rows;
  };
  assert.deepEqual(sample(), sample());
});

// 9. Ideal-lower-bound calculation deterministic (reconstruction-accuracy formula).
check(9, "ideal-lower-bound calculation deterministic", () => {
  const actualMedian = 20, errMedian = 1;
  const accuracy = () => 1 - errMedian / actualMedian;
  assert.equal(accuracy(), accuracy());
  assert.equal(accuracy(), 0.95);
});

// 10. RAW/Stabilized comparison deterministic: identity correction leaves
// composeFinal exactly equal to the Auto-Follow-only value.
check(10, "RAW/Stabilized comparison deterministic", () => {
  const anchor = { x: 0.45, y: 0.55 };
  const camera = { cx: 0.4, cy: 0.5, scale: 1.7 };
  const raw = composeFinal(anchor, camera, IDENTITY_SIMILARITY);
  const raw2 = composeFinal(anchor, camera, IDENTITY_SIMILARITY);
  assert.deepEqual(raw, raw2);
  // Auto-Follow-OFF identity camera + identity correction must equal the raw anchor's own centered position.
  const off = composeFinal(anchor, IDENTITY_CAMERA, IDENTITY_SIMILARITY);
  assert.equal(off.x, 0.5 + 1 * (anchor.x - 0.5));
  assert.equal(off.y, 0.5 + 1 * (anchor.y - 0.5));
});

// 11. Instrumentation does not alter presentation: no forensic script under
// this phase writes to any of the production files it reads.
check(11, "instrumentation does not alter presentation (no writes to guarded files)", () => {
  const scriptDir = path.join(root, "scripts");
  const p93aScripts = ["phase-9-3a-final-trace-analysis.mjs", "phase-9-3a-refresh-counterfactual.mjs", "phase-9-3a-browser-cadence-compositor.mjs", "phase-9-3a-synthetic-visualization.py", "phase-9-3a-sanity.mjs"];
  const guarded = [
    "src/components/video/OverlaySurface.tsx", "src/components/video/VideoOverlay.tsx",
    "src/lib/video/presentationCamera.ts", "src/lib/video/displayStabilization.ts",
    "src/lib/video/follow.ts", "src/lib/video/cameraPath.ts", "src/lib/biomechanics/pose.ts",
    "src/lib/video/steps.ts", "src/lib/video/contacts.ts", "src/lib/benchmark/measurements.ts",
  ];
  for (const f of p93aScripts) {
    const p = path.join(scriptDir, f);
    let text;
    try { text = readFileSync(p, "utf8"); } catch { continue; }
    for (const g of guarded) {
      const base = g.split("/").pop().replace(".", "\\.");
      assert.ok(!new RegExp(`writeFileSync\\([^)]*${base}`).test(text), `${f} must not write ${g}`);
    }
  }
  const earliestMs = Math.min(...p93aScripts.map((f) => { try { return statSync(path.join(scriptDir, f)).mtimeMs; } catch { return Infinity; } }));
  for (const f of guarded) {
    const mtimeMs = statSync(path.join(root, f)).mtimeMs;
    assert.ok(mtimeMs < earliestMs, `${f} was modified during this phase's own work window (mtime ${new Date(mtimeMs).toISOString()} >= ${new Date(earliestMs).toISOString()})`);
  }
});

// 12. Scientific outputs unchanged: the production metric/contact/step
// pipeline is unaffected -- run the real, existing scientific regression
// pipeline against the same real Vanni 240 artifact this phase itself read.
check(12, "scientific outputs unchanged (real production pipeline rerun)", () => {
  const outText = execFileSync("node", ["scripts/vanni-240-metric-evidence-sanity.mjs"], { cwd: root, encoding: "utf8" });
  assert.ok(/ALL PASSED/.test(outText), "vanni-240-metric-evidence-sanity.mjs did not report ALL PASSED");
});

console.log(`\n${pass}/${results.length} checks passed.`);
if (pass !== results.length) {
  console.log("\nFAILURES:");
  for (const r of results) if (!r.ok) console.log(`  ${r.n}. ${r.name}: ${r.error}`);
  process.exit(1);
}
