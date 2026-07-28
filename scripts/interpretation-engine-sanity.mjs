import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".interpretation-sanity-tmp");
const require = createRequire(import.meta.url);
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return originalResolve.call(
    this,
    request.startsWith("@/") ? path.join(out, request.slice(2)) : request,
    ...rest
  );
};
let ok = true;
const check = (label, condition) => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) ok = false;
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        outDir: out,
        rootDir: path.join(root, "src"),
        module: "commonjs",
        target: "es2022",
        skipLibCheck: true,
        esModuleInterop: true,
        strict: true,
        moduleResolution: "node",
        baseUrl: root,
        paths: { "@/*": ["src/*"] },
      },
      files: [
        path.join(root, "src/lib/observations/contracts.ts"),
        path.join(root, "src/lib/observations/index.ts"),
        path.join(root, "src/lib/intelligence/interpretations/index.ts"),
        path.join(root, "src/lib/intelligence/interpretations/fixtures.ts"),
      ],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], {
    cwd: root,
    stdio: ["ignore", "inherit", "inherit"],
  });
  const {
    generateInterpretations,
    INTERPRETATION_RULES,
    resolveInterpretationLifecycle,
    unsafeInterpretationPhrases,
  } = require(path.join(out, "lib/intelligence/interpretations/index.js"));
  const {
    INTERPRETATION_GOLDEN_FIXTURES,
    syntheticContext,
    syntheticObservation,
  } = require(path.join(out, "lib/intelligence/interpretations/fixtures.js"));

  const generate = (name) => generateInterpretations(INTERPRETATION_GOLDEN_FIXTURES[name]);
  const stable = generate("stable_high_quality_maximum_velocity");
  check("observations feed the engine and produce interpretations", stable.interpretations.length >= 1);
  check("engine version is persisted in the result", stable.engineVersion === "ava-interpretations-v1");
  check("source Observation Engine version is preserved", stable.sourceObservationEngineVersion === "ava-observations-v1");
  check("every output links structured observations", stable.interpretations.every((item) => item.linkedObservationIds.length > 0));
  check("every output exposes alternatives", stable.interpretations.every((item) => Array.isArray(item.alternativeExplanations)));
  check("every output exposes excluded conclusions", stable.interpretations.every((item) => item.excludedConclusions.length > 0));

  const experimental = generate("experimental_30_fps");
  check("30 FPS restrictions remain experimental", experimental.interpretations.every((item) => item.status === "experimental"));
  check("30 FPS confidence cannot exceed Low", experimental.interpretations.every((item) => ["Low", "Unavailable"].includes(item.confidence)));

  const panning = generate("panning_broad_technique");
  check("panning limitations lower interpretation confidence", panning.interpretations.every((item) => item.confidence === "Low"));
  check("panning alternatives preserve camera movement", panning.interpretations.some((item) => item.alternativeExplanations.includes("camera_motion")));

  const single = generate("single_metric_asymmetry");
  check("single asymmetry remains isolated and heuristic", single.interpretations.some((item) => item.interpretationKey === "isolated_stride_length_asymmetry" && item.evidenceQuality === "heuristic"));

  const converging = generate("converging_asymmetry");
  check("multi-observation convergence works", converging.interpretations.some((item) => item.interpretationKey === "converging_asymmetry" && item.linkedObservationIds.length === 2));
  check("overlapping isolated asymmetry output is suppressed", !converging.interpretations.some((item) => item.interpretationKey.startsWith("isolated_")));

  const contradictory = generate("contradictory_asymmetry");
  check("contradictory asymmetry is separated from normal output", contradictory.contradictedInterpretations.some((item) => item.interpretationKey === "contradictory_asymmetry"));
  check("contradiction trace records resolution", contradictory.trace.some((item) => item.conflictResolution || item.finalOutputId));

  const frontUnknown = generate("reduced_front_side_unknown_phase");
  check("phase-specific rule becomes context_required when phase is unknown", frontUnknown.interpretations.some((item) => item.status === "context_required"));
  const frontIncompatible = generateInterpretations({
    ...INTERPRETATION_GOLDEN_FIXTURES.reduced_front_side_unknown_phase,
    context: syntheticContext({ phase: "block_start" }),
  });
  check("incompatible phase cannot produce a supported interpretation", frontIncompatible.interpretations.every((item) => item.status === "context_required"));

  const variable = generate("variable_posture_transition");
  check("known transition posture keeps phase context", variable.interpretations.some((item) => item.phase === "transition"));

  const unavailable = generate("velocity_unavailable_without_calibration");
  check("withheld observations do not trigger conclusions", unavailable.interpretations.length === 0);
  check("withheld observations are traceably rejected", unavailable.trace.some((entry) => entry.observationsRejected.some((item) => /unavailable|withheld/.test(item.reason))));

  const low = generate("low_confidence_only");
  check("low-confidence evidence remains low", low.interpretations.every((item) => item.confidence === "Low"));
  const empty = generate("no_observations");
  check("no observations produces a clear warning", empty.interpretations.length === 0 && empty.warnings.some((item) => item.includes("No observations")));

  const duplicates = generate("duplicate_observation_family");
  check("duplicate interpretation family emits one velocity interpretation", duplicates.interpretations.filter((item) => item.interpretationKey === "velocity_context_available").length === 1);

  const crossAnalysis = generateInterpretations({
    observations: [
      syntheticObservation({
        id: "ava-observations-v1:different-analysis:cadence.availability.v1",
        ruleId: "cadence.availability.v1",
        title: "Cadence available",
        category: "StrideFrequency",
      }),
    ],
    context: syntheticContext(),
  });
  check("cross-analysis observations are rejected", crossAnalysis.interpretations.length === 0);

  const nullEvidence = syntheticObservation({
    ruleId: "cadence.availability.v1",
    title: "Cadence available",
    category: "StrideFrequency",
  });
  nullEvidence.evidence[0].value = null;
  const nullResult = generateInterpretations({ observations: [nullEvidence], context: syntheticContext() });
  check("null is never interpreted as zero", nullResult.interpretations.length === 0);

  const athleteText = stable.interpretations
    .map((item) => [item.title, item.summary, item.explanation, item.likelyMeaning].join(" "))
    .join(" ");
  check("unsafe causal language is absent", unsafeInterpretationPhrases(athleteText).length === 0);

  check("registry contains a focused 15–25 rule catalog", INTERPRETATION_RULES.length >= 15 && INTERPRETATION_RULES.length <= 25);
  check("every rule has a stable version", INTERPRETATION_RULES.every((rule) => rule.ruleId && rule.version));
  check("every rule declares context/applicability policies", INTERPRETATION_RULES.every((rule) => rule.phaseApplicability.length && rule.cameraApplicability.length && rule.fpsApplicability.length));
  check("every rule output declares alternatives and exclusions", INTERPRETATION_RULES.every((rule) => {
    const draft = rule.outputFactory([], syntheticContext());
    return Array.isArray(draft.alternativeExplanations) && draft.excludedConclusions.length > 0;
  }));
  check("every rule template passes language safety", INTERPRETATION_RULES.every((rule) => {
    const draft = rule.outputFactory([], syntheticContext());
    return unsafeInterpretationPhrases([draft.title, draft.summary, draft.explanation, draft.likelyMeaning].join(" ")).length === 0;
  }));

  const repeated = generate("stable_high_quality_maximum_velocity");
  check("same versioned input is deterministic", JSON.stringify(repeated) === JSON.stringify(stable));

  const working = resolveInterpretationLifecycle({
    generationInput: INTERPRETATION_GOLDEN_FIXTURES.stable_high_quality_maximum_velocity,
    savedVersion: false,
    storedResult: null,
  });
  check("working analyses regenerate deterministically", working.behavior === "regenerated" && !!working.result);
  const saved = resolveInterpretationLifecycle({
    generationInput: INTERPRETATION_GOLDEN_FIXTURES.stable_high_quality_maximum_velocity,
    savedVersion: true,
    storedResult: stable,
  });
  check("saved result uses immutable stored snapshot", saved.behavior === "immutable_snapshot" && saved.result === stable);
  const missingSaved = resolveInterpretationLifecycle({
    generationInput: INTERPRETATION_GOLDEN_FIXTURES.stable_high_quality_maximum_velocity,
    savedVersion: true,
    storedResult: null,
  });
  check("saved version without snapshot fails closed", missingSaved.behavior === "snapshot_required" && missingSaved.result === null);
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (!ok) process.exit(1);
console.log("\\nInterpretation Engine sanity checks passed.");
