// Runtime sanity for Day 82 — AVA stride aggregates + trusted mapping.
//
//   node scripts/stride-metrics-sanity.mjs
//
// Asserts:
//   • peakStrideLengthM = average of the best 4 opposite-foot distances;
//   • with 2–3 valid distances it averages what's available; <2 → null;
//   • strideRetentionPct = avg ÷ peak × 100;
//   • trusted.strideLengthM prefers PEAK over average (diagnosis input), falling back
//     to average when peak is unavailable.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".stride-metrics-sanity-tmp");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return originalResolve.call(this, request.startsWith("@/") ? path.join(out, request.slice(2)) : request, ...rest);
};

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};
const near = (a, b, eps = 0.005) => a != null && b != null && Math.abs(a - b) <= eps;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] } },
      files: [
        path.join(root, "src/lib/benchmark/strideMetrics.ts"),
        path.join(root, "src/lib/intelligence/trustedMetrics.ts"),
      ],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { computePeakStrideLengthM, computeStrideRetentionPct } = require(path.join(out, "lib/benchmark/strideMetrics.js"));
  const { buildTrustedMetrics } = require(path.join(out, "lib/intelligence/trustedMetrics.js"));

  // Peak = highest ROLLING average of 4 CONSECUTIVE strides (best sustained), NOT the
  // four biggest individual strides. Order is preserved; no sorting.
  check(
    "peak = best rolling window of 4 (task example → 2.255)",
    near(computePeakStrideLengthM([2.14, 2.18, 2.24, 2.29, 2.27, 2.22, 2.15]), 2.255, 0.0005),
  );
  // Spiky sequence: the big strides are NOT consecutive → rolling avg (2.25) is well
  // below the sorted-top-4 (2.375). Proves we don't cherry-pick the biggest strides.
  const spiky = [2.5, 2.0, 2.5, 2.0, 2.5, 2.0];
  check("peak does NOT sort / cherry-pick biggest (spiky → 2.25, not 2.375)", near(computePeakStrideLengthM(spiky), 2.25) && computePeakStrideLengthM(spiky) < 2.375);
  // Monotonic increasing → best window is the last 4.
  check("monotonic increasing → best rolling 4 = last 4 (2.35)", near(computePeakStrideLengthM([2.0, 2.1, 2.2, 2.3, 2.4, 2.5]), 2.35));
  // Invalid strides filtered (order preserved), then the single 4-window remains.
  check("peak ignores invalid (≤0 / NaN), rolling over the valid ones", near(computePeakStrideLengthM([2.0, -1, 0, NaN, 2.5, 2.2, 2.3]), (2.0 + 2.5 + 2.2 + 2.3) / 4));
  // Fallbacks: exactly 3 → window 3; exactly 2 → window 2; <2 → null.
  check("3 valid → best rolling 3 (the single window)", near(computePeakStrideLengthM([2.0, 2.5, 2.2]), (2.0 + 2.5 + 2.2) / 3));
  check("2 valid → best rolling 2 (the single window)", near(computePeakStrideLengthM([2.0, 2.5]), 2.25));
  check("1 valid → null", computePeakStrideLengthM([2.0]) === null);
  check("0 valid → null", computePeakStrideLengthM([]) === null);

  // Retention = avg ÷ peak × 100.
  check("retention 2.16 / 2.31 ≈ 93.5%", near(computeStrideRetentionPct(2.16, 2.31), 93.506, 0.01));
  check("retention null when peak missing / 0", computeStrideRetentionPct(2.16, null) === null && computeStrideRetentionPct(2.16, 0) === null);

  // Trusted mapping: strideLengthM PREFERS peak.
  const m = {
    calibrated: true,
    stepLengthConfidence: "high",
    avgIndividualStepLengthM: 2.16,
    avgZoneStepLengthM: 2.22,
    peakStrideLengthM: 2.31,
    maxVelocityMps: 10.78,
    zoneVelocityMps: 10.42,
    combinedStepFrequencyHz: 4.85,
    zone: { distanceM: 20 },
    zoneTimeS: 1.92,
  };
  const t = buildTrustedMetrics(m);
  check("trusted.strideLengthM prefers PEAK (2.31)", near(t.strideLengthM, 2.31));
  check("trusted exposes avg (2.16) + peak (2.31) + retention (~93.5%)", near(t.avgStrideLengthM, 2.16) && near(t.peakStrideLengthM, 2.31) && near(t.strideRetentionPct, 93.5, 0.1));

  // Fallback: no peak → strideLengthM falls back to average, retention null.
  const tNoPeak = buildTrustedMetrics({ ...m, peakStrideLengthM: null });
  check("no peak → strideLengthM falls back to average (2.16), retention null", near(tNoPeak.strideLengthM, 2.16) && tNoPeak.strideRetentionPct === null);

  // Uncalibrated → null.
  check("uncalibrated → trusted null", buildTrustedMetrics({ ...m, calibrated: false }) === null);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
