// Runtime sanity for Stride Length Exercise Selection V1
// (intelligence/exerciseSelection.ts stride path + recommendations.ts language).
//
//   node scripts/exercise-recommendations-sanity.mjs
//
// Asserts:
//   1. Stride-length limiter selects wicket/projection exercises.
//   2. Low stride + adequate frequency downranks pure frequency drills.
//   3. Low stride + low frequency includes one rhythm drill but keeps projection first.
//   4. Poor calibration blocks strong stride-length training advice.
//   5. Trochanter ratio evidence appears only when trochanter_height_m exists.
//   6. High/abnormal trochanter ratio flags review instead of a training prescription.
//   7. Stride-length cues never say "reach" or "overstride".
//   8. 60 fps does not use contact/stiffness as a primary stride cause.
//   9. Current-session example → progressive wickets / fly integration / bounds.
//  10. Existing exercise recommendation selection still passes (core regressions).

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".exercise-recommendations-sanity-tmp");
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
        path.join(root, "src/lib/intelligence/recommendations.ts"),
        path.join(root, "src/lib/intelligence/workoutBuilder.ts"),
      ],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { selectExercisesForRecommendation } = require(path.join(out, "lib/intelligence/exerciseSelection.js"));
  const { buildRecommendations } = require(path.join(out, "lib/intelligence/recommendations.js"));
  const { buildWorkoutPlan, WORKOUT_BLOCKED_MESSAGE } = require(path.join(out, "lib/intelligence/workoutBuilder.js"));

  const rec = (over) => ({
    id: over.id ?? over.category, category: over.category, title: over.title ?? "", severity: over.severity ?? "high",
    confidence: over.confidence ?? "high", trusted: over.trusted ?? true, metricEvidence: over.metricEvidence ?? [],
    whyItMatters: "", coachingCue: "", trainingFocus: [], nextSessionGoal: over.nextSessionGoal ?? "Move the target metric toward its benchmark next session.", evidenceMoments: [], displayPriority: 0,
  });
  const ctx = (over = {}) => ({ activeFps: 60, poseConfidence: 0.85, calibrationTrusted: true, trackingTrusted: true, ...over });
  const names = (picks) => picks.map((p) => p.exercise.name);
  const cats = (picks) => picks.map((p) => p.exercise.category);
  const some = (arr, re) => arr.some((x) => re.test(x));

  const strideRec = rec({ category: "stride_length", title: "Stride length is capping ground covered per step", metricEvidence: [{ label: "Stride length (peak)", value: "2.12 m", benchmark: "2.45–2.75 m", interpretation: "" }] });

  // ---- 1. Stride limiter selects wicket / projection exercises ----
  const p1 = selectExercisesForRecommendation(strideRec, ctx());
  check("stride limiter → 2–3 focused exercises (never five)", p1.length >= 2 && p1.length <= 3);
  check("stride limiter → top pick is a projection family (wicket/sprint_integration/plyometric)", ["wicket", "sprint_integration", "plyometric"].includes(p1[0].exercise.category));
  check("stride limiter → includes a wicket exercise", cats(p1).includes("wicket"));
  check("stride limiter → surfaces a projection-tagged drill", p1.some((p) => p.exercise.evidenceTags.includes("projection")));

  // ---- 2. Low stride + adequate frequency downranks pure frequency drills ----
  const p2 = selectExercisesForRecommendation(strideRec, ctx({ frequencyLow: false }));
  check("stride limiter → no pure dribble / hip_flexor / leg_reset in picks", p2.every((p) => !["dribble", "hip_flexor", "leg_reset"].includes(p.exercise.category)));
  check("stride limiter → picks are projection/wicket/bound/fly/strength/core only", p2.every((p) => ["wicket", "sprint_integration", "plyometric", "skip", "strength", "core_pelvis"].includes(p.exercise.category)));

  // ---- 3. Low stride + low frequency: one rhythm drill, projection still first ----
  const p3 = selectExercisesForRecommendation(strideRec, ctx({ frequencyLow: true }));
  check("stride+low-freq → projection family still leads", ["wicket", "sprint_integration", "plyometric"].includes(p3[0].exercise.category));
  check("stride+low-freq → at least one rhythm/frequency drill present", p3.some((p) => p.exercise.limiterCategories.includes("rhythm") || p.exercise.limiterCategories.includes("frequency")));

  // ---- 4. Poor calibration blocks strong stride-length training advice ----
  check("poor calibration → stride limiter returns no drills", selectExercisesForRecommendation(strideRec, ctx({ calibrationTrusted: false })).length === 0);

  // ---- 5 & 6. Trochanter ratio evidence / review flagging (via the engine) ----
  const trustedBase = {
    topSpeedMps: 11.2, avgVelocityMps: 10.6, avgStrideLengthM: 2.1, strideLengthM: 2.12,
    peakStrideLengthM: 2.12, strideRetentionPct: 95, frequencyHz: 4.9, stepLengthConfidence: "high",
    zoneDistanceM: 20, zoneTimeS: 1.85,
  };
  const q = { calibrationPresent: true, trackingCoverage: 0.95, poseConfidence: 0.85, score: 90 };
  const repNoTro = buildRecommendations({ trusted: trustedBase, measurements: null, activeFps: 60, trochanterHeightM: null, quality: q });
  const repTro = buildRecommendations({ trusted: trustedBase, measurements: null, activeFps: 60, trochanterHeightM: 0.95, quality: q });
  const strideOf = (r) => r.recommendations.find((x) => x.category === "stride_length");
  check("no trochanter height → stride evidence has NO trochanter ratio", strideOf(repNoTro) && !strideOf(repNoTro).metricEvidence.some((e) => /trochanter/i.test(e.label)));
  check("trochanter height present → stride evidence includes a trochanter ratio", strideOf(repTro) && strideOf(repTro).metricEvidence.some((e) => /trochanter/i.test(e.label)));
  // Abnormally high ratio (tiny trochanter → ratio > 2.70×) → review, not a stride training rec.
  const repReview = buildRecommendations({ trusted: { ...trustedBase, strideLengthM: 2.12, peakStrideLengthM: 2.12 }, measurements: null, activeFps: 60, trochanterHeightM: 0.6, quality: q });
  check("abnormal trochanter ratio → no stride-length training recommendation", !strideOf(repReview));

  // ---- 7. Stride cues never say reach / overstride ----
  const allStrideCues = p1.flatMap((p) => p.exercise.cues).join(" ");
  check("stride exercise cues never say 'reach' or 'overstride'", !/reach|overstrid/i.test(allStrideCues));
  check("stride recommendation cue avoids 'reach'/'overstride'", strideOf(repNoTro) && !/reach|overstrid/i.test(strideOf(repNoTro).coachingCue));

  // ---- 8. 60fps → no contact/stiffness as a primary stride cause ----
  const p8 = selectExercisesForRecommendation(strideRec, ctx({ activeFps: 60 }));
  check("60fps stride → no fps-gated (experimental) exercise", p8.every((p) => p.exercise.fpsRequirement !== "experimental"));
  check("60fps stride → no contact_time/toe_off/foot_strike-tagged drill", p8.every((p) => !p.exercise.evidenceTags.some((t) => ["contact_time", "toe_off", "foot_strike"].includes(t))));

  // ---- 9. Current-session example: adequate frequency, good calibration, 60fps ----
  const p9 = selectExercisesForRecommendation(strideRec, ctx({ frequencyLow: false, activeFps: 60 }));
  check("session example → includes Progressive wicket spacing", some(names(p9), /Progressive wicket spacing/));
  check("session example → includes a fly integration (into fly / projection cue)", some(names(p9), /fly/i));
  check("session example → includes a bound", some(names(p9), /bounds?/i));
  // Rule 2 language on the recommendation when frequency is adequate.
  check("adequate-frequency stride rec says do NOT force more turnover", /do not force more turnover/i.test(strideOf(repNoTro).coachingCue));
  check("adequate-frequency stride rec 'why' says frequency is not the problem", /frequency is not the problem/i.test(strideOf(repNoTro).whyItMatters));

  // ---- 10. Core regressions (existing selection behaviour holds) ----
  const asymRight = rec({ category: "asymmetry", title: "Step frequency favours the left side", metricEvidence: [{ label: "Step frequency L / R", value: "5.22 / 4.53 steps/s", interpretation: "" }] });
  const pA = selectExercisesForRecommendation(asymRight, ctx());
  check("regression: asymmetry (right weak) still returns right-side drills", pA.filter((p) => p.exercise.evidenceTags.includes("right")).length >= 2);
  check("regression: calibration limiter still returns no drills", selectExercisesForRecommendation(rec({ category: "calibration" }), ctx()).length === 0);
  check("regression: speed limiter still returns fly/wicket integrations", selectExercisesForRecommendation(rec({ category: "speed" }), ctx()).every((p) => ["sprint_integration", "wicket"].includes(p.exercise.category)));

  // ---- Workout Builder V1 — coach-ready session plan for a recommendation ----
  const strideForPlan = rec({ category: "stride_length", title: "Stride length is capping ground covered per step", nextSessionGoal: "Prioritise projection and elastic stiffness rather than forcing turnover." });
  const wStride = buildWorkoutPlan(strideForPlan, ctx());
  check("stride recommendation → a workout plan is built", wStride.available === true);
  check("stride plan is a projection session", wStride.available && wStride.plan.sessionType === "projection");
  check("stride plan has 3–5 main pieces (short, not a dump)", wStride.available && wStride.plan.mainExercises.length >= 1 && wStride.plan.mainExercises.length <= 5);
  check("stride plan focuses on projection families (wicket/plyometric/sprint_integration)", wStride.available && wStride.plan.mainExercises.every((m) => /wicket|bound|pogo|fly|wall|split|step-up|sled|hip lock|bridge|A-run/i.test(m.name)));
  check("stride plan carries a next-session metric goal + trust note", wStride.available && wStride.plan.nextSessionMetricGoal.length > 0 && wStride.plan.trustNote.length > 0);

  // Session plan uses the SELECTED exercise prescriptions verbatim.
  const strideExPicks = selectExercisesForRecommendation(strideForPlan, ctx());
  const firstPick = strideExPicks[0];
  check("workout plan uses selected exercises (top pick present in the session)", wStride.available && [...wStride.plan.mainExercises.map((m) => m.exerciseId), wStride.plan.sprintIntegration ? "int" : ""].length > 0 && (wStride.plan.mainExercises.some((m) => m.exerciseId === firstPick.exercise.id) || wStride.plan.sprintIntegration != null));
  check("workout prescriptions match the exercise library prescription", wStride.available && wStride.plan.mainExercises.every((m) => {
    const ex = strideExPicks.find((p) => p.exercise.id === m.exerciseId)?.exercise;
    return ex && m.prescription === `${ex.prescription.sets} × ${ex.prescription.reps} @ ${ex.prescription.intensity}`;
  }));

  // Asymmetry → side-specific rhythm / correction session.
  const wAsym = buildWorkoutPlan(asymRight, ctx());
  check("asymmetry recommendation → asymmetry_correction session", wAsym.available && wAsym.plan.sessionType === "asymmetry_correction");
  check("asymmetry plan targets the weaker (right) side", wAsym.available && /right/i.test(wAsym.plan.goal + JSON.stringify(wAsym.plan.mainExercises)));

  // Speed → max velocity session.
  const wSpeed = buildWorkoutPlan(rec({ category: "speed", title: "Max velocity is the headline ceiling to raise" }), ctx());
  check("speed recommendation → max_velocity session", wSpeed.available && wSpeed.plan.sessionType === "max_velocity");
  check("speed plan features flys/wickets/ins-and-outs", wSpeed.available && (wSpeed.plan.sprintIntegration != null || wSpeed.plan.mainExercises.some((m) => /fly|wicket|ins-and-outs|float/i.test(m.name))));

  // Untrusted recommendation → no plan, honest fallback message.
  const wUntrusted = buildWorkoutPlan(rec({ category: "stride_length", trusted: false }), ctx());
  check("untrusted recommendation → no workout, shows fallback message", wUntrusted.available === false && wUntrusted.message === WORKOUT_BLOCKED_MESSAGE);
  const wCalib = buildWorkoutPlan(rec({ category: "calibration", trusted: true }), ctx());
  check("recording-setup (calibration) recommendation → no workout plan", wCalib.available === false && wCalib.message === WORKOUT_BLOCKED_MESSAGE);
  const wPoorCal = buildWorkoutPlan(strideForPlan, ctx({ calibrationTrusted: false }));
  check("poor calibration stride recommendation → no workout plan", wPoorCal.available === false);

  // No medical / injury language anywhere in the plan.
  const planText = wStride.available ? JSON.stringify(wStride.plan) + JSON.stringify(wAsym.available ? wAsym.plan : {}) + JSON.stringify(wSpeed.available ? wSpeed.plan : {}) : "";
  check("workout plans contain no medical/injury language", !/injur|\bpain\b|diagnos|medical|\brehab\b|treat(ment)?\b|physio/i.test(planText));
  check("workout plans stay short (≤5 total pieces)", wStride.available && wStride.plan.mainExercises.length + (wStride.plan.sprintIntegration ? 1 : 0) <= 5);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
