// Day 99 Part 3 sanity — the shared display-level gate stabilization
// (`src/lib/video/gateStabilization.ts`) that stops calibration gate lines
// from visibly bobbing under sub-pixel transform/rounding noise, without
// touching the world anchor or camera transform itself.
//
//   node scripts/gate-display-stabilization-sanity.mjs
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".gate-display-stabilization-tmp");

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  execFileSync(
    "npx",
    ["tsc", "src/lib/video/gateStabilization.ts", "--outDir", out, "--module", "commonjs", "--target", "es2022", "--skipLibCheck", "--esModuleInterop", "--strict"],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );
  const { stabilizeGatePoint, pointDistance, midpoint, lineOrientationDeg, GATE_DISPLAY_DEADBAND_PX } =
    require(path.join(out, "gateStabilization.js"));

  // --- 1/3. Sub-threshold noise never moves the displayed point. ---
  const raw0 = { p1: { x: 100, y: 200 }, p2: { x: 300, y: 205 } };
  const first = stabilizeGatePoint(raw0, null);
  check("1. first frame (no previous) displays the raw position", first.display.p1.x === 100 && first.displacementPx === 0);

  const noisy = { p1: { x: 100.3, y: 200.2 }, p2: { x: 300.1, y: 204.8 } }; // < 0.75px deadband
  const stabilized = stabilizeGatePoint(noisy, first.display);
  check(
    "3. sub-threshold transform noise (< deadband) does not move the displayed pixel position",
    stabilized.display.p1.x === 100 && stabilized.display.p1.y === 200 && stabilized.display.p2.x === 300 && stabilized.display.p2.y === 205,
  );
  check("3. sub-threshold noise is still reported in displacementPx (for diagnostics)", stabilized.displacementPx > 0 && stabilized.displacementPx < GATE_DISPLAY_DEADBAND_PX);

  // A REAL move (>= deadband) must still come through — stabilization must
  // never freeze a gate that genuinely needs to update (e.g. after a coach
  // re-confirms calibration).
  const realMove = { p1: { x: 110, y: 200 }, p2: { x: 300, y: 205 } }; // 10px move
  const moved = stabilizeGatePoint(realMove, stabilized.display);
  check("real (>= deadband) movement is NOT suppressed", moved.display.p1.x === 110);

  // --- 2. Start and finish gates cannot drift independently: the SAME
  //     function + threshold applied to two different point sets never makes
  //     one "stickier" than the other — verified by symmetry, not by sharing
  //     state (each gate has its own real position). ---
  const startPrev = { p1: { x: 50, y: 50 }, p2: { x: 60, y: 50 } };
  const finishPrev = { p1: { x: 950, y: 50 }, p2: { x: 960, y: 50 } };
  const startRaw = { p1: { x: 50.4, y: 50.4 }, p2: { x: 60.4, y: 50.4 } }; // 0.57px move
  const finishRaw = { p1: { x: 950.4, y: 50.4 }, p2: { x: 960.4, y: 50.4 } }; // identical relative move
  const startOut = stabilizeGatePoint(startRaw, startPrev);
  const finishOut = stabilizeGatePoint(finishRaw, finishPrev);
  check(
    "2. identical relative noise on both gates produces identical stabilization behavior (neither is independently smoothed)",
    startOut.display.p1.x === startPrev.p1.x && finishOut.display.p1.x === finishPrev.p1.x &&
      Math.abs(startOut.displacementPx - finishOut.displacementPx) < 1e-9,
  );

  // --- Fixed spacing/orientation once stabilized (acceptance criteria). ---
  const spacing = pointDistance(midpoint(startPrev.p1, startPrev.p2), midpoint(finishPrev.p1, finishPrev.p2));
  const spacingAfterNoise = pointDistance(midpoint(startOut.display.p1, startOut.display.p2), midpoint(finishOut.display.p1, finishOut.display.p2));
  check("fixed spacing: sub-threshold noise on both gates leaves gate spacing exactly unchanged", spacing === spacingAfterNoise);
  const orientBefore = lineOrientationDeg(startPrev.p1, startPrev.p2);
  const orientAfter = lineOrientationDeg(startOut.display.p1, startOut.display.p2);
  check("fixed orientation: sub-threshold noise leaves gate orientation exactly unchanged", orientBefore === orientAfter);

  // --- No visible bob across a realistic noisy sequence (simulates ~1s of
  //     240fps frames with the kind of sub-pixel jitter a real transform
  //     estimate could plausibly produce). ---
  let prev = null;
  let anyBob = false;
  let display = { x: 200, y: 300 };
  for (let i = 0; i < 240; i++) {
    const jitter = (Math.sin(i * 1.7) * 0.4); // bounded, sub-deadband synthetic noise
    const raw = { p1: { x: 200 + jitter, y: 300 }, p2: { x: 400 + jitter, y: 300 } };
    const stepOut = stabilizeGatePoint(raw, prev);
    if (prev && (stepOut.display.p1.x !== display.x)) anyBob = true;
    display = stepOut.display.p1;
    prev = stepOut.display;
  }
  check("240-frame synthetic noisy sequence (bounded sub-deadband jitter) never changes the displayed pixel position", !anyBob);
} finally {
  rmSync(out, { recursive: true, force: true });
}

console.log(ok ? "\nAll gate-display-stabilization sanity checks passed." : "\nSanity FAILED.");
process.exit(ok ? 0 : 1);
