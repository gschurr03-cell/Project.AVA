import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".recommendation-engine-sanity-tmp");
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
    ],
  }));
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { generateInterpretations } = require(path.join(out, "lib/intelligence/interpretations/evaluate.js"));
  const { INTERPRETATION_GOLDEN_FIXTURES, syntheticContext } = require(path.join(out, "lib/intelligence/interpretations/fixtures.js"));
  const {
    generateRecommendations,
    resolveRecommendationLifecycle,
    RECOMMENDATION_RULES,
    RECOMMENDATION_LIBRARY,
    CUE_LIBRARY,
    DRILL_LIBRARY,
    unsafeRecommendationPhrases,
  } = require(path.join(out, "lib/intelligence/recommendationEngine/index.js"));

  const context = (overrides = {}) => ({
    analysisId: "synthetic-interpretation-fixture",
    generatedAt: "2026-07-17T12:00:00.000Z",
    phase: "maximum_velocity",
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
    ...overrides,
  });
  const fromFixture = (name, contextOverrides = {}, options = {}) => {
    const interpretationInput = INTERPRETATION_GOLDEN_FIXTURES[name];
    const interpretations = generateInterpretations(interpretationInput);
    return generateRecommendations(
      { interpretations, context: context({ phase: interpretationInput.context.phase, cameraMode: interpretationInput.context.cameraMode, fpsTier: interpretationInput.context.fpsTier, ...contextOverrides }) },
      undefined,
      { allowExperimental: true, allowAdvancedDrills: false, allowProfessionalReview: false, ...options },
    );
  };
  const outputs = (result) => [...result.monitoringRecommendations, ...result.preserveRecommendations, ...result.recommendations];

  const stable = fromFixture("stable_high_quality_maximum_velocity");
  check("recommendations consume InterpretationResult", outputs(stable).length > 0);
  check("versions and library version persist", stable.engineVersion === "ava-recommendations-v1" && stable.libraryVersion === "ava-recommendation-library-v1");
  check("stable recording creates preserve output", stable.preserveRecommendations.some((item) => item.recommendationKey === "preserve_recording_setup"));

  const experimental = fromFixture("experimental_30_fps");
  check("30 FPS creates evidence collection rather than corrective drill", experimental.monitoringRecommendations.some((item) => item.recommendationKey === "repeat_at_60fps") && experimental.recommendations.length === 0);
  check("experimental recommendation remains labeled", outputs(experimental).every((item) => item.experimental && item.status === "experimental"));

  const panning = fromFixture("panning_broad_technique", { cameraMode: "smooth_pan" });
  check("panning creates static-view setup action", panning.monitoringRecommendations.some((item) => item.recommendationKey === "use_static_side_view"));
  check("panning does not create a mechanical drill", panning.recommendations.length === 0);

  const single = fromFixture("single_metric_asymmetry");
  check("one-session asymmetry creates monitoring first", single.monitoringRecommendations.some((item) => item.recommendationKey === "monitor_asymmetry"));
  check("low-confidence asymmetry does not create correction", single.recommendations.length === 0);

  const converging = fromFixture("converging_asymmetry");
  check("multi-metric asymmetry remains monitoring without repeated baseline", converging.monitoringRecommendations.some((item) => item.recommendationKey === "monitor_asymmetry"));
  check("professional review is disabled by default", !outputs(converging).some((item) => item.actionType === "coach_review"));

  const contradictory = fromFixture("contradictory_asymmetry");
  check("contradiction creates evidence collection", contradictory.monitoringRecommendations.some((item) => item.recommendationKey === "resolve_contradictory_evidence"));
  check("contradiction does not expose opposing cues", contradictory.recommendations.length === 0);

  const frontUnknown = fromFixture("reduced_front_side_unknown_phase", { phase: "unknown" });
  check("unknown phase selects reconfirmation", frontUnknown.monitoringRecommendations.some((item) => item.recommendationKey === "reconfirm_front_side"));
  check("unknown phase withholds phase-specific cue", !outputs(frontUnknown).some((item) => item.recommendationKey === "front_side_awareness"));

  const frontKnown = fromFixture("reduced_front_side_unknown_phase", { phase: "maximum_velocity" });
  check("low-confidence front-side evidence remains evidence collection even with phase context", frontKnown.monitoringRecommendations.some((item) => item.recommendationKey === "reconfirm_front_side") && !outputs(frontKnown).some((item) => item.recommendationKey === "front_side_awareness"));

  const variablePain = fromFixture("variable_posture_transition", {
    phase: "transition",
    athlete: { ...context().athlete, reportedPain: true },
  });
  check("active pain blocks ordinary drill/cue recommendation", !outputs(variablePain).some((item) => item.safetyTier === "tier_2"));
  check("active pain preserves Tier 1 monitoring", variablePain.monitoringRecommendations.some((item) => item.recommendationKey === "monitor_posture"));

  const low = fromFixture("low_confidence_only");
  check("low-confidence cadence defaults to monitoring", low.monitoringRecommendations.some((item) => item.recommendationKey === "monitor_cadence") && low.recommendations.length === 0);

  const unavailable = fromFixture("velocity_unavailable_without_calibration", { calibrationAvailable: false });
  check("unavailable interpretation cannot create corrective action", outputs(unavailable).length === 0);

  const empty = fromFixture("no_observations");
  check("no safe recommendation returns explicit warning", outputs(empty).length === 0 && empty.warnings.some((item) => item.includes("enough trusted evidence")));

  const duplicate = fromFixture("duplicate_observation_family");
  check("duplicate action family emits one velocity action", outputs(duplicate).filter((item) => item.recommendationKey === "repeat_velocity_zone").length === 1);

  const stableInterpretations = generateInterpretations(INTERPRETATION_GOLDEN_FIXTURES.stable_high_quality_maximum_velocity);
  const baseRule = RECOMMENDATION_RULES.find((rule) => rule.requiredInterpretationKeys.includes("recording_supports_review"));
  const duplicateRules = [
    { ...baseRule, ruleId: "test.duplicate.collect", libraryItemId: "repeat_velocity_zone", duplicateGroup: "test_duplicate" },
    { ...baseRule, ruleId: "test.duplicate.preserve", libraryItemId: "preserve_recording_setup", duplicateGroup: "test_duplicate" },
  ];
  const duplicateResult = generateRecommendations(
    { interpretations: stableInterpretations, context: context() },
    duplicateRules,
  );
  check("duplicate suppression retains one safe action and traces the loser", outputs(duplicateResult).length === 1 && duplicateResult.suppressedRecommendations.length === 1 && duplicateResult.trace.some((entry) => entry.duplicateSuppression));

  const athleteText = outputs(stable).flatMap((item) => [item.title, item.summary, item.objective, item.rationale, ...item.suggestedActions, ...item.technicalCues]).join(" ");
  check("unsafe recommendation language is absent", unsafeRecommendationPhrases(athleteText).length === 0);
  check("every output includes a monitoring plan", outputs(stable).every((item) => item.monitoringPlan.compatibilityRequirements.length > 0));
  check("every output includes stop conditions", outputs(stable).every((item) => item.stopConditions.length > 0));
  check("every output includes contraindications", outputs(stable).every((item) => item.contraindicationNotes.length > 0));
  check("every output includes excluded claims", outputs(stable).every((item) => item.excludedClaims.length > 0));
  check("no exact weekly program is generated", outputs(stable).every((item) => !/\b\d+\s*(sets?|reps?|x\/week|times\/week)\b/i.test(JSON.stringify(item.volumeGuidance))));

  check("focused catalog has 20–30 rules", RECOMMENDATION_RULES.length >= 20 && RECOMMENDATION_RULES.length <= 30);
  check("every rule declares safety and matching metadata", RECOMMENDATION_RULES.every((rule) => rule.version && rule.minimumConfidence && rule.minimumEvidenceQuality && rule.phaseApplicability.length && rule.eventApplicability.length && rule.safetyPolicy));
  check("recommendation library is versioned by result contract and fully enabled selectively", RECOMMENDATION_LIBRARY.length >= 10 && RECOMMENDATION_LIBRARY.every((item) => item.libraryItemId && item.stopConditions.length && item.contraindications.length));
  check("cue library contains only Tier 1–2 cues", CUE_LIBRARY.every((cue) => ["tier_1", "tier_2"].includes(cue.safetyTier)));
  check("drill library avoids maximal intensity", DRILL_LIBRARY.every((drill) => ["low", "submaximal"].includes(drill.intensity)));

  const repeated = fromFixture("stable_high_quality_maximum_velocity");
  check("same versioned input is deterministic", JSON.stringify(repeated) === JSON.stringify(stable));

  const generationInput = {
    interpretations: generateInterpretations(INTERPRETATION_GOLDEN_FIXTURES.stable_high_quality_maximum_velocity),
    context: context(),
  };
  const working = resolveRecommendationLifecycle({ generationInput, savedVersion: false, storedResult: null });
  check("working recommendations regenerate", working.behavior === "regenerated" && !!working.result);
  const saved = resolveRecommendationLifecycle({ generationInput, savedVersion: true, storedResult: stable });
  check("saved recommendations retain immutable snapshot", saved.behavior === "immutable_snapshot" && saved.result === stable);
  const missingSaved = resolveRecommendationLifecycle({ generationInput, savedVersion: true, storedResult: null });
  check("saved version without snapshot fails closed", missingSaved.behavior === "snapshot_required" && missingSaved.result === null);

  let rawRejected = false;
  try {
    generateRecommendations({ interpretations: { metrics: { topSpeedMps: 10 } }, context: context() });
  } catch {
    rawRejected = true;
  }
  check("raw metrics cannot bypass Interpretation Engine", rawRejected);
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (!ok) process.exit(1);
console.log("\\nRecommendation Engine sanity checks passed.");
