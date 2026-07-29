import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".priority-engine-sanity-tmp");
const require = createRequire(import.meta.url);
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return originalResolve.call(this, request.startsWith("@/") ? path.join(out, request.slice(2)) : request, ...rest);
};
let ok = true;
const check = (label, condition) => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) ok = false;
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022",
      skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node",
      baseUrl: root, paths: { "@/*": ["src/*"] },
    },
    files: [
      path.join(root, "src/lib/observations/index.ts"),
      path.join(root, "src/lib/intelligence/interpretations/index.ts"),
      path.join(root, "src/lib/intelligence/interpretations/fixtures.ts"),
      path.join(root, "src/lib/intelligence/recommendationEngine/index.ts"),
      path.join(root, "src/lib/intelligence/priorityEngine/index.ts"),
    ],
  }));
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { generateInterpretations } = require(path.join(out, "lib/intelligence/interpretations/evaluate.js"));
  const { INTERPRETATION_GOLDEN_FIXTURES } = require(path.join(out, "lib/intelligence/interpretations/fixtures.js"));
  const { generateRecommendations } = require(path.join(out, "lib/intelligence/recommendationEngine/evaluate.js"));
  const { generatePriorities } = require(path.join(out, "lib/intelligence/priorityEngine/evaluate.js"));

  const context = (phase = "unknown") => ({
    analysisId: "synthetic-interpretation-fixture",
    generatedAt: "2026-07-17T12:00:00.000Z",
    phase,
    event: null,
    sessionPurpose: "fly",
    cameraMode: "static_precision",
    fpsTier: "validated_60",
    calibrationAvailable: true,
    savedVersion: false,
    athlete: {
      athleteId: "synthetic-athlete",
      trainingAge: "unknown",
      competitionLevel: "unknown",
      primaryEvent: null,
      goals: [],
      reportedPain: null,
      activeLimitation: null,
      contextVersion: "ava-athlete-recommendation-context-v1",
    },
  });
  const layers = (fixtureName) => {
    const fixture = INTERPRETATION_GOLDEN_FIXTURES[fixtureName];
    const interpretations = generateInterpretations(fixture);
    const recommendations = generateRecommendations(
      { interpretations, context: context(fixture.context.phase) },
      undefined,
      { allowExperimental: true, allowAdvancedDrills: false, allowProfessionalReview: false },
    );
    return { fixture, interpretations, recommendations };
  };
  const priorityContext = (overrides = {}) => ({
    analysisId: "synthetic-interpretation-fixture",
    generatedAt: "2026-07-17T12:00:00.000Z",
    athleteGoals: [],
    primaryEvent: null,
    phase: "unknown",
    coachRelevantAreas: [],
    persistenceSignals: [],
    baselineSignals: [],
    contextVersion: "ava-priority-context-v1",
    ...overrides,
  });
  const generate = (bundle, overrides = {}, recommendationOverride = null) =>
    generatePriorities({
      observations: bundle.fixture.observations,
      interpretations: bundle.interpretations,
      recommendations: recommendationOverride ?? bundle.recommendations,
      context: priorityContext(overrides),
    });

  const panning = layers("panning_broad_technique");
  const basic = generate(panning);
  check("deterministic engine ranks existing recommendations", basic.topPriorities.length === 1);
  check("Top priorities never exceed three", basic.topPriorities.length <= 3);
  check("secondary priorities never exceed five", basic.secondaryPriorities.length <= 5);
  check("missing-evidence action is classified explicitly", basic.missingEvidencePriorities.some((item) => item.recommendationId === basic.topPriorities[0].recommendationId));
  check("priority exposes traceable evidence and validation", basic.topPriorities.every((item) => item.linkedEvidence.length && item.nextValidationStep));

  const baseRecommendation = panning.recommendations.monitoringRecommendations[0];
  const clone = (suffix, overrides = {}) => ({
    ...baseRecommendation,
    id: `${baseRecommendation.id}:${suffix}`,
    recommendationKey: `candidate_${suffix}`,
    title: `Candidate ${suffix}`,
    actionType: "technical_cue",
    interventionType: "technique_focus",
    status: "supported",
    safetyTier: "tier_2",
    expectedOutcomeArea: suffix,
    ...overrides,
  });
  const high = clone("high", { confidence: "High", interventionEvidenceQuality: "moderate", athleteGoalRelevance: "high" });
  const low = clone("low", { confidence: "Low", interventionEvidenceQuality: "heuristic", athleteGoalRelevance: "unknown" });
  const twoCandidateResult = {
    ...panning.recommendations,
    monitoringRecommendations: [],
    preserveRecommendations: [],
    recommendations: [low, high],
  };
  const confidenceRanking = generate(panning, { phase: "maximum_velocity" }, twoCandidateResult);
  check("high-confidence finding ranks above low-confidence finding", confidenceRanking.topPriorities[0].recommendationId === high.id);
  check("low confidence lowers ranking", confidenceRanking.topPriorities.findIndex((item) => item.recommendationId === low.id) > confidenceRanking.topPriorities.findIndex((item) => item.recommendationId === high.id));

  const missing = { ...baseRecommendation, id: `${baseRecommendation.id}:missing`, recommendationKey: "collect_missing", confidence: "Low" };
  const speculative = clone("speculative", { confidence: "Low", interventionEvidenceQuality: "heuristic" });
  const missingResult = {
    ...panning.recommendations,
    monitoringRecommendations: [missing],
    preserveRecommendations: [],
    recommendations: [speculative],
  };
  const missingRanking = generate(panning, {}, missingResult);
  check("missing evidence outranks speculative correction", missingRanking.topPriorities[0].recommendationId === missing.id);

  const repeated = clone("repeated", { confidence: "Moderate", interventionEvidenceQuality: "limited" });
  const isolated = clone("isolated", { confidence: "Moderate", interventionEvidenceQuality: "limited" });
  const persistenceResult = {
    ...panning.recommendations,
    monitoringRecommendations: [],
    preserveRecommendations: [],
    recommendations: [isolated, repeated],
  };
  const persistenceRanking = generate(
    panning,
    {
      phase: "maximum_velocity",
      persistenceSignals: [
        { recommendationKey: repeated.recommendationKey, compatibleSessionCount: 3, persistent: true, directionConsistent: true },
      ],
    },
    persistenceResult,
  );
  check("repeated findings outrank isolated findings", persistenceRanking.topPriorities[0].recommendationId === repeated.id);
  check("cross-session persistence appears in categorical trace", persistenceRanking.trace.find((entry) => entry.recommendationId === repeated.id).scoreComponents.some((item) => item.factor === "cross_session_persistence" && item.effect === "increased"));

  const stable = layers("stable_high_quality_maximum_velocity");
  const stablePriority = generate(stable);
  check("strengths become preserve priorities", stablePriority.supportingStrengths.some((item) => item.kind === "strength"));
  check("preserve findings create explicit not-priority output", stablePriority.notPriorities.some((item) => /preserve|strength/i.test(item.reason)));

  const contradictory = layers("contradictory_asymmetry");
  const contradictionPriority = generate(contradictory);
  check("contradictions resolve to evidence collection", contradictionPriority.topPriorities.every((item) => item.kind === "missing_evidence"));

  const duplicateA = clone("front_side_knee", { recommendationKey: "front_side_knee_height" });
  const duplicateB = clone("front_side_recovery", { recommendationKey: "front_side_recovery" });
  const duplicateResult = {
    ...panning.recommendations,
    monitoringRecommendations: [],
    preserveRecommendations: [],
    recommendations: [duplicateA, duplicateB],
  };
  const duplicatePriority = generate(panning, { phase: "maximum_velocity" }, duplicateResult);
  check("duplicate evidence family merges to one priority", duplicatePriority.topPriorities.length === 1);
  check("duplicate merge is recorded", duplicatePriority.trace.some((entry) => entry.mergeBehavior));

  const unknownPhase = generate(panning, { phase: "unknown" }, twoCandidateResult);
  check("unknown phase lowers phase-specific ranking support", unknownPhase.trace.find((entry) => entry.recommendationId === high.id).scoreComponents.some((item) => item.factor === "sprint_phase" && item.effect === "decreased"));

  check("expected impact uses only supported categories", [...basic.topPriorities, ...basic.secondaryPriorities].every((item) => ["High", "Moderate", "Low", "Unknown"].includes(item.expectedImpact)));
  check("internal numeric score is not exposed", !JSON.stringify(basic).includes('"score"') && basic.trace.every((entry) => entry.scoreComponents.every((item) => !("value" in item))));
  check("same versioned input produces deterministic output", JSON.stringify(generate(panning)) === JSON.stringify(basic));

  let crossLayerRejected = false;
  try {
    generatePriorities({
      observations: panning.fixture.observations,
      interpretations: panning.interpretations,
      recommendations: { ...panning.recommendations, analysisId: "different-analysis" },
      context: priorityContext(),
    });
  } catch {
    crossLayerRejected = true;
  }
  check("cross-analysis layer inputs are rejected", crossLayerRejected);
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (!ok) process.exit(1);
console.log("\\nPriority Engine sanity checks passed.");
