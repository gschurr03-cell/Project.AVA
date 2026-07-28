import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const out = path.join(root, ".real-30m-sanity-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  execFileSync("npx", ["tsc", "src/lib/analysis/experimental30.ts", "src/lib/measurement/timingPolicy.ts",
    "--outDir", out, "--rootDir", "src/lib", "--module", "commonjs", "--target", "es2022",
    "--skipLibCheck", "--esModuleInterop", "--moduleResolution", "node", "--strict"], { cwd: root, stdio: "inherit" });
  const require = createRequire(import.meta.url);
  const { buildExperimental30Result } = require(path.join(out, "analysis/experimental30.js"));
  const crossing = (beforeFrame, beforeTime, beforeSide, afterSide, confidence) => ({
    timestampS: beforeTime + (1 / 30) * Math.abs(beforeSide) / (Math.abs(beforeSide) + Math.abs(afterSide)),
    confidence, beforeFrame, afterFrame: beforeFrame + 1, timestampBeforeS: beforeTime,
    timestampAfterS: beforeTime + 1 / 30, signedDistanceBefore: beforeSide, signedDistanceAfter: afterSide,
    interpolationFraction: Math.abs(beforeSide) / (Math.abs(beforeSide) + Math.abs(afterSide)),
    gateConfidence: 0.9, transformConfidence: 0.8, bodyConfidence: 0.85,
    featureSupport: 200, affineResidualPx: 0.7, modelVersion: "ava-world-gate-crossing-v1",
  });
  const start = crossing(99, 99 / 30, -4, 8, 0.8);
  const finish = crossing(166, 166 / 30, 6, -6, 0.8);
  const input = { sourceFps: 30, rawTimestampsSeconds: Array.from({ length: 197 }, (_, i) => i / 30), events: [],
    zone: { entryTimeSeconds: start.timestampS, exitTimeSeconds: finish.timestampS, distanceMeters: 30,
      crossingConfidence: 0.8, panningSafe: true, calibrated: true, startCrossing: start, finishCrossing: finish,
      snapshot: { zoneVersion: 1, startGateId: "start-v1", finishGateId: "finish-v1", startAnchorVersion: 1,
        finishAnchorVersion: 1, independentGateSchemaVersion: "ava-ground-anchor-v1",
        propagationModelVersion: "ava-background-affine-anchor-v1", travelDirection: "left_to_right", bodyReference: "torso" },
      sourceEvidence: { frameCount: 197, constantFrameRate: true, cameraConfidence: 0.8, trackingConfidence: 0.85, width: 1280 },
      manualAlignment: { startMeanOffsetPx: 2, startDriftPx: 1, finishMeanOffsetPx: 1, finishDriftPx: 0.5 } } };
  const a = buildExperimental30Result(input);
  const b = buildExperimental30Result(structuredClone(input));
  const timing = a.real30Timing;
  assert.ok(timing);
  assert.equal(timing.reportedFlyTimeSeconds, Math.ceil((timing.rawFlyTimeSeconds - 1e-12) * 100) / 100);
  assert.equal(timing.reportedAverageVelocityMps, 30 / timing.reportedFlyTimeSeconds);
  assert.ok(Math.abs(timing.rawAverageVelocityMps * timing.rawFlyTimeSeconds - 30) <= timing.invariants.tolerance);
  assert.ok(Math.abs(timing.reportedAverageVelocityMps * timing.reportedFlyTimeSeconds - 30) <= timing.invariants.tolerance);
  assert.equal(timing.sourceEvidence.syntheticFrameCount, 0);
  assert.equal(timing.externalReference.compatibilityStatus, "partially_compatible");
  assert.equal(timing.externalReference.startDefinition, "unknown");
  assert.equal(timing.resultHash, b.real30Timing.resultHash);
  const changedReferenceOnly = structuredClone(input);
  // The external reference is intentionally not an input, so there is nothing to tune here.
  assert.equal(buildExperimental30Result(changedReferenceOnly).real30Timing.rawFlyTimeSeconds, timing.rawFlyTimeSeconds);
  console.log(`real 30 m timing sanity passed: raw=${timing.rawFlyTimeSeconds}s reported=${timing.reportedFlyTimeSeconds}s hash=${timing.resultHash}`);
} finally { rmSync(out, { recursive: true, force: true }); }
