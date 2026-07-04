// Runtime sanity for Day 64 — smooth Auto Follow.
//
//   node scripts/follow-sanity.mjs
//
// Compiles src/lib/video/follow.ts and asserts the broadcast-style stabilization:
//   1. Torso centring: the follow centre tracks the torso, not the limb-extended
//      full-body bbox.
//   2. Vertical jitter is strongly reduced vs the raw per-frame target (dead-zone
//      + damped vertical alpha) — the camera stops bouncing each stride.
//   3. Zoom changes are bounded / de-pulsed (deadband + slow zoom alpha).
//   4. The athlete stays visible: the smoothed centre keeps the target inside the
//      zoomed viewport.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".follow-sanity-tmp");

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
const variance = (xs) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
};
const kp = (x, y) => ({ x, y, visibility: 0.9 });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  const tsconfigPath = path.join(out, "tsconfig.json");
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022",
        skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node",
        baseUrl: root, paths: { "@/*": ["src/*"] },
      },
      files: [path.join(root, "src/lib/video/follow.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", tsconfigPath], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { computeFollowTarget, smoothFollowStable, clampFollow, IDENTITY_FOLLOW, DEFAULT_FOLLOW_SMOOTHING } =
    require(path.join(out, "lib/video/follow.js"));

  // (1) Torso centring ------------------------------------------------------
  // Torso centred at x=0.5, but a swung leg reaches x=0.85 and an arm x=0.40 →
  // the full-body bbox centre would be ~0.625; the torso centre is 0.5.
  const frame = {
    frame: 0, time: 0,
    landmarks: {
      leftShoulder: kp(0.48, 0.35), rightShoulder: kp(0.52, 0.35),
      leftHip: kp(0.48, 0.55), rightHip: kp(0.52, 0.55),
      leftWrist: kp(0.40, 0.45), rightWrist: kp(0.60, 0.45),
      leftFootIndex: kp(0.85, 0.95), rightFootIndex: kp(0.50, 0.9),
    },
    angles: {}, centerOfMass: null, velocity: null, footContact: { left: false, right: false },
  };
  const target = computeFollowTarget(frame);
  check("follow centre tracks the torso (~0.5), not the bbox centre (~0.63)", target && Math.abs(target.cx - 0.5) < 0.03);

  // (2) Vertical jitter reduction ------------------------------------------
  // A stride-bounce vertical oscillation on the target; the smoothed camera cy
  // should be far steadier than the raw target cy.
  const N = 200;
  const targetsBounce = [];
  for (let i = 0; i < N; i++) {
    targetsBounce.push({ cx: 0.5, cy: 0.5 + 0.15 * Math.sin(i * 0.6), scale: 1.8 });
  }
  let cam = { ...IDENTITY_FOLLOW, scale: 1.8 };
  const smoothedCy = [];
  for (const t of targetsBounce) {
    cam = smoothFollowStable(cam, t);
    smoothedCy.push(cam.cy);
  }
  const rawCyVar = variance(targetsBounce.map((t) => t.cy));
  const smoothCyVar = variance(smoothedCy);
  check(`vertical jitter reduced ≥5× (raw var ${rawCyVar.toFixed(4)} → smoothed ${smoothCyVar.toFixed(4)})`, smoothCyVar < rawCyVar / 5);
  // A sub-dead-zone bounce is suppressed entirely.
  let cam2 = { cx: 0.5, cy: 0.5, scale: 1.8 };
  for (let i = 0; i < 50; i++) cam2 = smoothFollowStable(cam2, { cx: 0.5, cy: 0.5 + 0.06 * Math.sin(i), scale: 1.8 });
  check("small (sub-dead-zone) vertical bounce is fully suppressed", Math.abs(cam2.cy - 0.5) < 1e-9);

  // (3) Bounded / de-pulsed zoom -------------------------------------------
  const targetsZoom = [];
  for (let i = 0; i < N; i++) targetsZoom.push({ cx: 0.5, cy: 0.5, scale: i % 2 === 0 ? 1.5 : 2.0 });
  let camZ = { cx: 0.5, cy: 0.5, scale: 1.75 };
  const scales = [];
  let maxStep = 0;
  for (const t of targetsZoom) {
    const prev = camZ.scale;
    camZ = smoothFollowStable(camZ, t);
    maxStep = Math.max(maxStep, Math.abs(camZ.scale - prev));
    scales.push(camZ.scale);
  }
  check("per-frame zoom change stays small (no pulsing)", maxStep < 0.03);
  check("smoothed zoom variance ≪ pulsing target variance", variance(scales) < variance(targetsZoom.map((t) => t.scale)) / 5);

  // (4) Athlete stays visible ----------------------------------------------
  // A slowly panning target; the smoothed centre must keep the target within the
  // zoomed half-window (athlete in frame) and stay edge-clamped in-bounds.
  let camV = { cx: 0.5, cy: 0.5, scale: 2.0 };
  let worstGap = 0;
  let inBounds = true;
  for (let i = 0; i < 300; i++) {
    const t = clampFollow({ cx: 0.5 + 0.2 * Math.sin(i * 0.02), cy: 0.5, scale: 2.0 });
    camV = smoothFollowStable(camV, t);
    const half = 0.5 / camV.scale;
    worstGap = Math.max(worstGap, Math.abs(t.cx - camV.cx));
    if (camV.cx < half - 1e-9 || camV.cx > 1 - half + 1e-9) inBounds = false;
  }
  check("smoothed centre stays edge-clamped in-bounds", inBounds);
  check("athlete stays inside the zoomed viewport (gap < half-window)", worstGap < 0.5 / 2.0);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
