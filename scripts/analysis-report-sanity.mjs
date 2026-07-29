import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const cache = new Map();
function load(file) {
  file = path.resolve(root, file);
  if (cache.has(file)) return cache.get(file).exports;
  const source = fs.readFileSync(file, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  }).outputText;
  const module = { exports: {} };
  cache.set(file, module);
  const req = (id) => {
    if (id.startsWith("./")) {
      const target = path.resolve(path.dirname(file), id);
      return load(fs.existsSync(target) ? target : `${target}.ts`);
    }
    if (id === "@/lib/coachingRecommendations") {
      return { COACHING_RECOMMENDATION_MODEL_VERSION: "ava-coaching-recommendations-v1.0.0" };
    }
    throw new Error(`Unsupported import ${id}`);
  };
  vm.runInNewContext(`(function(require,module,exports,structuredClone,Intl){${js}\n})`, { console })(
    req, module, module.exports, structuredClone, Intl,
  );
  return module.exports;
}

const { buildSprintAnalysisReport } = load("src/lib/analysisReport/builder.ts");
const { resolveAnalysisReport } = load("src/lib/analysisReport/lifecycle.ts");

const confidence = {
  measurement: 0.91, reasoning: 0.84, overall: 0.84, label: "high",
  explanation: "Conservative aggregate.", raises: ["Valid samples."], reduces: ["One session."],
};
const limiter = {
  id: "step_length_asymmetry", type: "step_length_asymmetry", status: "detected", rank: 1,
  title: "Right-side step-length reduction", summary: "Right step length was lower.",
  impact: { level: "high", score: 0.8, explanation: "Meaningful side difference." },
  confidence, measuredValues: [
    { label: "Left step length", value: 2.1, unit: "m", detail: "4 samples" },
    { label: "Right step length", value: 1.95, unit: "m", detail: "4 samples" },
  ],
  target: { type: "research_reference", sourceLabel: "Within-athlete symmetry" },
  deviation: { percentage: 7.4, direction: "left_higher" },
  evidence: [{ label: "Asymmetry", value: "7.4%", kind: "comparison" }],
  reasoning: [], possibleTechnicalAssociations: [], possiblePhysicalAssociations: [],
  recommendations: [], dataQualityWarnings: [],
};
const conclusion = {
  id: "conclusion-1", limiterId: limiter.id, classification: "asymmetry",
  title: limiter.title, conciseSummary: "A repeatable side difference is the primary finding.",
  detailedExplanation: "Measured side values support a cautious side-to-side interpretation.",
  measured: [], comparedWith: [], evidenceFor: [], evidenceAgainst: [], neutralContext: [],
  interpretation: "Review left-right organization.", alternativeExplanations: [],
  confidence, technicalAssociations: [], physicalAssociations: [], recommendations: [],
  assumptions: [], limitations: [], changeConditions: [],
};
const sprintIntelligence = {
  analysisId: "analysis-1", sessionId: "session-1", generatedAt: "2026-07-28T12:00:00.000Z",
  version: "sprint-intelligence-1.0.0", status: "ok",
  summary: {
    headline: conclusion.conciseSummary, primaryConclusionId: conclusion.id, hasPrimaryConclusion: true,
    supportedConclusionCount: 1, overallConfidence: 0.84, overallConfidenceLabel: "high",
    dataQualityLabel: "high", zoneDistanceM: 20, athleteProfileCompletenessPct: 80,
  },
  primaryConclusion: conclusion, supportingConclusions: [], strengths: [{
    ...conclusion, id: "strength-1", limiterId: null, classification: "performance_strength",
    title: "Stable organization", conciseSummary: "Available steps were consistently detected.",
  }],
  counterEvidence: [], dataQuality: {
    label: "high", calibrationConfirmed: true, spatialAvailable: true, validStepCount: 8, measurementConfidence: "high", notes: [],
  },
  assumptions: [{ id: "same-effort", text: "Effort was representative.", couldChangeConclusion: true }],
  missingInputs: [{ id: "history", label: "Athlete history", wouldImprove: "Would add a personal comparison." }],
  changeConditions: [{ id: "repeat", text: "A repeated session could change this conclusion." }],
  methodology: {
    version: "sprint-intelligence-1.0.0", metricsUsed: [], targetBasisSummary: "Within-athlete symmetry.",
    rankingBasis: "Impact then confidence.", confidenceBasis: "Weakest supported input.",
    provisionalModels: [], unavailableModels: [],
  },
};
const recommendation = {
  id: "rec-1", key: "side_review", limiterIds: [limiter.id], conclusionIds: [conclusion.id],
  category: "technical_focus", title: "Review left-right rhythm", summary: "Compare both sides.",
  rationale: "The measured side difference was meaningful.", evidenceReferences: [],
  implementationGuidance: ["Use controlled technical review."], observationCues: ["Even rhythm"],
  cautions: ["Do not diagnose weakness."], exclusions: [], confidence: { score: 0.84, label: "high", explanation: "Supported." },
  priority: { score: 90, level: "primary", explanation: "Direct." },
  applicability: { sessionContext: [], athleteContext: [], requiresCoachReview: true, requiresPhysicalTesting: false },
  status: "recommended", historicalContext: { state: "single_session", explanation: "No trend." },
};
const coaching = {
  analysisId: "analysis-1", sessionId: "session-1", generatedAt: "2026-07-28T12:00:00.000Z",
  modelVersion: "ava-coaching-recommendations-v1.0.0", status: "ok",
  primaryDirection: recommendation.summary, startWith: [recommendation.title],
  recommendations: [recommendation], monitoring: [], assessments: [],
  limitations: ["No complete workout plan."],
  source: { limiterIds: [limiter.id], sprintIntelligenceVersion: sprintIntelligence.version },
};
const limitingFactors = {
  status: "ok", limiters: [limiter], primaryConstraint: limiter.summary, meaningfulCount: 1,
  overallDataQuality: "high", zoneDistanceM: 20, sessionDate: "2026-07-27T12:00:00.000Z", unavailableModels: [],
};
function input(audience = "coach") {
  return {
    generatedAt: "2026-07-28T12:00:00.000Z", analysisId: "analysis-1", sessionId: "session-1",
    athleteId: "athlete-1", audience,
    athlete: { displayName: "A Very Long Athlete Display Name", heightCm: 183, weightKg: 80, legLengthCm: null, trochanterHeightM: null },
    session: {
      name: "Maximum Velocity Assessment", sessionDate: "2026-07-27T12:00:00.000Z",
      analysisDate: "2026-07-28T12:00:00.000Z", sprintContext: "Maximum velocity",
      zoneType: "fly zone", zoneDistanceM: 20, videoFps: 60, calibrationMethod: "Manual",
      validSteps: 8, sessionNotes: "Fresh condition.",
    },
    metrics: {
      average_step_length: 2.164, peak_step_length: 2.21, step_frequency: 4.848,
      average_velocity: 10.417, peak_velocity: 10.8,
    },
    metricConfidence: "high", metricEngineVersion: "ava-metrics-v1",
    limiterModelVersion: "limiting-factors-1.0.0", limitingFactors,
    sprintIntelligence, coachingRecommendations: coaching,
  };
}

const coach = buildSprintAnalysisReport(input("coach"));
const athlete = buildSprintAnalysisReport(input("athlete"));
assert.equal(coach.metrics.length, 5);
assert.equal(JSON.stringify(coach.metrics.map((m) => m.key)), JSON.stringify([
  "average_step_length", "peak_step_length", "step_frequency", "average_velocity", "peak_velocity",
]));
assert.equal(coach.metrics[0].formattedValue, "2.164 m");
assert.equal(coach.metrics[2].formattedValue, "4.848 Hz");
assert.equal(coach.limitingFactors[0].rank, 1);
assert.equal(coach.executiveSummary.primaryFinding, conclusion.conciseSummary);
assert.equal(coach.recommendations.length, 1);
assert.ok(coach.disclaimers.some((text) => text.includes("does not diagnose injury")));
assert.equal(athlete.intelligence.assumptions.length, 0);
assert.equal(coach.intelligence.assumptions.length, 1);
assert.equal(athlete.session.sessionNotes, "Fresh condition."); // builder snapshots; loader owns audience privacy filtering

const again = buildSprintAnalysisReport(input("coach"));
assert.equal(JSON.stringify(coach), JSON.stringify(again));
const saved = structuredClone(coach);
const changed = input("coach");
changed.athlete.displayName = "Changed Later";
assert.equal(saved.athlete.displayName, "A Very Long Athlete Display Name");
assert.equal(resolveAnalysisReport({
  sourceAnalysisId: "analysis-1", latestAnalysisId: "analysis-2", savedSnapshot: saved,
}).behavior, "stale");
assert.equal(resolveAnalysisReport({
  sourceAnalysisId: "analysis-1", latestAnalysisId: "analysis-1", savedSnapshot: null, generationInput: input("coach"),
}).behavior, "generated");
assert.equal(resolveAnalysisReport({
  sourceAnalysisId: "analysis-1", latestAnalysisId: "analysis-2", savedSnapshot: null, generationInput: input("coach"),
}).behavior, "snapshot_required");

const missing = input("athlete");
missing.metrics.peak_velocity = null;
missing.limitingFactors = { ...limitingFactors, limiters: [], primaryConstraint: null, meaningfulCount: 0 };
missing.sprintIntelligence = { ...sprintIntelligence, primaryConclusion: null, strengths: [] };
missing.coachingRecommendations = { ...coaching, recommendations: [], primaryDirection: null };
const sparse = buildSprintAnalysisReport(missing);
assert.equal(sparse.metrics.find((m) => m.key === "peak_velocity").formattedValue, "Unavailable");
assert.equal(sparse.limitingFactors.length, 0);
assert.equal(sparse.recommendations.length, 0);

const text = JSON.stringify(coach).toLowerCase();
for (const forbidden of ["your hamstrings are weak", "injury caused", "weekly schedule", "mesocycle"]) {
  assert.equal(text.includes(forbidden), false);
}
assert.equal(JSON.parse(JSON.stringify(coach)).metrics.length, 5);
console.log("analysis report sanity: ok");
