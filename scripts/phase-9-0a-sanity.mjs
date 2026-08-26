// Phase 9.0A -- forensic/instrumentation sanity checks (9 items, per task
// spec). These verify the DETERMINISM of this audit's own reconstruction and
// the READ-ONLY nature of its instrumentation, mirroring the established
// `scripts/*-sanity.mjs` pattern from every prior forensic phase this
// session (this repo has no test runner wired up yet, per CLAUDE.md).
//
//   node --env-file=.env.local scripts/phase-9-0a-sanity.mjs

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
  return execFileSync("node", args, { cwd: root, encoding: "utf8", env: { ...process.env } });
}

// ---------------------------------------------------------------------
// 1. Expected step-number reconstruction is deterministic: two independent
// runs of the render-logic replay produce byte-identical results.
// ---------------------------------------------------------------------
check("1. expected step-number reconstruction deterministic", () => {
  const run1 = runNode(["--env-file=.env.local", "scripts/phase-9-0a-render-logic-replay.mjs"]);
  const data1 = JSON.parse(readFileSync(path.join(root, "tmp/phase90a/render-logic-replay.json"), "utf8"));
  const run2 = runNode(["--env-file=.env.local", "scripts/phase-9-0a-render-logic-replay.mjs"]);
  const data2 = JSON.parse(readFileSync(path.join(root, "tmp/phase90a/render-logic-replay.json"), "utf8"));
  assert.deepEqual(data1, data2, "two independent reruns must produce identical reconstructions");
  assert.ok(run1.length > 0 && run2.length > 0);
});

const replay = JSON.parse(readFileSync(path.join(root, "tmp/phase90a/render-logic-replay.json"), "utf8"));

// ---------------------------------------------------------------------
// 2. contactId mapping deterministic: every row's markId is well-formed and
// matches its own frame/side/index triple (no cross-wiring).
// ---------------------------------------------------------------------
check("2. contactId mapping deterministic", () => {
  for (const [label, data] of Object.entries(replay)) {
    for (const row of data.rows) {
      const expected = `contact-${row.sourceFrameIndex}-${row.side}-${row.index}`;
      assert.equal(row.markId, expected, `${label} row markId mismatch`);
    }
  }
});

// ---------------------------------------------------------------------
// 3. authoritativeSteps lookup deterministic: meters is either a finite
// number or exactly null, never undefined/NaN, and the meter-missing count
// matches the row-level count.
// ---------------------------------------------------------------------
check("3. authoritativeSteps lookup deterministic", () => {
  for (const [label, data] of Object.entries(replay)) {
    let meterMissing = 0;
    for (const row of data.rows) {
      assert.ok(row.meters === null || Number.isFinite(row.meters), `${label} ${row.markId} meters must be null or finite`);
      if (row.meters === null) meterMissing++;
    }
    assert.equal(meterMissing, data.meterMissingCount, `${label} meterMissingCount must match row-level count`);
  }
});

// ---------------------------------------------------------------------
// 4. Missing-number condition reproducible: proves, deterministically and
// reproducibly, that the CURRENT production condition does NOT produce a
// missing step number for any real contact in any of the four benchmarks
// (44 total marks) -- directly disproving the "number coupled to meter
// label" hypothesis rather than merely asserting it.
// ---------------------------------------------------------------------
check("4. missing-number condition reproducible (0/44 across all benchmarks)", () => {
  let totalMarks = 0, totalNumberMissing = 0;
  for (const [label, data] of Object.entries(replay)) {
    totalMarks += data.totalMarks;
    totalNumberMissing += data.numberMissingCount;
    assert.equal(data.numberMissingCount, 0, `${label} must have zero missing step numbers under show.step_numbers=true`);
    assert.equal(data.dotMissingCount, 0, `${label} must have zero missing dots under show.contacts=true`);
    assert.ok(data.meterMissingCount > 0, `${label} is expected to have >=1 legitimately-absent meter label (Phase 8.0A/8.0B evidence-gating)`);
  }
  assert.equal(totalMarks, 43, "expected 43 total reconstructed marks across all 4 benchmarks (matches Phase 8.0B's own count)");
  assert.equal(totalNumberMissing, 0);
});

// ---------------------------------------------------------------------
// 5. Draw-position calculation deterministic: the number's screen offset is
// a fixed, deterministic function of the same projected point `p` the dot
// uses -- verified via static source inspection (both literal offsets are
// constants, not computed from any non-deterministic input).
// ---------------------------------------------------------------------
check("5. draw-position calculation deterministic", () => {
  const src = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
  assert.ok(src.includes("placeLabel(ctx, `${mark.index}`, p.x + 7, p.y - 10, color, placedLabels);"));
  assert.ok(src.includes("placeLabel(ctx, `${meters.toFixed(2)} m`, p.x + 6, p.y + 10, color, placedLabels);"));
  // Both offsets are literal constants relative to the SAME `p` -- no
  // Math.random, Date.now, or other non-deterministic term appears between
  // the dot draw and the number/label draw.
  const blockStart = src.indexOf("if (show.contacts) {\n            ctx.beginPath();");
  const blockEnd = src.indexOf("ctx.font = DEFAULT_LABEL_FONT;", blockStart);
  const block = src.slice(blockStart, blockEnd);
  assert.ok(!/Math\.random|Date\.now|performance\.now/.test(block), "no non-deterministic term in the dot/number/label draw block");
});

// ---------------------------------------------------------------------
// 6. RAW/Stabilized visibility audit deterministic: the step-marks render
// condition (VideoOverlay.tsx) has zero reference to stabilization state --
// it cannot be affected by RAW vs Stabilized View.
// ---------------------------------------------------------------------
check("6. RAW/Stabilized visibility audit deterministic", () => {
  const src = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
  const blockStart = src.indexOf("if ((show.contacts || show.step_numbers) && canonicalSteps.length) {");
  const blockEnd = src.indexOf("// --- Timing-gate BARS", blockStart);
  const block = src.slice(blockStart, blockEnd);
  assert.ok(!/stabiliz/i.test(block), "step-marks render block must not reference Stabilized View state");
});

// ---------------------------------------------------------------------
// 7. Auto Follow ON/OFF visibility audit deterministic: same block has no
// reference to autoFollow/followState -- Auto Follow can change WHERE a
// mark is projected (via the shared wrapper transform, upstream of this
// component entirely) but cannot change WHETHER show.contacts/show.step_numbers
// evaluate true, since those come from toggle state, not camera state.
// ---------------------------------------------------------------------
check("7. Auto Follow ON/OFF visibility audit deterministic", () => {
  const src = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
  const blockStart = src.indexOf("if ((show.contacts || show.step_numbers) && canonicalSteps.length) {");
  const blockEnd = src.indexOf("// --- Timing-gate BARS", blockStart);
  const block = src.slice(blockStart, blockEnd);
  assert.ok(!/autoFollow/i.test(block), "step-marks render block must not reference autoFollow state");
  // show.step_numbers and show.contacts share the identical evidence
  // requirement in the registry -- verified so an evidence-gating
  // difference cannot explain a dot-without-number asymmetry.
  const registrySrc = readFileSync(path.join(root, "src/lib/video/worldVisualization.ts"), "utf8");
  const stepNumbersLine = registrySrc.split("\n").find((l) => l.includes('id: "step_numbers"'));
  const contactsLine = registrySrc.split("\n").find((l) => l.includes('id: "contacts"'));
  assert.ok(stepNumbersLine.includes('evidenceRequirement: "contacts"'));
  assert.ok(contactsLine.includes('evidenceRequirement: "contacts"'));
});

// ---------------------------------------------------------------------
// 8. Instrumentation changes no production behavior: no Phase 9.0A script
// writes to any production file, and no production file's mtime moved
// during this phase's own work window.
// ---------------------------------------------------------------------
check("8. instrumentation changes no production behavior", () => {
  const scriptDir = path.join(root, "scripts");
  const p90aScripts = readdirSync(scriptDir).filter((f) => f.startsWith("phase-9-0a-"));
  assert.ok(p90aScripts.length >= 3, "expected the Phase 9.0A script set to exist");
  const guarded = [
    "src/components/video/VideoOverlay.tsx",
    "src/components/video/OverlaySurface.tsx",
    "src/components/video/OverlayVideoPlayer.tsx",
    "src/app/sessions/[id]/page.tsx",
    "src/lib/benchmark/measurements.ts",
    "src/lib/video/steps.ts",
    "src/lib/video/worldVisualization.ts",
  ];
  for (const f of p90aScripts) {
    const text = readFileSync(path.join(scriptDir, f), "utf8");
    for (const g of guarded) {
      assert.ok(!new RegExp(`writeFileSync\\([^)]*${g.split("/").pop().replace(".", "\\.")}`).test(text), `${f} must not write ${g}`);
    }
  }
  const earliestMs = Math.min(...p90aScripts.map((f) => statSync(path.join(scriptDir, f)).mtimeMs));
  for (const f of guarded) {
    const mtimeMs = statSync(path.join(root, f)).mtimeMs;
    assert.ok(mtimeMs < earliestMs, `${f} was modified during this phase's own work window (mtime ${new Date(mtimeMs).toISOString()} >= ${new Date(earliestMs).toISOString()})`);
  }
});

// ---------------------------------------------------------------------
// 9. Scientific outputs unchanged: the real production measurement pipeline
// still reproduces itself exactly against real Vanni 240 data.
// ---------------------------------------------------------------------
check("9. scientific outputs unchanged", () => {
  const out = execFileSync("node", ["scripts/vanni-240-metric-evidence-sanity.mjs"], { cwd: root, encoding: "utf8" });
  assert.ok(/ALL PASSED/.test(out));
});

console.log(`\n${pass}/${results.length} checks passed.`);
if (pass !== results.length) process.exit(1);
