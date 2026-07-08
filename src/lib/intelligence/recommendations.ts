/**
 * Coaching Recommendations V2 — turn AVA's trusted, calibrated 20 m fly measurements
 * into specific "what should I do next?" guidance a coach can act on this week.
 *
 * Design rules (all enforced here, none in the UI):
 *  - PRIMARY causes read ONLY 60 fps-trusted metrics — velocity, step/stride length,
 *    frequency, velocity consistency, left/right trends, and calibration/tracking
 *    quality. Frame-rate-limited timing (ground contact, flight, contact/flight ratio,
 *    stiffness, toe-off / foot-strike, exact joint-angle timing) is NEVER a primary
 *    cause; it can only appear as an EXPERIMENTAL note, gated by {@link metricTrust},
 *    and it never influences the trusted priority order.
 *  - Benchmarks mirror the limiting-factor diagnosis so the two surfaces agree.
 *  - Honest about data quality: when calibration or tracking is weak, the recording-
 *    setup recommendation leads and training advice is de-trusted rather than asserted.
 *  - No fabricated numbers, no fake zeros, no injury diagnosis.
 *
 * Pure & deterministic: no I/O, inputs read-only, same input → same output. Changes no
 * metric math — it only reads the trusted values and formats guidance.
 */

import type { TrustedMetrics } from "./trustedMetrics";
import type { SprintMeasurements } from "@/lib/benchmark/measurements";
import { analyzeAsymmetry, ASYMMETRY_MIN_PCT } from "./asymmetry";
import { evaluateTrochanterStepLength } from "./trochanterOptimizer";
import {
  metricTrust,
  isMetricValueUnavailable,
  isPrecisionLimited,
  NEEDS_HIGHER_FPS_MESSAGE,
} from "@/lib/benchmark/precision";

export type RecommendationCategory =
  | "speed"
  | "stride_length"
  | "frequency"
  | "rhythm"
  | "asymmetry"
  | "calibration"
  | "tracking"
  | "experimental";

export type Severity = "low" | "moderate" | "high";
export type Confidence = "low" | "medium" | "high";

/** One measured fact backing a recommendation. `value` is always a formatted string
 *  (never a raw/zero number), so the UI can render it verbatim. */
export interface RecommendationEvidence {
  label: string;
  value: string;
  benchmark?: string;
  interpretation: string;
}

/** The structured recommendation the UI renders. */
export interface Recommendation {
  id: string;
  category: RecommendationCategory;
  title: string;
  severity: Severity;
  confidence: Confidence;
  /** True only when this is a 60 fps-trusted cause AND the recording supports it. */
  trusted: boolean;
  metricEvidence: RecommendationEvidence[];
  whyItMatters: string;
  coachingCue: string;
  trainingFocus: string[];
  nextSessionGoal: string;
  /** Global sort order; lower = shown first. */
  displayPriority: number;
}

export interface RecommendationReport {
  available: boolean;
  /** Trusted causes, sorted (most important first). UI shows the top 1–3. */
  recommendations: Recommendation[];
  /** Coming-soon / FPS-gated items. Never influence the trusted priority. */
  experimental: Recommendation[];
}

/** Quality signals the page already derives from the recording. */
export interface RecommendationQuality {
  /** Two timing gates + a known distance are set. */
  calibrationPresent: boolean;
  /** Fraction of frames with a tracked foot (0–1). */
  trackingCoverage: number | null;
  /** Mean pose keypoint confidence across the clip (0–1). */
  poseConfidence: number | null;
  /** Overall 0–100 recording-quality score. */
  score: number | null;
}

export interface RecommendationInputs {
  trusted: TrustedMetrics | null;
  measurements: SprintMeasurements | null;
  activeFps: number | null;
  trochanterHeightM?: number | null;
  quality?: RecommendationQuality | null;
}

// Elite benchmarks — mirror intelligence/limitingFactors.ts so the two surfaces agree.
const FREQ_ELITE = 4.8;
const FREQ_ELITE_TEXT = "4.8–5.2 Hz";
const STRIDE_ELITE = 2.45;
const STRIDE_ELITE_TEXT = "2.45–2.75 m";
const TOPSPEED_ELITE = 11.5;
const TOPSPEED_ELITE_TEXT = "11.5+ m/s";
const AVGVEL_ELITE = 10.9;
const AVGVEL_ELITE_TEXT = "10.9+ m/s";

/** Velocity-consistency (rhythm) thresholds on the velocity spread %, from measurements. */
const RHYTHM_SPREAD_MODERATE = 12;
const RHYTHM_SPREAD_HIGH = 18;

/** Tracking thresholds (0–1). */
const TRACK_COVERAGE_MIN = 0.6;
const POSE_CONF_MIN = 0.5;

const SEVERITY_RANK: Record<Severity, number> = { high: 3, moderate: 2, low: 1 };

function severityFromPct(pct: number): Severity {
  if (pct >= 12) return "high";
  if (pct >= 5) return "moderate";
  return "low";
}

function fmt(value: number, decimals: number, unit: string): string {
  return `${value.toFixed(decimals)} ${unit}`;
}

/** Overall confidence the recording earns, independent of any single metric. */
function qualityConfidence(q: RecommendationQuality | null | undefined): Confidence {
  if (!q) return "medium"; // unknown quality → neither trusted nor dismissed
  if (!q.calibrationPresent) return "low";
  const tc = q.trackingCoverage;
  const pc = q.poseConfidence;
  const low = (tc != null && tc < TRACK_COVERAGE_MIN) || (pc != null && pc < POSE_CONF_MIN);
  if (low) return "low";
  const mid = (tc != null && tc < 0.8) || (pc != null && pc < 0.7);
  return mid ? "medium" : "high";
}

const CONF_ORDER: Confidence[] = ["low", "medium", "high"];
function minConfidence(a: Confidence, b: Confidence): Confidence {
  return CONF_ORDER.indexOf(a) <= CONF_ORDER.indexOf(b) ? a : b;
}

/** Internal scratch carried while sorting, stripped from the returned object. */
interface Draft extends Recommendation {
  _group: number; // 0 = blocking recording issue, 1 = trusted training, 2 = experimental
  _magnitude: number; // deficit / difference / spread %, for tie-breaks
}

/** A trusted metric value that is present and not a "not measured" 0. */
function usable(key: string, value: number | null | undefined): value is number {
  return value != null && !isMetricValueUnavailable(key, value);
}

/**
 * Build the ranked coaching recommendations from the trusted metrics + measurements +
 * recording quality. Returns `available: false` with empty lists when there is no
 * calibrated trusted data — never a fabricated recommendation.
 */
export function buildRecommendations(inputs: RecommendationInputs): RecommendationReport {
  const { trusted, measurements, activeFps, trochanterHeightM = null, quality = null } = inputs;

  const empty: RecommendationReport = { available: false, recommendations: [], experimental: [] };
  if (!trusted) return empty;

  const qConf = qualityConfidence(quality);
  // "Trustworthy enough to give training advice" — calibrated with adequate tracking.
  const recordingTrustworthy = qConf !== "low";
  const drafts: Draft[] = [];

  // ---- 6. Calibration / tracking limiters (lead when the recording is weak) ----
  const calibrationMissing = quality != null && !quality.calibrationPresent;
  const trackingWeak =
    quality != null &&
    ((quality.trackingCoverage != null && quality.trackingCoverage < TRACK_COVERAGE_MIN) ||
      (quality.poseConfidence != null && quality.poseConfidence < POSE_CONF_MIN));

  if (calibrationMissing) {
    drafts.push({
      _group: 0,
      _magnitude: 100,
      id: "calibration",
      category: "calibration",
      title: "Calibrate the timing zone before trusting detailed mechanics",
      severity: "high",
      confidence: "high",
      trusted: true,
      metricEvidence: [
        {
          label: "Calibration",
          value: "Not set",
          benchmark: "2 gates + known distance",
          interpretation:
            "Without a known distance, step length, stride length and velocity have no real-world scale.",
        },
      ],
      whyItMatters:
        "Every trusted speed and length metric depends on a calibrated timing zone. Until it's set, detailed training advice would be built on an unscaled estimate.",
      coachingCue: "Mark the two timing gates and enter the exact distance between them.",
      trainingFocus: [
        "Place two gates a measured distance apart (e.g. a 20 m fly zone).",
        "Keep the camera square to the lane and stationary through the zone.",
      ],
      nextSessionGoal: "Re-record with the timing zone calibrated so AVA can trust the numbers.",
      displayPriority: 0,
    });
  } else if (trackingWeak) {
    const cov = quality?.trackingCoverage;
    drafts.push({
      _group: 0,
      _magnitude: 90,
      id: "tracking",
      category: "tracking",
      title: "Improve recording quality before trusting detailed mechanics",
      severity: "high",
      confidence: "high",
      trusted: true,
      metricEvidence: [
        {
          label: "Tracking coverage",
          value: cov != null ? `${Math.round(cov * 100)}%` : "Low",
          benchmark: "80%+",
          interpretation: "Large tracking gaps mean steps and positions are being missed.",
        },
      ],
      whyItMatters:
        "Weak pose tracking makes step counts, lengths and velocity noisier — strong training claims from this rep would overreach the data.",
      coachingCue: "Get the athlete larger and sharper in frame, side-on, evenly lit.",
      trainingFocus: [
        "Film side-on with the athlete filling more of the frame through the zone.",
        "Use a faster shutter and even lighting to cut motion blur on the feet.",
      ],
      nextSessionGoal: "Recapture with cleaner tracking, then act on the mechanics.",
      displayPriority: 0,
    });
  }

  // A training draft is de-trusted (and its confidence capped) when the recording
  // itself can't be trusted — advice still shown, but honestly flagged.
  const trainConfidence = (base: Confidence): Confidence =>
    recordingTrustworthy ? minConfidence(base, qConf) : "low";
  const trainTrusted = recordingTrustworthy;

  // ---- 2. Stride-length limiter (trusted, spatial) ----
  const strideKey = "avgStrideLengthM";
  const strideDiag = trusted.strideLengthM; // peak-preferred diagnosis value
  const troEval =
    trochanterHeightM != null && usable("strideLengthM", strideDiag)
      ? evaluateTrochanterStepLength({ stepLengthM: strideDiag, trochanterHeightM })
      : null;
  // A ratio > 2.70× is a measurement check, not a real limiter — don't recommend on it.
  if (usable("strideLengthM", strideDiag) && strideDiag < STRIDE_ELITE && !troEval?.reviewFlag) {
    const deficitPct = ((STRIDE_ELITE - strideDiag) / STRIDE_ELITE) * 100;
    const evidence: RecommendationEvidence[] = [
      {
        label: "Stride length (peak)",
        value: fmt(strideDiag, 2, "m"),
        benchmark: STRIDE_ELITE_TEXT,
        interpretation:
          "Opposite-foot ground covered per stride — the athlete isn't yet claiming enough horizontal displacement each step.",
      },
    ];
    if (usable(strideKey, trusted.avgStrideLengthM) && trusted.strideRetentionPct != null) {
      evidence.push({
        label: "Zone average · retention",
        value: `${trusted.avgStrideLengthM!.toFixed(2)} m · ${trusted.strideRetentionPct.toFixed(0)}%`,
        interpretation:
          "How much of the peak stride is held across the whole zone — low retention means the best strides aren't sustained.",
      });
    }
    if (troEval) {
      evidence.push({
        label: "Stride / trochanter ratio",
        value: `${troEval.ratio.toFixed(2)}×`,
        benchmark:
          troEval.nextTargetRatio != null ? `${troEval.nextTargetRatio.toFixed(2)}× next` : "2.50–2.70×",
        interpretation: `Body-proportioned stride (${troEval.label}) — normalises stride length to leg length.`,
      });
    }
    // Poor calibration must not let AVA overclaim a stride deficit.
    const strideConf = trainConfidence(
      trusted.stepLengthConfidence === "low" ? "low" : trusted.stepLengthConfidence,
    );
    drafts.push({
      _group: 1,
      _magnitude: deficitPct,
      id: "stride_length",
      category: "stride_length",
      title: "Stride length is capping ground covered per step",
      severity: severityFromPct(deficitPct),
      confidence: strideConf,
      trusted: trainTrusted,
      metricEvidence: evidence,
      whyItMatters:
        "Top speed is stride length × frequency. A short stride leaves ground unclaimed every step, so max velocity is capped before turnover even becomes the limiter.",
      coachingCue: "Think push the ground back and project — cover distance, don't just spin the legs.",
      trainingFocus: [
        "Wicket runs at a spacing that demands a longer, projected stride.",
        "Bounding and alternating bounds for horizontal power.",
        "Elastic / stiffness strength (hip-thrust, calf-Achilles, single-leg) so each contact returns more force.",
        "Hold an upright sprint posture with full hip extension at toe-off.",
      ],
      nextSessionGoal:
        troEval?.nextTargetStepLengthM != null
          ? `Prioritise projection and stiffness toward a ${troEval.nextTargetStepLengthM.toFixed(2)} m stride.`
          : "Prioritise projection and elastic stiffness rather than forcing turnover.",
      displayPriority: 0,
    });
  }

  // ---- 3. Frequency limiter (trusted) ----
  if (usable("strideFrequencyHz", trusted.frequencyHz) && trusted.frequencyHz! < FREQ_ELITE) {
    const f = trusted.frequencyHz!;
    const deficitPct = ((FREQ_ELITE - f) / FREQ_ELITE) * 100;
    drafts.push({
      _group: 1,
      _magnitude: deficitPct,
      id: "frequency",
      category: "frequency",
      title: "Turnover rhythm is limiting stride rate",
      severity: severityFromPct(deficitPct),
      confidence: trainConfidence("high"),
      trusted: trainTrusted,
      metricEvidence: [
        {
          label: "Step frequency",
          value: fmt(f, 2, "Hz"),
          benchmark: FREQ_ELITE_TEXT,
          interpretation:
            "How quickly each leg resets and returns to the ground — set by rhythm and ground return, not by consciously 'moving faster'.",
        },
      ],
      whyItMatters:
        "Frequency is the other half of top speed. Faster, rhythmic ground return raises max velocity at the same stride length — but chased as raw effort it usually shortens the stride instead.",
      coachingCue: "Cue quick, elastic ground contact and relaxed rhythm — fast down, not tense.",
      trainingFocus: [
        "Wicket runs and dribble / ankling drills for rhythmic ground return.",
        "Fast-leg and A-switch drills for a quicker knee/foot reset.",
        "Short flys (10–20 m) holding relaxed high turnover.",
        "Assisted-rhythm work only if the athlete already has sound mechanics.",
      ],
      nextSessionGoal: "Build rhythmic turnover through wickets — keep the stride long while quickening ground return.",
      displayPriority: 0,
    });
  }

  // ---- 1. Velocity limiter (trusted outcome) ----
  const topOk = usable("topSpeedMps", trusted.topSpeedMps);
  const avgOk = usable("avgVelocityMps", trusted.avgVelocityMps);
  const topBelow = topOk && trusted.topSpeedMps! < TOPSPEED_ELITE;
  const avgBelow = avgOk && trusted.avgVelocityMps! < AVGVEL_ELITE;
  if (topBelow || avgBelow) {
    const topDef = topBelow ? ((TOPSPEED_ELITE - trusted.topSpeedMps!) / TOPSPEED_ELITE) * 100 : 0;
    const avgDef = avgBelow ? ((AVGVEL_ELITE - trusted.avgVelocityMps!) / AVGVEL_ELITE) * 100 : 0;
    const deficitPct = Math.max(topDef, avgDef);
    const evidence: RecommendationEvidence[] = [];
    if (topOk)
      evidence.push({
        label: "Supported peak velocity",
        value: fmt(trusted.topSpeedMps!, 2, "m/s"),
        benchmark: TOPSPEED_ELITE_TEXT,
        interpretation: "Best single-stride velocity in the zone — the ceiling stride length and frequency produce.",
      });
    if (avgOk)
      evidence.push({
        label: "Average velocity",
        value: fmt(trusted.avgVelocityMps!, 2, "m/s"),
        benchmark: AVGVEL_ELITE_TEXT,
        interpretation: "Mean speed across the timed zone — how well the athlete reaches and holds top speed.",
      });
    drafts.push({
      _group: 1,
      _magnitude: deficitPct,
      id: "speed",
      category: "speed",
      title: "Max velocity is the headline ceiling to raise",
      severity: severityFromPct(deficitPct),
      confidence: trainConfidence("high"),
      trusted: trainTrusted,
      metricEvidence: evidence,
      whyItMatters:
        "Velocity is the outcome the fly zone measures. When stride length and frequency are close to target, the gain comes from exposure to true top-end speed and sharper front-side mechanics.",
      coachingCue: "Spend real time at genuine top speed — tall, relaxed, front-side, not grinding.",
      trainingFocus: [
        "Flying runs (20–30 m) with a full run-in to reach true max velocity.",
        "Wicket runs to organise upright, front-side mechanics at speed.",
        "Sprint-posture and postural strength work to hold position at max velocity.",
        "Keep max-velocity exposure fresh — full recovery, low volume.",
      ],
      nextSessionGoal: "Add high-quality max-velocity exposure (fly runs) with full recovery.",
      displayPriority: 0,
    });
  }

  // ---- 4. Rhythm / consistency limiter (trusted, from velocity spread) ----
  const spread = measurements?.velocitySpreadPct ?? null;
  if (spread != null && spread >= RHYTHM_SPREAD_MODERATE) {
    const severity: Severity = spread >= RHYTHM_SPREAD_HIGH ? "high" : "moderate";
    drafts.push({
      _group: 1,
      _magnitude: spread,
      id: "rhythm",
      category: "rhythm",
      title: "Max-velocity rhythm is inconsistent through the zone",
      severity,
      confidence: trainConfidence("medium"),
      trusted: trainTrusted,
      metricEvidence: [
        {
          label: "Velocity spread",
          value: `${spread.toFixed(0)}%`,
          benchmark: "< 12%",
          interpretation:
            "How much velocity varies across the zone's cross-checks — a wide spread points to unstable rhythm or top-speed mechanics, not a single clean speed.",
        },
      ],
      whyItMatters:
        "An unstable velocity signature means the athlete isn't holding one clean top-speed pattern — bleeding speed to tension and over-striding rather than a smooth, repeatable rhythm.",
      coachingCue: "Cue smooth and repeatable — same relaxed rhythm every stride, not surging.",
      trainingFocus: [
        "Sub-maximal wickets focused on identical, repeatable ground contacts.",
        "Relaxed 'build and float' flys emphasising rhythm over effort.",
        "Rhythm runs at 90–95% holding consistent mechanics.",
      ],
      nextSessionGoal: "Groove one repeatable top-speed rhythm with sub-max wickets and relaxed flys.",
      displayPriority: 0,
    });
  }

  // ---- 5. Asymmetry limiter (trusted step length; directional frequency) ----
  if (measurements) {
    const timingReliable = !isPrecisionLimited(activeFps);
    for (const insight of analyzeAsymmetry(measurements, { timingReliable })) {
      const isFrequency = insight.key === "stepFrequency";
      // Step-length asymmetry is spatial → trusted. Per-side frequency at <120 fps is
      // directional only → still surfaced, but confidence capped to "medium" and not
      // asserted as trusted.
      const baseConf: Confidence = isFrequency && !insight.reliable ? "medium" : "high";
      drafts.push({
        _group: 1,
        _magnitude: insight.differencePct,
        id: `asymmetry-${insight.key}`,
        category: "asymmetry",
        title: `${insight.metricLabel} favours the ${insight.weakerSide === "left" ? "right" : "left"} side`,
        severity: severityFromPct(insight.differencePct),
        confidence: isFrequency && !insight.reliable ? "medium" : trainConfidence(baseConf),
        trusted: isFrequency && !insight.reliable ? false : trainTrusted,
        metricEvidence: [
          {
            label: `${insight.metricLabel} L / R`,
            value: `${insight.leftValue.toFixed(2)} / ${insight.rightValue.toFixed(2)} ${insight.unit}`,
            benchmark: `< ${ASYMMETRY_MIN_PCT}% difference`,
            interpretation: insight.what,
          },
        ],
        whyItMatters: insight.why,
        coachingCue:
          insight.fixes[0] ?? "Review the two sides on video before over-correcting either leg.",
        trainingFocus: insight.fixes,
        nextSessionGoal:
          "Review both sides on video, check mobility and fatigue, and address the side bias in training — not as an injury call.",
        displayPriority: 0,
      });
    }
  }

  // ---- 7. Experimental metrics bin (FPS-gated timing; never a trusted priority) ----
  if (isPrecisionLimited(activeFps)) {
    const gate = metricTrust({ key: "groundContactTimeMs", activeFps, poseConfidence: quality?.poseConfidence ?? null });
    drafts.push({
      _group: 2,
      _magnitude: 0,
      id: "experimental-timing",
      category: "experimental",
      title: "Ground-contact & stiffness coaching — coming soon",
      severity: "low",
      confidence: "low",
      trusted: false,
      metricEvidence: [
        {
          label: "Contact / flight / stiffness",
          value: gate.state === "needsHigherFps" ? NEEDS_HIGHER_FPS_MESSAGE : "Coming soon",
          interpretation:
            "Ground contact time, flight time, contact/flight ratio, stiffness and toe-off timing need higher-FPS video before AVA will coach from them.",
        },
      ],
      whyItMatters:
        "At 60 fps a single frame is a large fraction of an ~80 ms ground contact, so timing-based cues would be guesses. AVA withholds them until the footage supports them.",
      coachingCue: "Capture at 120–240 fps to unlock trusted contact-time and stiffness guidance.",
      trainingFocus: [
        "Record the next fly at 120 fps or higher to enable contact/flight and stiffness metrics.",
      ],
      nextSessionGoal: "Film at 120fps+ to add trusted ground-contact and stiffness coaching.",
      displayPriority: 0,
    });
  }

  // ---- Rank + assign displayPriority ----
  // Group first (blocking recording issue → trusted training → experimental), then
  // severity, then magnitude. Stable, deterministic.
  drafts.sort((a, b) => {
    if (a._group !== b._group) return a._group - b._group;
    const sev = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (sev !== 0) return sev;
    if (b._magnitude !== a._magnitude) return b._magnitude - a._magnitude;
    return a.id.localeCompare(b.id);
  });
  drafts.forEach((d, i) => (d.displayPriority = i));

  // Strip internal scratch fields for the public shape.
  const clean = (d: Draft): Recommendation => {
    const { _group, _magnitude, ...rest } = d;
    void _group;
    void _magnitude;
    return rest;
  };

  const recommendations = drafts.filter((d) => d._group !== 2).map(clean);
  const experimental = drafts.filter((d) => d._group === 2).map(clean);

  return {
    available: recommendations.length > 0 || experimental.length > 0,
    recommendations,
    experimental,
  };
}
