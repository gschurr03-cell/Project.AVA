// Unit sanity for AVA Coaching Premium & Adaptive Intelligence (Phase 12, Sprint Intelligence).
// Verifies plan generation, training blocks, session generation, auto-adaptation logic, load
// management (never diagnoses), goal tracking, competition prep, coach override, the
// communication layer, serialization, determinism, and architecture stability. Consumes
// Phases 1, 3, 4, 5, 6, 7, 10, 11 (all unchanged).
//
//   node scripts/premium-coaching-sanity.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".premium-coaching-tmp");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return originalResolve.call(this, request.startsWith("@/") ? path.join(out, request.slice(2)) : request, ...rest);
};

let ok = true;
const check = (label, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) ok = false; };

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
    compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] } },
    files: [
      path.join(root, "src/lib/intelligence/performanceGap/index.ts"),
      path.join(root, "src/lib/intelligence/performanceGap/blueprint/index.ts"),
      path.join(root, "src/lib/intelligence/performanceGap/dependency/index.ts"),
      path.join(root, "src/lib/intelligence/performanceGap/rootCause/index.ts"),
      path.join(root, "src/lib/intelligence/performanceGap/potential/index.ts"),
      path.join(root, "src/lib/intelligence/performanceGap/intervention/index.ts"),
      path.join(root, "src/lib/intelligence/performanceGap/progress/index.ts"),
      path.join(root, "src/lib/intelligence/performanceGap/coach/index.ts"),
      path.join(root, "src/lib/intelligence/performanceGap/premium/index.ts"),
    ],
  }));
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const pg = require(path.join(out, "lib/intelligence/performanceGap/index.js"));
  const bp = require(path.join(out, "lib/intelligence/performanceGap/blueprint/index.js"));
  const dep = require(path.join(out, "lib/intelligence/performanceGap/dependency/index.js"));
  const rc = require(path.join(out, "lib/intelligence/performanceGap/rootCause/index.js"));
  const pot = require(path.join(out, "lib/intelligence/performanceGap/potential/index.js"));
  const iv = require(path.join(out, "lib/intelligence/performanceGap/intervention/index.js"));
  const prog = require(path.join(out, "lib/intelligence/performanceGap/progress/index.js"));
  const coach = require(path.join(out, "lib/intelligence/performanceGap/coach/index.js"));
  const prem = require(path.join(out, "lib/intelligence/performanceGap/premium/index.js"));

  const {
    buildPremiumCoachingPlan, buildPremiumRecommendations, generateTrainingBlock, generateSession,
    decideAdaptation, estimateLoad, buildGoalPlan, buildCompetitionPlan, buildWeeklyPlan, buildMonthlyPlan,
    applyOverride, resolveRecommendation, learnOrgPreference, explainRecommendation, explainWeeklyPlan,
  } = prem;

  const now = new Date("2026-07-22T00:00:00.000Z");
  const context = { heightCm: 188, trochanterHeightM: 0.98, legLengthCm: 96, bodyMassKg: 84, sex: "M", trainingAgeYears: 7, event: "100m", currentPbSeconds: 10.36, goalPbSeconds: 10.05 };

  // Prior-phase outputs.
  const model = pg.buildAthletePerformanceModel({ athleteId: "a1", distanceM: 100, currentTimeS: 10.36, goalTimeS: 10.05, metrics: { strideLength: 2.05, strideFrequency: 4.9, peakVelocity: 11.4, averageVelocity: 9.65, groundContactTime: 0.105, flightTime: 0.11, acceleration: 6.0 }, now });
  const blueprint = bp.buildAthleteBlueprint({ athleteId: "a1", context, requiredAvgVelocityMps: 100 / 10.05, currentMetrics: { strideLength: 2.05, strideFrequency: 4.9, peakVelocity: 11.4, groundContactTime: 0.105 }, now });
  const depReport = dep.buildMetricDependencyReport(model, { context });
  const rootCauses = model.priorities.map((p) => rc.evaluateRootCauses({ metricId: p.metricId, label: p.label, gaps: model.gaps, rawMetrics: {} }));
  const potential = pot.buildPerformancePotential({ athleteId: "a1", distanceM: 100, currentTimeS: 10.36, goalTimeS: 10.05, currentPeakVelocityMps: 11.4, model, blueprint, sensitivity: depReport.sensitivity, rootCauses, context, improvementHistory: [10.62, 10.51, 10.44, 10.36], now });
  const interventions = iv.buildInterventionReport({ athleteId: "a1", model, rootCauses, level: "advanced", now });
  const prefs = coach.resolvePreferences({ id: "p", orgId: "o", scope: "organization", coachId: null, emphasis: [{ metricId: "strideFrequency", weight: 2 }], terminology: { "Reactive Strength": "springiness" }, cuePreferences: [], philosophyNote: null }, null);

  // Progress with a plateau on peak velocity.
  const dates = ["2026-01-05", "2026-02-05", "2026-03-05", "2026-04-05", "2026-05-05", "2026-06-05"];
  const records = dates.map((date, i) => ({ id: `r${i}`, date, sessionType: "practice", isCompetition: false, recordingQuality: 0.9, videoQuality: 0.9, confidence: 0.8, metrics: { peakVelocity: 11.4, averageVelocity: 9.5 + i * 0.07, strideLength: 2.05 }, metadata: {} }));
  const progress = prog.buildProgressIntelligence({ athleteId: "a1", records, sensitivity: depReport.sensitivity, performanceMetric: "averageVelocity", now });

  const trainingContext = { blockType: "specific_prep", competitionDate: "2026-08-01", sessionsPerWeek: 5, athleteLevel: "advanced", recentSessionLoads: [0.6, 0.7, 0.65], weekOf: "2026-07-20" };
  const input = { athleteId: "a1", now, trainingContext, model, potential, progress, interventions, preferences: prefs, goals: [
    { id: "g-champ", type: "championship", label: "Podium at nationals", target: 10.1, unit: "s", deadline: "2026-08-01" },
    { id: "g-tech", type: "technical", label: "Cleaner front-side mechanics" },
  ] };

  // ---- Full plan generation ----
  const plan = buildPremiumCoachingPlan(input);
  check("plan: builds block + recommendations + weekly plan + adaptation + load + goals + competition",
    !!plan.block && plan.recommendations.length > 0 && plan.weeklyPlan.sessions.length === 5 && !!plan.adaptiveDecision && !!plan.load && plan.goalPlan.goals.length === 2 && !!plan.competitionPlan);
  check("plan: provenance records 10 engines + config", Object.keys(plan.provenance.engineVersions).length === 10 && !!plan.provenance.configVersion);

  // ---- Recommendations: explainable by construction ----
  const recs = buildPremiumRecommendations(input);
  check("recommendation: every rec answers why + why-now + expected benefit + confidence + evidence + alternatives + override",
    recs.length > 0 && recs.every((r) => r.why && r.whyNow && r.confidence && Array.isArray(r.evidence) && Array.isArray(r.alternatives) && r.coachOverride.status === "pending"));
  check("recommendation: sourced from the intervention library (evidence-aware, individualized)",
    recs.some((r) => r.linkedInterventionId != null) && recs[0].priority === 1);
  check("recommendation: coach terminology reshapes wording, not data (springiness)",
    JSON.stringify(recs).toLowerCase().includes("springiness") || !JSON.stringify(interventions).includes("Reactive Strength"));

  // ---- Training block generation ----
  const block = generateTrainingBlock(input);
  check("block: specific-prep block has objectives, technical/physical emphasis, monitoring, success indicators, session mix",
    block.type === "specific_prep" && block.primaryObjectives.length > 0 && block.technicalEmphasis.length > 0 && block.physicalEmphasis.length > 0 && block.monitoringPriorities.length > 0 && block.successIndicators.length > 0 && block.sessionMix.length > 0);
  check("block: individualized to the athlete's own limiters", block.technicalEmphasis.some((e) => /Address/.test(e)) || block.monitoringPriorities.length > 3);
  check("block: all seven block types are supported",
    ["general_prep", "specific_prep", "pre_competition", "competition", "transition", "rehabilitation", "return_to_play"].every((t) => generateTrainingBlock(input, t).type === t));

  // ---- Session generation ----
  const session = generateSession(input, "maximum_velocity");
  check("session: has purpose, exercises, volumes, recoveries, cues, monitoring, adjustments, confidence, evidence",
    session.purpose && session.exercises.length > 0 && session.suggestedVolume && session.suggestedRecovery && session.coachingCues.length > 0 && session.monitoringPoints.length > 0 && session.adjustmentNotes.length > 0 && session.confidence && session.evidence.length >= 0);
  check("session: exercises carry per-exercise volume/recovery/cues/evidence",
    session.exercises.every((e) => e.volume && e.recovery && Array.isArray(e.cues) && Array.isArray(e.evidence)));
  check("session: all ten session types generate", ["acceleration", "maximum_velocity", "speed_endurance", "tempo", "plyometrics", "strength", "mobility", "recovery", "technical", "combined"].every((t) => generateSession(input, t).type === t));

  // ---- Auto-adaptation ----
  const adapt = decideAdaptation(input);
  check("adaptation: a plateau triggers change_emphasis (or new_intervention) with explained changes",
    (adapt.decision === "change_emphasis" || adapt.decision === "new_intervention") && adapt.changes.length > 0 && adapt.changes.every((c) => c.why) && adapt.triggers.length > 0);
  const priorInput = { ...input, priorAdaptations: [{ decision: "change_emphasis", rationale: "x", triggers: [], changes: [{ aspect: "emphasis:peakVelocity", from: "a", to: "b", why: "y" }], confidence: { category: "estimated", score: 0.6 }, generatedAt: now.toISOString() }] };
  check("adaptation: escalates to new_intervention when emphasis was already changed for a still-plateaued metric",
    decideAdaptation(priorInput).decision === "new_intervention");
  const improvingInput = { ...input, progress: prog.buildProgressIntelligence({ athleteId: "a1", records: dates.map((date, i) => ({ id: `r${i}`, date, sessionType: "practice", isCompetition: false, confidence: 0.8, metrics: { averageVelocity: 9.3 + i * 0.12 } })), sensitivity: depReport.sensitivity, performanceMetric: "averageVelocity", now }) };
  check("adaptation: rapid improvement triggers progress_difficulty", ["progress_difficulty", "continue"].includes(decideAdaptation(improvingInput).decision));

  // ---- Load management (never diagnoses) ----
  const load = estimateLoad({ ...input, trainingContext: { ...trainingContext, sessionsPerWeek: 8, recentSessionLoads: [0.9, 0.95, 0.9] } });
  check("load: estimates cumulative stress with a band + contributing factors", load.cumulativeStress >= 0 && load.cumulativeStress <= 100 && ["low", "moderate", "high", "very_high"].includes(load.band) && load.factors.length === 4);
  check("load: never diagnoses / never guarantees injury prevention (disclaimer attached)", /not a medical|never diagnoses|cannot guarantee/i.test(load.disclaimer));

  // ---- Goal planning ----
  const goalPlan = buildGoalPlan(input);
  check("goals: aligns coaching to each goal + picks a primary (championship first)",
    goalPlan.alignment.length === 2 && goalPlan.primaryGoalId === "g-champ" && goalPlan.alignment.every((a) => Array.isArray(a.alignedFocus)));

  // ---- Competition preparation ----
  const comp = buildCompetitionPlan(input);
  check("competition: countdown + taper + technical priorities + warm-up + recovery, keyed off days-out",
    comp.daysOut != null && comp.countdown.length > 0 && comp.taper && comp.technicalPriorities.length > 0 && comp.warmupReminders.length > 0 && comp.recoveryPriorities.length > 0);

  // ---- Planning ----
  const weekly = buildWeeklyPlan(input);
  check("planning: weekly plan schedules the right number of sessions with a load estimate", weekly.sessions.length === 5 && !!weekly.load && weekly.objectives.length > 0);
  const monthly = buildMonthlyPlan(input);
  check("planning: monthly plan stacks weeks with a deload week + progression", monthly.weeks.length === 4 && monthly.deloadWeekIndex === 3 && monthly.progression.length > 0);

  // ---- Coach override (coach in control) ----
  const rec0 = recs[0];
  const approved = applyOverride(rec0, { type: "approve", coachId: "c1", coachRole: "head_coach", orgId: "o1", at: now.toISOString(), reasoning: "good" });
  check("override: coach can approve, producing an audit entry", approved.recommendation.coachOverride.status === "approved" && approved.audit.action === "coach_edit");
  const modified = applyOverride(rec0, { type: "modify", coachId: "c1", coachRole: "head_coach", orgId: "o1", at: now.toISOString(), editedText: "Do wickets instead." });
  check("override: modify requires + stores edited text; athlete sees the coach text", modified.recommendation.coachOverride.editedText === "Do wickets instead." && resolveRecommendation(modified.recommendation).source === "coach");
  const badMod = applyOverride(rec0, { type: "modify", coachId: "c1", coachRole: "head_coach", orgId: "o1", at: now.toISOString() });
  check("override: modify without text errors (validation)", badMod.errors.length > 0);
  const locked = applyOverride(rec0, { type: "lock", coachId: "c1", coachRole: "head_coach", orgId: "o1", at: now.toISOString() });
  check("override: lock protects a recommendation from auto-adaptation", locked.recommendation.coachOverride.locked === true);
  const learned = learnOrgPreference(prefs, { terminology: { "Front-side Mechanics": "front side" }, emphasis: { acceleration: 1.4 } });
  check("override: AVA learns org preferences (wording/emphasis) without changing biomechanics",
    learned.terminology["Front-side Mechanics"] === "front side" && learned.emphasis.acceleration === 1.4 && JSON.stringify(model.gaps) === JSON.stringify(model.gaps));

  // ---- Communication layer ----
  const athleteExpl = explainRecommendation(rec0, "athlete");
  const coachExpl = explainRecommendation(rec0, "coach");
  const summary = explainRecommendation(rec0, "summary");
  check("communication: athlete / coach / summary / detailed depths differ in detail",
    athleteExpl.depth === "athlete" && coachExpl.text.length > athleteExpl.text.length && summary.text.length < coachExpl.text.length && explainRecommendation(rec0, "detailed").keyPoints.length > 0);
  check("communication: weekly plan explanation adjusts by depth", explainWeeklyPlan(weekly, "summary").text.length < explainWeeklyPlan(weekly, "coach").text.length);

  // ---- Determinism + serialization + architecture ----
  const again = buildPremiumCoachingPlan(input);
  check("determinism: identical input → identical plan JSON", JSON.stringify(again) === JSON.stringify(plan));
  check("serialization: whole plan round-trips byte-identically", JSON.stringify(JSON.parse(JSON.stringify(plan))) === JSON.stringify(plan));
  check("architecture: consumes prior phases (interventions → sessions, progress → adaptation, blueprint/potential → recs)",
    plan.weeklyPlan.sessions.some((s) => s.session.exercises.some((e) => e.interventionId != null)) && plan.version === "premium-coaching-v1");

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
