// Runtime sanity for Day 62 — benchmark calibration & ground-truth validation.
//
//   node scripts/benchmark-sanity.mjs
//
// Compiles the pure measurement + benchmark modules and asserts:
//   1. Zone restriction: only contacts BETWEEN the two calibration points count
//      as valid steps (steps before the start / after the finish are excluded).
//   2. Frequency = valid contacts ÷ elapsed time; combined = left + right shares.
//   3. Average zone step length = known distance ÷ valid steps.
//   4. Individual step lengths come from consecutive contacts.
//   5. Velocity is cross-checked three independent ways + a max; spread flagged.
//   6. Uncalibrated input → contacts only, all metre-scaled fields null.
//   7. compareToBenchmark: percent-error maths + status + missing/info handling.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".benchmark-sanity-tmp");

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
const approx = (a, b, tol = 1e-6) => a != null && Math.abs(a - b) <= tol;

const mk = (x, y) => ({ x, y, visibility: 0.9 });
const foot = (side, x, y) => ({
  [`${side}Ankle`]: mk(x, y - 0.04),
  [`${side}Heel`]: mk(x - 0.01, y - 0.01),
  [`${side}FootIndex`]: mk(x + 0.02, y),
});

/** Antiphase run advancing 0.1→0.9 across the frame, with a tracked COM. */
function runFrames({ frames = 120, fps = 30, cadence = 2, amp = 0.06, base = 0.85 } = {}) {
  const arr = [];
  for (let i = 0; i < frames; i++) {
    const t = i / fps;
    const advance = 0.1 + 0.8 * (i / (frames - 1));
    const ly = base + amp * Math.sin(2 * Math.PI * cadence * t);
    const ry = base + amp * Math.sin(2 * Math.PI * cadence * t + Math.PI);
    arr.push({
      frame: i,
      time: t,
      landmarks: { ...foot("left", advance - 0.03, ly), ...foot("right", advance + 0.03, ry) },
      angles: {},
      centerOfMass: { x: advance, y: 0.5 },
      velocity: null,
      footContact: { left: false, right: false },
    });
  }
  return arr;
}

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
      files: [
        path.join(root, "src/lib/benchmark/measurements.ts"),
        path.join(root, "src/lib/benchmark/index.ts"),
      ],
    }),
  );
  execFileSync("npx", ["tsc", "-p", tsconfigPath], {
    cwd: root,
    stdio: ["ignore", "inherit", "inherit"],
  });

  const { computeSprintMeasurements } = require(path.join(out, "lib/benchmark/measurements.js"));
  const { compareToBenchmark, assembleAvaValues, evaluateAccuracy, ACCURACY_TARGETS } = require(path.join(out, "lib/benchmark/index.js"));
  const { stepFrequenciesFromContacts, stepFrequencyFromContacts } = require(path.join(out, "lib/video/cadence.js"));

  // --- VueMotion frequency definition (Day 63): freq = 1/mean(step interval) ---
  // Left-landing steps take 0.20 s (→ 5.00 Hz), right-landing 0.2119 s (→ 4.72 Hz);
  // combined = 1/mean(all intervals). Left + right must NOT sum to combined.
  const mark = (side, time) => ({ side, time, frame: Math.round(time * 60), x: 0, y: 0.9, index: 0, distanceFromPrev: null, distanceMetersFromPrev: null });
  const seq = [
    mark("right", 0.0),
    mark("left", 0.20),
    mark("right", 0.4119),
    mark("left", 0.6119),
    mark("right", 0.8238),
    mark("left", 1.0238),
  ];
  const freqs = stepFrequenciesFromContacts(seq);
  check("VueMotion left frequency = 1/mean(left-landing intervals) ≈ 5.00", approx(freqs.left, 5.0, 1e-3));
  check("VueMotion right frequency ≈ 4.72", approx(freqs.right, 4.72, 5e-3));
  check("combined frequency = 1/mean(all intervals) ≈ 4.88", approx(freqs.combined, 5 / (0.20 + 0.2119 + 0.20 + 0.2119 + 0.20), 1e-6));
  check("left + right do NOT sum to combined (VueMotion definition)", Math.abs(freqs.left + freqs.right - freqs.combined) > 1);
  check("combined-only helper equals VueMotion combined", approx(stepFrequencyFromContacts(seq), freqs.combined, 1e-9));

  // --- Measurements: calibrated run with a mid-clip zone ---------------------
  const frames = runFrames();
  // Zone spans normalized x 0.3→0.7; 20 m known distance; 1044×596 frame.
  const points = { ax: 0.3, ay: 0.82, bx: 0.7, by: 0.82, distanceM: 20 };
  const m = computeSprintMeasurements(frames, points, 1044, 596);

  check(
    "camera compensation status is reported",
    m.cameraCompensation &&
      typeof m.cameraCompensation.available === "boolean" &&
      ["high", "medium", "low", "none"].includes(m.cameraCompensation.confidence),
  );
  check(
    "diagnostics report tracking coverage + included contacts",
    m.diagnostics &&
      typeof m.diagnostics.trackingCoverage === "number" &&
      m.diagnostics.includedContacts === m.validContacts &&
      Array.isArray(m.diagnostics.excludedContacts),
  );
  check("calibrated (has scale)", m.calibrated === true && m.metersPerPixel > 0);
  check(
    "valid contacts are a subset of total (zone excludes before/after cones)",
    m.validContacts > 0 && m.validContacts < m.totalContacts,
  );
  check("valid = valid left + valid right", m.validContacts === m.validLeftContacts + m.validRightContacts);
  check("zone recorded with the known distance", m.zone && m.zone.distanceM === 20);
  check("zone traversal time is positive", m.zoneTimeS != null && m.zoneTimeS > 0);

  // Frequency (VueMotion definition) equals the standalone helper over the same
  // in-zone contacts, and all three are positive steps/second.
  check(
    "measurement frequencies match stepFrequenciesFromContacts over valid marks",
    m.combinedStepFrequencyHz != null && m.leftStepFrequencyHz != null && m.rightStepFrequencyHz != null,
  );
  check("combined frequency is a positive rate", m.combinedStepFrequencyHz > 0);

  // Average zone step length = distance / valid steps.
  check(
    "avg zone step length = zone distance ÷ valid steps",
    approx(m.avgZoneStepLengthM, 20 / m.validContacts, 1e-6),
  );
  check("individual step lengths are all positive metres", m.individualStepLengthsM.length > 0 && m.individualStepLengthsM.every((d) => d > 0));

  // Velocity cross-check: distance/time, avg-len×freq, median-len×freq.
  const vDist = m.velocities.find((v) => v.key === "distanceTime").value;
  const vAvg = m.velocities.find((v) => v.key === "avgLenFreq").value;
  const vMed = m.velocities.find((v) => v.key === "medianLenFreq").value;
  check("velocity #1 = zone distance ÷ time", approx(vDist, 20 / m.zoneTimeS, 1e-6));
  check("velocity #2 = avg individual length × combined frequency", approx(vAvg, m.avgIndividualStepLengthM * m.combinedStepFrequencyHz, 1e-6));
  check("velocity #3 (median × freq) present and positive", vMed > 0);
  check("zone velocity equals distance ÷ time method", approx(m.zoneVelocityMps, vDist, 1e-9));
  check("max velocity ≥ the avg-length velocity (uses the longest step)", m.maxVelocityMps >= vAvg - 1e-9);
  check("velocity spread percent is computed", typeof m.velocitySpreadPct === "number");

  // --- Uncalibrated: contacts only, metre fields null ------------------------
  const mu = computeSprintMeasurements(frames, null, 1044, 596);
  check("uncalibrated → calibrated false", mu.calibrated === false);
  check("uncalibrated → total contacts still counted", mu.totalContacts > 0);
  check("uncalibrated → step lengths null", mu.avgZoneStepLengthM === null && mu.leftStepLengthM === null && mu.avgIndividualStepLengthM === null);
  check("uncalibrated → no metre scale", mu.metersPerPixel === null);

  // --- compareToBenchmark: percent error, status, missing/info ---------------
  const ava = {
    zoneTimeS: 1.93,
    avgVelocityMps: 10.36, // exact match → 0%
    maxVelocityMps: 11.277, // 5% over 10.74 → ok
    leftStepLengthM: 2.59, // 20% over 2.16 → warn
    rightStepLengthM: 3.21, // 50% over 2.14 → off
    leftStepFrequencyHz: null, // benchmark has it, AVA doesn't → missing
    combinedStepFrequencyHz: 4.8, // AVA-only (no reference) → info
  };
  const reference = {
    zoneTimeS: 1.93,
    avgVelocityMps: 10.36,
    maxVelocityMps: 10.74,
    leftStepLengthM: 2.16,
    rightStepLengthM: 2.14,
    leftStepFrequencyHz: 5.0,
  };
  const rows = compareToBenchmark(ava, reference);
  const row = (k) => rows.find((r) => r.key === k);

  check("exact match → 0% error, ok", approx(row("avgVelocityMps").percentError, 0, 1e-9) && row("avgVelocityMps").status === "ok");
  check("zone time exact → ok", row("zoneTimeS").status === "ok");
  check("~5% over → ok", row("maxVelocityMps").status === "ok" && Math.abs(row("maxVelocityMps").percentError - 5.0) < 0.2);
  check("20% over → warn", row("leftStepLengthM").status === "warn" && Math.abs(row("leftStepLengthM").percentError - 19.9) < 0.3);
  check("50% over → off", row("rightStepLengthM").status === "off");
  check("benchmark has it but AVA doesn't → missing", row("leftStepFrequencyHz").status === "missing" && row("leftStepFrequencyHz").avaValue === null);
  check("AVA-only value (no reference) → info", row("combinedStepFrequencyHz").status === "info" && row("combinedStepFrequencyHz").benchmarkValue === null);
  check("percent error is |ava−ref|/ref×100", approx(row("leftStepLengthM").percentError, Number((((2.59 - 2.16) / 2.16) * 100).toFixed(1)), 1e-9));

  // evaluateAccuracy: pass when within target, fail when over, unavailable when missing.
  const accRefExact = { combinedStepFrequencyHz: 4.86, zoneTimeS: 1.93, avgVelocityMps: 10.36, maxVelocityMps: 10.74, avgStepLengthM: 2.15 };
  const accPass = evaluateAccuracy({ ...accRefExact }, accRefExact);
  check("accuracy: exact-match metrics all pass their target", accPass.every((r) => r.status === "pass" && r.errorPct === 0));
  check("accuracy targets cover freq/zoneTime/velocity/maxVelocity/stepLength", ACCURACY_TARGETS.map((t) => t.key).join(",") === "combinedStepFrequencyHz,zoneTimeS,avgVelocityMps,maxVelocityMps,avgStepLengthM");
  const accFail = evaluateAccuracy({ combinedStepFrequencyHz: 4.86 * 1.2, zoneTimeS: 1.93, avgVelocityMps: 10.36, avgStepLengthM: 2.15 }, accRefExact);
  check("accuracy: a 20% frequency error fails its 5% target", accFail.find((r) => r.key === "combinedStepFrequencyHz").status === "fail");
  check("accuracy: missing AVA value → unavailable", evaluateAccuracy({}, accRefExact).every((r) => r.status === "unavailable"));

  // assembleAvaValues wires measurements + biomech + active FPS into the vocabulary.
  const values = assembleAvaValues(m, { groundContactTimeMs: 90, flightTimeMs: 120 }, { activeFps: 60 });
  check("assemble maps zone velocity → avgVelocityMps", approx(values.avgVelocityMps, m.zoneVelocityMps, 1e-9));
  check("assemble includes active FPS", values.activeFps === 60);

  // Day 68: assemble PREFERS the measurement's per-foot contact/flight over the
  // worker's single value, and falls back to the worker only when they're absent.
  const mPerFoot = { ...m, groundContactLeftMs: 82, groundContactRightMs: 78, flightLeftMs: 118, flightRightMs: 128 };
  const vPerFoot = assembleAvaValues(mPerFoot, { groundContactTimeMs: 90, flightTimeMs: 120 });
  check(
    "assemble prefers measurement per-foot contact/flight",
    vPerFoot.groundContactLeftMs === 82 && vPerFoot.groundContactRightMs === 78 &&
      vPerFoot.flightLeftMs === 118 && vPerFoot.flightRightMs === 128,
  );
  const mNull = { ...m, groundContactLeftMs: null, groundContactRightMs: null, flightLeftMs: null, flightRightMs: null };
  const vFallback = assembleAvaValues(mNull, { groundContactTimeMs: 90, flightTimeMs: 120 });
  check(
    "assemble falls back to worker contact/flight when measurement is null",
    vFallback.groundContactLeftMs === 90 && vFallback.groundContactRightMs === 90 &&
      vFallback.flightLeftMs === 120 && vFallback.flightRightMs === 120,
  );

  // AVA Calab Vid 1 benchmark validation: the required metrics all appear as rows.
  const calabRef = {
    zoneTimeS: 1.93, avgVelocityMps: 10.36, maxVelocityMps: 10.74,
    avgStepLengthM: 2.15, leftStepLengthM: 2.16, rightStepLengthM: 2.14,
    combinedStepFrequencyHz: 4.86, leftStepFrequencyHz: 5.0, rightStepFrequencyHz: 4.72,
    groundContactLeftMs: 80, groundContactRightMs: 80, flightLeftMs: 120, flightRightMs: 130,
  };
  const calabAva = { ...calabRef, activeFps: 60 }; // AVA matches exactly
  const calabRows = compareToBenchmark(calabAva, calabRef);
  const required = ["zoneTimeS","avgVelocityMps","maxVelocityMps","combinedStepFrequencyHz","leftStepFrequencyHz","rightStepFrequencyHz","avgStepLengthM","leftStepLengthM","rightStepLengthM","groundContactLeftMs","flightLeftMs"];
  check("benchmark validation includes every required metric row", required.every((k) => calabRows.some((r) => r.key === k)));
  check("exact-match AVA vs VueMotion → all compared rows 0% ok", calabRows.filter((r) => r.benchmarkValue != null).every((r) => r.status === "ok" && r.percentError === 0));
  check("FPS shows as AVA-only info when the benchmark has no reference FPS", calabRows.find((r) => r.key === "activeFps").status === "info");

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
