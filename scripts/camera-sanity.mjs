// Runtime sanity for Day 64 — camera motion compensation.
//
//   node scripts/camera-sanity.mjs
//
// Compiles src/lib/video/camera.ts and asserts:
//   1. Translation recovery: a known camera pan is recovered from a planted
//      (stance) foot while the other foot swings forward.
//   2. World/frame round trip: frame → world → frame returns the original point.
//   3. Ground anchoring under pan: a contact captured at one time reprojects to
//      the correct on-track position at a later time (follows the ground, not the
//      athlete).
//   4. Weak/unavailable compensation: no foot data → unavailable track, standard
//      warning, and world == frame (no fabricated correction).

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".camera-sanity-tmp");

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

const kp = (x, y) => ({ x, y, visibility: 0.9 });
const foot = (side, x, y) => ({
  [`${side}Ankle`]: kp(x, y - 0.03),
  [`${side}Heel`]: kp(x - 0.01, y - 0.01),
  [`${side}FootIndex`]: kp(x + 0.02, y),
});

/**
 * Frames with a KNOWN rightward camera pan of `pan`/frame. The LEFT foot is
 * planted on the track at world x=0.5 (so its frame x = 0.5 − cum), while the
 * RIGHT foot swings forward in the world (advances faster in-frame).
 */
function panFrames({ n = 60, fps = 60, pan = 0.004, stride = 0.02 } = {}) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const cum = pan * i;
    const leftFrameX = 0.5 - cum; // planted world point 0.5 seen through the pan
    const rightWorldX = 0.5 + stride * i; // swinging/advancing on the track
    const rightFrameX = rightWorldX - cum;
    arr.push({
      frame: i,
      time: i / fps,
      landmarks: { ...foot("left", leftFrameX, 0.9), ...foot("right", rightFrameX, 0.72) },
      angles: {},
      centerOfMass: { x: (leftFrameX + rightFrameX) / 2, y: 0.6 },
      velocity: null,
      footContact: { left: false, right: false },
    });
  }
  return arr;
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
      files: [path.join(root, "src/lib/video/camera.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", tsconfigPath], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const {
    estimateCameraMotion,
    cameraOffsetAtTime,
    frameToWorldAt,
    worldToFrameAt,
    CAMERA_UNAVAILABLE_WARNING,
  } = require(path.join(out, "lib/video/camera.js"));

  // (1) Translation recovery ------------------------------------------------
  const pan = 0.004;
  const n = 60;
  const frames = panFrames({ n, pan });
  const track = estimateCameraMotion(frames);
  check("track is available with high confidence (planted foot every frame)", track.available && track.confidence === "high");
  const last = track.offsets[track.offsets.length - 1];
  check(
    `recovers the known cumulative pan (cumX≈${(pan * (n - 1)).toFixed(3)}, got ${last.cumX.toFixed(3)})`,
    approx(last.cumX, pan * (n - 1), 1e-3),
  );
  check("per-frame dx ≈ the known pan", approx(track.offsets[30].dx, pan, 1e-3));
  check("no vertical drift estimated (dy≈0)", approx(last.cumY, 0, 1e-3));

  // (2) World/frame round trip ---------------------------------------------
  const t = frames[25].time;
  const p = { x: 0.42, y: 0.55 };
  const back = worldToFrameAt(frameToWorldAt(p, track, t), track, t);
  check("frame → world → frame round-trips", approx(back.x, p.x, 1e-12) && approx(back.y, p.y, 1e-12));

  // (3) Ground anchoring under pan -----------------------------------------
  // The planted foot at t1 is a real ground point; its world position must be
  // stable, and reprojecting to t2 must land on where that ground point appears
  // at t2 (= 0.5 − cum(t2)), NOT stay stuck to the frame position from t1.
  const t1 = frames[10].time;
  const t2 = frames[50].time;
  const groundFrameAtT1 = { x: 0.5 - pan * 10, y: 0.9 };
  const world = frameToWorldAt(groundFrameAtT1, track, t1);
  check("recovered world x of the planted ground point ≈ 0.5", approx(world.x, 0.5, 5e-3));
  const reprojT2 = worldToFrameAt(world, track, t2);
  check(
    "reprojected contact tracks the ground at t2 (≈ 0.5 − cum(t2))",
    approx(reprojT2.x, 0.5 - pan * 50, 5e-3),
  );
  check(
    "reprojected contact is NOT stuck at its original frame x",
    Math.abs(reprojT2.x - groundFrameAtT1.x) > 0.1,
  );

  // (4) Weak / unavailable --------------------------------------------------
  const blank = frames.map((f) => ({ ...f, landmarks: {} }));
  const none = estimateCameraMotion(blank);
  check("no foot data → unavailable track", none.available === false && none.confidence === "none");
  check("unavailable track carries the standard warning", typeof none.warning === "string" && none.warning.includes(CAMERA_UNAVAILABLE_WARNING));
  check("unavailable → world == frame (no fabricated compensation)", approx(cameraOffsetAtTime(none, frames[20].time).x, 0, 1e-12));
  check("too few frames → unavailable", estimateCameraMotion(frames.slice(0, 2)).available === false);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
