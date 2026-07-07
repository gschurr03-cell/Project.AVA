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
      files: [path.join(root, "src/lib/acceleration/metrics.ts")],
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
    ax: 0.1,
    ay: 0.5,
    bx: 0.9,
    by: 0.5,
    distanceM: 30,
  });
  check(
    "acceleration t=0 is HAND_LEAVE_GROUND",
    metrics.startEvent.type === "hand_leave_ground" &&
      metrics.startEvent.frame === 20 &&
      metrics.startEvent.timeS === frames[20].time,
  );
  check(
    "calibrated 30m produces 10m, 20m, and 30m splits",
    metrics.split10mS > 0 &&
      metrics.split20mS > metrics.split10mS &&
      metrics.split30mS > metrics.split20mS,
  );
  check(
    "average velocity uses the farthest measured split",
    Math.abs(metrics.averageVelocityMps - 30 / metrics.split30mS) < 1e-9,
  );
  check(
    "velocity progression contains three observed 10m segments",
    metrics.segments.length === 3 && metrics.segments.every((s) => s.timeS > 0),
  );
  check("early acceleration is observed and positive", metrics.earlyAccelerationMps2 > 0);
  check(
    "peak velocity and distance-to-peak are measured inside zone",
    metrics.peakVelocityMps > 0 &&
      metrics.distanceToPeakVelocityM >= 0 &&
      metrics.distanceToPeakVelocityM <= 30,
  );
  const noCalibration = computeAccelerationMetrics(frames, null);
  check(
    "no calibration returns unavailable values rather than fabricated splits",
    noCalibration.split10mS === null && noCalibration.peakVelocityMps === null,
  );
  const source = readFileSync(path.join(root, "src/lib/acceleration/metrics.ts"), "utf8");
  check(
    "acceleration module is isolated from fly measurements",
    !source.includes("benchmark/measurements"),
  );
  const sessionPage = readFileSync(path.join(root, "src/app/sessions/[id]/page.tsx"), "utf8");
  check(
    "fly t=0 path remains unchanged",
    /session\.analysis_type === "fly" && overlayFrames\.length[\s\S]*computeSprintMeasurements/.test(
      sessionPage,
    ),
  );
  const runner = readFileSync(
    path.join(root, "src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py"),
    "utf8",
  );
  const worker = readFileSync(path.join(root, "scripts/analysis-worker.mjs"), "utf8");
  check(
    "acceleration uses an internal detection crop",
    /analysis_type === "acceleration"[\s\S]*MEDIAPIPE_ROI_ZOOM/.test(worker),
  );
  check(
    "detection crop maps landmarks back to display coordinates",
    /map the crop-normalized[\s\S]*back[\s\S]*FULL-FRAME normalized coordinates/i.test(runner),
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
