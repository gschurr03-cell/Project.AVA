/**
 * Athlete Blueprint — CONFIGURATION (Phase 5).
 *
 * Model parameters only: how individualized target RANGES are derived from the
 * athlete's own anthropometrics + goal, body-composition bands, strength-benchmark
 * ratios (relative to bodyweight), similar-build elite archetypes, and development
 * areas. No absolute one-size-fits-all target is written here — ranges are always a
 * function of THIS athlete's inputs. Swapping research means editing this file.
 */

import type { Level } from "./models";

export const BLUEPRINT_CONFIG_VERSION = "ava-athlete-blueprint-config-v1" as const;

/**
 * Metric target models. Each derives an individualized [min,max] from the athlete:
 *  - trochanterRatio: stride = trochanterHeight × [min,max]× (body-proportion anchored).
 *  - velocityFactor: value = goal-required average velocity × [min,max].
 *  - heightAdjustedBand: a base band shifted by how tall the athlete is.
 *  - fixedBand: a population band (used only where anthropometrics don't individualize).
 */
export type TargetModel =
  | { kind: "trochanterRatio"; min: number; max: number; fallbackHeightRatio: { min: number; max: number } }
  | { kind: "velocityFactor"; min: number; max: number }
  | { kind: "heightAdjustedBand"; base: [number, number]; perCmBelow180: number; perCmAbove180: number }
  | { kind: "fixedBand"; min: number; max: number };

export interface MetricTargetConfig {
  metricId: string;
  label: string;
  unit: string;
  model: TargetModel;
  /** Which development area this metric contributes to. */
  area: string;
  /** Whether a LOWER current value is better (ground contact, symmetry difference). */
  lowerIsBetter: boolean;
}

export const METRIC_TARGET_CONFIG: MetricTargetConfig[] = [
  { metricId: "strideLength", label: "Stride Length", unit: "m", area: "sprintMechanics", lowerIsBetter: false,
    model: { kind: "trochanterRatio", min: 2.4, max: 2.6, fallbackHeightRatio: { min: 1.24, max: 1.34 } } },
  { metricId: "strideFrequency", label: "Stride Frequency", unit: "Hz", area: "sprintMechanics", lowerIsBetter: false,
    model: { kind: "heightAdjustedBand", base: [4.6, 5.0], perCmBelow180: 0.006, perCmAbove180: -0.005 } },
  { metricId: "peakVelocity", label: "Peak Velocity", unit: "m/s", area: "topSpeed", lowerIsBetter: false,
    model: { kind: "velocityFactor", min: 1.04, max: 1.08 } },
  { metricId: "averageVelocity", label: "Average Velocity", unit: "m/s", area: "topSpeed", lowerIsBetter: false,
    model: { kind: "velocityFactor", min: 1.0, max: 1.0 } },
  { metricId: "groundContactTime", label: "Ground Contact Time", unit: "s", area: "reactiveStrength", lowerIsBetter: true,
    model: { kind: "fixedBand", min: 0.08, max: 0.095 } },
  { metricId: "flightTime", label: "Flight Time", unit: "s", area: "sprintMechanics", lowerIsBetter: false,
    model: { kind: "fixedBand", min: 0.115, max: 0.135 } },
  { metricId: "acceleration", label: "Acceleration Quality", unit: "m/s²", area: "acceleration", lowerIsBetter: false,
    model: { kind: "fixedBand", min: 6.5, max: 8.0 } },
  { metricId: "transitionEfficiency", label: "Transition Efficiency", unit: "index", area: "acceleration", lowerIsBetter: false,
    model: { kind: "fixedBand", min: 0.85, max: 1.0 } },
  { metricId: "maxVelocityMaintenance", label: "Maximum Velocity Maintenance", unit: "index", area: "topSpeed", lowerIsBetter: false,
    model: { kind: "fixedBand", min: 0.9, max: 1.0 } },
  { metricId: "symmetry", label: "Left/Right Symmetry", unit: "%", area: "symmetry", lowerIsBetter: true,
    model: { kind: "fixedBand", min: 0, max: 3 } },
];

/** Development areas (metric groupings) with display weights for the overall score. */
export const DEVELOPMENT_AREAS: { id: string; label: string; weight: number }[] = [
  { id: "sprintMechanics", label: "Sprint Mechanics", weight: 0.25 },
  { id: "acceleration", label: "Acceleration", weight: 0.2 },
  { id: "topSpeed", label: "Top Speed", weight: 0.25 },
  { id: "symmetry", label: "Symmetry", weight: 0.1 },
  { id: "reactiveStrength", label: "Reactive Strength", weight: 0.2 },
];

/** Body-composition bands by sex (sprinter-typical; configurable, not requirements). */
export const BODY_COMPOSITION: Record<"M" | "F" | "default", { bmi: [number, number]; bodyFatPct: [number, number] }> = {
  M: { bmi: [22, 24.5], bodyFatPct: [6, 11] },
  F: { bmi: [19.5, 22], bodyFatPct: [12, 18] },
  default: { bmi: [20, 24], bodyFatPct: [8, 15] },
};

/** Strength benchmarks as relative-to-bodyweight ranges, scaled by estimated level. */
export interface StrengthBenchmarkConfig {
  id: string;
  label: string;
  /** Relative-to-bodyweight band at "advanced" level. */
  relativeAdvanced: [number, number];
  /** Unit for the absolute range (kg, or index for jumps/RSI). */
  unit: string;
  /** When true, the value is an index (jumps / reactive strength), not × bodyweight. */
  isIndex?: boolean;
}

export const STRENGTH_BENCHMARKS: StrengthBenchmarkConfig[] = [
  { id: "backSquat", label: "Back Squat", relativeAdvanced: [1.8, 2.2], unit: "kg" },
  { id: "frontSquat", label: "Front Squat", relativeAdvanced: [1.4, 1.8], unit: "kg" },
  { id: "powerClean", label: "Power Clean", relativeAdvanced: [1.1, 1.4], unit: "kg" },
  { id: "trapBarDeadlift", label: "Trap Bar Deadlift", relativeAdvanced: [2.2, 2.7], unit: "kg" },
  { id: "romanianDeadlift", label: "Romanian Deadlift", relativeAdvanced: [1.6, 2.0], unit: "kg" },
  { id: "hipThrust", label: "Hip Thrust", relativeAdvanced: [2.5, 3.2], unit: "kg" },
  { id: "nordicStrength", label: "Nordic Strength", relativeAdvanced: [0.5, 0.8], unit: "index" , isIndex: true },
  { id: "calfStrength", label: "Calf Strength", relativeAdvanced: [2.5, 3.5], unit: "kg" },
  { id: "jumpPerformance", label: "Jump Performance (CMJ)", relativeAdvanced: [0.45, 0.6], unit: "m", isIndex: true },
  { id: "reactiveStrength", label: "Reactive Strength Index", relativeAdvanced: [2.5, 3.5], unit: "index", isIndex: true },
];

/** Level scaling applied to the "advanced" relative bands. */
export const LEVEL_SCALE: Record<Level, number> = {
  developing: 0.7,
  intermediate: 0.85,
  advanced: 1,
  elite: 1.1,
};

/** Similar-build elite ARCHETYPES (never named individuals / world records). */
export interface EliteArchetype {
  id: string;
  label: string;
  event: string[];
  heightCm: [number, number];
  massKg: [number, number];
  velocityProfile: string;
  accelerationProfile: string;
  style: string;
}

export const ELITE_ARCHETYPES: EliteArchetype[] = [
  {
    id: "tall_power",
    label: "Tall power sprinter",
    event: ["100m", "200m"],
    heightCm: [186, 198],
    massKg: [82, 96],
    velocityProfile: "very high top speed, long strides",
    accelerationProfile: "slightly slower early, dominant from mid-race",
    style: "stride-length dominant",
  },
  {
    id: "balanced_100",
    label: "Balanced 100 m sprinter",
    event: ["100m"],
    heightCm: [175, 186],
    massKg: [72, 84],
    velocityProfile: "high top speed with strong turnover",
    accelerationProfile: "strong, well-rounded acceleration",
    style: "balanced stride length and frequency",
  },
  {
    id: "compact_frequency",
    label: "Compact high-frequency sprinter",
    event: ["60m", "100m"],
    heightCm: [162, 175],
    massKg: [58, 74],
    velocityProfile: "very high turnover, quick top speed",
    accelerationProfile: "explosive early acceleration",
    style: "frequency dominant",
  },
];
