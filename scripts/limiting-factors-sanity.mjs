// Runtime sanity for Day 78 — limiting-factor diagnosis (intelligence/limitingFactors.ts).
//
//   node scripts/limiting-factors-sanity.mjs
//
// Compiles the pure module and asserts the presentation-support math:
//   • current value / elite benchmark / deficit surfaced from the shared thresholds;
//   • velocity gain uses v = L·f (direct for cadence/step-length, modeled+flagged for
//     ground-contact/flight);
//   • Performance Potential blends gains with diminishing returns and downgrades
//     confidence; is unavailable without a measured top speed.

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

  const limiter = (over) => ({
    key: over.key,
    metricId: over.metricId,
    title: over.title ?? over.key,
    currentValue: over.currentValue,
    unit: over.unit,
    targetRange: over.targetRange,
    severity: "poor",
    rank: over.rank,
    impactScore: 80,
    confidence: over.confidence ?? "medium",
    why: "because",
    reasoning: [],
    affectedPhases: [],
    coachingFocus: "focus",
    drills: [],
  });

  const report = (primary, secondary = []) => ({
    available: true,
    headline: "h",
    primaryLimiter: primary,
    secondaryLimiters: secondary,
    confidence: "medium",
    performanceContext: null,
    dataGaps: [],
    warnings: [],
    method: "m",
  });

  const measurements = { maxVelocityMps: 10.4, zoneVelocityMps: 10.2, combinedStepFrequencyHz: 4.4, avgIndividualStepLengthM: 2.16 };

  // Cadence limiter (higher-is-better; elite min 4.8): deficit 0.4 Hz → 8.3%.
  const cadence = limiter({ key: "cadence", metricId: "stepFrequency", currentValue: 4.4, unit: "Hz", targetRange: "4.8–5.2 Hz", rank: 1, confidence: "high" });
  const dCad = deriveLimitingFactors(report(cadence), measurements);
  const f0 = dCad.factors[0];
  check("cadence: current value + unit surfaced", f0.currentText === "4.40 Hz");
  check("cadence: elite benchmark surfaced", /4\.8/.test(f0.eliteBenchmarkText) && near(f0.eliteTargetValue, 4.8));
  check("cadence: deficit % ≈ 8.3", near(f0.deficitPct, 8.3, 0.2));
  check("cadence: DIRECT velocity gain via v=L·f (≈0.87, not modeled)", near(f0.estimatedVelocityGainMps, 10.4 * (0.4 / 4.8), 0.02) && f0.velocityGainModeled === false);

  // Ground contact (lower-is-better; elite max 95): deficit 25 ms, modeled coupling 0.5.
  const gc = limiter({ key: "groundContact", metricId: "groundContactTime", currentValue: 120, unit: "ms", targetRange: "75–95 ms", rank: 1 });
  const dGc = deriveLimitingFactors(report(gc), measurements);
  const g0 = dGc.factors[0];
  check("ground contact: deficit text says 'over elite'", /over elite/.test(g0.deficitText));
  check("ground contact: MODELED velocity gain (coupling 0.5, flagged)", near(g0.estimatedVelocityGainMps, 10.4 * (25 / 95) * 0.5, 0.02) && g0.velocityGainModeled === true);

  // Performance potential: blends with diminishing returns, downgrades confidence.
  const dTwo = deriveLimitingFactors(report(cadence, [gc]), measurements);
  const p = dTwo.potential;
  const gains = dTwo.factors.map((f) => f.estimatedVelocityGainMps);
  const blended = 1 - gains.reduce((acc, x) => acc * (1 - x / 10.4), 1);
  check("potential available with 2 factors", p.available && p.factorsApplied === 2);
  check("achievable = v0·(1+blend), diminishing (< naive sum)", near(p.achievableTopSpeedMps, 10.4 * (1 + blended), 0.03) && p.achievableTopSpeedMps < 10.4 + gains[0] + gains[1]);
  check("percent improvement > 0", p.percentImprovement > 0);
  check("confidence downgraded from factor min (medium→low)", p.confidence === "low");

  // No measured top speed → gains null, potential unavailable.
  const dNoV = deriveLimitingFactors(report(cadence), { maxVelocityMps: null, zoneVelocityMps: null, combinedStepFrequencyHz: 4.4, avgIndividualStepLengthM: 2.16 });
  check("no top speed → gain null + potential unavailable", dNoV.factors[0].estimatedVelocityGainMps === null && dNoV.potential.available === false);

  // No limiters → not available, at most 3 factors otherwise.
  check("no limiters → diagnosis unavailable", deriveLimitingFactors(report(null), measurements).available === false);
  check("caps at 3 factors", deriveLimitingFactors(report(cadence, [gc, cadence, gc, cadence]), measurements).factors.length === 3);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
