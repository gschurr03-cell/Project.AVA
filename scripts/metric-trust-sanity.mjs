// Runtime sanity for the metric trust cleanup — the customer-facing metricTrust()
// gate that powers the "Coming Soon / Experimental Metrics" bin.
//
//   node scripts/metric-trust-sanity.mjs
//
// Asserts the four required behaviours:
//   1. A 60 fps recording moves contact/flight (and derived timing) to experimental.
//   2. At 120 fps+ those timing metrics can display when confidence allows.
//   3. Trusted 60 fps metrics (velocity, stride length, frequency) still display.
//   4. No unavailable metric ever renders as a fake 0 — it becomes an honest string.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".metric-trust-sanity-tmp");

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
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
        skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node",
        baseUrl: root, paths: { "@/*": ["src/*"] },
      },
      files: [path.join(root, "src/lib/benchmark/precision.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", tsconfigPath], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const {
    metricTrust,
    isMetricValueUnavailable,
    NEEDS_HIGHER_FPS_MESSAGE,
    NEEDS_CONFIDENCE_MESSAGE,
    COMING_SOON_MESSAGE,
    EXPERIMENTAL_BIN_DESCRIPTION,
    FPS_LIMITED_METRIC_KEYS,
  } = require(path.join(out, "lib/benchmark/precision.js"));

  // Exact placeholder strings (rule 7).
  check('NEEDS_HIGHER_FPS_MESSAGE is "Needs 120fps+"', NEEDS_HIGHER_FPS_MESSAGE === "Needs 120fps+");
  check('NEEDS_CONFIDENCE_MESSAGE is "Needs higher confidence"', NEEDS_CONFIDENCE_MESSAGE === "Needs higher confidence");
  check('COMING_SOON_MESSAGE is "Coming soon"', COMING_SOON_MESSAGE === "Coming soon");
  check(
    "panel description mentions higher frame-rate + tracking confidence (rule 4)",
    /higher frame-rate/i.test(EXPERIMENTAL_BIN_DESCRIPTION) &&
      /tracking confidence/i.test(EXPERIMENTAL_BIN_DESCRIPTION),
  );

  // ---- Test 1: 60 fps moves contact/flight (and derived timing) to experimental ----
  for (const key of ["groundContactTimeMs", "flightTimeMs", "contactFlightRatio", "footStrikeTimingMs", "toeOffTimingMs"]) {
    const t = metricTrust({ key, activeFps: 60, poseConfidence: 0.9, value: 92 });
    check(`${key} @60fps → needsHigherFps ("Needs 120fps+")`, t.state === "needsHigherFps" && t.message === "Needs 120fps+");
  }
  // Even with a perfectly good value + confidence, 60 fps is not enough for timing.
  check(
    "ground contact @60fps is NOT shown as available even with strong confidence",
    metricTrust({ key: "groundContactTimeMs", activeFps: 60, poseConfidence: 1, value: 88 }).state !== "available",
  );

  // ---- Test 2: 120 fps+ can show timing metrics IF confidence allows (rule 5) ----
  check(
    "ground contact @120fps + strong confidence + value → available",
    metricTrust({ key: "groundContactTimeMs", activeFps: 120, poseConfidence: 0.85, value: 88 }).state === "available",
  );
  check(
    "flight time @240fps + strong confidence + value → available",
    metricTrust({ key: "flightTimeMs", activeFps: 240, poseConfidence: 0.9, value: 130 }).state === "available",
  );
  check(
    "ground contact @120fps but LOW confidence → needsConfidence (not shown as trusted)",
    metricTrust({ key: "groundContactTimeMs", activeFps: 120, poseConfidence: 0.4, value: 88 }).state === "needsConfidence",
  );
  check(
    "ground contact @120fps confidence unknown (null) + value → available (no confidence signal ≠ low)",
    metricTrust({ key: "groundContactTimeMs", activeFps: 120, poseConfidence: null, value: 88 }).state === "available",
  );

  // ---- Test 3: trusted 60 fps metrics still display ----
  for (const [key, value] of [["topSpeedMps", 10.9], ["avgVelocityMps", 10.2], ["strideFrequencyHz", 4.6], ["avgStrideLengthM", 2.3], ["stepLengthM", 2.1]]) {
    const t = metricTrust({ key, activeFps: 60, poseConfidence: 0.9, value });
    check(`${key} @60fps with a real value → available (stays trusted)`, t.state === "available");
  }
  // Confidence-dependent joint angle: available with good confidence, gated when low.
  check(
    "peak knee flexion @60fps + good confidence → available",
    metricTrust({ key: "peakKneeFlexionDeg", activeFps: 60, poseConfidence: 0.9, value: 135 }).state === "available",
  );
  check(
    "peak knee flexion + low confidence → needsConfidence (fps-independent)",
    metricTrust({ key: "peakKneeFlexionDeg", activeFps: 240, poseConfidence: 0.3, value: 135 }).state === "needsConfidence",
  );

  // ---- Test 4: no unavailable metric displays as 0 ----
  // A zero on a key where zero means "not measured" must NOT be available, and its
  // placeholder message is a non-numeric string (so the UI never renders "0").
  const isPlaceholderString = (m) => typeof m === "string" && m.length > 0 && Number.isNaN(Number(m));
  for (const [key, fps] of [["groundContactTimeMs", 60], ["flightTimeMs", 60], ["topSpeedMps", 60], ["strideFrequencyHz", 60], ["groundContactTimeMs", 240]]) {
    const t = metricTrust({ key, activeFps: fps, poseConfidence: 0.9, value: 0 });
    check(`${key} value 0 @${fps}fps → placeholder, never a fake 0`, t.state !== "available" && isPlaceholderString(t.message));
  }
  check("isMetricValueUnavailable(groundContactTimeMs, 0) === true", isMetricValueUnavailable("groundContactTimeMs", 0) === true);
  check("isMetricValueUnavailable(groundContactTimeMs, 90) === false", isMetricValueUnavailable("groundContactTimeMs", 90) === false);
  check("isMetricValueUnavailable(topSpeedMps, null) === true", isMetricValueUnavailable("topSpeedMps", null) === true);
  // A legitimate near-zero reading on a non-zero-sentinel key stays available.
  check("avgTrunkLeanDeg value 0 stays available (0° lean is a real reading)", metricTrust({ key: "avgTrunkLeanDeg", activeFps: 60, poseConfidence: 0.9, value: 0 }).state === "available");

  // Coverage: every fps-limited key is downgraded at 60 fps.
  const all60Downgraded = [...FPS_LIMITED_METRIC_KEYS].every(
    (k) => metricTrust({ key: k, activeFps: 60, poseConfidence: 1, value: 100 }).state === "needsHigherFps",
  );
  check("every FPS-limited key → needsHigherFps at 60 fps", all60Downgraded);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
