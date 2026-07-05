// Runtime sanity for Day 73 — FPS normalization + re-timing (fps.ts).
//
//   node scripts/fps-sanity.mjs
//
// Compiles src/lib/video/fps.ts and asserts:
//   • normalizeFps snaps a drifted rate to the nearest canonical 60/120/240 when
//     within tolerance (59.16→60, 59.94→60, 119.88→120, 239.76→240);
//   • it does NOT snap genuinely different rates (30, 45, 50 stay put) or invalid ones;
//   • applyFpsOverride re-times frames to index/fps from a chosen (e.g. normalized) rate.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".fps-sanity-tmp");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return originalResolve.call(this, request.startsWith("@/") ? path.join(out, request.slice(2)) : request, ...rest);
};

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};
const approx = (a, b, tol = 1e-9) => a != null && Math.abs(a - b) <= tol;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] } },
      files: [path.join(root, "src/lib/video/fps.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { normalizeFps, applyFpsOverride, SUPPORTED_FPS } = require(path.join(out, "lib/video/fps.js"));

  check("supported rates are 60/120/240", SUPPORTED_FPS.join(",") === "60,120,240");

  // Snap within tolerance.
  check("59.16 → 60", normalizeFps(59.16) === 60);
  check("59.94 → 60 (NTSC)", normalizeFps(59.94) === 60);
  check("60 → 60", normalizeFps(60) === 60);
  check("119.88 → 120", normalizeFps(119.88) === 120);
  check("120.5 → 120", normalizeFps(120.5) === 120);
  check("239.76 → 240", normalizeFps(239.76) === 240);

  // Do NOT snap genuinely different rates.
  check("30 stays 30 (not near any canonical)", normalizeFps(30) === 30);
  check("45 stays 45", normalizeFps(45) === 45);
  check("50 stays 50 (17% below 60 — outside tolerance)", normalizeFps(50) === 50);
  check("100 stays 100 (between 60 and 120)", normalizeFps(100) === 100);
  check("invalid → null", normalizeFps(null) === null && normalizeFps(0) === 0 ? true : normalizeFps(null) === null);

  // Boundary of the ±2.5% band around 60 (58.5 = exactly 2.5% below).
  check("58.5 (2.5% below 60) snaps to 60", normalizeFps(58.5) === 60);
  check("58.0 (3.3% below 60) stays 58", normalizeFps(58.0) === 58);

  // applyFpsOverride re-times to index/fps from the chosen rate.
  const frames = [0, 1, 2, 3].map((i) => ({ frame: i, time: i / 59.16, landmarks: {}, angles: {}, centerOfMass: null, velocity: null }));
  const retimed = applyFpsOverride(frames, normalizeFps(59.16));
  check("re-timed frame 0 at t=0", approx(retimed[0].time, 0));
  check("re-timed frame 3 at 3/60 (normalized clock)", approx(retimed[3].time, 3 / 60));
  check("re-timing is shorter than the drifted clock (60 > 59.16)", retimed[3].time < 3 / 59.16);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
