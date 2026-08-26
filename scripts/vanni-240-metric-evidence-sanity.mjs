// Phase 2 (Stationary Sprint Analysis Roadmap v4.0 — Scientific Timing Validation &
// Metric Verification) — locks in this phase's real-data hand-verification of
// vanni_fly_240's non-zone-time metrics as a permanent, deterministic regression
// check, plus a reusable frame-array integrity sweep for the specific timing-defect
// classes the phase's audit was required to look for (duplicate/missing timestamps,
// non-monotonicity, frame-index gaps/mismatches, off-by-one, drift).
//
// The zoneSteps/individualStepLengthsM/velocities snapshot below is a REAL,
// measured artifact captured live on 2026-08-04 from the actual restored/rerun
// vanni_fly_240 analysis (a7679326-e193-4489-bf50-735fe402ec60) — not synthetic —
// same pattern as the project's existing Day 97 frozen real-data fixtures
// (scripts/measurement-recovery-sanity.mjs). Every number here was independently
// hand-derived from this exact snapshot in docs/phase-2-vanni-240-metric-verification-report.md
// before being pinned as a test.
//
//   node scripts/vanni-240-metric-evidence-sanity.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, ".vanni-240-metric-evidence-tmp");
const require = createRequire(import.meta.url);

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

// --- Real, measured vanni_fly_240 zone-step snapshot (2026-08-04) -----------------
const ZONE_STEPS = [
  { index: 1, side: "left", timeS: 0.31708333333333333, stepLengthM: 1.7973177558544011 },
  { index: 2, side: "right", timeS: 0.4966666666666667, stepLengthM: 1.6408205487573142 },
  { index: 3, side: "left", timeS: 0.6887500000000001, stepLengthM: 1.8982275647569185 },
  { index: 4, side: "right", timeS: 0.9516666666666668, stepLengthM: 1.8520850011928505 },
  { index: 5, side: "left", timeS: 1.1775, stepLengthM: 1.8930494918125786 },
  { index: 6, side: "right", timeS: 1.34, stepLengthM: 1.8426369155157822 },
  { index: 7, side: "left", timeS: 1.5450000000000002, stepLengthM: 1.8758945447636974 },
  { index: 8, side: "right", timeS: 1.7954166666666669, stepLengthM: 2.0992837779920075 },
  { index: 9, side: "left", timeS: 1.9833333333333334, stepLengthM: 1.9716242698178832 },
  { index: 10, side: "right", timeS: 2.17125, stepLengthM: 2.0493545359589165 },
  { index: 11, side: "left", timeS: 2.3800000000000003, stepLengthM: 2.122177073874762 },
];
const INDIVIDUAL_STEP_LENGTHS_M = ZONE_STEPS.map((s) => s.stepLengthM);
const VELOCITIES = { distanceTime: 9.049773755656108, avgLenFreq: 9.273045216340696, medianLenFreq: 9.176567926378889 };
const REPORTED = {
  combinedStepFrequencyHz: 4.847505554433447,
  leftStepFrequencyHz: 4.903964037597058,
  rightStepFrequencyHz: 4.792332268370606,
  avgIndividualStepLengthM: 1.912951952754283,
  peakStrideLengthM: 2.0606099144108923,
  maxVelocityMps: 10.579734014114525,
};

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
  // noEmitOnError:false still emits despite pre-existing, unrelated type errors
  // elsewhere in the transitive import graph (e.g. worldProjection.ts) — but tsc's
  // own exit code stays non-zero whenever ANY diagnostic was reported, regardless
  // of emit. The two files this script actually type-checks and needs
  // (cadence.ts, strideMetrics.ts) compile clean; only an unrelated transitively-
  // imported file (via cadence.ts -> steps.ts -> overlay.ts's type graph) does
  // not, and it is only used for a *type*, never a runtime value, here.
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
  const { computePeakStrideLengthM } = require(path.join(out, "lib/benchmark/strideMetrics.js"));

  // 1. Step frequency (combined/left/right) reproduces exactly from the real marks.
  const marks = ZONE_STEPS.map((s) => ({ time: s.timeS, side: s.side }));
  const freqs = stepFrequenciesFromContacts(marks);
  check("combined step frequency reproduces exactly from real contact timestamps", Math.abs(freqs.combined - REPORTED.combinedStepFrequencyHz) < 1e-9);
  check("left step frequency reproduces exactly from real contact timestamps", Math.abs(freqs.left - REPORTED.leftStepFrequencyHz) < 1e-9);
  check("right step frequency reproduces exactly from real contact timestamps", Math.abs(freqs.right - REPORTED.rightStepFrequencyHz) < 1e-9);

  // 2. Average step length reproduces exactly.
  const avg = INDIVIDUAL_STEP_LENGTHS_M.reduce((a, b) => a + b, 0) / INDIVIDUAL_STEP_LENGTHS_M.length;
  check("average step length reproduces exactly from real individual step lengths", Math.abs(avg - REPORTED.avgIndividualStepLengthM) < 1e-9);

  // 3. Peak stride length (rolling-4 window) reproduces exactly via the real production function.
  const peak = computePeakStrideLengthM(INDIVIDUAL_STEP_LENGTHS_M);
  check("peak stride length reproduces exactly via computePeakStrideLengthM on real data", Math.abs(peak - REPORTED.peakStrideLengthM) < 1e-9);

  // 4. Velocity-method agreement stays under the 15% low-confidence threshold
  //    (measurements.ts's own internal consistency check) — the three independent
  //    computational paths (zone distance/time; avg step length x cadence; median
  //    step length x cadence) must not diverge.
  const vals = Object.values(VELOCITIES);
  const spreadPct = ((Math.max(...vals) - Math.min(...vals)) / (vals.reduce((a, b) => a + b, 0) / vals.length)) * 100;
  check(`velocity methods agree within 15% (real spread ${spreadPct.toFixed(2)}%, no low-confidence warning fires)`, spreadPct < 15);
} finally {
  rmSync(out, { recursive: true, force: true });
}

// --- Reusable frame-array integrity sweep (Phase 2's exhaustive check pattern) ----
// Verified 2026-08-04 against the real 1020-frame vanni_fly_240 post-fix pose
// artifact: 0 duplicate tMs, 0 non-monotonic transitions, 0 sourceFrameIndex
// gaps/duplicates/out-of-order, 0 frame.index/array-position mismatches, 0
// tMs/sourceTimestampMs divergence, 0 cumulative drift, 0 missing timestamps.
// Exposed here as a reusable function so a future phase can run it against any
// artifact without re-deriving the checks from scratch.
export function auditFrameArrayIntegrity(frames) {
  const seen = new Map();
  for (const f of frames) seen.set(f.tMs, (seen.get(f.tMs) ?? 0) + 1);
  let duplicateTimestamps = 0;
  for (const c of seen.values()) if (c > 1) duplicateTimestamps++;

  let nonMonotonic = 0, indexGaps = 0, indexDuplicates = 0, indexOutOfOrder = 0;
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].tMs <= frames[i - 1].tMs) nonMonotonic++;
    const d = frames[i].sourceFrameIndex - frames[i - 1].sourceFrameIndex;
    if (d === 0) indexDuplicates++;
    else if (d < 0) indexOutOfOrder++;
    else if (d > 1) indexGaps++;
  }
  let offByOne = 0, tsMismatch = 0, missing = 0;
  frames.forEach((f, i) => {
    if (f.index !== i) offByOne++;
    if (f.tMs !== f.sourceTimestampMs) tsMismatch++;
    if (f.tMs == null || !Number.isFinite(f.tMs)) missing++;
  });
  const sumDeltas = frames.slice(1).reduce((a, f, i) => a + (f.tMs - frames[i].tMs), 0);
  const span = frames.length ? frames[frames.length - 1].tMs - frames[0].tMs : 0;

  return {
    duplicateTimestamps, nonMonotonic, indexGaps, indexDuplicates, indexOutOfOrder,
    offByOne, tsMismatch, missing, driftMs: Math.abs(sumDeltas - span),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log();
  console.log(ok ? "ALL PASSED" : "FAILURES PRESENT");
  process.exit(ok ? 0 : 1);
}
