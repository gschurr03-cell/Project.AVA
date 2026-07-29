// Runtime sanity for the Exercise Recommendation Library V1
// (intelligence/exerciseLibrary.ts + exerciseSelection.ts).
//
//   node scripts/exercise-library-sanity.mjs
//
// Asserts selection maps a limiter + evidence onto the right drills:
//   1. Asymmetry + right weak side → right-side exercises.
//   2. Frequency limiter → dribble / A-skip / switch / wicket exercises.
//   3. Stride-length limiter → projection / bounding / wicket / fly exercises.
//   4. Speed limiter → fly / wicket / ins-and-outs exercises.
//   5. Calibration limiter → no training drills.
//   6. 60 fps → no contact/stiffness-dependent (experimental-fps) exercises.
//   7. Every selected exercise carries a prescription + cues.
//   8. Exercises sort by match score, side-specificity respected.
//   9. Screenshot example → right-lead / right-leg exercises.
//  (10. Existing recommendation tests still pass → npm run recommendations:sanity.)

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".exercise-library-sanity-tmp");
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
      files: [
        path.join(root, "src/lib/intelligence/exerciseSelection.ts"),
        path.join(root, "src/lib/intelligence/exerciseLibrary.ts"),
      ],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { selectExercisesForRecommendation } = require(path.join(out, "lib/intelligence/exerciseSelection.js"));
  const { EXERCISES } = require(path.join(out, "lib/intelligence/exerciseLibrary.js"));

  // Minimal recommendation builder for tests (only the fields the selector reads).
  const rec = (over) => ({
    id: over.id ?? over.category, category: over.category, title: over.title ?? "", severity: over.severity ?? "high",
    confidence: over.confidence ?? "high", trusted: over.trusted ?? true, metricEvidence: over.metricEvidence ?? [],
    whyItMatters: "", coachingCue: "", trainingFocus: [], nextSessionGoal: "", displayPriority: 0,
  });
  const ctx = (over = {}) => ({ activeFps: 60, poseConfidence: 0.85, calibrationTrusted: true, trackingTrusted: true, ...over });
  const cats = (picks) => picks.map((p) => p.exercise.category);
  const names = (picks) => picks.map((p) => p.exercise.name);
  const some = (arr, re) => arr.some((x) => re.test(x));

  // Library integrity.
  check("library has 102 exercises", EXERCISES.length === 102);
  check("every exercise has cues + a full prescription", EXERCISES.every((e) => e.cues.length > 0 && e.prescription.sets && e.prescription.reps && e.prescription.rest));

  // ---- 1 & 9. Asymmetry, right weak side (the screenshot example) ----
  const asymRight = rec({
    category: "asymmetry", trusted: true, severity: "high",
    title: "Step frequency favours the left side",
    metricEvidence: [{ label: "Step frequency L / R", value: "5.22 / 4.53 steps/s", interpretation: "" }],
  });
  const pAsym = selectExercisesForRecommendation(asymRight, ctx());
  check("asymmetry (right weak) → 3–5 exercises returned", pAsym.length >= 3 && pAsym.length <= 5);
  check("asymmetry (right weak) → at least 2 right-side-specific exercises", pAsym.filter((p) => p.exercise.evidenceTags.includes("right")).length >= 2);
  check("asymmetry (right weak) → NO left-only exercise selected", pAsym.every((p) => !p.exercise.evidenceTags.includes("left")));
  check("screenshot example surfaces a right-lead / right-leg drill", some(names(pAsym), /Right-lead|Right-leg|right/i));
  check("asymmetry 'why' cites the measured 13% turnover gap", pAsym.some((p) => /13% (slower|shorter)/.test(p.why)));
  check("side-specific picks apply to the right leg", pAsym.filter((p) => p.exercise.sideSpecific).every((p) => p.appliedSide === "right"));

  // ---- 2. Frequency limiter ----
  const pFreq = selectExercisesForRecommendation(rec({ category: "frequency" }), ctx());
  check("frequency limiter → returns exercises", pFreq.length >= 3);
  check("frequency limiter → dribble/skip/leg_reset/wicket families", cats(pFreq).some((c) => ["dribble", "skip", "leg_reset", "wicket", "wall_drill"].includes(c)));
  check("frequency limiter (no side issue) → no fixed-side (right) drill", pFreq.every((p) => !p.exercise.evidenceTags.includes("right")));

  // ---- 3. Stride-length limiter ----
  const pStride = selectExercisesForRecommendation(rec({ category: "stride_length" }), ctx());
  check("stride-length limiter → projection/bounding/wicket/fly families", cats(pStride).some((c) => ["wicket", "plyometric", "sprint_integration", "strength"].includes(c)));

  // ---- 4. Speed limiter ----
  const pSpeed = selectExercisesForRecommendation(rec({ category: "speed" }), ctx());
  check("speed limiter → fly/wicket/ins-and-outs (sprint_integration/wicket)", cats(pSpeed).every((c) => ["sprint_integration", "wicket"].includes(c)) && pSpeed.length >= 3);
  check("speed limiter surfaces a fly / ins-and-outs integration", some(names(pSpeed), /fly|ins-and-outs|float|flying/i));

  // ---- 5. Calibration limiter → no training drills ----
  check("calibration limiter → no training drills", selectExercisesForRecommendation(rec({ category: "calibration", trusted: true }), ctx()).length === 0);
  check("tracking limiter → no training drills", selectExercisesForRecommendation(rec({ category: "tracking", trusted: true }), ctx()).length === 0);

  // ---- 6. 60 fps → no contact/stiffness-dependent exercises ----
  check("library contains an fps-gated (contact/stiffness) exercise", EXERCISES.some((e) => e.fpsRequirement === "experimental" && e.evidenceTags.includes("contact_time")));
  // Across every non-training limiter, at 60fps no returned drill requires high-FPS timing.
  const at60 = ["frequency", "stride_length", "speed", "rhythm"].flatMap((c) =>
    selectExercisesForRecommendation(rec({ category: c, trusted: false }), ctx({ activeFps: 60 })),
  );
  check("60fps → no fpsRequirement='experimental' exercise selected anywhere", at60.every((p) => p.exercise.fpsRequirement !== "experimental"));
  check("60fps → the contact/stiffness drill is never selected", at60.every((p) => p.exercise.id !== "quick_contacts_mini_hurdles"));
  check("60fps → no exercise tagged contact_time/toe_off/foot_strike is selected", at60.every((p) => !p.exercise.evidenceTags.some((t) => ["contact_time", "toe_off", "foot_strike"].includes(t))));

  // ---- 7. Prescriptions + cues on every selected exercise ----
  const allPicks = [...pAsym, ...pFreq, ...pStride, ...pSpeed];
  check("every selected exercise returns a prescription", allPicks.every((p) => p.exercise.prescription.sets && p.exercise.prescription.reps));
  check("every selected exercise returns at least one cue", allPicks.every((p) => p.exercise.cues.length > 0));
  check("every selected exercise returns a 'why'", allPicks.every((p) => typeof p.why === "string" && p.why.length > 0));

  // ---- 8. Sort by match score; side specificity respected ----
  check("picks are sorted by descending match score", pAsym.every((p, i) => i === 0 || p.score <= pAsym[i - 1].score));
  check("for asymmetry, a side-specific right drill outranks a generic one", (() => {
    const firstRight = pAsym.findIndex((p) => p.exercise.evidenceTags.includes("right"));
    const firstGenericNonSide = pAsym.findIndex((p) => !p.exercise.sideSpecific);
    return firstRight !== -1 && (firstGenericNonSide === -1 || firstRight < firstGenericNonSide);
  })());

  // ---- Trust gating: trusted rec never gets an experimental-trust exercise ----
  check("trusted recommendation never selects an experimental-trust exercise", selectExercisesForRecommendation(rec({ category: "stride_length", trusted: true }), ctx({ activeFps: 240 })).every((p) => p.exercise.trust === "trusted"));

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
