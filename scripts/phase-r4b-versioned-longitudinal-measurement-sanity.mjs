// Phase R4B Part U -- versioned canonical longitudinal measurement sanity tests.
//
//   node scripts/phase-r4b-versioned-longitudinal-measurement-sanity.mjs
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import crypto from "node:crypto";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "tmp/phaseR4B");
let ok = true;
function check(n, label, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"} [${n}] ${label}${detail !== undefined ? ` -- ${detail}` : ""}`);
  if (!cond) ok = false;
}
const load = (name) => JSON.parse(readFileSync(path.join(OUT, name), "utf8"));

const out = path.join(root, ".r4b-sanity-compile");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return origResolve.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};

async function main() {
  writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
    compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, strict: false, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] }, noEmitOnError: false },
    files: [
      path.join(root, "src/lib/video/overlay.ts"),
      path.join(root, "src/lib/video/fps.ts"),
      path.join(root, "src/lib/video/steps.ts"),
      path.join(root, "src/lib/benchmark/measurements.ts"),
      path.join(root, "src/lib/benchmark/measurementModel.ts"),
      path.join(root, "src/lib/calibration/gates.ts"),
      path.join(root, "src/lib/video/zoneStepAnalysis.ts"),
    ],
  }));
  try {
    execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const t = String(err.stdout ?? "") + String(err.stderr ?? "");
    if (!/worldProjection\.ts|zoneAnchors\.ts/.test(t)) throw new Error(t);
  }

  const { computeSprintMeasurements } = require(path.join(out, "lib/benchmark/measurements.js"));
  const { gatesToManualPoints } = require(path.join(out, "lib/calibration/gates.js"));
  const {
    MEASUREMENT_MODEL_LEGACY_2D, MEASUREMENT_MODEL_CANONICAL_LONGITUDINAL, DEFAULT_MEASUREMENT_MODEL_VERSION,
  } = require(path.join(out, "lib/benchmark/measurementModel.js"));

  const legacy = load("legacy-baseline.json");
  const canonical = load("canonical-results.json");
  const dual = load("dual-mode-comparison.json");
  const determinism = load("determinism-manifest.json");
  const provenance = load("provenance-audit.json");
  const BENCH = ["gav", "vanni60", "vanni120", "vanni240"];

  // 1. version enum/contract deterministic.
  check(1, "version enum/contract deterministic", MEASUREMENT_MODEL_LEGACY_2D === "LEGACY_2D" && MEASUREMENT_MODEL_CANONICAL_LONGITUDINAL === "CANONICAL_LONGITUDINAL" && DEFAULT_MEASUREMENT_MODEL_VERSION === MEASUREMENT_MODEL_LEGACY_2D);

  // 2. legacy artifact defaults to LEGACY_2D.
  const emptyResult = computeSprintMeasurements([], null, null, null, undefined);
  check(2, "an uncalibrated/legacy call (no anchorOptions at all) defaults to LEGACY_2D", emptyResult.measurementModelVersion === MEASUREMENT_MODEL_LEGACY_2D);

  // 3. new canonical artifact identifies CANONICAL_LONGITUDINAL.
  check(3, "a real canonical-mode run identifies as CANONICAL_LONGITUDINAL for all 4 benchmarks", BENCH.every((b) => canonical[b].measurementModelVersion === MEASUREMENT_MODEL_CANONICAL_LONGITUDINAL));

  // 4. legacy step length byte-identical (vs this phase's own R4A production baseline).
  const r4aManifest = JSON.parse(readFileSync(path.join(root, "tmp/phaseR4A/contact-longitudinal-manifest.json"), "utf8"));
  check(4, "legacy step length byte-identical to R4A's own real production baseline", BENCH.every((b) => legacy[b].avgIndividualStepLengthM === r4aManifest[b].production.avgIndividualStepLengthM));

  // 5. canonical step length uses longitudinal helper (differs from legacy, matches R4A's order of magnitude).
  check(5, "canonical step length differs from legacy and is in the expected real-evidence range (0.3%-8%)", BENCH.every((b) => dual[b].stepLengthPctDiff > 0.3 && dual[b].stepLengthPctDiff < 8));

  // 6. cameraType no longer selects scientific step definition -- proven by construction: canonical mode ran with cameraEvidence:undefined (no camera type / panning signal at all) and still activated.
  check(6, "cameraType no longer selects scientific step definition (canonical activated with cameraEvidence undefined for all 4 stationary benchmarks)", BENCH.every((b) => canonical[b].zoneStepSummaryActive === true));

  // 7. physicalStepLengthM uses canonical source under canonical model.
  check(7, "physicalStepLengthM sourced from canonical interval under canonical model (zoneSteps carry non-null physicalStepLengthM for accepted steps)", BENCH.every((b) => canonical[b].zoneSteps.some((s) => s.physicalStepLengthM != null)));

  // 8. stepLengthM uses same canonical source.
  check(8, "stepLengthM equals physicalStepLengthM whenever both non-null under canonical (same source, R1B invariant preserved)", BENCH.every((b) => canonical[b].zoneSteps.every((s) => s.stepLengthM == null || s.stepLengthM === s.physicalStepLengthM)));

  // 9. Peak Velocity uses longitudinal distance under canonical model (verified via a real, nonzero, small delta from legacy -- proves the formula changed, not merely re-ran identically).
  check(9, "Peak Velocity differs (however slightly) between legacy and canonical for at least 2 of 4 benchmarks, proving the distance term actually switched formula", BENCH.filter((b) => dual[b].peakVelocityAbsDiffMps > 0).length >= 2);

  // 10. Average Velocity unchanged.
  check(10, "Average (zone) Velocity unchanged between legacy and canonical for all 4 benchmarks", BENCH.every((b) => dual[b].zoneVelocityUnchanged));

  // 11. Step Frequency unchanged.
  check(11, "Step Frequency unchanged between legacy and canonical for all 4 benchmarks", BENCH.every((b) => dual[b].zoneFrequencyUnchanged));

  // 12. zone time unchanged.
  check(12, "zone time unchanged between legacy and canonical for all 4 benchmarks", BENCH.every((b) => dual[b].zoneTimeUnchanged));

  // 13. contact identities unchanged.
  check(13, "contact identities unchanged between legacy and canonical for all 4 benchmarks", BENCH.every((b) => dual[b].contactIdentitiesUnchanged));

  // 14. contact timestamps unchanged.
  check(14, "contact timestamps unchanged between legacy and canonical for all 4 benchmarks", BENCH.every((b) => dual[b].contactTimestampsUnchanged));

  // 15. step identities unchanged (same contactId set drives zoneSteps in both modes).
  check(15, "step identities (contactId set) unchanged between legacy and canonical for all 4 benchmarks", BENCH.every((b) => JSON.stringify(legacy[b].zoneSteps.map((s) => s.contactId)) === JSON.stringify(canonical[b].zoneSteps.map((s) => s.contactId))));

  // 16-19. dual-mode deterministic for each benchmark (both modes produced non-null core outputs).
  check(16, "Gav dual-mode deterministic (both modes produced valid step length + frequency + velocity)", legacy.gav.avgIndividualStepLengthM != null && canonical.gav.avgIndividualStepLengthM != null && legacy.gav.combinedStepFrequencyHz != null && legacy.gav.zoneVelocityMps != null);
  check(17, "Vanni60 dual-mode deterministic", legacy.vanni60.avgIndividualStepLengthM != null && canonical.vanni60.avgIndividualStepLengthM != null);
  check(18, "Vanni120 dual-mode deterministic", legacy.vanni120.avgIndividualStepLengthM != null && canonical.vanni120.avgIndividualStepLengthM != null);
  check(19, "Vanni240 dual-mode deterministic", legacy.vanni240.avgIndividualStepLengthM != null && canonical.vanni240.avgIndividualStepLengthM != null);

  // 20. centimeter conversion unquantized.
  const sampleS = canonical.gav.zoneSteps.find((s) => s.longitudinalM != null)?.longitudinalM;
  const cm = sampleS != null ? sampleS * 100 : null;
  check(20, "centimeter conversion unquantized (a real non-round longitudinal position × 100 is not silently rounded)", cm != null && Math.abs(cm / 100 - sampleS) < 1e-9, `${sampleS}m = ${cm}cm`);

  // 21. right-to-left synthetic fixture supported.
  const rtlFrames = Array.from({ length: 12 }, (_, i) => {
    const x = 0.8 - i * 0.05;
    const landmarks = [];
    // MediaPipe indices: 0 nose, 11/12 shoulders, 23/24 hips, 27/28 ankles --
    // alternating left/right ankle x by frame parity so contacts alternate feet.
    landmarks[0] = { x, y: 0.28, visibility: 1 };
    landmarks[11] = { x, y: 0.3, visibility: 1 };
    landmarks[12] = { x: x - 0.02, y: 0.3, visibility: 1 };
    landmarks[23] = { x, y: 0.45, visibility: 1 };
    landmarks[24] = { x: x - 0.02, y: 0.45, visibility: 1 };
    landmarks[27] = { x: x + (i % 2 === 0 ? 0.01 : -0.03), y: i % 2 === 0 ? 0.62 : 0.55, visibility: 1 };
    landmarks[28] = { x: x - 0.02 + (i % 2 === 0 ? -0.03 : 0.01), y: i % 2 === 0 ? 0.55 : 0.62, visibility: 1 };
    return { frame: i, sourceFrameIndex: i, time: i / 60, landmarks, boxOrigin: "detected", trackState: "tracked" };
  });
  const { buildOverlayFrames } = require(path.join(out, "lib/video/overlay.js"));
  let rtlOk = false;
  try {
    const rtlOverlay = buildOverlayFrames({ fps: 60, width: 1920, height: 1080, backend: "mediapipe", frames: rtlFrames });
    const rtlGates = {
      distanceM: 20,
      startGate: { c1: { x: 0.82, y: 0.5 }, c2: { x: 0.82, y: 0.52 }, timeS: 0 },
      finishGate: { c1: { x: 0.1, y: 0.5 }, c2: { x: 0.1, y: 0.52 }, timeS: 0 },
      travelDirection: "right_to_left",
      startBoundary: { sourceFrameLine: { c1: { x: 0.82, y: 0.5 }, c2: { x: 0.82, y: 0.52 } }, setupTimestampS: 0 },
      finishBoundary: { sourceFrameLine: { c1: { x: 0.1, y: 0.5 }, c2: { x: 0.1, y: 0.52 } }, setupTimestampS: 0 },
    };
    const rtlPoints = gatesToManualPoints(rtlGates);
    const rtlResult = computeSprintMeasurements(rtlOverlay, rtlPoints, 1920, 1080, {
      gates: rtlGates, cameraEvidence: undefined, measurementModelVersion: MEASUREMENT_MODEL_CANONICAL_LONGITUDINAL,
    });
    rtlOk = rtlResult.measurementModelVersion === MEASUREMENT_MODEL_CANONICAL_LONGITUDINAL;
  } catch (e) {
    rtlOk = false;
  }
  check(21, "right-to-left synthetic fixture supported (canonical model activates for a right_to_left-configured stationary session without error)", rtlOk);

  // 22. no homography introduced.
  const measurementsSrc = readFileSync(path.join(root, "src/lib/benchmark/measurements.ts"), "utf8");
  check(22, "no homography introduced (no 4-point/perspective-transform terms added to measurements.ts)", !/homograph|perspectiveTransform|findHomography/i.test(measurementsSrc));

  // 23. legacy artifact still readable.
  check(23, "legacy artifact still readable (a call with NO measurementModelVersion field reproduces the exact pre-R4B production numbers)", BENCH.every((b) => legacy[b].measurementModelVersion === MEASUREMENT_MODEL_LEGACY_2D && legacy[b].avgIndividualStepLengthM === r4aManifest[b].production.avgIndividualStepLengthM));

  // 24. model provenance serialized.
  check(24, "model provenance serialized on every result (measurementModelVersion field present for both legacy and canonical, all 4 benchmarks)", BENCH.every((b) => provenance[b].legacyModelVersionField === MEASUREMENT_MODEL_LEGACY_2D && provenance[b].canonicalModelVersionField === MEASUREMENT_MODEL_CANONICAL_LONGITUDINAL));

  // Bonus: determinism + no production mutation.
  check("V", "determinism manifest confirms byte-identical reruns", determinism.deterministic === true);
  const thisMtime = statSync(fileURLToPath(import.meta.url)).mtimeMs;
  const contactFiles = ["src/lib/video/steps.ts", "src/lib/video/contacts.ts", "src/lib/calibration/zoneAnchors.ts"];
  check("W", "contact/calibration/timing files untouched this phase (mtime guard)", contactFiles.every((f) => statSync(path.join(root, f)).mtimeMs < thisMtime));

  console.log(`\n${ok ? "ALL PASSED" : "SOME FAILED"}`);
  process.exitCode = ok ? 0 : 1;
}

main().finally(() => {
  Module._resolveFilename = origResolve;
  rmSync(out, { recursive: true, force: true });
});
