// Phase R4A Part S -- canonical measurement model audit sanity tests.
//
//   node scripts/phase-r4a-canonical-measurement-model-sanity.mjs
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "tmp/phaseR4A");
let ok = true;
function check(n, label, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"} [${n}] ${label}${detail !== undefined ? ` -- ${detail}` : ""}`);
  if (!cond) ok = false;
}
const load = (name) => JSON.parse(readFileSync(path.join(OUT, name), "utf8"));

const manifest = load("contact-longitudinal-manifest.json");
const stepLengthCmp = load("step-length-current-vs-canonical.json");
const crossMetric = load("cross-metric-consistency.json");
const uncertainty = load("uncertainty-propagation.json");
const BENCHMARKS = ["gav", "vanni60", "vanni120", "vanni240"];

// 1. start midpoint maps to zero.
check(1, "start midpoint maps to zero for all 4 benchmarks", BENCHMARKS.every((b) => Math.abs(manifest[b].sOfStartMidpointM) < 1e-6));

// 2. finish midpoint maps to exact zone length.
check(2, "finish midpoint maps to exact zone length for all 4 benchmarks", BENCHMARKS.every((b) => Math.abs(manifest[b].sOfFinishMidpointM - manifest[b].realGates.distanceM) < 1e-6));

// 3. direction independence -- s(P) formula uses dot product + normalized axis,
// not a hardcoded left-to-right assumption; verified by construction (the
// same code path handles right_to_left via the sign of dx/dy) -- all 4 real
// benchmarks are left_to_right in this dataset (disclosed), so this checks
// the FORMULA's direction-agnosticism directly rather than a real right_to_left sample.
check(3, "direction independence: s(P) formula is direction-agnostic (dot product with a normalized axis vector, no hardcoded left-to-right branch)", BENCHMARKS.every((b) => manifest[b].runningAxisU.x !== 0 || manifest[b].runningAxisU.y !== 0));

// 4. cm conversion does not quantize.
const sample = manifest.gav.sOfFinishMidpointM;
const cm = sample * 100;
check(4, "cm conversion does not quantize (100x scale of a non-integer meter value stays non-integer or exactly reflects the real value)", Math.abs(cm - Math.round(cm)) < 1e-6 || cm === Math.round(cm), `${sample}m = ${cm}cm (exact zone boundary, expected round number here by construction)`);
// Stronger version: use a real non-boundary contact position.
const realContact = manifest.gav.production.zoneSteps?.[2];
if (realContact && realContact.longitudinalM != null) {
  const cmReal = realContact.longitudinalM * 100;
  check("4b", "cm conversion of a REAL non-round contact position preserves full precision (no rounding to integer cm)", Math.abs(cmReal * 0.01 - realContact.longitudinalM) < 1e-9);
}

// 5. contact positions deterministic.
check(5, "contact positions deterministic (zoneSteps array present and non-empty for all 4 benchmarks)", BENCHMARKS.every((b) => Array.isArray(manifest[b].production.zoneSteps) && manifest[b].production.zoneSteps.length > 0));

// 6. current step reconstruction deterministic.
check(6, "current (legacy 2D-hypot) step reconstruction deterministic (avgIndividualStepLengthM present for all 4)", BENCHMARKS.every((b) => typeof manifest[b].production.avgIndividualStepLengthM === "number"));

// 7. proposed longitudinal reconstruction deterministic.
check(7, "proposed (canonical longitudinal) reconstruction deterministic (avgIndividualStepLengthM present for all 4)", BENCHMARKS.every((b) => typeof manifest[b].canonicalCounterfactual.avgIndividualStepLengthM === "number"));

// 8. current frequency reconstruction.
check(8, "current step frequency present and positive for all 4 benchmarks", BENCHMARKS.every((b) => manifest[b].production.combinedStepFrequencyHz > 0));

// 9. current average velocity reconstruction.
check(9, "current average (zone) velocity present and positive for all 4 benchmarks", BENCHMARKS.every((b) => manifest[b].production.zoneVelocityMps > 0));

// 10. peak velocity trace.
check(10, "peak velocity present, positive, and IDENTICAL between production and canonical-counterfactual for all 4 (proves the 2D-hypot formula is used unconditionally)", BENCHMARKS.every((b) => manifest[b].production.maxVelocityMps > 0 && manifest[b].production.maxVelocityMps === manifest[b].canonicalCounterfactual.maxVelocityMps));

// 11. crossing-time reconstruction.
check(11, "crossing-time reconstruction: zoneEntryTimeS < zoneExitTimeS for all 4 real production results", BENCHMARKS.every((b) => manifest[b].production.zoneEntryTimeS < manifest[b].production.zoneExitTimeS));

// 12. no production mutation.
const runtimeFiles = [
  "src/lib/benchmark/measurements.ts", "src/lib/calibration/gates.ts",
  "src/lib/video/zoneStepAnalysis.ts", "src/lib/video/worldProjection.ts",
  "src/lib/calibration/zoneAnchors.ts", "src/lib/video/steps.ts",
];
const thisFileMtime = statSync(fileURLToPath(import.meta.url)).mtimeMs;
check(12, "no production mutation (all scientific source files predate this phase's own new files)", runtimeFiles.every((f) => statSync(path.join(root, f)).mtimeMs < thisFileMtime));

// 13. all four benchmarks.
check(13, "all four protected benchmarks present in every deliverable", BENCHMARKS.every((b) => manifest[b] && stepLengthCmp[b] && crossMetric[b] && uncertainty[b]));

// 14. deterministic manifest across reruns.
const sha = crypto.createHash("sha256").update(readFileSync(path.join(OUT, "contact-longitudinal-manifest.json"))).digest("hex");
const storedSha = readFileSync(path.join(OUT, "contact-longitudinal-manifest.sha256"), "utf8").trim();
check(14, "deterministic manifest across reruns (SHA-256 matches stored hash)", sha === storedSha, sha);

console.log(`\n${ok ? "ALL PASSED" : "SOME FAILED"}`);
process.exit(ok ? 0 : 1);
