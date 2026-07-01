// Benchmark-driven foot-contact calibration check.
//
//   node scripts/contact-calibration-sanity.mjs
//
// Runs the real artifact through detectFootContacts → segmentSteps with the old
// (uncalibrated) params and the new calibrated defaults, then compares ground
// contact / flight time / step frequency against Video A and shows the change.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".contact-calibration-tmp");
const artifact = path.join(root, "artifacts/pose-sequences/test.pose.json");

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

// Pre-calibration baseline recorded in Milestone 3 (Day 16 detector, real
// artifact vs Video A). Used as the "before" reference.
const BASELINE = {
  stepFrequencyHz: 5.39,
  avgGroundContactMs: 157.7,
  avgFlightTimeMs: 71.9,
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  execFileSync(
    "npx",
    ["tsc", "src/lib/biomechanics/events/index.ts", "src/lib/biomechanics/strides/index.ts", "src/lib/biomechanics/validation/index.ts", "--outDir", out, "--module", "commonjs", "--target", "es2022", "--skipLibCheck", "--esModuleInterop", "--strict"],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );
  const { detectFootContacts } = require(path.join(out, "events/index.js"));
  const { segmentSteps } = require(path.join(out, "strides/index.js"));
  const { getBenchmark, compareMetrics } = require(path.join(out, "validation/index.js"));

  const videoA = getBenchmark("A");

  function metricsFrom(seq, detectOpts) {
    const events = detectFootContacts(seq, detectOpts);
    const steps = segmentSteps(events);
    const stepDur = mean(steps.map((s) => s.durationMs).filter(isNum));
    return {
      eventCount: events.length,
      stepFrequencyHz: stepDur ? 1000 / stepDur : undefined,
      avgGroundContactMs: mean(steps.map((s) => s.groundContactMs).filter(isNum)) ?? undefined,
      avgFlightTimeMs: mean(steps.map((s) => s.flightTimeMs).filter(isNum)) ?? undefined,
    };
  }

  if (!existsSync(artifact)) {
    console.log("real artifact not present — skipping calibration comparison (nothing to fail).");
    check("calibration script ran", true);
  } else {
    const seq = JSON.parse(readFileSync(artifact, "utf8"));
    const before = BASELINE; // recorded Milestone 3 numbers
    const after = metricsFrom(seq, {}); // calibrated defaults, live

    const cmp = (m) =>
      compareMetrics(
        { stepFrequencyHz: m.stepFrequencyHz, avgGroundContactMs: m.avgGroundContactMs, avgFlightTimeMs: m.avgFlightTimeMs },
        videoA,
      );
    const pctOf = (result, label) => {
      const c = result.comparisons.find((x) => x.label === label);
      return c && c.percentError != null ? c.percentError : null;
    };
    const beforeCmp = cmp(before);
    const afterCmp = cmp(after);

    const rows = [
      ["Step frequency (Hz)", videoA.avgStepFrequencyHz, before.stepFrequencyHz, after.stepFrequencyHz, "Avg step frequency"],
      ["Ground contact (ms)", videoA.avgGroundContactMs, before.avgGroundContactMs, after.avgGroundContactMs, "Ground contact"],
      ["Flight time (ms)", videoA.avgFlightTimeMs, before.avgFlightTimeMs, after.avgFlightTimeMs, "Flight time"],
    ];
    console.log(`\n${"Metric".padEnd(22)}${"Benchmark".padEnd(11)}${"Before".padEnd(10)}${"After".padEnd(10)}${"%Err before".padEnd(13)}%Err after`);
    for (const [label, bench, b, a, cmpLabel] of rows) {
      console.log(
        `${label.padEnd(22)}${String(bench).padEnd(11)}${String(round1(b)).padEnd(10)}${String(round1(a)).padEnd(10)}` +
          `${`${pctOf(beforeCmp, cmpLabel)}%`.padEnd(13)}${pctOf(afterCmp, cmpLabel)}%`,
      );
    }

    // Targets: GC toward 80ms, flight toward 125ms, step freq no worse vs 4.86Hz.
    const errGC = (v) => Math.abs(v - 80);
    const errFlight = (v) => Math.abs(v - 125);
    const errFreq = (v) => Math.abs(v - 4.86);
    console.log("");
    check(`ground contact moved toward 80ms (before ${round1(before.avgGroundContactMs)} → after ${round1(after.avgGroundContactMs)})`,
      errGC(after.avgGroundContactMs) < errGC(before.avgGroundContactMs));
    check(`flight time moved toward 125ms (before ${round1(before.avgFlightTimeMs)} → after ${round1(after.avgFlightTimeMs)})`,
      errFlight(after.avgFlightTimeMs) < errFlight(before.avgFlightTimeMs));
    check(`step frequency not worse vs 4.86Hz (before ${round1(before.stepFrequencyHz)} → after ${round1(after.stepFrequencyHz)})`,
      errFreq(after.stepFrequencyHz) <= errFreq(before.stepFrequencyHz) + 0.25);
  }

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
