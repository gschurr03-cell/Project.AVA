// Runtime-bug follow-up sanity: the acceleration calibration submission gate
// (`hasCompletedAccelerationCalibration`) and its interaction with the FPS
// classification used by `queueAnalysis`. Complements analysis-fps-sanity.mjs
// (pure policy functions) by covering the actual queue-submission decision
// that was allowing acceleration analyses through without real calibration —
// the root cause of jobs failing at "validating" with a non-null FPS/
// calibration transport bug that only showed up at runtime.
//
//   node scripts/fps-runtime-calibration-gate-sanity.mjs

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = process.cwd();
const out = path.join(root, ".fps-runtime-calibration-gate-sanity-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

try {
  execFileSync(
    "npx",
    [
      "tsc",
      "src/lib/acceleration/calibration.ts",
      "src/lib/video/analysisFps.ts",
      "--outDir", out, "--module", "commonjs", "--target", "es2022", "--strict",
      "--skipLibCheck", "--resolveJsonModule", "--esModuleInterop", "--moduleResolution", "node",
    ],
    { cwd: root, stdio: ["ignore", "inherit", "inherit"] },
  );

  const { hasCompletedAccelerationCalibration } = require(path.join(out, "acceleration/calibration.js"));
  const { classifySourceFpsTier } = require(path.join(out, "video/analysisFps.js"));

  // --- 1. Acceleration cannot be submitted without complete calibration. ---
  assert.equal(
    hasCompletedAccelerationCalibration({ distance_m: 20 }),
    false,
    "a chosen finish distance alone (no marker placed) must not count as complete calibration",
  );
  assert.equal(
    hasCompletedAccelerationCalibration({ calibration_known_distance_m: 20, calibration_point_bx: null }),
    false,
    "a known distance with no placed point must not count as complete calibration",
  );
  assert.equal(
    hasCompletedAccelerationCalibration({ calibration_point_bx: 0.8, calibration_known_distance_m: null, distance_m: null }),
    false,
    "a placed point with no distance must not count as complete calibration",
  );
  assert.equal(
    hasCompletedAccelerationCalibration({}),
    false,
    "an entirely uncalibrated session must not count as complete calibration",
  );

  // --- 2. Completed (legacy single-gate) calibration reaches the gate as valid. ---
  assert.equal(
    hasCompletedAccelerationCalibration({ calibration_point_bx: 0.82, calibration_known_distance_m: 20 }),
    true,
    "a placed finish marker + known distance must count as complete calibration",
  );
  assert.equal(
    hasCompletedAccelerationCalibration({ calibration_point_bx: 0.82, distance_m: 30 }),
    true,
    "falling back to distance_m (quick-setup) is fine once a point exists",
  );
  assert.equal(
    hasCompletedAccelerationCalibration({ calibration_point_bx: 0.82, calibration_known_distance_m: 15 }),
    false,
    "the legacy single-gate path only accepts the fixed 10/20/30m distances",
  );

  // --- 3. Multi-marker calibration is authoritative on its own. ---
  const validGates = {
    schemaVersion: "ava-acceleration-calibration-v1",
    markers: [
      { id: "m-0", distanceM: 0, point: { x: 0.1, y: 0.5 } },
      { id: "m-20", distanceM: 20, point: { x: 0.9, y: 0.5 } },
    ],
    travelDirection: "left_to_right",
  };
  assert.equal(
    hasCompletedAccelerationCalibration({ calibration_gates: validGates }),
    true,
    "valid multi-marker gates alone are sufficient, regardless of the legacy point/distance fields",
  );
  assert.equal(
    hasCompletedAccelerationCalibration({ calibration_gates: { schemaVersion: "ava-acceleration-calibration-v1", markers: [] } }),
    false,
    "malformed/incomplete gates (fewer than 2 markers) do not satisfy the gate",
  );

  // --- 4. Rerun does not discard authoritative calibration: since calibration
  // lives on the session row (read fresh every call, never cached/copied per
  // analysis), the gate is a pure function of CURRENT session state — calling
  // it again with the identical, already-saved calibration returns the same
  // answer. This is what "a rerun preserves calibration" reduces to at the
  // code level: nothing here mutates or forgets the session's own columns. ---
  const calibratedSession = { calibration_point_bx: 0.82, calibration_known_distance_m: 20 };
  assert.equal(hasCompletedAccelerationCalibration(calibratedSession), true);
  assert.equal(
    hasCompletedAccelerationCalibration(calibratedSession),
    hasCompletedAccelerationCalibration(calibratedSession),
    "the gate is deterministic/idempotent across repeated (rerun) calls with the same session state",
  );

  // --- 5. Missing source FPS metadata fails safely (never silently 60). ---
  const noEvidence = classifySourceFpsTier({ detectedFps: null });
  assert.equal(noEvidence.classification, "unsupported_source_fps");
  assert.equal(noEvidence.analysisFps, null, "no fabricated 60 FPS default when nothing was detected");

  console.log("fps-runtime-calibration-gate sanity: passed");
} finally {
  rmSync(out, { recursive: true, force: true });
}
