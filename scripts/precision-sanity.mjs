// Runtime sanity for Day 69 — FPS precision-mode classifier (precision.ts).
//
//   node scripts/precision-sanity.mjs
//
// Compiles src/lib/benchmark/precision.ts and asserts the FPS-based metric tiers:
//   • timing metrics (contact/flight) → requiresHigherFps below 120 fps, primary at/above;
//   • per-side metrics → diagnostic at any fps;
//   • zone/spatial metrics → always primary;
//   • isPrecisionLimited flips at the 120 fps boundary (and for unknown fps).

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".precision-sanity-tmp");

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
      files: [path.join(root, "src/lib/benchmark/precision.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", tsconfigPath], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { classifyMetric, isPrecisionLimited, HIGH_PRECISION_TIMING_FPS, PRECISION_TIMING_MESSAGE } = require(
    path.join(out, "lib/benchmark/precision.js"),
  );

  check("HIGH_PRECISION_TIMING_FPS is 120", HIGH_PRECISION_TIMING_FPS === 120);

  // isPrecisionLimited boundary.
  check("60 fps is precision-limited", isPrecisionLimited(60) === true);
  check("119 fps is precision-limited", isPrecisionLimited(119) === true);
  check("120 fps is NOT precision-limited", isPrecisionLimited(120) === false);
  check("240 fps is NOT precision-limited", isPrecisionLimited(240) === false);
  check("unknown fps is treated as precision-limited", isPrecisionLimited(null) === true);

  // Timing metrics: requiresHigherFps at 60, primary at 120.
  for (const k of ["groundContactLeftMs", "flightRightMs", "groundContactTimeMs", "flightTimeMs"]) {
    check(`${k} → requiresHigherFps at 60 fps`, classifyMetric(k, 60) === "requiresHigherFps");
    check(`${k} → primary at 120 fps`, classifyMetric(k, 120) === "primary");
  }

  // Per-side metrics: diagnostic regardless of fps.
  for (const k of ["leftStepLengthM", "rightStepFrequencyHz", "leftContacts"]) {
    check(`${k} → diagnostic at 60 fps`, classifyMetric(k, 60) === "diagnostic");
    check(`${k} → diagnostic at 240 fps`, classifyMetric(k, 240) === "diagnostic");
  }

  // Trusted zone/spatial metrics: always primary.
  for (const k of ["avgStepLengthM", "avgZoneStepLengthM", "maxVelocityMps", "avgVelocityMps", "zoneTimeS", "combinedStepFrequencyHz"]) {
    check(`${k} → primary at 60 fps`, classifyMetric(k, 60) === "primary");
  }

  check("precision message mentions 120–240 fps", /120.?240 fps/.test(PRECISION_TIMING_MESSAGE));

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
