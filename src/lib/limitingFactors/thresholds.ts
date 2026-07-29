/**
 * Centralized, named, testable thresholds for the Limiting Factors engine.
 *
 * Every threshold declares its provenance so nothing is a scattered magic number. AVA has
 * NO validated individualized step-length / step-frequency expectation model yet, so those
 * comparisons resolve to `unavailable` (see resolveTargets) — we do not invent a scientific
 * range. The only thresholds used for real detection are the WITHIN-athlete asymmetry
 * bands, which are provisional and clearly labeled as such.
 */

export type ThresholdProvenance = "validated" | "provisional" | "research_derived" | "coach_configured";

export interface NamedThreshold {
  readonly value: number;
  readonly provenance: ThresholdProvenance;
  readonly note: string;
}

/**
 * Left–right asymmetry bands (percentage difference relative to the larger side).
 * PROVISIONAL — chosen to be conservative; requires validation against force-plate /
 * timing-gate ground truth before being promoted to `validated`.
 * TODO(science): validate asymmetry bands against measured side-to-side ground-truth.
 */
export const ASYMMETRY_BANDS = {
  /** Below this, treat as balanced (no meaningful asymmetry reported). */
  negligiblePct: { value: 3, provenance: "provisional", note: "≤3% is within typical stride-to-stride variability; reported as balanced." } as NamedThreshold,
  /** Below this (and ≥ negligible) → low impact. */
  lowPct: { value: 6, provenance: "provisional", note: "3–6% asymmetry: low impact." } as NamedThreshold,
  /** Below this → moderate impact. */
  moderatePct: { value: 10, provenance: "provisional", note: "6–10% asymmetry: moderate impact." } as NamedThreshold,
  /** At or above `moderatePct` → high impact. */
} as const;

/** Minimum valid samples PER SIDE before a side-specific comparison is trustworthy. */
export const MIN_SIDE_SAMPLES: NamedThreshold = {
  value: 2,
  provenance: "provisional",
  note: "At least 2 valid steps per side are required before reporting a side comparison.",
};

/** Minimum valid steps before any spatial limiter is considered. */
export const MIN_VALID_STEPS: NamedThreshold = {
  value: 4,
  provenance: "provisional",
  note: "Fewer than 4 valid in-zone steps is too little to rank limiters.",
};
