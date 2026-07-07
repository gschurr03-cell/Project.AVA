/**
 * Limiting-Factor Diagnosis (Day 79 — trusted-source rewrite).
 *
 * AVA's primary customer output: a ranked list of what to work on next, plus the
 * top-speed headroom from doing so. It reads ONLY from {@link TrustedMetrics} — the
 * single source of truth — so the diagnosis can never disagree with the Trusted
 * Sprint Metrics card.
 *
 * Ranking uses the four trusted metrics: Frequency, Step Length, Top Speed, and
 * Average Velocity. Each is compared to an elite benchmark:
 *  - If any metric is below its elite target, those are TRUE limiting factors,
 *    ranked biggest deficit first → "Top Limiting Factors".
 *  - If every metric is already elite, the metrics closest to their threshold are
 *    ranked as "Next Performance Unlocks".
 * Either way AVA ALWAYS returns a ranked #1/#2/#3 — it never says "nothing stands out".
 *
 * The one modeling layer is the velocity-gain estimate, from the exact sprint
 * identity top speed = step length × frequency (v = L·f), which AVA already uses in
 * `measurements.ts`. Frequency and Step Length are the direct LEVERS of that
 * identity; Top Speed and Average Velocity are OUTCOMES (results of the levers), so
 * they never contribute a separate modeled gain — that would double-count.
 *
 * Pure & deterministic: no I/O, inputs read-only, same input → same output.
 */

import type { IntelligenceConfidence } from "./index";
import type { TrustedMetrics } from "./trustedMetrics";
import { evaluateTrochanterStepLength, type TrochanterEvaluation } from "./trochanterOptimizer";

/** How many factors we surface as the headline diagnosis. */
export const MAX_FACTORS = 3;

/** Cap on the fractional deficit fed into the velocity model, so a wildly off-target
 *  reading can't imply an implausible gain. */
const DEFICIT_FRACTION_CAP = 0.5;

/** "limiting" when any trusted metric is below elite; "unlocks" when all are elite. */
export type DiagnosisMode = "limiting" | "unlocks";

/** Coarse impact rating shown instead of an exact m/s figure (Day 79b) — we're not
 *  yet confident enough in the point estimate to publish it per factor. */
export type ImpactBand = "high" | "medium" | "low";

/** Band a modeled top-speed gain by its fraction of current top speed. */
function impactBandFor(gainMps: number | null, base: number | null): ImpactBand | null {
  if (gainMps == null || gainMps <= 0 || base == null || base <= 0) return null;
  const fraction = gainMps / base;
  if (fraction >= 0.04) return "high";
  if (fraction >= 0.02) return "medium";
  return "low";
}

/**
 * The four trusted metrics AVA ranks, each with its elite benchmark. All are
 * higher-is-better. LEVERS (frequency, step length) are the direct terms of
 * v = L·f; OUTCOMES (top speed, average velocity) are the results those levers
 * produce, surfaced for context but never a modeled velocity gain.
 *
 * Elite targets: frequency + step length mirror the shared coaching thresholds;
 * top speed (~41 km/h) and average velocity are world-class sprint floors.
 */
interface TrustedFactorDef {
  key: string;
  label: string;
  unit: string;
  eliteTarget: number;
  eliteText: string;
  kind: "lever" | "outcome";
  get: (t: TrustedMetrics) => number | null;
  why: string;
}

const TRUSTED_FACTOR_DEFS: TrustedFactorDef[] = [
  {
    key: "frequency",
    label: "Frequency",
    unit: "Hz",
    eliteTarget: 4.8,
    eliteText: "4.8–5.2 Hz",
    kind: "lever",
    get: (t) => t.frequencyHz,
    why: "Turnover sets how fast each leg resets. Raising frequency lifts top speed even at the same step length.",
  },
  {
    // Internal key kept as "stepLength" for stability; UI label is "Stride Length"
    // (AVA stride = opposite-foot contact distance). Uses the PEAK stride via
    // trusted.strideLengthM when available.
    key: "stepLength",
    label: "Stride Length",
    unit: "m",
    eliteTarget: 2.45,
    eliteText: "2.45–2.75 m",
    kind: "lever",
    get: (t) => t.strideLengthM,
    why: "Covering more ground per stride raises top speed without needing faster turnover.",
  },
  {
    key: "topSpeed",
    label: "Top Speed",
    unit: "m/s",
    eliteTarget: 11.5,
    eliteText: "11.5+ m/s",
    kind: "outcome",
    get: (t) => t.topSpeedMps,
    why: "Your measured maximum velocity — the ceiling that step length and frequency combine to produce.",
  },
  {
    key: "avgVelocity",
    label: "Average Velocity",
    unit: "m/s",
    eliteTarget: 10.9,
    eliteText: "10.9+ m/s",
    kind: "outcome",
    get: (t) => t.avgVelocityMps,
    why: "Your average speed across the timed zone — reflects how well you reach and hold top speed.",
  },
];

/** One customer-facing factor, ready to render. */
export interface LimitingFactor {
  rank: number; // 1 = biggest limiter / closest unlock
  key: string;
  label: string;
  unit: string;
  currentValue: number;
  currentText: string; // "2.16 m"
  eliteTargetValue: number;
  eliteBenchmarkText: string; // "2.45–2.75 m"
  /** True when below elite (a real deficit); false when already elite. */
  belowElite: boolean;
  /** How far below elite, as a %; 0 when already elite. */
  deficitPct: number;
  /** How far above elite, as a %; 0 when below. Used to rank "unlocks". */
  marginPct: number;
  /** "0.29 m below elite" / "0.05 Hz above elite". */
  statusText: string;
  /** LEVER: modeled top-speed gain (m/s) from reaching elite. OUTCOME/elite: null.
   *  Kept for the Performance Potential aggregation; NOT shown per factor. */
  estimatedVelocityGainMps: number | null;
  /** Coarse impact rating shown in place of the exact m/s gain. Null for outcomes /
   *  already-elite metrics (no modeled gain to band). */
  impactBand: ImpactBand | null;
  /** True for the outcome metrics (top speed, average velocity). */
  isOutcome: boolean;
  confidence: IntelligenceConfidence;
  why: string;
  /** Body-proportion framing for the STEP-LENGTH factor when leg length is known
   *  (Day 80). Null for every other factor / when leg length is unavailable. */
  trochanter: FactorTrochanter | null;
}

/** Compact trochanter context carried on the stride-length factor for display.
 *  The ratio uses the PEAK stride length (Day 82). */
export interface FactorTrochanter {
  /** peakStride ÷ trochanter length, e.g. 2.33. */
  ratio: number;
  ratioText: string; // "2.33×"
  bandLabel: string; // "Rising star"
  nextTargetRatio: number | null;
  nextTargetRatioText: string | null; // "2.50× trochanter"
  nextTargetStepText: string | null; // "2.48 m"
  /** "2.50–2.70× · 2.48–2.67 m" — Olympic-caliber window for this athlete. */
  olympicText: string;
  /** Zone average stride (context beside the peak), e.g. "2.16 m". */
  avgStrideText: string | null;
  /** Stride retention (avg ÷ peak), e.g. "93.5%". */
  retentionText: string | null;
  /** Set when the peak is strong but the average is lagging. */
  retentionNote: string | null;
}

/** Peak trochanter ratio at/above which the peak stride is considered "strong". */
const PEAK_STRONG_RATIO = 2.3;
/** Below this retention %, a strong peak with a lagging average is flagged. */
const RETENTION_LAG_PCT = 92;

/** An override target for a factor's scoring (Day 81) — used for the STEP-LENGTH
 *  factor when a trochanter ratio target is available. `value` is the target in the
 *  metric's own unit; `review` marks a measurement-check case (no real target). */
interface FactorTarget {
  value: number | null;
  text: string;
  review: boolean;
}

/**
 * Performance Velocity Estimation (Day 83). A CONSERVATIVE, realistic estimate of
 * theoretical meet top velocity: practice peak velocity plus a 2–3% meet-performance
 * uplift. This deliberately replaces the old "achievable top speed" model, which
 * blended lever gains and could imply impossible +2 m/s jumps. NOT a race-time
 * prediction.
 *
 * TODO (future race prediction): model 0–20 m acceleration, max velocity, and speed
 * maintenance separately — do not derive 100 m / 200 m times from peak velocity alone.
 */
export interface PerformancePotential {
  available: boolean;
  /** Trusted practice peak velocity (m/s). */
  practiceTopSpeedMps: number | null;
  /** Low end of the estimated meet velocity range = practice × 1.02. */
  meetLowMps: number | null;
  /** High end of the estimated meet velocity range = practice × 1.03. */
  meetHighMps: number | null;
  /** Plain-language basis (always present). */
  basis: string;
}

/** Conservative meet-performance uplift applied to practice peak velocity. */
const MEET_UPLIFT_LOW = 1.02;
const MEET_UPLIFT_HIGH = 1.03;
const PERFORMANCE_VELOCITY_BASIS =
  "Based on practice peak velocity plus a conservative 2–3% meet-performance uplift. This is not a full race-time prediction.";

export interface LimitingFactorDiagnosis {
  available: boolean;
  mode: DiagnosisMode;
  factors: LimitingFactor[];
  potential: PerformancePotential;
  confidence: IntelligenceConfidence;
}

function fmt(value: number, unit: string): string {
  if (unit === "ms" || unit === "°") return `${Math.round(value)} ${unit}`;
  return `${value.toFixed(2)} ${unit}`;
}

/** Build the step-length scoring target from a trochanter evaluation. Non-review
 *  cases target the next milestone (e.g. 2.30× = 2.28 m); at the top of the olympic
 *  band there is no next target ("maintain"). */
function trochanterOverride(tro: TrochanterEvaluation): FactorTarget {
  if (tro.reviewFlag) {
    return { value: null, text: "Ratio > 2.70× — measurement check", review: true };
  }
  if (tro.nextTargetRatio == null || tro.nextTargetStepLengthM == null) {
    return { value: null, text: "Olympic caliber — maintain", review: false };
  }
  return {
    value: tro.nextTargetStepLengthM,
    text: `${tro.nextTargetRatio.toFixed(2)}× trochanter (${tro.nextTargetStepLengthM.toFixed(2)} m)`,
    review: false,
  };
}

/** One factor + the modeling scratch we rank on, built from a trusted value. */
interface ScoredFactor {
  factor: LimitingFactor;
  def: TrustedFactorDef;
  /** Lever gain in m/s from reaching elite (0 for outcomes / already elite). */
  leverGainMps: number;
}

function scoreFactor(
  def: TrustedFactorDef,
  current: number,
  topSpeedBase: number | null,
  stepLengthConfidence: IntelligenceConfidence,
  override?: FactorTarget,
): ScoredFactor {
  // When an override target is supplied (trochanter next-target for step length), rank
  // against THAT instead of the generic metre elite target. A `review` override means
  // no real target (measurement check) — treated as no deficit.
  const review = override?.review === true;
  const targetValue = review ? current : (override?.value ?? def.eliteTarget);
  const targetText = override ? override.text : def.eliteText;

  const deficit = review ? 0 : Math.max(0, targetValue - current);
  const belowElite = deficit > 0;
  const deficitPct = !review && targetValue > 0 ? (deficit / targetValue) * 100 : 0;
  const marginPct = !review && targetValue > 0 ? Math.max(0, (current - targetValue) / targetValue) * 100 : 0;

  // v = L·f: raising a LEVER by fraction φ raises top speed by ~φ. Outcomes are the
  // result of the levers, so they never carry their own modeled gain.
  const deficitFraction = Math.min(DEFICIT_FRACTION_CAP, targetValue > 0 ? deficit / targetValue : 0);
  const leverGainMps =
    def.kind === "lever" && belowElite && topSpeedBase != null
      ? Number((topSpeedBase * deficitFraction).toFixed(2))
      : 0;

  const statusText = review
    ? "flagged for review"
    : belowElite
      ? `${fmt(deficit, def.unit)} below elite`
      : marginPct > 0.05
        ? `${fmt(current - targetValue, def.unit)} above elite`
        : "at elite";

  const confidence: IntelligenceConfidence = def.key === "stepLength" ? stepLengthConfidence : "high";

  const estimatedVelocityGainMps = def.kind === "lever" && belowElite ? leverGainMps : null;

  const factor: LimitingFactor = {
    rank: 0,
    key: def.key,
    label: def.label,
    unit: def.unit,
    currentValue: current,
    currentText: fmt(current, def.unit),
    eliteTargetValue: targetValue,
    eliteBenchmarkText: targetText,
    belowElite,
    deficitPct: Number(deficitPct.toFixed(1)),
    marginPct: Number(marginPct.toFixed(1)),
    statusText,
    estimatedVelocityGainMps,
    impactBand: impactBandFor(estimatedVelocityGainMps, topSpeedBase),
    isOutcome: def.kind === "outcome",
    confidence,
    why: def.why,
    trochanter: null, // attached later for the step-length factor when leg length is known
  };

  return { factor, def, leverGainMps };
}

/**
 * Build the ranked diagnosis + Performance Potential from the trusted metrics.
 * ALWAYS returns ranked factors when the trusted metrics exist. Pure.
 */
export function deriveLimitingFactors(
  trusted: TrustedMetrics,
  options?: { legLengthCm?: number | null },
): LimitingFactorDiagnosis {
  const stepLengthConf = trusted.stepLengthConfidence as IntelligenceConfidence;
  const topSpeedBase = trusted.topSpeedMps ?? trusted.avgVelocityMps ?? null;

  // Day 81/82: when leg length is known, judge STRIDE LENGTH by body proportions
  // (trochanter ratio) instead of the generic metre elite target — using the PEAK
  // stride (trusted.strideLengthM). A ratio > 2.70× is a measurement check, NOT a
  // limiter.
  const troEval =
    options?.legLengthCm != null && trusted.strideLengthM != null
      ? evaluateTrochanterStepLength({ stepLengthM: trusted.strideLengthM, legLengthCm: options.legLengthCm })
      : null;

  const scored = TRUSTED_FACTOR_DEFS.map((def) => {
    const value = def.get(trusted);
    if (value == null) return null;
    if (def.key === "stepLength" && troEval?.reviewFlag) return null; // measurement check, not a limiter
    const override = def.key === "stepLength" && troEval ? trochanterOverride(troEval) : undefined;
    return scoreFactor(def, value, topSpeedBase, stepLengthConf, override);
  }).filter((s): s is ScoredFactor => s != null);

  // Attach the trochanter display context to the stride-length factor (non-review),
  // including the zone AVERAGE stride + retention for context.
  if (troEval) {
    const stepScored = scored.find((s) => s.def.key === "stepLength");
    if (stepScored) {
      const oly = troEval.olympicRangeStepLengthM;
      const avg = trusted.avgStrideLengthM;
      const retention = trusted.strideRetentionPct;
      // "Peak strong but retention lagging": a good peak ratio the athlete isn't
      // holding across the zone.
      const retentionLagging =
        troEval.ratio >= PEAK_STRONG_RATIO && retention != null && retention < RETENTION_LAG_PCT;
      stepScored.factor.trochanter = {
        ratio: troEval.ratio,
        ratioText: `${troEval.ratio.toFixed(2)}×`,
        bandLabel: troEval.label,
        nextTargetRatio: troEval.nextTargetRatio,
        nextTargetRatioText:
          troEval.nextTargetRatio != null ? `${troEval.nextTargetRatio.toFixed(2)}× trochanter` : null,
        nextTargetStepText:
          troEval.nextTargetStepLengthM != null ? `${troEval.nextTargetStepLengthM.toFixed(2)} m` : null,
        olympicText: `2.50–2.70× · ${oly.min.toFixed(2)}–${oly.max.toFixed(2)} m`,
        avgStrideText: avg != null ? `${avg.toFixed(2)} m` : null,
        retentionText: retention != null ? `${retention.toFixed(1)}%` : null,
        retentionNote: retentionLagging
          ? "Peak stride expression is strong, but zone retention is lagging."
          : null,
      };
    }
  }

  const anyDeficit = scored.some((s) => s.factor.belowElite);
  const mode: DiagnosisMode = anyDeficit ? "limiting" : "unlocks";

  // Rank. LIMITING: biggest deficit first. UNLOCKS: closest to the threshold first
  // (smallest margin). Tie-break prefers actionable LEVERS over outcomes, then key.
  const kindRank = (s: ScoredFactor) => (s.def.kind === "lever" ? 0 : 1);
  const rankedScored = [...scored].sort((a, b) => {
    const primary =
      mode === "limiting"
        ? b.factor.deficitPct - a.factor.deficitPct
        : a.factor.marginPct - b.factor.marginPct;
    if (Math.abs(primary) > 1e-9) return primary;
    return kindRank(a) - kindRank(b) || a.def.key.localeCompare(b.def.key);
  });

  const top = rankedScored.slice(0, MAX_FACTORS);
  top.forEach((s, i) => (s.factor.rank = i + 1));
  const factors = top.map((s) => s.factor);

  // Performance Velocity Estimation: conservative meet uplift on the trusted practice
  // peak velocity (2–3%). No lever blending — that could imply impossible jumps.
  let potential: PerformancePotential;
  if (topSpeedBase != null && topSpeedBase > 0) {
    potential = {
      available: true,
      practiceTopSpeedMps: Number(topSpeedBase.toFixed(2)),
      meetLowMps: Number((topSpeedBase * MEET_UPLIFT_LOW).toFixed(2)),
      meetHighMps: Number((topSpeedBase * MEET_UPLIFT_HIGH).toFixed(2)),
      basis: PERFORMANCE_VELOCITY_BASIS,
    };
  } else {
    potential = {
      available: false,
      practiceTopSpeedMps: null,
      meetLowMps: null,
      meetHighMps: null,
      basis: "Calibrate a timing zone to measure top speed, then AVA can estimate meet velocity.",
    };
  }

  return {
    available: factors.length > 0,
    mode,
    factors,
    potential,
    confidence: stepLengthConf,
  };
}
