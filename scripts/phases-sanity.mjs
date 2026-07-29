// Runtime sanity for the sprint phase detector.
//
//   node scripts/phases-sanity.mjs
//
// Compiles the phases module (which reuses the pure smoothing helper + step
// detector) and drives it with a synthetic COM trajectory whose velocity rises,
// plateaus, then falls — asserting the canonical phase sequence
// (start→acceleration→transition→maxVelocity→maintenance→deceleration) is
// recovered in order, with confidence + explanations, plus the sparse / rising
// edge cases and determinism.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".phases-sanity-tmp");

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

const ORDER = ["start", "acceleration", "transition", "maxVelocity", "maintenance", "deceleration"];
const smoothstep = (p) => p * p * (3 - 2 * p);

/**
 * Build frames from a target velocity profile (body-lengths/sec). Leg length is
 * constant (ankle fixed), so the engine recovers the profile exactly; heel/toe
 * oscillate only so the step detector has contacts.
 */
function framesFromVelocity(targetV, { fps = 60, duration = 3.8, leg = 0.2 } = {}) {
  const n = Math.round(fps * duration);
  const kp = (x, y) => ({ x, y, visibility: 0.9 });
  const frames = [];
  let x = 0.1;
  for (let i = 0; i < n; i++) {
    const t = i / fps;
    if (i > 0) x += (targetV((i - 0.5) / fps) * leg) / fps; // integrate dx = v·leg·dt
    const hipY = 0.4;
    const ankleY = hipY + leg;
    const bob = 0.03 * Math.sin(2 * Math.PI * 2 * t);
    frames.push({
      frame: i,
      time: t,
      landmarks: {
        leftHip: kp(x - 0.02, hipY),
        rightHip: kp(x + 0.02, hipY),
        leftAnkle: kp(x - 0.02, ankleY),
        rightAnkle: kp(x + 0.02, ankleY),
        leftHeel: kp(x - 0.03, ankleY + bob),
        rightHeel: kp(x + 0.03, ankleY - bob),
        leftFootIndex: kp(x - 0.01, ankleY + bob),
        rightFootIndex: kp(x + 0.05, ankleY - bob),
      },
      angles: {},
      centerOfMass: { x, y: hipY },
      velocity: null,
      footContact: { left: false, right: false },
    });
  }
  return frames;
}

// Rise (0→2.0s) → plateau near peak (2.0→2.9s) → decelerate (2.9s→).
function riseHoldFall(t) {
  const vmax = 5;
  if (t < 2.0) return vmax * (0.08 + 0.92 * smoothstep(t / 2.0));
  if (t < 2.9) return vmax * (1.0 - 0.05 * ((t - 2.0) / 0.9)); // 1.00 → 0.95
  return vmax * Math.max(0.6, 0.95 - 0.45 * ((t - 2.9) / 0.9)); // fall to ~0.6
}
// Monotonic rise all the way to the clip end ("still rising at the end" case).
const risingOnly = (t) => 5 * (0.1 + 0.9 * (t / 3.8));

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
      files: [path.join(root, "src/lib/phases/index.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", tsconfigPath], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
  const { detectSprintPhases } = require(path.join(out, "lib/phases/index.js"));

  // (1) Full profile → canonical phases in order.
  const report = detectSprintPhases(framesFromVelocity(riseHoldFall));
  check("full profile → available", report.available === true);
  const phases = report.bands.map((b) => b.phase);
  const idxs = phases.map((p) => ORDER.indexOf(p));
  check(`phases recovered: ${phases.join(" → ")}`, phases.length >= 3);
  check("phases are in canonical (non-decreasing) order", idxs.every((v, i) => i === 0 || v >= idxs[i - 1]));
  check("includes acceleration", phases.includes("acceleration"));
  check("includes maxVelocity", phases.includes("maxVelocity"));
  check("includes deceleration", phases.includes("deceleration"));
  check("every band has an explanation + confidence", report.bands.every((b) => b.explanation.length > 0 && ["high", "medium", "low"].includes(b.confidence)));
  check("bands are contiguous and forward in time", report.bands.every((b, i) => b.endTime >= b.startTime && (i === 0 || b.startTime >= report.bands[i - 1].startTime)));
  check("peak velocity time near 2.0s", report.peakVelocityTime != null && Math.abs(report.peakVelocityTime - 2.0) < 0.4);
  check("step counts attributed to bands", report.bands.reduce((s, b) => s + b.stepCount, 0) > 0);

  // (2) Monotonic rise → warns it was still rising at the clip end.
  const rising = detectSprintPhases(framesFromVelocity(risingOnly));
  check("rising-only: available", rising.available === true);
  check("rising-only: warns velocity still rising at end", rising.warnings.some((w) => /still rising/i.test(w)));

  // (3) Sparse / empty input → unavailable with a reason, never fabricated.
  const sparse = detectSprintPhases(framesFromVelocity(riseHoldFall).slice(0, 3));
  check("sparse input → unavailable + warning", sparse.available === false && sparse.bands.length === 0 && sparse.warnings.length > 0);
  check("no frames → unavailable", detectSprintPhases([]).available === false);

  // (4) Determinism.
  const again = detectSprintPhases(framesFromVelocity(riseHoldFall));
  check("deterministic", JSON.stringify(again) === JSON.stringify(report));

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
