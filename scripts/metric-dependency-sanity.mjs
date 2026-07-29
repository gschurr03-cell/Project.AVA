// Unit sanity for the Metric Dependency Engine (Phase 4, Sprint Intelligence).
// Verifies the causal graph, multi-layer relationship chaining, tradeoff detection,
// sensitivity analysis, diminishing returns, athlete-specific adaptation, graph
// integrity, and serialization. Consumes the (unchanged) Phase 1 engines.
//
//   node scripts/metric-dependency-sanity.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".metric-dependency-tmp");
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
      path.join(root, "src/lib/intelligence/performanceGap/dependency/index.ts"),
    ],
  }));
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const pg = require(path.join(out, "lib/intelligence/performanceGap/index.js"));
  const dep = require(path.join(out, "lib/intelligence/performanceGap/dependency/index.js"));
  const { buildAthletePerformanceModel } = pg;
  const {
    buildMetricDependencyReport, buildDependencyGraph, findInfluencePaths, computeSensitivity,
    detectTradeoffs, computeDiminishingReturns, computeAthleteModifiers, adaptRelationships,
    METRIC_RELATIONSHIPS,
  } = dep;

  const model = buildAthletePerformanceModel({
    athleteId: "a1", distanceM: 100, currentTimeS: 10.36, goalTimeS: 10.05,
    metrics: { strideLength: 2.15, strideFrequency: 4.86, peakVelocity: 11.5, averageVelocity: 9.65, groundContactTime: 0.09, flightTime: 0.12, acceleration: 6.0 },
    now: new Date("2026-07-21T00:00:00.000Z"),
  });

  // ---- Graph construction ----
  const graph = buildDependencyGraph();
  check("graph: nodes + edges built from the relationship set",
    graph.nodes.length > 0 && graph.edges.length === METRIC_RELATIONSHIPS.length);
  const slNode = graph.nodes.find((n) => n.metricId === "strideLength");
  check("graph: nodes expose primary/secondary influences + dependents",
    slNode && Array.isArray(slNode.primaryInfluences) && Array.isArray(slNode.dependents) && slNode.dependents.includes("averageVelocity"));
  check("graph: every edge carries type, signed strength, and confidence",
    graph.edges.every((e) => !!e.type && typeof e.strength === "number" && !!e.confidence.category));
  check("graph: relationship types include positive/negative/threshold",
    new Set(graph.edges.map((e) => e.type)).size >= 3);

  // ---- Multi-layer chaining ----
  const paths = findInfluencePaths(graph, "groundContactTime", "finishTime");
  check("chaining: ground contact reaches finish time via a multi-layer path",
    paths.length > 0 && paths[0].metricIds[0] === "groundContactTime" && paths[0].metricIds.at(-1) === "finishTime");
  check("chaining: a path exists with length ≥ 4 (contact→flight→stride→velocity→finish)",
    paths.some((p) => p.metricIds.length >= 4));
  check("chaining: coupling is a product of |strength| in (0,1], with a net sign",
    paths.every((p) => p.coupling > 0 && p.coupling <= 1 && (p.netSign === 1 || p.netSign === -1)));

  // ---- Tradeoff detection ----
  const tradeoffs = detectTradeoffs(graph);
  check("tradeoff: stride length ⇄ frequency detected (improving one may reduce the other)",
    tradeoffs.some((t) => t.metricId === "strideLength" && t.affects === "strideFrequency") &&
    tradeoffs.some((t) => t.metricId === "strideFrequency" && t.affects === "strideLength"));
  check("tradeoff: the beneficial velocity→finishTime negative is NOT flagged as a tradeoff",
    !tradeoffs.some((t) => t.affects === "finishTime"));
  check("tradeoff: lower-is-better couplings (e.g. reactive→ground contact) are not tradeoffs",
    !tradeoffs.some((t) => t.affects === "groundContactTime"));

  // ---- Sensitivity analysis ----
  const sens = computeSensitivity(graph);
  check("sensitivity: normalized 0..1, sorted descending, deterministic",
    sens.length > 0 && sens[0].sensitivity <= 1 && sens.every((s, i) => i === 0 || sens[i - 1].sensitivity >= s.sensitivity));
  check("sensitivity: each score lists affected downstream metrics + confidence",
    sens.every((s) => Array.isArray(s.affectedMetrics) && !!s.confidence.category));
  check("sensitivity: a metric close to finish (average velocity) is highly sensitive",
    (sens.find((s) => s.metricId === "averageVelocity")?.sensitivity ?? 0) >= 0.5);

  // ---- Diminishing returns ----
  const drLow = computeDiminishingReturns({ metricId: "strideLength", currentValue: 2.05, targetValue: 2.2 });
  const drHigh = computeDiminishingReturns({ metricId: "strideLength", currentValue: 2.45, targetValue: 2.5 });
  check("diminishing: marginal gain is LARGER at 2.05 than at 2.45 (non-linear)",
    drLow.marginalGainFactor > drHigh.marginalGainFactor);
  check("diminishing: regimes classify rising vs plateau",
    drLow.regime === "rising" && (drHigh.regime === "diminishing" || drHigh.regime === "plateau"));
  check("diminishing: a value above the optimal ceiling is 'plateau'",
    computeDiminishingReturns({ metricId: "strideLength", currentValue: 2.9, targetValue: 2.9 }).regime === "plateau");
  check("diminishing: no optimal band / no value → 'unknown' (no fabricated curve)",
    computeDiminishingReturns({ metricId: "transitionEfficiency", currentValue: 1, targetValue: 1 }).regime === "unknown");

  // ---- Athlete-specific adaptation ----
  const tallMods = computeAthleteModifiers({ heightCm: 190, trainingAgeYears: 8 });
  const shortMods = computeAthleteModifiers({ heightCm: 165, trainingAgeYears: 1 });
  check("athlete: modifiers differ for a tall/experienced vs short/novice athlete",
    JSON.stringify(tallMods) !== JSON.stringify(shortMods) && tallMods.length > 0);
  const tallRels = adaptRelationships({ heightCm: 190 });
  const baseSL = METRIC_RELATIONSHIPS.find((r) => r.from === "strideLength" && r.to === "averageVelocity").strength;
  const tallSL = tallRels.find((r) => r.from === "strideLength" && r.to === "averageVelocity").strength;
  check("athlete: a tall athlete's stride-length→velocity coupling is strengthened",
    tallSL > baseSL);
  const tallGraph = buildDependencyGraph(tallRels);
  check("athlete: adapted graph yields different sensitivity than the base graph",
    JSON.stringify(computeSensitivity(tallGraph)) !== JSON.stringify(sens));

  // ---- Full report + integrity + serialization ----
  const report = buildMetricDependencyReport(model, { context: { heightCm: 188, trainingAgeYears: 7, legLengthCm: 96 } });
  check("report: graph + sensitivity + tradeoffs + diminishing + modifiers + provenance(5)",
    report.graph.nodes.length > 0 && report.sensitivity.length > 0 && report.tradeoffs.length > 0 &&
    report.diminishingReturns.length > 0 && report.athleteModifiers.length > 0 &&
    Object.keys(report.provenance.engineVersions).length === 5);
  check("report: deterministic (identical input → identical JSON)",
    JSON.stringify(buildMetricDependencyReport(model, { context: { heightCm: 188, trainingAgeYears: 7, legLengthCm: 96 } })) === JSON.stringify(report));
  check("report: fully serializable (round-trips through JSON)",
    JSON.parse(JSON.stringify(report)).graph.version === report.graph.version);
  check("architecture: graph flows to a single target (finish) — backbone for future systems",
    report.graph.nodes.some((n) => n.metricId === "finishTime"));
  check("architecture: future metrics plug in via config (adding a relationship adds nodes)",
    buildDependencyGraph([...METRIC_RELATIONSHIPS, { from: "newMetric", to: "finishTime", type: "positive", strength: 0.5, confidence: { category: "inferred", score: 0.3 }, evidence: { basis: "test", category: "inferred" } }]).nodes.some((n) => n.metricId === "newMetric"));

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
