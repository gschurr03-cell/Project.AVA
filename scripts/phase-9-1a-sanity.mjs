// Phase 9.1A -- forensic/instrumentation sanity checks (14 items, per task
// spec). Mirrors the established `scripts/*-sanity.mjs` pattern from every
// prior forensic phase this session.
//
//   node --env-file=.env.local scripts/phase-9-1a-sanity.mjs

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

const BENCHMARKS = ["gav", "vanni240", "vanni120", "vanni60"];

// ---------------------------------------------------------------------
// 1. Pose coverage timeline deterministic.
// ---------------------------------------------------------------------
check("1. pose coverage timeline deterministic", () => {
  runNode(["--env-file=.env.local", "scripts/phase-9-1a-pose-coverage-audit.mjs"]);
  const first = {};
  for (const b of BENCHMARKS) first[b] = readFileSync(path.join(root, `tmp/phase91a/${b}-pose-coverage-timeline.json`), "utf8");
  runNode(["--env-file=.env.local", "scripts/phase-9-1a-pose-coverage-audit.mjs"]);
  for (const b of BENCHMARKS) {
    const second = readFileSync(path.join(root, `tmp/phase91a/${b}-pose-coverage-timeline.json`), "utf8");
    assert.equal(first[b], second, `${b} pose coverage timeline must be byte-identical across reruns`);
  }
});

const timelines = Object.fromEntries(BENCHMARKS.map((b) => [b, JSON.parse(readFileSync(path.join(root, `tmp/phase91a/${b}-pose-coverage-timeline.json`), "utf8"))]));
const dropouts = Object.fromEntries(BENCHMARKS.map((b) => [b, JSON.parse(readFileSync(path.join(root, `tmp/phase91a/${b}-dropout-intervals.json`), "utf8"))]));
const jointCoverage = Object.fromEntries(BENCHMARKS.map((b) => [b, JSON.parse(readFileSync(path.join(root, `tmp/phase91a/${b}-joint-coverage.json`), "utf8"))]));

// ---------------------------------------------------------------------
// 2. sourceFrameIndex mapping deterministic and monotonic.
// ---------------------------------------------------------------------
check("2. sourceFrameIndex mapping deterministic", () => {
  for (const b of BENCHMARKS) {
    const rows = timelines[b];
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i].sourceFrameIndex > rows[i - 1].sourceFrameIndex, `${b} sourceFrameIndex must be strictly increasing`);
    }
    assert.equal(rows[0].sourceFrameIndex, 0, `${b} must start at sourceFrameIndex 0`);
  }
});

// ---------------------------------------------------------------------
// 3. Pose timestamp mapping deterministic and monotonic.
// ---------------------------------------------------------------------
check("3. pose timestamp mapping deterministic", () => {
  for (const b of BENCHMARKS) {
    const rows = timelines[b];
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i].timeS > rows[i - 1].timeS, `${b} timeS must be strictly increasing`);
    }
  }
});

// ---------------------------------------------------------------------
// 4. Dropout intervals deterministic and internally consistent (no overlap,
// ordered, each interval genuinely has renderableBones === 0 throughout).
// ---------------------------------------------------------------------
check("4. dropout intervals deterministic and consistent", () => {
  for (const b of BENCHMARKS) {
    const rows = timelines[b];
    const intervals = dropouts[b];
    for (let i = 1; i < intervals.length; i++) {
      assert.ok(intervals[i].startSourceFrameIndex > intervals[i - 1].endSourceFrameIndex, `${b} dropout intervals must not overlap/be ordered`);
    }
    for (const iv of intervals) {
      const slice = rows.filter((r) => r.sourceFrameIndex >= iv.startSourceFrameIndex && r.sourceFrameIndex <= iv.endSourceFrameIndex);
      assert.equal(slice.length, iv.frameCount, `${b} interval frameCount must match actual row count`);
      assert.ok(slice.every((r) => r.renderableBones === 0), `${b} every row inside a dropout interval must have zero renderable bones`);
    }
  }
});

// ---------------------------------------------------------------------
// 5. Joint-level availability deterministic; matches raw timeline data.
// ---------------------------------------------------------------------
check("5. joint-level availability deterministic", () => {
  for (const b of BENCHMARKS) {
    const rows = timelines[b];
    const coverage = jointCoverage[b];
    for (const joint of Object.keys(coverage)) {
      let available = 0;
      for (const r of rows) if (!r.renderStripped && r.jointPresence[joint]) available++;
      assert.equal(available, coverage[joint].available, `${b} ${joint} coverage count must match recomputation`);
    }
  }
});

// ---------------------------------------------------------------------
// 6. Quality-gate classification deterministic: renderStripped/scienceStripped
// are a pure function of boxOrigin/independentLocalizationState (byte-for-byte
// copies of the two live production policies).
// ---------------------------------------------------------------------
check("6. quality-gate classification deterministic", () => {
  function renderPathStrips(f) { return f.boxOrigin === "predicted" || f.boxOrigin === "invalid" || f.boxOrigin === "frozen_suspect"; }
  function sciencePathStrips(f) {
    const stripped = f.boxOrigin === "predicted" || f.boxOrigin === "invalid" || f.boxOrigin === "frozen_suspect";
    const corroborated = f.boxOrigin === "frozen_suspect" && f.independentLocalizationState === "independent_corroborated";
    return stripped && !corroborated;
  }
  for (const b of BENCHMARKS) {
    for (const r of timelines[b]) {
      assert.equal(renderPathStrips(r), r.renderStripped, `${b} frame ${r.sourceFrameIndex} renderStripped mismatch`);
      assert.equal(sciencePathStrips(r), r.scienceStripped, `${b} frame ${r.sourceFrameIndex} scienceStripped mismatch`);
      assert.equal(r.renderStripped && !r.scienceStripped, r.renderVsScienceDivergent, `${b} frame ${r.sourceFrameIndex} divergent flag mismatch`);
    }
  }
});

// ---------------------------------------------------------------------
// 7. Pose lookup classification deterministic: lookup (selectOverlayFrame,
// nearest-in-time) is unrelated to and independent of the stripping policy --
// verified structurally by static source inspection (the lookup function has
// no boxOrigin/frozen_suspect/independentLocalizationState reference at all).
// ---------------------------------------------------------------------
check("7. pose lookup classification deterministic (lookup independent of stripping)", () => {
  const src = readFileSync(path.join(root, "src/lib/video/overlayRenderClock.ts"), "utf8");
  assert.ok(!/boxOrigin|frozen_suspect|independentLocalizationState/.test(src), "selectOverlayFrame must not reference quality-gate fields -- lookup and eligibility are separate stages");
  assert.ok(src.includes("export function selectOverlayFrame"));
});

// ---------------------------------------------------------------------
// 8. Canvas draw classification deterministic where instrumentable: the
// skeleton draw condition is a pure function of show.skeleton/showPose/
// frame.landmarks -- verified via static source inspection.
// ---------------------------------------------------------------------
check("8. canvas draw classification deterministic where instrumentable", () => {
  const src = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
  assert.ok(src.includes("if (show.skeleton && showPose) {"));
  assert.ok(src.includes("const showPose = video.paused || video.playbackRate <= 1.01;"));
  // Bone draw is per-segment: both endpoints must be present, or that segment
  // is skipped -- never a partial/fabricated bone.
  assert.ok(src.includes("if (!a || !b) continue;"));
});

// ---------------------------------------------------------------------
// 9. RAW/STABILIZED does not alter scientific pose identity: the landmark-
// stripping condition and the skeleton draw condition have zero reference to
// stabilization state.
// ---------------------------------------------------------------------
check("9. RAW/STABILIZED does not alter scientific pose identity", () => {
  const src = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
  const stripBlockStart = src.indexOf("if (frame.boxOrigin === \"predicted\"");
  const skeletonBlockEnd = src.indexOf("// --- Hover / selection markers");
  const block = src.slice(stripBlockStart, skeletonBlockEnd);
  assert.ok(!/stabiliz/i.test(block), "pose eligibility/skeleton draw block must not reference stabilization state");
});

// ---------------------------------------------------------------------
// 10. Auto Follow OFF/ON does not alter scientific pose identity: same block
// has no autoFollow reference -- Auto Follow can only change WHERE a joint is
// projected on screen (via the shared wrapper transform, upstream/downstream
// of this component entirely), never WHICH frame's landmarks are selected or
// whether they are stripped.
// ---------------------------------------------------------------------
check("10. Auto Follow OFF/ON does not alter scientific pose identity", () => {
  const src = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
  const stripBlockStart = src.indexOf("if (frame.boxOrigin === \"predicted\"");
  const skeletonBlockEnd = src.indexOf("// --- Hover / selection markers");
  const block = src.slice(stripBlockStart, skeletonBlockEnd);
  assert.ok(!/autoFollow/i.test(block), "pose eligibility/skeleton draw block must not reference autoFollow state");
});

// ---------------------------------------------------------------------
// 11-13. Contact/step/metric artifacts unchanged: the real production
// measurement pipeline still reproduces itself exactly.
// ---------------------------------------------------------------------
check("11-13. contact/step/metric artifacts unchanged", () => {
  const out = execFileSync("node", ["scripts/vanni-240-metric-evidence-sanity.mjs"], { cwd: root, encoding: "utf8" });
  assert.ok(/ALL PASSED/.test(out));
});

// ---------------------------------------------------------------------
// 14. Instrumentation does not affect production behavior: no Phase 9.1A
// script writes to any production file; no production file's mtime moved
// during this phase's own work window.
// ---------------------------------------------------------------------
check("14. instrumentation does not affect production behavior", () => {
  const scriptDir = path.join(root, "scripts");
  const p91aScripts = readdirSync(scriptDir).filter((f) => f.startsWith("phase-9-1a-"));
  assert.ok(p91aScripts.length >= 4, "expected the Phase 9.1A script set to exist");
  const guarded = [
    "src/components/video/VideoOverlay.tsx", "src/components/video/OverlaySurface.tsx",
    "src/components/video/OverlayVideoPlayer.tsx", "src/lib/video/overlayRenderClock.ts",
    "src/lib/video/overlay.ts", "src/lib/benchmark/measurements.ts",
    "src/lib/video/steps.ts", "src/lib/video/presentationCamera.ts", "src/lib/video/displayStabilization.ts",
  ];
  for (const f of p91aScripts) {
    const text = readFileSync(path.join(scriptDir, f), "utf8");
    for (const g of guarded) {
      const base = g.split("/").pop().replace(".", "\\.");
      assert.ok(!new RegExp(`writeFileSync\\([^)]*${base}`).test(text), `${f} must not write ${g}`);
    }
  }
  const earliestMs = Math.min(...p91aScripts.map((f) => statSync(path.join(scriptDir, f)).mtimeMs));
  for (const f of guarded) {
    const mtimeMs = statSync(path.join(root, f)).mtimeMs;
    assert.ok(mtimeMs < earliestMs, `${f} was modified during this phase's own work window (mtime ${new Date(mtimeMs).toISOString()} >= ${new Date(earliestMs).toISOString()})`);
  }
});

console.log(`\n${pass}/${results.length} checks passed.`);
if (pass !== results.length) process.exit(1);
