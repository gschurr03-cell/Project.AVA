// Runtime sanity for Day 76 — trend engine (coaching/trends.ts, analyzeTrend).
//
//   node scripts/trends-sanity.mjs
//
// Compiles src/lib/coaching/trends.ts and asserts analyzeTrend gives a MEANINGFUL
// read (direction respecting higher/lower-is-better, rate per session, confidence
// from sample size) and never invents a direction from a single point.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".trends-sanity-tmp");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return originalResolve.call(this, request.startsWith("@/") ? path.join(out, request.slice(2)) : request, ...rest);
};

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] } },
      files: [path.join(root, "src/lib/coaching/trends.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { analyzeTrend, summarizeAthlete } = require(path.join(out, "lib/coaching/trends.js"));

  // Dashboard snapshot on an athlete with no analyses → honest empty read.
  const empty = summarizeAthlete([]);
  check("no analyses → snapshot is empty + insufficient trend", empty.sessionsAnalyzed === 0 && empty.latestTechnique === null && empty.techniqueTrend.direction === "insufficient");

  // Single point → never a fabricated direction.
  check("one session → insufficient", analyzeTrend([4.5], { higherIsBetter: true }).direction === "insufficient");

  // Rising series, higher-is-better → improving; slope positive.
  const up = analyzeTrend([4.0, 4.2, 4.4, 4.6, 4.8], { higherIsBetter: true, unit: "Hz" });
  check("rising + higherIsBetter → improving", up.direction === "improving" && up.ratePerSession > 0);
  check("improving over 5 sessions → high confidence", up.confidence === "high");
  check("summary cites % and per-session rate", /%/.test(up.summary) && /session/.test(up.summary));

  // Falling ground-contact (lower-is-better) is an IMPROVEMENT.
  const gc = analyzeTrend([120, 116, 112, 108], { higherIsBetter: false, unit: "ms" });
  check("falling + lowerIsBetter → improving", gc.direction === "improving");
  check("4 sessions → medium confidence", gc.confidence === "medium");

  // Rising ground-contact (lower-is-better) is a DECLINE.
  check("rising + lowerIsBetter → declining", analyzeTrend([108, 112, 116, 120], { higherIsBetter: false }).direction === "declining");

  // Near-flat series → plateauing (within the flat band).
  check("flat series → plateauing", analyzeTrend([4.5, 4.51, 4.49, 4.5], { higherIsBetter: true }).direction === "plateauing");

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
