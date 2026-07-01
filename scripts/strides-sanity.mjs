// Runtime sanity for stride segmentation.
//
//   node scripts/strides-sanity.mjs
//
// Compiles the strides + events modules to a throwaway dir, asserts step/stride
// segmentation on synthetic events, checks safe handling of sparse and
// non-alternating data, and (if the real artifact exists) runs the full
// detect → segment pipeline and prints a summary.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".strides-sanity-tmp");
const artifact = path.join(root, "artifacts/pose-sequences/test.pose.json");

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

const FPS = 30;
const ev = (side, type, tMs, confidence = 0.9) => ({
  frame: Math.round((tMs / 1000) * FPS),
  tMs,
  side,
  type,
  confidence,
  source: "pose_heuristic",
});

// A clean alternating cadence: L/R contacts every 250ms, toe-off 150ms after each.
function alternatingEvents() {
  return [
    ev("left", "contact", 0),
    ev("left", "toe_off", 150),
    ev("right", "contact", 250),
    ev("right", "toe_off", 400),
    ev("left", "contact", 500),
    ev("left", "toe_off", 650),
    ev("right", "contact", 750),
    ev("right", "toe_off", 900),
    ev("left", "contact", 1000),
  ];
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  execFileSync(
    "npx",
    [
      "tsc",
      "src/lib/biomechanics/strides/index.ts",
      "src/lib/biomechanics/events/index.ts",
      "--outDir",
      out,
      "--module",
      "commonjs",
      "--target",
      "es2022",
      "--skipLibCheck",
      "--esModuleInterop",
    ],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );
  const { segmentSteps, segmentStrides } = require(path.join(out, "strides/index.js"));
  const { detectFootContacts } = require(path.join(out, "events/index.js"));

  // (1) Synthetic events → expected steps.
  const steps = segmentSteps(alternatingEvents());
  const complete = steps.filter((s) => s.durationMs != null);
  const durationsOk = complete.every((s) => s.durationMs === 250 && s.groundContactMs === 150 && s.flightTimeMs === 100);
  const typedSteps = steps.every(
    (s) =>
      Number.isInteger(s.index) &&
      (s.side === "left" || s.side === "right") &&
      Number.isFinite(s.startContactMs) &&
      typeof s.confidence === "number" &&
      s.source === "gait_events",
  );
  check(`steps: ${steps.length} total, ${complete.length} complete (dur=250, gc=150, flight=100)`, steps.length === 5 && complete.length === 4 && durationsOk);
  check(`steps are well-typed StepSegment[]`, typedSteps);
  check(`last step is incomplete (durationMs undefined)`, steps[4].durationMs === undefined);

  // (2) Synthetic events → expected strides.
  const strides = segmentStrides(alternatingEvents());
  const stridesOk = strides.every((s) => s.durationMs === 500 && s.stepCount === 2 && s.steps.length === 2 && s.source === "gait_events");
  check(`strides: ${strides.length} (each dur=500, stepCount=2)`, strides.length === 3 && stridesOk);
  check(`strides re-indexed 0..n and time-sorted`, strides.every((s, i) => s.index === i) && strides.every((s, i) => i === 0 || s.startContactMs >= strides[i - 1].startContactMs));

  // (3) Incomplete / sparse streams fail safely.
  check(`empty events → no steps/strides`, segmentSteps([]).length === 0 && segmentStrides([]).length === 0);
  check(`only toe-offs (no contacts) → []`, segmentSteps([ev("left", "toe_off", 100)]).length === 0);
  check(`single contact → 1 step, 0 strides`, segmentSteps([ev("left", "contact", 0)]).length === 1 && segmentStrides([ev("left", "contact", 0)]).length === 0);

  // (4) Non-alternating contacts handled by option.
  const nonAlt = [ev("left", "contact", 0), ev("left", "contact", 100), ev("right", "contact", 300)];
  const keepAll = segmentSteps(nonAlt, { requireAlternatingSides: false });
  const alternated = segmentSteps(nonAlt, { requireAlternatingSides: true });
  check(`non-alternating: default keeps repeats (${keepAll.length} steps), requireAlternatingSides drops them (${alternated.length} steps)`, keepAll.length === 3 && alternated.length === 2);

  // (5) Real artifact optional summary.
  if (existsSync(artifact)) {
    const seq = JSON.parse(readFileSync(artifact, "utf8"));
    const events = detectFootContacts(seq);
    const rSteps = segmentSteps(events);
    const rStrides = segmentStrides(events);
    console.log(`real artifact: ${seq.frames.length} frames → ${events.length} events → ${rSteps.length} steps, ${rStrides.length} strides`);
    check(`real artifact pipeline returned typed arrays`, Array.isArray(rSteps) && Array.isArray(rStrides));
  } else {
    console.log("real artifact: (not present — skipping optional summary)");
  }

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
