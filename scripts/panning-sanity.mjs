import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, ".panning-sanity-tmp");
const require = createRequire(import.meta.url);
let ok = true;
const check = (label, condition) => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) ok = false;
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  const tsconfig = path.join(out, "tsconfig.json");
  writeFileSync(tsconfig, JSON.stringify({
    compilerOptions: { outDir: out, rootDir: path.join(root, "src/lib"), module: "commonjs", target: "es2022", moduleResolution: "node", esModuleInterop: true, skipLibCheck: true, strict: true, baseUrl: root, paths: { "@/*": ["src/*"] } },
    files: [
      path.join(root, "src/lib/video/recordingMode.ts"),
      path.join(root, "src/lib/calibration/cameraTracking.ts"),
    ],
  }));
  execFileSync("npx", ["tsc", "-p", tsconfig], { cwd: root, stdio: "inherit" });
  const { classifyRecordingMode, metricTrustForRecording } = require(path.join(out, "video/recordingMode.js"));
  const tracking = require(path.join(out, "calibration/cameraTracking.js"));

  const evidence = ({ translation = 0, rotation = 0, scale = 1, confidence = 0.9, residual = 0.5, tracked = 1, features = 80 } = {}) => ({
    cameraMotionModelVersion: "ava-background-world-v2",
    dynamicCropVersion: "ava-mediapipe-roi-v1",
    athleteTrackingVersion: "ava-single-pose-continuity-v1",
    transforms: Array.from({ length: 60 }, (_, frame) => ({ frame, translationX: translation, translationY: 0, rotationDeg: rotation, scale, confidence, supportingFeatureCount: features, inlierRatio: confidence, residualPx: residual })),
    athleteTrack: Array.from({ length: 60 }, (_, frame) => ({ frame, boundingBox: frame / 60 < tracked ? { x: .3, y: .1, width: .2, height: .7 } : null, cropBox: { x: .2, y: 0, width: .6, height: .6 }, detectionConfidence: frame / 60 < tracked ? .9 : 0, cropConfidence: frame / 60 < tracked ? .9 : .25, cropSource: frame / 60 < tracked ? "direct" : "interpolated", partiallyCropped: false })),
    trackingLossRanges: tracked < 1 ? [{ startFrame: Math.ceil(60 * tracked), endFrame: 59 }] : [],
    unstableFrameRanges: [],
  });

  const stat = classifyRecordingMode(evidence());
  check("true static evidence routes to static_precision", stat.recordingMode === "static_precision");
  const pan = classifyRecordingMode(evidence({ translation: .004 }));
  check("smooth horizontal pan is classified independently", pan.recordingMode === "smooth_pan");
  check("smooth pan does not fabricate calibrated spatial eligibility", metricTrustForRecording("spatial", pan, true).status === "withheld");
  check("technique geometry remains available under a well-tracked pan", metricTrustForRecording("geometry", pan, false).status === "available");
  const zoom = classifyRecordingMode(evidence({ translation: .004, scale: 1.04 }));
  check("gradual zoom is detected", zoom.recordingMode === "pan_with_zoom" && zoom.spatialMetricEligibility === "withheld");
  const abrupt = classifyRecordingMode(evidence({ translation: .004, scale: 1.08 }));
  check("abrupt zoom is distinguished", abrupt.zoomClassification === "abrupt_zoom");
  const shake = classifyRecordingMode(evidence({ translation: .004, rotation: 2, residual: 6 }));
  check("shake/rotation lowers mode to unstable_pan", shake.recordingMode === "unstable_pan");
  const lost = classifyRecordingMode(evidence({ translation: .004, tracked: .4 }));
  check("long athlete loss fails closed", lost.recordingMode === "athlete_tracking_lost" && metricTrustForRecording("geometry", lost, false).status === "withheld");
  const blank = classifyRecordingMode(evidence({ translation: .004, features: 2, confidence: 0 }));
  check("low-background-feature recording is unsupported", blank.recordingMode === "unsupported_recording");
  check("classification and camera algorithms are versioned", stat.recordingModeVersion === "ava-recording-mode-v1" && stat.cameraMotionModelVersion === "ava-background-world-v2");

  const summary = tracking.summarizeCameraTracking(pan.recordingMode ? evidence({ translation: .004 }) : null);
  check("panning tracking summary preserves feature/inlier evidence",
    summary?.transformCount === 59 && summary.meanFeatureCount === 80
    && Math.abs(summary.meanInlierRatio - .9) < 1e-12);
  check("reliable panning evidence can be confirmed", tracking.panningTrackingCanBeConfirmed(summary));
  const shortLoss = evidence({ translation: .004 });
  for (let i = 20; i <= 25; i += 1) shortLoss.transforms[i].confidence = .1;
  const shortSummary = tracking.summarizeCameraTracking(shortLoss);
  check("six-frame (100 ms) degradation is surfaced but remains within strict hold tolerance",
    shortSummary.longestLostRunFrames === 6 && tracking.panningTrackingCanBeConfirmed(shortSummary));
  const longLoss = evidence({ translation: .004 });
  for (let i = 20; i <= 26; i += 1) longLoss.transforms[i].confidence = .1;
  const longSummary = tracking.summarizeCameraTracking(longLoss);
  check("tracking loss beyond tolerance fails closed",
    longSummary.longestLostRunFrames === 7 && !tracking.panningTrackingCanBeConfirmed(longSummary)
    && tracking.cameraTrackingStateAt(longLoss, 26) === "lost");
  const movingAthlete = evidence({ translation: .004 });
  movingAthlete.athleteTrack.forEach((item, frame) => {
    item.boundingBox.x = frame / movingAthlete.athleteTrack.length;
  });
  check("athlete motion is not an input to background-transform reliability",
    tracking.summarizeCameraTracking(movingAthlete).reliabilityRatio === summary.reliabilityRatio);

  // --- Regression: camera MODE and tracking QUALITY must never collapse into one
  // misleading label (the "Static camera" bug: a panning session with no camera
  // evidence yet silently read back as stationary).
  check("missing camera evidence is a distinct 'unavailable' state, not 'initializing'",
    tracking.cameraTrackingStateAt(undefined, 5) === "unavailable"
    && tracking.cameraTrackingStateAt(null, 5) === "unavailable");
  check("missing evidence does not collapse to a stationary-sounding state",
    tracking.cameraTrackingStateAt(undefined, 5) !== "initializing");
  check("the reference frame itself (frame 0) with real evidence is 'initializing', not 'unavailable'",
    tracking.cameraTrackingStateAt(evidence({ translation: .004 }), 0) === "initializing");
  check("trackingStateLabel covers every state with a distinct, non-'Static' string",
    tracking.trackingStateLabel("locked") === "Locked"
    && tracking.trackingStateLabel("degraded") === "Degraded"
    && tracking.trackingStateLabel("lost") === "Lost"
    && tracking.trackingStateLabel("unavailable") === "Unavailable"
    && tracking.trackingStateLabel("initializing") === "Initializing"
    && ["locked", "degraded", "lost", "unavailable", "initializing"]
      .every((s) => tracking.trackingStateLabel(s) !== "Static camera"));
  check("cameraModeLabel reflects camera TYPE only — panning is never labeled stationary/static",
    tracking.cameraModeLabel("panning") === "Panning camera"
    && tracking.cameraModeLabel("stationary") === "Stationary camera"
    && !tracking.cameraModeLabel("panning").toLowerCase().includes("static")
    && !tracking.cameraModeLabel("panning").toLowerCase().includes("stationary"));
} finally {
  rmSync(out, { recursive: true, force: true });
}

console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
process.exit(ok ? 0 : 1);
