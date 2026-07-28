/**
 * Exercise Recommendation Library V1 — a structured catalogue of sprint drills and
 * exercises AVA can choose from once it has detected a limiting factor. The engine in
 * {@link ./exerciseSelection} maps a limiter (frequency, stride length, asymmetry, …)
 * plus the measured evidence onto the best few entries here.
 *
 * This file is DATA ONLY — no metric math, no I/O. Every entry is a coaching drill or
 * strength/plyometric exercise with cues and a prescription. Nothing here diagnoses or
 * treats an injury; `avoidWhen` is a generic training-safety note, not medical advice.
 */

import type { RecommendationCategory } from "./recommendations";

export type ExerciseCategory =
  | "march"
  | "skip"
  | "dribble"
  | "wall_drill"
  | "hip_flexor"
  | "leg_reset"
  | "wicket"
  | "plyometric"
  | "strength"
  | "core_pelvis"
  | "sprint_integration";

export type ExerciseLevel = "beginner" | "intermediate" | "advanced" | "elite";
export type FpsRequirement = "60fps_ok" | "120fps_preferred" | "experimental";
export type ExerciseTrust = "trusted" | "estimate" | "experimental";

export interface ExercisePrescription {
  sets: string;
  reps: string;
  intensity: string;
  rest: string;
  frequency: string;
}

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  /** Short "what it fixes" phrases (coach-facing). */
  fixes: string[];
  /** Which limiter categories this exercise is a valid choice for. */
  limiterCategories: RecommendationCategory[];
  sideSpecific: boolean;
  level: ExerciseLevel;
  fpsRequirement: FpsRequirement;
  trust: ExerciseTrust;
  cues: string[];
  prescription: ExercisePrescription;
  whenToUse: string;
  avoidWhen: string;
  progression?: string[];
  regression?: string[];
  /** Free-form tags used by selection (side: "left"/"right"; metric hints). */
  evidenceTags: string[];
}

// Shared prescription presets, so each entry stays concise.
const RX: Record<string, ExercisePrescription> = {
  drill: { sets: "3–4", reps: "20–30 m", intensity: "technical, crisp", rest: "60–90 s", frequency: "2–3×/week" },
  wall: { sets: "3", reps: "10–20 switches", intensity: "fast, controlled", rest: "45–60 s", frequency: "2–3×/week" },
  wicket: { sets: "4–6", reps: "6–10 wickets", intensity: "90–95% rhythm", rest: "full (2–3 min)", frequency: "1–2×/week" },
  plyo: { sets: "3–5", reps: "6–10 contacts", intensity: "maximal intent, low volume", rest: "full (2–3 min)", frequency: "1–2×/week" },
  strength: { sets: "3–4", reps: "6–10 / side", intensity: "moderate–heavy, controlled", rest: "90–120 s", frequency: "2×/week" },
  core: { sets: "3", reps: "8–12 / side", intensity: "controlled, braced", rest: "45–60 s", frequency: "3×/week" },
  sprint: { sets: "3–5", reps: "20–40 m", intensity: "95–100%", rest: "full (3–5 min)", frequency: "1–2×/week" },
  hip: { sets: "3", reps: "8–15 / side", intensity: "fast concentric", rest: "60 s", frequency: "2–3×/week" },
};

const AVOID_DEFAULT =
  "Stop if it causes sharp or joint pain — this is technical/performance work, not treatment for an injury.";

type ExInput = Pick<Exercise, "id" | "name" | "category" | "limiterCategories" | "fixes" | "cues"> &
  Partial<Exercise> & { rx?: keyof typeof RX };

/** Fill family defaults so each entry below stays a couple of lines. */
function make(x: ExInput): Exercise {
  const { rx, ...rest } = x;
  return {
    sideSpecific: false,
    level: "intermediate",
    fpsRequirement: "60fps_ok",
    trust: "trusted",
    prescription: RX[rx ?? "drill"],
    whenToUse: "",
    avoidWhen: AVOID_DEFAULT,
    evidenceTags: [],
    ...rest,
  };
}

// A side-specific drill that is inherently the RIGHT leg (matches the screenshot data).
const RIGHT: Partial<Exercise> = { sideSpecific: true, evidenceTags: ["right", "side_specific"] };
// A side-specific drill applied to whichever side is weak (no inherent side).
const SIDE_AGNOSTIC: Partial<Exercise> = { sideSpecific: true, evidenceTags: ["side_specific", "single_leg"] };

export const EXERCISES: Exercise[] = [
  // ── March / skip family ─────────────────────────────────────────────────
  make({ id: "a_march", name: "A-march", category: "march", limiterCategories: ["frequency", "rhythm"], fixes: ["posture", "knee height", "rhythm foundation"], level: "beginner", cues: ["Tall posture, knee up, foot down under the hip."], whenToUse: "Build the front-side shape before adding speed.", evidenceTags: ["turnover", "posture"] }),
  make({ id: "a_skip", name: "A-skip", category: "skip", limiterCategories: ["frequency", "rhythm"], fixes: ["turnover", "front-side mechanics"], cues: ["Quick ground, knee drives up, relaxed arms."], whenToUse: "Everyday rhythm and turnover primer.", evidenceTags: ["turnover"] }),
  make({ id: "fast_a_skip", name: "Fast A-skip", category: "skip", limiterCategories: ["frequency"], fixes: ["turnover rate"], level: "advanced", cues: ["Same shape as A-skip, minimum ground time."], whenToUse: "Sharpen turnover once the A-skip shape is clean.", evidenceTags: ["turnover"] }),
  make({ id: "right_lead_a_skip", name: "Right-lead A-skip", category: "skip", limiterCategories: ["asymmetry", "frequency"], fixes: ["right-leg turnover", "side balance"], ...RIGHT, cues: ["Lead every cycle with the right knee drive and reset."], whenToUse: "When the right leg's turnover lags the left.", evidenceTags: ["right", "side_specific", "turnover"] }),
  make({ id: "single_leg_a_skip", name: "Single-leg A-skip rhythm", category: "skip", limiterCategories: ["asymmetry", "frequency", "rhythm"], fixes: ["single-side rhythm"], ...SIDE_AGNOSTIC, cues: ["Skip on one leg, matching the strong side's rhythm."], whenToUse: "Isolate and pace the weaker leg's cycle." }),
  make({ id: "wall_a_march", name: "Wall A-march", category: "march", limiterCategories: ["frequency", "rhythm"], fixes: ["knee-drive shape", "posture"], level: "beginner", cues: ["Lean on the wall, march tall with a sharp knee punch."], whenToUse: "Groove the front-side position statically." }),
  make({ id: "wall_a_skip_switch", name: "Wall A-skip switch", category: "skip", limiterCategories: ["frequency", "asymmetry"], fixes: ["switch speed"], cues: ["Fast switch of the legs against the wall."], whenToUse: "Bridge wall shape to rhythmic switching." }),
  make({ id: "march_to_a_run", name: "March to A-run", category: "march", limiterCategories: ["rhythm", "frequency"], fixes: ["rhythm carry-over"], cues: ["Roll a march into a relaxed A-run, keep the shape."], whenToUse: "Carry drill mechanics into running rhythm." }),
  make({ id: "a_run_buildups", name: "A-run buildups", category: "skip", limiterCategories: ["rhythm", "frequency", "speed"], fixes: ["rhythm to speed"], cues: ["Build A-run into an upright, relaxed sprint."], whenToUse: "Connect turnover rhythm to real speed.", evidenceTags: ["rhythm"] }),
  make({ id: "mini_hurdle_a_runs", name: "Mini-hurdle A-runs", category: "skip", limiterCategories: ["frequency", "rhythm", "stride_length"], fixes: ["front-side + spacing"], cues: ["A-run over low hurdles, hit each gap in rhythm."], whenToUse: "Organise turnover and step spacing together." }),

  // ── Dribble family ──────────────────────────────────────────────────────
  make({ id: "ankle_dribbles", name: "Ankle dribbles", category: "dribble", limiterCategories: ["frequency", "rhythm"], fixes: ["ground return", "elastic ankles"], level: "beginner", cues: ["Tiny fast contacts, dorsiflexed foot, minimal knee lift."], whenToUse: "Prime quick, elastic ground return.", evidenceTags: ["ground_return"] }),
  make({ id: "calf_dribbles", name: "Calf dribbles", category: "dribble", limiterCategories: ["frequency", "rhythm"], fixes: ["ankle stiffness", "turnover"], cues: ["Bounce off the calves, feet cycling fast under the hips."], whenToUse: "Build ankle stiffness for faster turnover." }),
  make({ id: "knee_dribbles", name: "Knee dribbles", category: "dribble", limiterCategories: ["frequency", "rhythm"], fixes: ["knee height + turnover"], cues: ["Slightly higher knee, keep the fast cycling rhythm."], whenToUse: "Add front-side height to the dribble rhythm." }),
  make({ id: "right_leg_dribbles", name: "Right-leg emphasis dribbles", category: "dribble", limiterCategories: ["asymmetry", "frequency"], fixes: ["right-side ground return"], ...RIGHT, cues: ["Emphasise a faster reset and contact on the right foot."], whenToUse: "When the right leg's turnover reads slower.", evidenceTags: ["right", "side_specific", "ground_return"] }),
  make({ id: "single_leg_dribble_cycles", name: "Single-leg dribble cycles", category: "dribble", limiterCategories: ["asymmetry", "frequency"], fixes: ["single-side cycling"], ...SIDE_AGNOSTIC, cues: ["Cycle one leg continuously at the strong side's tempo."], whenToUse: "Isolate the lagging leg's return speed." }),
  make({ id: "dribble_to_sprint", name: "Dribble to sprint", category: "dribble", limiterCategories: ["rhythm", "frequency", "speed"], fixes: ["rhythm to speed"], cues: ["Hold the dribble rhythm, then release into a sprint."], whenToUse: "Transfer fast ground return into running." }),
  make({ id: "dribble_ins_fly", name: "Dribble-ins to 20m fly", category: "dribble", limiterCategories: ["rhythm", "speed"], fixes: ["rhythm into max velocity"], cues: ["Dribble in, then float a relaxed 20 m fly."], whenToUse: "Groove rhythm right before a fly.", evidenceTags: ["rhythm"] }),
  make({ id: "fast_leg_dribbles", name: "Fast-leg dribbles", category: "dribble", limiterCategories: ["frequency"], fixes: ["single fast cycle"], cues: ["Dribble, then punch one leg through fast, reset."], whenToUse: "Train a snappy single-leg cycle within rhythm." }),
  make({ id: "wicket_dribbles", name: "Wicket dribbles", category: "dribble", limiterCategories: ["frequency", "rhythm"], fixes: ["spaced ground return"], cues: ["Dribble through low wickets keeping the fast cadence."], whenToUse: "Add spacing constraint to the dribble." }),
  make({ id: "straight_leg_dribbles", name: "Straight-leg dribbles", category: "dribble", limiterCategories: ["stride_length", "rhythm"], fixes: ["front-side pawing", "projection"], cues: ["Straight-ish legs, paw the ground back under the hips."], whenToUse: "Cue horizontal force and front-side action." }),

  // ── Hip flexor / knee punch ─────────────────────────────────────────────
  make({ id: "standing_band_knee_drives", name: "Standing band knee drives", category: "hip_flexor", limiterCategories: ["frequency", "asymmetry"], fixes: ["knee-drive speed"], ...SIDE_AGNOSTIC, rx: "hip", cues: ["Punch the knee up fast against the band, control down."], whenToUse: "Build fast hip flexion for turnover." }),
  make({ id: "wall_knee_drives", name: "Wall knee drives", category: "hip_flexor", limiterCategories: ["frequency", "asymmetry"], fixes: ["knee-drive shape"], ...SIDE_AGNOSTIC, rx: "hip", cues: ["Drive the knee to the wall height, snap back down."], whenToUse: "Groove the knee punch with a target." }),
  make({ id: "single_leg_knee_punch_holds", name: "Single-leg knee punch holds", category: "hip_flexor", limiterCategories: ["asymmetry", "frequency"], fixes: ["front-side position hold"], ...SIDE_AGNOSTIC, rx: "hip", cues: ["Punch to a high knee and hold the position tall."], whenToUse: "Strengthen the top of the knee drive." }),
  make({ id: "fast_knee_punch_reps", name: "Fast knee punch reps", category: "hip_flexor", limiterCategories: ["frequency"], fixes: ["knee-drive rate"], rx: "hip", level: "advanced", cues: ["Rapid up-down knee punches, minimal pause."], whenToUse: "Add speed to the knee drive once shape is sound." }),
  make({ id: "seated_hip_flexor_raises", name: "Seated hip-flexor raises", category: "hip_flexor", limiterCategories: ["frequency", "asymmetry"], fixes: ["hip-flexor strength"], ...SIDE_AGNOSTIC, rx: "strength", level: "beginner", cues: ["Seated tall, lift the thigh fast, lower slow."], whenToUse: "Base hip-flexor strength for turnover." }),
  make({ id: "weighted_hip_flexor_raises", name: "Weighted hip-flexor raises", category: "hip_flexor", limiterCategories: ["frequency", "asymmetry"], fixes: ["loaded hip flexion"], ...SIDE_AGNOSTIC, rx: "strength", level: "advanced", cues: ["Add ankle weight/cable, keep the lift crisp."], whenToUse: "Progress hip-flexor strength under load." }),
  make({ id: "hanging_knee_raises", name: "Hanging knee raises", category: "hip_flexor", limiterCategories: ["frequency"], fixes: ["hip flexion + core"], rx: "strength", cues: ["Hang tall, drive knees up without swinging."], whenToUse: "Combine hip flexion with trunk control." }),
  make({ id: "cable_knee_drives", name: "Cable knee drives", category: "hip_flexor", limiterCategories: ["frequency", "asymmetry"], fixes: ["loaded knee drive"], ...SIDE_AGNOSTIC, rx: "strength", cues: ["Cable on the ankle, punch the knee up fast."], whenToUse: "Loaded, side-isolated knee drive." }),
  make({ id: "mini_band_knee_drives", name: "Mini-band knee drives", category: "hip_flexor", limiterCategories: ["frequency", "asymmetry"], fixes: ["activation"], ...SIDE_AGNOSTIC, rx: "hip", level: "beginner", cues: ["Light band, fast crisp knee punches."], whenToUse: "Warm-up activation for hip flexors." }),
  make({ id: "iso_hip_flexor_holds", name: "Isometric hip-flexor holds", category: "hip_flexor", limiterCategories: ["frequency", "asymmetry"], fixes: ["position strength"], ...SIDE_AGNOSTIC, rx: "core", cues: ["Hold a high-knee position, braced and tall."], whenToUse: "Build endurance in the front-side position." }),

  // ── Leg reset / swing speed ─────────────────────────────────────────────
  make({ id: "band_resisted_leg_reset", name: "Band-resisted leg reset", category: "leg_reset", limiterCategories: ["asymmetry", "frequency"], fixes: ["recovery speed"], ...SIDE_AGNOSTIC, rx: "hip", cues: ["Snap the foot back under the hip against the band."], whenToUse: "Speed up the recovery (swing) phase of a leg." }),
  make({ id: "dead_bug_hip_flexion", name: "Dead bug hip flexion", category: "leg_reset", limiterCategories: ["frequency", "asymmetry"], fixes: ["reset + core"], ...SIDE_AGNOSTIC, rx: "core", level: "beginner", cues: ["Flat back, alternate fast hip flexion, ribs down."], whenToUse: "Coordinate reset with a stable pelvis." }),
  make({ id: "supine_switch_drills", name: "Supine switch drills", category: "leg_reset", limiterCategories: ["frequency", "rhythm"], fixes: ["switch coordination"], rx: "core", cues: ["On your back, switch legs through the sprint position."], whenToUse: "Learn the switch pattern with no ground time." }),
  make({ id: "fast_leg_switch_drills", name: "Fast-leg switch drills", category: "leg_reset", limiterCategories: ["frequency", "asymmetry", "rhythm"], fixes: ["switch speed"], cues: ["From a stride, snap one leg through and switch fast."], whenToUse: "Sharpen the front-side switch at speed.", evidenceTags: ["switch"] }),
  make({ id: "high_knee_switch_holds", name: "High-knee switch holds", category: "leg_reset", limiterCategories: ["asymmetry", "frequency"], fixes: ["position + switch"], ...SIDE_AGNOSTIC, cues: ["Hold high knee, switch, hold the other side."], whenToUse: "Own the switch positions before speeding up." }),
  make({ id: "single_leg_cycle_drill", name: "Single-leg cycle drill", category: "leg_reset", limiterCategories: ["asymmetry", "frequency"], fixes: ["single-side cycle"], ...SIDE_AGNOSTIC, cues: ["Cycle one leg over-and-under, foot to the hip."], whenToUse: "Rebuild the recovery arc on the weak leg." }),
  make({ id: "right_leg_recovery_cycles", name: "Right-leg recovery cycles", category: "leg_reset", limiterCategories: ["asymmetry", "frequency"], fixes: ["right recovery speed"], ...RIGHT, cues: ["Fast right-leg over-the-top recovery, foot under hip."], whenToUse: "When right-leg recovery/turnover lags.", evidenceTags: ["right", "side_specific", "recovery"] }),
  make({ id: "banded_thigh_recovery", name: "Banded thigh recovery", category: "leg_reset", limiterCategories: ["frequency", "asymmetry"], fixes: ["thigh recovery speed"], ...SIDE_AGNOSTIC, rx: "hip", cues: ["Band on the thigh, pull the knee through quickly."], whenToUse: "Assist a faster thigh recovery." }),
  make({ id: "wall_switch_series", name: "Wall switch series", category: "leg_reset", limiterCategories: ["frequency", "rhythm"], fixes: ["switch rhythm"], rx: "wall", cues: ["Series of wall switches building tempo."], whenToUse: "Rhythmic switch volume against the wall." }),
  make({ id: "boom_boom_switch", name: "Boom-boom switch drills", category: "leg_reset", limiterCategories: ["frequency", "rhythm"], fixes: ["double-quick switch"], level: "advanced", cues: ["Two fast switches — 'boom-boom' — then reset."], whenToUse: "Advanced switch speed within rhythm." }),

  // ── Wall drill family ───────────────────────────────────────────────────
  make({ id: "wall_march", name: "Wall march", category: "wall_drill", limiterCategories: ["frequency"], fixes: ["position"], rx: "wall", level: "beginner", cues: ["Tall lean, march knees to height, foot under hip."], whenToUse: "Base wall position work." }),
  make({ id: "wall_switch", name: "Wall switch", category: "wall_drill", limiterCategories: ["frequency", "rhythm"], fixes: ["switch mechanics"], rx: "wall", cues: ["Single fast switch, hold the tall position."], whenToUse: "Learn the switch against a stable wall." }),
  make({ id: "double_switch", name: "Double switch", category: "wall_drill", limiterCategories: ["frequency"], fixes: ["switch speed"], rx: "wall", cues: ["Two quick switches per rep, reset tall."], whenToUse: "Add speed to the wall switch." }),
  make({ id: "triple_switch", name: "Triple switch", category: "wall_drill", limiterCategories: ["frequency"], fixes: ["switch endurance + speed"], rx: "wall", level: "advanced", cues: ["Three fast switches, keep posture intact."], whenToUse: "Progress switch volume and speed." }),
  make({ id: "right_leg_wall_drives", name: "Right-leg only wall drives", category: "wall_drill", limiterCategories: ["asymmetry", "frequency"], fixes: ["right knee drive"], ...RIGHT, rx: "wall", cues: ["Drive only the right knee, fast up and down."], whenToUse: "Isolate a lagging right knee drive.", evidenceTags: ["right", "side_specific"] }),
  make({ id: "right_leg_quick_reset_wall_switches", name: "Right-leg quick reset wall switches", category: "wall_drill", limiterCategories: ["asymmetry", "frequency"], fixes: ["right reset speed"], ...RIGHT, rx: "wall", cues: ["Punch the right knee forward, snap the foot back under the hip."], whenToUse: "When right turnover/reset is slower than left.", evidenceTags: ["right", "side_specific", "reset"] }),
  make({ id: "wall_acceleration_cycles", name: "Wall acceleration cycles", category: "wall_drill", limiterCategories: ["frequency", "rhythm"], fixes: ["cyclic rhythm"], rx: "wall", cues: ["Continuous switches at an acceleration tempo."], whenToUse: "Rhythmic cyclic action against the wall." }),
  make({ id: "wall_piston_drill", name: "Wall piston drill", category: "wall_drill", limiterCategories: ["frequency"], fixes: ["piston action"], rx: "wall", cues: ["Pistons: fast alternating down-strikes."], whenToUse: "Aggressive ground-strike intent." }),
  make({ id: "wall_knee_punch_reset", name: "Wall knee punch + reset", category: "wall_drill", limiterCategories: ["frequency", "asymmetry"], fixes: ["punch + reset"], ...SIDE_AGNOSTIC, rx: "wall", cues: ["Punch up, then a fast reset under the hip."], whenToUse: "Couple knee drive with a quick reset." }),
  make({ id: "wall_dribble_switch", name: "Wall dribble switch", category: "wall_drill", limiterCategories: ["frequency", "rhythm"], fixes: ["low-amplitude rhythm"], rx: "wall", cues: ["Small, fast dribble-style switches on the wall."], whenToUse: "Blend dribble rhythm with wall position." }),

  // ── Wicket / rhythm ─────────────────────────────────────────────────────
  make({ id: "low_wicket_runs", name: "Low wicket runs", category: "wicket", limiterCategories: ["stride_length", "rhythm", "frequency"], fixes: ["front-side + spacing"], rx: "wicket", cues: ["Run tall over low wickets, hit each gap in rhythm."], whenToUse: "Organise upright mechanics and step spacing.", evidenceTags: ["spacing"] }),
  make({ id: "mini_wicket_runs", name: "Mini-wicket runs", category: "wicket", limiterCategories: ["frequency", "rhythm"], fixes: ["turnover rhythm"], rx: "wicket", cues: ["Tighter spacing, quick rhythmic contacts."], whenToUse: "Bias the rhythm toward faster turnover.", evidenceTags: ["turnover"] }),
  make({ id: "progressive_wicket_spacing", name: "Progressive wicket spacing", category: "wicket", limiterCategories: ["stride_length", "rhythm"], fixes: ["stride projection"], rx: "wicket", cues: ["Widen spacing across reps to demand longer strides."], whenToUse: "Push stride length while holding mechanics.", evidenceTags: ["projection"] }),
  make({ id: "right_leg_rhythm_wickets", name: "Right-leg rhythm wickets", category: "wicket", limiterCategories: ["asymmetry", "frequency", "rhythm"], fixes: ["right-side rhythm"], ...RIGHT, rx: "wicket", cues: ["Cue an even, quick right-leg contact through each gap."], whenToUse: "Even out a slower right-side turnover in rhythm.", evidenceTags: ["right", "side_specific", "rhythm"] }),
  make({ id: "wicket_walkovers", name: "Wicket walkovers", category: "wicket", limiterCategories: ["stride_length"], fixes: ["position learning"], rx: "drill", level: "beginner", cues: ["Walk over wickets exaggerating the front-side shape."], whenToUse: "Teach the wicket position slowly." }),
  make({ id: "wicket_dribbles2", name: "Wicket dribbles", category: "wicket", limiterCategories: ["frequency", "rhythm"], fixes: ["spaced ground return"], rx: "wicket", cues: ["Dribble rhythm constrained by wicket spacing."], whenToUse: "Fast ground return with a spacing constraint." }),
  make({ id: "wicket_a_runs", name: "Wicket A-runs", category: "wicket", limiterCategories: ["rhythm", "frequency", "stride_length"], fixes: ["front-side rhythm"], rx: "wicket", cues: ["A-run action over the wickets, tall and relaxed."], whenToUse: "Marry front-side action to spacing." }),
  make({ id: "wicket_fly_ins", name: "Wicket fly-ins", category: "wicket", limiterCategories: ["speed", "stride_length", "rhythm"], fixes: ["mechanics into max velocity"], rx: "wicket", level: "advanced", cues: ["Exit the wickets straight into a max-velocity fly."], whenToUse: "Transfer wicket mechanics to top speed." }),
  make({ id: "frequency_wickets", name: "Frequency wickets", category: "wicket", limiterCategories: ["frequency", "rhythm"], fixes: ["turnover under spacing"], rx: "wicket", cues: ["Slightly tight spacing cueing quicker contacts."], whenToUse: "Directly bias turnover rate." }),
  make({ id: "relaxed_maxv_wickets", name: "Relaxed max velocity wickets", category: "wicket", limiterCategories: ["rhythm", "speed", "stride_length"], fixes: ["relaxed top-speed rhythm", "projection"], rx: "wicket", cues: ["Wide, relaxed wickets — stay tall and let the spacing project the hips."], whenToUse: "Stabilise a relaxed top-speed rhythm and project into wider strides.", evidenceTags: ["consistency", "projection"] }),

  // ── Plyometric / elastic rhythm ─────────────────────────────────────────
  make({ id: "pogos", name: "Pogos", category: "plyometric", limiterCategories: ["stride_length"], fixes: ["ankle stiffness", "elastic return"], rx: "plyo", fpsRequirement: "120fps_preferred", cues: ["Stiff ankles, quick floor, minimal knee bend."], whenToUse: "Build elastic stiffness for a springier push.", evidenceTags: ["stiffness"] }),
  make({ id: "single_leg_pogos", name: "Single-leg pogos", category: "plyometric", limiterCategories: ["stride_length", "asymmetry"], fixes: ["single-side stiffness"], ...SIDE_AGNOSTIC, rx: "plyo", fpsRequirement: "120fps_preferred", level: "advanced", cues: ["One-leg stiff hops, quiet quick contacts."], whenToUse: "Close a single-side stiffness gap.", evidenceTags: ["stiffness", "side_specific", "single_leg"] }),
  make({ id: "right_leg_pogos", name: "Right-leg pogos", category: "plyometric", limiterCategories: ["asymmetry", "stride_length"], fixes: ["right-side stiffness"], ...RIGHT, rx: "plyo", fpsRequirement: "120fps_preferred", level: "advanced", cues: ["Stiff quick hops on the right leg only."], whenToUse: "When the right side lacks elastic return.", evidenceTags: ["right", "side_specific", "stiffness"] }),
  make({ id: "alternating_bounds", name: "Alternating bounds", category: "plyometric", limiterCategories: ["stride_length"], fixes: ["horizontal power", "projection"], rx: "plyo", cues: ["Big, projected bounds — distance per contact."], whenToUse: "Develop horizontal force and projection.", evidenceTags: ["projection"] }),
  make({ id: "straight_leg_bounds", name: "Straight-leg bounds", category: "plyometric", limiterCategories: ["stride_length"], fixes: ["horizontal projection", "front-side paw", "stiffness"], rx: "plyo", cues: ["Sweep down and back, keep the hips tall, pop off the ground — cover distance from the hips, not by flinging the foot out front."], whenToUse: "Build elastic horizontal projection while keeping contacts under the body.", evidenceTags: ["projection", "stiffness"] }),
  make({ id: "scissor_bounds", name: "Scissor bounds", category: "plyometric", limiterCategories: ["stride_length"], fixes: ["switch + projection"], rx: "plyo", level: "advanced", cues: ["Bound with a sharp mid-air scissor of the legs."], whenToUse: "Combine projection with a fast switch." }),
  make({ id: "low_amplitude_bounds", name: "Low amplitude bounds", category: "plyometric", limiterCategories: ["stride_length", "rhythm"], fixes: ["fast projected contacts"], rx: "plyo", cues: ["Lower, quicker bounds keeping projection."], whenToUse: "Blend projection with quicker rhythm." }),
  make({ id: "ankling_bounds", name: "Ankling bounds", category: "plyometric", limiterCategories: ["frequency", "rhythm"], fixes: ["ankle elasticity"], rx: "plyo", cues: ["Foot-dominant tiny bounds, elastic ankles."], whenToUse: "Ankle-driven quickness for turnover." }),
  make({ id: "quick_contacts_mini_hurdles", name: "Quick contacts over mini hurdles", category: "plyometric", limiterCategories: ["stride_length"], fixes: ["reactive stiffness"], rx: "plyo", fpsRequirement: "experimental", trust: "estimate", level: "advanced", cues: ["Minimal ground time over each mini hurdle."], whenToUse: "Reactive stiffness work — justified by contact-time data, so it needs 120fps+ before AVA prescribes it.", evidenceTags: ["contact_time", "stiffness"] }),
  make({ id: "single_leg_line_hops", name: "Single-leg line hops", category: "plyometric", limiterCategories: ["asymmetry", "stride_length"], fixes: ["single-side stiffness + control"], ...SIDE_AGNOSTIC, rx: "plyo", cues: ["Quick single-leg hops over a line, quiet contacts."], whenToUse: "Low-level single-side stiffness/control." }),

  // ── Strength ────────────────────────────────────────────────────────────
  make({ id: "single_leg_hip_flexor_raises", name: "Single-leg hip flexor raises", category: "strength", limiterCategories: ["asymmetry", "frequency"], fixes: ["single-side hip-flexor strength"], ...SIDE_AGNOSTIC, rx: "strength", cues: ["Isolate one side, lift fast, lower controlled."], whenToUse: "Close a single-side hip-flexor gap." }),
  make({ id: "reverse_sled_marches", name: "Reverse sled marches", category: "strength", limiterCategories: ["stride_length"], fixes: ["horizontal force"], rx: "strength", cues: ["March backward driving through the ground."], whenToUse: "Build horizontal pushing strength." }),
  make({ id: "step_up_knee_drives", name: "Step-up knee drives", category: "strength", limiterCategories: ["asymmetry", "stride_length", "frequency"], fixes: ["unilateral drive"], ...SIDE_AGNOSTIC, rx: "strength", cues: ["Drive up onto the box, punch the free knee high."], whenToUse: "Unilateral force + knee drive together." }),
  make({ id: "split_squat_iso_knee_punch", name: "Split squat ISO + knee punch", category: "strength", limiterCategories: ["asymmetry", "stride_length"], fixes: ["position strength + drive"], ...SIDE_AGNOSTIC, rx: "strength", cues: ["Hold a split-squat ISO, punch the back knee through."], whenToUse: "Strength in the sprint position, side by side." }),
  make({ id: "rfess", name: "Rear-foot elevated split squat", category: "strength", limiterCategories: ["asymmetry", "stride_length"], fixes: ["unilateral leg strength"], ...SIDE_AGNOSTIC, rx: "strength", cues: ["Tall torso, drive through the front foot."], whenToUse: "Base unilateral strength for stride power." }),
  make({ id: "single_leg_rdl", name: "Single-leg RDL", category: "strength", limiterCategories: ["asymmetry", "stride_length"], fixes: ["posterior chain balance"], ...SIDE_AGNOSTIC, rx: "strength", cues: ["Hinge on one leg, flat back, control the load."], whenToUse: "Balance posterior-chain strength across sides." }),
  make({ id: "cable_hip_flexion", name: "Cable hip flexion", category: "strength", limiterCategories: ["asymmetry", "frequency"], fixes: ["loaded hip flexion"], ...SIDE_AGNOSTIC, rx: "strength", cues: ["Cable on ankle, fast concentric knee drive."], whenToUse: "Load the hip flexors for turnover." }),
  make({ id: "copenhagen", name: "Copenhagen variations", category: "strength", limiterCategories: ["asymmetry"], fixes: ["adductor strength/balance"], ...SIDE_AGNOSTIC, rx: "core", cues: ["Side plank off the top leg, control the hips."], whenToUse: "Adductor strength to support side balance." }),
  make({ id: "adductor_machine", name: "Adductor machine", category: "strength", limiterCategories: ["asymmetry"], fixes: ["adductor strength"], rx: "strength", cues: ["Controlled squeeze, full range, no bouncing."], whenToUse: "Direct adductor strengthening." }),
  make({ id: "hamstring_iso_holds", name: "Hamstring ISO holds", category: "strength", limiterCategories: ["stride_length", "asymmetry"], fixes: ["hamstring resilience"], ...SIDE_AGNOSTIC, rx: "core", cues: ["Hold a bridge/hamstring ISO, drive the heel down."], whenToUse: "Build hamstring resilience for fast strides." }),

  // ── Core / pelvis control ───────────────────────────────────────────────
  make({ id: "dead_bugs", name: "Dead bugs", category: "core_pelvis", limiterCategories: ["rhythm", "asymmetry"], fixes: ["pelvic control"], rx: "core", level: "beginner", cues: ["Flat back, opposite arm/leg, ribs down."], whenToUse: "Base anti-extension pelvic control." }),
  make({ id: "banded_dead_bugs", name: "Banded dead bugs", category: "core_pelvis", limiterCategories: ["rhythm", "asymmetry"], fixes: ["braced control"], rx: "core", cues: ["Band tension, keep the back flat through reps."], whenToUse: "Progress pelvic control under tension." }),
  make({ id: "hollow_holds", name: "Hollow holds", category: "core_pelvis", limiterCategories: ["rhythm", "stride_length"], fixes: ["trunk stiffness"], rx: "core", cues: ["Hollow shape, ribs down, everything tight."], whenToUse: "Trunk stiffness for force transfer." }),
  make({ id: "pallof_press", name: "Pallof press", category: "core_pelvis", limiterCategories: ["asymmetry", "rhythm"], fixes: ["anti-rotation"], rx: "core", cues: ["Resist the cable's pull, press without twisting."], whenToUse: "Anti-rotation to steady the pelvis." }),
  make({ id: "marching_bridge", name: "Marching bridge", category: "core_pelvis", limiterCategories: ["rhythm", "asymmetry", "stride_length"], fixes: ["glute + pelvis", "hip height"], rx: "core", level: "beginner", cues: ["Bridge tall, march without dropping a hip — own a tall, projected hip position."], whenToUse: "Glute control and hip height to support projection.", evidenceTags: ["posture", "projection"] }),
  make({ id: "single_leg_bridge_march", name: "Single-leg bridge march", category: "core_pelvis", limiterCategories: ["asymmetry", "rhythm"], fixes: ["single-side pelvis control"], ...SIDE_AGNOSTIC, rx: "core", cues: ["Hold a single-leg bridge, keep hips level."], whenToUse: "Address a hip drop on one side." }),
  make({ id: "bear_crawl_knee_drives", name: "Bear crawl knee drives", category: "core_pelvis", limiterCategories: ["rhythm", "frequency"], fixes: ["coordination"], rx: "core", cues: ["Braced bear position, drive knees fast."], whenToUse: "Coordinate fast knees with a stable trunk." }),
  make({ id: "side_plank_knee_drive", name: "Side plank with knee drive", category: "core_pelvis", limiterCategories: ["asymmetry"], fixes: ["lateral stability + drive"], ...SIDE_AGNOSTIC, rx: "core", cues: ["Stable side plank, punch the top knee through."], whenToUse: "Lateral stability under a knee drive." }),
  make({ id: "hip_lock_holds", name: "Hip lock holds", category: "core_pelvis", limiterCategories: ["rhythm", "stride_length"], fixes: ["position ownership"], rx: "core", cues: ["Lock a tall single-leg stance, pelvis neutral."], whenToUse: "Own the tall sprint posture statically." }),
  make({ id: "wall_hip_lock_switches", name: "Wall hip lock switches", category: "core_pelvis", limiterCategories: ["rhythm", "frequency", "stride_length"], fixes: ["posture through switch", "hip height"], rx: "wall", cues: ["Switch legs on the wall keeping the pelvis locked and hips tall."], whenToUse: "Hold a tall, projected posture while switching.", evidenceTags: ["posture"] }),

  // ── Sprint-specific integrations ────────────────────────────────────────
  make({ id: "dribble_in_flys", name: "Dribble-in flys", category: "sprint_integration", limiterCategories: ["speed", "rhythm"], fixes: ["rhythm into speed"], rx: "sprint", cues: ["Dribble to set rhythm, release into a fly."], whenToUse: "Carry clean rhythm into max velocity." }),
  make({ id: "a_run_into_fly", name: "A-run into fly", category: "sprint_integration", limiterCategories: ["speed", "rhythm", "stride_length"], fixes: ["mechanics into speed"], rx: "sprint", cues: ["A-run buildup, then hold shape into the fly."], whenToUse: "Transfer front-side mechanics to speed." }),
  make({ id: "wicket_into_fly", name: "Wicket into fly", category: "sprint_integration", limiterCategories: ["speed", "stride_length", "rhythm"], fixes: ["spacing into speed", "projection into max velocity"], rx: "sprint", level: "advanced", cues: ["Keep the rhythm and step spacing from the wickets straight into the fly zone."], whenToUse: "Link improved step spacing directly into max-velocity sprinting.", evidenceTags: ["projection", "spacing"] }),
  make({ id: "fly_right_leg_cue", name: "20m fly with right-leg cue", category: "sprint_integration", limiterCategories: ["asymmetry", "speed"], fixes: ["side-cued max velocity"], ...RIGHT, rx: "sprint", cues: ["Run a 20 m fly focusing an even, quick right contact."], whenToUse: "Reinforce right-side evenness at full speed.", evidenceTags: ["right", "side_specific"] }),
  make({ id: "flying_10s_relaxed_knee", name: "Flying 10s with relaxed knee return", category: "sprint_integration", limiterCategories: ["speed", "rhythm"], fixes: ["relaxed top speed"], rx: "sprint", cues: ["Full-speed flying 10s, relaxed face and hands."], whenToUse: "Expose true top speed while staying relaxed." }),
  make({ id: "fly_projection_cue", name: "20m fly with projection cue", category: "sprint_integration", limiterCategories: ["stride_length", "speed", "rhythm"], fixes: ["race-speed projection", "ground covered per step"], rx: "sprint", level: "advanced", cues: ["Cover ground from the hips; step down under the body and pop off — no flinging the foot out front."], whenToUse: "The limiter appeared in the actual fly zone, so keep the projection correction at race speed.", evidenceTags: ["projection", "spacing"] }),
  make({ id: "flying_10s_projection_cue", name: "Flying 10s with projection cue", category: "sprint_integration", limiterCategories: ["stride_length", "speed"], fixes: ["projected max velocity"], rx: "sprint", level: "advanced", cues: ["Project the hips through each step, tall posture, elastic pop off the ground."], whenToUse: "Turn improved projection into true top-end speed.", evidenceTags: ["projection"] }),
  make({ id: "buildups_right_recovery", name: "10m buildups focusing right recovery", category: "sprint_integration", limiterCategories: ["asymmetry", "rhythm", "speed"], fixes: ["right recovery at speed"], ...RIGHT, rx: "sprint", cues: ["Build up cueing a quick right-leg recovery."], whenToUse: "Groove right-side recovery into running.", evidenceTags: ["right", "side_specific", "recovery"] }),
  make({ id: "submax_rhythm_runs", name: "Submax rhythm runs", category: "sprint_integration", limiterCategories: ["rhythm"], fixes: ["repeatable rhythm"], rx: "sprint", cues: ["90–95%, identical relaxed rhythm each rep."], whenToUse: "Stabilise an inconsistent top-speed rhythm.", evidenceTags: ["consistency"] }),
  make({ id: "ins_and_outs", name: "Ins-and-outs", category: "sprint_integration", limiterCategories: ["speed", "rhythm"], fixes: ["speed + relaxation"], rx: "sprint", level: "advanced", cues: ["Accelerate, float relaxed, re-accelerate."], whenToUse: "Top speed with relaxation and rhythm control." }),
  make({ id: "float_sprint_float", name: "Float-sprint-float", category: "sprint_integration", limiterCategories: ["speed", "rhythm"], fixes: ["relaxed speed switching"], rx: "sprint", cues: ["Float, hit a max surge, float again."], whenToUse: "Blend relaxation with a max-velocity surge." }),
  make({ id: "sprint_float_sprint", name: "Sprint-float-sprint", category: "sprint_integration", limiterCategories: ["speed", "rhythm"], fixes: ["repeat speed"], rx: "sprint", level: "advanced", cues: ["Max, brief float, max again — hold mechanics."], whenToUse: "Repeatable max velocity within one rep." }),
];

/** Fast lookup by id. */
export const EXERCISE_BY_ID: ReadonlyMap<string, Exercise> = new Map(EXERCISES.map((e) => [e.id, e]));
