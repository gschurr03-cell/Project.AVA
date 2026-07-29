// Unit sanity for the Root Cause Intelligence Engine (Phase 3, Sprint Intelligence).
// Verifies weighted multi-contributor reasoning (never a single cause), configurable
// rule evaluation, confidence propagation, evidence chains, metric interactions,
// athlete-context adaptation, intervention generation, and architecture integrity.
// Consumes the (unchanged) Phase 1 engines.
//
//   node scripts/root-cause-intelligence-sanity.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".root-cause-intelligence-tmp");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return originalResolve.call(this, request.startsWith("@/") ? path.join(out, request.slice(2)) : request, ...rest);
};

let ok = true;
const check = (label, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) ok = false; };
const near = (a, b, eps = 0.5) => a != null && b != null && Math.abs(a - b) <= eps;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
    compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] } },
    files: [
      path.join(root, "src/lib/intelligence/performanceGap/index.ts"),
      path.join(root, "src/lib/intelligence/performanceGap/rootCause/index.ts"),
    ],
  }));
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const pg = require(path.join(out, "lib/intelligence/performanceGap/index.js"));
  const rc = require(path.join(out, "lib/intelligence/performanceGap/rootCause/index.js"));
  const { buildAthletePerformanceModel } = pg;
  const {
    buildRootCauseReport, evaluateRootCauses, evaluateRule, computeMetricStatuses,
    traceInteraction, contextModifiers, REASONING_RULES, CONTRIBUTORS, candidateContributors,
  } = rc;

  const input = {
    athleteId: "a1", distanceM: 100, currentTimeS: 10.36, goalTimeS: 10.05,
    metrics: {
      strideLength: 2.05, strideFrequency: 4.92, peakVelocity: 11.4, averageVelocity: 9.65,
      groundContactTime: 0.105, flightTime: 0.11, acceleration: 6.0,
      strideLengthLeft: 1.98, strideLengthRight: 2.12,
    },
    now: new Date("2026-07-21T00:00:00.000Z"),
  };
  const model = buildAthletePerformanceModel(input);
  const raw = {
    strideLengthLeft: 1.98, strideLengthRight: 2.12,
    groundContactTimeLeft: 0.11, groundContactTimeRight: 0.10,
  };

  const statuses = computeMetricStatuses(model.gaps);
  check("metric states: deficient/met/unknown derived from gaps",
    ["deficient", "met", "unknown"].includes(statuses.get("strideLength").state));

  const expl = evaluateRootCauses({ metricId: "strideLength", label: "Stride Length", gaps: model.gaps, rawMetrics: raw });
  check("root cause: evaluates MULTIPLE plausible contributors (never one guessed cause)", expl.rootCauses.length >= 5);
  check("root cause: likelihoods are weighted percentages summing to ~100",
    near(expl.rootCauses.reduce((s, c) => s + c.likelihoodPct, 0), 100, 1.0));
  check("root cause: sorted by descending likelihood (deterministic)",
    expl.rootCauses.every((c, i) => i === 0 || expl.rootCauses[i - 1].likelihoodPct >= c.likelihoodPct));
  check("root cause: NOT asserted as THE cause — leading contributor is a likelihood, not certainty",
    expl.leadingContributorId != null && expl.rootCauses[0].likelihoodPct < 100);
  check("root cause: every contributor stores confidence, supporting metrics, reasoning, muscle groups, interventions",
    expl.rootCauses.every((c) =>
      !!c.confidence.category && Array.isArray(c.supportingMetrics) && !!c.reasoning &&
      Array.isArray(c.associatedMuscleGroups) && Array.isArray(c.associatedInterventionCategories)));
  check("root cause: uses associative language, never diagnostic",
    expl.rootCauses.every((c) => !c.association || /commonly associated with/i.test(c.association)) &&
    expl.rootCauses.every((c) => !/\b(weak|damaged|injured|tear)\b/i.test(c.reasoning)));

  const reactiveRule = REASONING_RULES.find((r) => r.id === "reactive_force_stride");
  const m1 = evaluateRule(reactiveRule, statuses, raw);
  check("rule engine: evaluates against metric states (config-driven)",
    typeof m1.matched === "boolean" && Array.isArray(m1.supportingMetrics));
  const matched = REASONING_RULES.filter((r) => evaluateRule(r, statuses, raw).matched);
  check("rule engine: at least one rule matches this stride-length pattern", matched.length >= 1);
  check("rule engine: a rule with no conditions never matches",
    evaluateRule({ id: "x", appliesTo: ["*"], boost: [] }, statuses, raw).matched === false);

  const lead = expl.rootCauses[0];
  check("evidence chain: leading contributor has steps + conclusion + confidence",
    lead.evidenceChain.steps.length > 0 && !!lead.evidenceChain.conclusion && !!lead.evidenceChain.confidence.category);
  check("evidence chain: steps reference metrics + carry evidence categories",
    lead.evidenceChain.steps.every((s) => s.metricId != null && ["measured", "estimated", "inferred", "unknown"].includes(s.category)));

  const priorOnly = expl.rootCauses.find((c) => c.contributingRuleIds.length === 0);
  check("confidence: a prior-only contributor is 'inferred' with low confidence",
    !priorOnly || (priorOnly.confidence.category === "inferred" && priorOnly.confidence.score <= 0.4));
  check("confidence: a rule-matched contributor is at least as confident as a prior-only one",
    !priorOnly || (lead.contributingRuleIds.length > 0 && (lead.confidence.score ?? 1) >= (priorOnly.confidence.score ?? 0)));

  const inter = traceInteraction("strideLength");
  check("interactions: stride length traces a chain to finish time",
    inter.chain.length > 0 && inter.chain[inter.chain.length - 1].metricId === "finishTime");
  check("interactions: coupling-to-finish is a product of strengths in (0,1]",
    inter.couplingToFinish > 0 && inter.couplingToFinish <= 1);
  check("interactions: acceleration chain reaches finish time",
    traceInteraction("acceleration").chain.map((c) => c.metricId).includes("finishTime"));

  const tall = contextModifiers({ heightCm: 190, trainingAgeYears: 8 });
  const novice = contextModifiers({ heightCm: 175, trainingAgeYears: 1 });
  check("context: modifiers differ for a tall/experienced vs a short/novice athlete",
    (tall.projection ?? 1) > 1 && (novice.frontSideMechanics ?? 1) > 1 && JSON.stringify(tall) !== JSON.stringify(novice));
  const explTall = evaluateRootCauses({ metricId: "strideLength", label: "Stride Length", gaps: model.gaps, rawMetrics: raw, context: { heightCm: 192, legLengthCm: 98, trainingAgeYears: 9 } });
  const explNovice = evaluateRootCauses({ metricId: "strideLength", label: "Stride Length", gaps: model.gaps, rawMetrics: raw, context: { heightCm: 170, trainingAgeYears: 1 } });
  check("context: root-cause likelihoods differ between two different athletes (adaptive, not identical)",
    JSON.stringify(explTall.rootCauses.map((c) => [c.contributorId, c.likelihoodPct])) !==
    JSON.stringify(explNovice.rootCauses.map((c) => [c.contributorId, c.likelihoodPct])));

  check("left/right: shorter+longer-contact left side surfaces a left-side force contributor",
    expl.rootCauses.some((c) => c.contributorId === "leftSideForce" && c.likelihoodPct > 0));

  check("interventions: leading contributor maps to CATEGORIES with purpose + guidance (not a program)",
    lead.associatedInterventionCategories.length > 0 &&
    lead.associatedInterventionCategories.every((i) => !!i.purpose && !!i.typicalImplementation));
  check("interventions: associated muscle groups present (associations, not diagnoses)",
    lead.associatedMuscleGroups.length > 0 && lead.associatedMuscleGroups.every((m) => !!m.label));

  check("research-ready: rules can carry research metadata (seam present)",
    REASONING_RULES.some((r) => r.research != null));

  const report = buildRootCauseReport(model, { rawMetrics: raw, context: { heightCm: 185, trainingAgeYears: 6 } });
  check("report: one explanation per limiter + interactions + provenance (5 engines)",
    report.explanations.length === model.priorities.length && report.interactions.length > 0 &&
    Object.keys(report.provenance.engineVersions).length === 5);
  check("report: deterministic (identical input → identical JSON)",
    JSON.stringify(buildRootCauseReport(model, { rawMetrics: raw, context: { heightCm: 185, trainingAgeYears: 6 } })) === JSON.stringify(report));
  check("report: fully serializable (round-trips through JSON)",
    JSON.parse(JSON.stringify(report)).explanations[0].metricId === report.explanations[0].metricId);
  check("architecture: contributor catalog is config-driven + extensible",
    Object.keys(CONTRIBUTORS).length >= 10 && candidateContributors("strideLength").length >= 5);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
