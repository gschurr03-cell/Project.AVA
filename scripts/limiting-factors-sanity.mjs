// Runtime sanity for Day 79 — trusted-source limiting-factor diagnosis
// (intelligence/limitingFactors.ts).
//
//   node scripts/limiting-factors-sanity.mjs
//
// Compiles the pure module and asserts:
//   • ranking reads ONLY the four trusted metrics (Frequency, Step Length, Top Speed,
//     Average Velocity), never a conflicting source;
//   • AVA ALWAYS returns ranked #1/#2/#3 — "limiting" mode when any deficit exists,
//     "unlocks" mode (ranked by closest margin) when all are elite;
//   • Frequency shows once, labelled "Frequency" in Hz, sourced from trusted frequencyHz;
//   • velocity gain is a v=L·f estimate for LEVERS only (outcomes carry no gain);
//   • Performance Potential is based on trusted top speed with diminishing returns.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".limiting-factors-sanity-tmp");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return originalResolve.call(this, request.startsWith("@/") ? path.join(out, request.slice(2)) : request, ...rest);
};

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};
const near = (a, b, eps = 0.02) => a != null && b != null && Math.abs(a - b) <= eps;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] } },
      files: [path.join(root, "src/lib/intelligence/limitingFactors.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { deriveLimitingFactors } = require(path.join(out, "lib/intelligence/limitingFactors.js"));

  // Trusted metrics matching the reported real session (source of truth). AVA stride
  // length = opposite-foot contact distance; the DIAGNOSIS uses PEAK (best 4 strides).
  const trusted = (over = {}) => ({
    topSpeedMps: 10.78,
    avgVelocityMps: 10.42,
    avgStrideLengthM: 2.16,
    peakStrideLengthM: 2.31,
    strideRetentionPct: 93.5,
    strideLengthM: 2.31, // diagnosis value = peak
    frequencyHz: 4.85,
    zoneDistanceM: 20,
    zoneTimeS: 1.92,
    stepLengthConfidence: "high",
    ...over,
  });

  const byKey = (d, k) => d.factors.find((f) => f.key === k);

  // (1) Real session → "limiting" mode, exactly 3 ranked factors; the stride factor is
  // labelled "Stride Length" and uses the PEAK stride (2.31 m), not the average.
  const d = deriveLimitingFactors(trusted());
  check("always returns 3 ranked factors", d.available && d.factors.length === 3 && d.factors.every((f, i) => f.rank === i + 1));
  check("mode is 'limiting' when deficits exist", d.mode === "limiting");
  check("stride factor labelled 'Stride Length', sourced from trusted PEAK stride (2.31 m)", byKey(d, "stepLength")?.label === "Stride Length" && byKey(d, "stepLength")?.currentText === "2.31 m" && byKey(d, "stepLength")?.unit === "m");
  check("elite frequency (4.85) is NOT surfaced as a limiter", !byKey(d, "frequency"));
  check("stride LEVER gain via v=L·f (kept internal)", near(byKey(d, "stepLength").estimatedVelocityGainMps, 10.78 * ((2.45 - 2.31) / 2.45), 0.03) && byKey(d, "stepLength").isOutcome === false);
  check("stride shows an IMPACT BAND (High) not an exact m/s", byKey(d, "stepLength").impactBand === "high");
  check("Top Speed is an OUTCOME with no gain + no impact band", byKey(d, "topSpeed").isOutcome === true && byKey(d, "topSpeed").estimatedVelocityGainMps === null && byKey(d, "topSpeed").impactBand === null);

  // Performance Velocity Estimation: practice top speed × a conservative 2–3% uplift.
  const p = d.potential;
  check("velocity estimate base = trusted practice top speed (10.78)", near(p.practiceTopSpeedMps, 10.78));
  check("meet range = practice × 1.02–1.03 (≈ 11.00–11.10)", near(p.meetLowMps, 10.78 * 1.02, 0.01) && near(p.meetHighMps, 10.78 * 1.03, 0.01));
  check("meet estimate is realistic (≤ +3%, no impossible jump)", p.meetHighMps <= p.practiceTopSpeedMps * 1.03 + 1e-9 && p.achievableTopSpeedMps === undefined);

  // (2) Frequency deficit → appears once, labelled "Frequency" in Hz, from trusted.
  const dFreq = deriveLimitingFactors(trusted({ frequencyHz: 4.4 }));
  const freq = byKey(dFreq, "frequency");
  check("frequency below elite surfaces as 'Frequency' in Hz", freq && freq.label === "Frequency" && freq.unit === "Hz" && freq.currentText === "4.40 Hz");
  check("frequency appears exactly once", dFreq.factors.filter((f) => f.key === "frequency").length === 1);

  // Band thresholds: a near-elite lever (tiny deficit) → LOW impact band.
  const dLow = deriveLimitingFactors(trusted({ strideLengthM: 2.42 }));
  check("near-elite lever → LOW impact band", byKey(dLow, "stepLength")?.impactBand === "low");

  // (2b) Day 81/82 — stride length judged by PEAK TROCHANTER ratio when leg length is
  // present; average + retention carried as context.
  const dTro = deriveLimitingFactors(trusted(), { legLengthCm: 99 });
  const stepTro = byKey(dTro, "stepLength");
  check("leg length present → stride target is peak trochanter next milestone (~2.48 m, not 2.45)", stepTro && near(stepTro.eliteTargetValue, 2.475, 0.02));
  check("stride factor carries PEAK trochanter data (2.33×, next 2.50×)", stepTro?.trochanter?.ratioText === "2.33×" && near(stepTro.trochanter.nextTargetRatio, 2.5));
  check("stride factor carries avg + retention context", stepTro?.trochanter?.avgStrideText === "2.16 m" && stepTro?.trochanter?.retentionText === "93.5%");
  check("stride benchmark copy is trochanter-based, not generic metres", /trochanter/.test(stepTro?.eliteBenchmarkText ?? "") && !/2\.45/.test(stepTro?.eliteBenchmarkText ?? ""));

  // Peak strong but average lagging → coaching note.
  const dLag = deriveLimitingFactors(trusted({ strideRetentionPct: 88 }), { legLengthCm: 99 });
  check("strong peak + low retention → 'zone retention is lagging' note", /retention is lagging/i.test(byKey(dLag, "stepLength")?.trochanter?.retentionNote ?? ""));

  // Fallback: no leg length → generic metre elite target 2.45 m, no trochanter data.
  const stepGen = byKey(deriveLimitingFactors(trusted()), "stepLength");
  check("no leg length → generic 2.45 m target + trochanter null (fallback preserved)", near(stepGen?.eliteTargetValue, 2.45) && stepGen?.trochanter == null);

  // Review: peak ratio > 2.70× is a measurement check, NOT a ranked performance limiter.
  const dReview = deriveLimitingFactors(trusted({ strideLengthM: 2.8 }), { legLengthCm: 100 });
  check(">2.70× → stride length dropped (measurement check, not a limiter)", !byKey(dReview, "stepLength") && dReview.factors.length === 3);

  // (3) All metrics elite → NEVER empty; "unlocks" mode ranked by closest margin.
  const dElite = deriveLimitingFactors(trusted({ topSpeedMps: 12.0, avgVelocityMps: 11.5, strideLengthM: 2.6, frequencyHz: 5.0 }));
  check("all-elite → still 3 ranked factors (never 'nothing stands out')", dElite.available && dElite.factors.length === 3);
  check("all-elite → mode is 'unlocks'", dElite.mode === "unlocks");
  check("all-elite → every surfaced factor is at/above elite", dElite.factors.every((f) => f.belowElite === false));
  check("all-elite → ranked by smallest margin first", dElite.factors[0].marginPct <= dElite.factors[1].marginPct && dElite.factors[1].marginPct <= dElite.factors[2].marginPct);
  check("all-elite → velocity estimate still practice × 1.02–1.03", dElite.potential.available && near(dElite.potential.meetLowMps, 12.0 * 1.02, 0.01) && near(dElite.potential.meetHighMps, 12.0 * 1.03, 0.01));

  // (4) No top speed → potential unavailable but factors still rank.
  const dNoTop = deriveLimitingFactors(trusted({ topSpeedMps: null, avgVelocityMps: null }));
  check("no top speed → potential unavailable, factors still present", dNoTop.potential.available === false && dNoTop.factors.length >= 1);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
