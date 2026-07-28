/**
 * Exercise selection — the pure function that maps a detected limiting factor +
 * measured evidence onto the FEW highest-impact drills from {@link EXERCISES}. No
 * metric math, no I/O, no medical/injury logic: it only ranks catalogue entries.
 *
 * AVA is a coach, not an exercise library. It returns AT MOST THREE interventions
 * and deliberately deduplicates by training *stimulus* — one drill per distinct
 * stimulus family (spacing/rhythm, sprint transfer, power/stiffness, strength,
 * pelvis control) — so the athlete sees, e.g., a wicket + a fly + a bound rather
 * than five near-identical wickets. Often only two families are worth showing.
 *
 * Trust & FPS gating, side handling, and per-limiter priorities are all applied here
 * so the UI stays a dumb renderer.
 */

import type { Recommendation, Severity, Confidence } from "./recommendations";
import {
  EXERCISES,
  type Exercise,
  type ExerciseCategory,
  type ExerciseLevel,
} from "./exerciseLibrary";

export type Side = "left" | "right";

/** Session + recommendation context the selector reads. */
export interface ExerciseSelectionContext {
  activeFps: number | null;
  poseConfidence?: number | null;
  calibrationTrusted?: boolean;
  trackingTrusted?: boolean;
  /** A known persistent side bias for the athlete, if any. */
  sideBias?: Side | null;
  /** The weaker side for THIS recommendation (overrides inference from evidence). */
  weakSide?: Side | null;
  severity?: Severity;
  confidence?: Confidence;
  metricEvidenceLabels?: string[];
  /** Step frequency is below target too (so include one rhythm drill, projection first). */
  frequencyLow?: boolean;
}

/** One chosen exercise with the reasoning AVA used to pick it. */
export interface SelectedExercise {
  exercise: Exercise;
  /** Match score (higher = stronger fit); exposed so the UI/tests can see the order. */
  score: number;
  /** The side this drill is applied to, when relevant. */
  appliedSide: Side | null;
  /** One-line "why AVA selected it", grounded in the evidence. */
  why: string;
}

/** Never surface more than three interventions for one limiter (2 is preferred). */
const MAX_RESULTS = 3;

/**
 * Training-stimulus families. Two drills in the same family are treated as
 * redundant (same objective / movement pattern / progression role) and only the
 * higher-ranked one is kept — this is the deduplication that prevents "five
 * near-identical wickets". A third pick is only ever added when it introduces a
 * genuinely different stimulus (a different family).
 */
export type StimulusFamily =
  | "rhythm_spacing"
  | "sprint_transfer"
  | "power_stiffness"
  | "strength"
  | "pelvis_control"
  | "turnover_return";

const STIMULUS_FAMILY: Record<ExerciseCategory, StimulusFamily> = {
  wicket: "rhythm_spacing",
  march: "rhythm_spacing",
  sprint_integration: "sprint_transfer",
  plyometric: "power_stiffness",
  strength: "strength",
  core_pelvis: "pelvis_control",
  skip: "turnover_return",
  dribble: "turnover_return",
  wall_drill: "turnover_return",
  hip_flexor: "turnover_return",
  leg_reset: "turnover_return",
};

export function stimulusFamily(ex: Exercise): StimulusFamily {
  return STIMULUS_FAMILY[ex.category];
}

/** Per-limiter preferred exercise families (rules 5–8), best first. */
const PREFERRED: Record<Recommendation["category"], ExerciseCategory[]> = {
  frequency: ["dribble", "skip", "leg_reset", "wall_drill", "wicket", "hip_flexor", "march", "sprint_integration"],
  // Stride length is about horizontal projection, front-side mechanics, elastic
  // ground projection, posture/hip height, and covering ground WITHOUT overstriding —
  // so wickets, fly integration, bounding, and projection-biased skip/strength/core
  // lead; pure turnover work is downranked below.
  stride_length: ["wicket", "sprint_integration", "plyometric", "skip", "strength", "core_pelvis"],
  speed: ["sprint_integration", "wicket"],
  rhythm: ["wicket", "sprint_integration", "dribble", "skip", "march", "core_pelvis"],
  asymmetry: ["skip", "dribble", "wall_drill", "leg_reset", "wicket", "hip_flexor", "strength", "core_pelvis", "plyometric"],
  calibration: [],
  tracking: [],
  experimental: [],
};

const LEVEL_ORDER: ExerciseLevel[] = ["beginner", "intermediate", "advanced", "elite"];

/** Clean, human drill-type noun per family, for the "why AVA selected it" line. */
const DRILL_TYPE: Record<ExerciseCategory, string> = {
  march: "posture drill",
  skip: "turnover drill",
  dribble: "ground-return drill",
  wall_drill: "reset drill",
  hip_flexor: "knee-drive drill",
  leg_reset: "leg-reset drill",
  wicket: "rhythm drill",
  plyometric: "stiffness drill",
  strength: "strength exercise",
  core_pelvis: "pelvis-control drill",
  sprint_integration: "speed drill",
};

/** The catalogue categories that never take training drills. */
const NON_TRAINING = new Set<Recommendation["category"]>(["calibration", "tracking", "experimental"]);

/** Intrinsic side of a side-specific drill, or null when it applies to either side. */
function exerciseSide(ex: Exercise): Side | null {
  if (ex.evidenceTags.includes("right")) return "right";
  if (ex.evidenceTags.includes("left")) return "left";
  return null;
}

/** Percent by which the weaker side trails the stronger, parsed from L/R evidence. */
function asymmetryPct(rec: Recommendation): { weak: Side; pct: number } | null {
  for (const e of rec.metricEvidence) {
    const m = e.value.match(/([\d.]+)\s*\/\s*([\d.]+)/);
    if (m) {
      const left = Number(m[1]);
      const right = Number(m[2]);
      const hi = Math.max(left, right);
      if (hi > 0 && left !== right) {
        return { weak: right < left ? "right" : "left", pct: Math.round((Math.abs(left - right) / hi) * 100) };
      }
    }
  }
  return null;
}

/** The weak side to target for this recommendation. */
function resolveWeakSide(rec: Recommendation, ctx: ExerciseSelectionContext): Side | null {
  if (ctx.weakSide) return ctx.weakSide;
  if (rec.category === "asymmetry") {
    const a = asymmetryPct(rec);
    if (a) return a.weak;
  }
  return ctx.sideBias ?? null;
}

/** Target training level for scoring proximity, biased by severity/confidence. */
function targetLevel(ctx: ExerciseSelectionContext): ExerciseLevel {
  if (ctx.confidence === "low") return "beginner";
  if (ctx.severity === "high") return "advanced";
  return "intermediate";
}

function buildWhy(
  rec: Recommendation,
  ex: Exercise,
  appliedSide: Side | null,
  asym: { weak: Side; pct: number } | null,
): string {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (rec.category === "asymmetry" && asym) {
    const metric = /frequency|turnover/i.test(rec.title) || rec.metricEvidence.some((e) => /steps\/s/.test(e.value))
      ? "turnover"
      : "step length";
    const verb = metric === "turnover" ? "slower" : "shorter";
    const kind = DRILL_TYPE[ex.category];
    return `${cap(asym.weak)} ${metric} is ${asym.pct}% ${verb} than the ${asym.weak === "right" ? "left" : "right"}, so AVA selected a side-specific ${kind} for the ${asym.weak} leg.`;
  }
  // Each intervention gets a SPECIFIC reason tied to its training stimulus, so the
  // cards never repeat the same "…so AVA chose a projection/power drill" boilerplate.
  const fam = stimulusFamily(ex);
  const byLimiter: Partial<Record<Recommendation["category"], Partial<Record<StimulusFamily, string>>>> = {
    stride_length: {
      rhythm_spacing: "Builds projected stride length without forcing turnover",
      sprint_transfer: "Transfers the projection cue into near-maximal sprinting",
      power_stiffness: "Develops horizontal force and stiffness per contact",
      strength: "Builds the force base needed to hold a longer step",
      pelvis_control: "Stabilises the pelvis so each step can extend fully",
      turnover_return: "Keeps ground return sharp so longer steps stay quick",
    },
    frequency: {
      turnover_return: "Sharpens ground return so steps come back faster",
      rhythm_spacing: "Grooves a quicker, repeatable turnover rhythm",
      sprint_transfer: "Carries the faster cadence into full-speed running",
      power_stiffness: "Cuts ground contact time to lift turnover",
      pelvis_control: "Stabilises the pelvis so the legs can cycle faster",
      strength: "Builds the strength to recover the swing leg quickly",
    },
    speed: {
      sprint_transfer: "Exposes the athlete to genuine top-end speed",
      rhythm_spacing: "Holds sprint rhythm at the velocity ceiling",
      power_stiffness: "Adds the elastic power that raises top speed",
    },
    rhythm: {
      rhythm_spacing: "Grooves an even, repeatable velocity rhythm",
      sprint_transfer: "Practises holding that rhythm at full speed",
      turnover_return: "Smooths ground return for a steadier rhythm",
    },
  };
  const specific =
    byLimiter[rec.category]?.[fam] ??
    // Fallback stays specific to THIS drill (its own "what it fixes"), never generic.
    (ex.fixes[0] ? `Targets ${ex.fixes[0].toLowerCase()}` : "Directly supports the detected limiter");
  return appliedSide ? `${specific} (apply to the ${appliedSide} leg).` : `${specific}.`;
}

/**
 * Select 3–5 exercises for a recommendation. Returns `[]` for calibration/tracking/
 * experimental limiters (rule 9 — recommend recording setup, not drills). Pure.
 */
export function selectExercisesForRecommendation(
  rec: Recommendation,
  ctx: ExerciseSelectionContext,
): SelectedExercise[] {
  // Rule 9: recording-quality / experimental limiters get no training drills.
  if (NON_TRAINING.has(rec.category)) return [];

  // Stride-length rule 4: with poor calibration AVA must not hand out strong
  // stride-length prescriptions — the recording-quality recommendation leads instead.
  if (rec.category === "stride_length" && ctx.calibrationTrusted === false) return [];

  const fpsLimited = ctx.activeFps == null || ctx.activeFps < 120;
  const weak = resolveWeakSide(rec, ctx);
  const asym = rec.category === "asymmetry" ? asymmetryPct(rec) : null;
  const preferred = PREFERRED[rec.category] ?? [];
  const level = targetLevel(ctx);

  const scored: SelectedExercise[] = [];
  for (const ex of EXERCISES) {
    // Must be a valid choice for this limiter.
    if (!ex.limiterCategories.includes(rec.category)) continue;

    // Rule 1: trusted recommendation → only trusted exercises. Otherwise exclude
    // experimental exercises but allow estimates.
    if (rec.trusted) {
      if (ex.trust !== "trusted") continue;
    } else if (ex.trust === "experimental") {
      continue;
    }

    // Rule 2: below 120 fps, drop exercises whose justification needs high-FPS timing
    // (contact time, flight, stiffness, toe-off, foot-strike, joint timing).
    if (fpsLimited && ex.fpsRequirement === "experimental") continue;

    // ── Side handling (rules 3 & 4) ──
    const exSide = exerciseSide(ex);
    let sideScore = 0;
    let appliedSide: Side | null = null;
    if (ex.sideSpecific) {
      if (weak) {
        if (exSide == null) {
          sideScore = 5; // side-agnostic single-leg drill applied to the weak side
          appliedSide = weak;
        } else if (exSide === weak) {
          sideScore = 9; // inherent side matches the weak side — strongest fit
          appliedSide = weak;
        } else {
          continue; // wrong inherent side — never recommend it
        }
      } else if (exSide != null) {
        continue; // a fixed-side drill with no side issue would be misleading
      }
    }

    // ── Category-priority score (rules 5–8) ──
    const prefIdx = preferred.indexOf(ex.category);
    const prefScore = prefIdx >= 0 ? Math.max(1, 8 - prefIdx) : 0;

    // ── Trust + level proximity ──
    const trustScore = ex.trust === "trusted" ? 3 : ex.trust === "estimate" ? 1 : 0;
    const levelScore = 3 - Math.abs(LEVEL_ORDER.indexOf(ex.level) - LEVEL_ORDER.indexOf(level));

    // ── Stride-length biasing (rule 1): reward projection / spacing intent, and
    // downrank pure turnover drills so the athlete covers more ground per step
    // rather than just turning over faster. Side-specific asymmetry drills are
    // already excluded above when there is no L/R asymmetry.
    let strideBias = 0;
    if (rec.category === "stride_length") {
      if (ex.evidenceTags.includes("projection")) strideBias += 6;
      else if (ex.evidenceTags.includes("spacing")) strideBias += 3;
      if (ex.evidenceTags.includes("posture")) strideBias += 2;
      // Pure turnover/ground-return families are only ever secondary for stride length.
      if (ex.category === "dribble" || ex.category === "hip_flexor" || ex.category === "leg_reset") {
        strideBias -= 5;
      }
    }

    const score = prefScore * 2 + sideScore * 3 + trustScore + levelScore + strideBias;

    scored.push({ exercise: ex, score, appliedSide, why: buildWhy(rec, ex, appliedSide, asym) });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Deterministic tie-break: side-specific first, then name.
    if (a.exercise.sideSpecific !== b.exercise.sideSpecific) return a.exercise.sideSpecific ? -1 : 1;
    return a.exercise.name.localeCompare(b.exercise.name);
  });

  // Restrict to the limiter's curated preferred families first. This is what makes
  // "show a third only when meaningfully distinct" fall out naturally: a limiter
  // like speed lists only two relevant families (sprint transfer + rhythm), so it
  // surfaces two — it does not pad to three with a marginally-related drill.
  const relevant = scored.filter((s) => preferred.includes(s.exercise.category));
  const pool = relevant.length > 0 ? relevant : scored;

  // Deduplicate, capped at three, deterministically (pool is already score-sorted).
  const picks: SelectedExercise[] = [];
  if (rec.category === "asymmetry") {
    // For an L/R imbalance, different movement patterns applied to the WEAK leg are
    // distinct interventions, not redundant — so only collapse literal same-category
    // variants (never two of the same drill), and still cap at three.
    const seenCategory = new Set<ExerciseCategory>();
    for (const s of pool) {
      if (picks.length >= MAX_RESULTS) break;
      if (seenCategory.has(s.exercise.category)) continue;
      seenCategory.add(s.exercise.category);
      picks.push(s);
    }
  } else {
    // Keep only the highest-ranked drill from each stimulus family: no two picks
    // share the same objective/movement/stimulus (e.g. never two wickets), and a
    // third appears ONLY as a genuinely different stimulus.
    const seenFamily = new Set<StimulusFamily>();
    for (const s of pool) {
      if (picks.length >= MAX_RESULTS) break;
      const fam = stimulusFamily(s.exercise);
      if (seenFamily.has(fam)) continue;
      seenFamily.add(fam);
      picks.push(s);
    }
  }

  // Stride-length rule 3: when frequency is ALSO low, keep the projection lead but
  // ensure a rhythm/turnover drill is present — without exceeding the 3-drill cap or
  // displacing the lead. (Family diversity usually already surfaces one.)
  if (rec.category === "stride_length" && ctx.frequencyLow && picks.length > 0) {
    const isRhythm = (p: SelectedExercise) =>
      p.exercise.limiterCategories.includes("rhythm") ||
      p.exercise.limiterCategories.includes("frequency");
    if (!picks.some(isRhythm)) {
      const rhythmPick = scored.find(isRhythm);
      // Swap the lowest-ranked pick for a rhythm drill, preserving the projection lead.
      if (rhythmPick) picks.splice(Math.max(1, picks.length - 1), 1, rhythmPick);
    }
  }

  return picks;
}
