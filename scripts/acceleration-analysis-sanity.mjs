// Deterministic sanity for the Acceleration Analysis MVP (Part 15).
//
//   node scripts/acceleration-analysis-sanity.mjs
//
// Compiles src/lib/acceleration/{calibration,startEvent,steps,metrics}.ts and
// src/lib/limitingFactors/types.ts is imported only for types (erased), then
// exercises the 24 required deterministic cases against synthetic, fully
// hand-computed input — no real footage, no network, no DB.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".acceleration-analysis-sanity-tmp");

let ok = true;
let _schemaCache = null;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
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
        path.join(root, "src/lib/acceleration/calibration.ts"),
        path.join(root, "src/lib/acceleration/startEvent.ts"),
        path.join(root, "src/lib/acceleration/steps.ts"),
        path.join(root, "src/lib/acceleration/metrics.ts"),
        path.join(root, "src/lib/acceleration/progression.ts"),
        path.join(root, "src/lib/acceleration/limitingFactors.ts"),
        path.join(root, "src/lib/acceleration/summary.ts"),
      ],
    }),
  );
  execFileSync("npx", ["tsc", "-p", tsconfigPath], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const calibration = require(path.join(out, "acceleration/calibration.js"));
  const startEventMod = require(path.join(out, "acceleration/startEvent.js"));
  const stepsMod = require(path.join(out, "acceleration/steps.js"));
  const metrics = require(path.join(out, "acceleration/metrics.js"));
  const progressionMod = require(path.join(out, "acceleration/progression.js"));
  const limitingFactorsMod = require(path.join(out, "acceleration/limitingFactors.js"));
  const summaryMod = require(path.join(out, "acceleration/summary.js"));

  const {
    validateAccelerationCalibration,
    projectPointToAxis,
    accelerationZoneFromMarkers,
    accelerationCalibrationGatesSchema,
  } = calibration;
  const { detectAccelerationStartEvent, detectZoneStartEvent, resolveAccelerationStartEvent } = startEventMod;
  const { computeAccelerationSteps } = stepsMod;
  const { computeAccelerationAnalysis } = metrics;
  const { analyzeProgression, computeStepGains, buildVelocityCurve, buildAccelerationCurve } = progressionMod;
  const { buildAccelerationLimitingFactors, buildAccelerationRecommendations } = limitingFactorsMod;
  const { buildAccelerationSummary } = summaryMod;

  // `label` here is just a convenience test string like "10m" or "12.5m" —
  // the real schema (Part 2.5) has no label field at all, only `distanceM`.
  const marker = (label, x, y = 0.5) => ({
    id: label,
    distanceM: parseFloat(label),
    point: { x, y },
    frameIndex: null,
  });

  // -------------------------------------------------------------------
  // 1. Stationary acceleration calibration.
  // -------------------------------------------------------------------
  const validMarkers = [marker("0m", 0.0), marker("5m", 0.4), marker("10m", 0.8)];
  const v1 = validateAccelerationCalibration(validMarkers);
  check("1. valid start+5m+10m calibration accepted", v1.valid && v1.coverageMinM === 0 && v1.coverageMaxM === 10);

  // -------------------------------------------------------------------
  // 2. Left-to-right travel.
  // -------------------------------------------------------------------
  const ltrFrames = [
    { frame: 0, time: 0, landmarks: torso(0.02), centerOfMass: { x: 0.02, y: 0.5 } },
    { frame: 30, time: 0.5, landmarks: torso(0.02), centerOfMass: { x: 0.02, y: 0.5 } }, // baseline
    { frame: 60, time: 1.0, landmarks: torso(0.1), centerOfMass: { x: 0.1, y: 0.5 } },
    { frame: 90, time: 1.5, landmarks: torso(0.4), centerOfMass: { x: 0.4, y: 0.5 } },
    { frame: 120, time: 2.0, landmarks: torso(0.8), centerOfMass: { x: 0.8, y: 0.5 } },
  ];
  const ltrResult = computeAccelerationAnalysis({
    frames: denseSeries(ltrFrames),
    poseSequence: emptyPoseSequence(60),
    markers: [marker("0m", 0.0), marker("10m", 0.8)],
    travelDirection: "left_to_right",
    manualStartOverride: null,
    fps: 60,
  });
  check(
    "2. left-to-right travel resolves a forward split",
    ltrResult.splits.find((s) => s.label === "10m")?.quality === "interpolated",
  );

  // -------------------------------------------------------------------
  // 3. Right-to-left travel.
  // -------------------------------------------------------------------
  const rtlFrames = [
    { frame: 0, time: 0, landmarks: torso(0.98), centerOfMass: { x: 0.98, y: 0.5 } },
    { frame: 30, time: 0.5, landmarks: torso(0.98), centerOfMass: { x: 0.98, y: 0.5 } },
    { frame: 60, time: 1.0, landmarks: torso(0.9), centerOfMass: { x: 0.9, y: 0.5 } },
    { frame: 90, time: 1.5, landmarks: torso(0.6), centerOfMass: { x: 0.6, y: 0.5 } },
    { frame: 120, time: 2.0, landmarks: torso(0.2), centerOfMass: { x: 0.2, y: 0.5 } },
  ];
  const rtlResult = computeAccelerationAnalysis({
    frames: denseSeries(rtlFrames),
    poseSequence: emptyPoseSequence(60),
    markers: [marker("0m", 0.98), marker("10m", 0.2)],
    travelDirection: "right_to_left",
    manualStartOverride: null,
    fps: 60,
  });
  check(
    "3. right-to-left travel resolves a forward split",
    rtlResult.splits.find((s) => s.label === "10m")?.quality === "interpolated",
  );

  // -------------------------------------------------------------------
  // 4. Manual start-frame authority (Part 3 — Zone Start Event: stores
  // zoneStartFrame, provenance, confidence; manual confirmation is
  // authoritative and never depends on race/gun/block semantics).
  // -------------------------------------------------------------------
  const autoEvent = detectAccelerationStartEvent(denseSeries(ltrFrames));
  const manualOverride = {
    zoneStartFrame: 60,
    provenance: "manual",
    confidence: 1,
    confirmedBy: "coach-1",
    confirmedAt: new Date().toISOString(),
  };
  const resolved = resolveAccelerationStartEvent(autoEvent, manualOverride, denseSeries(ltrFrames));
  check(
    "4. manual start frame overrides automatic suggestion",
    resolved.provenance === "manual" && resolved.frame === 60 && resolved.timestamp === 1.0,
  );
  check(
    "4c. Part 3 storage model: zoneStartFrame + provenance + confidence are all present on a manual confirmation",
    resolved.zoneStartFrame === 60 && resolved.provenance === "manual" && resolved.confidence === 1,
  );
  check(
    "4d. automatic suggestions also carry zoneStartFrame + provenance + confidence",
    autoEvent.zoneStartFrame === autoEvent.frame && autoEvent.provenance === "automatic" && typeof autoEvent.confidence === "number",
  );
  check("4b. automatic-only path is unaffected when no override given", resolveAccelerationStartEvent(autoEvent, null, denseSeries(ltrFrames)) === autoEvent);

  // -------------------------------------------------------------------
  // Zone A. A 10-20m zone (NO 0m marker at all) — pre-zone jitter must be
  // ignored; Time Zero is the movement onset AFTER the athlete settles at
  // the zone's own entry marker (10m), not anything that happened earlier
  // in the clip (e.g. warmup steps before reaching the blocks/zone line).
  // -------------------------------------------------------------------
  const zoneAMarkers = [marker("10m", 0.5), marker("20m", 0.9)];
  check("Zone A0. a 10-20m calibration (no 0m marker) is valid on its own", validateAccelerationCalibration(zoneAMarkers).valid);
  const zoneAKeyframes = [
    { frame: 0, time: 0 / 60, x: 0.1 },
    { frame: 5, time: 5 / 60, x: 0.18 }, // pre-zone jitter — never reaches the 10m line
    { frame: 10, time: 10 / 60, x: 0.12 },
    { frame: 15, time: 15 / 60, x: 0.5 }, // arrives at the zone's 10m entry marker
    { frame: 45, time: 45 / 60, x: 0.5 }, // holds still inside the zone (real baseline)
    { frame: 70, time: 70 / 60, x: 0.9 }, // bursts forward — the real onset
  ];
  const zoneAFrames = keyframeSeries(zoneAKeyframes);
  const zoneAEvent = detectZoneStartEvent(zoneAFrames, { x: 0.5, y: 0.5 }, 1);
  check(
    "Zone A1. pre-zone jitter is never mistaken for the start event",
    zoneAEvent.frame != null && zoneAEvent.frame >= 15,
  );
  check(
    "Zone A2. the zone-scoped onset lands at the real movement burst, not zone entry",
    zoneAEvent.frame != null && zoneAEvent.frame >= 44 && zoneAEvent.frame <= 52 && !zoneAEvent.alreadyMovingAtZoneEntry,
  );
  const zoneAAnalysis = computeAccelerationAnalysis({
    frames: zoneAFrames,
    poseSequence: emptyPoseSequence(60),
    markers: zoneAMarkers,
    travelDirection: "left_to_right",
    manualStartOverride: null,
    fps: 60,
  });
  check(
    "Zone A3. a 10-20m analysis reports distances offset from 10m, never fabricating a 0m reference",
    zoneAAnalysis.calibratedMarkers.every((m) => m.distanceM >= 10) &&
      zoneAAnalysis.splits[0].distanceM === 10,
  );
  check(
    "Zone A4. explicit Analysis Zone (Part 2.5) matches the calibrated 10-20m range, not a fabricated 0m origin",
    zoneAAnalysis.analysisZone.entryDistanceM === 10 && zoneAAnalysis.analysisZone.exitDistanceM === 20,
  );
  const zoneA20mSplit = zoneAAnalysis.splits.find((s) => s.distanceM === 20);
  check(
    "Zone A5. the 20m split's elapsed time is measured from the REAL Zone Start Event, not frame 0",
    zoneA20mSplit &&
      approx(zoneA20mSplit.rawElapsedTimeS, 70 / 60 - zoneAAnalysis.startEvent.timestamp, 1e-6) &&
      zoneA20mSplit.rawElapsedTimeS < 1.0, // would be ~1.167s if wrongly measured from frame 0
  );
  check(
    "Zone A6. per-meter scale uses the zone's OWN span (exit-entry=10m), not the exit marker's absolute distance (20m) — peak-velocity distance is reported as an ABSOLUTE distance within the 10-20m zone, not a 0-10 zone-relative value",
    zoneAAnalysis.peakVelocity.distanceM == null ||
      (zoneAAnalysis.peakVelocity.distanceM >= 10 && zoneAAnalysis.peakVelocity.distanceM <= 20.5),
  );

  // -------------------------------------------------------------------
  // Zone B. Clip begins mid-sprint: the athlete is ALREADY moving the
  // instant they enter the zone (frame 0 = zone entry). There is no rest
  // baseline to detect an onset from — Time Zero must be the zone-entry
  // instant itself, explicitly flagged, never a fabricated "onset."
  // -------------------------------------------------------------------
  const zoneBFrames = [];
  for (let i = 0; i <= 30; i++) {
    zoneBFrames.push({ frame: i, time: i / 60, landmarks: torso(0.5 + i * 0.015), centerOfMass: { x: 0.5 + i * 0.015, y: 0.5 } });
  }
  const zoneBEvent = detectZoneStartEvent(zoneBFrames, { x: 0.5, y: 0.5 }, 1);
  check(
    "Zone B. a clip that begins already moving through the zone is flagged, not given a fabricated onset",
    zoneBEvent.alreadyMovingAtZoneEntry === true && zoneBEvent.frame === 0 && zoneBEvent.timestamp === 0,
  );

  // -------------------------------------------------------------------
  // Zone C. Arbitrary calibrated ranges (Part 2.5) — not limited to a fixed
  // preset list. 12.5m and 37m are not "round" 5m-increment marks; a 5-15m
  // and a 30-40m zone must both validate identically to the 0-10m case.
  // -------------------------------------------------------------------
  const arbitraryMarkers = [marker("12.5m", 0.3), marker("37m", 0.95)];
  check("Zone C0. non-round arbitrary distances (12.5m, 37m) are valid markers", validateAccelerationCalibration(arbitraryMarkers).valid);
  const fiveToFifteen = [marker("5m", 0.2), marker("15m", 0.8)];
  check("Zone C1. a 5-15m zone validates", validateAccelerationCalibration(fiveToFifteen).valid);
  const thirtyToForty = [marker("30m", 0.2), marker("40m", 0.8)];
  check("Zone C2. a 30-40m zone validates", validateAccelerationCalibration(thirtyToForty).valid);
  const arbitraryZone = accelerationZoneFromMarkers(arbitraryMarkers);
  check(
    "Zone C3. accelerationZoneFromMarkers resolves the exact non-round entry/exit distances",
    arbitraryZone.entryDistanceM === 12.5 && arbitraryZone.exitDistanceM === 37,
  );

  // -------------------------------------------------------------------
  // 5/6. 5 m and 10 m split interpolation.
  // -------------------------------------------------------------------
  // Straight-line torso crossing 0 -> 0.8 (=10m) linearly over frames 60-120 (1s @60fps);
  // 5m marker sits at x=0.4 (halfway) — the crossing should land near t=1.5s (halfway
  // through the 60-120 linear ramp), i.e. ~0.5s after the t=1.0s start.
  const splitMarkers = [marker("0m", 0.1), marker("5m", 0.5), marker("10m", 0.9)];
  const splitAnalysis = computeAccelerationAnalysis({
    frames: denseSeries([
      { frame: 0, time: 0, landmarks: torso(0.1), centerOfMass: { x: 0.1, y: 0.5 } },
      { frame: 30, time: 0.5, landmarks: torso(0.1), centerOfMass: { x: 0.1, y: 0.5 } },
      { frame: 60, time: 1.0, landmarks: torso(0.1), centerOfMass: { x: 0.1, y: 0.5 } },
      { frame: 90, time: 1.5, landmarks: torso(0.5), centerOfMass: { x: 0.5, y: 0.5 } },
      { frame: 120, time: 2.0, landmarks: torso(0.9), centerOfMass: { x: 0.9, y: 0.5 } },
    ]),
    poseSequence: emptyPoseSequence(60),
    markers: splitMarkers,
    travelDirection: "left_to_right",
    manualStartOverride: null,
    fps: 60,
  });
  const split5 = splitAnalysis.splits.find((s) => s.label === "5m");
  const split10 = splitAnalysis.splits.find((s) => s.label === "10m");
  check("5. 5m split interpolated to ~0.5s elapsed", split5 && approx(split5.rawElapsedTimeS, 0.5, 0.02));
  check("6. 10m split interpolated to ~1.0s elapsed", split10 && approx(split10.rawElapsedTimeS, 1.0, 0.02));

  // -------------------------------------------------------------------
  // 7. Partial 20/30 m coverage.
  // -------------------------------------------------------------------
  const partialAnalysis = computeAccelerationAnalysis({
    frames: denseSeries([
      { frame: 0, time: 0, landmarks: torso(0.1), centerOfMass: { x: 0.1, y: 0.5 } },
      { frame: 30, time: 0.5, landmarks: torso(0.1), centerOfMass: { x: 0.1, y: 0.5 } },
      { frame: 60, time: 1.0, landmarks: torso(0.1), centerOfMass: { x: 0.1, y: 0.5 } },
      { frame: 120, time: 2.0, landmarks: torso(0.5), centerOfMass: { x: 0.5, y: 0.5 } },
    ]),
    poseSequence: emptyPoseSequence(60),
    markers: [marker("0m", 0.1), marker("5m", 0.5)],
    travelDirection: "left_to_right",
    manualStartOverride: null,
    fps: 60,
  });
  check(
    "7. partial calibration (start+5m only) never fabricates 10/20/30m splits",
    partialAnalysis.calibratedMarkers.length === 2 &&
      !partialAnalysis.calibratedMarkers.some((m) => m.label === "10m" || m.label === "20m" || m.label === "30m"),
  );

  // -------------------------------------------------------------------
  // Synthetic step pipeline (used by 8-17): three sharp, symmetric
  // triangular foot-y bumps -> two clean detected steps with round numbers.
  //   contact 1: left  @ frame 10, x=0.10 (1.0 m on a 0-10m/[0,1] axis)
  //   contact 2: right @ frame 25, x=0.25 (2.5 m) -> step 1.5m / 0.25s / 6.0 m/s
  //   contact 3: left  @ frame 40, x=0.45 (4.5 m) -> step 2.0m / 0.25s / 8.0 m/s
  //   contact 4: right @ frame 55, x=0.60 (6.0 m) -> step 1.5m / 0.25s / 6.0 m/s
  // -------------------------------------------------------------------
  const stepMarkers = [marker("0m", 0.0), marker("10m", 1.0)];
  const stepSequence = buildStepPoseSequence([
    { side: "left", contactFrame: 10, x: 0.1 },
    { side: "right", contactFrame: 25, x: 0.25 },
    { side: "left", contactFrame: 40, x: 0.45 },
    { side: "right", contactFrame: 55, x: 0.6 },
  ]);
  const stepResult = computeAccelerationSteps(stepSequence, stepMarkers, 0);
  check("step pipeline preconditions ready", stepResult.status === "ready" && stepResult.steps.length === 3);
  const [row1, row2, row3] = stepResult.steps;

  check("8. step-distance calculation", row1 && approx(row1.contactDistanceM, 2.5, 0.02) && row2 && approx(row2.contactDistanceM, 4.5, 0.02));
  check("9. step-time calculation", row1 && approx(row1.stepTimeS, 0.25, 0.01) && row2 && approx(row2.stepTimeS, 0.25, 0.01));
  check("10. step-frequency calculation", row1 && approx(row1.stepFrequencyHz, 4.0, 0.1) && row2 && approx(row2.stepFrequencyHz, 4.0, 0.1));
  check("11. velocity by step", row1 && approx(row1.intervalVelocityMps, 6.0, 0.1) && row2 && approx(row2.intervalVelocityMps, 8.0, 0.1));
  check("12. interval acceleration", row2 && approx(row2.averageAccelerationMps2, 8.0, 0.5));
  check(
    "13. steps to each marker (cumulative distance)",
    row1 && approx(row1.cumulativeDistanceM, 2.5, 0.02) && row3 && approx(row3.cumulativeDistanceM, 6.0, 0.02),
  );
  check(
    "14. left/right asymmetry",
    stepResult.zoneSummary &&
      approx(stepResult.zoneSummary.summaries.leftStepAverageM, 2.0, 0.05) &&
      approx(stepResult.zoneSummary.summaries.rightStepAverageM, 1.5, 0.05),
  );
  check("15. first step has no acceleration (nothing precedes it)", row1.averageAccelerationMps2 === null);
  check("17. step rows reserve manual-correction provenance (no per-contact editor exists yet — never fabricated)", row1.manualCorrection === null);

  // -------------------------------------------------------------------
  // 16. Missing or uncertain contact.
  // -------------------------------------------------------------------
  const sparseSequence = buildStepPoseSequence([{ side: "left", contactFrame: 10, x: 0.1 }]);
  const sparseResult = computeAccelerationSteps(sparseSequence, stepMarkers, 0);
  check(
    "16. a single detected contact yields insufficient_contacts, not a fabricated step",
    sparseResult.status === "insufficient_contacts" && sparseResult.steps.length === 0,
  );

  // -------------------------------------------------------------------
  // 18. FPS-aware uncertainty.
  // -------------------------------------------------------------------
  const fpsInput = {
    frames: denseSeries([
      { frame: 0, time: 0, landmarks: torso(0.1), centerOfMass: { x: 0.1, y: 0.5 } },
      { frame: 30, time: 0.5, landmarks: torso(0.1), centerOfMass: { x: 0.1, y: 0.5 } },
      { frame: 60, time: 1.0, landmarks: torso(0.1), centerOfMass: { x: 0.1, y: 0.5 } },
      { frame: 120, time: 2.0, landmarks: torso(0.9), centerOfMass: { x: 0.9, y: 0.5 } },
    ]),
    poseSequence: emptyPoseSequence(60),
    markers: [marker("0m", 0.1), marker("10m", 0.9)],
    travelDirection: "left_to_right",
    manualStartOverride: null,
  };
  const at60 = computeAccelerationAnalysis({ ...fpsInput, fps: 60 });
  const at120 = computeAccelerationAnalysis({ ...fpsInput, fps: 120 });
  const uncertainty60 = at60.splits.find((s) => s.label === "10m").frameEquivalentTimeS;
  const uncertainty120 = at120.splits.find((s) => s.label === "10m").frameEquivalentTimeS;
  check(
    "18. FPS-aware uncertainty halves with double the frame rate",
    approx(uncertainty60, 1 / 60, 1e-9) && approx(uncertainty120, 1 / 120, 1e-9) && approx(uncertainty60 / 2, uncertainty120, 1e-9),
  );

  // -------------------------------------------------------------------
  // 19. Incomplete segment handling.
  // -------------------------------------------------------------------
  const incomplete = computeAccelerationAnalysis({
    frames: denseSeries([
      { frame: 0, time: 0, landmarks: torso(0.1), centerOfMass: { x: 0.1, y: 0.5 } },
      { frame: 30, time: 0.5, landmarks: torso(0.1), centerOfMass: { x: 0.1, y: 0.5 } },
      { frame: 60, time: 1.0, landmarks: torso(0.1), centerOfMass: { x: 0.1, y: 0.5 } },
      { frame: 90, time: 1.5, landmarks: torso(0.3), centerOfMass: { x: 0.3, y: 0.5 } },
      // torso never reaches the 10m marker at x=0.9 — that split must stay unavailable.
    ]),
    poseSequence: emptyPoseSequence(60),
    markers: [marker("0m", 0.1), marker("5m", 0.5), marker("10m", 0.9)],
    travelDirection: "left_to_right",
    manualStartOverride: null,
    fps: 60,
  });
  check(
    "19. an unreached marker is reported unavailable, not extrapolated",
    incomplete.splits.find((s) => s.label === "10m")?.quality === "unavailable" &&
      incomplete.splits.find((s) => s.label === "10m")?.elapsedTimeS === null,
  );

  // -------------------------------------------------------------------
  // Phase 2 — progression / limiting-factors / recommendations / summary.
  // A fully hand-computed synthetic 8-step run (see script comments in the
  // source for the by-hand derivation of every expected value below).
  // -------------------------------------------------------------------
  const mkStep = (overrides) => ({
    stepNumber: 1,
    side: "left",
    contactFrame: 0,
    toeOffFrame: null,
    elapsedTimeS: 0,
    contactDistanceM: 0,
    stepLengthM: 1,
    stepTimeS: 0.25,
    stepFrequencyHz: 4,
    intervalVelocityMps: 4,
    averageAccelerationMps2: null,
    cumulativeDistanceM: 0,
    contactTimeS: null,
    flightTimeBeforeS: null,
    flightTimeAfterS: null,
    detectionConfidence: 0.9,
    dataQuality: "observed",
    qualityFlags: [],
    manualCorrection: null,
    ...overrides,
  });

  const p2Steps = [
    mkStep({ stepNumber: 1, side: "left", stepLengthM: 0.9, stepTimeS: 0.28, stepFrequencyHz: 3.0, contactTimeS: 0.20, intervalVelocityMps: 3.0, averageAccelerationMps2: null, cumulativeDistanceM: 1.0, elapsedTimeS: 0.3 }),
    mkStep({ stepNumber: 2, side: "right", stepLengthM: 1.1, stepTimeS: 0.24, stepFrequencyHz: 3.3, contactTimeS: 0.23, intervalVelocityMps: 3.8, averageAccelerationMps2: 2.0, cumulativeDistanceM: 2.3, elapsedTimeS: 0.6 }),
    mkStep({ stepNumber: 3, side: "left", stepLengthM: 1.3, stepTimeS: 0.278, stepFrequencyHz: 3.5, contactTimeS: 0.205, intervalVelocityMps: 4.5, averageAccelerationMps2: 3.5, cumulativeDistanceM: 3.8, elapsedTimeS: 0.9 }),
    mkStep({ stepNumber: 4, side: "right", stepLengthM: 1.5, stepTimeS: 0.242, stepFrequencyHz: 3.6, contactTimeS: 0.235, intervalVelocityMps: 5.0, averageAccelerationMps2: 4.0, cumulativeDistanceM: 5.5, elapsedTimeS: 1.2 }),
    mkStep({ stepNumber: 5, side: "left", stepLengthM: 1.6, stepTimeS: 0.282, stepFrequencyHz: 3.58, contactTimeS: 0.20, intervalVelocityMps: 5.3, averageAccelerationMps2: 3.0, cumulativeDistanceM: 7.3, elapsedTimeS: 1.5 }),
    mkStep({ stepNumber: 6, side: "right", stepLengthM: 1.62, stepTimeS: 0.238, stepFrequencyHz: 3.60, contactTimeS: 0.23, intervalVelocityMps: 5.35, averageAccelerationMps2: 1.5, cumulativeDistanceM: 9.1, elapsedTimeS: 1.8 }),
    mkStep({ stepNumber: 7, side: "left", stepLengthM: 1.63, stepTimeS: 0.279, stepFrequencyHz: 3.59, contactTimeS: 0.205, intervalVelocityMps: 5.3, averageAccelerationMps2: 0.5, cumulativeDistanceM: 10.9, elapsedTimeS: 2.1 }),
    mkStep({ stepNumber: 8, side: "right", stepLengthM: 1.64, stepTimeS: 0.241, stepFrequencyHz: 3.61, contactTimeS: 0.235, intervalVelocityMps: 5.25, averageAccelerationMps2: 0.2, cumulativeDistanceM: 12.7, elapsedTimeS: 2.4 }),
  ];
  const p2Asymmetries = {
    leftStepAverageM: 1.28, rightStepAverageM: 1.35, stepLengthAsymmetryPct: 5.2,
    leftStepFrequencyHz: 3.4, rightStepFrequencyHz: 3.45,
    leftStepSampleCount: 4, rightStepSampleCount: 4,
    earlyStepLengthAsymmetryPct: 3, lateStepLengthAsymmetryPct: 7, trend: "worsening",
  };

  // -- velocity curve / acceleration curve --
  const p2Velocity = buildVelocityCurve(p2Steps);
  const p2AccelCurve = buildAccelerationCurve(p2Steps);
  check("P2.1. velocity curve has one point per step, values taken directly from steps", p2Velocity.length === 8 && p2Velocity[1].velocityMps === 3.8 && p2Velocity[1].distanceM === 2.3);
  check("P2.2. acceleration curve carries each step's own acceleration, nulls preserved (never fabricated)", p2AccelCurve[0].accelerationMps2 === null && p2AccelCurve[3].accelerationMps2 === 4.0);

  // -- step gains --
  const p2Gains = computeStepGains(p2Steps);
  check("P2.3. velocity gain per step is a simple consecutive delta", approx(p2Gains[1].velocityGainMps, 0.8, 1e-9) && approx(p2Gains[4].velocityGainMps, 0.3, 1e-9));
  check("P2.4. acceleration gain per step is null until two real accelerations exist", p2Gains[0].accelerationGainMps2 === null && p2Gains[1].accelerationGainMps2 === null && approx(p2Gains[2].accelerationGainMps2, 1.5, 1e-9));

  // -- full progression analysis --
  const p2Progression = analyzeProgression(p2Steps, p2Asymmetries);
  check("P2.5. peak acceleration is identified correctly (step 4, 4.0 m/s²)", p2Progression.peakAcceleration.stepNumber === 4 && approx(p2Progression.peakAcceleration.value, 4.0, 1e-9));
  check("P2.6. peak velocity gain is identified correctly (step 2, +0.8 m/s)", p2Progression.peakVelocityGain.stepNumber === 2 && approx(p2Progression.peakVelocityGain.value, 0.8, 1e-9));
  check(
    "P2.7. acceleration decline is found AFTER the last real rise (step 5), not the first dip",
    p2Progression.accelerationDeclineStep && p2Progression.accelerationDeclineStep.stepNumber === 5,
  );
  check("P2.8. no fabricated smoothness issues on a genuinely smooth curve", p2Progression.smoothness.smooth === true);
  check(
    "P2.9. step length trend (increasing) and step frequency trend (plateauing) computed from early-vs-late halves",
    p2Progression.stepProgression.stepLengthTrend === "increasing" && p2Progression.stepProgression.stepFrequencyTrend === "plateauing",
  );
  check(
    "P2.10. divergence correctly identifies frequency plateauing while length keeps rising",
    p2Progression.stepProgression.divergence === "frequency_plateau_length_rising",
  );
  check(
    "P2.11. most efficient step (largest single velocity gain) is step 2",
    p2Progression.stepProgression.mostEfficientStep && p2Progression.stepProgression.mostEfficientStep.stepNumber === 2,
  );
  check(
    "P2.12. left/right contact-time and step-time asymmetry are flagged meaningful only when they clear the threshold",
    p2Progression.leftRight.meaningfulContactTimeAsymmetry === true &&
      p2Progression.leftRight.meaningfulStepTimeAsymmetry === true &&
      p2Progression.leftRight.meaningfulStepLengthAsymmetry === false, // 5.2% from the supplied asymmetries — not meaningful
  );
  check(
    "P2.13. left/right velocity contribution sums only positive per-step gains, grouped by the landing side",
    approx(p2Progression.leftRight.leftVelocityContributionMps, 1.0, 1e-6) &&
      approx(p2Progression.leftRight.rightVelocityContributionMps, 1.35, 1e-6),
  );

  // -- limiting factors: ranking, cap, and "do not over-report" --
  const p2IntervalMetrics = [{ startM: 0, endM: 10, timeS: 2.4, velocityMps: 5.29, accelerationMps2: null, quality: "observed" }];
  const p2Limiters = buildAccelerationLimitingFactors({
    analysis: {
      intervalMetrics: p2IntervalMetrics,
      steps: p2Steps,
      asymmetries: p2Asymmetries,
      progression: p2Progression,
      warnings: [],
      peakVelocityMps: 5.35,
      fpsAdequate: true,
    },
    athlete: { heightCm: null, legLengthCm: 90, trochanterHeightM: null, weightKg: null, primaryEvent: null },
  });
  check(
    "P2.14. limiting factors are capped at the top 5 by impact, even though 6 real candidates qualify",
    p2Limiters.length === 5,
  );
  check(
    "P2.15. limiters are ranked by descending impact score (slow velocity gain first)",
    p2Limiters[0].type === "acceleration_slow_velocity_gain" && p2Limiters.every((l, i) => i === 0 || l.impact.score <= p2Limiters[i - 1].impact.score),
  );
  check(
    "P2.16. the lowest-impact 6th candidate (frequency plateau) is dropped by the cap",
    !p2Limiters.some((l) => l.type === "acceleration_frequency_plateau_too_early"),
  );
  check(
    "P2.17. a NOT-meaningful step-length asymmetry (5.2%) never produces a limiter — do not over-report tiny differences",
    !p2Limiters.some((l) => l.type === "acceleration_step_length_asymmetry"),
  );
  check(
    "P2.18. a meaningful step-TIME asymmetry (14%) DOES produce a limiter",
    p2Limiters.some((l) => l.type === "acceleration_step_time_asymmetry"),
  );
  check(
    "P2.19. every limiter carries a comparison to the athlete's own progression (Part 5), not just a population band",
    p2Limiters.every((l) => l.evidence.some((e) => e.kind === "comparison")),
  );
  check(
    "P2.20. limiter wording never states a diagnosis (no 'is weak' / 'your X is Y' phrasing)",
    p2Limiters.every((l) => !/\byour\b|\bis weak\b|\bare weak\b/i.test(l.summary) && !/\byour\b|\bis weak\b|\bare weak\b/i.test(l.title)),
  );

  // -- recommendations: dedup, cap, connect to a real limiter --
  const p2Recommendations = buildAccelerationRecommendations(p2Limiters);
  check("P2.21. two or three recommendations are generated, never a full program", p2Recommendations.length >= 2 && p2Recommendations.length <= 3);
  check(
    "P2.22. recommendations are deduplicated by title",
    new Set(p2Recommendations.map((r) => r.title)).size === p2Recommendations.length,
  );
  check(
    "P2.23. the top recommendation is drawn from the top-ranked limiter",
    p2Recommendations[0]?.title === "Falling starts",
  );

  // -- summary card --
  const p2Summary = buildAccelerationSummary({
    limiters: p2Limiters,
    recommendations: p2Recommendations,
    progression: p2Progression,
    peakVelocityMps: 5.35,
  });
  check("P2.24. summary rating reflects exactly one high-impact limiter", p2Summary.rating === "developing");
  check("P2.25. summary biggest limiter matches the top-ranked limiter's title", p2Summary.biggestLimiter === p2Limiters[0].title);
  check("P2.26. summary peak acceleration matches the progression's peak (4.0 m/s²)", approx(p2Summary.peakAccelerationMps2, 4.0, 1e-9));
  check("P2.27. summary most-efficient phase cites the real step (step 2)", p2Summary.mostEfficientPhase != null && p2Summary.mostEfficientPhase.includes("Step 2"));
  check("P2.28. summary primary recommendation matches the recommendation engine's top pick", p2Summary.primaryRecommendation === p2Recommendations[0].title);
  check("P2.29. summary is understandable at a glance: every field is a short string/number, never a raw object", typeof p2Summary.biggestStrength === "string" && typeof p2Summary.ratingExplanation === "string");

  // -------------------------------------------------------------------
  // 20/21. Result-contract parsing + legacy compatibility.
  // -------------------------------------------------------------------
  const legacyShape = {
    timingPolicyVersion: "CONSERVATIVE_TIMING_POLICY_V1",
    resultType: "acceleration",
    status: "ready",
    startEvent: {
      type: "FIRST_DETECTED_MOVEMENT",
      signal: "torso",
      frame: 10,
      timestamp: 0.5,
      confidence: 0.8,
      reason: "ok",
      debug: { candidates: fourCandidates() },
    },
    splits: { m10S: 1.2, m20S: null, m30S: null },
    rawSplits: { m10S: 1.2, m20S: null, m30S: null },
    finishDistanceM: 10,
    finishCrossingTime: 1.7,
    runTime: 1.2,
    rawRunTime: 1.2,
    reportedRunTime: 1.2,
    segmentVelocities: [],
    averageVelocityMps: 8.3,
    rawAverageVelocityMps: 8.3,
    reportedAverageVelocityMps: 8.3,
    earlyAccelerationMps2: null,
    peakVelocity: 8.5,
    rawPeakVelocity: 8.5,
    reportedPeakVelocity: 8.5,
    distanceToPeakVelocity: 9,
    summary: "ok",
    warnings: [],
    strideMetrics: { status: "unavailable", strideCount: null, averageStrideLengthM: null, reason: "n/a" },
  };
  const legacyParsed = accelerationMetricsSchemaFrom(out).safeParse(legacyShape);
  check("21. a pre-Phase-2 (legacy) analysis with no new fields still parses", legacyParsed.success);

  const v2Shape = {
    ...legacyShape,
    startEvent: { ...legacyShape.startEvent, provenance: "manual", zoneStartFrame: 10, startEventType: "first_movement_in_zone" },
    analysisSchemaVersion: "ava-acceleration-analysis-v2",
    calibratedMarkers: [{ label: "0m", distanceM: 0 }, { label: "10m", distanceM: 10 }],
    markerSplits: [
      { distanceM: 0, label: "0m", rawElapsedTimeS: 0, elapsedTimeS: 0, frameEquivalentTimeS: 1 / 60, interpolationMethod: "spatial_reference_only", quality: "interpolated" },
    ],
    intervalMetrics: [{ startM: 0, endM: 10, timeS: 1.2, velocityMps: 8.3, accelerationMps2: null, quality: "observed" }],
    steps: [
      {
        stepNumber: 1, side: "left", contactFrame: 10, toeOffFrame: 13, elapsedTimeS: 0.5,
        contactDistanceM: 2.5, stepLengthM: 1.5, stepTimeS: 0.25, stepFrequencyHz: 4,
        intervalVelocityMps: 6, averageAccelerationMps2: null, cumulativeDistanceM: 2.5,
        contactTimeS: 0.05, flightTimeBeforeS: null, flightTimeAfterS: 0.15,
        detectionConfidence: 0.9, dataQuality: "observed", qualityFlags: [], manualCorrection: null,
      },
    ],
    stepsStatus: "ready",
    stepsReason: null,
    peakVelocityDetail: { velocityMps: 8.5, distanceM: 9, timeS: 1.6 },
    asymmetries: {
      leftStepAverageM: 1.5, rightStepAverageM: 1.5, stepLengthAsymmetryPct: 0,
      leftStepFrequencyHz: 4, rightStepFrequencyHz: 4, leftStepSampleCount: 2, rightStepSampleCount: 2,
      earlyStepLengthAsymmetryPct: 0, lateStepLengthAsymmetryPct: 0, trend: "stable",
    },
    technicalProgression: { trunkAngle: { status: "experimental", samples: [], reason: "n/a" } },
    quality: {
      fps: 60, fpsAdequate: true, calibratedCoverageMinM: 0, calibratedCoverageMaxM: 10,
      markerCount: 2, contactCount: 4, startEventProvenance: "manual", startEventConfidence: 1, warnings: [],
    },
  };
  const v2Parsed = accelerationMetricsSchemaFrom(out).safeParse(v2Shape);
  check("20. a fully populated v2 result parses against the extended result contract", v2Parsed.success);
  if (!v2Parsed.success) console.error(v2Parsed.error.issues.slice(0, 3));

  // -------------------------------------------------------------------
  // 22. Ownership and calibration revision behavior (schema-shape parity
  // with fly's proven authority fields; the CAS mechanism itself is the
  // SAME `timing_zone_version` column exercised by calibration-lifecycle
  // and auth-ownership sanity, not re-tested here).
  // -------------------------------------------------------------------
  const authorityShapeOk = accelerationCalibrationGatesSchema.safeParse({
    schemaVersion: "ava-acceleration-calibration-v1",
    markers: validMarkers,
    travelDirection: "left_to_right",
    calibrationSource: "manual_confirmed",
    confirmedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revision: 3,
    authoritySchemaVersion: "ava-calibration-authority-v1",
  }).success;
  const tooFewMarkersRejected = !accelerationCalibrationGatesSchema.safeParse({
    schemaVersion: "ava-acceleration-calibration-v1",
    markers: [validMarkers[0]],
    travelDirection: "left_to_right",
  }).success;
  check("22. calibration schema carries the same revision/source/confirmedAt authority shape as fly's gates", authorityShapeOk);
  check("22b. fewer than two markers is rejected at the schema boundary", tooFewMarkersRejected);

  // -------------------------------------------------------------------
  // 23. Stationary-camera regression: no panning/world-lock fields leak
  // into the acceleration calibration schema or a computed result.
  // -------------------------------------------------------------------
  const calibKeys = JSON.stringify(Object.keys(accelerationCalibrationGatesSchema.shape));
  const resultKeys = JSON.stringify(Object.keys(splitAnalysis));
  const panningTokens = ["cameraPath", "worldLock", "frameToGlobal", "cameraTransform", "camera_path"];
  check(
    "23. acceleration calibration/result carry no panning world-lock fields",
    !panningTokens.some((t) => calibKeys.includes(t) || resultKeys.includes(t)),
  );

  // -------------------------------------------------------------------
  // 24. Panning code remains untouched by acceleration analysis: none of
  // the new/modified acceleration modules import panning-specific modules.
  // -------------------------------------------------------------------
  const accelerationSourceFiles = [
    "src/lib/acceleration/calibration.ts",
    "src/lib/acceleration/steps.ts",
    "src/lib/acceleration/metrics.ts",
    "src/lib/acceleration/limitingFactors.ts",
    "src/lib/acceleration/startEvent.ts",
  ];
  const panningModuleTokens = ["cameraPath", "zoneAnchors", "worldLockRepair", "worldProjection", "cameraTracking"];
  const leaks = [];
  for (const file of accelerationSourceFiles) {
    const text = readFileSync(path.join(root, file), "utf8");
    const importLines = text.split("\n").filter((line) => /^import /.test(line));
    for (const line of importLines) {
      for (const token of panningModuleTokens) {
        if (line.includes(token)) leaks.push(`${file}: ${line.trim()}`);
      }
    }
  }
  check("24. no acceleration module imports panning-specific machinery", leaks.length === 0);
  if (leaks.length) console.error(leaks);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);

// --- helpers ---------------------------------------------------------------

function torso(x, y = 0.5) {
  const p = { x, y, visibility: 0.9 };
  return { leftShoulder: p, rightShoulder: p, leftHip: p, rightHip: p };
}

/** Fills in intermediate frames by linear interpolation so torso-crossing has dense samples. */
function denseSeries(keyframes) {
  const out = [];
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    const steps = b.frame - a.frame;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const x = a.landmarks.leftShoulder.x + (b.landmarks.leftShoulder.x - a.landmarks.leftShoulder.x) * t;
      const time = a.time + (b.time - a.time) * t;
      out.push({ frame: a.frame + s, time, landmarks: torso(x), centerOfMass: { x, y: 0.5 } });
    }
  }
  out.push(keyframes[keyframes.length - 1]);
  return out;
}

/** Like `denseSeries`, but takes simple `{frame,time,x}` keyframes directly. */
function keyframeSeries(keyframes) {
  const out = [];
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    const steps = b.frame - a.frame;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t;
      const time = a.time + (b.time - a.time) * t;
      out.push({ frame: a.frame + s, time, landmarks: torso(x), centerOfMass: { x, y: 0.5 } });
    }
  }
  const last = keyframes[keyframes.length - 1];
  out.push({ frame: last.frame, time: last.time, landmarks: torso(last.x), centerOfMass: { x: last.x, y: 0.5 } });
  return out;
}

function emptyPoseSequence(fps) {
  return { backend: "test", modelVersion: "test", coordSpace: "normalized", fps, width: 1920, height: 1080, frames: [] };
}

function fourCandidates() {
  const c = { frame: null, timestamp: null, passed: false, reason: "not evaluated" };
  return { torso: c, shoulder: c, wrist: c, pose_anchor: c };
}

/** A symmetric triangular foot-y bump guarantees the smoothed local-maximum
 * lands EXACTLY at `contactFrame` (moving-average of a symmetric unimodal
 * sequence stays symmetric and unimodal around the same center). */
function triangleY(frame, contactFrame, baseline = 0.5, amplitude = 0.15, halfWidth = 5) {
  const d = Math.abs(frame - contactFrame);
  if (d > halfWidth) return baseline;
  return baseline + amplitude * (1 - d / halfWidth);
}

function buildStepPoseSequence(contacts, fps = 60, totalFrames = 70) {
  const frames = [];
  for (let i = 0; i < totalFrames; i++) {
    const xFor = (side) => {
      const relevant = contacts.filter((c) => c.side === side).sort((a, b) => a.contactFrame - b.contactFrame);
      const before = [...relevant].reverse().find((c) => c.contactFrame <= i);
      const after = relevant.find((c) => c.contactFrame >= i);
      if (before && after && before !== after) {
        const t = (i - before.contactFrame) / (after.contactFrame - before.contactFrame);
        return before.x + (after.x - before.x) * t;
      }
      return (before ?? after ?? relevant[0] ?? { x: 0.05 }).x;
    };
    const leftY = contacts.filter((c) => c.side === "left").reduce((max, c) => Math.max(max, triangleY(i, c.contactFrame)), 0.5 - 0.15);
    const rightY = contacts.filter((c) => c.side === "right").reduce((max, c) => Math.max(max, triangleY(i, c.contactFrame)), 0.5 - 0.15);
    const kp = (x, y) => ({ x, y, score: 0.9, visibility: 0.9 });
    frames.push({
      index: i,
      tMs: (i / fps) * 1000,
      keypoints: {
        left_toe: kp(xFor("left"), leftY),
        left_heel: kp(xFor("left"), leftY),
        left_ankle: kp(xFor("left"), leftY),
        right_toe: kp(xFor("right"), rightY),
        right_heel: kp(xFor("right"), rightY),
        right_ankle: kp(xFor("right"), rightY),
      },
    });
  }
  return { backend: "test", modelVersion: "test", coordSpace: "normalized", fps, width: 1920, height: 1080, frames };
}

function accelerationMetricsSchemaFrom(compiledOut) {
  if (_schemaCache) return _schemaCache;
  // The Zod schema itself lives in schema.ts, which was not part of this
  // script's isolated compile (it only needs the calibration enum/type, both
  // erased at emit) — compile it standalone here, same tsconfig pattern.
  const schemaOut = path.join(compiledOut, "schema-build");
  mkdirSync(schemaOut, { recursive: true });
  const tsconfigPath = path.join(schemaOut, "tsconfig.json");
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        outDir: schemaOut, rootDir: path.join(root, "src/lib"), module: "commonjs", target: "es2022",
        skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node",
      },
      files: [path.join(root, "src/lib/acceleration/schema.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", tsconfigPath], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
  const { accelerationMetricsSchema } = require(path.join(schemaOut, "acceleration/schema.js"));
  _schemaCache = accelerationMetricsSchema;
  return accelerationMetricsSchema;
}
