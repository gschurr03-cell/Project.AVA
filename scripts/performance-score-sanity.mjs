// Runtime sanity for Day 84 — AVA Performance Score (trusted-only).
//
//   node scripts/performance-score-sanity.mjs
//
// Asserts the score uses ONLY trusted metrics (no ground contact / flight time /
// raw frequency), that elite trusted inputs score high and poor inputs score lower,
// that missing required trusted metrics returns "not enough trusted data", and that
// leg length switches the stride subscore to a trochanter ratio.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".performance-score-sanity-tmp");
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
      files: [path.join(root, "src/lib/intelligence/performanceScore.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { calculateAvaPerformanceScore } = require(path.join(out, "lib/intelligence/performanceScore.js"));

  const elite = {
    topSpeedMps: 11.6, avgVelocityMps: 11.0, frequencyHz: 5.0,
    avgStrideLengthM: 2.4, peakStrideLengthM: 2.5, strideRetentionPct: 97,
    trochanterHeightM: 1.00, recordingQualityScore: 95,
  };
  const poor = {
    topSpeedMps: 8.5, avgVelocityMps: 8.5, frequencyHz: 4.0,
    avgStrideLengthM: 1.95, peakStrideLengthM: 2.0, strideRetentionPct: 82,
    trochanterHeightM: 1.00, recordingQualityScore: 60,
  };

  const rElite = calculateAvaPerformanceScore(elite);
  const rPoor = calculateAvaPerformanceScore(poor);

  check("trustedOnly flag is true", rElite.trustedOnly === true);
  check("elite trusted metrics → Elite label, score ≥ 90", rElite.available && rElite.score >= 90 && rElite.label === "Elite");
  check("poor trusted metrics → much lower score than elite", rPoor.available && rPoor.score < rElite.score - 30);
  check("poor trusted metrics → not an elite/high label", rPoor.label === "Needs Work" || rPoor.label === "Developing");

  // Temporal metrics are NEITHER accepted NOR used: passing them changes nothing.
  const withTemporal = calculateAvaPerformanceScore({ ...elite, groundContactTimeMs: 999, flightTimeMs: 999 });
  check("ground contact / flight time are ignored (identical score)", withTemporal.score === rElite.score);
  check("no component references ground contact or flight time", !rElite.components.some((c) => /ground|flight/i.test(c.name + c.explanation)));

  // Frequency comes from the trusted input only — raw 3.53 can't be injected.
  const withRawFreq = calculateAvaPerformanceScore({ ...elite, strideFrequencyHz: 3.53 });
  const freqComp = rElite.components.find((c) => c.name === "Frequency");
  check("frequency uses trusted frequencyHz (5.0), raw strideFrequencyHz ignored", withRawFreq.score === rElite.score && freqComp.value === 5.0);
  const freq485 = calculateAvaPerformanceScore({ ...elite, frequencyHz: 4.85 }).components.find((c) => c.name === "Frequency");
  check("trusted 4.85 Hz frequency scores high (≥ 90), never 3.53-based", freq485.value === 4.85 && freq485.score >= 90);

  // Dedicated trochanter height switches the stride subscore to a trochanter ratio.
  const withLeg = calculateAvaPerformanceScore({ ...elite, peakStrideLengthM: 2.16, trochanterHeightM: 0.99 });
  const withoutLeg = calculateAvaPerformanceScore({ ...elite, peakStrideLengthM: 2.16, trochanterHeightM: null });
  const legComp = withLeg.components.find((c) => /trochanter/i.test(c.name));
  const genericComp = withoutLeg.components.find((c) => c.name === "Peak Stride Length");
  check("trochanter height present → stride scored by ratio (~2.18×)", legComp != null && Math.abs(legComp.value - 2.16 / 0.99) < 0.02);
  check("trochanter height missing → generic peak stride length band", genericComp != null && genericComp.value === 2.16);

  // Missing required trusted metrics → not enough trusted data (never a fake 0).
  const missing = calculateAvaPerformanceScore({ ...elite, peakStrideLengthM: null });
  check("missing required trusted metric → available false, score null, no fake 0", missing.available === false && missing.score === null && /not enough trusted data/i.test(missing.note));
  check("no top speed → unavailable", calculateAvaPerformanceScore({ ...elite, topSpeedMps: null }).available === false);

  // Optional metrics renormalize: dropping retention + quality still scores.
  const noOptional = calculateAvaPerformanceScore({ ...elite, strideRetentionPct: null, recordingQualityScore: null });
  const weightSum = noOptional.components.reduce((s, c) => s + c.weight, 0);
  check("optional metrics absent → weights renormalize to ~1.0, still available", noOptional.available && Math.abs(weightSum - 1) < 0.001 && noOptional.components.length === 4);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
