// Runtime sanity for the Sprint Intelligence engine (Day 60).
//
//   node scripts/intelligence-sanity.mjs
//
// Compiles the intelligence module (which consumes the calibration, prediction,
// phases, coaching-evaluation, and knowledge-base outputs) to a throwaway dir and
// drives it with several hand-built athlete scenarios. Asserts: the highest-impact
// limiter is chosen as primary and the rest ranked below it; every recommendation
// carries a reasoning trace, affected phases, drills, and a confidence; the
// cadence/stride synthesis and goal-gap framing fire; incomplete data lowers
// confidence and is surfaced as explicit data gaps (never fabricated); the
// all-clear and no-metrics paths behave; and output is deterministic.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".intelligence-sanity-tmp");

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  const mapped = request.startsWith("@/") ? path.join(out, request.slice(2)) : request;
  return originalResolve.call(this, mapped, ...rest);
};

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

// --- Fixture builders (plain report objects matching the engine's inputs) ----

const metrics = (over = {}) => ({
  topSpeedMps: 9.5,
  avgStrideLengthM: 0, // worker stride arrives 0 until calibration lands
  strideFrequencyHz: 4.9,
  groundContactTimeMs: 90,
  flightTimeMs: 120,
  peakKneeFlexionDeg: 100,
  avgTrunkLeanDeg: 8,
  ...over,
});

const calibration = ({ strideM = 2.1, confidence = "medium" } = {}) => ({
  calibrated: true,
  scale: { metersPerPixel: 0.01, method: "legLength", confidence, reason: "" },
  measurements: [{ key: "strideLength", label: "Stride length", value: strideM, unit: "m", confidence }],
  warnings: [],
});

const phases = ({ available = true, rising = false } = {}) => ({
  available,
  bands: available
    ? [
        { phase: "acceleration", startTime: 0.0, endTime: 1.2, velocityStartPct: 0.3, velocityEndPct: 0.85, stepCount: 4, confidence: "high", explanation: "" },
        { phase: "maxVelocity", startTime: 1.2, endTime: 2.4, velocityStartPct: 0.97, velocityEndPct: 1.0, stepCount: 5, confidence: "high", explanation: "" },
      ]
    : [],
  peakVelocityTime: available ? 2.0 : null,
  spanStart: 0,
  spanEnd: available ? 2.4 : 0,
  warnings: rising ? ["Velocity was still rising at the end of the clip — max velocity and later phases may be off-camera."] : [],
});

const prediction = ({ available = true, goal100 = 11.0, estimate100 = 11.35 } = {}) => ({
  available,
  confidence: "medium",
  estimatedTopVelocityMps: 9.5,
  estimates: available
    ? [
        { distance: 60, estimateSeconds: 7.2, currentPb: null, goal: null, diffFromPb: null, diffFromGoal: null },
        { distance: 100, estimateSeconds: estimate100, currentPb: null, goal: goal100, diffFromPb: null, diffFromGoal: goal100 != null ? Math.round((estimate100 - goal100) * 100) / 100 : null },
        { distance: 200, estimateSeconds: 23.0, currentPb: null, goal: null, diffFromPb: null, diffFromGoal: null },
      ]
    : [],
  factors: [],
  contextInputs: [],
  warnings: [],
  disclaimer: "",
});

const trainingFocus = ({ id = "ground-contact-time", occurrences = 3, sessions = 4 } = {}) => ({
  sessionsAnalyzed: sessions,
  allClear: false,
  primary: null,
  areas: [
    { id, title: "", category: "", explanation: "", rationale: "", drills: [], occurrences, sessionsAnalyzed: sessions, persistencePct: 75, focusScore: 80, latestConfidence: 80, trend: "worsening", supportingMetrics: [] },
  ],
});

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  const tsconfigPath = path.join(out, "tsconfig.json");
  writeFileSync(
    tsconfigPath,
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
      files: [path.join(root, "src/lib/intelligence/index.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", tsconfigPath], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
  const { buildSprintIntelligence } = require(path.join(out, "lib/intelligence/index.js"));

  // (1) "Grinder": long ground contact (poor) + short calibrated stride (watch),
  // strong turnover. Ground contact should win as primary; stride ranked below.
  const grinder = buildSprintIntelligence({
    metrics: metrics({ groundContactTimeMs: 135 }),
    calibration: calibration({ strideM: 2.1 }),
    prediction: prediction({ goal100: 11.0, estimate100: 11.35 }),
    phases: phases(),
    trainingFocus: trainingFocus(),
  });
  check("grinder → available", grinder.available === true);
  check("grinder → primary is ground contact", grinder.primaryLimiter?.metricId === "groundContactTime");
  check("grinder → primary severity poor, impact 100", grinder.primaryLimiter?.severity === "poor" && grinder.primaryLimiter?.impactScore === 100);
  check("grinder → stride is a secondary limiter", grinder.secondaryLimiters.some((l) => l.metricId === "strideLength"));
  check("grinder → secondary ranks are below primary impact", grinder.secondaryLimiters.every((l) => l.impactScore <= grinder.primaryLimiter.impactScore && l.rank >= 2));
  check("grinder → every limiter has reasoning, phases, drills, confidence", [grinder.primaryLimiter, ...grinder.secondaryLimiters].every((l) => l.reasoning.length > 0 && l.affectedPhases.length > 0 && l.drills.length > 0 && ["high", "medium", "low"].includes(l.confidence)));
  check("grinder → poor+corroborated ground contact reaches high confidence", grinder.primaryLimiter?.confidence === "high");
  check("grinder → ground-contact drills come from the knowledge base", grinder.primaryLimiter?.drills.some((d) => d.id === "pogo-hops"));
  const stride = grinder.secondaryLimiters.find((l) => l.metricId === "strideLength");
  check("grinder → stride confidence inherits calibration (medium)", stride?.confidence === "medium");
  check("grinder → stride reasoning notes strong turnover synthesis", stride?.reasoning.some((r) => /turnover is already/i.test(r)));
  check("grinder → affected phases marked observed with windows", grinder.primaryLimiter?.affectedPhases.some((p) => p.observed && p.window));
  check("grinder → performance context frames the goal gap", /0\.35s short/.test(grinder.performanceContext ?? ""));
  check("grinder → primary reasoning folds in the goal gap", grinder.primaryLimiter?.reasoning.some((r) => /goal/i.test(r) && /0\.35s/.test(r)));
  check("grinder → persistent-limiter note from training focus", grinder.primaryLimiter?.reasoning.some((r) => /recurs across 3 of 4/i.test(r)));

  // Day 69 precision mode: with timingReliable=false (≤60 fps), the frame-quantized
  // contact/flight limiters must NOT be evaluated — a bad ground-contact number can't
  // be flagged as the limiter as if it were reliable. Same inputs, but timing withheld.
  const precision = buildSprintIntelligence({
    metrics: metrics({ groundContactTimeMs: 135 }),
    calibration: calibration({ strideM: 2.1 }),
    prediction: prediction({ goal100: 11.0, estimate100: 11.35 }),
    phases: phases(),
    trainingFocus: trainingFocus(),
    timingReliable: false,
  });
  const precisionLimiters = [precision.primaryLimiter, ...precision.secondaryLimiters].filter(Boolean);
  check("precision → ground-contact limiter dropped at low FPS", !precisionLimiters.some((l) => l.metricId === "groundContactTime"));
  check("precision → no flight-time limiter at low FPS", !precisionLimiters.some((l) => l.metricId === "flightTime"));
  check("precision → primary is no longer ground contact", precision.primaryLimiter?.metricId !== "groundContactTime");

  // (2) All-clear: every scored metric within target → no limiter, honest headline.
  const clear = buildSprintIntelligence({
    metrics: metrics({ groundContactTimeMs: 90, strideFrequencyHz: 4.9, flightTimeMs: 120 }),
    calibration: calibration({ strideM: 2.5 }),
    prediction: prediction({ goal100: 12.0, estimate100: 11.35 }), // beats goal
    phases: phases(),
    trainingFocus: trainingFocus({ occurrences: 1, sessions: 4 }),
  });
  check("all-clear → available, no primary limiter", clear.available === true && clear.primaryLimiter === null);
  check("all-clear → no secondary limiters", clear.secondaryLimiters.length === 0);
  check("all-clear → headline says no single limiter", /no single/i.test(clear.headline));
  check("all-clear → on-track performance context", /on track/i.test(clear.performanceContext ?? ""));

  // (3) Incomplete data: cadence poor, no calibration/phases/prediction. Should
  // still assess but lower confidence and list what would help — never fabricate.
  const sparse = buildSprintIntelligence({
    metrics: metrics({ strideFrequencyHz: 3.9, groundContactTimeMs: 90, flightTimeMs: 120 }),
    calibration: null,
    prediction: prediction({ available: false }),
    phases: phases({ available: false }),
    trainingFocus: null,
  });
  check("incomplete → primary is cadence (poor)", sparse.primaryLimiter?.metricId === "stepFrequency" && sparse.primaryLimiter?.severity === "poor");
  check("incomplete → overall confidence downgraded to low", sparse.confidence === "low");
  check("incomplete → cadence phases present but unobserved", sparse.primaryLimiter?.affectedPhases.every((p) => p.observed === false));
  check("incomplete → data gaps name calibration, phases, prediction, history", ["calibration", "phase", "top velocity", "session"].every((kw) => sparse.dataGaps.some((g) => new RegExp(kw, "i").test(g.what + g.wouldImprove))));
  check("incomplete → warns phases undetected", sparse.warnings.some((w) => /phase/i.test(w)));
  check("incomplete → no fabricated performance context", sparse.performanceContext === null);

  // (4) No metrics → unavailable with an explanation, never a limiter.
  const none = buildSprintIntelligence({ metrics: null, calibration: null, prediction: null, phases: null, trainingFocus: null });
  check("no metrics → unavailable + no limiter", none.available === false && none.primaryLimiter === null);
  check("no metrics → headline asks to run analysis", /run/i.test(none.headline));
  check("no metrics → data gap names a completed analysis", none.dataGaps.some((g) => /analysis/i.test(g.what)));

  // (5) Off-camera max velocity: still-rising warning surfaces the right gap.
  const rising = buildSprintIntelligence({
    metrics: metrics({ groundContactTimeMs: 135 }),
    calibration: calibration(),
    prediction: prediction(),
    phases: phases({ rising: true }),
    trainingFocus: trainingFocus(),
  });
  check("rising → data gap about top speed off-camera", rising.dataGaps.some((g) => /top speed|off-camera/i.test(g.what + g.wouldImprove)));

  // (6) Determinism.
  const again = buildSprintIntelligence({
    metrics: metrics({ groundContactTimeMs: 135 }),
    calibration: calibration({ strideM: 2.1 }),
    prediction: prediction({ goal100: 11.0, estimate100: 11.35 }),
    phases: phases(),
    trainingFocus: trainingFocus(),
  });
  check("deterministic report", JSON.stringify(again) === JSON.stringify(grinder));

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
