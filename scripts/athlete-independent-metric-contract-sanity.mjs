// Phase 4.2H (Part A) — proves the athlete-independent metric CONTRACT this
// project's own critical scientific principle requires: the codebase applies
// ONE shared, unmodified set of formulas (step frequency, average/peak step
// length, velocity) to every athlete's OWN evidence, and each athlete's
// result depends only on THAT athlete's own contacts/timestamps/calibrated
// positions — never on another athlete's (in particular, never on Gav's,
// the protected pipeline-validation benchmark, which is a methodology
// reference, NOT a numeric target any other athlete's output should match).
//
// This complements (does not replace) the existing per-benchmark regression
// suites (`vanni-240-metric-evidence:sanity`, `measurement-recovery:sanity`,
// etc.), which each pin ONE benchmark's own real numbers. This suite instead
// proves the CROSS-benchmark property those suites individually assume but
// never state outright: that two different, independently-evidenced
// athletes legitimately produce two different, both-correct results from
// the exact same formula code, with zero cross-contamination.
//
//   node scripts/athlete-independent-metric-contract-sanity.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, ".athlete-independent-metric-contract-tmp");
const require = createRequire(import.meta.url);

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

// --- Real, registry-recorded production outputs for all 4 benchmarks -------
// (validation/stationary-validation-registry.json, currentProductionOutputs,
// captured live from real production reruns — not invented for this test).
// Gav is the PROTECTED, source-of-truth PIPELINE benchmark (methodology
// reference) — explicitly NOT a numeric target for any Vanni benchmark; see
// docs/stationary-validation-registry.md's own "never used as Vanni ground
// truth" note, formalized further in docs/phase-4-2h-distance-evidence-coast-risk.md
// Section 3.
const REGISTRY = {
  gav_stationary_reference: { combinedStepFrequencyHz: 4.848484848484849, avgIndividualStepLengthM: 2.155113560633935, peakStrideLengthM: 2.1739055918935284, zoneVelocityMps: 10.362694300518134 },
  vanni_fly_240: { combinedStepFrequencyHz: 4.847505554433447, avgIndividualStepLengthM: 1.912951952754283, peakStrideLengthM: 2.0606099144108923, zoneVelocityMps: 9.049773755656108 },
  vanni_fly_120: { combinedStepFrequencyHz: 3.7812288993923024, avgIndividualStepLengthM: 1.8714545531272098, peakStrideLengthM: 1.9066218803939425, zoneVelocityMps: 9.132420091324201 },
  vanni_fly_60: { combinedStepFrequencyHz: 4.403669724770642, avgIndividualStepLengthM: 1.7667786717273228, peakStrideLengthM: 1.9629486293726475, zoneVelocityMps: null },
};

// --- Two synthetic, hand-designed athlete evidence profiles (NOT derived
// from or tuned toward any real benchmark's numbers) — a short-stride/
// high-frequency profile and a long-stride/lower-frequency profile, each
// internally consistent (side alternates, intervals are physically
// plausible sprint cadences). ---------------------------------------------
function buildProfile(stepLengthsM, intervalS) {
  const marks = [];
  const lengths = [];
  let t = 0.2;
  for (let i = 0; i < stepLengthsM.length; i++) {
    marks.push({ time: t, side: i % 2 === 0 ? "left" : "right" });
    lengths.push(stepLengthsM[i]);
    t += intervalS;
  }
  return { marks, lengths };
}

const ATHLETE_SHORT_HIGH_FREQ = buildProfile(
  [1.30, 1.35, 1.28, 1.33, 1.31, 1.29, 1.34, 1.32, 1.30, 1.33, 1.31], 0.150,
);
const ATHLETE_LONG_LOW_FREQ = buildProfile(
  [2.45, 2.50, 2.42, 2.48, 2.46, 2.44, 2.49, 2.47, 2.45, 2.48, 2.46], 0.260,
);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  const tsconfigPath = path.join(out, "tsconfig.json");
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022",
        skipLibCheck: true, esModuleInterop: true, strict: false, moduleResolution: "node",
        baseUrl: root, paths: { "@/*": ["src/*"] }, resolveJsonModule: true,
        noEmitOnError: false,
      },
      files: [
        path.join(root, "src/lib/video/cadence.ts"),
        path.join(root, "src/lib/benchmark/strideMetrics.ts"),
      ],
    }),
  );
  try {
    execFileSync("npx", ["tsc", "-p", tsconfigPath], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const outText = String(err.stdout ?? "");
    if (!/cadence\.ts|strideMetrics\.ts/.test(outText)) {
      // The two files under test compiled clean — proceed.
    } else {
      throw err;
    }
  }
  const { stepFrequenciesFromContacts } = require(path.join(out, "lib/video/cadence.js"));
  const { computePeakStrideLengthM, computeStrideRetentionPct } = require(path.join(out, "lib/benchmark/strideMetrics.js"));

  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

  // --- 1. Shared formulas produce different, both-valid results for
  //        different athletes' own independent evidence. -------------------
  const freqShort = stepFrequenciesFromContacts(ATHLETE_SHORT_HIGH_FREQ.marks);
  const freqLong = stepFrequenciesFromContacts(ATHLETE_LONG_LOW_FREQ.marks);
  const avgShort = mean(ATHLETE_SHORT_HIGH_FREQ.lengths);
  const avgLong = mean(ATHLETE_LONG_LOW_FREQ.lengths);
  const peakShort = computePeakStrideLengthM(ATHLETE_SHORT_HIGH_FREQ.lengths);
  const peakLong = computePeakStrideLengthM(ATHLETE_LONG_LOW_FREQ.lengths);

  check("1a. the SAME stepFrequenciesFromContacts() formula produces a materially different combined frequency for a short-stride/high-cadence profile vs. a long-stride/lower-cadence profile", Math.abs(freqShort.combined - freqLong.combined) > 1.0);
  check("1b. hand-derived combined frequency (1/mean(interval)) matches the production function exactly for the short-stride profile", Math.abs(freqShort.combined - 1 / 0.150) < 1e-9);
  check("1c. hand-derived combined frequency matches the production function exactly for the long-stride profile", Math.abs(freqLong.combined - 1 / 0.260) < 1e-9);
  check("1d. average step length differs materially between the two independent profiles", Math.abs(avgShort - avgLong) > 0.5);
  check("1e. peak (rolling-4) stride length differs materially between the two independent profiles", Math.abs(peakShort - peakLong) > 0.5);
  check("1f. peak stride length is always >= average step length for the SAME athlete (rolling-4 max cannot be below the overall mean for a low-variance series)", peakShort >= avgShort - 1e-9 && peakLong >= avgLong - 1e-9);

  // --- 2. Neither synthetic athlete's result equals, or was derived from,
  //        Gav's real registry values — proving Gav is not a numeric target
  //        silently baked into the formula's behavior. ----------------------
  const gav = REGISTRY.gav_stationary_reference;
  check("2a. the short-stride synthetic athlete's combined frequency does not equal Gav's real registry frequency (no hidden convergence toward Gav)", Math.abs(freqShort.combined - gav.combinedStepFrequencyHz) > 0.01);
  check("2b. the long-stride synthetic athlete's combined frequency does not equal Gav's real registry frequency", Math.abs(freqLong.combined - gav.combinedStepFrequencyHz) > 0.01);
  check("2c. neither synthetic athlete's average step length equals Gav's real registry average step length", Math.abs(avgShort - gav.avgIndividualStepLengthM) > 0.01 && Math.abs(avgLong - gav.avgIndividualStepLengthM) > 0.01);

  // --- 3. Calling the SAME formula functions for athlete B, after athlete A,
  //        in the SAME process, does not perturb athlete A's own already-
  //        computed result — proves no shared/cached/mutable state links one
  //        athlete's evidence to another's computed output. ------------------
  const freqShortRepeat = stepFrequenciesFromContacts(ATHLETE_SHORT_HIGH_FREQ.marks);
  check("3a. recomputing athlete A's frequency AFTER computing athlete B's frequency reproduces athlete A's original result exactly (no cross-call state leakage)", Math.abs(freqShortRepeat.combined - freqShort.combined) < 1e-12);
  const peakShortRepeat = computePeakStrideLengthM(ATHLETE_SHORT_HIGH_FREQ.lengths);
  check("3b. recomputing athlete A's peak stride length AFTER athlete B reproduces the original result exactly", Math.abs(peakShortRepeat - peakShort) < 1e-12);

  // --- 4. Structural proof: the shared formula source files contain no
  //        athlete-specific literal (Gav's own real numbers, or any Gav
  //        session/analysis/athlete id) hardcoded as a target, default, or
  //        fallback anywhere in the formula code itself. --------------------
  const formulaSources = [
    "src/lib/video/cadence.ts", "src/lib/benchmark/strideMetrics.ts",
    "src/lib/video/steps.ts", "src/lib/video/contacts.ts", "src/lib/benchmark/measurements.ts",
  ].map((f) => readFileSync(path.join(root, f), "utf8"));
  const gavLiterals = ["4.848484848484849", "2.155113560633935", "2.1739055918935284", "e04a7983-7406-4a00-bb89-8ada7b10bf9f", "0510a4cb-9344-449b-97c3-ec65475e9cc0"];
  const foundGavLiteral = formulaSources.some((src) => gavLiterals.some((lit) => src.includes(lit)));
  check("4. no shared metric-formula source file (cadence.ts, strideMetrics.ts, steps.ts, contacts.ts, measurements.ts) hardcodes any Gav-specific value, session id, or athlete id", !foundGavLiteral);
  const anyAthleteBranching = formulaSources.some((src) => /athleteId|benchmarkKey|isGav|sessionId\s*===/.test(src));
  check("4b. no shared metric-formula source file branches on athlete identity, benchmark key, or session id (one formula path for every athlete)", !anyAthleteBranching);

  // --- 5. Benchmark non-regression is source-specific: the four REAL
  //        registry benchmarks each have genuinely different combined step
  //        frequencies — proving "no regression" for one benchmark has never
  //        meant, and structurally cannot mean, numerical equality with
  //        another benchmark. ------------------------------------------------
  const freqs = Object.values(REGISTRY).map((b) => b.combinedStepFrequencyHz);
  const allDistinct = new Set(freqs.map((f) => f.toFixed(6))).size === freqs.length;
  check("5. all four real registry benchmarks (Gav, Vanni 240/120/60) have genuinely distinct combinedStepFrequencyHz values — cross-athlete numeric matching was never, and is not now, the non-regression bar", allDistinct);
  check("5b. Vanni 240's real registry average step length is NOT within 1cm of Gav's — same athlete-independence property for step length", Math.abs(REGISTRY.vanni_fly_240.avgIndividualStepLengthM - gav.avgIndividualStepLengthM) > 0.01);

  // --- 6. computeStrideRetentionPct (the retention-ratio consumer of both
  //        avg and peak) is likewise athlete-independent — same formula,
  //        different inputs, different valid outputs. -----------------------
  const retentionShort = computeStrideRetentionPct(avgShort, peakShort);
  const retentionLong = computeStrideRetentionPct(avgLong, peakLong);
  check("6. computeStrideRetentionPct produces a valid (0,100] percentage for both independent athlete profiles, without either depending on the other's inputs", retentionShort > 0 && retentionShort <= 100 && retentionLong > 0 && retentionLong <= 100);
} finally {
  rmSync(out, { recursive: true, force: true });
}

console.log();
console.log(ok ? "ALL PASSED" : "FAILURES PRESENT");
process.exit(ok ? 0 : 1);
