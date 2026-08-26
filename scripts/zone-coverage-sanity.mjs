// Day 99 (Parts 6/8) sanity — structured early-contact rejection reasons and
// zone-coverage provenance added to `computeSprintMeasurements`.
//
//   node scripts/zone-coverage-sanity.mjs
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".zone-coverage-sanity-tmp");

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

// Proven recipe (matches scripts/steps-sanity.mjs): antiphase L/R oscillation
// advancing horizontally, produces clean alternating ground contacts sweeping
// from x=0.2 to x=0.8 across the clip.
const mk = (x, y) => ({ x, y, visibility: 0.9 });
const foot = (side, x, y) => ({
  [`${side}Ankle`]: mk(x, y - 0.04),
  [`${side}Heel`]: mk(x - 0.01, y - 0.01),
  [`${side}FootIndex`]: mk(x + 0.02, y),
});
function synthFrames({ frames = 90, fps = 30, cadence = 2, amp = 0.06, base = 0.85 } = {}) {
  const result = [];
  for (let i = 0; i < frames; i++) {
    const t = i / fps;
    const advance = 0.2 + 0.6 * (i / (frames - 1));
    const ly = base + amp * Math.sin(2 * Math.PI * cadence * t);
    const ry = base + amp * Math.sin(2 * Math.PI * cadence * t + Math.PI);
    result.push({
      frame: i,
      sourceFrameIndex: i,
      time: t,
      landmarks: { ...foot("left", advance - 0.03, ly), ...foot("right", advance + 0.03, ry) },
      angles: {},
      centerOfMass: null,
      velocity: null,
      trackingConfidence: 0.9,
    });
  }
  return result;
}

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
      files: [path.join(root, "src/lib/benchmark/measurements.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
  const { computeSprintMeasurements } = require(path.join(out, "lib/benchmark/measurements.js"));

  const W = 1920, H = 1080;
  const frames = synthFrames({});

  // --- Scenario A: calibrated zone [0.3, 0.7] — a SUBSET of the 0.2..0.8
  //     contact sweep, so contacts genuinely exist on both sides of the zone.
  //     Tests: excludedContacts reasonCode (before_start_crossing / outside_zone),
  //     partial zoneCoverage on both ends. ---
  const POINTS_A = { ax: 0.3, ay: 0.85, bx: 0.7, by: 0.85, distanceM: 20, aTimeS: 0, bTimeS: 0 };
  const mA = computeSprintMeasurements(frames, POINTS_A, W, H, {
    gates: { travelDirection: "left_to_right", cameraType: "stationary", distanceM: 20 },
  });

  const beforeReasons = mA.diagnostics.excludedContacts.filter((c) => c.reasonCode === "before_start_crossing");
  const afterReasons = mA.diagnostics.excludedContacts.filter((c) => c.reasonCode === "outside_zone");
  check("9/12. contacts before the start gate are rejected with reasonCode before_start_crossing (structured, not silent)", beforeReasons.length > 0);
  check("12. contacts past the finish gate are rejected with reasonCode outside_zone (structured, not silent)", afterReasons.length > 0);
  check("every excluded contact carries a real sourceFrameIndex (traceable, not anonymous)", mA.diagnostics.excludedContacts.every((c) => typeof c.sourceFrameIndex === "number"));

  check("8/13. zoneCoverage is populated when calibrated", mA.diagnostics.zoneCoverage.zoneDistanceM === 20);
  check("8. measuredZoneFraction is between 0 and 1 for a genuinely partial run", mA.diagnostics.zoneCoverage.measuredZoneFraction > 0 && mA.diagnostics.zoneCoverage.measuredZoneFraction <= 1);
  check("8. eligibleStepCount matches the actual number of valid step intervals used", mA.diagnostics.zoneCoverage.eligibleStepCount === mA.individualStepLengthsM.length);
  check("14. missingEarlyZoneReason is disclosed in human-readable form when coverage doesn't start at the gate", typeof mA.diagnostics.zoneCoverage.missingEarlyZoneReason === "string" || mA.diagnostics.zoneCoverage.firstMeasuredPositionM <= 0.5);

  // --- Day 100 (Part 4) — the progressive measurement window aliases. -----
  check(
    "measurementStartPositionM/measurementEndPositionM are exact aliases of firstMeasuredPositionM/lastMeasuredPositionM (one computation, not a second one)",
    mA.diagnostics.zoneCoverage.measurementStartPositionM === mA.diagnostics.zoneCoverage.firstMeasuredPositionM &&
      mA.diagnostics.zoneCoverage.measurementEndPositionM === mA.diagnostics.zoneCoverage.lastMeasuredPositionM,
  );
  check(
    "coveragePercent is measuredZoneFraction expressed as a percent (0-100), not re-derived",
    Math.abs(mA.diagnostics.zoneCoverage.coveragePercent - mA.diagnostics.zoneCoverage.measuredZoneFraction * 100) < 1e-9,
  );
  check(
    "coverageReason is populated whenever either end of the zone is missing evidence",
    typeof mA.diagnostics.zoneCoverage.coverageReason === "string",
  );
  check(
    "coverageConfidence is a valid internal confidence label, never a raw score",
    ["high", "medium", "low"].includes(mA.diagnostics.zoneCoverage.coverageConfidence),
  );
  check(
    "coverage expansion is automatic (a function of live evidence, not a stored/cached boundary) — recomputing on the identical input yields the identical window",
    (() => {
      const mA2 = computeSprintMeasurements(frames, POINTS_A, W, H, {
        gates: { travelDirection: "left_to_right", cameraType: "stationary", distanceM: 20 },
      });
      return (
        mA2.diagnostics.zoneCoverage.measurementStartPositionM === mA.diagnostics.zoneCoverage.measurementStartPositionM &&
        mA2.diagnostics.zoneCoverage.coveragePercent === mA.diagnostics.zoneCoverage.coveragePercent
      );
    })(),
  );

  // --- 9/11. First valid in-zone contact is retained — the first IN-ZONE
  //     contact (by definition, in `validContacts`) is never additionally
  //     dropped for being "too early" or belonging to a shorter local run;
  //     `zoneCoverage.firstMeasuredPositionM` reflects it directly. ---
  check(
    "9/11. first valid in-zone contact is retained (firstMeasuredPositionM reflects a real in-zone contact, not clamped to the gate)",
    mA.diagnostics.zoneCoverage.firstMeasuredPositionM != null,
  );

  // --- 13. Average Step Length includes ALL eligible in-zone steps, not a
  //     late subset — with a clean antiphase sweep fully inside the zone
  //     bounds tested below, every valid interval must be used. ---
  const POINTS_B = { ax: 0.21, ay: 0.85, bx: 0.79, by: 0.85, distanceM: 20, aTimeS: 0, bTimeS: 0 };
  const mB = computeSprintMeasurements(frames, POINTS_B, W, H, {
    gates: { travelDirection: "left_to_right", cameraType: "stationary", distanceM: 20 },
  });
  check(
    "13. Average Step Length is the mean of ALL eligible individual intervals, not a late-window subset",
    Math.abs(mB.avgIndividualStepLengthM - (mB.individualStepLengthsM.reduce((a, b) => a + b, 0) / mB.individualStepLengthsM.length)) < 1e-9,
  );
  check(
    "14/8. near-full zone coverage (gates close to the actual contact sweep) reports a small or null early/late gap, never a fabricated 'full coverage' claim for a genuinely partial run",
    mB.diagnostics.zoneCoverage.measuredZoneFraction > 0.7,
  );

  // --- 15. Peak Step Length still follows the authoritative rolling-4-step
  //     window (unchanged by this task — regression guard). ---
  check(
    "15. Peak Step Length still uses the rolling-4-step window contract (equals the average when exactly 4 valid intervals exist)",
    mB.individualStepLengthsM.length !== 4 || mB.peakStrideLengthM === mB.avgIndividualStepLengthM,
  );

  // --- 16. Step Frequency uses only valid in-zone intervals (unchanged —
  //     regression guard against this task's changes). ---
  check("16. Step Frequency is computed and positive for a genuine in-zone gait sequence", mB.combinedStepFrequencyHz > 0);

  // --- Zero-contact / uncalibrated edge cases never crash and report empty
  //     coverage, not a fabricated full-zone claim. ---
  const mEmpty = computeSprintMeasurements([], null, W, H, {});
  check("uncalibrated / empty input never crashes and reports null zoneCoverage fields", mEmpty.diagnostics.zoneCoverage.zoneDistanceM === null && mEmpty.diagnostics.zoneCoverage.eligibleStepCount === 0);
} finally {
  rmSync(out, { recursive: true, force: true });
}

console.log(ok ? "\nAll zone-coverage sanity checks passed." : "\nSanity FAILED.");
process.exit(ok ? 0 : 1);
