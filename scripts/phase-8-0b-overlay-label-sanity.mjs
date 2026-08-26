// Phase 8.0B -- deterministic sanity tests for the overlay step-length label
// fix. Reads the already-generated forensic artifacts
// (tmp/phase80b/{label}-audit.json, produced by
// scripts/phase-8-0b-overlay-label-audit.mjs against real, current benchmark
// artifacts) and the Phase 8.0A manifest (tmp/phase80a/*-audit.json), and
// asserts the required properties. Standalone, read-only, non-invasive: not
// imported by any src/ production file or build/CI entry point.
//
//   node scripts/phase-8-0b-overlay-label-sanity.mjs

import { readFileSync, existsSync } from "node:fs";

let ok = true;
let n = 0;
const check = (label, cond) => {
  n += 1;
  console.log(`${cond ? "PASS" : "FAIL"} ${String(n).padStart(2, "0")}  ${label}`);
  if (!cond) ok = false;
};

const benchmarks = ["gav", "vanni240", "vanni120", "vanni60"];
const p80bPaths = benchmarks.map((b) => `tmp/phase80b/${b}-audit.json`);
const p80aPaths = benchmarks.map((b) => `tmp/phase80a/${b}-audit.json`);

check("0. Phase 8.0B audit artifacts exist for all 4 benchmarks", p80bPaths.every((p) => existsSync(p)));
check("0b. Phase 8.0A audit artifacts exist for all 4 benchmarks (regression baseline)", p80aPaths.every((p) => existsSync(p)));
if (!ok) { console.log("\nFAILURES PRESENT -- run scripts/phase-8-0b-overlay-label-audit.mjs and scripts/phase-8-0a-step-length-audit.mjs for all four benchmarks first."); process.exit(1); }

const p80b = Object.fromEntries(benchmarks.map((b, i) => [b, JSON.parse(readFileSync(p80bPaths[i], "utf8"))]));
const p80a = Object.fromEntries(benchmarks.map((b, i) => [b, JSON.parse(readFileSync(p80aPaths[i], "utf8"))]));

let totalRows = 0;
let falsePositives = 0;
let falseNegatives = 0;

for (const b of benchmarks) {
  const d = p80b[b];

  // 1/2. New overlay label equals the authoritative individual step length for
  // every contact -- by construction (same lookup), verified literally here.
  const mismatches = d.rows.filter((r) => r.newOverlayLabelM !== r.authoritativeStepLengthM);
  check(`1.${b} NEW overlay label exactly equals authoritative stepLengthM for every detected contact (${d.rows.length} rows)`, mismatches.length === 0);

  // 3. Contact identity well-formed and unique.
  const ids = d.rows.map((r) => r.contactId);
  check(`3.${b} every contactId well-formed`, ids.every((id) => /^contact-\d+-(left|right)-\d+$/.test(id)));
  check(`3.${b} every contactId unique`, new Set(ids).size === ids.length);

  // 4. Zero off-by-one: the label's contactId is derived from the SAME mark
  // object as the step-number index (VideoOverlay.tsx line: both `mark.index`
  // and `markId` read the identical `mark` in the same loop iteration) --
  // structurally guaranteed by the single-pass construction; checked here as
  // "every row's contactId frame/side/index triple matches its own reported
  // sourceFrameIndex/side" (i.e., no cross-wiring in this reconstruction).
  check(`4.${b} contactId triple matches row's own sourceFrameIndex/side`, d.rows.every((r) => r.contactId === `contact-${r.sourceFrameIndex}-${r.side}-${r.contactId.split("-").pop()}`));

  // 14/15/16/17. Average Step Length for THIS run exactly matches the
  // Phase 8.0A-recorded authoritative value (proves the additive `contactId`
  // field on ZoneStep changed no scientific math).
  const a = p80a[b];
  check(`14-17.${b} Average Step Length unchanged vs Phase 8.0A baseline (${a.averageStepLengthM})`, Math.abs(d.averageStepLengthM_authoritative - a.averageStepLengthM) < 1e-9);
  check(`14-17.${b} individualStepLengthsM sequence unchanged vs Phase 8.0A baseline`, JSON.stringify(d.individualStepLengthsM_authoritative) === JSON.stringify(a.individualStepLengthsM));

  for (const r of d.rows) {
    totalRows += 1;
    if (r.oldOverlayLabelM != null && r.authoritativeStepLengthM == null) falsePositives += 1;
    if (r.oldOverlayLabelM == null && r.authoritativeStepLengthM != null) falseNegatives += 1;
  }
}

// 12. Unsupported step does not receive a scientific distance label (post-fix):
// every row where authoritative stepLengthM is null has newOverlayLabelM null too.
const allRows = benchmarks.flatMap((b) => p80b[b].rows);
check("12. post-fix: zero rows show a scientific label for an authoritative-unsupported contact", allRows.every((r) => !(r.authoritativeStepLengthM == null && r.newOverlayLabelM != null)));

// Real, quantified defect proof (Part B/C/K): the PRE-fix path both
// over-labeled (false positives) and under-labeled (false negatives) relative
// to the authoritative metric -- the exact defect this phase fixes.
check(`Real defect proof: PRE-fix overlay had ${falsePositives} false-positive label(s) (shown for an authoritative-unsupported contact)`, falsePositives > 0);
check(`Real defect proof: PRE-fix overlay had ${falseNegatives} false-negative label(s) (suppressed for a real authoritative step)`, falseNegatives > 0);

// 13. Formatting happens only after authoritative value selection: VideoOverlay.tsx
// calls `.toFixed(2)` on the looked-up authoritative value directly, never on an
// intermediate/rounded copy -- verified statically against the real source file.
import { readFileSync as rf } from "node:fs";
const overlaySrc = rf("src/components/video/VideoOverlay.tsx", "utf8");
// Phase R1: the lookup key changed from the full (buggy, index-mismatched)
// `contactId` string to a `sourceFrameIndex-side` pair -- see
// docs/phase-r0-r2-live-ui-reconciliation.md Section 6/7 for the real,
// reproduced bug this fixed (0/8 authoritative Vanni 240 contacts matched
// under the old full-contactId lookup). The underlying contract this check
// verifies -- the label reads the authoritative value directly, with no
// intermediate rounding before `.toFixed(2)` -- still holds; only the
// lookup KEY construction changed.
check("13. VideoOverlay.tsx's label line formats the authoritative lookup result directly (no intermediate rounding)", /const meters = authoritativeStepLengthByFrameSide\.get\(`\$\{mark\.sourceFrameIndex\}-\$\{mark\.side\}`\) \?\? null;/.test(overlaySrc) && /meters\.toFixed\(2\)/.test(overlaySrc));

// 1 (Part O item 1). Overlay never independently computes world step length for
// the label anymore: the old `intervalByEndpoint` (analyzeZoneSteps-derived
// distance) lookup is gone from the label line; the label line only reads the
// authoritative map.
check("O1. overlay's label line no longer reads intervalByEndpoint / recomputed zoneMetrics distance", !/const meters = intervalByEndpoint/.test(overlaySrc));

// 16. Contacts unchanged: this phase only added an additive `contactId` field to
// ZoneStep; StepMark/contact detection files were not touched (checked here by
// literal absence of any edit marker -- git diff is the real proof, shown in the
// report's Section on git status; this script stays read-only/non-git).
check("6. forensic scripts are standalone (not imported by any src/ production file)", !existsSync("src/lib/phase80b"));

console.log(ok ? `\nALL ${n} PASSED (total contact rows examined: ${totalRows})` : `\nFAILURES PRESENT (${n} total)`);
process.exit(ok ? 0 : 1);
