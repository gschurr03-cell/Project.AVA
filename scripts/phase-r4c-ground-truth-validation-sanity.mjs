// Phase R4C — sanity suite for the ground-truth validation harness itself
// (Parts I-P, X, and the TESTS section). This tests the VALIDATOR, not
// production scientific code — no analysis math, contact detection, or
// calibration is touched, and nothing here is claimed as real ground-truth
// validation (no real trial data exists yet; see Part X).
//
//   node scripts/phase-r4c-ground-truth-validation-sanity.mjs
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".r4c-sanity-tmp-compile");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return origResolve.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};

let passed = 0;
let failed = 0;
function check(n, label, cond) {
  if (cond) {
    console.log(`PASS [${n}] ${label}`);
    passed++;
  } else {
    console.log(`FAIL [${n}] ${label}`);
    failed++;
  }
}

async function main() {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, strict: false, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] }, noEmitOnError: false },
      files: [
        path.join(root, "src/lib/video/overlay.ts"),
        path.join(root, "src/lib/video/fps.ts"),
        path.join(root, "src/lib/video/steps.ts"),
        path.join(root, "src/lib/benchmark/measurements.ts"),
        path.join(root, "src/lib/benchmark/measurementModel.ts"),
        path.join(root, "src/lib/calibration/gates.ts"),
        path.join(root, "src/lib/video/zoneStepAnalysis.ts"),
        path.join(root, "src/lib/video/worldProjection.ts"),
        path.join(root, "src/lib/calibration/zoneAnchors.ts"),
        path.join(root, "src/lib/validation/groundTruthTrial.ts"),
        path.join(root, "src/lib/validation/groundTruthMatching.ts"),
        path.join(root, "src/lib/validation/groundTruthMetrics.ts"),
        path.join(root, "src/lib/validation/modelSelectionPolicy.ts"),
        path.join(root, "src/lib/validation/aggregateTrials.ts"),
      ],
    }),
  );
  try {
    execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const t = String(err.stdout ?? "") + String(err.stderr ?? "");
    if (!/worldProjection\.ts|zoneAnchors\.ts/.test(t)) throw new Error(t);
  }

  const { matchContacts, contactDetectionStats } = require(path.join(out, "lib/validation/groundTruthMatching.js"));
  const { alignStepLengthErrors, computeGroundTruthStepLengths, computePositionErrors, computeGroundTruthFrequencyHz, compareStepFrequency, compareTiming, compareAverageVelocity, comparePeakVelocity, summarizeErrors, classifyAgainstUncertainty } = require(path.join(out, "lib/validation/groundTruthMetrics.js"));
  const { evaluateModelSelectionPolicy, MODEL_SELECTION_POLICY } = require(path.join(out, "lib/validation/modelSelectionPolicy.js"));
  const { groundTruthTrialSchema } = require(path.join(out, "lib/validation/groundTruthTrial.js"));

  // ---- 1. perfect model gives zero error ----
  {
    const gt = [{ contactNumber: 1, sGroundTruthM: 2.0 }, { contactNumber: 2, sGroundTruthM: 4.0 }];
    const matches = [
      { classification: "MATCHED", gtContactNumber: 1, avaContactId: "a1" },
      { classification: "MATCHED", gtContactNumber: 2, avaContactId: "a2" },
    ];
    const intervalMap = new Map([["a1->a2", 2.0]]);
    const rows = alignStepLengthErrors(computeGroundTruthStepLengths(gt), matches, intervalMap);
    check(1, "perfect model gives zero step-length error", rows.length === 1 && rows[0].comparable && rows[0].errorM === 0 && rows[0].errorCm === 0);
  }

  // ---- 2. known +5cm error returns +5cm ----
  {
    const gt = [{ contactNumber: 1, sGroundTruthM: 0 }, { contactNumber: 2, sGroundTruthM: 2.0 }];
    const matches = [
      { classification: "MATCHED", gtContactNumber: 1, avaContactId: "a1" },
      { classification: "MATCHED", gtContactNumber: 2, avaContactId: "a2" },
    ];
    const intervalMap = new Map([["a1->a2", 2.05]]);
    const rows = alignStepLengthErrors(computeGroundTruthStepLengths(gt), matches, intervalMap);
    check(2, "known +5cm error returns +5.00cm", Math.abs(rows[0].errorCm - 5) < 1e-9);
  }

  // ---- 3. known -5cm error returns -5cm ----
  {
    const gt = [{ contactNumber: 1, sGroundTruthM: 0 }, { contactNumber: 2, sGroundTruthM: 2.0 }];
    const matches = [
      { classification: "MATCHED", gtContactNumber: 1, avaContactId: "a1" },
      { classification: "MATCHED", gtContactNumber: 2, avaContactId: "a2" },
    ];
    const intervalMap = new Map([["a1->a2", 1.95]]);
    const rows = alignStepLengthErrors(computeGroundTruthStepLengths(gt), matches, intervalMap);
    check(3, "known -5cm error returns -5.00cm", Math.abs(rows[0].errorCm - -5) < 1e-9);
  }

  // ---- 4. missed contact classified correctly ----
  {
    const gt = [{ contactNumber: 1, side: "left", timestampS: 0 }, { contactNumber: 2, side: "right", timestampS: 0.2 }, { contactNumber: 3, side: "left", timestampS: 0.4 }];
    const ava = [{ contactId: "a1", side: "left", timeS: 0.001 }, { contactId: "a2", side: "left", timeS: 0.401 }]; // right contact at t=0.2 missing
    const matches = matchContacts(gt, ava);
    const missed = matches.find((m) => m.classification === "AVA_FALSE_NEGATIVE" && m.gtContactNumber === 2);
    check(4, "missed contact classified AVA_FALSE_NEGATIVE", missed != null);
  }

  // ---- 5. false positive classified correctly ----
  {
    const gt = [{ contactNumber: 1, side: "left", timestampS: 0 }];
    const ava = [{ contactId: "a1", side: "left", timeS: 0.001 }, { contactId: "a2", side: "right", timeS: 0.2 }]; // extra AVA contact
    const matches = matchContacts(gt, ava);
    const extra = matches.find((m) => m.classification === "AVA_FALSE_POSITIVE" && m.avaContactId === "a2");
    check(5, "extra AVA contact classified AVA_FALSE_POSITIVE", extra != null);
  }

  // ---- 6. side mismatch cannot silently match ----
  {
    const gt = [{ contactNumber: 1, side: "left", timestampS: 0 }];
    const ava = [{ contactId: "a1", side: "right", timeS: 0.001 }];
    const matches = matchContacts(gt, ava);
    check(6, "side mismatch within window is AMBIGUOUS, never MATCHED", matches.length === 1 && matches[0].classification === "AMBIGUOUS");
  }

  // ---- 7. timing error computed in ms ----
  {
    const rows = compareTiming({ entryTimeS: 0.2, exitTimeS: 2.2, zoneTimeS: 2.0 }, { entryTimeS: 0.21, exitTimeS: 2.22, zoneTimeS: 2.01 });
    const zoneRow = rows.find((r) => r.metric === "zoneTime");
    check(7, "timing error computed in ms (2.01-2.00 = +10ms)", zoneRow != null && Math.abs(zoneRow.errorMs - 10) < 1e-6);
  }

  // ---- 8. frequency reconstruction correct ----
  {
    // 5 contacts, 4 intervals, spanning exactly 0.8s -> 4/0.8 = 5 Hz
    const gt = [0, 0.2, 0.4, 0.6, 0.8].map((t) => ({ timestampS: t }));
    const hz = computeGroundTruthFrequencyHz(gt);
    check(8, "GT step-frequency reconstruction (4 intervals / 0.8s = 5.0 Hz)", Math.abs(hz - 5.0) < 1e-9);
    const cmp = compareStepFrequency(hz, 5.0);
    check("8b", "frequency comparison reports zero error for exact match", cmp.errorAbs === 0);
  }

  // ---- 9. average velocity reconstruction correct ----
  {
    // 20m in 2.0s => 10 m/s
    const cmp = compareAverageVelocity(20, 2.0, 10.0);
    check(9, "GT average-velocity reconstruction (20m/2.0s = 10.0 m/s) matches AVA exactly", cmp.gtValue === 10 && cmp.errorAbs === 0);
  }

  // ---- 10. uncertainty classification correct ----
  {
    const within = classifyAgainstUncertainty(0.015, 0.02);
    const outside = classifyAgainstUncertainty(0.03, 0.02);
    const unknown = classifyAgainstUncertainty(0.03, null);
    check(10, "uncertainty classification: within/outside/unknown all correct", within === "WITHIN_GROUND_TRUTH_UNCERTAINTY" && outside === "OUTSIDE_GROUND_TRUTH_UNCERTAINTY" && unknown === "UNCERTAINTY_UNKNOWN");
  }

  // ---- 11. missing GT remains unavailable ----
  {
    const trial = groundTruthTrialSchema.parse({
      schemaVersion: "ava-ground-truth-trial-v1",
      trialId: "t-missing",
      zoneLengthMeters: 20,
      contacts: [{ contactNumber: 1, sGroundTruthM: 1.0 }], // no timestamp, no side, no uncertainty
    });
    const rows = compareTiming({ entryTimeS: null, exitTimeS: null, zoneTimeS: null }, { entryTimeS: 0.2, exitTimeS: 2.2, zoneTimeS: 2.0 });
    check(11, "missing GT fields degrade to unavailable, not a thrown error or fabricated zero", trial.contacts[0].timestampS === null && trial.contacts[0].side === null && rows.every((r) => r.errorMs === null));
  }

  // ---- 12. Peak Velocity unavailable without independent GT ----
  {
    const noGt = comparePeakVelocity({ available: false, valueMps: null, method: null }, 11.2);
    const avaAsMethod = comparePeakVelocity({ available: true, valueMps: 11.5, method: "AVA displayed value" }, 11.2);
    check(12, "Peak Velocity unavailable with no GT, and rejected when method references AVA itself", noGt.available === false && avaAsMethod.available === false);
    const realGt = comparePeakVelocity({ available: true, valueMps: 11.5, method: "radar gun" }, 11.2);
    check("12b", "Peak Velocity IS available and compared given a genuinely independent method", realGt.available === true && Math.abs(realGt.errorAbs - -0.3) < 1e-9);
  }

  // ---- 13. Legacy and Canonical evaluated independently ----
  {
    const gt = [{ contactNumber: 1, sGroundTruthM: 0 }, { contactNumber: 2, sGroundTruthM: 2.0 }];
    const matches = [{ classification: "MATCHED", gtContactNumber: 1, avaContactId: "a1" }, { classification: "MATCHED", gtContactNumber: 2, avaContactId: "a2" }];
    const legacyRows = alignStepLengthErrors(computeGroundTruthStepLengths(gt), matches, new Map([["a1->a2", 1.90]]));
    const canonicalRows = alignStepLengthErrors(computeGroundTruthStepLengths(gt), matches, new Map([["a1->a2", 2.10]]));
    check(13, "legacy and canonical produce independently different errors from the same GT/matches", legacyRows[0].errorCm !== canonicalRows[0].errorCm && Math.abs(legacyRows[0].errorCm - -10) < 1e-9 && Math.abs(canonicalRows[0].errorCm - 10) < 1e-9);
  }

  // ---- 14. validator cannot mutate scientific output ----
  {
    const gtContacts = [{ contactNumber: 1, side: "left", timestampS: 0 }, { contactNumber: 2, side: "right", timestampS: 0.2 }];
    const avaContacts = [{ contactId: "a1", side: "left", timeS: 0.001 }, { contactId: "a2", side: "right", timeS: 0.199 }];
    const gtBefore = JSON.stringify(gtContacts);
    const avaBefore = JSON.stringify(avaContacts);
    matchContacts(gtContacts, avaContacts);
    check(14, "matchContacts does not mutate its inputs", JSON.stringify(gtContacts) === gtBefore && JSON.stringify(avaContacts) === avaBefore);
  }

  // ---- 15. deterministic output ----
  {
    const gtContacts = [{ contactNumber: 1, side: "left", timestampS: 0 }, { contactNumber: 2, side: "right", timestampS: 0.2 }, { contactNumber: 3, side: "left", timestampS: 0.4 }];
    const avaContacts = [{ contactId: "a1", side: "left", timeS: 0.001 }, { contactId: "a2", side: "right", timeS: 0.199 }, { contactId: "a3", side: "left", timeS: 0.402 }];
    const run1 = JSON.stringify(matchContacts(gtContacts, avaContacts));
    const run2 = JSON.stringify(matchContacts(gtContacts, avaContacts));
    check(15, "matching is deterministic across repeated runs on identical input", run1 === run2);
  }

  // ---- 16. right-to-left fixture (real integration through computeSprintMeasurements) ----
  {
    const { buildOverlayFrames } = require(path.join(out, "lib/video/overlay.js"));
    const { applyFpsOverride, normalizeFps } = require(path.join(out, "lib/video/fps.js"));
    const { computeSprintMeasurements } = require(path.join(out, "lib/benchmark/measurements.js"));
    const { MEASUREMENT_MODEL_CANONICAL_LONGITUDINAL } = require(path.join(out, "lib/benchmark/measurementModel.js"));

    const width = 1920, height = 1080, fps = 60;
    const frames = [];
    for (let i = 0; i < 12; i++) {
      const t = i / fps;
      const progress = i / 11;
      const x = 0.82 - progress * 0.72; // right (0.82) -> left (0.10)
      const landmarks = [];
      landmarks[0] = { x, y: 0.5, visibility: 1 };
      landmarks[11] = { x: x + 0.01, y: 0.42, visibility: 1 };
      landmarks[12] = { x: x - 0.01, y: 0.42, visibility: 1 };
      landmarks[23] = { x: x + 0.01, y: 0.55, visibility: 1 };
      landmarks[24] = { x: x - 0.01, y: 0.55, visibility: 1 };
      const ankleY = 0.62 + (i % 2 === 0 ? 0.03 : -0.03);
      landmarks[27] = { x: x + 0.015, y: ankleY, visibility: 1 };
      landmarks[28] = { x: x - 0.015, y: 0.6 - (ankleY - 0.62), visibility: 1 };
      frames.push({ frame: i, sourceFrameIndex: i, time: t, landmarks });
    }
    const baseFrames = buildOverlayFrames({ fps, width, height, backend: "mediapipe", frames });
    const overlayFrames = applyFpsOverride(baseFrames, normalizeFps(fps));
    const gates = {
      startBoundary: { sourceFrameLine: { c1: { x: 0.83, y: 0.6 }, c2: { x: 0.81, y: 0.6 } }, setupFrameIndex: 0, setupTimestampS: 0 },
      finishBoundary: { sourceFrameLine: { c1: { x: 0.11, y: 0.6 }, c2: { x: 0.09, y: 0.6 } }, setupFrameIndex: 0, setupTimestampS: 0 },
      distanceM: 20,
      cameraType: "stationary",
      travelDirection: "right_to_left",
    };
    const manualPoints = { ax: 0.82, ay: 0.6, bx: 0.1, by: 0.6, distanceM: 20, aTimeS: 0, bTimeS: 0 };
    let threw = false;
    let result = null;
    try {
      result = computeSprintMeasurements(overlayFrames, manualPoints, width, height, { gates, cameraEvidence: undefined, measurementModelVersion: MEASUREMENT_MODEL_CANONICAL_LONGITUDINAL });
    } catch {
      threw = true;
    }
    check(16, "right-to-left fixture activates CANONICAL_LONGITUDINAL without throwing", !threw && result != null && result.measurementModelVersion === "CANONICAL_LONGITUDINAL");
  }

  // ---- 17. cm conversion remains unquantized ----
  {
    const gt = [{ contactNumber: 1, sGroundTruthM: 0 }, { contactNumber: 2, sGroundTruthM: 7.438291 }];
    const matches = [{ classification: "MATCHED", gtContactNumber: 1, avaContactId: "a1" }, { classification: "MATCHED", gtContactNumber: 2, avaContactId: "a2" }];
    const rows = alignStepLengthErrors(computeGroundTruthStepLengths(gt), matches, new Map([["a1->a2", 7.44]]));
    check(17, "cm conversion preserves full float precision (743.8291cm GT, not rounded)", Math.abs(gt[1].sGroundTruthM * 100 - 743.8291) < 1e-9 && rows[0].errorCm !== Math.round(rows[0].errorCm));
  }

  // ---- 18. model-selection policy deterministic ----
  {
    const statsInsufficient = { independentTrialCount: 2, distinctAthleteCount: 1, fpsClassesCovered: [60], legacyMedianAbsStepLengthErrorCm: 3, canonicalMedianAbsStepLengthErrorCm: 2, legacyMedianAbsPositionErrorCm: null, canonicalMedianAbsPositionErrorCm: 2, legacyContactDetectionF1: 0.95, canonicalContactDetectionF1: 0.95, maxUnrelatedMetricDriftPercentObserved: 0.1 };
    const r1 = evaluateModelSelectionPolicy(statsInsufficient);
    const r2 = evaluateModelSelectionPolicy(statsInsufficient);
    const statsSufficientAndMeeting = { independentTrialCount: 8, distinctAthleteCount: 3, fpsClassesCovered: [60, 120, 240], legacyMedianAbsStepLengthErrorCm: 3.0, canonicalMedianAbsStepLengthErrorCm: 2.0, legacyMedianAbsPositionErrorCm: 2.0, canonicalMedianAbsPositionErrorCm: 2.2, legacyContactDetectionF1: 0.95, canonicalContactDetectionF1: 0.95, maxUnrelatedMetricDriftPercentObserved: 0.1 };
    const r3 = evaluateModelSelectionPolicy(statsSufficientAndMeeting);
    check(
      18,
      "model-selection policy is deterministic and correctly gates on coverage/thresholds",
      r1.verdict === "INSUFFICIENT_DATA" &&
        JSON.stringify(r1) === JSON.stringify(r2) &&
        r3.verdict === "CANONICAL_LONGITUDINAL_MEETS_CRITERIA" &&
        MODEL_SELECTION_POLICY.minIndependentTrials === 6,
    );
  }

  // ---- bonus: contact detection precision/recall/F1 sanity ----
  {
    const stats = contactDetectionStats([
      { classification: "MATCHED" }, { classification: "MATCHED" }, { classification: "MATCHED" },
      { classification: "AVA_FALSE_POSITIVE" },
      { classification: "AVA_FALSE_NEGATIVE" },
    ]);
    check("B1", "precision/recall/F1 computed correctly from classification counts (TP=3,FP=1,FN=1)", Math.abs(stats.precision - 0.75) < 1e-9 && Math.abs(stats.recall - 0.75) < 1e-9 && Math.abs(stats.f1 - 0.75) < 1e-9);
  }

  // ---- bonus: summarizeErrors sanity (MAE/RMSE/median/p95/bias/max) ----
  {
    const s = summarizeErrors([1, -2, 3, -4, 5]);
    check("B2", "summarizeErrors computes MAE/median/bias/max correctly", s.n === 5 && Math.abs(s.mae - 3) < 1e-9 && s.medianAbsError === 3 && Math.abs(s.meanSignedBias - 0.6) < 1e-9 && s.maxAbsError === 5);
  }

  // ---- bonus: mtime guard -- zero production scientific code changed this phase ----
  {
    const { statSync } = require("node:fs");
    const guardFiles = ["src/lib/video/steps.ts", "src/lib/benchmark/measurements.ts", "src/lib/benchmark/measurementModel.ts", "src/lib/video/zoneStepAnalysis.ts", "src/lib/calibration/gates.ts", "src/lib/calibration/zoneAnchors.ts"];
    // R4B already legitimately modified measurements.ts/measurementModel.ts; R4C must not modify ANY of them further.
    // Guard here only checks the files R4C must never touch (contact/step/calibration/gate math).
    const untouchable = ["src/lib/video/steps.ts", "src/lib/video/zoneStepAnalysis.ts", "src/lib/calibration/gates.ts", "src/lib/calibration/zoneAnchors.ts"];
    const r4bDoneAt = statSync(path.join(root, "docs/phase-r4b-versioned-canonical-longitudinal-measurement.md")).mtimeMs;
    const allUntouchedSinceR4B = untouchable.every((f) => statSync(path.join(root, f)).mtimeMs <= r4bDoneAt + 5000);
    check("B3", "contact/step/calibration/gate files untouched since R4B closed", allUntouchedSinceR4B);
    void guardFiles;
  }

  console.log(`\n${passed}/${passed + failed} checks passed.`);
  if (failed > 0) {
    console.log("SOME FAILED");
    process.exitCode = 1;
  } else {
    console.log("ALL PASSED");
  }
}

main().finally(() => {
  Module._resolveFilename = origResolve;
  rmSync(out, { recursive: true, force: true });
});
