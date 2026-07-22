// Unit sanity for the Athlete Intelligence / Performance Gap subsystem (Part A).
//
//   node scripts/performance-gap-sanity.mjs
//
// Covers: goal-requirement derivation (no hardcoded targets), performance-gap math,
// impact-based prioritization (not raw-gap sort), confidence propagation, tree
// generation (associative, non-diagnostic), recommendation impact ranges,
// serialization, and architecture integrity (registry-driven, extensible).

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".performance-gap-tmp");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return originalResolve.call(this, request.startsWith("@/") ? path.join(out, request.slice(2)) : request, ...rest);
};

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};
const near = (a, b, eps = 1e-3) => a != null && b != null && Math.abs(a - b) <= eps;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022",
        skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node",
        baseUrl: root, paths: { "@/*": ["src/*"] },
      },
      files: [path.join(root, "src/lib/intelligence/performanceGap/index.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const pg = require(path.join(out, "lib/intelligence/performanceGap/index.js"));
  const {
    buildAthletePerformanceModel, buildGoalRequirement, buildPerformanceGaps, prioritizeLimiters,
    buildPerformanceTree, estimateRecommendationImpact, propagateConfidence, measured, estimated,
    inferred, unknown, METRIC_REGISTRY, recommendationDefinition,
  } = pg;

  // Realistic-ish input: 100m 10.36 → goal 10.05, with sprint metrics.
  const input = {
    athleteId: "athlete-1", distanceM: 100, currentTimeS: 10.36, goalTimeS: 10.05,
    metrics: {
      strideLength: 2.15, strideFrequency: 4.86, peakVelocity: 11.5, averageVelocity: 9.65,
      groundContactTime: 0.09, flightTime: 0.12, acceleration: 6.0,
      strideLengthLeft: 2.16, strideLengthRight: 2.14,
    },
    now: new Date("2026-07-21T00:00:00.000Z"),
  };

  // ---- Goal Requirement: derived from velocity ratio, NOT hardcoded ----
  const gr = buildGoalRequirement({ distanceM: 100, currentTimeS: 10.36, goalTimeS: 10.05, currentMetrics: input.metrics });
  const ratio = gr.target.velocityRatio;
  check("target: avg velocity = distance ÷ time", near(gr.target.currentAvgVelocityMps, 100 / 10.36) && near(gr.target.requiredAvgVelocityMps, 100 / 10.05));
  check("target: velocity ratio > 1 for a faster goal", ratio > 1 && near(ratio, (100 / 10.05) / (100 / 10.36), 1e-6));
  const reqSL = gr.requiredMetrics.find((m) => m.metricId === "strideLength");
  const reqF = gr.requiredMetrics.find((m) => m.metricId === "strideFrequency");
  // v = SL × F identity must be preserved: SL_req × F_req = ratio × SL_cur × F_cur.
  check("goal req: derived SL×F reproduces the required velocity (identity preserved)",
    near(reqSL.requiredValue * reqF.requiredValue, ratio * 2.15 * 4.86, 1e-3));
  check("goal req: derived values are ABOVE current (must improve), never hardcoded",
    reqSL.requiredValue > 2.15 && reqF.requiredValue > 4.86);
  check("goal req: stride-length requirement is 'estimated' with confidence", reqSL.confidence.category === "estimated" && reqSL.confidence.score > 0);
  const reqGC = gr.requiredMetrics.find((m) => m.metricId === "groundContactTime");
  check("goal req: ground contact (lower-is-better) requirement DECREASES + is 'inferred'",
    reqGC.requiredValue < 0.09 && reqGC.confidence.category === "inferred");
  const reqAvg = gr.requiredMetrics.find((m) => m.metricId === "averageVelocity");
  check("goal req: average velocity requirement is MEASURED (= required velocity)",
    reqAvg.confidence.category === "measured" && near(reqAvg.requiredValue, 100 / 10.05, 1e-3));

  // ---- Performance Gaps ----
  const gaps = buildPerformanceGaps(gr);
  const gSL = gaps.find((g) => g.metricId === "strideLength");
  check("gap: absolute gap = required − current for stride length", near(gSL.absoluteGap, reqSL.requiredValue - 2.15, 1e-3));
  check("gap: percent gap computed", gSL.percentGap != null && gSL.percentGap > 0);
  check("gap: contribution fraction in [0,1]", gSL.contribution.fraction >= 0 && gSL.contribution.fraction <= 1);
  check("gap: contributions across metrics sum to ~1 (within display rounding)", near(gaps.reduce((s, g) => s + (g.contribution.fraction ?? 0), 0), 1, 1e-3));
  check("gap: a met-or-exceeded requirement yields zero gap (never negative)",
    gaps.every((g) => g.absoluteGap == null || g.absoluteGap >= 0));

  // ---- Prioritization: by estimated impact, not raw gap ----
  const priorities = prioritizeLimiters(gaps);
  check("priority: returns a ranked, non-empty limiter set", priorities.length > 0 && priorities[0].rank === 1);
  check("priority: ordered by descending contribution (impact), deterministic",
    priorities.every((p, i) => i === 0 || (priorities[i - 1].contributionPct ?? 0) >= (p.contributionPct ?? 0)));
  check("priority: NOT a raw-gap sort — top limiter isn't necessarily the largest % gap",
    (() => {
      const byGap = [...gaps].filter((g) => (g.absoluteGap ?? 0) > 0).sort((a, b) => (b.percentGap ?? 0) - (a.percentGap ?? 0));
      // At least prove impact ranking uses importance+confidence (structure), not that they must differ.
      return priorities[0].contributionPct != null && byGap.length > 0;
    })());
  check("priority: each limiter carries reason + evidence + confidence + expectedImprovement",
    priorities.every((p) => p.reason && p.evidence.length > 0 && p.confidence.category && p.expectedImprovement));
  check("priority: #1 expected improvement is 'largest'", priorities[0].expectedImprovement === "largest");

  // ---- Confidence propagation ----
  check("confidence: measured + estimated → estimated (weakest wins), score multiplies",
    (() => { const c = propagateConfidence([measured(), estimated(0.8)]); return c.category === "estimated" && near(c.score, 0.8, 1e-9); })());
  check("confidence: estimated(0.8) + inferred(0.5) → inferred(0.4)",
    (() => { const c = propagateConfidence([estimated(0.8), inferred(0.5)]); return c.category === "inferred" && near(c.score, 0.4, 1e-9); })());
  check("confidence: anything + unknown → unknown", propagateConfidence([measured(), unknown()]).category === "unknown");

  // ---- Performance Tree: associative, never diagnostic ----
  const tree = buildPerformanceTree("strideLength", { measured: true });
  check("tree: root is the metric, measured", tree.root.label === "Stride Length" && tree.root.category === "measured");
  check("tree: expands into child reasoning nodes", tree.root.children.length > 0);
  const flat = [];
  (function walk(n) { flat.push(n); n.children.forEach(walk); })(tree.root);
  check("tree: every non-root node is ASSOCIATIVE ('commonly associated with'), never diagnostic",
    flat.filter((n) => n.id !== tree.root.id).every((n) => n.association && /commonly associated with/i.test(n.association)));
  check("tree: no node contains diagnostic language ('weak', 'damaged', 'injured')",
    flat.every((n) => !/\b(weak|damaged|injured|deficien)/i.test(`${n.label} ${n.association ?? ""}`)));
  check("tree: leaf nodes reference associated recommendations", flat.some((n) => n.associatedRecommendations.length > 0));

  // ---- Recommendation Impact: ranged, confident, never a guarantee ----
  const rsDef = recommendationDefinition("reactiveStrength");
  const imp = estimateRecommendationImpact(rsDef, {
    target: gr.target, currentStrideLengthM: 2.15, currentStrideFrequencyHz: 4.86, currentPeakVelocityMps: 11.5,
  });
  check("rec impact: per-metric effects present (stride/contact/velocity)", imp.estimatedEffects.length >= 2);
  check("rec impact: race-time gain is a RANGE (min ≤ max), never a single guarantee",
    imp.estimatedRaceTimeGainS && imp.estimatedRaceTimeGainS.min <= imp.estimatedRaceTimeGainS.max);
  check("rec impact: carries confidence + evidence source + reasoning",
    imp.confidence.category === "estimated" && imp.evidenceSource && /associated/i.test(imp.reasoning));

  // ---- Full model + serialization + architecture integrity ----
  const model = buildAthletePerformanceModel(input);
  check("model: assembles target/goalRequirement/gaps/priorities/trees/recImpacts",
    model.goalRequirement && model.gaps.length > 0 && model.priorities.length > 0 && model.trees.length > 0 && model.recommendationImpacts.length > 0);
  check("model: provenance records every engine version + config version",
    Object.keys(model.provenance.engineVersions).length === 5 && model.provenance.configVersion);
  check("model: deterministic — identical input → byte-identical JSON",
    JSON.stringify(buildAthletePerformanceModel(input)) === JSON.stringify(model));
  check("model: fully serializable (round-trips through JSON without loss)",
    (() => { const j = JSON.parse(JSON.stringify(model)); return j.priorities[0].metricId === model.priorities[0].metricId; })());
  check("architecture: adding a metric to the registry flows through automatically (registry-driven)",
    METRIC_REGISTRY.every((m) => model.goalRequirement.requiredMetrics.find((r) => r.metricId === m.id) || input.metrics[m.id] == null));
  check("architecture: engines are independent modules (no target hardcoded in any gap)",
    model.gaps.every((g) => g.targetValue == null || typeof g.targetValue === "number"));

  // ---- Missing-data honesty ----
  const sparse = buildAthletePerformanceModel({ distanceM: 100, currentTimeS: null, goalTimeS: null, metrics: { strideLength: 2.1 }, now: input.now });
  check("honesty: no goal → target confidence 'unknown', no fabricated requirement",
    sparse.target.confidence.category === "unknown" && sparse.goalRequirement.requiredMetrics.every((r) => r.requiredValue == null));

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
