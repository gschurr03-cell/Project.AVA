/**
 * Trochanter Step-Length Optimizer (Day 80).
 *
 * AVA should not judge step length by a raw metre value alone — a 2.16 m step is
 * elite for a short athlete and mediocre for a tall one. This module scales step
 * length by the athlete's body proportions using the TROCHANTER LENGTH as the
 * reference:
 *
 *   trochanterRatio = strideLengthM / trochanterHeightM
 *
 * The band labels below are PRODUCT LANGUAGE for now. Thresholds are centralized in
 * {@link TROCHANTER_BANDS} / {@link TARGET_MILESTONES} so they can be tuned later
 * without touching callers.
 *
 * Pure & deterministic: no I/O, inputs read-only.
 */

export type TrochanterStepLengthBand =
  | "below-elite"
  | "elite-minimum"
  | "solid"
  | "rising-star"
  | "olympic"
  | "review";

interface BandDef {
  band: TrochanterStepLengthBand;
  /** Inclusive lower ratio bound; the band runs up to the next band's bound. */
  minRatio: number;
  label: string;
  description: string;
}

/**
 * Centralized band thresholds (ratio = stepLength ÷ trochanter length):
 *   < 2.00×          Below elite minimum
 *   2.00× – < 2.20×  Elite minimum
 *   2.20× – < 2.30×  Solid / okay
 *   2.30× – < 2.50×  Rising star
 *   2.50× – 2.70×    Olympic caliber
 *   > 2.70×          Flag for review (possible measurement issue)
 */
export const TROCHANTER_BANDS: BandDef[] = [
  {
    band: "below-elite",
    minRatio: 0,
    label: "Below elite minimum",
    description:
      "Step length is below the elite minimum for your body proportions — the biggest step-length opportunity.",
  },
  {
    band: "elite-minimum",
    minRatio: 2.0,
    label: "Elite minimum",
    description:
      "At the elite minimum for your leg length — a solid base with clear room to grow.",
  },
  {
    band: "solid",
    minRatio: 2.2,
    label: "Solid",
    description: "Solid step length for your proportions — okay, with more available.",
  },
  {
    band: "rising-star",
    minRatio: 2.3,
    label: "Rising star",
    description: "Rising-star step length — you cover ground well for your build.",
  },
  {
    band: "olympic",
    minRatio: 2.5,
    label: "Olympic caliber",
    description: "Olympic-caliber step length for your body proportions.",
  },
  {
    band: "review",
    minRatio: 2.7,
    label: "Flag for review",
    description:
      "Ratio is unusually high — flag for review (possible measurement or calibration issue).",
  },
];

/** Olympic-caliber ratio window (inclusive). */
export const OLYMPIC_RATIO = { min: 2.5, max: 2.7 } as const;

/** Above this the ratio is flagged as a likely measurement issue. */
export const REVIEW_RATIO = 2.7;

/**
 * Aspirational next-target milestones (ratios). We deliberately skip the "Solid"
 * band (2.20×) as a target: from Elite minimum the meaningful next milestone is
 * Rising star (2.30×), then Olympic min (2.50×), then Olympic max (2.70×). A
 * below-elite athlete first targets the Elite minimum (2.00×).
 */
export const TARGET_MILESTONES = [2.0, 2.3, 2.5, 2.7] as const;

function bandDefForRatio(ratio: number): BandDef {
  // Walk from the top so the highest matching floor wins; olympic is inclusive of 2.70.
  for (let i = TROCHANTER_BANDS.length - 1; i >= 0; i--) {
    if (ratio >= TROCHANTER_BANDS[i].minRatio) return TROCHANTER_BANDS[i];
  }
  return TROCHANTER_BANDS[0];
}

export interface NextTrochanterTarget {
  nextTargetRatio: number | null;
  band: TrochanterStepLengthBand | null;
  label: string | null;
}

/**
 * The next aspirational milestone strictly above the current ratio, or nulls when
 * the athlete is already at/above the top milestone (2.70×).
 */
export function getNextTrochanterTarget({
  currentRatio,
}: {
  currentRatio: number;
}): NextTrochanterTarget {
  const next = TARGET_MILESTONES.find((m) => m > currentRatio + 1e-9);
  if (next == null) return { nextTargetRatio: null, band: null, label: null };
  const def = bandDefForRatio(next);
  return { nextTargetRatio: next, band: def.band, label: def.label };
}

export interface TrochanterEvaluation {
  /** Greater-trochanter-to-floor height in metres. */
  trochanterLengthM: number;
  /** stepLength ÷ trochanter length. */
  ratio: number;
  band: TrochanterStepLengthBand;
  label: string;
  description: string;
  /** Next aspirational milestone ratio, or null at the top. */
  nextTargetRatio: number | null;
  /** Step length (m) that reaching the next milestone would require, or null. */
  nextTargetStepLengthM: number | null;
  /** Step-length window (m) for Olympic-caliber, for this athlete's proportions. */
  olympicRangeStepLengthM: { min: number; max: number };
  /** True when ratio > 2.70× — likely a measurement/calibration issue. */
  reviewFlag: boolean;
}

/**
 * Evaluate step length against the athlete's body proportions. Returns `null` when
 * either input is missing/invalid (no leg length, no step length) so callers show an
 * "unavailable" state rather than a bogus ratio.
 */
export function evaluateTrochanterStepLength({
  stepLengthM,
  trochanterHeightM,
}: {
  stepLengthM: number | null | undefined;
  trochanterHeightM: number | null | undefined;
}): TrochanterEvaluation | null {
  if (
    stepLengthM == null ||
    trochanterHeightM == null ||
    trochanterHeightM <= 0 ||
    stepLengthM <= 0
  ) {
    return null;
  }

  const trochanterLengthM = trochanterHeightM;
  const ratio = stepLengthM / trochanterLengthM;
  const def = bandDefForRatio(ratio);
  const { nextTargetRatio } = getNextTrochanterTarget({ currentRatio: ratio });

  return {
    trochanterLengthM,
    ratio,
    band: def.band,
    label: def.label,
    description: def.description,
    nextTargetRatio,
    nextTargetStepLengthM: nextTargetRatio != null ? nextTargetRatio * trochanterLengthM : null,
    olympicRangeStepLengthM: {
      min: OLYMPIC_RATIO.min * trochanterLengthM,
      max: OLYMPIC_RATIO.max * trochanterLengthM,
    },
    reviewFlag: ratio > REVIEW_RATIO,
  };
}
