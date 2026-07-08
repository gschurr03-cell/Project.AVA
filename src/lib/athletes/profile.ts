/**
 * Athlete physical & performance profile — shared metadata and validation.
 *
 * One source of truth for the profile fields added in migration
 * `0006_athlete_profile.sql`: their labels, units, input hints, and the
 * reasonable ranges that double as unit validation. Both the edit form and the
 * server action import from here so the UI and the DB agree on every bound.
 *
 * These values are storage/display only for now — nothing here is consumed by
 * metric calculation. Calibration (Day 57) and the PB predictor (Day 58) will
 * be the first readers.
 */

import { z } from "zod";

export type AthleteProfileKey =
  | "height_cm"
  | "weight_kg"
  | "leg_length_cm"
  | "trochanter_height_m"
  | "personal_best_60m"
  | "personal_best_100m"
  | "personal_best_200m"
  | "goal_60m"
  | "goal_100m"
  | "goal_200m";

/** All profile fields are optional numbers; unset is stored as NULL. */
export type AthleteProfileValues = Record<AthleteProfileKey, number | null>;

export interface ProfileFieldDef {
  key: AthleteProfileKey;
  label: string;
  unit: string;
  /** Inclusive lower bound; mirrors the DB CHECK constraint. */
  min: number;
  /** Inclusive upper bound; mirrors the DB CHECK constraint. */
  max: number;
  /** `<input step>` — finer for sprint times than for body measurements. */
  step: number;
  /** Which fieldset the input renders under. */
  group: "physical" | "personalBest" | "goal";
  /** Optional coach-facing help text shown under the input. */
  help?: string;
}

/**
 * Ordered field definitions. `min`/`max` are kept in lockstep with the CHECK
 * constraints in `0006_athlete_profile.sql` — update both together.
 */
export const PROFILE_FIELDS: readonly ProfileFieldDef[] = [
  { key: "height_cm", label: "Height", unit: "cm", min: 50, max: 260, step: 0.1, group: "physical" },
  { key: "weight_kg", label: "Weight", unit: "kg", min: 20, max: 250, step: 0.1, group: "physical" },
  {
    key: "leg_length_cm",
    label: "Leg length",
    unit: "cm",
    min: 30,
    max: 160,
    step: 0.1,
    group: "physical",
    help: "Measured from the greater trochanter (the bony point on the outside of the hip) straight down to the floor.",
  },
  {
    key: "trochanter_height_m",
    label: "Trochanter height",
    unit: "m",
    min: 0.3,
    max: 1.6,
    step: 0.01,
    group: "physical",
    help: "Measured vertically from the greater trochanter to the ground. Used directly in stride ÷ trochanter-height ratio.",
  },
  { key: "personal_best_60m", label: "60 m", unit: "s", min: 5, max: 20, step: 0.01, group: "personalBest" },
  { key: "personal_best_100m", label: "100 m", unit: "s", min: 8, max: 30, step: 0.01, group: "personalBest" },
  { key: "personal_best_200m", label: "200 m", unit: "s", min: 16, max: 60, step: 0.01, group: "personalBest" },
  { key: "goal_60m", label: "60 m", unit: "s", min: 5, max: 20, step: 0.01, group: "goal" },
  { key: "goal_100m", label: "100 m", unit: "s", min: 8, max: 30, step: 0.01, group: "goal" },
  { key: "goal_200m", label: "200 m", unit: "s", min: 16, max: 60, step: 0.01, group: "goal" },
] as const;

/** A blank number field: "" / whitespace → null, otherwise a finite number. */
function numericField(def: ProfileFieldDef) {
  return z.preprocess(
    (raw) => {
      const s = String(raw ?? "").trim();
      if (s === "") return null;
      const n = Number(s);
      // A non-numeric entry stays a string so the type error below fires with a
      // friendly message instead of a raw "received nan".
      return Number.isFinite(n) ? n : s;
    },
    z
      .number({ invalid_type_error: `${def.label} must be a number` })
      .min(def.min, `${def.label} must be at least ${def.min} ${def.unit}`)
      .max(def.max, `${def.label} must be at most ${def.max} ${def.unit}`)
      .nullable(),
  );
}

/**
 * Validates the full profile payload. Every field is independently optional;
 * out-of-range values are rejected with a coach-readable message naming the
 * field and its bound.
 */
export const athleteProfileSchema = z.object(
  Object.fromEntries(PROFILE_FIELDS.map((def) => [def.key, numericField(def)])),
) as unknown as z.ZodType<AthleteProfileValues>;

/** Format a stored numeric value for read-only display, or "—" when unset. */
export function formatProfileValue(value: number | null | undefined, unit: string): string {
  if (value == null) return "—";
  return `${value} ${unit}`;
}
