// Day 94 audit — deterministic tests for the timing-verification fix
// (src/lib/benchmark/measurements.ts, trustedMetrics.ts, PerformanceSummaryCard.tsx,
// overlayAvailability.ts). A real 240 FPS stationary-camera session with heavy
// athlete-tracking loss previously reported a fabricated ~8s zone time (real
// ground truth 2.197s) and an unconditional "Verified Performance" label with
// zero verified metrics. These tests prove the fix directly, with synthetic
// (not hardcoded-truth) data — see also the existing suites this run also
// exercises: world-lock-sanity, zone-anchor-sanity, independent-gates-sanity,
// gate-lock-smoothing-sanity (camera-side); analysis-fps-sanity (regression).
//
//   node scripts/timing-verification-sanity.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".timing-verification-sanity-tmp");
let ok = true;
const check = (label, condition) => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) ok = false;
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const orig = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return orig.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};
writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
  compilerOptions: {
    outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022",
    skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node",
    jsx: "react-jsx", baseUrl: root, paths: { "@/*": ["src/*"] },
  },
  files: [
    path.join(root, "src/lib/benchmark/measurements.ts"),
    path.join(root, "src/lib/intelligence/trustedMetrics.ts"),
    path.join(root, "src/app/sessions/[id]/PerformanceSummaryCard.tsx"),
    path.join(root, "src/lib/video/overlayAvailability.ts"),
  ],
}));

try {
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { computeSprintMeasurements } = require(path.join(out, "lib/benchmark/measurements.js"));
  const { buildTrustedMetrics } = require(path.join(out, "lib/intelligence/trustedMetrics.js"));
  const { deriveSprintResultState } = require(path.join(out, "app/sessions/[id]/PerformanceSummaryCard.js"));
  const { hasRenderablePoseData, overlayLayerAvailable, effectiveOverlayToggles } =
    require(path.join(out, "lib/video/overlayAvailability.js"));

  const W = 1920, H = 1080;
  const POINTS = { ax: 0.1, ay: 0.7, bx: 0.9, by: 0.7, distanceM: 20 };
  const torsoFrame = (index, t, x, y = 0.7) => ({
    frame: index, sourceFrameIndex: index, time: t,
    landmarks: {
      leftShoulder: { x, y: y - 0.05, visibility: 0.9 },
      rightShoulder: { x, y: y - 0.04, visibility: 0.9 },
      leftHip: { x, y: y + 0.05, visibility: 0.9 },
      rightHip: { x, y: y + 0.04, visibility: 0.9 },
    },
    angles: {}, centerOfMass: null, velocity: null, footContact: { left: false, right: false },
    trackingConfidence: 0.9,
  });

  // --- 4/5/6. Torso tracked but never crosses either gate: no bracket, no
  // usable extrapolation slope (stationary near center) → zone time must be
  // unavailable — NOT the pose-visible span (5s) and NOT any notion of "video
  // duration" (computeSprintMeasurements never even receives one). -----------
  const stationaryFrames = Array.from({ length: 60 }, (_, i) => torsoFrame(i, i * (5 / 59), 0.5));
  const mStationary = computeSprintMeasurements(stationaryFrames, POINTS, W, H, {});
  check("4. missing crossing → zoneTimeS unavailable (not fabricated)", mStationary.zoneTimeS === null);
  check("4. timingProvenance.verified is false when no crossing is found", mStationary.timingProvenance.verified === false);
  check("4. a structured timingAvailabilityReason is reported", typeof mStationary.timingProvenance.timingAvailabilityReason === "string");
  check(
    "5. pose-visibility duration (5s) never becomes the reported zone time",
    mStationary.zoneTimeS !== 5 && mStationary.reportedZoneTimeS !== 5,
  );
  check(
    "6. an arbitrary 'video duration' value can never surface as zoneTimeS (no such input exists)",
    mStationary.zoneTimeS !== 9.803333 && Object.keys(mStationary).every((k) => !/videoDuration|clipDuration/i.test(k)),
  );

  // --- Positive control + 7. Native high-fps crossing timestamps use the
  // frames' own real timestamps (not a re-derived assumed-fps clock). A clean
  // torso path bracketing both gates at true 240 FPS spacing (~4.1667ms). ----
  const FPS240 = 239.976;
  const N = 200;
  const nativeFrames = Array.from({ length: N }, (_, i) => {
    const t = i / FPS240;
    const x = 0.02 + (0.98 - 0.02) * (i / (N - 1)); // sweeps left(0.02) -> right(0.98)
    return torsoFrame(i, t, x);
  });
  const mNative = computeSprintMeasurements(nativeFrames, POINTS, W, H, { gates: { travelDirection: "left_to_right" } });
  check("verified genuine bracket crossing produces a zone time", mNative.zoneTimeS != null);
  check("verified crossing is marked verified with no availability reason", mNative.timingProvenance.verified === true && mNative.timingProvenance.timingAvailabilityReason === null);
  check("crossingDetectionMethod records how timing was established", mNative.timingProvenance.crossingDetectionMethod === "screen_fixed_interpolated");
  // Hand-computed expected crossing time at x=0.1: linear interpolation between
  // the two real bracketing frames' own timestamps (native 240 FPS spacing).
  const dxPerFrame = (0.98 - 0.02) / (N - 1);
  const startFrameIdx = Math.floor((0.1 - 0.02) / dxPerFrame);
  const xBefore = 0.02 + dxPerFrame * startFrameIdx, xAfter = 0.02 + dxPerFrame * (startFrameIdx + 1);
  const frac = (0.1 - xBefore) / (xAfter - xBefore);
  const expectedStartT = (startFrameIdx / FPS240) + frac * ((startFrameIdx + 1) / FPS240 - startFrameIdx / FPS240);
  check(
    `7. verified start-crossing timestamp matches hand-computed native-240fps interpolation (${mNative.timingProvenance.startCrossingTimestampS?.toFixed(6)} ≈ ${expectedStartT.toFixed(6)})`,
    Math.abs(mNative.timingProvenance.startCrossingTimestampS - expectedStartT) < 1e-6,
  );
  check("startCrossingFrame/finishCrossingFrame are populated for a verified crossing", mNative.timingProvenance.startCrossingFrame != null && mNative.timingProvenance.finishCrossingFrame != null);

  // --- buildTrustedMetrics: zoneTimeS is only ever exposed when verified. ---
  const trustedStationary = buildTrustedMetrics(mStationary);
  check("buildTrustedMetrics never leaks an unverified zoneTimeS", trustedStationary.zoneTimeS === null);
  check("buildTrustedMetrics surfaces the timingAvailabilityReason", typeof trustedStationary.timingAvailabilityReason === "string");
  const trustedNative = buildTrustedMetrics(mNative);
  check("buildTrustedMetrics exposes zoneTimeS once verified", trustedNative.zoneTimeS === mNative.zoneTimeS);

  // --- 10. Result-state: "Verified Performance" cannot render with zero
  // verified core metrics and unverified timing.
  //
  // Day 98 update: `deriveSprintResultState` no longer takes a `recordingMode`
  // argument — recordingMode-driven withholding (including the exact
  // "athlete_tracking_lost" case this suite used to assert here) now happens
  // upstream, per metric, inside `evaluateMetricEvidence`
  // (@/lib/intelligence/metricEvidence) before a value ever reaches this
  // object. That upstream behavior — including the panning-safety boundary —
  // is covered by `scripts/measurement-recovery-sanity.mjs`. This function is
  // now purely a function of the already-resolved trusted metrics: if all
  // five are non-null here, their own evidence already passed. -------------
  const allNull = { avgStrideLengthM: null, peakStrideLengthM: null, frequencyHz: null, avgVelocityMps: null, topSpeedMps: null, zoneTimeS: null, zoneDistanceM: 20, timingAvailabilityReason: "crossing_extrapolated_not_verified" };
  check("10. zero verified metrics + unverified timing -> 'unavailable', never 'verified'", deriveSprintResultState(allNull) === "unavailable");
  const allFive = { avgStrideLengthM: 2.1, peakStrideLengthM: 2.2, frequencyHz: 4.8, avgVelocityMps: 10.3, topSpeedMps: 10.7, zoneTimeS: 1.94, zoneDistanceM: 20, timingAvailabilityReason: null };
  check("10. all five metrics + verified timing -> 'verified'", deriveSprintResultState(allFive) === "verified");
  const some = { ...allFive, topSpeedMps: null };
  check("10. some (not all) metrics present -> 'partial', never 'verified'", deriveSprintResultState(some) === "partial");

  // --- 9. Overlay controls: disabled when the underlying artifact has no
  // renderable pose data; enabled when it does. ------------------------------
  const emptyFrames = [{ landmarks: {} }, { landmarks: {} }];
  const populatedFrames = [{ landmarks: { nose: { x: 0.5, y: 0.5, visibility: 0.8 } } }];
  check("9. no tracked landmarks anywhere -> hasRenderablePoseData is false", hasRenderablePoseData(emptyFrames) === false);
  check("9. at least one tracked landmark -> hasRenderablePoseData is true", hasRenderablePoseData(populatedFrames) === true);
  check("9. pose-dependent layer (skeleton) is unavailable with no pose data", overlayLayerAvailable("skeleton", { hasPoseData: false, hasStepMarkData: false }) === false);
  check("9. pose-dependent layer (skeleton) is available once pose data exists", overlayLayerAvailable("skeleton", { hasPoseData: true, hasStepMarkData: false }) === true);
  check("9. contacts layer gated independently on real contact count", overlayLayerAvailable("contacts", { hasPoseData: true, hasStepMarkData: false }) === false);
  const forcedOn = { skeleton: true, joint_angles: true, step_numbers: true, contacts: true, center_of_mass: true, velocity: true, gates: true, zones: true, tracking_box: true, crop_box: true, pose_diagnostics: true, camera_motion_debug: true };
  const effective = effectiveOverlayToggles(forcedOn, { hasPoseData: false, hasStepMarkData: false });
  check(
    "9. a checkbox 'checked' with no data never reaches the renderer as ON (Skeleton/COM/Velocity/Joint angles all forced off)",
    !effective.skeleton && !effective.joint_angles && !effective.center_of_mass && !effective.velocity && !effective.contacts && !effective.step_numbers,
  );

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
