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
    compilerOptions: { outDir: out, rootDir: path.join(root, "src/lib"), module: "commonjs", target: "es2022", moduleResolution: "node", esModuleInterop: true, skipLibCheck: true, strict: true },
    files: [path.join(root, "src/lib/video/recordingMode.ts")],
  }));
  execFileSync("npx", ["tsc", "-p", tsconfig], { cwd: root, stdio: "inherit" });
  const { classifyRecordingMode, metricTrustForRecording } = require(path.join(out, "video/recordingMode.js"));

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
} finally {
  rmSync(out, { recursive: true, force: true });
}

console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
process.exit(ok ? 0 : 1);
