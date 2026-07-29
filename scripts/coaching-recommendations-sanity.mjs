import assert from "node:assert/strict";
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const cache = new Map();
function load(file) {
  file = path.resolve(root, file);
  if (cache.has(file)) return cache.get(file).exports;
  const source = fs.readFileSync(file, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: file,
  }).outputText;
  const module = { exports: {} };
  cache.set(file, module);
  const req = (id) => {
    if (id.startsWith("./")) {
      const target = path.resolve(path.dirname(file), id);
      return load(fs.existsSync(target) ? target : `${target}.ts`);
    }
    if (id === "@/lib/limitingFactors") return {};
    throw new Error(`Unsupported import: ${id}`);
  };
  vm.runInNewContext(`(function(require,module,exports){${js}\n})`, { console })(req, module, module.exports);
  return module.exports;
}

const { buildCoachingRecommendations } = load("src/lib/coachingRecommendations/engine.ts");
const { resolveCoachingRecommendationLifecycle } = load("src/lib/coachingRecommendations/persistence.ts");

const evidence = [
  { label: "Left step length", value: "2.10 m", kind: "measurement" },
  { label: "Right step length", value: "1.88 m", kind: "measurement" },
];
function limiter(type, id = type, rank = 1, confidence = "high") {
  return {
    id, type, status: "detected", rank, title: type.replaceAll("_", " "),
    summary: "A meaningful measured difference was observed.",
    impact: { level: "high", score: rank === 1 ? 0.85 : 0.6, explanation: "Measured impact." },
    confidence: { measurement: 0.88, reasoning: 0.82, overall: confidence === "low" ? 0.4 : 0.82, label: confidence, explanation: "Conservative measured confidence." },
    measuredValues: [], target: { type: "research_reference" }, deviation: {}, evidence,
    reasoning: [], possibleTechnicalAssociations: [], possiblePhysicalAssociations: [],
    recommendations: [], dataQualityWarnings: [],
  };
}
function input(limiters, context = {}) {
  return {
    analysisId: "analysis-1", sessionId: "session-1", generatedAt: "2026-01-01T00:00:00.000Z",
    limitingFactors: { status: "ok", limiters, primaryConstraint: "Constraint", meaningfulCount: limiters.length, overallDataQuality: "high", zoneDistanceM: 20, sessionDate: null, unavailableModels: [] },
    sprintIntelligence: null,
    context: { analysisType: "fly", ...context },
  };
}

const supported = [
  "step_length_below_expectation", "step_length_above_expectation",
  "step_frequency_below_expectation", "step_frequency_above_expectation",
  "step_length_asymmetry", "step_frequency_asymmetry",
  "velocity_limitation", "peak_velocity_limitation", "peak_vs_average_gap",
];
for (const type of supported) {
  const result = buildCoachingRecommendations(input([limiter(type)]));
  assert.equal(result.status, "ok", `${type} should generate a result`);
  assert.ok(result.recommendations.length + result.assessments.length + result.monitoring.length > 0);
  assert.ok(result.recommendations.length <= 3);
}

const empty = buildCoachingRecommendations(input([]));
assert.equal(empty.status, "no_reliable_limiter");
assert.equal(empty.recommendations.length, 0);

const merged = buildCoachingRecommendations(input([
  limiter("step_length_asymmetry", "length-side", 1, "high"),
  limiter("step_frequency_asymmetry", "frequency-side", 2, "low"),
]));
const review = merged.recommendations.find((r) => r.key === "side_specific_technical_review");
assert.ok(review);
assert.deepEqual([...review.limiterIds], ["frequency-side", "length-side"]);
assert.equal(review.confidence.label, "low");
assert.equal(new Set([...merged.recommendations, ...merged.assessments, ...merged.monitoring].map((r) => r.key)).size,
  merged.recommendations.length + merged.assessments.length + merged.monitoring.length);

const injured = buildCoachingRecommendations(input(
  [{ ...limiter("velocity_limitation"), title: "Length-dominant velocity limitation" }],
  { injuryStatus: "rehabilitation", painReported: true },
));
const resisted = injured.recommendations.find((r) => r.category === "resisted_sprint");
assert.ok(resisted?.status === "conditional");
assert.ok(resisted.cautions.some((x) => x.includes("qualified medical")));
assert.ok(!JSON.stringify(injured).includes("return-to-play timeline"));

const deterministicA = buildCoachingRecommendations(input([limiter("step_length_asymmetry")]));
const deterministicB = buildCoachingRecommendations(input([limiter("step_length_asymmetry")]));
assert.deepEqual(deterministicA, deterministicB);
assert.equal(resolveCoachingRecommendationLifecycle({
  generationInput: input([limiter("step_length_asymmetry")]),
  savedAnalysis: true,
  storedResult: deterministicA,
}).behavior, "immutable_snapshot");
assert.equal(resolveCoachingRecommendationLifecycle({
  generationInput: input([limiter("step_length_asymmetry")]),
  savedAnalysis: true,
  storedResult: null,
}).behavior, "snapshot_required");

const forbidden = [
  "your hamstrings are weak", "your glutes are inactive", "you have poor ankle stiffness",
  "this injury caused the asymmetry", "you are overstriding", "follow this workout plan",
];
const output = JSON.stringify([...supported.map((type) =>
  buildCoachingRecommendations(input([limiter(type)]))) ]).toLowerCase();
for (const phrase of forbidden) assert.equal(output.includes(phrase), false, phrase);
assert.equal(/\b(?:monday|tuesday|mesocycle|sets? of \\d|reps? of \\d)\b/i.test(output), false);

console.log("coaching recommendations sanity: ok");
