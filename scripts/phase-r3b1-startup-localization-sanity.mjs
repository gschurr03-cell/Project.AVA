// Phase R3B-1 Part R -- thin wrapper. The actual fix (athlete_tracker.py) is
// Python worker code, so the real 20-check test suite is written in Python
// (scripts/phase-r3b1-startup-localization-sanity.py, matching this repo's
// established convention for every other box_tracker.py/athlete_tracker.py
// test -- box-tracker-sanity.py, detector-event-plausibility-sanity.py,
// etc., all .py, never .mjs). This wrapper exists so the exact filename
// this phase's task specified is a real, runnable entry point.
//
//   node scripts/phase-r3b1-startup-localization-sanity.mjs
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
try {
  execFileSync("python3", ["scripts/phase-r3b1-startup-localization-sanity.py"], { cwd: root, stdio: "inherit" });
} catch (err) {
  process.exitCode = err.status ?? 1;
}
