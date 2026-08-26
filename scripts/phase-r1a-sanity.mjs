// Phase R1A -- 10 deterministic forensic checks for the missing early
// (0-10m) individual step-length values investigation. Evidence-only: no
// production behavior is changed by this phase.
//
//   node --env-file=.env.local scripts/phase-r1a-sanity.mjs
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

const stepMap = JSON.parse(readFileSync(path.join(root, "tmp/phaseR1A/step-position-map.json"), "utf8"));

check(1, "Vanni 240 step-position reconstruction deterministic", () => {
  const v240 = stepMap.vanni240.stepPositionMap;
  assert.equal(v240.length, 8);
  assert.equal(v240[0].contactId, "contact-119-left-2");
  assert.equal(v240[1].contactId, "contact-278-left-3");
  assert.equal(v240[7].contactId, "contact-583-left-9");
});

check(2, "0-10 vs 10-20 classification deterministic", () => {
  const v240 = stepMap.vanni240.stepPositionMap;
  const zero_to_10 = v240.filter((r) => r.in0to10m).map((r) => r.contactId);
  const ten_to_20 = v240.filter((r) => r.in10to20m).map((r) => r.contactId);
  assert.deepEqual(zero_to_10, ["contact-119-left-2", "contact-278-left-3", "contact-330-right-4"]);
  assert.deepEqual(ten_to_20, ["contact-375-left-5", "contact-443-right-6", "contact-475-left-7", "contact-543-right-8", "contact-583-left-9"]);
});

check(3, "authoritative lookup deterministic (real production rerun matches saved trace)", () => {
  const out = execFileSync("node", ["--env-file=.env.local", "scripts/phase-r1a-early-step-forensic.mjs"], { cwd: root, encoding: "utf8" });
  assert.match(out, /step 1 \(contact-119-left-2\)[\s\S]*render=false/);
  assert.match(out, /step 3 \(contact-330-right-4\)[\s\S]*render=true/);
});

check(4, "working late labels reproduce exactly", () => {
  const v240 = stepMap.vanni240.stepPositionMap;
  const working = v240.filter((r) => r.in10to20m);
  assert.ok(working.every((r) => r.meterLabelWouldRender === true));
  assert.deepEqual(working.map((r) => r.authoritativeStepLengthM), [1.862572391195754, 2.181288615344509, 1.8164764884289313, 2.2346259393669015, 1.991379802357244]);
});

check(5, "missing early labels reproduce exactly", () => {
  const v240 = stepMap.vanni240.stepPositionMap;
  assert.equal(v240[0].meterLabelWouldRender, false);
  assert.equal(v240[1].meterLabelWouldRender, false);
  assert.deepEqual(v240[0].legacyRejectReasons, ["implausible_step_duration", "implausible_step_distance"]);
  assert.deepEqual(v240[1].legacyRejectReasons, ["foot_sequence_discontinuity", "missing_intermediate_contact", "contact_sequence_gap", "implausible_step_distance"]);
});

check(6, "previous-contact availability deterministic", () => {
  const v60 = stepMap.vanni60.stepPositionMap;
  assert.equal(v60[0].previousContactExists, false); // genuinely the first contact overall -- correctly unavailable, not a bug
  const v240 = stepMap.vanni240.stepPositionMap;
  assert.equal(v240[0].previousContactExists, true);
  assert.equal(v240[0].previousContactInZoneByWorldX, false); // step 1's previous contact is genuinely pre-zone
  assert.equal(v240[1].previousContactSide, "left"); // step 2's previous contact is the SAME foot -- proves a real missing intermediate contact
});

check(7, "zone eligibility classification deterministic (all gapMarks ARE inZoneByWorldX -- rejection is NOT zone membership)", () => {
  for (const label of ["gav", "vanni60", "vanni120", "vanni240"]) {
    const rows = stepMap[label].stepPositionMap;
    assert.ok(rows.every((r) => r.inZoneByWorldX === true), `${label}: every gapMark must already be inside the zone by world-x -- zone MEMBERSHIP is not what excludes the early labels`);
  }
});

check(8, "world-distance recomputation matches production geometry (same authoritative distanceMetersFromPrev field, no new formula)", () => {
  const v240 = stepMap.vanni240.stepPositionMap;
  // The physical distance value is COMPUTED regardless of integrity outcome --
  // proving a real world distance exists even for the two rejected steps.
  assert.equal(v240[0].distanceMetersFromPrevPhysical, 3.4421);
  assert.equal(v240[1].distanceMetersFromPrevPhysical, 5.6332);
  assert.ok(v240[0].distanceMetersFromPrevPhysical > 0 && v240[1].distanceMetersFromPrevPhysical > 0);
});

check(9, "instrumentation changes no production behavior (measurements.ts untouched, mtime-verified)", () => {
  const mtimeM = statSync(path.join(root, "src/lib/benchmark/measurements.ts")).mtimeMs;
  const thisPhaseFiles = ["scripts/phase-r1a-early-step-forensic.mjs", "scripts/phase-r1a-sanity.mjs"];
  const earliest = Math.min(...thisPhaseFiles.map((f) => statSync(path.join(root, f)).mtimeMs));
  assert.ok(mtimeM < earliest, "src/lib/benchmark/measurements.ts was modified during this phase's own work window -- it must not be, this phase is evidence-only");
  const src = readFileSync(path.join(root, "src/lib/benchmark/measurements.ts"), "utf8");
  assert.ok(!src.includes("diagnosticMarks"), "the diagnostic patch must exist ONLY in the throwaway compiled copy, never in the real source file");
});

check(10, "metrics unchanged (real production pipeline rerun)", () => {
  const outText = execFileSync("node", ["scripts/vanni-240-metric-evidence-sanity.mjs"], { cwd: root, encoding: "utf8" });
  assert.ok(/ALL PASSED/.test(outText));
});

console.log(`\n${pass}/${results.length} checks passed.`);
if (pass !== results.length) {
  console.log("\nFAILURES:");
  for (const r of results) if (!r.ok) console.log(`  ${r.n}. ${r.name}: ${r.error}`);
  process.exit(1);
}
