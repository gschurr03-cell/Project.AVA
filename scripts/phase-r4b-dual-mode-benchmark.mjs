// Phase R4B Parts L/M/N/V -- runs all 4 protected benchmarks through the
// REAL, now-modified computeSprintMeasurements() in BOTH modes:
//   LEGACY_2D               (no measurementModelVersion -- default, byte-
//                            identical to every prior phase's behavior)
//   CANONICAL_LONGITUDINAL  (explicit request, NO cameraEvidence supplied --
//                            this is the NEW capability: a stationary
//                            camera reaching the canonical path without
//                            needing camera-motion evidence at all)
//
//   node scripts/phase-r4b-dual-mode-benchmark.mjs
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import crypto from "node:crypto";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(root, "tmp/phaseR4B");
mkdirSync(OUT_DIR, { recursive: true });

const BENCHMARKS = {
  gav: { pose: "tmp/phase94/gav.pose.json", sessionId: "e04a7983-7406-4a00-bb89-8ada7b10bf9f" },
  vanni60: { pose: "tmp/phase94/vanni60.pose.json", sessionId: "3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d" },
  vanni120: { pose: "tmp/phase94/vanni120.pose.json", sessionId: "160a86a2-c0db-4e7d-9fbe-82aedd6d3eff" },
  vanni240: { pose: "tmp/phase94/vanni240.pose.json", sessionId: "31fe352b-f00f-4a80-b20a-17c2ab08ec5a" },
};

const MP_INDEX_TO_JOINT = [
  [0, "nose"], [11, "left_shoulder"], [12, "right_shoulder"],
  [13, "left_elbow"], [14, "right_elbow"], [15, "left_wrist"], [16, "right_wrist"],
  [23, "left_hip"], [24, "right_hip"], [25, "left_knee"], [26, "right_knee"],
  [27, "left_ankle"], [28, "right_ankle"], [29, "left_heel"], [30, "right_heel"],
  [31, "left_toe"], [32, "right_toe"],
];

const out = path.join(root, ".r4b-tmp-compile");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return origResolve.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};

function summarize(m) {
  return {
    measurementModelVersion: m.measurementModelVersion,
    zoneStepSummaryActive: m.zoneStepSummary != null,
    totalContacts: m.totalContacts,
    validContacts: m.validContacts,
    fullRunContactIds: m.fullRunContacts.map((c) => `contact-${c.sourceFrameIndex}-${c.side}-${c.index}`),
    zoneEntryTimeS: m.zoneEntryTimeS,
    zoneExitTimeS: m.zoneExitTimeS,
    zoneTimeS: m.zoneTimeS,
    combinedStepFrequencyHz: m.combinedStepFrequencyHz,
    leftStepFrequencyHz: m.leftStepFrequencyHz,
    rightStepFrequencyHz: m.rightStepFrequencyHz,
    zoneVelocityMps: m.zoneVelocityMps,
    avgIndividualStepLengthM: m.avgIndividualStepLengthM,
    avgZoneStepLengthM: m.avgZoneStepLengthM,
    peakStrideLengthM: m.peakStrideLengthM,
    leftStepLengthM: m.leftStepLengthM,
    rightStepLengthM: m.rightStepLengthM,
    individualStepLengthsM: m.individualStepLengthsM,
    maxVelocityMps: m.maxVelocityMps,
    zoneSteps: m.zoneSteps.map((s) => ({
      index: s.index, contactId: s.contactId, side: s.side, timeS: s.timeS,
      stepLengthM: s.stepLengthM, physicalStepLengthM: s.physicalStepLengthM,
      physicalStepLengthState: s.physicalStepLengthState, longitudinalM: s.longitudinalM, lateralM: s.lateralM,
    })),
  };
}

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
      path.join(root, "src/lib/video/worldProjection.ts"),
      path.join(root, "src/lib/calibration/zoneAnchors.ts"),
    ],
  }));
  try {
    execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const t = String(err.stdout ?? "") + String(err.stderr ?? "");
    if (!/worldProjection\.ts|zoneAnchors\.ts/.test(t)) throw new Error(t);
  }

  const { buildOverlayFrames } = require(path.join(out, "lib/video/overlay.js"));
  const { applyFpsOverride, normalizeFps } = require(path.join(out, "lib/video/fps.js"));
  const { computeSprintMeasurements } = require(path.join(out, "lib/benchmark/measurements.js"));
  const { gatesToManualPoints } = require(path.join(out, "lib/calibration/gates.js"));
  const { MEASUREMENT_MODEL_CANONICAL_LONGITUDINAL } = require(path.join(out, "lib/benchmark/measurementModel.js"));

  const legacyBaseline = {};
  const canonicalResults = {};
  const dualModeComparison = {};

  for (const [label, { pose: posePath, sessionId }] of Object.entries(BENCHMARKS)) {
    const seq = JSON.parse(readFileSync(path.join(root, posePath), "utf8"));
    const rawFrames = seq.frames.map((f) => {
      const landmarks = [];
      for (const [i, key] of MP_INDEX_TO_JOINT) {
        const kp = f.keypoints?.[key];
        if (kp) landmarks[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score };
      }
      return { frame: f.index, sourceFrameIndex: f.sourceFrameIndex, time: f.tMs / 1000, landmarks, boxOrigin: f.boxOrigin, trackState: f.trackState, identityContinuityScore: f.identityContinuityScore };
    });
    const baseFrames = buildOverlayFrames({ fps: seq.fps, width: seq.width, height: seq.height, backend: "mediapipe", frames: rawFrames });
    const overlayFrames = applyFpsOverride(baseFrames, normalizeFps(seq.fps));
    const gates = JSON.parse(readFileSync(path.join(root, "tmp/phaseR4A", `calibration-gates-${label}.json`), "utf8"));
    const manualPoints = gatesToManualPoints(gates);

    // Mode 1: LEGACY_2D -- omit measurementModelVersion entirely (default),
    // and omit cameraEvidence exactly like real production does for a
    // stationary camera -- must be byte-identical to R4A's own "production" run.
    const legacy = computeSprintMeasurements(overlayFrames, manualPoints, seq.width, seq.height, {
      gates,
      cameraEvidence: undefined,
    });

    // Mode 2: CANONICAL_LONGITUDINAL -- explicit request, STILL no
    // cameraEvidence (this is the whole point of R4B: a stationary camera
    // can now reach the canonical path without camera-motion evidence).
    const canonical = computeSprintMeasurements(overlayFrames, manualPoints, seq.width, seq.height, {
      gates,
      cameraEvidence: undefined,
      measurementModelVersion: MEASUREMENT_MODEL_CANONICAL_LONGITUDINAL,
    });

    legacyBaseline[label] = summarize(legacy);
    canonicalResults[label] = summarize(canonical);

    const contactIdsMatch = JSON.stringify(legacy.fullRunContacts.map((c) => `${c.sourceFrameIndex}-${c.side}-${c.time}`)) ===
      JSON.stringify(canonical.fullRunContacts.map((c) => `${c.sourceFrameIndex}-${c.side}-${c.time}`));
    const stepLenDiff = legacy.avgIndividualStepLengthM != null && canonical.avgIndividualStepLengthM != null
      ? Math.abs(legacy.avgIndividualStepLengthM - canonical.avgIndividualStepLengthM)
      : null;
    const stepLenPct = stepLenDiff != null ? (stepLenDiff / legacy.avgIndividualStepLengthM) * 100 : null;
    const peakVDiff = legacy.maxVelocityMps != null && canonical.maxVelocityMps != null
      ? Math.abs(legacy.maxVelocityMps - canonical.maxVelocityMps) : null;
    const peakVPct = peakVDiff != null && legacy.maxVelocityMps ? (peakVDiff / legacy.maxVelocityMps) * 100 : null;

    dualModeComparison[label] = {
      contactIdentitiesUnchanged: contactIdsMatch,
      contactTimestampsUnchanged: JSON.stringify(legacy.fullRunContacts.map((c) => c.time)) === JSON.stringify(canonical.fullRunContacts.map((c) => c.time)),
      zoneFrequencyUnchanged: legacy.combinedStepFrequencyHz === canonical.combinedStepFrequencyHz,
      zoneVelocityUnchanged: legacy.zoneVelocityMps === canonical.zoneVelocityMps,
      zoneTimeUnchanged: legacy.zoneTimeS === canonical.zoneTimeS,
      legacyAvgStepLengthM: legacy.avgIndividualStepLengthM,
      canonicalAvgStepLengthM: canonical.avgIndividualStepLengthM,
      stepLengthAbsDiffM: stepLenDiff, stepLengthPctDiff: stepLenPct,
      legacyPeakVelocityMps: legacy.maxVelocityMps,
      canonicalPeakVelocityMps: canonical.maxVelocityMps,
      peakVelocityAbsDiffMps: peakVDiff, peakVelocityPctDiff: peakVPct,
    };
    console.log(`${label}: contactsUnchanged=${contactIdsMatch} freqUnchanged=${legacy.combinedStepFrequencyHz === canonical.combinedStepFrequencyHz} velUnchanged=${legacy.zoneVelocityMps === canonical.zoneVelocityMps} | stepLen ${legacy.avgIndividualStepLengthM?.toFixed(4)}->${canonical.avgIndividualStepLengthM?.toFixed(4)} (${stepLenPct?.toFixed(2)}%) | peakV ${legacy.maxVelocityMps?.toFixed(4)}->${canonical.maxVelocityMps?.toFixed(4)} (${peakVPct?.toFixed(2)}%)`);
  }

  writeFileSync(path.join(OUT_DIR, "legacy-baseline.json"), JSON.stringify(legacyBaseline, null, 2));
  writeFileSync(path.join(OUT_DIR, "canonical-results.json"), JSON.stringify(canonicalResults, null, 2));
  writeFileSync(path.join(OUT_DIR, "dual-mode-comparison.json"), JSON.stringify(dualModeComparison, null, 2));

  const stepLengthDeltas = Object.fromEntries(Object.entries(dualModeComparison).map(([k, v]) => [k, { absDiffM: v.stepLengthAbsDiffM, pctDiff: v.stepLengthPctDiff }]));
  writeFileSync(path.join(OUT_DIR, "step-length-deltas.json"), JSON.stringify(stepLengthDeltas, null, 2));
  const peakVelocityDeltas = Object.fromEntries(Object.entries(dualModeComparison).map(([k, v]) => [k, { legacyMps: v.legacyPeakVelocityMps, canonicalMps: v.canonicalPeakVelocityMps, absDiffMps: v.peakVelocityAbsDiffMps, pctDiff: v.peakVelocityPctDiff }]));
  writeFileSync(path.join(OUT_DIR, "peak-velocity-deltas.json"), JSON.stringify(peakVelocityDeltas, null, 2));

  const provenanceAudit = Object.fromEntries(Object.entries(BENCHMARKS).map(([label]) => [label, {
    legacyModelVersionField: legacyBaseline[label].measurementModelVersion,
    canonicalModelVersionField: canonicalResults[label].measurementModelVersion,
  }]));
  writeFileSync(path.join(OUT_DIR, "provenance-audit.json"), JSON.stringify(provenanceAudit, null, 2));

  // Determinism: rerun CANONICAL_LONGITUDINAL for all 4 a second time.
  const rerunCanonical = {};
  for (const [label, { pose: posePath }] of Object.entries(BENCHMARKS)) {
    const seq = JSON.parse(readFileSync(path.join(root, posePath), "utf8"));
    const rawFrames = seq.frames.map((f) => {
      const landmarks = [];
      for (const [i, key] of MP_INDEX_TO_JOINT) {
        const kp = f.keypoints?.[key];
        if (kp) landmarks[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score };
      }
      return { frame: f.index, sourceFrameIndex: f.sourceFrameIndex, time: f.tMs / 1000, landmarks, boxOrigin: f.boxOrigin, trackState: f.trackState, identityContinuityScore: f.identityContinuityScore };
    });
    const baseFrames = buildOverlayFrames({ fps: seq.fps, width: seq.width, height: seq.height, backend: "mediapipe", frames: rawFrames });
    const overlayFrames = applyFpsOverride(baseFrames, normalizeFps(seq.fps));
    const gates = JSON.parse(readFileSync(path.join(root, "tmp/phaseR4A", `calibration-gates-${label}.json`), "utf8"));
    const manualPoints = gatesToManualPoints(gates);
    const canonical = computeSprintMeasurements(overlayFrames, manualPoints, seq.width, seq.height, {
      gates, cameraEvidence: undefined, measurementModelVersion: MEASUREMENT_MODEL_CANONICAL_LONGITUDINAL,
    });
    rerunCanonical[label] = summarize(canonical);
  }
  const firstHash = crypto.createHash("sha256").update(JSON.stringify(canonicalResults)).digest("hex");
  const secondHash = crypto.createHash("sha256").update(JSON.stringify(rerunCanonical)).digest("hex");
  const determinismManifest = {
    firstRunSha256: firstHash,
    secondRunSha256: secondHash,
    deterministic: firstHash === secondHash,
  };
  writeFileSync(path.join(OUT_DIR, "determinism-manifest.json"), JSON.stringify(determinismManifest, null, 2));
  console.log(`\ndeterministic=${determinismManifest.deterministic} sha256=${firstHash}`);
  console.log(`Wrote all tmp/phaseR4B deliverables.`);
}

main().finally(() => {
  Module._resolveFilename = origResolve;
  rmSync(out, { recursive: true, force: true });
});
