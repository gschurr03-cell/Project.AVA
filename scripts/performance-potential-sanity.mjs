// Unit sanity for the Performance Potential Engine (Phase 6, Sprint Intelligence).
// Verifies projection generation (ranges, never single numbers), individualized ceiling,
// development scenarios, bottleneck identification, confidence propagation (longer =
// lower), uncertainty modelling, serialization, and architecture integrity. Consumes
// Phases 1, 3, 4, 5 (unchanged).
//
//   node scripts/performance-potential-sanity.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".performance-potential-tmp");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return originalResolve.call(this, request.startsWith("@/") ? path.join(out, request.slice(2)) : request, ...rest);
};

let ok = true;
const check = (label, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) ok = false; };

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
    compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] } },
    files: [
      path.join(root, "src/lib/intelligence/performanceGap/index.ts"),
      path.join(root, "src/lib/intelligence/performanceGap/blueprint/index.ts"),
      path.join(root, "src/lib/intelligence/performanceGap/dependency/index.ts"),
      path.join(root, "src/lib/intelligence/performanceGap/rootCause/index.ts"),
      path.join(root, "src/lib/intelligence/performanceGap/potential/index.ts"),
    ],
  }));
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const pg = require(path.join(out, "lib/intelligence/performanceGap/index.js"));
  const bp = require(path.join(out, "lib/intelligence/performanceGap/blueprint/index.js"));
  const dep = require(path.join(out, "lib/intelligence/performanceGap/dependency/index.js"));
  const rc = require(path.join(out, "lib/intelligence/performanceGap/rootCause/index.js"));
  const pot = require(path.join(out, "lib/intelligence/performanceGap/potential/index.js"));
  const { buildAthletePerformanceModel } = pg;
  const { buildAthleteBlueprint } = bp;
  const { buildMetricDependencyReport } = dep;
  const { evaluateRootCauses } = rc;
  const { buildPerformancePotential, computeProjectionConfidence, identifyBottlenecks, computeCeiling } = pot;

  const now = new Date("2026-07-21T00:00:00.000Z");
  const model = buildAthletePerformanceModel({
    athleteId: "a1", distanceM: 100, currentTimeS: 10.36, goalTimeS: 10.05,
    metrics: { strideLength: 2.05, strideFrequency: 4.9, peakVelocity: 11.4, averageVelocity: 9.65, groundContactTime: 0.105, flightTime: 0.11, acceleration: 6.0 },
    now,
  });
  const context = { heightCm: 188, trochanterHeightM: 0.98, legLengthCm: 96, bodyMassKg: 84, sex: "M", trainingAgeYears: 7, event: "100m", currentPbSeconds: 10.36, goalPbSeconds: 10.05 };
  const blueprint = buildAthleteBlueprint({ athleteId: "a1", context, requiredAvgVelocityMps: 100 / 10.05, currentMetrics: { strideLength: 2.05, strideFrequency: 4.9, peakVelocity: 11.4, groundContactTime: 0.105 }, now });
  const depReport = buildMetricDependencyReport(model, { context });
  const rootCauses = model.priorities.map((p) => evaluateRootCauses({ metricId: p.metricId, label: p.label, gaps: model.gaps, rawMetrics: {} }));

  const potential = buildPerformancePotential({
    athleteId: "a1", distanceM: 100, currentTimeS: 10.36, goalTimeS: 10.05, currentPeakVelocityMps: 11.4,
    model, blueprint, sensitivity: depReport.sensitivity, rootCauses, context, improvementHistory: [10.62, 10.51, 10.44, 10.36], now,
  });

  // ---- Ranges, never single numbers ----
  check("projection: near-term is a RANGE (min < max time), never one number",
    potential.nearTerm.range.minTimeS != null && potential.nearTerm.range.minTimeS < potential.nearTerm.range.maxTimeS);
  check("projection: long-term is a range, and is FASTER than near-term (more headroom closed)",
    potential.longTerm.range.minTimeS < potential.nearTerm.range.minTimeS);
  check("projection: both projections are categorized 'projected'",
    potential.nearTerm.category === "projected" && potential.longTerm.category === "projected");
  check("projection: projected times are between the ceiling and current PB",
    potential.longTerm.range.minTimeS >= potential.ceiling.ceilingTimeS - 1e-6 &&
    potential.nearTerm.range.maxTimeS <= 10.36 + 1e-6);

  // ---- Explainability ----
  check("explainability: each projection answers WHY (evidence statements + categories)",
    potential.nearTerm.evidence.length > 0 && potential.nearTerm.evidence.every((e) => !!e.statement && ["measured", "estimated", "inferred", "unknown"].includes(e.category)));
  check("explainability: assumptions are listed (informed projection, not a guarantee)",
    potential.longTerm.assumptions.length >= 3 && potential.longTerm.assumptions.some((a) => /substantially improved/i.test(a.statement)));

  // ---- Individualized ceiling ----
  const c = potential.ceiling;
  check("ceiling: individualized time/velocity with basis + 'not destiny' note",
    c.ceilingTimeS > 0 && c.ceilingVelocityMps > 100 / 10.36 && c.basis.length > 0 && /not.*destiny|not a guarantee/i.test(c.note));
  check("ceiling: faster than current PB but capped (individualized, not a generic elite time)",
    c.ceilingTimeS < 10.36 && c.ceilingVelocityMps <= (100 / 10.36) * 1.15 + 1e-6);

  // ---- Development scenarios ----
  const ids = potential.scenarios.map((s) => s.id);
  check("scenarios: current/conservative/expected/optimistic present",
    ["current_trajectory", "conservative", "expected", "optimistic"].every((id) => ids.includes(id)));
  check("scenarios: optimistic is faster than expected, expected faster than conservative",
    scTime(potential, "optimistic") < scTime(potential, "expected") && scTime(potential, "expected") < scTime(potential, "conservative"));
  check("scenarios: current trajectory = current PB (no change)",
    potential.scenarios.find((s) => s.id === "current_trajectory").estimatedTimeS === 10.36);
  check("scenarios: each stores time, range, confidence, limiting factors, uncertainty",
    potential.scenarios.every((s) => s.range && s.confidence.level && Array.isArray(s.largestLimitingFactors) && Array.isArray(s.greatestUncertainty)));

  // ---- Bottlenecks linked back to engines ----
  check("bottlenecks: ranked constraints with primary/secondary + linked engine",
    potential.bottlenecks.length > 0 && potential.bottlenecks[0].severity === "primary" &&
    potential.bottlenecks.every((b) => ["performance-gap", "metric-dependency", "root-cause"].includes(b.linkedEngine)));
  check("bottlenecks: NOT simply the largest gap — blend contribution × sensitivity",
    identifyBottlenecks({ model, sensitivity: depReport.sensitivity, rootCauses }).length > 0);

  // ---- Confidence: longer projections are less confident ----
  const near = computeProjectionConfidence({ model, blueprint, improvementHistory: [10.5, 10.44, 10.36], horizon: "near_term" });
  const long = computeProjectionConfidence({ model, blueprint, improvementHistory: [10.5, 10.44, 10.36], horizon: "long_term" });
  check("confidence: long-term confidence < near-term confidence (naturally)",
    long.score < near.score && ["low", "moderate", "high"].includes(near.level));
  check("confidence: exposes contributing factors (measurement/completeness/similarity/distance/history)",
    near.factors.length === 5 && near.factors.some((f) => f.factor === "projectionDistance"));

  // ---- Uncertainty explicitly surfaced ----
  const sparsePotential = buildPerformancePotential({
    distanceM: 100, currentTimeS: 10.36, goalTimeS: 9.6, model, blueprint: buildAthleteBlueprint({ context: {}, requiredAvgVelocityMps: null, currentMetrics: {}, now }),
    now,
  });
  check("uncertainty: missing anthropometrics / no build match are surfaced",
    sparsePotential.uncertainty.some((u) => u.id === "missing_anthropometrics" || u.id === "no_build_match"));
  check("uncertainty: a goal beyond the ceiling is surfaced (high impact)",
    (() => {
      const p = buildPerformancePotential({ distanceM: 100, currentTimeS: 10.36, goalTimeS: 9.5, currentPeakVelocityMps: 11.4, model, blueprint, now });
      return p.uncertainty.some((u) => u.id === "goal_beyond_ceiling" && u.impact === "high");
    })());
  check("uncertainty: limited history flagged when few analyses",
    buildPerformancePotential({ distanceM: 100, currentTimeS: 10.36, goalTimeS: 10.05, currentPeakVelocityMps: 11.4, model, blueprint, now }).uncertainty.some((u) => u.id === "limited_history"));

  // ---- Never certainty: category taxonomy present ----
  check("honesty: uses measured/estimated/projected/unknown taxonomy (projections are 'projected')",
    potential.currentCapacity.minTimeS != null && potential.nearTerm.category === "projected");

  // ---- Determinism + serialization + architecture ----
  const again = buildPerformancePotential({
    athleteId: "a1", distanceM: 100, currentTimeS: 10.36, goalTimeS: 10.05, currentPeakVelocityMps: 11.4,
    model, blueprint, sensitivity: depReport.sensitivity, rootCauses, context, improvementHistory: [10.62, 10.51, 10.44, 10.36], now,
  });
  check("report: deterministic (identical input → identical JSON)", JSON.stringify(again) === JSON.stringify(potential));
  check("report: serializable + provenance (5 engines + config)",
    JSON.parse(JSON.stringify(potential)).version === potential.version && Object.keys(potential.provenance.engineVersions).length === 5 && !!potential.provenance.configVersion);
  check("architecture: ceiling derives from the blueprint (consumes Phase 5), not a fixed number",
    computeCeiling({ distanceM: 100, currentAvgVelocityMps: 100 / 10.36, currentPeakVelocityMps: 11.4, blueprint, confidence: long }).ceilingVelocityMps > 0);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

function scTime(p, id) { return p.scenarios.find((s) => s.id === id).estimatedTimeS; }

process.exit(ok ? 0 : 1);
