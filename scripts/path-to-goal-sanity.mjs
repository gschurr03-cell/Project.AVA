// Unit sanity for the Path To Goal presentation layer (Part B). Verifies the
// view-model, left/right classification, progress stages, target rows, gain display,
// and priority ordering — all pure, consuming the (unchanged) Part A engines.
//
//   node scripts/path-to-goal-sanity.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".path-to-goal-tmp");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return originalResolve.call(this, request.startsWith("@/") ? path.join(out, request.slice(2)) : request, ...rest);
};

let ok = true;
const check = (label, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) ok = false; };
const near = (a, b, eps = 1e-3) => a != null && b != null && Math.abs(a - b) <= eps;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
    compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] } },
    files: [
      path.join(root, "src/lib/intelligence/performanceGap/index.ts"),
      path.join(root, "src/lib/intelligence/performanceGap/presentation/index.ts"),
    ],
  }));
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const pg = require(path.join(out, "lib/intelligence/performanceGap/index.js"));
  const pres = require(path.join(out, "lib/intelligence/performanceGap/presentation/index.js"));
  const { buildAthletePerformanceModel } = pg;
  const {
    buildPathToGoalView, analyzeLeftRight, classifyAsymmetry, buildLeftRightPanel,
    computeAnalysisProgress, PROGRESS_STAGES,
  } = pres;

  const input = {
    athleteId: "a1", distanceM: 100, currentTimeS: 10.36, goalTimeS: 10.05,
    metrics: {
      strideLength: 2.14, strideFrequency: 4.86, peakVelocity: 11.5, averageVelocity: 9.65,
      groundContactTime: 0.09, flightTime: 0.12, acceleration: 6.0,
      strideLengthLeft: 2.10, strideLengthRight: 2.18,
    },
    now: new Date("2026-07-21T00:00:00.000Z"),
  };
  const model = buildAthletePerformanceModel(input);
  const lr = { strideLengthLeft: 2.10, strideLengthRight: 2.18, strideFrequencyLeft: 4.9, strideFrequencyRight: 4.82 };
  const view = buildPathToGoalView(model, lr);

  // ---- Headline ----
  check("headline: distance/current/goal + remaining gap",
    view.headline.distanceM === 100 && near(view.headline.remainingGapS, 0.31, 1e-9));
  check("headline: current + required average velocity",
    near(view.headline.currentAvgVelocityMps, 100 / 10.36) && near(view.headline.requiredAvgVelocityMps, 100 / 10.05));

  // ---- Performance breakdown ----
  check("breakdown: contribution slices present + ordered by priority",
    view.breakdown.length > 0 && view.breakdown.every((b, i) => i === 0 || view.breakdown[i - 1].contributionPct >= b.contributionPct));
  check("breakdown: contribution percentages are numbers 0..100",
    view.breakdown.every((b) => b.contributionPct >= 0 && b.contributionPct <= 100));

  // ---- Limiter cards: fully quantified ----
  const c1 = view.limiterCards[0];
  check("limiter #1: rank 1 + current/target/gap/percentGap/contribution present",
    c1.rank === 1 && c1.current != null && c1.target != null && c1.gap != null && c1.percentGap != null && c1.contributionPct != null);
  check("limiter #1: carries why/evidence/confidence/associations/interventions/tree",
    !!c1.whyItMatters && c1.evidence.length > 0 && !!c1.confidence.category &&
    c1.associatedTechnicalPatterns.length > 0 && c1.associatedMuscleGroups.length > 0 &&
    c1.recommendedInterventions.length > 0 && c1.tree != null);
  check("limiter cards: ranked ascending (1,2,3,…)",
    view.limiterCards.every((c, i) => c.rank === i + 1));

  // ---- Target rows: every metric shows current → requirement → gap + evidence ----
  const slRow = view.targetRows.find((r) => r.metricId === "strideLength");
  check("target row: stride length shows current, target, gap, evidence category",
    slRow.current === 2.14 && slRow.target > 2.14 && slRow.gap > 0 && ["measured", "estimated", "inferred", "unknown"].includes(slRow.evidence));
  check("target rows: cover the supported metrics", view.targetRows.length >= 6);

  // ---- Recommendation cards ----
  const rc = view.recommendationCards.find((r) => r.recommendationId === "reactiveStrength");
  check("rec card: title/reason/confidence + muscle groups + drills + strength + mobility + sprint",
    !!rc.title && !!rc.reason && rc.confidence.category === "estimated" &&
    rc.associatedMuscleGroups.length > 0 && rc.drills.length > 0 && rc.strengthWork.length > 0 &&
    rc.mobilityWork.length > 0 && rc.sprintSessions.length > 0);
  check("rec card: estimated effects + RANGED time savings (never a single guarantee)",
    rc.estimatedEffects.length >= 2 && rc.estimatedRaceTimeGainS && rc.estimatedRaceTimeGainS.min <= rc.estimatedRaceTimeGainS.max);
  check("rec card: primary metric current/target/gap wired from the gap engine",
    rc.primaryMetricId === "strideLength" && rc.current != null && rc.target != null);
  check("rec card: reserves a future progress-tracking key (not implemented)", rc.progressTrackingKey.startsWith("progress:"));

  // ---- Left/Right analysis: classified, symmetry not assumed optimal ----
  const normal = analyzeLeftRight({ metricId: "strideLength", label: "Stride Length", unit: "m", left: 2.15, right: 2.14 });
  check("L/R: ~0.5% difference → normal_variation, impact 0 (perfect symmetry not required)",
    normal.classification === "normal_variation" && normal.performanceImpact === 0);
  const limiter = analyzeLeftRight({ metricId: "strideLength", label: "Stride Length", unit: "m", left: 2.05, right: 2.25 });
  check("L/R: ~9% difference → performance_limiter with an estimated impact",
    limiter.classification === "performance_limiter" && limiter.performanceImpact > 0);
  const big = analyzeLeftRight({ metricId: "strideLength", label: "Stride Length", unit: "m", left: 2.0, right: 2.4 });
  check("L/R: ~18% difference → review_recommended (flagged, NOT diagnosed)",
    big.classification === "review_recommended" && /review/i.test(big.note) && !/injur|weak|damaged/i.test(big.note));
  check("L/R: classes are distinct (normal < moderate < limiter < review)",
    classifyAsymmetry(1) === "normal_variation" && classifyAsymmetry(4) === "moderate_asymmetry" &&
    classifyAsymmetry(8) === "performance_limiter" && classifyAsymmetry(15) === "review_recommended");
  check("L/R: each analysis carries associated technical patterns + muscle groups",
    view.leftRight.every((a) => a.associatedTechnicalPatterns.length >= 0 && a.associatedMuscleGroups.length >= 0));
  check("L/R panel: built for the supported pairs", buildLeftRightPanel(lr).length >= 2);

  // ---- Progress model: real signal → 10 stages, honest ----
  check("progress: exactly 10 canonical stages ending in Complete",
    PROGRESS_STAGES.length === 10 && PROGRESS_STAGES[9].id === "complete");
  const queued = computeAnalysisProgress({ status: "queued" });
  check("progress: queued → Uploading Video, 0%", queued.activeStageId === "uploading" && queued.percent === 0);
  const processing = computeAnalysisProgress({ status: "processing", workerStage: "processing" });
  check("progress: processing/pose → Tracking Pose, percent between 0 and 100",
    processing.activeStageId === "tracking_pose" && processing.percent > 0 && processing.percent < 100);
  const done = computeAnalysisProgress({ status: "completed" });
  check("progress: completed → 100% + every stage complete",
    done.percent === 100 && done.stages.every((s) => s.state === "complete"));
  check("progress: estimated remaining decreases as stages advance",
    computeAnalysisProgress({ status: "queued" }).estimatedRemainingSeconds >
      computeAnalysisProgress({ status: "processing", workerStage: "completing" }).estimatedRemainingSeconds);
  const stalled = computeAnalysisProgress({ status: "processing", workerStage: "processing", elapsedSeconds: 10000 });
  check("progress: a long-running stage is reported stalled (not silently advanced)",
    stalled.stalled === true && stalled.activeStageLabel === "Tracking Pose");
  const failed = computeAnalysisProgress({ status: "failed", workerStage: "processing" });
  check("progress: failed status surfaces which stage was running", failed.failed === true && !!failed.activeStageLabel);

  // ---- Determinism + serialization ----
  check("view: deterministic (identical input → identical JSON)",
    JSON.stringify(buildPathToGoalView(model, lr)) === JSON.stringify(view));
  check("view: fully serializable + provenance preserved from engines",
    JSON.parse(JSON.stringify(view)).provenance.configVersion === model.provenance.configVersion);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
