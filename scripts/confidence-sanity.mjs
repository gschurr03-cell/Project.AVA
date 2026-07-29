import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".confidence-sanity-tmp");
const require = createRequire(import.meta.url);
let ok = true;
const check = (label, condition) => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) ok = false;
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  const config = path.join(out, "tsconfig.json");
  writeFileSync(config, JSON.stringify({
    compilerOptions: {
      outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022",
      strict: true, skipLibCheck: true, moduleResolution: "node",
    },
    files: [
      path.join(root, "src/lib/confidence/types.ts"),
      path.join(root, "src/lib/confidence/engine.ts"),
    ],
  }));
  execFileSync("npx", ["tsc", "-p", config], { cwd: root, stdio: "inherit" });
  const { calculateMetricConfidence, withConfidence } = require(path.join(out, "lib/confidence/engine.js"));
  const strong = {
    trackingContinuity: .98, missingPoseFraction: .01, interpolationFraction: .01,
    cameraMotionStability: .96, calibrationCertainty: .97, frameTimingStability: .98,
    occlusionFraction: .01, roiStability: .96, poseVisibility: .95, skeletonConfidence: .94,
    eventDetectionConfidence: .96, sampleSufficiency: 1, algorithmAgreement: .97,
    fps: 120, athleteFillFraction: .3,
  };
  const first = calculateMetricConfidence("peak_velocity", strong);
  const repeated = calculateMetricConfidence("peak_velocity", strong);
  check("identical input is byte-for-byte deterministic", JSON.stringify(first) === JSON.stringify(repeated));
  check("confidence is bounded", first.score >= 0 && first.score <= 100);
  check("strong observable evidence produces high confidence", first.level === "high");

  const weak = calculateMetricConfidence("contact_time", {
    ...strong, trackingContinuity: .45, frameTimingStability: .3, eventDetectionConfidence: .4,
    occlusionFraction: .4, fps: 24, athleteFillFraction: .05,
  });
  check("weak evidence lowers confidence", weak.score < first.score && weak.level === "low");
  check("contextual warnings name cause and recording improvement",
    weak.qualityFlags.length > 0 && weak.qualityFlags.every((flag) => flag.why && flag.improvement));

  const metricIds = [
    "velocity", "peak_velocity", "average_velocity", "contact_time", "flight_time",
    "stride_length", "cadence", "step_frequency", "asymmetry", "acceleration",
    "timing_gate", "knee_flexion", "trunk_lean", "sprint_intelligence",
  ];
  check("every supported metric receives the full confidence contract",
    metricIds.every((id) => {
      const metric = withConfidence(id, 1, strong);
      return metric.confidence && metric.confidenceReason.length &&
        metric.measurementVersion === "ava-measurement-confidence-v1";
    }));
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);

