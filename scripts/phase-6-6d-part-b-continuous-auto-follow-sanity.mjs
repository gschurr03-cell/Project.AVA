import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".phase-6-6d-part-b-test-tmp");
const require = createRequire(import.meta.url);
let passed = 0;
const check = (name, fn) => {
  fn();
  passed++;
  console.log(`PASS ${passed}. ${name}`);
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
        moduleResolution: "node",
        baseUrl: root,
        paths: { "@/*": ["src/*"] },
      },
      files: [
        "src/lib/video/presentationCamera.ts",
        "src/lib/video/follow.ts",
        "src/lib/video/overlay.ts",
        "src/lib/biomechanics/pose.ts",
      ].map((file) => path.join(root, file)),
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], {
    cwd: root,
    stdio: "inherit",
  });
  const camera = require(path.join(out, "lib/video/presentationCamera.js"));
  const p = (x, y) => ({ x, y, visibility: 1 });
  const frame = (
    index,
    x = 0.4,
    y = 0.5,
    origin = "tracked",
    trackState = "tracking",
    height = 0.3,
  ) => ({
    frame: index,
    sourceFrameIndex: index,
    time: index / 60,
    boxOrigin: origin,
    trackState,
    landmarks: {
      nose: p(x, y - height / 2),
      leftShoulder: p(x - 0.02, y - 0.06),
      rightShoulder: p(x + 0.02, y - 0.06),
      leftHip: p(x - 0.018, y + 0.02),
      rightHip: p(x + 0.018, y + 0.02),
      leftKnee: p(x - 0.02, y + 0.09),
      rightKnee: p(x + 0.02, y + 0.09),
      leftAnkle: p(x - 0.02, y + height / 2),
      rightAnkle: p(x + 0.02, y + height / 2),
    },
    angles: {},
    centerOfMass: null,
    velocity: null,
    footContact: { left: false, right: false },
  });
  const step = (state, f, time, options = {}) =>
    camera.stepPresentationCamera(state, f, time, { enabled: true, ...options });
  const screen = (anchor, state) => ({
    x: 0.5 + state.scale * (anchor.x - state.cx),
    y: 0.5 + state.scale * (anchor.y - state.cy),
  });

  check("continuous target movement creates continuous camera movement", () => {
    let s = step(camera.FULL_FRAME_PRESENTATION_CAMERA, frame(0, 0.35), 0, {
      directSelection: true,
    });
    const xs = [];
    for (let i = 1; i <= 20; i++) {
      s = step(s, frame(i, 0.35 + i * 0.005), (i * 1000) / 60);
      xs.push(s.cx);
    }
    assert.ok(xs.slice(5).every((x, i) => i === 0 || x >= xs[i - 1]));
    assert.ok(new Set(xs.slice(5).map((x) => x.toFixed(8))).size > 10);
  });
  check("raw athlete target is separate from presentation trajectory", () => {
    let s = step(camera.FULL_FRAME_PRESENTATION_CAMERA, frame(0, 0.3), 0, {
      directSelection: true,
    });
    s = step(s, frame(1, 0.7), 100);
    assert.notEqual(s.rawTargetCenterSourceX, s.targetCenterSourceX);
  });
  check("horizontal deadband no longer creates thresholded pan", () =>
    assert.equal(camera.DEFAULT_PRESENTATION_CAMERA_CONFIG.horizontalDeadband, 0),
  );
  check("short uncertainty remains bounded", () => {
    let s = step(camera.FULL_FRAME_PRESENTATION_CAMERA, frame(0, 0.4), 0, {
      directSelection: true,
    });
    s = step(s, frame(1, 0.45), 100);
    const x = s.cx;
    s = step(s, frame(2, 0.9, 0.9, "frozen_suspect", "reacquiring"), 200);
    assert.equal(s.presentationState, "holding");
    assert.ok(Math.abs(s.cx - x) < 0.05);
  });
  check("hold release does not snap to the returned raw target", () => {
    let s = step(camera.FULL_FRAME_PRESENTATION_CAMERA, frame(0, 0.3), 0, {
      directSelection: true,
    });
    s = step(s, frame(1, 0.9, 0.5, "frozen_suspect", "reacquiring"), 100);
    const x = s.cx;
    s = step(s, frame(2, 0.8, 0.5, "tracked", "tracking"), 200);
    assert.equal(s.presentationState, "reacquiring");
    assert.ok(Math.abs(s.cx - x) < Math.abs(s.rawTargetCenterSourceX - x));
    assert.notEqual(s.cx, s.rawTargetCenterSourceX);
  });
  check("reacquisition target is blended", () => {
    let s = step(camera.FULL_FRAME_PRESENTATION_CAMERA, frame(0, 0.3), 0, {
      directSelection: true,
    });
    s = step(s, frame(1, 0.9, 0.5, "invalid", "lost"), 500);
    s = step(s, frame(2, 0.75, 0.5, "tracked", "tracking"), 600);
    assert.equal(s.presentationState, "reacquiring");
    assert.ok(Math.abs(s.targetCenterSourceX - s.rawTargetCenterSourceX) > 0.001);
  });
  check("long loss remains honest", () => {
    let s = step(camera.FULL_FRAME_PRESENTATION_CAMERA, frame(0, 0.3), 0, {
      directSelection: true,
    });
    s = step(s, frame(1, 0.9, 0.9, "invalid", "lost"), 1000);
    assert.equal(s.presentationState, "degraded");
    assert.equal(s.rawTargetCenterSourceX, 0.5);
    assert.equal(s.rawTargetScale, 1);
  });
  check("initial acquisition directly initializes the selected viewport", () => {
    const s = step(camera.FULL_FRAME_PRESENTATION_CAMERA, frame(0, 0.2), 500, {
      directSelection: true,
    });
    assert.equal(
      s.cx,
      camera.presentationViewport(s).crop.x + 0.5 / camera.presentationViewport(s).scale,
    );
    assert.equal(s.velocityX, 0);
  });
  check("scale composition preserves anchor screen position", () => {
    const prior = { cx: 0.42, cy: 0.51, scale: 2 };
    const desired = { cx: 0.43, cy: 0.505 };
    const anchor = { x: 0.48, y: 0.46 };
    const panOnly = { cx: desired.cx, cy: desired.cy, scale: prior.scale };
    const next = camera.zoomDecoupledFollow(prior, desired, 2.2, anchor);
    assert.ok(Math.abs(screen(anchor, panOnly).x - screen(anchor, next).x) < 1e-12);
    assert.ok(Math.abs(screen(anchor, panOnly).y - screen(anchor, next).y) < 1e-12);
  });
  check("zoom does not add anchor translation", () => {
    const prior = { cx: 0.5, cy: 0.5, scale: 1.8 };
    const anchor = { x: 0.55, y: 0.48 };
    const next = camera.zoomDecoupledFollow(prior, { cx: 0.5, cy: 0.5 }, 2, anchor);
    assert.deepEqual(screen(anchor, prior), screen(anchor, next));
  });
  check("scale velocity remains source-time bounded", () => {
    let s = step(
      camera.FULL_FRAME_PRESENTATION_CAMERA,
      frame(0, 0.4, 0.5, "tracked", "tracking", 0.3),
      0,
      { directSelection: true },
    );
    const old = s.scale;
    s = step(s, frame(1, 0.41, 0.5, "tracked", "tracking", 0.1), 100);
    assert.ok(
      Math.abs(s.scale - old) <=
        camera.DEFAULT_PRESENTATION_CAMERA_CONFIG.maximumScaleVelocity * 0.1 + 1e-12,
    );
  });
  check("forward look remains direction aware", () => {
    let s = step(camera.FULL_FRAME_PRESENTATION_CAMERA, frame(0, 0.3), 0, {
      directSelection: true,
    });
    s = step(s, frame(1, 0.4), 100);
    assert.ok(s.rawTargetCenterSourceX > 0.4);
    const right = s.rawTargetCenterSourceX;
    s = step(s, frame(2, 0.35), 200);
    assert.ok(s.rawTargetCenterSourceX < right);
  });
  check("forward-look target evolves within trajectory bounds", () => {
    let s = step(camera.FULL_FRAME_PRESENTATION_CAMERA, frame(0, 0.3), 0, {
      directSelection: true,
    });
    const old = s.targetCenterSourceX;
    s = step(s, frame(1, 0.8), 100);
    assert.ok(
      Math.abs(s.targetCenterSourceX - old) <=
        camera.DEFAULT_PRESENTATION_CAMERA_CONFIG.maximumTargetVelocity * 0.1 + 1e-12,
    );
  });
  check("vertical bounce remains suppressed", () => {
    let s = step(camera.FULL_FRAME_PRESENTATION_CAMERA, frame(0, 0.4, 0.5), 0, {
      directSelection: true,
    });
    const y = s.cy;
    s = step(s, frame(1, 0.41, 0.54), 100);
    assert.ok(Math.abs(s.cy - y) < 0.02);
  });
  check("pause-equivalent repeated source timestamp freezes exact state", () => {
    let s = step(camera.FULL_FRAME_PRESENTATION_CAMERA, frame(0, 0.4), 100, {
      directSelection: true,
    });
    const frozen = step(s, frame(0, 0.4), 100);
    assert.strictEqual(frozen, s);
  });
  check("resume continues retained velocity", () => {
    let s = step(camera.FULL_FRAME_PRESENTATION_CAMERA, frame(0, 0.3), 0, {
      directSelection: true,
    });
    s = step(s, frame(1, 0.4), 100);
    const velocity = s.velocityX;
    const frozen = step(s, frame(1, 0.4), 100);
    const resumed = step(frozen, frame(2, 0.42), 200);
    assert.equal(frozen.velocityX, velocity);
    assert.ok(resumed.cx >= frozen.cx);
  });
  check("seek reinitializes immediately", () => {
    let s = step(camera.FULL_FRAME_PRESENTATION_CAMERA, frame(0, 0.2), 0, {
      directSelection: true,
    });
    s = step(s, frame(90, 0.8), 1500, { directSelection: true });
    assert.ok(s.cx > 0.6);
    assert.equal(s.velocityX, 0);
    assert.equal(s.targetVelocityX, 0);
  });
  const sourceFrames = Array.from({ length: 241 }, (_, index) => ({
    ...frame(index, 0.25 + index * 0.002),
    time: index / 240,
  }));
  const sourcePath = camera.buildPresentationCameraPath(sourceFrames);
  const selectedPath = (sourceStep) =>
    Array.from(
      { length: Math.floor(240 / sourceStep) + 1 },
      (_, index) => sourcePath[Math.min(240, index * sourceStep)],
    );
  check("0.25x playback selects the authoritative source-time trajectory", () =>
    assert.deepEqual(
      selectedPath(1).filter((_, index) => index % 4 === 0),
      selectedPath(4),
    ),
  );
  check("0.5x playback selects the authoritative source-time trajectory", () =>
    assert.deepEqual(
      selectedPath(2).filter((_, index) => index % 2 === 0),
      selectedPath(4),
    ),
  );
  check("1x playback selects the authoritative source-time trajectory", () =>
    assert.deepEqual(selectedPath(4), selectedPath(4)),
  );
  const surface = readFileSync(path.join(root, "src/components/video/OverlaySurface.tsx"), "utf8");
  check("pause is not treated as a seek reinitialization", () =>
    assert.doesNotMatch(surface, /directSelectionRef\.current \|\| video\.paused/),
  );
  check("shared video and overlay transform remains singular", () => {
    assert.match(surface, /followWrapperRef/);
    assert.match(surface, /wrapper\.style\.transform = followTransform\(next\)/);
  });
  check("scientific input frame remains untouched", () => {
    const f = frame(0);
    const before = JSON.stringify(f);
    step(camera.FULL_FRAME_PRESENTATION_CAMERA, f, 0, { directSelection: true });
    assert.equal(JSON.stringify(f), before);
  });
  const metrics = readFileSync(path.join(root, "src/lib/benchmark/measurements.ts"), "utf8");
  check("scientific metrics remain presentation-camera independent", () =>
    assert.doesNotMatch(metrics, /presentationCamera|zoomDecoupledFollow|PresentationViewport/),
  );
  assert.ok(passed >= 18);
  console.log(`ALL ${passed} PHASE 6.6D PART B CONTINUOUS AUTO FOLLOW CHECKS PASSED`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
