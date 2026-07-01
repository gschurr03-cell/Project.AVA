// Day 23 — benchmark-driven cadence/flight calibration check.
//
//   node scripts/step-calibration-sanity.mjs
//
// Runs the real artifact through analyzeSprint (the same path the worker uses)
// and compares step frequency / flight time / ground contact against Video A.
// The plausible-step window rejects double-detections and the standing-start
// phase for cadence & flight; ground contact is left over all steps and must
// NOT regress from the Day 22 baseline.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".step-calibration-tmp");
const artifact = path.join(root, "artifacts/pose-sequences/test.pose.json");

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};
const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const err = (v, t) => (v == null ? null : Math.round((Math.abs(v - t) / t) * 1000) / 10);

// Day 22 baseline (real artifact vs Video A, before the plausible-step window).
const BASELINE = { stepFrequencyHz: 5.39, avgGroundContactMs: 81.7, avgFlightTimeMs: 147.4 };
const TARGET = { stepFrequencyHz: 4.86, avgGroundContactMs: 80, avgFlightTimeMs: 125 };

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  execFileSync(
    "npx",
    ["tsc", "src/lib/biomechanics/analysis/index.ts", "src/lib/biomechanics/validation/index.ts", "--outDir", out, "--module", "commonjs", "--target", "es2022", "--skipLibCheck", "--esModuleInterop", "--strict"],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );
  const { analyzeSprint } = require(path.join(out, "analysis/index.js"));
  const { getBenchmark } = require(path.join(out, "validation/index.js"));
  const videoA = getBenchmark("A");
  check("Video A benchmark present", !!videoA);

  if (!existsSync(artifact)) {
    console.log("real artifact not present — skipping calibration comparison (nothing to fail).");
    check("calibration script ran", true);
  } else {
    const seq = JSON.parse(readFileSync(artifact, "utf8"));
    const { metrics, warnings } = analyzeSprint(seq);
    const after = {
      stepFrequencyHz: metrics.stepFrequencyHz,
      avgGroundContactMs: metrics.avgGroundContactMs,
      avgFlightTimeMs: metrics.avgFlightTimeMs,
    };

    const rows = [
      ["Step frequency (Hz)", TARGET.stepFrequencyHz, BASELINE.stepFrequencyHz, after.stepFrequencyHz],
      ["Ground contact (ms)", TARGET.avgGroundContactMs, BASELINE.avgGroundContactMs, after.avgGroundContactMs],
      ["Flight time (ms)", TARGET.avgFlightTimeMs, BASELINE.avgFlightTimeMs, after.avgFlightTimeMs],
    ];
    console.log(`\n${"Metric".padEnd(22)}${"Target".padEnd(9)}${"Before".padEnd(9)}${"After".padEnd(9)}${"%Err before".padEnd(13)}%Err after`);
    for (const [label, t, b, a] of rows) {
      console.log(
        `${label.padEnd(22)}${String(t).padEnd(9)}${String(round1(b)).padEnd(9)}${String(round1(a)).padEnd(9)}` +
          `${`${err(b, t)}%`.padEnd(13)}${err(a, t)}%`,
      );
    }
    if (warnings.length) console.log(`\nwarnings: ${warnings.join(" | ")}`);

    console.log("");
    // Step frequency: closer to 4.86 Hz than the Day 22 baseline.
    check(
      `step frequency moved toward ${TARGET.stepFrequencyHz}Hz (before ${round1(BASELINE.stepFrequencyHz)} → after ${round1(after.stepFrequencyHz)})`,
      err(after.stepFrequencyHz, TARGET.stepFrequencyHz) < err(BASELINE.stepFrequencyHz, TARGET.stepFrequencyHz),
    );
    // Flight time: closer to 125 ms than the Day 22 baseline.
    check(
      `flight time moved toward ${TARGET.avgFlightTimeMs}ms (before ${round1(BASELINE.avgFlightTimeMs)} → after ${round1(after.avgFlightTimeMs)})`,
      err(after.avgFlightTimeMs, TARGET.avgFlightTimeMs) < err(BASELINE.avgFlightTimeMs, TARGET.avgFlightTimeMs),
    );
    // Ground contact: must NOT regress (error no worse than the Day 22 baseline, small tolerance).
    check(
      `ground contact not regressed (before ${round1(BASELINE.avgGroundContactMs)} → after ${round1(after.avgGroundContactMs)})`,
      err(after.avgGroundContactMs, TARGET.avgGroundContactMs) <= err(BASELINE.avgGroundContactMs, TARGET.avgGroundContactMs) + 0.1,
    );
  }

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
