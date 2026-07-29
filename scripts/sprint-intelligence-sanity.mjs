// Unit tests for the Sprint Intelligence explanation engine (deterministic, no fabrication).
//   node scripts/sprint-intelligence-sanity.mjs
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".sprint-intelligence-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// Compile the Sprint Intelligence domain + the Limiting Factors deps it imports, with a
// scoped tsconfig so the `@/` alias resolves without dragging in unrelated strict files.
const abs = (p) => path.join(root, p);
const tsconfig = {
  compilerOptions: {
    module: "commonjs",
    target: "es2022",
    moduleResolution: "node",
    baseUrl: root,
    paths: { "@/*": [path.join(root, "src") + "/*"] },
    skipLibCheck: true,
    esModuleInterop: true,
    outDir: out,
    rootDir: root,
    noEmitOnError: true,
  },
  // Absolute paths (relative includes resolve against the tsconfig's own dir). The LF barrel
  // (index.ts) is intentionally excluded — it pulls aliased transitive deps we don't need.
  include: [
    abs("src/lib/sprintIntelligence/build.ts"),
    abs("src/lib/sprintIntelligence/types.ts"),
    abs("src/lib/sprintIntelligence/templates.ts"),
    abs("src/lib/sprintIntelligence/version.ts"),
    abs("src/lib/limitingFactors/types.ts"),
    abs("src/lib/limitingFactors/scoring.ts"),
    abs("src/lib/limitingFactors/thresholds.ts"),
    abs("src/lib/limitingFactors/recommendations.ts"),
    abs("src/lib/limitingFactors/engine.ts"),
  ],
};
writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify(tsconfig));
execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });

// tsc emits `require("@/...")` verbatim (it does not rewrite path aliases). Map the alias to
// the compiled output at require-time so the emitted modules resolve.
const Module = require("node:module");
const compiledSrc = path.join(out, "src");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  const mapped = request.startsWith("@/") ? path.join(compiledSrc, request.slice(2)) : request;
  return origResolve.call(this, mapped, ...rest);
};

const { buildSprintIntelligence } = require(path.join(out, "src/lib/sprintIntelligence/build.js"));
const { buildLimitingFactors } = require(path.join(out, "src/lib/limitingFactors/engine.js"));

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

// --- Fixtures ---------------------------------------------------------------
const athleteFull = { heightCm: 180, legLengthCm: 92, trochanterHeightM: 0.95, weightKg: 75, event: "100m" };
const athleteSparse = { heightCm: null, legLengthCm: null, trochanterHeightM: null, weightKg: null, event: null };

function lfInput(over = {}) {
  const { metrics: metricsOver, ...rest } = over;
  return {
    sessionId: "s1",
    sessionDate: "2026-07-01",
    zoneDistanceM: 30,
    analysisType: "fly",
    calibrationConfirmed: true,
    spatialAvailable: true,
    measurementConfidence: "high",
    athlete: { heightCm: 180, legLengthCm: 92, trochanterHeightM: 0.95, weightKg: 75 },
    ...rest,
    metrics: {
      avgStepLengthM: 2.1,
      peakStepLengthM: 2.2,
      stepFrequencyHz: 4.85,
      avgVelocityMps: 10.1,
      peakVelocityMps: 10.7,
      validStepCount: 9,
      leftStepLengthM: 2.15,
      rightStepLengthM: 2.05,
      leftStepSampleCount: 5,
      rightStepSampleCount: 4,
      leftStepFrequencyHz: 4.85,
      rightStepFrequencyHz: 4.85,
      ...(metricsOver ?? {}),
    },
  };
}

function siInput(lfIn, over = {}) {
  const lf = buildLimitingFactors(lfIn);
  const m = lfIn.metrics;
  const symmetry = {
    stepLengthDiffPct:
      m.leftStepLengthM != null && m.rightStepLengthM != null
        ? (Math.abs(m.leftStepLengthM - m.rightStepLengthM) / ((m.leftStepLengthM + m.rightStepLengthM) / 2)) * 100
        : null,
    stepFrequencyDiffPct:
      m.leftStepFrequencyHz != null && m.rightStepFrequencyHz != null
        ? (Math.abs(m.leftStepFrequencyHz - m.rightStepFrequencyHz) / ((m.leftStepFrequencyHz + m.rightStepFrequencyHz) / 2)) * 100
        : null,
    minSideSamples: Math.min(m.leftStepSampleCount, m.rightStepSampleCount),
  };
  return {
    analysisId: "a1",
    sessionId: "s1",
    generatedAt: "2026-07-27T00:00:00.000Z",
    limitingFactors: lf,
    context: {
      analysisType: lfIn.analysisType,
      calibrationConfirmed: lfIn.calibrationConfirmed,
      spatialAvailable: lfIn.spatialAvailable,
      measurementConfidence: lfIn.measurementConfidence,
      zoneDistanceM: lfIn.zoneDistanceM,
      validStepCount: m.validStepCount,
      metrics: {
        avgStepLengthM: m.avgStepLengthM,
        peakStepLengthM: m.peakStepLengthM,
        stepFrequencyHz: m.stepFrequencyHz,
        avgVelocityMps: m.avgVelocityMps,
        peakVelocityMps: m.peakVelocityMps,
      },
      athlete: athleteFull,
      historicalBaselineAvailable: false,
      coachTargetAvailable: false,
      symmetry,
      ...(over.context ?? {}),
    },
    ...over,
  };
}

// --- Primary conclusion selection ------------------------------------------
// 4.9% step-length asymmetry (2.15 vs 2.05) → a detected asymmetry limiter drives the primary.
const asymReport = buildSprintIntelligence(siInput(lfInput()));
check("asymmetry → status ok with a primary conclusion", asymReport.status === "ok" && asymReport.primaryConclusion != null);
check("primary is classified as asymmetry", asymReport.primaryConclusion.classification === "asymmetry");
check("primary traces to a limiterId", typeof asymReport.primaryConclusion.limiterId === "string");
check("headline is generated from real data (not hardcoded)", asymReport.summary.headline.includes(asymReport.primaryConclusion.conciseSummary));

// Balanced sides → no asymmetry limiter → no reliable dominant conclusion, but strengths shown.
const balanced = lfInput({ metrics: { leftStepLengthM: 2.1, rightStepLengthM: 2.1, leftStepFrequencyHz: 4.85, rightStepFrequencyHz: 4.85 } });
const balancedReport = buildSprintIntelligence(siInput(balanced));
check("balanced → no_reliable_conclusion", balancedReport.status === "no_reliable_conclusion" && balancedReport.primaryConclusion === null);
check("balanced → honest no-dominant-limiter headline", /enough evidence/i.test(balancedReport.summary.headline));
check("balanced → surfaces a performance_strength", balancedReport.strengths.some((s) => s.classification === "performance_strength"));
check("balanced strength uses within-athlete symmetry basis", balancedReport.strengths.some((s) => s.comparedWith.some((c) => c.basis === "within_athlete_symmetry")));

// --- Evidence chain ---------------------------------------------------------
const pc = asymReport.primaryConclusion;
check("evidenceFor is ordered strongest-first", pc.evidenceFor.every((e, i, a) => i === 0 || a[i - 1].weight >= e.weight));
check("comparison basis is displayed", pc.comparedWith.length > 0 && pc.comparedWith[0].validated === false);
check("counter-evidence (evidenceAgainst) retained", pc.evidenceAgainst.length > 0);
check("no fabricated numeric target range (asymmetry is a within-athlete band)", pc.comparedWith[0].basis === "within_athlete_symmetry");
check("measured values present and non-empty", pc.measured.length >= 2);

// --- Velocity relationship honesty -----------------------------------------
const vel = asymReport.supportingConclusions.find((c) => c.id === "conclusion-velocity-relationship");
check("velocity relationship exists", vel != null);
check("velocity dominance is insufficient_evidence (no validated target)", vel.classification === "insufficient_evidence");
check("velocity comparison basis is 'unavailable'", vel.comparedWith[0].basis === "unavailable");
check("velocity does NOT claim length/frequency dominance", !/dominant|dominance/i.test(vel.conciseSummary));

// --- Peak vs average --------------------------------------------------------
const pk = asymReport.supportingConclusions.find((c) => c.id === "conclusion-peak-vs-average");
check("peak-vs-average conclusion exists", pk != null);
// It must DISCLAIM fatigue as a limitation and stay contextual — never assert it as a cause.
check("peak-vs-average discloses (not concludes) fatigue", pk.classification === "contextual_finding" && pk.limitations.some((l) => /fatigue/i.test(l)));
// Every sentence that mentions fatigue must also carry a negation — i.e. fatigue only ever
// appears as a disclaimer, never as an asserted cause.
const pkSentences = JSON.stringify(pk).split(/(?<=[.;])\s+|","|":"|\[|\]|\\"/);
const fatigueSentences = pkSentences.filter((s) => /fatigue/i.test(s));
check(
  "peak-vs-average only ever disclaims fatigue (never asserts it)",
  fatigueSentences.length > 0 && fatigueSentences.every((s) => /\b(not|cannot|n't)\b/i.test(s)),
);

// --- Confidence reuse -------------------------------------------------------
check("confidence reuses the limiter model (measurement/reasoning/overall present)", pc.confidence.overall != null && pc.confidence.measurement != null);
check("confidence explains what raises it", pc.confidence.raises.length > 0);
check("confidence explains what reduces it", pc.confidence.reduces.length > 0);
check("no baseline is surfaced as a confidence reducer", pc.confidence.reduces.some((r) => /baseline/i.test(r)));

// --- Missing inputs ---------------------------------------------------------
const sparseReport = buildSprintIntelligence(siInput(lfInput(), { context: { athlete: athleteSparse, historicalBaselineAvailable: false, coachTargetAvailable: false, symmetry: { stepLengthDiffPct: 4.9, stepFrequencyDiffPct: 0, minSideSamples: 4 }, analysisType: "fly", calibrationConfirmed: true, spatialAvailable: true, measurementConfidence: "high", zoneDistanceM: 30, validStepCount: 9, metrics: { avgStepLengthM: 2.1, peakStepLengthM: 2.2, stepFrequencyHz: 4.85, avgVelocityMps: 10.1, peakVelocityMps: 10.7 } } }));
check("missing leg length surfaced", sparseReport.missingInputs.some((mi) => mi.id === "leg-length"));
check("missing baseline surfaced", sparseReport.missingInputs.some((mi) => mi.id === "baseline"));
check("missing event surfaced", sparseReport.missingInputs.some((mi) => mi.id === "event"));
check("physical testing suggested when limiters exist", sparseReport.missingInputs.some((mi) => mi.id === "physical-testing"));

// --- Change conditions ------------------------------------------------------
check("change conditions include target + more sessions", asymReport.changeConditions.some((c) => /coach-defined target/i.test(c.text)) && asymReport.changeConditions.some((c) => /baseline/i.test(c.text)));

// --- Associations are cautious ---------------------------------------------
check("technical associations never marked directly measured", pc.technicalAssociations.every((a) => a.directlyMeasured === false));
check("physical associations carry a disclaimer", pc.physicalAssociations.every((a) => typeof a.disclaimer === "string" && a.disclaimer.length > 0));
check("muscle groups appear only as associations", pc.physicalAssociations.every((a) => a.directlyMeasured === false));

// --- Recommendations --------------------------------------------------------
check("recommendations reference the limiter + include a does-not-prove line", pc.recommendations.every((r) => r.limiterId === pc.limiterId && r.doesNotProve.length > 0));
check("no full workout plan (≤3 recs per conclusion)", pc.recommendations.length <= 3);

// --- Scientific language guardrail -----------------------------------------
const banned = [
  /your hamstrings are weak/i, /weak hamstrings/i, /inactive glutes/i, /glutes are inactive/i,
  /tight hip flexors/i, /you have an imbalance/i, /you are overstriding/i, /poor ankle stiffness/i,
];
const fullText = JSON.stringify(asymReport) + JSON.stringify(balancedReport) + JSON.stringify(sparseReport);
check("no unsupported diagnosis phrases anywhere in output", !banned.some((re) => re.test(fullText)));

// --- Blocked states ---------------------------------------------------------
const calMissing = buildSprintIntelligence(siInput(lfInput({ calibrationConfirmed: false })));
check("calibration missing → status calibration_missing, no primary", calMissing.status === "calibration_missing" && calMissing.primaryConclusion === null);
const insufficient = buildSprintIntelligence(siInput(lfInput({ metrics: { validStepCount: 2 } })));
check("too few steps → status insufficient_data", insufficient.status === "insufficient_data");

// --- Determinism ------------------------------------------------------------
const a = buildSprintIntelligence(siInput(lfInput()));
const b = buildSprintIntelligence(siInput(lfInput()));
check("identical input → byte-identical report", JSON.stringify(a) === JSON.stringify(b));

// --- Transport safety -------------------------------------------------------
check("report is JSON round-trippable (transport-safe)", JSON.stringify(JSON.parse(JSON.stringify(asymReport))) === JSON.stringify(asymReport));
check("methodology carries the model version", asymReport.methodology.version === asymReport.version && /sprint-intelligence-\d/.test(asymReport.version));
check("unavailable models are disclosed in methodology", asymReport.methodology.unavailableModels.length > 0);

console.log(ok ? "\nAll Sprint Intelligence checks passed." : "\nFAILURES present.");
rmSync(out, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
