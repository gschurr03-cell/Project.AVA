import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = process.cwd();
const out = path.join(root, ".acceleration-metrics-sanity-tmp");
const check = (label, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) process.exitCode = 1;
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        outDir: out,
        rootDir: path.join(root, "src"),
        module: "commonjs",
        target: "es2022",
        skipLibCheck: true,
        strict: true,
        baseUrl: root,
        paths: { "@/*": ["src/*"] },
      },
      files: [
        path.join(root, "src/lib/acceleration/metrics.ts"),
        path.join(root, "src/lib/acceleration/schema.ts"),
      ],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root });
  const original = Module._resolveFilename;
  Module._resolveFilename = function (request, ...args) {
    return original.call(
      this,
      request.startsWith("@/") ? path.join(out, request.slice(2)) : request,
      ...args,
    );
  };
  const { computeAccelerationMetrics } = require(path.join(out, "lib/acceleration/metrics.js"));
  const { accelerationMetricsSchema } = require(path.join(out, "lib/acceleration/schema.js"));

  const frames = Array.from({ length: 181 }, (_, frame) => {
    const time = frame / 60;
    const startTime = 20 / 60;
    const progress = Math.max(0, (time - startTime) / (3 - startTime));
    const x = 0.1 + 0.8 * progress ** 2;
    const point = (y) => ({ x, y, visibility: 1 });
    return {
      frame,
      time,
      centerOfMass: point(0.5),
      landmarks: {
        leftShoulder: point(0.35),
        rightShoulder: point(0.35),
        leftHip: point(0.55),
        rightHip: point(0.55),
        leftWrist: point(frame < 20 ? 0.9 : 0.72),
        rightWrist: point(frame < 20 ? 0.9 : 0.72),
        leftAnkle: point(0.9),
        rightAnkle: point(0.9),
        leftHeel: point(0.9),
        rightHeel: point(0.9),
        leftFootIndex: point(0.9),
        rightFootIndex: point(0.9),
        nose: point(0.2),
      },
      angles: {},
      velocity: null,
      footContact: { left: false, right: false },
    };
  });
  const metrics = computeAccelerationMetrics(frames, {
    finishX: 0.9,
    finishDistanceM: 30,
  });
  check(
    "acceleration t=0 is FIRST_DETECTED_MOVEMENT",
    metrics.startEvent.type === "FIRST_DETECTED_MOVEMENT" &&
      metrics.startEvent.frame >= 20 &&
      metrics.startEvent.timestamp === frames[metrics.startEvent.frame].time,
  );
  check(
    "first movement requires sustained frames and exposes diagnostics",
    metrics.startEvent.signal === "torso" &&
      metrics.startEvent.debug.candidates.torso.passed &&
      typeof metrics.startEvent.debug.candidates.torso.reason === "string",
  );
  const shoulderOnly = frames.map((frame) => ({
    ...frame,
    centerOfMass: null,
    landmarks: { ...frame.landmarks, leftHip: undefined, rightHip: undefined },
  }));
  const shoulderResult = computeAccelerationMetrics(shoulderOnly, {
    finishX: 0.9,
    finishDistanceM: 30,
  });
  check(
    "partial early pose falls back to shoulder and remains usable with warning",
    shoulderResult.startEvent.signal === "shoulder" &&
      shoulderResult.status === "ready_with_warning" &&
      shoulderResult.warnings.some((warning) => /shoulder fallback/.test(warning)),
  );
  check(
    "weak contacts leave stride metrics unavailable rather than fabricated",
    metrics.strideMetrics.status === "unavailable" &&
      metrics.strideMetrics.strideCount === null &&
      metrics.strideMetrics.averageStrideLengthM === null,
  );
  check(
    "calibrated 30m produces 10m, 20m, and 30m splits",
    metrics.splits.m10S > 0 &&
      metrics.splits.m20S > metrics.splits.m10S &&
      metrics.splits.m30S > metrics.splits.m20S,
  );
  const twenty = computeAccelerationMetrics(frames, {
    finishX: 0.9,
    finishDistanceM: 20,
  });
  check(
    "20m finish gate works without any start gate",
    ["ready", "ready_with_warning"].includes(twenty.status) &&
      twenty.splits.m20S > 0 &&
      twenty.splits.m10S === null &&
      twenty.runTime === twenty.splits.m20S &&
      twenty.segmentVelocities.length === 1,
  );
  check(
    "average velocity uses the farthest measured split",
    Math.abs(metrics.averageVelocityMps - 30 / metrics.splits.m30S) < 1e-9,
  );
  check(
    "velocity progression contains three observed 10m segments",
    metrics.segmentVelocities.length === 3 && metrics.segmentVelocities.every((s) => s.timeS > 0),
  );
  check("early acceleration is observed and positive", metrics.earlyAccelerationMps2 > 0);
  check(
    "peak velocity and distance-to-peak are measured inside zone",
    metrics.peakVelocity > 0 &&
      metrics.distanceToPeakVelocity >= 0 &&
      metrics.distanceToPeakVelocity <= 30,
  );
  const noCalibration = computeAccelerationMetrics(frames, null);
  check(
    "no calibration returns unavailable values rather than fabricated splits",
    noCalibration.splits.m10S === null && noCalibration.peakVelocity === null,
  );
  const source = readFileSync(path.join(root, "src/lib/acceleration/metrics.ts"), "utf8");
  check(
    "acceleration module is isolated from fly measurements",
    !source.includes("benchmark/measurements"),
  );
  check(
    "acceleration compile path has no fly types or video overlay imports",
    !/biomechanics\/types|video\/overlay|@\/lib\//.test(source) &&
      !/video\/overlay|@\/lib\//.test(
        readFileSync(path.join(root, "src/lib/acceleration/startEvent.ts"), "utf8"),
      ),
  );
  const flyTypes = readFileSync(path.join(root, "src/lib/biomechanics/types.ts"), "utf8");
  check("fly compile path does not import acceleration schema", !/acceleration/.test(flyTypes));
  const sessionPage = readFileSync(path.join(root, "src/app/sessions/[id]/page.tsx"), "utf8");
  check(
    "fly t=0 path remains unchanged",
    /session\.analysis_type === "fly" && overlayFrames\.length[\s\S]*computeSprintMeasurements/.test(
      sessionPage,
    ),
  );
  const sessionActions = readFileSync(path.join(root, "src/app/sessions/actions.ts"), "utf8");
  check(
    "acceleration cannot queue without a 10m, 20m, or 30m finish distance",
    /Set finish distance before running acceleration analysis/.test(sessionActions) &&
      /\[10, 20, 30\]\.includes/.test(sessionActions),
  );
  check(
    "acceleration result markers are passed to the normal overlay",
    /accelerationOverlayMarkers/.test(sessionPage) &&
      /accelerationMarkers=\{accelerationOverlayMarkers\}/.test(sessionPage),
  );
  const runner = readFileSync(
    path.join(root, "src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py"),
    "utf8",
  );
  const worker = readFileSync(path.join(root, "scripts/analysis-worker.mjs"), "utf8");
  check(
    "acceleration uses an internal detection crop",
    /analysis_type === "acceleration"[\s\S]*MEDIAPIPE_ACCELERATION/.test(worker) &&
      /ACCEL_START_ZOOM[\s\S]*side \/ ACCEL_START_ZOOM/.test(runner),
  );
  check(
    "detection crop maps landmarks back to display coordinates",
    /map the crop-normalized[\s\S]*back[\s\S]*FULL-FRAME normalized coordinates/i.test(runner),
  );
  const overlaySurface = readFileSync(
    path.join(root, "src/components/video/OverlaySurface.tsx"),
    "utf8",
  );
  check(
    "display auto-follow uses smooth look-ahead independently of analysis crop",
    /video\.currentTime \+ 0\.1/.test(overlaySurface) &&
      /anticipateFollowTarget/.test(overlaySurface),
  );
  const legacyZeros = {
    topSpeedMps: 0,
    avgStrideLengthM: 0,
    strideFrequencyHz: 0,
    groundContactTimeMs: 0,
    flightTimeMs: 0,
    peakKneeFlexionDeg: 0,
    avgTrunkLeanDeg: 0,
  };
  check(
    "acceleration primary result rejects the legacy fly zero shape",
    !accelerationMetricsSchema.safeParse(legacyZeros).success,
  );
  const review = computeAccelerationMetrics(
    frames.map((frame) => ({ ...frame, centerOfMass: null, landmarks: {} })),
    { finishX: 0.9, finishDistanceM: 30 },
  );
  check(
    "needs_review persists an explicit acceleration result without zero metrics",
    accelerationMetricsSchema.safeParse(review).success &&
      review.resultType === "acceleration" &&
      review.status === "needs_review" &&
      review.startEvent.type === "NEEDS_REVIEW" &&
      review.peakVelocity === null,
  );
  const panel = readFileSync(
    path.join(root, "src/app/sessions/[id]/AccelerationMetricsPanel.tsx"),
    "utf8",
  );
  check("needs_review has a clear results state", /Needs review/.test(panel));
  const missingFinish = computeAccelerationMetrics(frames, {
    finishX: 0.99,
    finishDistanceM: 30,
  });
  check(
    "missing finish crossing persists unavailable with warning",
    missingFinish.status === "unavailable" &&
      missingFinish.runTime === null &&
      missingFinish.warnings.some((warning) => /finish crossing/i.test(warning)),
  );
  check(
    "worker persists acceleration and fly through separate result branches",
    /analysis_type === "acceleration"[\s\S]*persistedMetrics = computeAccelerationMetrics[\s\S]*else \{[\s\S]*toAnalysisMetrics/.test(
      worker,
    ),
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
