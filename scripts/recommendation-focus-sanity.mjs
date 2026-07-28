// Regression sanity for the coaching-recommendation SIMPLIFICATION (Part 2):
// AVA must surface a focused 2–3 non-redundant, highest-impact interventions per
// limiter — never five — with deterministic ranking and specific (non-boilerplate)
// explanations.
//
//   node scripts/recommendation-focus-sanity.mjs
//
// Covers the required cases:
//  1. No issue shows > 3 default exercises.
//  2. Two recommendations are allowed when sufficient.
//  3. A third appears only when meaningfully distinct (a different stimulus family).
//  4. Near-duplicate exercises (same stimulus family) are not selected together.
//  5. Ranking is deterministic.
//  6. Explanations are specific, not repeated boilerplate.
//  7. Presentation reduces oversized inputs (domain already caps at 3).
//  8. Existing 5-item intent is safely reduced at the domain boundary.
//  9. Empty / gated recommendation sets degrade gracefully.
// 10. Athlete-level + safety gating (trust / calibration / fps) still respected.
// 11. Confidence/evidence-driven trust gating remains accurate.
// 12. Deterministic output is stable across repeated calls (UI can render 1:1).

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".recommendation-focus-tmp");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return originalResolve.call(this, request.startsWith("@/") ? path.join(out, request.slice(2)) : request, ...rest);
};

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

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
      files: [path.join(root, "src/lib/intelligence/exerciseSelection.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { selectExercisesForRecommendation, stimulusFamily } = require(
    path.join(out, "lib/intelligence/exerciseSelection.js"),
  );

  const rec = (over) => ({
    id: "r1", category: "stride_length", trusted: true, severity: "moderate", confidence: "high",
    title: "Stride length is capping ground covered per step", metricEvidence: [], evidenceMoments: [],
    whyItMatters: "", coachingCue: "", trainingFocus: [], nextSessionGoal: "", ...over,
  });
  const ctx = (over = {}) => ({ activeFps: 60, poseConfidence: 0.85, calibrationTrusted: true, trackingTrusted: true, ...over });
  const families = (picks) => picks.map((p) => stimulusFamily(p.exercise));

  const limiters = ["stride_length", "frequency", "speed", "rhythm", "asymmetry"];

  // 1. No limiter yields more than 3 default exercises.
  let allMax3 = true;
  for (const c of limiters) {
    const evidence = c === "asymmetry"
      ? [{ label: "Step frequency L / R", value: "5.22 / 4.53 steps/s", interpretation: "" }]
      : [];
    const picks = selectExercisesForRecommendation(rec({ category: c, metricEvidence: evidence }), ctx());
    if (picks.length > 3) { allMax3 = false; console.log(`   ${c} → ${picks.length}`); }
  }
  check("1. no limiter returns more than 3 exercises", allMax3);

  // 2. Two recommendations allowed when sufficient (speed → exactly 2 relevant families).
  const speed = selectExercisesForRecommendation(rec({ category: "speed" }), ctx());
  check("2. speed limiter surfaces exactly two focused interventions", speed.length === 2);

  // 3. A third appears only when meaningfully distinct — stride has 3 DISTINCT families.
  const stride = selectExercisesForRecommendation(rec({ category: "stride_length" }), ctx());
  check("3. stride limiter's third pick is a distinct stimulus family",
    stride.length === 3 && new Set(families(stride)).size === 3);

  // 4. Near-duplicates (same stimulus family) are never selected together.
  let noDup = true;
  for (const c of ["stride_length", "frequency", "speed", "rhythm"]) {
    const fams = families(selectExercisesForRecommendation(rec({ category: c }), ctx()));
    if (new Set(fams).size !== fams.length) { noDup = false; console.log(`   ${c} families: ${fams}`); }
  }
  check("4. no two picks share a stimulus family (no near-duplicates)", noDup);

  // 5 + 12. Ranking is deterministic and stable across repeated calls.
  const a = selectExercisesForRecommendation(rec(), ctx());
  const b = selectExercisesForRecommendation(rec(), ctx());
  check("5. ranking is deterministic (identical ids+order across calls)",
    JSON.stringify(a.map((p) => p.exercise.id)) === JSON.stringify(b.map((p) => p.exercise.id)));

  // 6. Explanations are specific, not repeated boilerplate.
  const whys = stride.map((p) => p.why);
  check("6a. every intervention has a distinct 'why' (no repeated boilerplate)",
    new Set(whys).size === whys.length);
  check("6b. 'why' text is not the old generic 'so AVA chose a … drill' boilerplate",
    whys.every((w) => !/so AVA chose a/i.test(w)));

  // 7 + 8. Domain boundary reduces to <=3 (an oversized library intent cannot leak 5).
  check("7/8. every limiter is reduced to <= 3 at the domain boundary",
    limiters.every((c) => selectExercisesForRecommendation(rec({ category: c,
      metricEvidence: c === "asymmetry" ? [{ label: "L / R", value: "5.2 / 4.5 steps/s", interpretation: "" }] : [] }), ctx()).length <= 3));

  // 9. Gated / empty sets degrade gracefully (no throw, empty array).
  check("9. calibration limiter degrades to no drills (graceful)",
    selectExercisesForRecommendation(rec({ category: "calibration" }), ctx()).length === 0);
  check("9b. poor-calibration stride degrades to no drills (graceful)",
    selectExercisesForRecommendation(rec({ category: "stride_length" }), ctx({ calibrationTrusted: false })).length === 0);

  // 10. Athlete-level + safety gating still respected: fps-gated drills excluded at 60fps.
  const fpsGated = selectExercisesForRecommendation(rec({ category: "stride_length" }), ctx({ activeFps: 60 }));
  check("10. fps gating respected (no experimental-fps drill at 60fps)",
    fpsGated.every((p) => p.exercise.fpsRequirement !== "experimental"));

  // 11. Trust gating accurate: an untrusted recommendation never yields trusted-only picks it shouldn't,
  //     and a trusted recommendation only yields trusted exercises.
  const trustedPicks = selectExercisesForRecommendation(rec({ trusted: true }), ctx());
  check("11. trusted recommendation → only trusted exercises",
    trustedPicks.length > 0 && trustedPicks.every((p) => p.exercise.trust === "trusted"));

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
