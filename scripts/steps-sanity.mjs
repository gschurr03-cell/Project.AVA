// Runtime sanity for the overlay step-mark detector + FPS override (Day 56/61).
//
//   node scripts/steps-sanity.mjs
//
// Compiles the steps + fps modules (which reuse the pure contact helpers from the
// biomechanics FootContactDetector) to a throwaway dir and asserts the Day 61
// corrections: one mark per true ground contact, duplicate/too-close contacts are
// suppressed (no two steps closer than the global min spacing; one foot cannot
// re-strike within a stride), a clean antiphase run alternates left/right, step
// distance is reported in metres when a calibration scale is supplied (and null
// otherwise), and a manual FPS override re-times frames for frame↔time
// conversion. Plus the original invariants: indices 1..N, determinism, sparse → [].

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".steps-sanity-tmp");

// tsc leaves the `@/*` alias untouched in emitted JS; map it back at require time.
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  const mapped = request.startsWith("@/") ? path.join(out, request.slice(2)) : request;
  return originalResolve.call(this, mapped, ...rest);
};

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};
const approx = (a, b, tol = 1e-6) => a != null && Math.abs(a - b) <= tol;

const mk = (x, y) => ({ x, y, visibility: 0.9 });
const foot = (side, x, y) => ({
  [`${side}Ankle`]: mk(x, y - 0.04),
  [`${side}Heel`]: mk(x - 0.01, y - 0.01),
  [`${side}FootIndex`]: mk(x + 0.02, y),
});

/** Frames from explicit per-foot cadence, advancing horizontally. Antiphase by default. */
function synthFrames({ frames = 90, fps = 30, cadence = 2, amp = 0.06, base = 0.85, rightPhase = Math.PI } = {}) {
  const out = [];
  for (let i = 0; i < frames; i++) {
    const t = i / fps;
    const advance = 0.2 + 0.6 * (i / (frames - 1));
    const ly = base + amp * Math.sin(2 * Math.PI * cadence * t);
    const ry = base + amp * Math.sin(2 * Math.PI * cadence * t + rightPhase);
    out.push({
      frame: i,
      time: t,
      landmarks: { ...foot("left", advance - 0.03, ly), ...foot("right", advance + 0.03, ry) },
      angles: {},
      centerOfMass: null,
      velocity: null,
      footContact: { left: false, right: false },
    });
  }
  return out;
}

/** One foot oscillating very fast (many close contacts), the other held still high. */
function rapidLeftFrames({ frames = 90, fps = 60, cadence = 8, amp = 0.06, base = 0.85 } = {}) {
  const out = [];
  for (let i = 0; i < frames; i++) {
    const t = i / fps;
    const advance = 0.2 + 0.6 * (i / (frames - 1));
    const ly = base + amp * Math.sin(2 * Math.PI * cadence * t);
    out.push({
      frame: i,
      time: t,
      landmarks: { ...foot("left", advance - 0.03, ly), ...foot("right", advance + 0.03, 0.2) },
      angles: {},
      centerOfMass: null,
      velocity: null,
      footContact: { left: false, right: false },
    });
  }
  return out;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  const tsconfigPath = path.join(out, "tsconfig.json");
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        outDir: out,
        rootDir: path.join(root, "src"),
        module: "commonjs",
        target: "es2022",
        skipLibCheck: true,
        esModuleInterop: true,
        strict: true,
        moduleResolution: "node",
        baseUrl: root,
        paths: { "@/*": ["src/*"] },
      },
      files: [path.join(root, "src/lib/video/steps.ts"), path.join(root, "src/lib/video/fps.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", tsconfigPath], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
  const { detectStepMarks, applyRealWorldStepDistances, DEFAULT_STEP_CONFIG } = require(
    path.join(out, "lib/video/steps.js"),
  );
  const { applyFpsOverride, isValidFps, MIN_FPS, MAX_FPS } = require(path.join(out, "lib/video/fps.js"));

  const MIN_STEP_MS = DEFAULT_STEP_CONFIG.minStepSpacingMs;
  const MIN_SAME_MS = DEFAULT_STEP_CONFIG.minSameSideSpacingMs;

  // (1) Empty / too-sparse input → [].
  check("empty input → []", detectStepMarks([]).length === 0);
  check("single frame → []", detectStepMarks(synthFrames({ frames: 1 })).length === 0);
  check("no foot landmarks → []", detectStepMarks(synthFrames().map((f) => ({ ...f, landmarks: {} }))).length === 0);

  // (2) Clean antiphase run → alternating one-per-contact marks.
  const marks = detectStepMarks(synthFrames());
  check(`detects contacts on both feet (${marks.length})`, marks.length >= 6 && marks.some((m) => m.side === "left") && marks.some((m) => m.side === "right"));
  check("indices are sequential 1..N in time order", marks.every((m, i) => m.index === i + 1) && marks.every((m, i) => i === 0 || m.time >= marks[i - 1].time));
  check(
    "no two steps closer than the global min spacing",
    marks.every((m, i) => i === 0 || (m.time - marks[i - 1].time) * 1000 >= MIN_STEP_MS - 1e-6),
  );
  check(
    "same foot never re-strikes within a stride",
    marks.every((m, i) => i === 0 || m.side !== marks[i - 1].side || (m.time - marks[i - 1].time) * 1000 >= MIN_SAME_MS - 1e-6),
  );
  check(
    "clean antiphase run alternates left/right",
    marks.every((m, i) => i === 0 || m.side !== marks[i - 1].side),
  );

  // (3) Duplicate suppression: a foot oscillating faster than it could really
  // strike must NOT produce a mark per raw peak — they collapse to spaced steps.
  const rapid = detectStepMarks(rapidLeftFrames());
  check("rapid single-foot run yields left marks", rapid.some((m) => m.side === "left"));
  check("no right marks (right foot never lands)", rapid.every((m) => m.side === "left"));
  check(
    "duplicate close contacts suppressed (all ≥ same-side spacing apart)",
    rapid.every((m, i) => i === 0 || (m.time - rapid[i - 1].time) * 1000 >= MIN_SAME_MS - 1e-6),
  );
  // 1s @ 8 Hz = 8 raw peaks; suppression to ≥250 ms spacing means ≤ ~4 survive.
  check(`suppressed count is far below raw peak count (${rapid.length} ≤ 5)`, rapid.length <= 5);

  // (4) Step distance in metres only when calibrated; relative/null otherwise.
  const scale = { metersPerPixel: 0.01, frameWidth: 1000, frameHeight: 500 };
  const uncal = applyRealWorldStepDistances(marks, null);
  check("uncalibrated → every metre distance is null", uncal.every((m) => m.distanceMetersFromPrev === null));
  check("uncalibrated still carries a normalized relative distance", uncal.slice(1).every((m) => typeof m.distanceFromPrev === "number" && m.distanceFromPrev > 0));

  const cal = applyRealWorldStepDistances(marks, scale);
  check("first calibrated mark has null metre distance", cal[0].distanceMetersFromPrev === null);
  check(
    "later marks carry a positive metre distance matching the scale maths",
    cal.slice(1).every((m, i) => {
      const prev = cal[i]; // cal[i] is the element before cal[i+1]
      const dxPx = (m.x - prev.x) * scale.frameWidth;
      const dyPx = (m.y - prev.y) * scale.frameHeight;
      const expected = Math.hypot(dxPx, dyPx) * scale.metersPerPixel;
      return m.distanceMetersFromPrev > 0 && approx(m.distanceMetersFromPrev, expected, 1e-9);
    }),
  );
  check("metre distances are bounded, positive real-world lengths (0–5 m)", cal.slice(1).every((m) => m.distanceMetersFromPrev > 0 && m.distanceMetersFromPrev < 5));

  // (5) Determinism.
  check("deterministic (same frames → same marks)", JSON.stringify(detectStepMarks(synthFrames())) === JSON.stringify(marks));

  // (6) FPS override re-times frames for frame↔time conversion.
  check("isValidFps bounds", isValidFps(240) && !isValidFps(0) && !isValidFps(MAX_FPS + 1) && !isValidFps(null) && isValidFps(MIN_FPS));
  const base30 = synthFrames({ frames: 10, fps: 30 });
  const retimed = applyFpsOverride(base30, 60);
  check("override recomputes time = frameIndex / fps", retimed.every((f, i) => approx(f.time, i / 60, 1e-9)));
  check("frame indices are preserved by the override", retimed.every((f, i) => f.frame === base30[i].frame));
  check("invalid fps leaves frames unchanged", applyFpsOverride(base30, 0) === base30 && applyFpsOverride(base30, null) === base30);
  // Faster true FPS ⇒ shorter times ⇒ tighter contact spacing (timing follows fps).
  const slow = detectStepMarks(applyFpsOverride(synthFrames({ fps: 30 }), 30));
  const fast = detectStepMarks(applyFpsOverride(synthFrames({ fps: 30 }), 120));
  check("override changes contact timing", slow.length > 0 && fast.length > 0 && slow[slow.length - 1].time > fast[fast.length - 1].time);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
