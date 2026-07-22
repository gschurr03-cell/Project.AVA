/**
 * Body Profile + Strength Benchmark engines (Phase 5). Individualized body-composition
 * and strength estimates from the athlete's own height/mass/sex/level. Every value is a
 * confidence-tagged RANGE and an estimate — never a requirement or a mandate. Pure.
 */

import { type Confidence, estimated, unknown } from "../models";
import type { AthleteContext } from "../rootCause/athleteContext";
import type { BodyProfile, Level, StrengthBenchmark, TargetRange } from "./models";
import { BODY_COMPOSITION, STRENGTH_BENCHMARKS, LEVEL_SCALE } from "./config";

export const BODY_PROFILE_VERSION = "ava-body-profile-v1" as const;
export const STRENGTH_BENCHMARK_VERSION = "ava-strength-benchmark-v1" as const;

export function buildBodyProfile(context: AthleteContext, level: Level): BodyProfile {
  const heightCm = num(context.heightCm);
  const massKg = num(context.bodyMassKg);
  const comp = BODY_COMPOSITION[(context.sex as "M" | "F") ?? "default"] ?? BODY_COMPOSITION.default;

  const currentBmi = heightCm != null && massKg != null ? round(massKg / Math.pow(heightCm / 100, 2)) : null;

  if (heightCm == null) {
    return {
      currentMassKg: massKg,
      currentBmi,
      targetMassKg: nullRange("kg"),
      targetBmi: nullRange("kg/m²"),
      leanMassKg: nullRange("kg"),
      estimatedStrengthLevel: level,
      estimatedPowerLevel: level,
      confidence: unknown("height required to individualize body targets"),
    };
  }

  const hM = heightCm / 100;
  const targetMassKg = range(comp.bmi[0] * hM * hM, comp.bmi[1] * hM * hM, "kg", estimated(0.5, "sprinter BMI band × height²"));
  const targetBmi = range(comp.bmi[0], comp.bmi[1], "kg/m²", estimated(0.5, "sex-typical sprinter BMI band"));
  // Lean mass = target mass × (1 − body-fat band).
  const leanMassKg = range(
    (targetMassKg.min ?? 0) * (1 - comp.bodyFatPct[1] / 100),
    (targetMassKg.max ?? 0) * (1 - comp.bodyFatPct[0] / 100),
    "kg",
    estimated(0.4, "estimated lean mass from target mass + body-fat band"),
  );

  return {
    currentMassKg: massKg,
    currentBmi,
    targetMassKg,
    targetBmi,
    leanMassKg,
    estimatedStrengthLevel: level,
    estimatedPowerLevel: level,
    confidence: estimated(0.5, "individualized from height, sex, and estimated level"),
  };
}

export function buildStrengthBenchmarks(context: AthleteContext, level: Level): StrengthBenchmark[] {
  const massKg = num(context.bodyMassKg);
  const scale = LEVEL_SCALE[level];
  return STRENGTH_BENCHMARKS.map((b): StrengthBenchmark => {
    const relMin = round(b.relativeAdvanced[0] * scale);
    const relMax = round(b.relativeAdvanced[1] * scale);
    let range_: TargetRange;
    if (b.isIndex) {
      // Index-based tests (jumps, RSI, Nordic) — the relative band IS the range.
      range_ = range(relMin, relMax, b.unit, estimated(0.4, `estimated ${b.label} range for the estimated level`));
    } else if (massKg != null) {
      range_ = range(relMin * massKg, relMax * massKg, b.unit, estimated(0.45, `estimated from ${relMin}–${relMax}× bodyweight`));
    } else {
      range_ = nullRange(b.unit);
    }
    return {
      id: b.id,
      label: b.label,
      range: range_,
      relativeToBodyweight: { min: relMin, max: relMax },
      confidence: range_.confidence,
      note: "Estimated benchmark — not a requirement or a mandate.",
    };
  });
}

function range(min: number, max: number, unit: string, confidence: Confidence): TargetRange {
  return { min: round(Math.min(min, max)), max: round(Math.max(min, max)), unit, confidence };
}
function nullRange(unit: string): TargetRange {
  return { min: null, max: null, unit, confidence: unknown("body mass unavailable") };
}
function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function round(v: number): number {
  return Math.round(v * 100) / 100;
}
