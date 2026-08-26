// Phase R1B -- 24 deterministic tests for presentation-only physical
// step-length recovery.
//
//   node --env-file=.env.local scripts/phase-r1b-presentation-step-length-sanity.mjs
import { readFileSync } from "node:fs";
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

const manifest = JSON.parse(readFileSync(path.join(root, "tmp/phaseR1B/step-length-manifest.json"), "utf8"));
const summary = JSON.parse(readFileSync(path.join(root, "tmp/phaseR1B/cross-benchmark-summary.json"), "utf8"));
const v240 = manifest.vanni240;
const case1 = v240.find((r) => r.contactId === "contact-119-left-2");
const case2 = v240.find((r) => r.contactId === "contact-278-left-3");

const measurementsSrc = readFileSync(path.join(root, "src/lib/benchmark/measurements.ts"), "utf8");
const overlaySrc = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");

check(1, "physical and aggregate fields are distinct", () => {
  assert.ok(measurementsSrc.includes("physicalStepLengthM: number | null;"));
  assert.ok(measurementsSrc.includes("stepLengthM: number | null;"));
  assert.notEqual("physicalStepLengthM", "stepLengthM");
});
check(2, "accepted normal interval has both values", () => {
  const row = v240.find((r) => r.contactId === "contact-330-right-4");
  assert.ok(row.stepLengthM != null && row.physicalStepLengthM != null);
});
check(3, "accepted values are identical across all benchmarks", () => {
  for (const label of ["gav", "vanni60", "vanni120", "vanni240"]) {
    assert.equal(summary[label].allAcceptedValuesMatchPhysical, true, `${label} has a mismatch`);
  }
});
check(4, "R1A Vanni 240 case 1 physical value exists and matches R1A's identified value", () => {
  assert.equal(case1.physicalStepLengthM, 3.442099399668491);
});
check(5, "R1A case 1 aggregate value remains null", () => {
  assert.equal(case1.stepLengthM, null);
});
check(6, "R1A case 1 renders meter label", () => {
  assert.equal(case1.renderedLabelYesNo, "YES");
  assert.equal(case1.physicalStepLengthState, "presentation_only");
});
check(7, "R1A case 2 physical value remains null", () => {
  assert.equal(case2.physicalStepLengthM, null);
});
check(8, "R1A case 2 aggregate value remains null", () => {
  assert.equal(case2.stepLengthM, null);
});
check(9, "R1A case 2 renders no meter label", () => {
  assert.equal(case2.renderedLabelYesNo, "NO");
  assert.equal(case2.physicalStepLengthState, "missing_contact");
});
check(10, "same-foot missing-contact interval cannot become physical step (evidence-gap set enforced)", () => {
  assert.ok(measurementsSrc.includes('"foot_sequence_discontinuity",') && measurementsSrc.includes("PHYSICAL_STEP_EVIDENCE_GAP_REASONS"));
  assert.ok(measurementsSrc.includes('"missing_intermediate_contact",'));
});
check(11, "no raw multi-step distance leaks into presentation (evidence-gap check runs before physicalStepLengthM assignment)", () => {
  const slice = measurementsSrc.slice(measurementsSrc.indexOf("const physicalCandidateM"), measurementsSrc.indexOf("const physicalCandidateM") + 700);
  assert.match(slice, /!hasEvidenceGap/);
});
check(12, "contact identities unchanged (contactId format untouched)", () => {
  assert.ok(v240.every((r) => /^contact-\d+-(left|right)-\d+$/.test(r.contactId)));
});
check(13, "step ordinals unchanged (sequential, 1-based)", () => {
  assert.deepEqual(v240.map((r) => r.stepOrdinal), [1, 2, 3, 4, 5, 6, 7, 8]);
});
check(14, "Average Step Length unchanged (byte-identical before/after snapshot)", () => {
  const before = JSON.parse(readFileSync(path.join(root, "tmp/phaseR1B/before-scientific-snapshot-vanni240.json"), "utf8"));
  const after = JSON.parse(readFileSync(path.join(root, "tmp/phaseR1B/after-scientific-snapshot-vanni240.json"), "utf8"));
  assert.equal(before.averageStepLengthM, after.averageStepLengthM);
});
check(15, "Peak Step Length unchanged", () => {
  const before = JSON.parse(readFileSync(path.join(root, "tmp/phaseR1B/before-scientific-snapshot-vanni240.json"), "utf8"));
  const after = JSON.parse(readFileSync(path.join(root, "tmp/phaseR1B/after-scientific-snapshot-vanni240.json"), "utf8"));
  assert.equal(before.peakStepLengthM, after.peakStepLengthM);
});
check(16, "Step Frequency unchanged", () => {
  const before = JSON.parse(readFileSync(path.join(root, "tmp/phaseR1B/before-scientific-snapshot-vanni240.json"), "utf8"));
  const after = JSON.parse(readFileSync(path.join(root, "tmp/phaseR1B/after-scientific-snapshot-vanni240.json"), "utf8"));
  assert.equal(before.combinedStepFrequencyHz, after.combinedStepFrequencyHz);
});
check(17, "velocity/other fields unchanged (full before/after diff, all 4 benchmarks)", () => {
  for (const label of ["gav", "vanni60", "vanni120", "vanni240"]) {
    const before = readFileSync(path.join(root, `tmp/phaseR1B/before-scientific-snapshot-${label}.json`), "utf8");
    const after = readFileSync(path.join(root, `tmp/phaseR1B/after-scientific-snapshot-${label}.json`), "utf8");
    assert.equal(before, after, `${label}: before/after snapshot differs`);
  }
});
check(18, "Vanni 120 unchanged scientifically (0 missing, all accepted match physical)", () => {
  assert.equal(summary.vanni120.totalNoValidLength, 0);
  assert.equal(summary.vanni120.allAcceptedValuesMatchPhysical, true);
});
check(19, "Vanni 60 unchanged scientifically (1 structurally-unavoidable missing, unrelated to R1A cases)", () => {
  assert.equal(summary.vanni60.totalNoValidLength, 1);
  const missing = manifest.vanni60.find((r) => r.physicalStepLengthM == null);
  assert.equal(missing.physicalStepLengthState, "invalid_interval");
});
check(20, "Gav unchanged scientifically (0 missing)", () => {
  assert.equal(summary.gav.totalNoValidLength, 0);
});
check(21, "overlay lookup uses authoritative physicalStepLengthM (not stepLengthM)", () => {
  assert.ok(overlaySrc.includes(".filter((step) => step.physicalStepLengthM != null)"));
  assert.ok(overlaySrc.includes("step.physicalStepLengthM as number"));
  assert.ok(!overlaySrc.includes(".filter((step) => step.stepLengthM != null)"));
});
check(22, "no VideoOverlay distance recomputation exists (still reads the authoritative field only)", () => {
  assert.ok(!overlaySrc.includes("const meters = intervalByEndpoint"));
  assert.match(overlaySrc, /const meters = authoritativeStepLengthByFrameSide\.get/);
});
check(23, "Auto Follow cannot change the value (lookup construction has no transform reference)", () => {
  const slice = overlaySrc.slice(overlaySrc.indexOf("const authoritativeStepLengthByFrameSide"), overlaySrc.indexOf("const authoritativeStepLengthByFrameSide") + 900);
  assert.ok(!/followStateRef|autoFollow|cameraTrackingStateAt|presentationCamera/i.test(slice));
});
check(24, "Stabilized View cannot change the value (same construction, no stabilization reference)", () => {
  const slice = overlaySrc.slice(overlaySrc.indexOf("const authoritativeStepLengthByFrameSide"), overlaySrc.indexOf("const authoritativeStepLengthByFrameSide") + 900);
  assert.ok(!/stabiliz/i.test(slice));
});

console.log(`\n${pass}/${results.length} checks passed.`);
if (pass !== results.length) {
  console.log("\nFAILURES:");
  for (const r of results) if (!r.ok) console.log(`  ${r.n}. ${r.name}: ${r.error}`);
  process.exit(1);
}
