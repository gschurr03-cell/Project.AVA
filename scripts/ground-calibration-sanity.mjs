// Runtime sanity for Day 62 — manual ground-based step calibration.
//
//   node scripts/ground-calibration-sanity.mjs
//
// Compiles the pure step / cadence / calibration modules to a throwaway dir and
// asserts the Day 62 guarantees:
//   1. Ground marks are FIXED: a contact's position is the foot position at the
//      moment it struck, so it is invariant to how much more of the clip plays
//      (appending later frames never moves or renumbers earlier footprints), and
//      successive contacts sit at DISTINCT advancing ground spots — they do not
//      pile up on one moving label.
//   2. Step distance is the gap between consecutive contacts (normalized, and in
//      metres once a scale is applied).
//   3. Manual two-point calibration yields the exact pixel→metre scale, at high
//      confidence, and is rejected for degenerate input.
//   4. Step frequency is (N-1)/elapsed straight from the contact timestamps.
//   5. Max velocity = median calibrated step length × step frequency.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".ground-calibration-tmp");

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
const approx = (a, b, tol = 1e-9) => a != null && Math.abs(a - b) <= tol;

const mk = (x, y) => ({ x, y, visibility: 0.9 });
const foot = (side, x, y) => ({
  [`${side}Ankle`]: mk(x, y - 0.04),
  [`${side}Heel`]: mk(x - 0.01, y - 0.01),
  [`${side}FootIndex`]: mk(x + 0.02, y),
});

/** Antiphase run advancing horizontally, so consecutive contacts are distinct spots. */
function synthFrames({ frames = 90, fps = 30, cadence = 2, amp = 0.06, base = 0.85 } = {}) {
  const arr = [];
  for (let i = 0; i < frames; i++) {
    const t = i / fps;
    const advance = 0.2 + 0.6 * (i / (frames - 1));
    const ly = base + amp * Math.sin(2 * Math.PI * cadence * t);
    const ry = base + amp * Math.sin(2 * Math.PI * cadence * t + Math.PI);
    arr.push({
      frame: i,
      time: t,
      landmarks: { ...foot("left", advance - 0.03, ly), ...foot("right", advance + 0.03, ry) },
      angles: {},
      centerOfMass: null,
      velocity: null,
      footContact: { left: false, right: false },
    });
  }
  return arr;
}

/** A synthetic StepMark with explicit time/position/metre-gap (bypasses detection). */
const stepMark = (index, time, x, y, meters = null) => ({
  side: index % 2 === 0 ? "left" : "right",
  frame: Math.round(time * 30),
  time,
  x,
  y,
  index: index + 1,
  distanceFromPrev: null,
  distanceMetersFromPrev: meters,
});

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
      files: [
        path.join(root, "src/lib/video/steps.ts"),
        path.join(root, "src/lib/video/cadence.ts"),
        path.join(root, "src/lib/calibration/index.ts"),
      ],
    }),
  );
  execFileSync("npx", ["tsc", "-p", tsconfigPath], {
    cwd: root,
    stdio: ["ignore", "inherit", "inherit"],
  });

  const { detectStepMarks, applyRealWorldStepDistances } = require(
    path.join(out, "lib/video/steps.js"),
  );
  const { stepFrequencyFromContacts, medianStepLengthMeters, maxVelocityFromSteps } = require(
    path.join(out, "lib/video/cadence.js"),
  );
  const { estimateScaleFromPoints } = require(path.join(out, "lib/calibration/index.js"));

  // (1) Fixed ground marks --------------------------------------------------
  const base = synthFrames({ frames: 90 });
  const marks = detectStepMarks(base);
  check(`detects multiple contacts (${marks.length})`, marks.length >= 6);
  // Each footprint is at a distinct spot (not piled on one moving label) and the
  // sequence advances down the track overall — the foot doesn't strike twice in
  // the exact same place, and the last contact is well ahead of the first.
  check(
    "every contact is at a distinct ground position",
    marks.every((m, i) => marks.every((n, j) => j === i || m.x !== n.x || m.y !== n.y)),
  );
  check("the contact sequence advances down the track (last x > first x)", marks[marks.length - 1].x > marks[0].x);

  // Play more of the SAME clip: append trailing frames where the feet are lifted
  // (no new contact). Earlier footprints must not move, change time, or renumber
  // — they are pinned to where the foot struck, regardless of later playback.
  const last = base[base.length - 1];
  const tail = [];
  for (let k = 1; k <= 20; k++) {
    tail.push({
      frame: last.frame + k,
      time: last.time + k / 30,
      landmarks: { ...foot("left", 0.85, 0.2), ...foot("right", 0.9, 0.2) },
      angles: {},
      centerOfMass: null,
      velocity: null,
      footContact: { left: false, right: false },
    });
  }
  const marksExtended = detectStepMarks([...base, ...tail]);
  const prefixStable = marks.every((m) => {
    const same = marksExtended.find((e) => e.index === m.index);
    return same && approx(same.time, m.time) && approx(same.x, m.x) && approx(same.y, m.y);
  });
  check("earlier footprints are unchanged when more of the clip plays (fixed to ground)", prefixStable);

  // (2) Distance between consecutive contacts -------------------------------
  check(
    "distanceFromPrev equals the gap between consecutive contact positions",
    marks.every((m, i) => {
      if (i === 0) return m.distanceFromPrev === null;
      const expected = Math.hypot(m.x - marks[i - 1].x, m.y - marks[i - 1].y);
      return approx(m.distanceFromPrev, expected);
    }),
  );
  const scale = { metersPerPixel: 0.01, frameWidth: 1000, frameHeight: 500 };
  const calibrated = applyRealWorldStepDistances(marks, scale);
  check(
    "metre gap = consecutive contact pixel distance × metresPerPixel",
    calibrated.slice(1).every((m, i) => {
      const prev = calibrated[i];
      const dxPx = (m.x - prev.x) * scale.frameWidth;
      const dyPx = (m.y - prev.y) * scale.frameHeight;
      return approx(m.distanceMetersFromPrev, Math.hypot(dxPx, dyPx) * scale.metersPerPixel);
    }),
  );

  // (3) Manual two-point calibration scale ----------------------------------
  // Points 0.5 apart horizontally in a 1000px-wide frame → 500 px → 30 m.
  const pts = { ax: 0.2, ay: 0.9, bx: 0.7, by: 0.9, distanceM: 30 };
  const s = estimateScaleFromPoints(pts, 1000, 500);
  check("manual scale is high-confidence + manual method", !!s && s.method === "manual" && s.confidence === "high");
  check("gate scale metresPerPixel = knownDistance / horizontal pixel gap", s && approx(s.metersPerPixel, 30 / 500, 1e-9));
  // Line-gate calibration (Day 63): the scale is the HORIZONTAL gate separation,
  // so the clicked y-positions are ignored (gates are vertical lines).
  const sTilted = estimateScaleFromPoints({ ax: 0.2, ay: 0.5, bx: 0.7, by: 0.95, distanceM: 30 }, 1000, 500);
  check("gate scale ignores y (vertical timing gates)", sTilted && approx(sTilted.metersPerPixel, 30 / 500, 1e-9));
  check("gates at the same x → null (no separation)", estimateScaleFromPoints({ ax: 0.5, ay: 0.2, bx: 0.5, by: 0.9, distanceM: 30 }, 1000, 500) === null);
  check("degenerate points (same A/B) → null", estimateScaleFromPoints({ ax: 0.5, ay: 0.5, bx: 0.5, by: 0.5, distanceM: 30 }, 1000, 500) === null);
  check("non-positive distance → null", estimateScaleFromPoints({ ...pts, distanceM: 0 }, 1000, 500) === null);
  check("missing frame dims → null", estimateScaleFromPoints(pts, null, null) === null);

  // A step gap measured with the manual scale is a plausible sprint step length.
  const manualScale = { metersPerPixel: s.metersPerPixel, frameWidth: 1000, frameHeight: 500 };
  const manualCal = applyRealWorldStepDistances(marks, manualScale);
  check(
    "calibrated step lengths are positive, finite metres",
    manualCal.slice(1).every((m) => Number.isFinite(m.distanceMetersFromPrev) && m.distanceMetersFromPrev > 0),
  );

  // (4) Step frequency from contacts / time ---------------------------------
  const timed = [stepMark(0, 0, 0.1, 0.9), stepMark(1, 0.2, 0.2, 0.9), stepMark(2, 0.4, 0.3, 0.9), stepMark(3, 0.6, 0.4, 0.9)];
  check("frequency = (N-1)/span = 3/0.6 = 5 Hz", approx(stepFrequencyFromContacts(timed), 5, 1e-9));
  check("fewer than two contacts → null", stepFrequencyFromContacts([timed[0]]) === null);
  check(
    "window restricts the contacts used (0.2–0.6 → 2/0.4 = 5 Hz)",
    approx(stepFrequencyFromContacts(timed, { start: 0.2, end: 0.6 }), 2 / 0.4, 1e-9),
  );
  check(
    "frequency matches the detected run's own timestamps",
    approx(stepFrequencyFromContacts(marks), (marks.length - 1) / (marks[marks.length - 1].time - marks[0].time)),
  );

  // (5) Max velocity = step length × frequency ------------------------------
  // Four contacts, 2.0 m apart each, at 0.25 s spacing → 4 Hz × 2 m = 8 m/s.
  const vMarks = [
    stepMark(0, 0, 0, 0.9, null),
    stepMark(1, 0.25, 0, 0.9, 2.0),
    stepMark(2, 0.5, 0, 0.9, 2.0),
    stepMark(3, 0.75, 0, 0.9, 2.0),
  ];
  check("median calibrated step length = 2.0 m", approx(medianStepLengthMeters(vMarks), 2.0));
  check("frequency of the velocity marks = 3/0.75 = 4 Hz", approx(stepFrequencyFromContacts(vMarks), 4, 1e-9));
  check("max velocity = step length × frequency = 8 m/s", approx(maxVelocityFromSteps(vMarks), 8, 1e-9));
  check("uncalibrated marks (no metre gaps) → null velocity", maxVelocityFromSteps(marks) === null);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
