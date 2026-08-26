// Phase R4A -- canonical longitudinal measurement model audit. Calls the
// REAL, unmodified production computeSprintMeasurements() (and the real
// gates.ts / zoneStepAnalysis.ts helpers) against the real stored pose
// artifacts + real DB calibration_gates for all 4 protected benchmarks,
// using the SAME real-function-compilation technique established in
// phase-r3a-missing-contact-trace.mjs / phase-r3d-contact-detector-replay.mjs.
// Read-only: never mutates the DB, never writes to Storage.
//
//   node scripts/phase-r4a-canonical-measurement-model-audit.mjs
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import crypto from "node:crypto";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(root, "tmp/phaseR4A");
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

const out = path.join(root, ".r4a-tmp-compile");
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
  const { gateMidpoint, gatesToManualPoints } = require(path.join(out, "lib/calibration/gates.js"));
  const { analyzeZoneSteps } = require(path.join(out, "lib/video/zoneStepAnalysis.js"));

  const results = {};
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

    // Real DB calibration_gates -- fetched separately this phase (read-only
    // REST GET), embedded here as literal data (no live DB call inside this
    // script, so results are reproducible without network dependency).
    const gatesPath = path.join(OUT_DIR, `calibration-gates-${label}.json`);
    const gates = JSON.parse(readFileSync(gatesPath, "utf8"));
    const manualPoints = gatesToManualPoints(gates);

    // REAL PRODUCTION invocation (src/app/sessions/[id]/page.tsx): cameraEvidence
    // is passed ONLY when calibrationCameraType === "panning". All 4 protected
    // benchmarks are "stationary" -- so real production omits cameraEvidence,
    // which (per computeSprintMeasurements' own guard) disables the canonical
    // zoneStepSummary/world-anchored crossing path entirely, regardless of
    // startBoundary/finishBoundary being present in calibration_gates.
    const productionMeasurements = computeSprintMeasurements(overlayFrames, manualPoints, seq.width, seq.height, {
      gates,
      cameraEvidence: undefined,
    });

    // DIAGNOSTIC COUNTERFACTUAL ONLY (Part F/N) -- the SAME real, pure function
    // called with cameraEvidence force-supplied, to observe what the ALREADY-
    // IMPLEMENTED canonical longitudinal path (zoneStepAnalysis.ts) would
    // produce for this same real data. This does NOT change production (no
    // file written, no DB touched) -- it is the exact mechanism this whole
    // phase exists to evaluate.
    const canonicalCounterfactual = computeSprintMeasurements(overlayFrames, manualPoints, seq.width, seq.height, {
      gates,
      cameraEvidence: seq.cameraEvidence,
    });

    // Direct analyzeZoneSteps() call for Part D's raw axis-math proof (u
    // vector, s(S)=0, s(F)=zoneLength), independent of the full measurement
    // pipeline -- uses the REAL gate midpoints exactly as gates.ts computes
    // them.
    const startMid = gateMidpoint(gates.startGate);
    const finishMid = gateMidpoint(gates.finishGate);
    const dx = finishMid.x - startMid.x, dy = finishMid.y - startMid.y;
    const axisSpan = Math.hypot(dx, dy);
    const u = { x: dx / axisSpan, y: dy / axisSpan };
    const sOfPoint = (p) => (((p.x - startMid.x) * u.x + (p.y - startMid.y) * u.y) / axisSpan) * gates.distanceM;

    results[label] = {
      sessionId,
      realGates: { startGate: gates.startGate, finishGate: gates.finishGate, distanceM: gates.distanceM, travelDirection: gates.travelDirection, cameraType: gates.cameraType },
      startMidpoint: startMid,
      finishMidpoint: finishMid,
      axisSpanNormalized: axisSpan,
      runningAxisU: u,
      sOfStartMidpointM: sOfPoint(startMid),
      sOfFinishMidpointM: sOfPoint(finishMid),
      production: {
        calibrated: productionMeasurements.calibrated,
        metersPerPixel: productionMeasurements.metersPerPixel,
        zoneStepSummaryActive: productionMeasurements.zoneStepSummary != null,
        totalContacts: productionMeasurements.totalContacts,
        validContacts: productionMeasurements.validContacts,
        avgZoneStepLengthM: productionMeasurements.avgZoneStepLengthM,
        avgIndividualStepLengthM: productionMeasurements.avgIndividualStepLengthM,
        peakStrideLengthM: productionMeasurements.peakStrideLengthM,
        leftStepLengthM: productionMeasurements.leftStepLengthM,
        rightStepLengthM: productionMeasurements.rightStepLengthM,
        individualStepLengthsM: productionMeasurements.individualStepLengthsM,
        combinedStepFrequencyHz: productionMeasurements.combinedStepFrequencyHz,
        leftStepFrequencyHz: productionMeasurements.leftStepFrequencyHz,
        rightStepFrequencyHz: productionMeasurements.rightStepFrequencyHz,
        zoneTimeS: productionMeasurements.zoneTimeS,
        zoneEntryTimeS: productionMeasurements.zoneEntryTimeS,
        zoneExitTimeS: productionMeasurements.zoneExitTimeS,
        zoneVelocityMps: productionMeasurements.zoneVelocityMps,
        maxVelocityMps: productionMeasurements.maxVelocityMps,
        velocities: productionMeasurements.velocities,
        zoneSteps: productionMeasurements.zoneSteps,
        timingProvenance: productionMeasurements.timingProvenance,
      },
      canonicalCounterfactual: {
        zoneStepSummaryActive: canonicalCounterfactual.zoneStepSummary != null,
        avgIndividualStepLengthM: canonicalCounterfactual.avgIndividualStepLengthM,
        leftStepLengthM: canonicalCounterfactual.leftStepLengthM,
        rightStepLengthM: canonicalCounterfactual.rightStepLengthM,
        individualStepLengthsM: canonicalCounterfactual.individualStepLengthsM,
        combinedStepFrequencyHz: canonicalCounterfactual.combinedStepFrequencyHz,
        maxVelocityMps: canonicalCounterfactual.maxVelocityMps,
        zoneVelocityMps: canonicalCounterfactual.zoneVelocityMps,
        zoneTimeS: canonicalCounterfactual.zoneTimeS,
        zoneStepSummary: canonicalCounterfactual.zoneStepSummary,
      },
    };
    console.log(`${label}: s(start)=${sOfPoint(startMid).toFixed(6)}m s(finish)=${sOfPoint(finishMid).toFixed(6)}m (zone=${gates.distanceM}m) | production zoneStepSummaryActive=${productionMeasurements.zoneStepSummary != null} avgIndividualStepLengthM=${productionMeasurements.avgIndividualStepLengthM} | canonicalCounterfactual avgIndividualStepLengthM=${canonicalCounterfactual.avgIndividualStepLengthM}`);
  }

  const manifestPath = path.join(OUT_DIR, "contact-longitudinal-manifest.json");
  writeFileSync(manifestPath, JSON.stringify(results, null, 2));
  const sha256 = crypto.createHash("sha256").update(readFileSync(manifestPath)).digest("hex");
  writeFileSync(path.join(OUT_DIR, "contact-longitudinal-manifest.sha256"), sha256 + "\n");
  console.log(`\nWrote ${manifestPath}\nSHA-256: ${sha256}`);
}

main().finally(() => {
  Module._resolveFilename = origResolve;
  rmSync(out, { recursive: true, force: true });
});
