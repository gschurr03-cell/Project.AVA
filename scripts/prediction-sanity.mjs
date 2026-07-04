// Runtime sanity for the Performance Predictor v1.
//
//   node scripts/prediction-sanity.mjs
//
// Compiles the (self-contained) prediction module and checks it against known
// example athletes: an elite sprinter (calibrated, high confidence), a club
// athlete (medium), a stride-only fallback (low), and the no-data case. Verifies
// the velocity blend, race-time model, PB/goal diffs, confidence ladder,
// contributing factors, and determinism.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".prediction-sanity-tmp");

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};
const approx = (a, b, tol = 0.05) => a != null && Math.abs(a - b) <= tol;
const between = (v, lo, hi) => v != null && v >= lo && v <= hi;

/** Every field null unless overridden. */
function inputs(overrides = {}) {
  return {
    heightCm: null,
    weightKg: null,
    legLengthCm: null,
    personalBests: {},
    goals: {},
    strideFrequencyHz: null,
    groundContactTimeMs: null,
    flightTimeMs: null,
    metricsTopSpeedMps: null,
    metricsStrideLengthM: null,
    calibratedStepLengthM: null,
    calibratedStrideLengthM: null,
    calibratedAvgVelocityMps: null,
    calibratedTopVelocityMps: null,
    calibrationConfidence: null,
    ...overrides,
  };
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  execFileSync(
    "npx",
    ["tsc", "src/lib/prediction/index.ts", "--outDir", out, "--module", "commonjs", "--target", "es2022", "--skipLibCheck", "--esModuleInterop", "--strict"],
    { cwd: root, stdio: ["ignore", "inherit", "inherit"] },
  );
  const { predictPerformance } = require(path.join(out, "index.js"));

  const byDist = (p) => Object.fromEntries(p.estimates.map((e) => [e.distance, e]));

  // (1) Elite sprinter: calibrated top velocity (high) + agreeing biomech top.
  const elite = predictPerformance(
    inputs({
      legLengthCm: 95,
      heightCm: 185,
      personalBests: { 100: 10.1, 60: 6.6 },
      goals: { 100: 9.95 },
      calibratedTopVelocityMps: 11.5,
      calibrationConfidence: "high",
      metricsTopSpeedMps: 11.4,
      metricsStrideLengthM: 2.5,
      strideFrequencyHz: 4.6,
      groundContactTimeMs: 85,
      flightTimeMs: 130,
    }),
  );
  const e = byDist(elite);
  check("elite: available + high confidence", elite.available && elite.confidence === "high");
  check("elite: Vmax blends to ~11.46 m/s", approx(elite.estimatedTopVelocityMps, 11.46, 0.05));
  check("elite: 100m ≈ 9.7s", approx(e[100].estimateSeconds, 9.7, 0.1));
  check("elite: 60m and 200m plausible", between(e[60].estimateSeconds, 5.9, 6.3) && between(e[200].estimateSeconds, 19.4, 20.3));
  check("elite: 100m ~0.40s faster than PB", approx(e[100].diffFromPb, -0.4, 0.06));
  check("elite: 100m beats goal (negative diff)", e[100].diffFromGoal != null && e[100].diffFromGoal < 0);
  check("elite: two contributing factors, contributions ~sum 1", elite.factors.length === 2 && approx(elite.factors.reduce((s, f) => s + f.contribution, 0), 1, 0.02));
  check("elite: factors sorted by contribution", elite.factors[0].contribution >= elite.factors[1].contribution);
  check("elite: context includes leg length", elite.contextInputs.some((c) => /leg length/i.test(c)));

  // (2) Club athlete: medium calibration.
  const club = predictPerformance(
    inputs({
      personalBests: { 100: 11.8 },
      calibratedTopVelocityMps: 9.0,
      calibrationConfidence: "medium",
      metricsTopSpeedMps: 9.2,
    }),
  );
  const c = byDist(club);
  check("club: medium confidence", club.available && club.confidence === "medium");
  check("club: 100m ≈ 12.2s", approx(c[100].estimateSeconds, 12.2, 0.15));
  check("club: 100m slower than PB (positive diff)", c[100].diffFromPb != null && c[100].diffFromPb > 0);

  // (3) Stride-only fallback → low confidence, still available.
  const strideOnly = predictPerformance(
    inputs({ metricsStrideLengthM: 2.2, strideFrequencyHz: 4.6 }),
  );
  check("stride-only: available at low confidence", strideOnly.available && strideOnly.confidence === "low");
  check("stride-only: uses stride×frequency factor", strideOnly.factors.some((f) => f.key === "strideProduct"));
  check("stride-only: warns about no calibration", strideOnly.warnings.some((w) => /calibrat/i.test(w)));

  // (4) No usable velocity → unavailable, explained, no fabricated numbers.
  const none = predictPerformance(inputs({ heightCm: 180, personalBests: { 100: 11 } }));
  check("no data: unavailable with empty estimates", none.available === false && none.estimates.length === 0 && none.confidence === null);
  check("no data: has an explanatory warning", none.warnings.length > 0);

  // (5) Implausible velocity is rejected (50 m/s ignored → falls back / unavailable).
  const bad = predictPerformance(inputs({ calibratedTopVelocityMps: 50, calibrationConfidence: "high" }));
  check("implausible velocity rejected → unavailable", bad.available === false);

  // (6) Every prediction is labelled an estimate.
  check("disclaimer present on all outputs", [elite, club, strideOnly, none, bad].every((p) => /estimate/i.test(p.disclaimer)));

  // (7) Determinism.
  const eliteAgain = predictPerformance(
    inputs({
      legLengthCm: 95, heightCm: 185, personalBests: { 100: 10.1, 60: 6.6 }, goals: { 100: 9.95 },
      calibratedTopVelocityMps: 11.5, calibrationConfidence: "high", metricsTopSpeedMps: 11.4,
      metricsStrideLengthM: 2.5, strideFrequencyHz: 4.6, groundContactTimeMs: 85, flightTimeMs: 130,
    }),
  );
  check("deterministic", JSON.stringify(eliteAgain) === JSON.stringify(elite));

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
