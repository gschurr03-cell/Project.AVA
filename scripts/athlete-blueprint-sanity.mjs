// Unit sanity for the Athlete Blueprint Engine (Phase 5, Sprint Intelligence).
// Verifies individualized target generation, body-profile + strength benchmarks,
// similar-build elite comparison (never world records), development scores, athlete
// adaptation, confidence propagation, serialization, and architecture integrity.
//
//   node scripts/athlete-blueprint-sanity.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".athlete-blueprint-tmp");
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
    files: [path.join(root, "src/lib/intelligence/performanceGap/blueprint/index.ts")],
  }));
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const bp = require(path.join(out, "lib/intelligence/performanceGap/blueprint/index.js"));
  const {
    buildAthleteBlueprint, buildBlueprintMetrics, buildBodyProfile, buildStrengthBenchmarks,
    buildEliteComparison, estimateLevel, metricScore, MIN_SIMILARITY,
  } = bp;

  // A tall athlete with trochanter height + goal.
  const tall = {
    athleteId: "tall-1",
    context: { heightCm: 190, trochanterHeightM: 0.99, legLengthCm: 98, bodyMassKg: 84, sex: "M", ageYears: 24, trainingAgeYears: 7, event: "100m", currentPbSeconds: 10.36, goalPbSeconds: 10.05 },
    requiredAvgVelocityMps: 100 / 10.05,
    currentMetrics: { strideLength: 2.15, strideFrequency: 4.7, peakVelocity: 11.5, averageVelocity: 9.65, groundContactTime: 0.1, flightTime: 0.12, acceleration: 6.0, symmetry: 2 },
    now: new Date("2026-07-21T00:00:00.000Z"),
  };
  const short = {
    ...tall, athleteId: "short-1",
    context: { ...tall.context, heightCm: 168, trochanterHeightM: 0.86, legLengthCm: 84, bodyMassKg: 66 },
  };

  const model = buildAthleteBlueprint(tall);

  // ---- Individualized target generation ----
  const slMetric = model.performanceBlueprint.metrics.find((m) => m.metricId === "strideLength");
  check("target: stride-length range individualized from trochanter height (× ~2.4–2.6)",
    slMetric.targetRange.min > 0.99 * 2.3 && slMetric.targetRange.max < 0.99 * 2.7 && slMetric.evidence === "estimated");
  check("target: peak velocity individualized from goal velocity (× >1)",
    model.performanceBlueprint.metrics.find((m) => m.metricId === "peakVelocity").targetRange.min > 100 / 10.05);
  check("target: average velocity target = required velocity, MEASURED",
    model.performanceBlueprint.metrics.find((m) => m.metricId === "averageVelocity").evidence === "measured");
  // Not one-size-fits-all: a tall and a short athlete get different stride-length ranges.
  const shortModel = buildAthleteBlueprint(short);
  const shortSL = shortModel.performanceBlueprint.metrics.find((m) => m.metricId === "strideLength");
  check("target: NOT one-size-fits-all — tall vs short athletes get different stride-length ranges",
    slMetric.targetRange.min !== shortSL.targetRange.min);
  check("target: frequency band is height-adjusted (shorter athlete → higher frequency band)",
    shortModel.performanceBlueprint.metrics.find((m) => m.metricId === "strideFrequency").targetRange.max >
      model.performanceBlueprint.metrics.find((m) => m.metricId === "strideFrequency").targetRange.max);
  check("target: every metric range carries a confidence category",
    model.performanceBlueprint.metrics.every((m) => !!m.targetRange.confidence.category));

  // ---- Body profile ----
  const body = model.bodyProfile;
  check("body: current BMI computed + target mass/BMI/lean-mass as RANGES",
    body.currentBmi > 0 && body.targetMassKg.min != null && body.targetBmi.min != null && body.leanMassKg.min != null);
  check("body: female athlete gets a different BMI band than male (sex-specific)",
    buildBodyProfile({ heightCm: 172, bodyMassKg: 60, sex: "F" }, "advanced").targetBmi.min !==
      buildBodyProfile({ heightCm: 172, bodyMassKg: 70, sex: "M" }, "advanced").targetBmi.min);
  check("body: estimated strength/power level present + confidence, never a requirement",
    ["developing", "intermediate", "advanced", "elite"].includes(body.estimatedStrengthLevel) && !!body.confidence.category);

  // ---- Strength benchmarks ----
  const bench = model.strengthBenchmarks;
  check("strength: benchmarks generated (squat, clean, RDL, hip thrust, nordic, RSI, …)",
    bench.length >= 8 && bench.some((b) => b.id === "backSquat") && bench.some((b) => b.id === "reactiveStrength"));
  check("strength: bodyweight-relative lifts scale with body mass (absolute kg range)",
    bench.find((b) => b.id === "backSquat").range.min > 84 * 1.5);
  check("strength: every benchmark says it is estimated, not mandatory",
    bench.every((b) => /not a requirement|not a mandate|estimated/i.test(b.note)) &&
    bench.every((b) => b.confidence.category === "estimated" || b.confidence.category === "unknown"));
  check("strength: benchmarks scale with level (elite ≥ developing)",
    buildStrengthBenchmarks(tall.context, "elite")[0].range.min > buildStrengthBenchmarks(tall.context, "developing")[0].range.min);

  // ---- Elite comparison: similar builds only, never world records ----
  const cmp = model.eliteComparison;
  check("elite: tall athlete matched to the tall-power archetype (similar build)",
    cmp && cmp.archetypeId === "tall_power" && cmp.similarity >= MIN_SIMILARITY);
  check("elite: comparison notes it is a similar-build archetype, and the label is NOT a named athlete/record",
    /similar-build archetype/i.test(cmp.note) && !/bolt|gatlin|record holder/i.test(cmp.label));
  check("elite: a short athlete matches a DIFFERENT archetype (never a mismatched build)",
    buildEliteComparison(short.context).archetypeId !== "tall_power");
  check("elite: declines to compare when anthropometrics are missing (returns null)",
    buildEliteComparison({}) === null);

  // ---- Development scores ----
  const pb = model.performanceBlueprint;
  check("development: per-area progress scores 0..100 with confidence",
    pb.scores.length === 5 && pb.scores.every((s) => s.scorePct >= 0 && s.scorePct <= 100 && !!s.confidence.category));
  check("development: overall completion 0..100 (a coaching metric)",
    pb.overallCompletionPct >= 0 && pb.overallCompletionPct <= 100);
  check("development: areas ranked by LARGEST remaining difference first",
    model.developmentAreas.every((a, i) => i === 0 || model.developmentAreas[i - 1].scorePct <= a.scorePct) &&
    model.developmentAreas[0].priority === 1);
  check("development: a metric at/above its target range scores 100%",
    metricScore({ metricId: "strideLength", currentValue: 3.0, targetRange: { min: 2.4, max: 2.6 } }) === 1);
  check("development: a lower-is-better metric at/below target scores 100%",
    metricScore({ metricId: "groundContactTime", currentValue: 0.08, targetRange: { min: 0.08, max: 0.095 } }) === 1);

  // ---- Confidence + missing data honesty ----
  const sparse = buildAthleteBlueprint({ context: {}, requiredAvgVelocityMps: null, currentMetrics: {}, now: tall.now });
  check("honesty: no anthropometrics/goal → unknown body profile + no elite comparison (no fabrication)",
    sparse.bodyProfile.confidence.category === "unknown" && sparse.eliteComparison === null);

  // ---- Level estimation ----
  check("level: faster goal → higher estimated level",
    estimateLevel({ goalPbSeconds: 10.0, event: "100m" }) === "elite" &&
    estimateLevel({ goalPbSeconds: 11.6, event: "100m" }) === "developing");

  // ---- Determinism + serialization + architecture ----
  check("blueprint: deterministic (identical input → identical JSON)",
    JSON.stringify(buildAthleteBlueprint(tall)) === JSON.stringify(model));
  check("blueprint: fully serializable + provenance (5 engines + config version)",
    JSON.parse(JSON.stringify(model)).version === model.version &&
    Object.keys(model.provenance.engineVersions).length === 5 && !!model.provenance.configVersion);
  check("architecture: metrics are config-driven (adding a target config adds a blueprint metric)",
    buildBlueprintMetrics({}, { context: tall.context, requiredAvgVelocityMps: 9.9, level: "advanced" }).length ===
      model.performanceBlueprint.metrics.length);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
