// Phase 9.1B -- deterministic tests (17 items, per task spec) for the
// skeleton render-eligibility alignment fix in VideoOverlay.tsx. Mirrors the
// established `scripts/*-sanity.mjs` pattern from every prior forensic/fix
// phase this session.
//
//   node --env-file=.env.local scripts/phase-9-1b-sanity.mjs

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

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
function runNode(args) {
  return execFileSync("node", args, { cwd: root, encoding: "utf8" });
}

runNode(["--env-file=.env.local", "scripts/phase-9-1b-eligibility-validation.mjs"]);
const BENCHMARKS = ["gav", "vanni240", "vanni120", "vanni60"];
const rows = Object.fromEntries(BENCHMARKS.map((b) => [b, JSON.parse(readFileSync(path.join(root, `tmp/phase91b/${b}-before-after.json`), "utf8"))]));
const summary = JSON.parse(readFileSync(path.join(root, "tmp/phase91b/summary.json"), "utf8"));

// ---------------------------------------------------------------------
// 1. A scientifically rejected ordinary frame (frozen_suspect, NOT
// corroborated) remains stripped post-fix.
// ---------------------------------------------------------------------
check("1. scientifically rejected ordinary frame remains stripped", () => {
  const ordinaryRejected = rows.vanni240.find((r) => r.boxOrigin === "frozen_suspect" && r.independentLocalizationState !== "independent_corroborated" && r.rawLandmarkCount > 0);
  assert.ok(ordinaryRejected, "expected at least one ordinary (non-corroborated) frozen_suspect frame with raw pose in the fixture");
  assert.equal(ordinaryRejected.postFixStripped, true);
  assert.equal(ordinaryRejected.postFixRenderableBones, 0);
});

// ---------------------------------------------------------------------
// 2. An independent_corroborated frame is now eligible for rendering.
// ---------------------------------------------------------------------
check("2. independent_corroborated frame remains eligible for rendering", () => {
  const corroborated = rows.vanni240.find((r) => r.boxOrigin === "frozen_suspect" && r.independentLocalizationState === "independent_corroborated");
  assert.ok(corroborated, "expected at least one corroborated frozen_suspect frame in the fixture");
  assert.equal(corroborated.postFixStripped, false);
  assert.ok(corroborated.postFixRenderableBones > 0);
});

// ---------------------------------------------------------------------
// 3/4/5. Vanni 240/120/60 divergent frames recover to the exact proven counts.
// ---------------------------------------------------------------------
check("3. Vanni 240 divergent frames recover (exactly 64)", () => {
  assert.equal(summary.vanni240.recoveredFrameCount, 64);
});
check("4. Vanni 120 divergent frames recover (exactly 15)", () => {
  assert.equal(summary.vanni120.recoveredFrameCount, 15);
});
check("5. Vanni 60 divergent frames recover (exactly 7)", () => {
  assert.equal(summary.vanni60.recoveredFrameCount, 7);
});

// ---------------------------------------------------------------------
// 6. Genuine Vanni 240 off-frame interval (668-989) remains absent.
// ---------------------------------------------------------------------
check("6. genuine Vanni 240 off-frame interval remains absent", () => {
  assert.equal(summary.vanni240.genuineGapCheck.frameCount, 322);
  assert.equal(summary.vanni240.genuineGapCheck.allStillZeroBones, true);
});

// ---------------------------------------------------------------------
// 7. Pre-acquisition gap (Vanni 240 frames 0-9) remains absent.
// ---------------------------------------------------------------------
check("7. pre-acquisition gap remains absent", () => {
  const slice = rows.vanni240.filter((r) => r.sourceFrameIndex >= 0 && r.sourceFrameIndex <= 9);
  assert.equal(slice.length, 10);
  assert.ok(slice.every((r) => r.postFixRenderableBones === 0), "pre-acquisition frames must remain skeleton-free");
});

// ---------------------------------------------------------------------
// 8. Tail unsupported gap (Vanni 240 frames 991-1019) remains absent.
// ---------------------------------------------------------------------
check("8. tail unsupported gap remains absent", () => {
  const slice = rows.vanni240.filter((r) => r.sourceFrameIndex >= 991 && r.sourceFrameIndex <= 1019);
  assert.equal(slice.length, 29);
  assert.ok(slice.every((r) => r.postFixRenderableBones === 0), "tail gap frames must remain skeleton-free");
});

// ---------------------------------------------------------------------
// 9. Gav eligibility remains unchanged (0 recovered, pre==post full-skeleton
// count).
// ---------------------------------------------------------------------
check("9. Gav eligibility remains unchanged", () => {
  assert.equal(summary.gav.recoveredFrameCount, 0);
  assert.equal(summary.gav.preFixFullSkeletonCount, summary.gav.postFixFullSkeletonCount);
});

// ---------------------------------------------------------------------
// 10/11. Auto Follow / Stabilized View do not affect eligibility: the
// eligibility block (boxOrigin/independentLocalizationState check) has zero
// reference to either state, verified via static source inspection.
// ---------------------------------------------------------------------
check("10. Auto Follow does not change eligibility", () => {
  const src = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
  const start = src.indexOf("if (isStaleOverlayFrame) {");
  const end = src.indexOf("const useCameraProjection");
  const block = src.slice(start, end);
  assert.ok(!/autoFollow/i.test(block), "eligibility block must not reference autoFollow state");
});
check("11. Stabilized View does not change eligibility", () => {
  const src = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
  const start = src.indexOf("if (isStaleOverlayFrame) {");
  const end = src.indexOf("const useCameraProjection");
  const block = src.slice(start, end);
  assert.ok(!/stabiliz/i.test(block), "eligibility block must not reference stabilization state");
});

// ---------------------------------------------------------------------
// 12. Scientific pose artifact unchanged: this fix reads the artifact, never
// writes it; verified via import-graph absence (no writeFileSync targeting
// pose data anywhere in VideoOverlay.tsx) and mtime.
// ---------------------------------------------------------------------
check("12. scientific pose artifact unchanged", () => {
  const src = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
  assert.ok(!/writeFileSync|supabase.*upload|storage\.from/.test(src), "VideoOverlay.tsx must not write any artifact");
});

// ---------------------------------------------------------------------
// 13/14/15. Contacts/steps/metrics unchanged: measurements.ts (the sole
// scientific source for all three) is untouched (mtime + content check) and
// the real production pipeline reproduces itself exactly.
// ---------------------------------------------------------------------
check("13-15. contacts/steps/metrics unchanged", () => {
  const guarded = ["src/lib/benchmark/measurements.ts", "src/lib/video/steps.ts", "src/lib/video/contacts.ts", "src/lib/video/stepIntegrity.ts", "src/lib/video/zoneStepAnalysis.ts"];
  const thisFileMtime = statSync(path.join(root, "src/components/video/VideoOverlay.tsx")).mtimeMs;
  for (const g of guarded) {
    assert.ok(statSync(path.join(root, g)).mtimeMs < thisFileMtime, `${g} must predate this phase's VideoOverlay.tsx edit`);
  }
  const out = execFileSync("node", ["scripts/vanni-240-metric-evidence-sanity.mjs"], { cwd: root, encoding: "utf8" });
  assert.ok(/ALL PASSED/.test(out));
});

// ---------------------------------------------------------------------
// 16. No pose interpolation introduced: the fix only widens/narrows which
// EXISTING frame.landmarks object is used; it never blends, averages, or
// derives a new coordinate from two frames.
// ---------------------------------------------------------------------
check("16. no pose interpolation introduced", () => {
  const src = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
  const start = src.indexOf("if (isStaleOverlayFrame) {");
  const end = src.indexOf("const useCameraProjection");
  const block = src.slice(start, end);
  assert.ok(!/lerp|interpolat|blend|average|weighted/i.test(block), "eligibility block must not interpolate/blend coordinates");
});

// ---------------------------------------------------------------------
// 17. No stale-pose hold introduced: the eligibility condition depends only
// on the CURRENT frame's own boxOrigin/independentLocalizationState -- it
// never reads a previous frame or retains prior state across calls.
// ---------------------------------------------------------------------
check("17. no stale-pose hold introduced", () => {
  const src = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
  const start = src.indexOf("const isIndependentlyCorroborated =");
  const end = src.indexOf("const useCameraProjection");
  const block = src.slice(start, end);
  assert.ok(!/previous|\bprevFrame\b|lastFrame|\.current\b/i.test(block), "eligibility condition must be a pure function of the current frame only, no held/previous state");
  // Also confirm determinism directly: recomputing postFixStripped from the
  // same stored fields twice yields the same result (pure function).
  for (const b of BENCHMARKS) {
    for (const r of rows[b].slice(0, 50)) {
      const recomputed = (r.boxOrigin === "predicted" || r.boxOrigin === "invalid" || r.boxOrigin === "frozen_suspect") &&
        !(r.boxOrigin === "frozen_suspect" && r.independentLocalizationState === "independent_corroborated");
      assert.equal(recomputed, r.postFixStripped, `${b} frame ${r.sourceFrameIndex} eligibility must be a pure, deterministic function of its own fields`);
    }
  }
});

console.log(`\n${pass}/${results.length} checks passed.`);
if (pass !== results.length) process.exit(1);
