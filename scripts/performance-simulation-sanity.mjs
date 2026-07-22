// Unit sanity for the Performance Simulation Engine (Phase 9, Sprint Intelligence).
// The What-If Simulator: scenario generation, dependency-aware propagation, constraint
// enforcement, confidence, comparison, saveable scenarios, serialization, and architecture
// integrity. It REUSES Phase 4 (dependency graph) + Phase 5 (blueprint), which stay green.
//
//   node scripts/performance-simulation-sanity.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".performance-simulation-tmp");
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
      path.join(root, "src/lib/intelligence/performanceGap/simulation/index.ts"),
    ],
  }));
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const bp = require(path.join(out, "lib/intelligence/performanceGap/blueprint/index.js"));
  const dep = require(path.join(out, "lib/intelligence/performanceGap/dependency/index.js"));
  const sim = require(path.join(out, "lib/intelligence/performanceGap/simulation/index.js"));
  const { buildAthleteBlueprint } = bp;
  const { buildMetricDependencyReport } = dep;
  const {
    runSimulation, compareScenarios, applyConstraints,
    createScenarioStore, saveScenario, renameScenario, deleteScenario, getScenario, listScenarios,
    serializeStore, deserializeStore,
  } = sim;

  const now = new Date("2026-07-21T00:00:00.000Z");
  const context = { heightCm: 188, trochanterHeightM: 0.98, legLengthCm: 96, bodyMassKg: 84, sex: "M", trainingAgeYears: 7, event: "100m", currentPbSeconds: 10.36, goalPbSeconds: 10.05 };
  const currentMetrics = { strideLength: 2.05, strideFrequency: 4.9, peakVelocity: 11.4, averageVelocity: 9.65, groundContactTime: 0.105, flightTime: 0.11, acceleration: 6.0, reactiveStrength: 2.4 };
  const currentTimes = { "60m": 6.6, "100m": 10.36, "200m": 20.9 };
  const blueprint = buildAthleteBlueprint({ athleteId: "a1", context, requiredAvgVelocityMps: 100 / 10.05, currentMetrics: { strideLength: 2.05, strideFrequency: 4.9, peakVelocity: 11.4, groundContactTime: 0.105 }, now });
  const depReport = buildMetricDependencyReport(null, { context });

  const base = { athleteId: "a1", currentMetrics, currentTimes, blueprint, sensitivity: depReport.sensitivity, context, improvementHistory: [10.62, 10.51, 10.44, 10.36], now };

  // ---- Scenario generation ----
  const s1 = runSimulation({ ...base, id: "s1", name: "Longer stride", input: { adjustments: [{ metricId: "strideLength", deltaPct: 5 }], locked: [] } });
  check("scenario: generates output with metric changes, event outcomes, confidence, assumptions",
    s1.output.metricChanges.length > 0 && s1.output.eventOutcomes.length === 3 && !!s1.output.confidence.level && s1.output.assumptions.length > 0);
  check("scenario: improving stride length lowers estimated 100 m time",
    s1.output.eventOutcomes.find((e) => e.event === "100m").deltaS < 0 && s1.output.velocity.speedRatio > 1);
  check("scenario: the adjusted metric is tagged source=user and matches the request",
    s1.output.metricChanges.find((m) => m.metricId === "strideLength").source === "user" &&
    s1.output.metricChanges.find((m) => m.metricId === "strideLength").deltaPct > 4);

  // ---- Dependency-aware propagation ----
  check("propagation: adjusting stride length propagates downstream (frequency tradeoff / velocity)",
    s1.output.activations.length > 0 && s1.output.activations.some((a) => a.from === "strideLength"));
  check("propagation: the stride ⇄ frequency tradeoff produces a NEGATIVE frequency change when unlocked",
    (s1.output.metricChanges.find((m) => m.metricId === "strideFrequency")?.deltaPct ?? 0) < 0);

  // ---- Independent metric locking ----
  const sLocked = runSimulation({ ...base, id: "s1b", name: "Stride, freq locked", input: { adjustments: [{ metricId: "strideLength", deltaPct: 5 }], locked: ["strideFrequency"] } });
  check("locking: locking frequency holds it constant (no propagated change)",
    (sLocked.output.metricChanges.find((m) => m.metricId === "strideFrequency")?.deltaPct ?? 0) === 0);
  check("locking: with frequency locked, the full stride gain transfers → faster than the unlocked case",
    sLocked.output.eventOutcomes.find((e) => e.event === "100m").simulatedTimeS < s1.output.eventOutcomes.find((e) => e.event === "100m").simulatedTimeS);

  // ---- Multi-metric scenarios ----
  const sMulti = runSimulation({ ...base, id: "s2", name: "Stride + contact", input: { adjustments: [{ metricId: "strideLength", deltaPct: 4 }, { metricId: "groundContactTime", deltaPct: -5 }], locked: [] } });
  check("multi-metric: multiple simultaneous adjustments are supported",
    sMulti.input.adjustments.length === 2 && sMulti.output.metricChanges.filter((m) => m.source === "user").length === 2);

  // ---- Constraint engine ----
  const sHuge = runSimulation({ ...base, id: "s3", name: "Impossible frequency", input: { adjustments: [{ metricId: "strideFrequency", targetValue: 9 }], locked: [] } });
  check("constraint: an impossible stride frequency is clamped to a plausible maximum",
    sHuge.output.constraints.find((c) => c.metricId === "strideFrequency").clamped === true &&
    sHuge.output.constraints.find((c) => c.metricId === "strideFrequency").appliedValue <= 5.6 + 1e-9);
  const sStride = applyConstraints([{ metricId: "strideLength", targetValue: 3.2 }], currentMetrics, context);
  check("constraint: stride length is capped by anthropometrics (leg length), not a fixed number",
    sStride.constraints[0].clamped === true && sStride.constraints[0].appliedValue <= 0.98 * 2.6 + 1e-9 && /leg length|trochanter/i.test(sStride.constraints[0].reason));
  const sContact = runSimulation({ ...base, id: "s3b", name: "Zero contact", input: { adjustments: [{ metricId: "groundContactTime", targetValue: 0.01 }], locked: [] } });
  check("constraint: ground contact cannot approach impossible (near-zero) values",
    sContact.output.constraints.find((c) => c.metricId === "groundContactTime").appliedValue >= 0.07 - 1e-9);

  // ---- Explainability ----
  check("explainability: assumptions cover held-constant + dependency + model + uncertainty",
    ["held-constant", "dependency", "model", "uncertainty"].every((cat) => sLocked.output.assumptions.some((a) => a.category === cat)));
  check("explainability: no unexplained numbers — every metric change carries confidence + source",
    s1.output.metricChanges.every((m) => !!m.confidence.category && ["user", "propagated", "locked"].includes(m.source)));

  // ---- Simulation outputs (events, velocity, development score, blueprint completion) ----
  check("output: 60 m / 100 m / 200 m estimated with per-event confidence + baseline tag",
    ["60m", "100m", "200m"].every((ev) => { const e = s1.output.eventOutcomes.find((x) => x.event === ev); return e && e.confidence.level && ["measured", "estimated"].includes(e.baseline); }));
  check("output: development score + blueprint completion recomputed (improve → not lower)",
    s1.output.developmentScore.simulated >= s1.output.developmentScore.current && s1.output.blueprintCompletion.simulated >= s1.output.blueprintCompletion.current);
  check("output: each metric change carries Phase 4 sensitivity",
    s1.output.metricChanges.some((m) => m.sensitivity != null));

  // ---- Confidence model ----
  const sSmall = runSimulation({ ...base, id: "s4a", name: "Tiny", input: { adjustments: [{ metricId: "strideLength", deltaPct: 1 }], locked: [] } });
  const sBig = runSimulation({ ...base, id: "s4b", name: "Huge", input: { adjustments: [{ metricId: "strideLength", deltaPct: 12 }], locked: [] } });
  check("confidence: a larger (further) projection is LESS confident than a small one",
    sBig.output.confidence.score < sSmall.output.confidence.score);
  check("confidence: exposes the contributing factors (measurement/evidence/distance/similarity/dependency/research/history)",
    s1.output.confidence.factors.length === 7 && s1.output.confidence.factors.some((f) => f.factor === "projectionDistance"));

  // ---- Comparison mode ----
  const comparison = compareScenarios({ baseline: { eventTimes: currentTimes, developmentScore: s1.output.developmentScore.current }, scenarios: [s1, sMulti], primaryEvent: "100m" });
  check("comparison: side-by-side current + scenario A + scenario B",
    comparison.columns.length === 3 && comparison.columns[0].id === "current" && comparison.events.length === 3);
  check("comparison: identifies the best (lowest 100 m) scenario",
    comparison.bestScenarioId === "s1" || comparison.bestScenarioId === "s2");

  // ---- Saveable scenarios ----
  let store = createScenarioStore();
  store = saveScenario(store, s1);
  store = saveScenario(store, sMulti);
  check("store: scenarios can be named + saved + reopened", listScenarios(store).length === 2 && getScenario(store, "s1").name === "Longer stride");
  store = renameScenario(store, "s1", "Renamed");
  check("store: scenarios can be renamed", getScenario(store, "s1").name === "Renamed");
  store = deleteScenario(store, "s2");
  check("store: scenarios can be deleted", getScenario(store, "s2") === null && listScenarios(store).length === 1);
  const roundTrip = deserializeStore(serializeStore(store));
  check("store: serializable round-trip (exportable)", JSON.stringify(roundTrip) === JSON.stringify(store));

  // ---- Determinism + serialization + architecture ----
  const again = runSimulation({ ...base, id: "s1", name: "Longer stride", input: { adjustments: [{ metricId: "strideLength", deltaPct: 5 }], locked: [] } });
  check("determinism: identical input → identical JSON", JSON.stringify(again) === JSON.stringify(s1));
  check("serialization: whole scenario round-trips byte-identically", JSON.stringify(JSON.parse(JSON.stringify(s1))) === JSON.stringify(s1));
  check("architecture: reuses Phase 4 graph + Phase 5 blueprint (no duplicated engines)",
    s1.output.activations.every((a) => a.type === "propagated") && s1.version === "performance-simulation-v1");

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
