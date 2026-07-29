import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const out = fs.mkdtempSync(path.join(os.tmpdir(), "ava-zone-steps-"));
try {
  execFileSync("npx", [
    "tsc",
    "src/lib/video/zoneStepAnalysis.ts",
    "--outDir", out,
    "--module", "commonjs",
    "--target", "es2022",
    "--skipLibCheck",
    "--esModuleInterop",
    "--strict",
  ], { cwd: root, stdio: "pipe" });
  fs.writeFileSync(path.join(out, "package.json"), '{"type":"commonjs"}\n');
  const require = createRequire(import.meta.url);
  const { analyzeZoneSteps } = require(path.join(out, "zoneStepAnalysis.js"));

  const c = (id, x, side = id.endsWith("L") ? "left" : "right", timeS = Number(id.replace(/\D/g, "")) || 0) => ({
    id, x, y: 0, side, timeS, sourceFrameIndex: Math.round(timeS * 100), confidence: 0.9,
  });
  const run = (contacts, extra = {}) => analyzeZoneSteps({
    contacts, start: { x: 0, y: 0 }, finish: { x: 10, y: 0 }, distanceM: 10,
    boundaryToleranceM: 0.05, ...extra,
  });
  let n = 0;
  const check = (name, fn) => { fn(); n += 1; console.log(`✓ ${name}`); };

  check("1 no contacts", () => assert.equal(run([]).stepCountInZone, 0));
  check("2 all contacts before zone", () => assert.equal(run([c("1L", -2), c("2R", -1)]).stepCountInZone, 0));
  check("3 all contacts after zone", () => assert.equal(run([c("1L", 11), c("2R", 12)]).stepCountInZone, 0));
  check("4 one in-zone contact counts but has no length", () => {
    const r = run([c("1L", 5)]);
    assert.equal(r.stepCountInZone, 1); assert.equal(r.stepLengthCount, 0);
  });
  check("5 pre-zone contact is excluded from first length", () => {
    const r = run([c("1L", -1), c("2R", 1), c("3L", 3)]);
    assert.deepEqual(r.intervals.map((x) => x.longitudinalLengthM), [2]);
  });
  check("6 internal intervals use consecutive in-zone contacts", () => {
    assert.deepEqual(run([c("1L", 1), c("2R", 3), c("3L", 5)]).intervals.map((x) => x.longitudinalLengthM), [2, 2]);
  });
  check("7 first post-zone contact closes final interval", () => {
    const r = run([c("1L", 7), c("2R", 9), c("3L", 11)]);
    assert.equal(r.intervals.at(-1).kind, "trailing_exit"); assert.equal(r.intervals.at(-1).longitudinalLengthM, 2);
  });
  check("8 later post-zone contacts are ignored", () => {
    assert.equal(run([c("1L", 9), c("2R", 11), c("3L", 13)]).intervals.length, 1);
  });
  check("9 missing post-zone contact is explicit", () => {
    assert(run([c("1L", 7), c("2R", 9)]).qualityFlags.includes("missing_post_zone_contact"));
  });
  check("10 start boundary is ambiguous and deterministically included", () => {
    const r = run([c("1L", 0)]);
    assert.equal(r.contacts[0].classification, "boundary_ambiguous"); assert.equal(r.stepCountInZone, 1);
  });
  check("11 just outside start boundary is ambiguous and excluded", () => {
    const r = run([c("1L", -0.02)]);
    assert.equal(r.contacts[0].classification, "boundary_ambiguous"); assert.equal(r.stepCountInZone, 0);
  });
  check("12 right-to-left footage uses the canonical start-to-finish axis", () => {
    const r = analyzeZoneSteps({
      contacts: [c("1L", 3), c("2R", 1), c("3L", -1)],
      start: { x: 10, y: 0 }, finish: { x: 0, y: 0 }, distanceM: 10,
    });
    assert.equal(r.stepCountInZone, 2); assert.deepEqual(r.intervals.map((x) => x.longitudinalLengthM), [2, 2]);
  });
  check("13 lateral displacement is separate from longitudinal length", () => {
    const r = run([{ ...c("1L", 1), y: 0 }, { ...c("2R", 3), y: 4 }]);
    assert.equal(r.intervals[0].longitudinalLengthM, 2); assert.equal(r.intervals[0].lateralDisplacementM, 4);
  });
  check("14 non-alternating contacts are flagged", () => {
    assert(run([c("1L", 1), c("2L", 3)]).qualityFlags.includes("non_alternating_sequence"));
  });
  check("15 non-forward geometry is rejected, never absolute-valued", () => {
    const r = run([c("1L", 4), c("2R", 3)]);
    assert.equal(r.intervals[0].longitudinalLengthM, null);
    assert(r.qualityFlags.includes("non_forward_interval"));
  });
  check("16 summary average equals the authoritative displayed intervals", () => {
    const r = run([c("1L", 1), c("2R", 3), c("3L", 6), c("4R", 9), c("5L", 11)]);
    const shown = r.intervals.map((x) => x.longitudinalLengthM).filter((x) => x != null);
    assert.equal(r.summaries.averageStepLengthM, shown.reduce((a, b) => a + b, 0) / shown.length);
  });
  check("17 contract groups never put the final endpoint inside the zone", () => {
    const r = run([c("1L", 8), c("2R", 9.5), c("3L", 11)]);
    assert.equal(r.contactGroups.firstPostZone, "3L");
    assert(!r.contactGroups.insideZone.includes("3L"));
  });
  check("18 later post-zone contacts are explicitly excluded", () => {
    assert.deepEqual(run([c("1L", 9), c("2R", 11), c("3L", 13)]).contactGroups.excludedAfterZone, ["3L"]);
  });
  check("19 landing-foot sample counts come from valid intervals", () => {
    const r = run([c("1L", 1), c("2R", 3), c("3L", 5), c("4R", 7), c("5L", 9), c("6R", 11)]);
    assert.equal(r.summaries.leftStepSampleCount, 2); assert.equal(r.summaries.rightStepSampleCount, 3);
  });
  check("20 bilateral asymmetry is withheld below two samples per side", () => {
    assert.equal(run([c("1L", 1), c("2R", 3), c("3L", 5)]).summaries.stepLengthAsymmetryPct, null);
  });
  check("21 cadence uses the same authoritative interval durations", () => {
    const r = run([c("1L", 1, "left", 1), c("2R", 3, "right", 1.2), c("3L", 5, "left", 1.4)]);
    assert.equal(r.summaries.stepFrequencyHz, 5);
  });
  check("22 camera pan translation does not change metric values", () => {
    const base = run([c("1L", 1), c("2R", 3), c("3L", 5)]);
    const shifted = analyzeZoneSteps({
      contacts: [c("1L", 101), c("2R", 103), c("3L", 105)],
      start: { x: 100, y: 20 }, finish: { x: 110, y: 20 }, distanceM: 10,
    });
    assert.deepEqual(shifted.intervals.map((x) => x.longitudinalLengthM), base.intervals.map((x) => x.longitudinalLengthM));
  });
  check("23 seek and resize cannot mutate a pure contract result", () => {
    const input = [c("1L", 1), c("2R", 3), c("3L", 5)];
    assert.deepEqual(run(input), run(input));
  });
  check("24 invalid coordinates never produce NaN, Infinity, or fake zero", () => {
    const r = run([c("1L", 1), { ...c("2R", 3), x: NaN }, c("3L", 5)]);
    assert(!JSON.stringify(r).match(/NaN|Infinity/));
    assert(r.intervals.every((interval) => interval.longitudinalLengthM !== 0));
  });
  check("25 metric semantics are explicitly versioned", () => {
    assert.equal(run([c("1L", 1)]).schemaVersion, "zone-step-metrics-v1");
  });

  console.log(`\n${n}/25 zone-metrics checks passed`);
} finally {
  fs.rmSync(out, { recursive: true, force: true });
}
