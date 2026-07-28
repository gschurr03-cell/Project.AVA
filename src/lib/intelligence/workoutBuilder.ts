/**
 * Recommendation Workout Builder V1 — turn AVA's top trusted recommendation + its
 * selected exercises into a short, coach-ready session plan (warm-up, 3–5 main
 * pieces, one sprint integration, a next-session metric goal, and a trust note).
 *
 * Pure & deterministic: no I/O, no metric math. It only arranges exercises the
 * selector already chose. No medical/injury language — `stopRule`s are technical
 * "quality over volume" cues, not treatment advice.
 */

import type { Recommendation } from "./recommendations";
import {
  selectExercisesForRecommendation,
  type ExerciseSelectionContext,
  type SelectedExercise,
  type Side,
} from "./exerciseSelection";
import type { Exercise, ExerciseCategory } from "./exerciseLibrary";

export type SessionType =
  | "technical"
  | "max_velocity"
  | "rhythm"
  | "projection"
  | "asymmetry_correction";

export interface WorkoutMainExercise {
  exerciseId: string;
  name: string;
  purpose: string;
  prescription: string;
  cue: string;
  rest: string;
  stopRule: string;
}

export interface WorkoutSprintIntegration {
  name: string;
  prescription: string;
  cue: string;
  rest: string;
}

export interface WorkoutPlan {
  id: string;
  title: string;
  basedOnRecommendationId: string;
  goal: string;
  sessionType: SessionType;
  estimatedDurationMin: number;
  warmupFocus: string[];
  mainExercises: WorkoutMainExercise[];
  sprintIntegration: WorkoutSprintIntegration | null;
  nextSessionMetricGoal: string;
  trustNote: string;
}

/** A plan, or an honest reason AVA won't build one for this recording. */
export type WorkoutResult =
  | { available: true; plan: WorkoutPlan }
  | { available: false; message: string };

export const WORKOUT_BLOCKED_MESSAGE = "Improve recording quality before AVA builds a full plan.";

/** Compact prescription line, e.g. "4–6 × 6–10 wickets @ 90–95% rhythm". */
function prescriptionLine(ex: Exercise): string {
  const p = ex.prescription;
  return `${p.sets} × ${p.reps} @ ${p.intensity}`;
}

const cap = (s: string) => (s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Technical "quality over volume" stop rule per family. Never medical. */
function stopRuleFor(category: ExerciseCategory): string {
  switch (category) {
    case "plyometric":
    case "sprint_integration":
    case "wicket":
      return "Stop when intent or rhythm drops — this is a quality piece, not a grind.";
    case "strength":
    case "core_pelvis":
      return "Stop if technique degrades; leave 1–2 reps in reserve.";
    default:
      return "End the set once posture or rhythm breaks down.";
  }
}

function purposeFor(ex: Exercise): string {
  return cap(ex.fixes.slice(0, 2).join(", ")) || "Support the target quality";
}

/** Session framing (type, goal, warm-up) for a limiter category. */
function sessionMeta(
  rec: Recommendation,
  weakSide: Side | null,
): { sessionType: SessionType; goal: string; warmupFocus: string[] } {
  switch (rec.category) {
    case "stride_length":
      return {
        sessionType: "projection",
        goal: "Cover more ground per step — build projection and elastic displacement without overstriding.",
        warmupFocus: [
          "General warm-up + hip mobility",
          "A-march → A-skip build-ups (tall posture)",
          "2–3 easy low-wicket runs to feel projection",
        ],
      };
    case "speed":
      return {
        sessionType: "max_velocity",
        goal: "Expose and hold true top-end speed with relaxed, front-side mechanics.",
        warmupFocus: [
          "Thorough warm-up + mobility",
          "A-skips and build-ups to ramp speed",
          "1–2 easy accelerations to prime max velocity",
        ],
      };
    case "frequency":
      return {
        sessionType: "rhythm",
        goal: "Sharpen turnover rhythm and ground return — quicker resets without shortening the stride.",
        warmupFocus: [
          "General warm-up + mobility",
          "Ankling and A-skips to prime turnover",
          "Dribble build-ups",
        ],
      };
    case "rhythm":
      return {
        sessionType: "rhythm",
        goal: "Groove one repeatable top-speed rhythm — stabilise the velocity signature.",
        warmupFocus: [
          "General warm-up + mobility",
          "Relaxed A-skips and dribbles",
          "Sub-max build-ups focusing on an even rhythm",
        ],
      };
    case "asymmetry":
      return {
        sessionType: "asymmetry_correction",
        goal: weakSide
          ? `Even out the ${weakSide} side — bring its rhythm and mechanics up to match the stronger side.`
          : "Even out the left/right difference — match the weaker side to the stronger.",
        warmupFocus: [
          "General warm-up + mobility",
          "Single-leg A-skips on both sides",
          weakSide ? `Light dribbles emphasising the ${weakSide} leg` : "Light side-by-side dribbles",
        ],
      };
    default:
      return { sessionType: "technical", goal: rec.title, warmupFocus: ["General warm-up + mobility"] };
  }
}

function trustNoteFor(rec: Recommendation): string {
  return rec.confidence === "high"
    ? "Trusted at this recording's frame rate and calibration."
    : "Directionally trusted — the calibrated metrics support this focus; confirm it with a clean 120fps+ capture.";
}

/**
 * Build a short session plan for a recommendation. Returns `{ available: false }` with
 * the recording-quality message when the recommendation is NOT trusted (de-trusted by
 * weak calibration/tracking, an FPS-gated directional limiter, or a recording-setup
 * limiter) or when no trusted exercises could be selected. Pure.
 */
export function buildWorkoutPlan(
  rec: Recommendation,
  ctx: ExerciseSelectionContext,
): WorkoutResult {
  // Requirement 2 & 3: only trusted training recommendations get a plan.
  if (!rec.trusted) return { available: false, message: WORKOUT_BLOCKED_MESSAGE };

  const picks: SelectedExercise[] = selectExercisesForRecommendation(rec, ctx);
  if (picks.length === 0) return { available: false, message: WORKOUT_BLOCKED_MESSAGE };

  // The weaker side (for asymmetry framing) comes from the selected side-specific picks.
  const weakSide = picks.find((p) => p.appliedSide != null)?.appliedSide ?? null;
  const meta = sessionMeta(rec, weakSide);

  // One sprint integration (a fly / ins-and-outs), the rest are the main pieces.
  const integrationPick = picks.find((p) => p.exercise.category === "sprint_integration") ?? null;
  const mainPool = picks.filter((p) => p !== integrationPick);
  const maxMains = integrationPick ? 4 : 5; // keep the whole session to ≤5 pieces
  const mains = mainPool.slice(0, maxMains);

  const mainExercises: WorkoutMainExercise[] = mains.map((p) => ({
    exerciseId: p.exercise.id,
    name: p.exercise.name,
    purpose: purposeFor(p.exercise),
    prescription: prescriptionLine(p.exercise),
    cue: p.exercise.cues[0] ?? "",
    rest: p.exercise.prescription.rest,
    stopRule: stopRuleFor(p.exercise.category),
  }));

  const sprintIntegration: WorkoutSprintIntegration | null = integrationPick
    ? {
        name: integrationPick.exercise.name,
        prescription: prescriptionLine(integrationPick.exercise),
        cue: integrationPick.exercise.cues[0] ?? "",
        rest: integrationPick.exercise.prescription.rest,
      }
    : null;

  // Rough session estimate: warm-up + mains + integration.
  const estimatedDurationMin =
    15 + mainExercises.length * 8 + (sprintIntegration ? 12 : 0);

  const plan: WorkoutPlan = {
    id: `plan-${rec.id}`,
    title: `AVA Session Plan — ${meta.sessionType.replace(/_/g, " ")}`,
    basedOnRecommendationId: rec.id,
    goal: meta.goal,
    sessionType: meta.sessionType,
    estimatedDurationMin,
    warmupFocus: meta.warmupFocus,
    mainExercises,
    sprintIntegration,
    nextSessionMetricGoal: rec.nextSessionGoal,
    trustNote: trustNoteFor(rec),
  };

  return { available: true, plan };
}
