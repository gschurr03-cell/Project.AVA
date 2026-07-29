// Runtime sanity for Day 66 — timing-gate BAR calibration.
//
//   node scripts/gates-sanity.mjs
//
// Compiles src/lib/calibration/gates.ts and asserts:
//   1. gateMidpoint returns the midpoint of a bar's two cones.
//   2. gatesToManualPoints reduces the two bars to the two-point midpoints the
//      measurement/benchmark engines already consume (x/y + placement times +
//      distance), so downstream maths is unchanged.
//   3. calibrationGatesSchema accepts a valid gate set and rejects out-of-range
//      cones, a non-positive distance, and a negative placement time.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".gates-sanity-tmp");

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
        path.join(root, "src/lib/calibration/gates.ts"),
        path.join(root, "src/lib/measurement/timingPolicy.ts"),
      ],
    }),
  );
  execFileSync("npx", ["tsc", "-p", tsconfigPath], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { gateMidpoint, gatesToManualPoints, calibrationGatesSchema } = require(
    path.join(out, "lib/calibration/gates.js"),
  );
  const {
    CONSERVATIVE_TIMING_POLICY_V1,
    reportStrideWindows,
    reportTimeSeconds,
    timedMetric,
    velocityFromReportedTime,
  } = require(path.join(out, "lib/measurement/timingPolicy.js"));

  check("timing policy is versioned", CONSERVATIVE_TIMING_POLICY_V1 === "CONSERVATIVE_TIMING_POLICY_V1");
  check("exact hundredths remain exact", reportTimeSeconds(1.92) === 1.92);
  check("floating noise does not add a hundredth", reportTimeSeconds(1.9200000000000002) === 1.92);
  check("times conservatively ceil", [1.9201, 1.9299, 1.9305, 0.9341].map(reportTimeSeconds).join(",") === "1.93,1.93,1.94,0.94");
  const officialTime = timedMetric(1.9305);
  const officialVelocity = velocityFromReportedTime(20, officialTime.rawSeconds);
  check("raw time remains unchanged", officialTime.rawSeconds === 1.9305);
  check("display is formatting only", officialTime.displaySeconds === officialTime.reportedSeconds.toFixed(2));
  check("average velocity uses reported time", approx(officialVelocity, 20 / 1.94));
  const top = reportStrideWindows([
    { startContactIndex: 0, endContactIndex: 2, distanceM: 2.1, rawDurationS: 0.1901 },
    { startContactIndex: 1, endContactIndex: 3, distanceM: 2.2, rawDurationS: 0.2001 },
  ]);
  check("each stride velocity uses its reported duration", top.windows.every((w) => approx(w.reportedVelocityMps, w.distanceM / w.reportedDurationS)));
  check("top speed selects the highest reported stride velocity", top.reportedTopVelocityMps === Math.max(...top.windows.map((w) => w.reportedVelocityMps)));

  // A start bar (cones at x 0.20/0.30, y 0.80/0.78 @ t=1.0) and a finish bar
  // (cones at x 0.70/0.80, y 0.60/0.58 @ t=2.5), 20 m apart.
  const gates = {
    startGate: { c1: { x: 0.2, y: 0.8 }, c2: { x: 0.3, y: 0.78 }, timeS: 1.0 },
    finishGate: { c1: { x: 0.7, y: 0.6 }, c2: { x: 0.8, y: 0.58 }, timeS: 2.5 },
    distanceM: 20,
  };

  // (1) Midpoints.
  const sMid = gateMidpoint(gates.startGate);
  check("gateMidpoint averages the two cones", approx(sMid.x, 0.25) && approx(sMid.y, 0.79));

  // (2) Reduction to the two-point calibration the engines consume.
  const mp = gatesToManualPoints(gates);
  check("reduced ax/ay = start gate midpoint", approx(mp.ax, 0.25) && approx(mp.ay, 0.79));
  check("reduced bx/by = finish gate midpoint", approx(mp.bx, 0.75) && approx(mp.by, 0.59));
  check("distance carried through", mp.distanceM === 20);
  check(
    "placement times carried through (start→A, finish→B)",
    mp.aTimeS === 1.0 && mp.bTimeS === 2.5,
  );
  check("world x-gap between midpoints is 0.50 (drives the pixel→metre scale)", approx(Math.abs(mp.ax - mp.bx), 0.5));

  // (3) Schema validation.
  check("valid gate set parses", calibrationGatesSchema.safeParse(gates).success === true);
  check(
    "cone x outside [0,1] rejected",
    calibrationGatesSchema.safeParse({ ...gates, startGate: { ...gates.startGate, c1: { x: 1.5, y: 0.8 } } }).success ===
      false,
  );
  check(
    "non-positive distance rejected",
    calibrationGatesSchema.safeParse({ ...gates, distanceM: 0 }).success === false,
  );
  check(
    "negative placement time rejected",
    calibrationGatesSchema.safeParse({ ...gates, finishGate: { ...gates.finishGate, timeS: -1 } }).success === false,
  );

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
