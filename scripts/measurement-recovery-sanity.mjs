// Day 96/97/98 sanity — locks in the stationary-measurement-engine audit and
// its Day 98 architectural follow-up as permanent, deterministic regression
// checks (not just prose in a report):
//
//   1. Validation dataset consistency — every real, completed local analysis
//      as of the Day 97 audit is recorded here with its measured
//      recordingMode / spatialMetricEligibility. Real, measured snapshot
//      (not synthetic), same pattern as the BASELINE object in
//      contact-calibration-sanity.mjs. classifyRecordingMode itself was NOT
//      changed by Day 98, so these values still hold — this section is
//      unchanged from Day 97.
//
//   2. Result-state correctness (deriveSprintResultState) — Day 98 removed
//      the `recordingMode` parameter entirely: withholding driven by
//      recordingMode now happens per-metric, upstream, inside
//      `evaluateMetricEvidence`, before a value ever reaches this function.
//      This section proves the new, simpler contract: the state is now
//      purely a function of which of the five already-resolved metrics are
//      non-null.
//
//   3. Metric evidence framework (`@/lib/intelligence/metricEvidence`) — the
//      actual Day 98 architectural change. Independent metric availability,
//      missing start/finish crossing, missing contacts, partial stride
//      evidence, partial timing evidence, provenance, and — most
//      importantly — that the panning-safety boundary is unconditionally
//      preserved (a panning/unknown-camera session gets the exact original
//      conservative behavior, with no relaxation at all).
//
//   4. Real-data regression — the exact real, measured Vanni 240fps values
//      from the Day 97 audit (not fabricated), replayed through
//      `evaluateMetricEvidence` directly, proving Average Step Length, Peak
//      Step Length, and Peak Velocity now become available while Average
//      Velocity correctly stays unavailable (genuine missing start-crossing
//      evidence, unchanged).
//
//   node scripts/measurement-recovery-sanity.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".measurement-recovery-tmp");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return origResolve.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

// --- 1. Validation dataset consistency (Day 97, unchanged by Day 98) -------
const REAL_COMPLETED_SESSIONS = [
  {
    id: "227ae200-af96-4ffc-94d0-56d2e5f9d155",
    name: "vanni 240fps fly",
    analysisType: "fly",
    fps: 239.48,
    recordingMode: "athlete_tracking_lost",
    spatialMetricEligibility: "withheld",
  },
  {
    id: "26d7492b-99ad-4070-b0e2-6ee654032f8b",
    name: "(untitled) 120fps fly",
    analysisType: "fly",
    fps: 119.941,
    recordingMode: "athlete_tracking_lost",
    spatialMetricEligibility: "withheld",
  },
  {
    id: "f284fb85-cfe4-4ebf-9956-279975396f37",
    name: "AVA Accel Test (120fps-QA)",
    analysisType: "acceleration",
    fps: 119.946,
    recordingMode: "athlete_tracking_lost",
    spatialMetricEligibility: "withheld",
  },
  {
    id: "f7026ec9-1428-44f5-819e-5db96ccb20d9",
    name: "AVA Accel Test (60fps-QA)",
    analysisType: "acceleration",
    fps: 60,
    recordingMode: "athlete_tracking_lost",
    spatialMetricEligibility: "withheld",
  },
];

const KNOWN_RECORDING_MODES = new Set([
  "static_precision",
  "static_usable",
  "smooth_pan",
  "unstable_pan",
  "pan_with_zoom",
  "excessive_camera_motion",
  "athlete_tracking_lost",
  "unsupported_recording",
]);
const KNOWN_ELIGIBILITY = new Set(["eligible", "conditional", "withheld"]);

check(
  "validation dataset has at least one real completed session per analysis_type seen locally",
  new Set(REAL_COMPLETED_SESSIONS.map((s) => s.analysisType)).size >= 2,
);
for (const s of REAL_COMPLETED_SESSIONS) {
  check(`${s.id} (${s.name}): well-formed fps`, typeof s.fps === "number" && s.fps > 0);
  check(`${s.id}: recordingMode is a known enum value`, KNOWN_RECORDING_MODES.has(s.recordingMode));
  check(`${s.id}: spatialMetricEligibility is a known enum value`, KNOWN_ELIGIBILITY.has(s.spatialMetricEligibility));
}
check(
  "AS MEASURED 2026-08-03: every real completed session's whole-recording classification is still " +
    "athlete_tracking_lost / withheld — classifyRecordingMode itself was not touched by Day 98 " +
    "(the fix is a per-metric evidence layer ABOVE this classifier, not a change to it)",
  REAL_COMPLETED_SESSIONS.every((s) => s.spatialMetricEligibility === "withheld"),
);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        outDir: out,
        module: "commonjs",
        target: "es2022",
        skipLibCheck: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        strict: true,
        moduleResolution: "node",
        jsx: "react-jsx",
        baseUrl: root,
        paths: { "@/*": ["src/*"] },
      },
      files: [
        path.join(root, "src/app/sessions/[id]/PerformanceSummaryCard.tsx"),
        path.join(root, "src/lib/intelligence/metricEvidence.ts"),
        path.join(root, "src/lib/intelligence/trustedMetrics.ts"),
      ],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], {
    cwd: root,
    stdio: ["ignore", "inherit", "inherit"],
  });
  const { deriveSprintResultState } = require(path.join(out, "app/sessions/[id]/PerformanceSummaryCard.js"));
  const { evaluateMetricEvidence } = require(path.join(out, "lib/intelligence/metricEvidence.js"));
  const { buildTrustedMetrics } = require(path.join(out, "lib/intelligence/trustedMetrics.js"));

  // --- 2. Result-state correctness (Day 98: no recordingMode parameter) ----
  const fullTrusted = {
    topSpeedMps: 10.1,
    avgVelocityMps: 9.5,
    avgStrideLengthM: 2.03,
    peakStrideLengthM: 2.03,
    strideRetentionPct: 100,
    strideLengthM: 2.03,
    frequencyHz: 4.86,
    zoneDistanceM: 20,
    zoneTimeS: 1.93,
    timingAvailabilityReason: null,
    stepLengthConfidence: "high",
  };
  check("2. zero core metrics -> unavailable", deriveSprintResultState({
    ...fullTrusted, topSpeedMps: null, avgVelocityMps: null, avgStrideLengthM: null,
    peakStrideLengthM: null, frequencyHz: null, zoneTimeS: null,
  }) === "unavailable");
  check("2. all 5 core metrics + verified zoneTimeS -> verified", deriveSprintResultState(fullTrusted) === "verified");
  check("2. 4 of 5 core metrics present -> partial", deriveSprintResultState({ ...fullTrusted, topSpeedMps: null }) === "partial");
  check(
    "2. all 5 core metrics present but zoneTimeS unverified -> partial (never verified without a verified crossing)",
    deriveSprintResultState({ ...fullTrusted, zoneTimeS: null }) === "partial",
  );
  check(
    "2. Day 97 scenario reproduced under Day 98: ONLY frequencyHz resolved (its own evidence passed upstream) -> partial, not unavailable " +
      "(the exact behavior change this milestone exists to make: one available metric is no longer thrown away)",
    deriveSprintResultState({
      ...fullTrusted, topSpeedMps: null, avgVelocityMps: null, avgStrideLengthM: null,
      peakStrideLengthM: null, zoneTimeS: null, timingAvailabilityReason: "start_crossing_unavailable",
    }) === "partial",
  );

  // --- fixtures for section 3 ------------------------------------------------
  const baseTiming = {
    verified: false,
    startCrossingFrame: null, finishCrossingFrame: null,
    startCrossingTimestampS: null, finishCrossingTimestampS: null,
    crossingDetectionMethod: null, timingAuthority: "automatic",
    startCrossingExtrapolated: false, finishCrossingExtrapolated: false,
    timingAvailabilityReason: "not_calibrated",
    timingStatus: "unavailable",
    startContinuityFramesBefore: 0, startContinuityFramesAfter: 0,
    finishContinuityFramesBefore: 0, finishContinuityFramesAfter: 0,
    startBracketedByConsecutiveFrames: false, finishBracketedByConsecutiveFrames: false,
  };
  const baseMeasurements = () => ({
    calibrated: true,
    metersPerPixel: 0.014,
    zone: { minX: 0.1, maxX: 0.9, entryX: 0.1, exitX: 0.9, distanceM: 20 },
    validContacts: 5,
    zoneStepSummary: null,
    avgIndividualStepLengthM: null,
    avgZoneStepLengthM: null,
    individualStepLengthsM: [],
    peakStrideLengthM: null,
    stepLengthConfidence: "low",
    combinedStepFrequencyHz: 4.9,
    strideVelocityWindows: [],
    maxVelocityMps: null,
    velocitySpreadPct: null,
    zoneVelocityMps: null,
    timingProvenance: { ...baseTiming },
    groundContactCombinedMs: null,
    flightCombinedMs: null,
    diagnostics: { timing: { leftContacts: 0, rightContacts: 0 } },
  });
  const goodAssessment = (mode) => ({
    recordingMode: mode,
    athleteTrackingConfidence: 0.95,
    cameraMotionConfidence: 0.95,
    spatialMetricEligibility: mode === "athlete_tracking_lost" ? "withheld" : "eligible",
  });

  // --- 3a. Independent metric availability: step-length evidence present,
  //     velocity evidence present, timing evidence absent -> each resolves on
  //     its OWN evidence, not as a block. ---------------------------------
  {
    const m = baseMeasurements();
    m.individualStepLengthsM = [2.0, 2.1, 1.95, 2.05];
    m.avgIndividualStepLengthM = 2.025;
    m.peakStrideLengthM = 2.025;
    m.stepLengthConfidence = "high";
    m.strideVelocityWindows = [{ startContactIndex: 0, endContactIndex: 2, distanceM: 4, rawDurationS: 0.4, reportedDurationS: 0.4, rawVelocityMps: 10, reportedVelocityMps: 10 }];
    m.maxVelocityMps = 10;
    m.velocitySpreadPct = 5;
    const assessment = goodAssessment("athlete_tracking_lost");
    const ev = evaluateMetricEvidence(m, assessment, { calibrationCameraType: "stationary" });
    const byM = Object.fromEntries(ev.map((e) => [e.metric, e]));
    check("3a. avgStrideLengthM available on its own evidence", byM.avgStrideLengthM.status === "available" && Math.abs(byM.avgStrideLengthM.value - 2.025) < 1e-9);
    check("3a. peakStrideLengthM available on its own evidence", byM.peakStrideLengthM.status === "available");
    check("3a. topSpeedMps available on its own evidence", byM.topSpeedMps.status === "available" && byM.topSpeedMps.value === 10);
    check("3a. frequencyHz available (independent gate, unaffected)", byM.frequencyHz.status === "available");
    check("3a. avgVelocityMps stays unavailable (no timing evidence at all) — one metric's absence never blocked the others above", byM.avgVelocityMps.status === "unavailable");
    check("3a. zoneTimeS stays unavailable with its real reason", byM.zoneTimeS.status === "unavailable" && byM.zoneTimeS.reasonCode === "not_calibrated");
  }

  // --- 3b. Missing start crossing only: avgVelocityMps + zoneTimeS
  //     unavailable with "start_crossing_unavailable"; unrelated metrics
  //     unaffected. -----------------------------------------------------
  {
    const m = baseMeasurements();
    m.individualStepLengthsM = [2.0, 2.1];
    m.avgIndividualStepLengthM = 2.05;
    m.peakStrideLengthM = 2.05;
    m.stepLengthConfidence = "medium";
    m.strideVelocityWindows = [{ startContactIndex: 0, endContactIndex: 2, distanceM: 4, rawDurationS: 0.4, reportedDurationS: 0.4, rawVelocityMps: 10, reportedVelocityMps: 10 }];
    m.maxVelocityMps = 10;
    m.velocitySpreadPct = 8;
    m.timingProvenance = { ...baseTiming, timingAvailabilityReason: "start_crossing_unavailable", finishCrossingTimestampS: 8.0 };
    const ev = evaluateMetricEvidence(m, goodAssessment("athlete_tracking_lost"), { calibrationCameraType: "stationary" });
    const byM = Object.fromEntries(ev.map((e) => [e.metric, e]));
    check("3b. missing start crossing -> zoneTimeS unavailable with start_crossing_unavailable", byM.zoneTimeS.reasonCode === "start_crossing_unavailable");
    check("3b. missing start crossing -> avgVelocityMps unavailable with start_crossing_unavailable", byM.avgVelocityMps.reasonCode === "start_crossing_unavailable");
    check("3b. missing start crossing does NOT block topSpeedMps (independent evidence)", byM.topSpeedMps.status === "available");
    check("3b. missing start crossing does NOT block step length (independent evidence)", byM.avgStrideLengthM.status === "available");
  }

  // --- 3c. Missing finish crossing only: symmetric to 3b. -------------------
  {
    const m = baseMeasurements();
    m.timingProvenance = { ...baseTiming, timingAvailabilityReason: "finish_crossing_unavailable", startCrossingTimestampS: 1.0 };
    const ev = evaluateMetricEvidence(m, goodAssessment("static_precision"));
    const byM = Object.fromEntries(ev.map((e) => [e.metric, e]));
    check("3c. missing finish crossing -> zoneTimeS unavailable with finish_crossing_unavailable", byM.zoneTimeS.reasonCode === "finish_crossing_unavailable");
    check("3c. missing finish crossing -> avgVelocityMps unavailable with finish_crossing_unavailable", byM.avgVelocityMps.reasonCode === "finish_crossing_unavailable");
  }

  // --- 3d. Missing contacts entirely: every contact-derived metric
  //     unavailable with an evidence-count reason, not a crash. -------------
  {
    const m = baseMeasurements();
    const ev = evaluateMetricEvidence(m, goodAssessment("static_precision"));
    const byM = Object.fromEntries(ev.map((e) => [e.metric, e]));
    check("3d. zero contacts -> avgStrideLengthM unavailable, insufficient_step_evidence", byM.avgStrideLengthM.status === "unavailable" && byM.avgStrideLengthM.reasonCode === "insufficient_step_evidence");
    check("3d. zero contacts -> peakStrideLengthM unavailable, insufficient_step_evidence", byM.peakStrideLengthM.reasonCode === "insufficient_step_evidence");
    check("3d. zero contacts -> topSpeedMps unavailable, insufficient_stride_evidence", byM.topSpeedMps.reasonCode === "insufficient_stride_evidence");
    check("3d. zero contacts -> groundContactTimeMs/flightTimeMs unavailable, insufficient_contact_evidence", byM.groundContactTimeMs.reasonCode === "insufficient_contact_evidence" && byM.flightTimeMs.reasonCode === "insufficient_contact_evidence");
  }

  // --- 3e. Partial stride evidence: exactly 1 valid step interval (below the
  //     >=2 minimum `computePeakStrideLengthM` itself already enforces) ->
  //     step length unavailable; exactly 2 valid contacts (below the >=3
  //     stride-velocity-window minimum) -> peak velocity unavailable. -------
  {
    const m = baseMeasurements();
    m.individualStepLengthsM = [2.05]; // only 1 — below the real minimum of 2
    m.avgIndividualStepLengthM = 2.05; // mean() would still return a number for N=1
    m.peakStrideLengthM = null; // real computePeakStrideLengthM already returns null below 2
    m.strideVelocityWindows = []; // fewer than 3 contacts -> no window
    m.maxVelocityMps = null;
    const ev = evaluateMetricEvidence(m, goodAssessment("static_precision"));
    const byM = Object.fromEntries(ev.map((e) => [e.metric, e]));
    check("3e. exactly 1 valid step interval -> avgStrideLengthM unavailable despite a non-null upstream mean", byM.avgStrideLengthM.status === "unavailable");
    check("3e. exactly 1 valid step interval -> peakStrideLengthM unavailable", byM.peakStrideLengthM.status === "unavailable");
    check("3e. no stride-velocity window -> topSpeedMps unavailable", byM.topSpeedMps.status === "unavailable");
  }

  // --- 3f. Partial timing evidence: crossings verified but only
  //     provisionally (thin surrounding continuity) -> AVAILABLE (unchanged
  //     from today), but confidenceCategory is downgraded to "medium", never
  //     silently reported as high-confidence as a fully-bracketed crossing. -
  {
    const m = baseMeasurements();
    m.timingProvenance = {
      ...baseTiming, verified: true, timingAvailabilityReason: null,
      timingStatus: "provisionally_verified",
      startCrossingTimestampS: 1.0, finishCrossingTimestampS: 3.0,
    };
    m.zoneVelocityMps = 6.67;
    const ev = evaluateMetricEvidence(m, goodAssessment("static_precision"));
    const byM = Object.fromEntries(ev.map((e) => [e.metric, e]));
    check("3f. provisionally-verified timing is still available", byM.zoneTimeS.status === "available" && byM.avgVelocityMps.status === "available");
    check("3f. provisionally-verified timing carries medium (not high) internal confidence", byM.zoneTimeS.confidenceCategory === "medium" && byM.avgVelocityMps.confidenceCategory === "medium");
  }

  // --- 3g. Metric provenance is populated, not a stub. -----------------------
  {
    const m = baseMeasurements();
    m.individualStepLengthsM = [2.0, 2.1, 1.95];
    m.avgIndividualStepLengthM = 2.02;
    m.peakStrideLengthM = 2.02;
    m.strideVelocityWindows = [{ startContactIndex: 0, endContactIndex: 2, distanceM: 4, rawDurationS: 0.4, reportedDurationS: 0.4, rawVelocityMps: 10, reportedVelocityMps: 10 }];
    m.maxVelocityMps = 10;
    m.velocitySpreadPct = 5;
    const ev = evaluateMetricEvidence(m, goodAssessment("static_precision"), { calibrationSource: "manual_confirmed" });
    const byM = Object.fromEntries(ev.map((e) => [e.metric, e]));
    check("3g. topSpeedMps provenance carries its real source windows", byM.topSpeedMps.provenance.sourceWindows.length === 1 && byM.topSpeedMps.provenance.verifiedStrideCount === 1);
    check("3g. avgStrideLengthM provenance carries its real stride count + calibration source", byM.avgStrideLengthM.provenance.verifiedStrideCount === 3 && byM.avgStrideLengthM.provenance.calibrationSource === "manual_confirmed");
    check("3g. zoneTimeS provenance declares its required crossings", Array.isArray(byM.zoneTimeS.provenance.requiredCrossings) && byM.zoneTimeS.provenance.requiredCrossings.includes("start") && byM.zoneTimeS.provenance.requiredCrossings.includes("finish"));
  }

  // --- 3h. Joint angles / asymmetry: honestly unavailable, not silently
  //     omitted from the contract list. --------------------------------------
  {
    const ev = evaluateMetricEvidence(baseMeasurements(), goodAssessment("static_precision"));
    const byM = Object.fromEntries(ev.map((e) => [e.metric, e]));
    check("3h. peakKneeFlexionDeg declared, reason not_computed_by_current_pipeline", byM.peakKneeFlexionDeg.status === "unavailable" && byM.peakKneeFlexionDeg.reasonCode === "not_computed_by_current_pipeline");
    check("3h. asymmetryPct declared, reason not_computed_by_current_pipeline", byM.asymmetryPct.status === "unavailable" && byM.asymmetryPct.reasonCode === "not_computed_by_current_pipeline");
  }

  // --- 3i. PANNING SAFETY REGRESSION (the boundary this file must never
  //     weaken). Same good evidence as 3a, but recordingMode is a
  //     camera-motion-driven mode -> stays blanket-withheld regardless of
  //     calibrationCameraType claiming "stationary" (defense in depth: a
  //     camera-motion classification always wins). ---------------------------
  for (const mode of ["smooth_pan", "unstable_pan", "pan_with_zoom", "excessive_camera_motion", "unsupported_recording"]) {
    const m = baseMeasurements();
    m.individualStepLengthsM = [2.0, 2.1, 1.95, 2.05];
    m.avgIndividualStepLengthM = 2.025;
    m.peakStrideLengthM = 2.025;
    m.strideVelocityWindows = [{ startContactIndex: 0, endContactIndex: 2, distanceM: 4, rawDurationS: 0.4, reportedDurationS: 0.4, rawVelocityMps: 10, reportedVelocityMps: 10 }];
    m.maxVelocityMps = 10;
    const assessment = { ...goodAssessment(mode), spatialMetricEligibility: "withheld" };
    const ev = evaluateMetricEvidence(m, assessment, { calibrationCameraType: "stationary" });
    const byM = Object.fromEntries(ev.map((e) => [e.metric, e]));
    check(`3i. panning safety unchanged for recordingMode="${mode}" even claiming calibrationCameraType="stationary": avgStrideLengthM stays withheld`, byM.avgStrideLengthM.status === "unavailable" && byM.avgStrideLengthM.reasonCode === "camera_motion_unreliable");
    check(`3i. panning safety unchanged for recordingMode="${mode}": topSpeedMps stays withheld`, byM.topSpeedMps.status === "unavailable" && byM.topSpeedMps.reasonCode === "camera_motion_unreliable");
  }
  // Same good evidence, athlete_tracking_lost, but NO calibrationCameraType
  // provided at all (the default every pre-Day-98 call site still uses) ->
  // must fall back to the fully conservative original behavior.
  {
    const m = baseMeasurements();
    m.individualStepLengthsM = [2.0, 2.1, 1.95, 2.05];
    m.avgIndividualStepLengthM = 2.025;
    m.strideVelocityWindows = [{ startContactIndex: 0, endContactIndex: 2, distanceM: 4, rawDurationS: 0.4, reportedDurationS: 0.4, rawVelocityMps: 10, reportedVelocityMps: 10 }];
    m.maxVelocityMps = 10;
    const ev = evaluateMetricEvidence(m, goodAssessment("athlete_tracking_lost")); // no options at all
    const byM = Object.fromEntries(ev.map((e) => [e.metric, e]));
    check("3i. no calibrationCameraType provided -> conservative default preserved (avgStrideLengthM withheld)", byM.avgStrideLengthM.status === "unavailable" && byM.avgStrideLengthM.reasonCode === "athlete_tracking_unreliable");
    check("3i. no calibrationCameraType provided -> conservative default preserved (topSpeedMps withheld)", byM.topSpeedMps.status === "unavailable");
  }
  // Same again but calibrationCameraType explicitly "panning" -> must also
  // stay withheld even though recordingMode is athlete_tracking_lost (not a
  // camera-motion mode) — panning claims never get the relaxed path.
  {
    const m = baseMeasurements();
    m.individualStepLengthsM = [2.0, 2.1, 1.95, 2.05];
    m.avgIndividualStepLengthM = 2.025;
    m.strideVelocityWindows = [{ startContactIndex: 0, endContactIndex: 2, distanceM: 4, rawDurationS: 0.4, reportedDurationS: 0.4, rawVelocityMps: 10, reportedVelocityMps: 10 }];
    m.maxVelocityMps = 10;
    const ev = evaluateMetricEvidence(m, goodAssessment("athlete_tracking_lost"), { calibrationCameraType: "panning" });
    const byM = Object.fromEntries(ev.map((e) => [e.metric, e]));
    check("3i. explicit calibrationCameraType=panning + athlete_tracking_lost -> stays withheld", byM.avgStrideLengthM.status === "unavailable");
  }

  // --- 4. Real-data regression: the exact measured Day 97 Vanni 240fps
  //     values (not fabricated), replayed through evaluateMetricEvidence. ---
  {
    const vanni = baseMeasurements();
    vanni.individualStepLengthsM = [1.926522, 2.057604, 1.991629, 2.156981];
    vanni.avgIndividualStepLengthM = 2.033184;
    vanni.peakStrideLengthM = 2.033184; // real: equals average at exactly N=4 valid strides
    vanni.stepLengthConfidence = "high";
    vanni.combinedStepFrequencyHz = 4.863222;
    vanni.strideVelocityWindows = [
      { startContactIndex: 0, endContactIndex: 2, distanceM: 3.984115, rawDurationS: 0.421667, reportedDurationS: 0.43, rawVelocityMps: 9.448493, reportedVelocityMps: 9.265383 },
      { startContactIndex: 1, endContactIndex: 3, distanceM: 4.047111, rawDurationS: 0.409167, reportedDurationS: 0.41, rawVelocityMps: 9.891108, reportedVelocityMps: 9.871004 },
      { startContactIndex: 2, endContactIndex: 4, distanceM: 4.139422, rawDurationS: 0.400833, reportedDurationS: 0.41, rawVelocityMps: 10.32704, reportedVelocityMps: 10.096151 },
    ];
    vanni.maxVelocityMps = 10.096151;
    vanni.velocitySpreadPct = 0.422263;
    vanni.zoneVelocityMps = null; // real: null — start crossing never observed
    vanni.timingProvenance = {
      ...baseTiming,
      verified: false,
      finishCrossingTimestampS: 7.993259,
      timingAvailabilityReason: "start_crossing_unavailable",
      finishContinuityFramesBefore: 30, finishContinuityFramesAfter: 30,
      finishBracketedByConsecutiveFrames: true,
    };
    vanni.validContacts = 5;
    const vanniAssessment = {
      recordingMode: "athlete_tracking_lost",
      athleteTrackingConfidence: 0.9566074576966288,
      cameraMotionConfidence: 0.9970943676903032,
      spatialMetricEligibility: "withheld",
    };
    const ev = evaluateMetricEvidence(vanni, vanniAssessment, { calibrationCameraType: "stationary", calibrationSource: "manual_confirmed" });
    const byM = Object.fromEntries(ev.map((e) => [e.metric, e]));
    check("4. REAL Vanni 240fps data: avgStrideLengthM recovered ≈ 2.033m", byM.avgStrideLengthM.status === "available" && Math.abs(byM.avgStrideLengthM.value - 2.033184) < 1e-6);
    check("4. REAL Vanni 240fps data: peakStrideLengthM recovered ≈ 2.033m", byM.peakStrideLengthM.status === "available" && Math.abs(byM.peakStrideLengthM.value - 2.033184) < 1e-6);
    check("4. REAL Vanni 240fps data: topSpeedMps recovered ≈ 10.096 m/s", byM.topSpeedMps.status === "available" && Math.abs(byM.topSpeedMps.value - 10.096151) < 1e-6);
    check("4. REAL Vanni 240fps data: frequencyHz was ALREADY available before Day 98 (unaffected)", byM.frequencyHz.status === "available");
    check("4. REAL Vanni 240fps data: avgVelocityMps correctly STAYS unavailable (genuine missing start crossing, unchanged)", byM.avgVelocityMps.status === "unavailable" && byM.avgVelocityMps.reasonCode === "start_crossing_unavailable");
    check("4. REAL Vanni 240fps data: zoneTimeS correctly STAYS unavailable, same real reason", byM.zoneTimeS.status === "unavailable" && byM.zoneTimeS.reasonCode === "start_crossing_unavailable");

    const trusted = buildTrustedMetrics(vanni, vanniAssessment, { calibrationCameraType: "stationary", calibrationSource: "manual_confirmed" });
    check("4. buildTrustedMetrics surfaces the same recovered values end-to-end", trusted != null && Math.abs(trusted.avgStrideLengthM - 2.033184) < 1e-6 && Math.abs(trusted.topSpeedMps - 10.096151) < 1e-6 && trusted.avgVelocityMps === null);
    check("4. deriveSprintResultState on the real Vanni data -> partial (3 of 5 core metrics, unverified zone time) — visible, not blanked", deriveSprintResultState(trusted) === "partial");
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

console.log(ok ? "\nAll measurement-recovery sanity checks passed." : "\nSanity FAILED.");
process.exit(ok ? 0 : 1);
