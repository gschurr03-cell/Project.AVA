/**
 * Coaching insights engine (Day 76) — Sprint Intelligence v2.
 *
 * Turns AVA's measured metrics into structured, elite-coach-style recommendations.
 * Every insight follows the same chain so a coach reads it the way they'd review
 * video:
 *
 *   Observation → Biomechanical explanation → Performance consequence
 *              → Corrective strategy → Suggested drills → Priority
 *
 * The engine is a set of independent per-metric MODULES (left/right balance,
 * cadence, velocity profile, step length, …). Each module reads only measured
 * values and emits an insight when a metric-driven threshold is crossed — nothing
 * is generic or hard-coded to a specific athlete/benchmark. Modules stay honest
 * about confidence: spatial metrics are reliable at any frame rate, while sub-frame
 * timing (contact/flight, per-side cadence) is only DIRECTIONAL at ≤60 fps (Day 69).
 *
 * Pure & deterministic: no I/O, inputs read-only. Add a metric = add a module.
 */

import type { SprintMeasurements } from "@/lib/benchmark/measurements";
import { analyzeAsymmetry } from "@/lib/intelligence/asymmetry";

export type InsightPriority = "high" | "medium" | "low";
export type InsightConfidence = "high" | "medium" | "low";

/** One structured coaching insight — the full observation→priority chain. */
export interface CoachingInsight {
  id: string;
  /** Which metric family this is about, e.g. "Step frequency — left/right". */
  metric: string;
  /** What AVA measured (the observation). */
  observation: string;
  /** The likely biomechanical cause. */
  explanation: string;
  /** How it affects sprint performance. */
  consequence: string;
  /** What to train to fix it. */
  correctiveFocus: string;
  /** Concrete drills. */
  drills: string[];
  priority: InsightPriority;
  confidence: InsightConfidence;
  /** Honest caveat about how far to trust the reading. */
  confidenceNote: string;
}

export interface InsightInputs {
  measurements: SprintMeasurements;
  /** Temporal metrics are frame-rate-trustworthy (≥120 fps). Default true. */
  timingReliable?: boolean;
  /** Athlete's leg length (cm), for step-length norms, when known. */
  legLengthCm?: number | null;
}

type Module = (i: Required<Pick<InsightInputs, "measurements" | "timingReliable">> & InsightInputs) => CoachingInsight[];

const PRIORITY_RANK: Record<InsightPriority, number> = { high: 0, medium: 1, low: 2 };

// --- Domain-knowledge thresholds (explainable, not benchmark outputs) ---------
/** Elite max-velocity turnover sits ~4.4–5.2 steps/s; below this caps top speed. */
const CADENCE_LOW = 4.4;
/** Step-length : leg-length ratio at max velocity is ~2.3–2.6 for good projection. */
const STEP_TO_LEG_LOW = 2.3;

// --- Modules ------------------------------------------------------------------

/** Left/right balance — reuses the tested asymmetry analysis, mapped to the
 *  coaching chain. Step-length gaps are reliable; per-side cadence is directional
 *  at ≤60 fps and is prioritised/labelled accordingly. */
const balanceModule: Module = ({ measurements, timingReliable }) => {
  return analyzeAsymmetry(measurements, { timingReliable }).map((a) => {
    const reliableSpatial = a.key === "stepLength";
    const priority: InsightPriority = reliableSpatial
      ? a.differencePct >= 6
        ? "high"
        : "medium"
      : a.reliable
        ? "high"
        : "medium"; // frequency at ≤60 fps: real but directional → medium
    return {
      id: `balance-${a.key}`,
      metric: `${a.metricLabel} — left/right`,
      observation: a.what,
      explanation: a.why,
      consequence:
        a.key === "stepLength"
          ? "The short side leaves ground unclaimed every stride, so top speed is capped and load shifts onto the stronger leg."
          : "Longer cycle time on the slow side lowers maximal frequency and pulls down top-end speed.",
      correctiveFocus:
        a.key === "stepLength"
          ? `Build horizontal force and hip extension on the ${a.weakerSide} leg to even out projection.`
          : `Improve front-side mechanics and hip-flexor recovery speed on the ${a.weakerSide} leg.`,
      drills: a.fixes,
      priority,
      confidence: a.reliable ? "high" : "low",
      confidenceNote: a.confidenceNote,
    };
  });
};

/** Cadence — combined step frequency vs the elite max-velocity range. */
const cadenceModule: Module = ({ measurements }) => {
  const f = measurements.combinedStepFrequencyHz;
  if (f == null || f >= CADENCE_LOW) return [];
  return [
    {
      id: "cadence-low",
      metric: "Step frequency (combined)",
      observation: `Combined step frequency is ${f.toFixed(2)} steps/s, below the ~${CADENCE_LOW}+ range seen at elite max velocity.`,
      explanation:
        "Low turnover usually reflects slow leg recovery, limited front-side mechanics, or a posture that collapses under load — the legs reset too slowly between contacts.",
      consequence:
        "At top speed, velocity = step length × frequency. Capped turnover holds back maximal velocity even when stride length is good.",
      correctiveFocus:
        "Raise turnover with quick, tall front-side mechanics while keeping posture and rhythm intact.",
      drills: ["A-skips and dribble series", "Wall switch series", "Wicket runs at target spacing", "Fast-leg / single-leg cycling"],
      priority: "high",
      confidence: "high",
      confidenceNote: "Combined frequency is measured over the whole zone from many contacts — reliable.",
    },
  ];
};

/** Velocity profile — how the athlete's peak stride compares to the zone average. */
const velocityModule: Module = ({ measurements }) => {
  const max = measurements.maxVelocityMps;
  const avg = measurements.zoneVelocityMps;
  if (max == null || avg == null || avg <= 0) return [];
  const spreadPct = ((max - avg) / avg) * 100;
  // A small spread through a fly zone = sustained top-end; a large spread means the
  // athlete is still accelerating into (or decelerating out of) the measured segment.
  if (spreadPct <= 6) {
    return [
      {
        id: "velocity-sustained",
        metric: "Velocity profile",
        observation: `Peak stride velocity (${max.toFixed(2)} m/s) sits close to the zone average (${avg.toFixed(2)} m/s) — only ${spreadPct.toFixed(0)}% apart.`,
        explanation: "The athlete is holding a near-constant speed across the zone rather than still building or falling off.",
        consequence: "This is the signature of a true max-velocity segment — good speed maintenance and mechanics that don't collapse under load.",
        correctiveFocus: "Maintain this quality; the next gains come from raising the ceiling (force + turnover), not from smoothing the profile.",
        drills: ["Flying 20–30 m sprints", "Speed-endurance wickets", "Sprint-float-sprint"],
        priority: "low",
        confidence: "high",
        confidenceNote: "Both velocities are spatial/zone measures — reliable.",
      },
    ];
  }
  return [
    {
      id: "velocity-varying",
      metric: "Velocity profile",
      observation: `Peak stride velocity (${max.toFixed(2)} m/s) is ${spreadPct.toFixed(0)}% above the zone average (${avg.toFixed(2)} m/s).`,
      explanation: "The athlete's speed changes noticeably across the zone — they're likely still accelerating into it or decelerating out of it, so the segment isn't pure max velocity.",
      consequence: "Averaging a rising or falling curve understates true top speed and makes the zone metrics harder to compare session to session.",
      correctiveFocus: "Position the timing gates over the flattest, fastest part of the run, and lengthen the approach so the athlete is already at top speed entering the zone.",
      drills: ["Longer fly-in approaches", "Flying 20 m with a 30 m build", "Top-speed maintenance runs"],
      priority: "medium",
      confidence: "high",
      confidenceNote: "Both velocities are spatial/zone measures — reliable.",
    },
  ];
};

/** Step length vs leg length (only when leg length is known — otherwise skipped). */
const stepLengthModule: Module = ({ measurements, legLengthCm }) => {
  const step = measurements.avgIndividualStepLengthM ?? measurements.avgZoneStepLengthM;
  if (step == null || !legLengthCm || legLengthCm <= 0) return [];
  const ratio = step / (legLengthCm / 100);
  if (ratio >= STEP_TO_LEG_LOW) return [];
  return [
    {
      id: "step-length-short",
      metric: "Step length",
      observation: `Average step length is ${step.toFixed(2)} m — about ${ratio.toFixed(2)}× leg length, below the ~${STEP_TO_LEG_LOW}×+ typical of strong max-velocity projection.`,
      explanation: "Short steps relative to leg length point to limited horizontal force or incomplete hip extension at toe-off — the athlete doesn't project far off each contact.",
      consequence: "Less ground per step caps top speed even when turnover is high, and often nudges the athlete toward over-striding to compensate.",
      correctiveFocus: "Develop horizontal force and projection so each stride covers more ground without reaching.",
      drills: ["Resisted sled sprints", "Bounding and alternating bounds", "Hill accelerations", "Hip-extension strength"],
      priority: "medium",
      confidence: "high",
      confidenceNote: "Step length is spatial and calibrated — reliable.",
    },
  ];
};

const MODULES: Module[] = [balanceModule, cadenceModule, velocityModule, stepLengthModule];

/**
 * Run every metric module over the measurements and return the coaching insights,
 * most important first. Deterministic and fully metric-driven.
 */
export function buildCoachingInsights(inputs: InsightInputs): CoachingInsight[] {
  const ctx = {
    ...inputs,
    measurements: inputs.measurements,
    timingReliable: inputs.timingReliable !== false,
  };
  const insights = MODULES.flatMap((m) => m(ctx));
  return insights.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}
