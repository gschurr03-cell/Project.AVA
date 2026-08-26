// Deterministic sanity for Acceleration Mechanics (Phase 3, Part 19).
//
//   node scripts/acceleration-mechanics-sanity.mjs
//
// Compiles the Phase 3 mechanics modules and exercises them against
// synthetic, hand-computed pose/step data — no real footage, no network, no
// DB. Covers the numbered Part 19 requirements that are testable at the
// pure-computation layer; items that depend on UI that hasn't been built yet
// (Part 2's contact editor, Part 16's overlay) are reported as SKIPPED, never
// faked as passing.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".acceleration-mechanics-sanity-tmp");

let ok = true;
let skipped = 0;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};
const skip = (label, reason) => {
  console.log(`SKIP  ${label} — ${reason}`);
  skipped += 1;
};
const approx = (a, b, tol = 1e-6) => a != null && b != null && Math.abs(a - b) <= tol;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

try {
  const tsconfigPath = path.join(out, "tsconfig.json");
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        outDir: out,
        rootDir: path.join(root, "src/lib"),
        module: "commonjs",
        target: "es2022",
        skipLibCheck: true,
        esModuleInterop: true,
        strict: true,
        moduleResolution: "node",
      },
      files: [
        path.join(root, "src/lib/acceleration/mechanicsDefinitions.ts"),
        path.join(root, "src/lib/acceleration/mechanics.ts"),
        path.join(root, "src/lib/acceleration/mechanicsProgression.ts"),
        path.join(root, "src/lib/acceleration/strategyClassification.ts"),
        path.join(root, "src/lib/acceleration/mechanicsAsymmetry.ts"),
        path.join(root, "src/lib/acceleration/mechanicalLimitingFactors.ts"),
        path.join(root, "src/lib/acceleration/mechanicsPipeline.ts"),
        path.join(root, "src/lib/acceleration/individualizedExpectations.ts"),
        path.join(root, "src/lib/acceleration/schema.ts"),
        path.join(root, "src/lib/acceleration/limitingFactors.ts"),
        path.join(root, "src/lib/acceleration/metrics.ts"),
        path.join(root, "src/lib/acceleration/steps.ts"),
        path.join(root, "src/lib/acceleration/progression.ts"),
      ],
    }),
  );
  execFileSync("npx", ["tsc", "-p", tsconfigPath], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const defs = require(path.join(out, "acceleration/mechanicsDefinitions.js"));
  const mechanicsMod = require(path.join(out, "acceleration/mechanics.js"));
  const progressionMod = require(path.join(out, "acceleration/mechanicsProgression.js"));
  const strategyMod = require(path.join(out, "acceleration/strategyClassification.js"));
  const asymmetryMod = require(path.join(out, "acceleration/mechanicsAsymmetry.js"));
  const limitersMod = require(path.join(out, "acceleration/mechanicalLimitingFactors.js"));
  const pipelineMod = require(path.join(out, "acceleration/mechanicsPipeline.js"));
  const schemaMod = require(path.join(out, "acceleration/schema.js"));
  const flyLimiterFactorsMod = require(path.join(out, "acceleration/limitingFactors.js"));

  const { travelSign, signedAngleFromVerticalDeg, forwardOffset, MIN_LANDMARK_CONFIDENCE } = defs;
  const { computeContactMechanics, computeAllContactMechanics } = mechanicsMod;
  const {
    analyzeTrunkProgression,
    analyzeShinProgression,
    analyzeTouchdownProgression,
    analyzePelvisProgression,
    MIN_OBSERVATIONS_FOR_FINDING,
  } = progressionMod;
  const { classifyAccelerationStrategy } = strategyMod;
  const { buildMechanicalAsymmetryReport } = asymmetryMod;
  const { buildMechanicalLimitingFactors, combineAccelerationLimiters } = limitersMod;
  const { computeAccelerationMechanics } = pipelineMod;
  const { accelerationMechanicsSchema, accelerationMetricsSchema } = schemaMod;
  const { buildAccelerationRecommendations } = flyLimiterFactorsMod;

  // -------------------------------------------------------------------
  // Fixtures
  // -------------------------------------------------------------------
  const kp = (x, y, score = 1) => ({ x, y, score });
  const frame = (index, points) => ({ index, tMs: (index * 1000) / 30, keypoints: points });

  function poseSequenceFromFrames(frames) {
    return { backend: "test", modelVersion: "test", coordSpace: "normalized", fps: 30, width: 1280, height: 720, frames };
  }

  function step(overrides) {
    return {
      stepNumber: 1,
      side: "left",
      contactFrame: 0,
      toeOffFrame: null,
      elapsedTimeS: 0,
      contactDistanceM: 0,
      stepLengthM: 1.5,
      stepTimeS: 0.3,
      stepFrequencyHz: 3.3,
      intervalVelocityMps: 5,
      averageAccelerationMps2: null,
      cumulativeDistanceM: 0,
      contactTimeS: 0.15,
      flightTimeBeforeS: 0.1,
      flightTimeAfterS: 0.1,
      detectionConfidence: 0.8,
      dataQuality: "observed",
      qualityFlags: [],
      manualCorrection: null,
      ...overrides,
    };
  }

  // -------------------------------------------------------------------
  // 1. Direction normalization (Part 5).
  // -------------------------------------------------------------------
  check("1a. travelSign(left_to_right) === 1", travelSign("left_to_right") === 1);
  check("1b. travelSign(right_to_left) === -1", travelSign("right_to_left") === -1);
  const ltrAngle = signedAngleFromVerticalDeg({ x: 0.5, y: 0.6 }, { x: 0.6, y: 0.5 }, "left_to_right");
  const mirroredAngle = signedAngleFromVerticalDeg({ x: 0.5, y: 0.6 }, { x: 0.4, y: 0.5 }, "right_to_left");
  check(
    "1c. direction-normalization: mirrored posture + flipped travel direction yields the same signed angle",
    approx(ltrAngle, 45, 1e-6) && approx(mirroredAngle, 45, 1e-6) && approx(ltrAngle, mirroredAngle, 1e-9),
  );
  const ltrOffset = forwardOffset({ x: 0.5, y: 0.6 }, { x: 0.55, y: 0.6 }, "left_to_right");
  const rtlOffset = forwardOffset({ x: 0.5, y: 0.6 }, { x: 0.45, y: 0.6 }, "right_to_left");
  check("1d. forwardOffset is direction-invariant for a mirrored touchdown", approx(ltrOffset, 0.05) && approx(rtlOffset, 0.05));

  // -------------------------------------------------------------------
  // 2. Trunk-angle calculation (Part 4).
  // -------------------------------------------------------------------
  const trunkFrame = frame(10, {
    left_hip: kp(0.5, 0.6),
    right_hip: kp(0.5, 0.6),
    left_shoulder: kp(0.6, 0.5),
    right_shoulder: kp(0.6, 0.5),
  });
  const seq1 = poseSequenceFromFrames([trunkFrame]);
  const s1 = step({ contactFrame: 10, side: "left" });
  const cm1 = computeContactMechanics(seq1, s1, "left_to_right", { metersPerNormalizedUnit: 10, legLengthM: 0.9 });
  check(
    "2. trunk-angle-calc: 45° forward lean computed correctly with full confidence",
    approx(cm1.trunkAngleTouchdownDeg.value, 45) && cm1.trunkAngleTouchdownDeg.status === "experimental" && approx(cm1.trunkAngleTouchdownDeg.confidence, 1),
  );

  // -------------------------------------------------------------------
  // 3. Touchdown-position calculation (Part 4/7).
  // -------------------------------------------------------------------
  const touchdownFrame = frame(20, {
    left_hip: kp(0.5, 0.6),
    right_hip: kp(0.5, 0.6),
    left_shoulder: kp(0.5, 0.5),
    right_shoulder: kp(0.5, 0.5),
    left_toe: kp(0.55, 0.9),
    right_toe: kp(0.4, 0.9),
  });
  const seq2 = poseSequenceFromFrames([touchdownFrame]);
  const s2 = step({ contactFrame: 20, side: "left" });
  const cm2 = computeContactMechanics(seq2, s2, "left_to_right", { metersPerNormalizedUnit: 10, legLengthM: 0.9 });
  check(
    "3. touchdown-position-calc: offset-from-pelvis and meters conversion both correct",
    approx(cm2.touchdownOffsetFromPelvis.value.normalizedOffset, 0.05) &&
      approx(cm2.touchdownOffsetFromPelvis.value.meters, 0.5) &&
      cm2.touchdownOffsetFromPelvis.value.method === "calibrated_world_distance",
  );

  // -------------------------------------------------------------------
  // 4. Shin-angle-proxy calculation (Part 4/8).
  // -------------------------------------------------------------------
  const shinFrame = frame(30, { left_ankle: kp(0.5, 0.9), left_knee: kp(0.55, 0.7) });
  const seq3 = poseSequenceFromFrames([shinFrame]);
  const s3 = step({ contactFrame: 30, side: "left" });
  const cm3 = computeContactMechanics(seq3, s3, "left_to_right", { metersPerNormalizedUnit: null, legLengthM: null });
  const expectedShin = (Math.atan2(0.05, 0.2) * 180) / Math.PI;
  check("4. shin-angle-proxy-calc: forward shin lean computed correctly", approx(cm3.shinAngleTouchdownDeg.value, expectedShin, 1e-4));

  // -------------------------------------------------------------------
  // 5. Pelvis-height normalization (Part 4/9).
  // -------------------------------------------------------------------
  const pelvisFrame = frame(40, { left_hip: kp(0.5, 0.55), right_hip: kp(0.5, 0.55), left_ankle: kp(0.5, 0.95) });
  const seq4 = poseSequenceFromFrames([pelvisFrame]);
  const s4 = step({ contactFrame: 40, side: "left" });
  const cm4 = computeContactMechanics(seq4, s4, "left_to_right", { metersPerNormalizedUnit: null, legLengthM: null });
  check("5. pelvis-height-normalization: ankle-minus-hip proxy computed correctly", approx(cm4.pelvisHeightNormalized.value, 0.4));

  // -------------------------------------------------------------------
  // 6. Missing-landmark handling (Part 4).
  // -------------------------------------------------------------------
  const missingFrame = frame(50, { left_hip: kp(0.5, 0.6), right_hip: kp(0.5, 0.6) }); // no shoulders
  const seq5 = poseSequenceFromFrames([missingFrame]);
  const s5 = step({ contactFrame: 50, side: "left" });
  const cm5 = computeContactMechanics(seq5, s5, "left_to_right", { metersPerNormalizedUnit: null, legLengthM: null });
  check(
    "6. missing-landmark-handling: trunk angle reports unavailable, never a fabricated value",
    cm5.trunkAngleTouchdownDeg.value === null && cm5.trunkAngleTouchdownDeg.status === "unavailable" && typeof cm5.trunkAngleTouchdownDeg.reason === "string",
  );

  // -------------------------------------------------------------------
  // 7. Low-confidence suppression (Part 4).
  // -------------------------------------------------------------------
  const lowConfFrame = frame(60, {
    left_hip: kp(0.5, 0.6, 0.3), // below MIN_LANDMARK_CONFIDENCE
    right_hip: kp(0.5, 0.6, 0.9),
    left_shoulder: kp(0.6, 0.5, 0.9),
    right_shoulder: kp(0.6, 0.5, 0.9),
  });
  const seq6 = poseSequenceFromFrames([lowConfFrame]);
  const s6 = step({ contactFrame: 60, side: "left" });
  const cm6 = computeContactMechanics(seq6, s6, "left_to_right", { metersPerNormalizedUnit: null, legLengthM: null });
  check(
    "7. low-confidence-suppression: a landmark below the confidence floor suppresses the observation",
    cm6.trunkAngleTouchdownDeg.status === "unavailable" && MIN_LANDMARK_CONFIDENCE === 0.5,
  );

  // -------------------------------------------------------------------
  // Build a 6-contact synthetic zone (trunk angle falling 30°→10°, alternating
  // sides) reused by the recompute / progression / asymmetry / strategy tests.
  // -------------------------------------------------------------------
  function buildContacts(trunkAngles) {
    const frames = trunkAngles.map((angle, i) => {
      const rad = (angle * Math.PI) / 180;
      const dx = Math.sin(rad) * 0.2;
      const dy = -Math.cos(rad) * 0.2;
      return frame(i * 10, {
        left_hip: kp(0.3 + i * 0.05, 0.6),
        right_hip: kp(0.3 + i * 0.05, 0.6),
        left_shoulder: kp(0.3 + i * 0.05 + dx, 0.6 + dy),
        right_shoulder: kp(0.3 + i * 0.05 + dx, 0.6 + dy),
        left_ankle: kp(0.3 + i * 0.05, 0.95),
        right_ankle: kp(0.3 + i * 0.05, 0.95),
        left_knee: kp(0.3 + i * 0.05, 0.75),
        right_knee: kp(0.3 + i * 0.05, 0.75),
        left_toe: kp(0.3 + i * 0.05 + 0.02, 0.98),
        right_toe: kp(0.3 + i * 0.05 + 0.02, 0.98),
      });
    });
    const seq = poseSequenceFromFrames(frames);
    const steps = trunkAngles.map((_, i) =>
      step({
        stepNumber: i + 1,
        side: i % 2 === 0 ? "left" : "right",
        contactFrame: i * 10,
        contactDistanceM: i * 0.6,
        cumulativeDistanceM: i * 0.6,
      }),
    );
    const contacts = computeAllContactMechanics(seq, steps, "left_to_right", { metersPerNormalizedUnit: 8, legLengthM: 0.9 });
    return { contacts, steps };
  }

  const { contacts: zoneContacts, steps: zoneSteps } = buildContacts([30, 26, 22, 18, 14, 10]);
  const trunkProgression = analyzeTrunkProgression(zoneContacts);
  check(
    "8. trunk progression: zone averages, trend, and findings computed from >= MIN_OBSERVATIONS_FOR_FINDING contacts",
    trunkProgression.observationCount === 6 &&
      trunkProgression.zoneAverages.earlyZone != null &&
      trunkProgression.zoneAverages.lateZone != null &&
      trunkProgression.trend === "falling",
  );

  const { contacts: earlyUprightContacts } = buildContacts([12, 11, 10, 9, 8, 7]);
  const earlyUprightProgression = analyzeTrunkProgression(earlyUprightContacts);
  check(
    "8b. trunk progression: an early-zone upright pattern (crossing the threshold) produces a concrete finding",
    earlyUprightProgression.findings.length > 0,
  );

  // -------------------------------------------------------------------
  // 9/10/11. Manual-correction-style recompute determinism (Part 2's
  // guarantee, exercised at the data layer since no editor UI exists yet).
  // -------------------------------------------------------------------
  const correctedContacts = zoneContacts.map((c, i) =>
    i === 0 ? { ...c, trunkAngleTouchdownDeg: { ...c.trunkAngleTouchdownDeg, value: 5, status: "manually_corrected", provenance: "manual" } } : c,
  );
  const correctedProgression = analyzeTrunkProgression(correctedContacts);
  check(
    "9. contact-correction-recompute: editing one contact's value deterministically changes the recomputed progression",
    correctedProgression.zoneAverages.earlyZone !== trunkProgression.zoneAverages.earlyZone,
  );

  const deletedContacts = zoneContacts.slice(1);
  const deletedProgression = analyzeTrunkProgression(deletedContacts);
  check(
    "10. contact-deletion-recompute: removing a contact reduces observationCount and changes zone averages, never stale",
    deletedProgression.observationCount === zoneContacts.length - 1 && deletedProgression.zoneAverages.earlyZone !== trunkProgression.zoneAverages.earlyZone,
  );

  const sideChangedContacts = zoneContacts.map((c, i) => (i === 1 ? { ...c, side: "left" } : c));
  const beforeSideCounts = trunkProgression.sideComparison;
  const afterSideProgression = analyzeTrunkProgression(sideChangedContacts);
  check(
    "11. side-change-recompute: changing a contact's side shifts the side-comparison counts deterministically",
    afterSideProgression.sideComparison.leftCount === beforeSideCounts.leftCount + 1 && afterSideProgression.sideComparison.rightCount === beforeSideCounts.rightCount - 1,
  );

  // -------------------------------------------------------------------
  // 12. L/R asymmetry (Part 12).
  // -------------------------------------------------------------------
  const asymSteps = zoneSteps.map((s, i) => ({ ...s, stepLengthM: s.side === "left" ? 1.8 : 1.4 }));
  const leftRight = {
    leftContactTimeS: 0.15,
    rightContactTimeS: 0.16,
    leftStepTimeS: 0.3,
    rightStepTimeS: 0.32,
    stepTimeAsymmetryPct: 6,
    contactTimeAsymmetryPct: 6,
    leftVelocityContributionMps: 1.2,
    rightVelocityContributionMps: 0.8,
    meaningfulStepLengthAsymmetry: false,
    meaningfulStepTimeAsymmetry: false,
    meaningfulContactTimeAsymmetry: false,
  };
  const stepAsymmetry = {
    leftStepAverageM: 1.8,
    rightStepAverageM: 1.4,
    stepLengthAsymmetryPct: 25,
    leftStepFrequencyHz: 3.3,
    rightStepFrequencyHz: 3.1,
    leftStepSampleCount: 3,
    rightStepSampleCount: 3,
    earlyStepLengthAsymmetryPct: 20,
    lateStepLengthAsymmetryPct: 28,
    trend: "worsening",
  };
  const touchdownProgression = analyzeTouchdownProgression(zoneContacts, true);
  const shinProgression = analyzeShinProgression(zoneContacts);
  const pelvisProgression = analyzePelvisProgression(zoneContacts);
  const asymmetryReport = buildMechanicalAsymmetryReport({
    stepAsymmetry,
    leftRight,
    touchdown: touchdownProgression,
    trunk: trunkProgression,
    shin: shinProgression,
  });
  const stepLengthEntry = asymmetryReport.find((a) => a.metric === "stepLength");
  check(
    "12. L/R-asymmetry: step-length asymmetry reports absolute diff, pct diff, and persistence from repeated-side averages",
    stepLengthEntry && approx(stepLengthEntry.absoluteDifference, 0.4) && approx(stepLengthEntry.percentDifference, 25) && stepLengthEntry.persistent === true,
  );

  // -------------------------------------------------------------------
  // 13. Insufficient-observation handling (Part 7's "repeated pattern"
  // requirement — a single/double observation must never produce a finding).
  // -------------------------------------------------------------------
  const sparseContacts = zoneContacts.slice(0, 2);
  const sparseProgression = analyzeTrunkProgression(sparseContacts);
  check(
    "13. insufficient-observation-handling: below MIN_OBSERVATIONS_FOR_FINDING yields insufficient_data, no findings fabricated",
    MIN_OBSERVATIONS_FOR_FINDING === 3 &&
      sparseProgression.trend === "insufficient_data" &&
      sparseProgression.smoothness === "insufficient_data" &&
      sparseProgression.zoneAverages.earlyZone === null &&
      sparseProgression.findings.length === 0,
  );

  // -------------------------------------------------------------------
  // 14. Strategy-classification evidence (Part 10).
  // -------------------------------------------------------------------
  const lengthGrowthSteps = [
    step({ stepNumber: 1, side: "left", stepLengthM: 1.2, stepFrequencyHz: 3.5, intervalVelocityMps: 4 }),
    step({ stepNumber: 2, side: "right", stepLengthM: 1.3, stepFrequencyHz: 3.5, intervalVelocityMps: 4.5 }),
    step({ stepNumber: 3, side: "left", stepLengthM: 1.5, stepFrequencyHz: 3.4, intervalVelocityMps: 5 }),
    step({ stepNumber: 4, side: "right", stepLengthM: 1.7, stepFrequencyHz: 3.4, intervalVelocityMps: 5.5 }),
    step({ stepNumber: 5, side: "left", stepLengthM: 1.9, stepFrequencyHz: 3.5, intervalVelocityMps: 6 }),
    step({ stepNumber: 6, side: "right", stepLengthM: 2.0, stepFrequencyHz: 3.5, intervalVelocityMps: 6.4 }),
  ];
  const strategy = classifyAccelerationStrategy({
    steps: lengthGrowthSteps,
    trunk: trunkProgression,
    touchdown: touchdownProgression,
    shin: shinProgression,
    pelvis: pelvisProgression,
  });
  check(
    "14. strategy-classification-evidence: length-dominant growth pattern classified with concrete numeric evidence",
    strategy.label === "length_dominant_growth" && strategy.evidence.length > 0 && strategy.evidence.some((e) => e.includes("Step length")),
  );
  const sparseStrategy = classifyAccelerationStrategy({
    steps: lengthGrowthSteps.slice(0, 2),
    trunk: trunkProgression,
    touchdown: touchdownProgression,
    shin: shinProgression,
    pelvis: pelvisProgression,
  });
  check("14b. strategy-classification: below the observation floor reports insufficient_data, not a guess", sparseStrategy.label === "insufficient_data");

  // -------------------------------------------------------------------
  // 15. Limiting-factor ranking (Part 13).
  // -------------------------------------------------------------------
  const aggressiveTouchdown = analyzeTouchdownProgression(
    (function () {
      const { contacts } = buildContacts([28, 24, 20, 16, 12, 8]);
      return contacts.map((c, i) => ({
        ...c,
        touchdownOffsetFromCenterOfMass: {
          ...c.touchdownOffsetFromCenterOfMass,
          value: c.touchdownOffsetFromCenterOfMass.value
            ? { ...c.touchdownOffsetFromCenterOfMass.value, normalizedOffset: 0.01 + i * 0.015 }
            : c.touchdownOffsetFromCenterOfMass.value,
        },
      }));
    })(),
    true,
  );
  const mechanicalLimiters = buildMechanicalLimitingFactors({
    trunk: trunkProgression,
    touchdown: aggressiveTouchdown,
    shin: shinProgression,
    pelvis: pelvisProgression,
    steps: zoneSteps,
    progression: null,
    strategy,
    asymmetries: asymmetryReport,
  });
  check(
    "15. limiting-factor-ranking: mechanics limiters are ranked 1..n by impact score, descending, capped at 5",
    mechanicalLimiters.length > 0 &&
      mechanicalLimiters.every((l, i) => l.rank === i + 1) &&
      mechanicalLimiters.every((l, i) => i === 0 || mechanicalLimiters[i - 1].impact.score >= l.impact.score) &&
      mechanicalLimiters.length <= 5,
  );

  // -------------------------------------------------------------------
  // 16. Non-diagnostic language (Part 13).
  // -------------------------------------------------------------------
  // "diagnos" is deliberately excluded: the required hedge phrase itself says
  // "it is not a diagnosis" — that is the CORRECT non-diagnostic usage, not a
  // violation. A real violation would assert a cause directly (the words below).
  const bannedWords = ["weakness", "injury", "dysfunction", "impairment", "deficiency"];
  const allText = mechanicalLimiters
    .flatMap((l) => [l.title, l.summary, ...l.reasoning, ...l.possibleTechnicalAssociations, ...l.possiblePhysicalAssociations.map((p) => p.disclaimer)])
    .join(" ")
    .toLowerCase();
  const hasBannedWord = bannedWords.some((w) => allText.includes(w));
  const hasRequiredPhrases = mechanicalLimiters.every(
    (l) =>
      l.possiblePhysicalAssociations.length === 0 ||
      l.possiblePhysicalAssociations.every(
        (p) => p.disclaimer.includes("This pattern can sometimes be associated with") && p.disclaimer.includes("Additional physical testing would be needed to distinguish"),
      ),
  );
  check("16. non-diagnostic-language: no banned diagnostic terms, and every disclaimer carries both required hedge phrases", !hasBannedWord && hasRequiredPhrases);

  // -------------------------------------------------------------------
  // 17. Recommendation-to-limiter linkage (Part 14).
  // -------------------------------------------------------------------
  const combined = combineAccelerationLimiters([], mechanicalLimiters);
  const recs = buildAccelerationRecommendations(combined);
  check(
    "17. recommendation-to-limiter-linkage: top-ranked limiters with recommendations produce a deduplicated 2-3 item list",
    recs.length >= 1 && recs.length <= 3 && new Set(recs.map((r) => r.title)).size === recs.length,
  );

  // -------------------------------------------------------------------
  // 18. Result-contract parsing (Part 17).
  // -------------------------------------------------------------------
  const fullAnalysis = {
    schemaVersion: "ava-acceleration-analysis-v2",
    status: "ready",
    startEvent: { type: "FIRST_DETECTED_MOVEMENT", signal: "torso", frame: 0, timestamp: 0, confidence: 0.8, reason: "test", provenance: "automatic" },
    analysisZone: { entryDistanceM: 0, exitDistanceM: 3 },
    calibratedMarkers: [{ label: "0m", distanceM: 0 }, { label: "3m", distanceM: 3 }],
    metersPerNormalizedUnit: 8,
    splits: [],
    intervalMetrics: [],
    steps: zoneSteps,
    stepsStatus: "ready",
    stepsReason: null,
    peakVelocity: { velocityMps: 6, distanceM: 3, timeS: 1 },
    averageVelocityMps: 5,
    asymmetries: stepAsymmetry,
    progression: null,
    technicalProgression: { trunkAngle: { status: "unavailable", samples: [], reason: "n/a" } },
    quality: {
      fps: 30,
      fpsAdequate: true,
      calibratedCoverageMinM: 0,
      calibratedCoverageMaxM: 3,
      markerCount: 2,
      contactCount: 6,
      startEventProvenance: "automatic",
      startEventConfidence: 0.8,
      warnings: [],
    },
    summary: "test",
    warnings: [],
  };
  const seqFull = poseSequenceFromFrames(zoneContacts.map((c, i) => frame(i * 10, {})));
  const pipelineResult = computeAccelerationMechanics({
    analysis: fullAnalysis,
    poseSequence: buildContacts([30, 26, 22, 18, 14, 10]).contacts && poseSequenceFromFrames((function () {
      const built = [];
      for (let i = 0; i < 6; i++) {
        const rad = ((30 - i * 4) * Math.PI) / 180;
        const dx = Math.sin(rad) * 0.2;
        const dy = -Math.cos(rad) * 0.2;
        built.push(
          frame(i * 10, {
            left_hip: kp(0.3 + i * 0.05, 0.6),
            right_hip: kp(0.3 + i * 0.05, 0.6),
            left_shoulder: kp(0.3 + i * 0.05 + dx, 0.6 + dy),
            right_shoulder: kp(0.3 + i * 0.05 + dx, 0.6 + dy),
            left_ankle: kp(0.3 + i * 0.05, 0.95),
            right_ankle: kp(0.3 + i * 0.05, 0.95),
            left_knee: kp(0.3 + i * 0.05, 0.75),
            right_knee: kp(0.3 + i * 0.05, 0.75),
            left_toe: kp(0.3 + i * 0.05 + 0.02, 0.98),
            right_toe: kp(0.3 + i * 0.05 + 0.02, 0.98),
          }),
        );
      }
      return built;
    })()),
    travelDirection: "left_to_right",
    legLengthM: 0.9,
  });
  const parsedMechanics = pipelineResult && accelerationMechanicsSchema.safeParse(pipelineResult);
  check(
    "18. result-contract-parsing: computeAccelerationMechanics output parses against accelerationMechanicsSchema",
    pipelineResult != null && parsedMechanics.success === true,
  );
  if (!parsedMechanics?.success) console.error(JSON.stringify(parsedMechanics?.error?.issues, null, 2));

  // -------------------------------------------------------------------
  // 19. Legacy acceleration compatibility (Part 17) — a payload from BEFORE
  // `mechanics` existed (and before Phase 2 fields existed) must still parse.
  // -------------------------------------------------------------------
  const legacyShape = {
    timingPolicyVersion: "CONSERVATIVE_TIMING_POLICY_V1",
    resultType: "acceleration",
    status: "ready",
    startEvent: {
      type: "FIRST_DETECTED_MOVEMENT",
      signal: "torso",
      frame: 0,
      timestamp: 0,
      confidence: 0.8,
      reason: "legacy",
      debug: {
        candidates: {
          torso: { frame: 0, timestamp: 0, passed: true, reason: "" },
          shoulder: { frame: 0, timestamp: 0, passed: true, reason: "" },
          wrist: { frame: 0, timestamp: 0, passed: true, reason: "" },
          pose_anchor: { frame: 0, timestamp: 0, passed: true, reason: "" },
        },
      },
    },
    splits: { m10S: 2, m20S: null, m30S: null },
    rawSplits: { m10S: 2, m20S: null, m30S: null },
    finishDistanceM: 10,
    finishCrossingTime: 2,
    runTime: 2,
    rawRunTime: 2,
    reportedRunTime: 2,
    segmentVelocities: [],
    averageVelocityMps: 5,
    rawAverageVelocityMps: 5,
    reportedAverageVelocityMps: 5,
    earlyAccelerationMps2: 3,
    peakVelocity: 6,
    rawPeakVelocity: 6,
    reportedPeakVelocity: 6,
    distanceToPeakVelocity: 8,
    summary: "legacy result, no mechanics field at all",
    warnings: [],
    strideMetrics: { status: "ready", strideCount: 4, averageStrideLengthM: 1.5, reason: "" },
  };
  const legacyParsed = accelerationMetricsSchema.safeParse(legacyShape);
  check("19. legacy-acceleration-compat: a pre-Phase-3 payload with no `mechanics` field still parses", legacyParsed.success === true);
  if (!legacyParsed.success) console.error(JSON.stringify(legacyParsed.error.issues, null, 2));

  // -------------------------------------------------------------------
  // 20. Fly-analysis compatibility (Part 17) — the shared `Limiter`/
  // `LimiterType` shape this engine reuses must be structurally untouched.
  // -------------------------------------------------------------------
  const flyTypesSource = readFileSync(path.join(root, "src/lib/limitingFactors/types.ts"), "utf8");
  const originalFlyLimiterTypes = [
    "step_length_below_expectation",
    "step_length_above_expectation",
    "step_frequency_below_expectation",
    "step_frequency_above_expectation",
    "step_length_asymmetry",
    "step_frequency_asymmetry",
    "velocity_limitation",
    "peak_velocity_limitation",
    "peak_vs_average_gap",
  ];
  check(
    "20. fly-analysis-compat: fly's own LimiterType union is untouched by this phase's work",
    originalFlyLimiterTypes.every((t) => flyTypesSource.includes(`"${t}"`)),
  );

  // -------------------------------------------------------------------
  // 21. No panning-architecture changes (CURRENT PRODUCT RULES / STOP
  // CONDITIONS) — none of the panning-specific files were touched.
  // -------------------------------------------------------------------
  const panningSensitivePaths = [
    "src/lib/video/cameraPath",
    "src/lib/calibration/zoneAnchors.ts",
    "src/lib/video/worldProjection.ts",
    "src/lib/video/orbRelock",
    "src/lib/calibration/manualWorldLockRepair",
  ];
  let changedFiles = [];
  try {
    changedFiles = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .map((line) => line.slice(3).trim());
  } catch {
    changedFiles = [];
  }
  const touchedPanningFile = changedFiles.find((f) => panningSensitivePaths.some((p) => f.includes(p)));
  check("21. no-panning-architecture-changes: no panning-camera file appears in the working tree diff", !touchedPanningFile);

  // -------------------------------------------------------------------
  // 22/23. Overlay alignment (Part 16) — no overlay UI has been built yet in
  // this phase; report honestly instead of fabricating a pass.
  // -------------------------------------------------------------------
  skip("22. stationary-overlay-alignment", "Part 16 mechanical overlay UI not yet implemented");
  skip("23. R-to-L-overlay-alignment", "Part 16 mechanical overlay UI not yet implemented");

  // -------------------------------------------------------------------
  // 24. Manual-zone-start authority / zone-start tests (Part 3) — already
  // covered by acceleration-analysis:sanity; not duplicated here.
  // -------------------------------------------------------------------
  skip("24. zone-start-first-movement-in-zone / pre-zone-movement / manual-zone-start-authority", "covered by npm run acceleration-analysis:sanity (Part 3, unchanged this phase)");
} finally {
  rmSync(out, { recursive: true, force: true });
}

console.log(`\n${ok ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"} (${skipped} skipped)`);
process.exit(ok ? 0 : 1);
