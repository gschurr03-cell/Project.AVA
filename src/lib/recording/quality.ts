/**
 * Recording Quality Engine (Day 70) — inspect an uploaded sprint recording and
 * produce an explainable {@link RecordingQualityReport}: a 0–100 score, an overall
 * rating, and — crucially — WHICH metrics AVA can certify, which are only estimates,
 * and which are unavailable, each with a plain-language reason.
 *
 * AVA 1.0 is a 60 fps-first platform: at 60 fps AVA measures spatial/zone metrics
 * to high accuracy but cannot certify sub-frame TIMING (an ~80 ms ground contact is
 * ~5 frames), so those are surfaced as estimates. Everything here is rule-based and
 * explainable — no hard-coded verdicts, no black box. Each factor states its own
 * threshold and why it passed/failed; the metric availability follows from the
 * factors, not from a lookup table.
 *
 * Pure & deterministic: no I/O, inputs read-only.
 */

import type { OverlayFrame, OverlayPoint } from "@/lib/video/overlay";

export type QualityRating = "excellent" | "good" | "fair" | "poor";
export type FactorStatus = "pass" | "warn" | "fail";

/** One inspected aspect of the recording, with its own threshold + reason. */
export interface QualityFactor {
  key: string;
  label: string;
  /** The measured value, formatted for display (e.g. "59.94 fps"). */
  valueText: string;
  status: FactorStatus;
  /** Relative importance in the overall score (unnormalized). */
  weight: number;
  /** Plain-language reason for this status. */
  why: string;
}

export type MetricAvailability = "certified" | "estimated" | "unavailable";

/** Where one metric lands given the recording quality, with the reason. */
export interface MetricJudgement {
  key: string;
  label: string;
  availability: MetricAvailability;
  why: string;
}

export interface RecordingQualityReport {
  /** 0–100 weighted quality score. */
  score: number;
  rating: QualityRating;
  /** 1–5 stars, derived from the rating tier. */
  stars: number;
  factors: QualityFactor[];
  certified: MetricJudgement[];
  estimated: MetricJudgement[];
  unavailable: MetricJudgement[];
  /** One-line, coach-facing summary of what this recording supports. */
  summary: string;
}

/** Everything the engine inspects. Nullable — unknown inputs degrade gracefully. */
export interface RecordingQualityInputs {
  fps: number | null;
  width: number | null;
  height: number | null;
  codec: string | null;
  /** true = stationary camera, false = panning, null = unknown. */
  cameraStatic: boolean | null;
  cameraConfidence: "high" | "medium" | "low" | "unavailable";
  cameraAvailable: boolean;
  /** Two timing gates + a known distance are set for this session. */
  calibrationPresent: boolean;
  /** Athlete's vertical extent as a fraction of frame height (0–1). */
  athleteFillFraction: number | null;
  /** Fraction of frames with a tracked foot (0–1). */
  trackingCoverage: number | null;
  /** Mean pose keypoint confidence across the clip (0–1). */
  poseConfidence: number | null;
  /** Fraction of frames with no usable pose (0–1). */
  missingFrameFraction: number | null;
}

// --- Explainable thresholds (all named, none magic) -------------------------
const FPS_BASELINE = 60; // AVA 1.0 is 60 fps-first
// Accept the common ~60 fps rates (NTSC 59.94, measured 59.x) as meeting baseline.
const FPS_BASELINE_MIN = 59;
const FPS_HIGH_PRECISION = 120; // required to certify sub-frame timing
const FPS_MIN = 30;
const RES_GOOD_H = 1080;
const RES_FAIR_H = 720;
const FILL_GOOD = 0.15;
const FILL_FAIR = 0.08;
const COVER_GOOD = 0.8;
const COVER_FAIR = 0.6;
const COVER_USABLE = 0.5; // below this, spatial metrics can't be trusted at all
const POSE_GOOD = 0.75;
const POSE_FAIR = 0.55;
const POSE_USABLE = 0.4;
const MISSING_GOOD = 0.05;
const MISSING_FAIR = 0.15;

const STATUS_SCORE: Record<FactorStatus, number> = { pass: 1, warn: 0.6, fail: 0.2 };

const pct = (v: number | null | undefined): string => (v == null ? "unknown" : `${Math.round(v * 100)}%`);

/** Build every inspected factor with its status + reason. */
function buildFactors(i: RecordingQualityInputs): QualityFactor[] {
  const factors: QualityFactor[] = [];

  // Frame rate — 60 fps is the platform baseline (spatial trusted; timing limited).
  factors.push({
    key: "fps",
    label: "Frame rate",
    valueText: i.fps != null ? `${i.fps.toFixed(2)} fps` : "unknown",
    status: i.fps == null ? "warn" : i.fps >= FPS_BASELINE_MIN ? "pass" : i.fps >= FPS_MIN ? "warn" : "fail",
    weight: 3,
    why:
      i.fps == null
        ? "Frame rate unknown — timing precision can't be judged."
        : i.fps >= FPS_HIGH_PRECISION
          ? `${i.fps.toFixed(0)} fps supports high-precision timing as well as spatial metrics.`
          : i.fps >= FPS_BASELINE_MIN
            ? `Meets the ${FPS_BASELINE} fps baseline — spatial metrics are trustworthy; sub-frame timing (contact/flight) needs ≥${FPS_HIGH_PRECISION} fps.`
            : i.fps >= FPS_MIN
              ? `Below the ${FPS_BASELINE} fps baseline — even spatial timing (zone/velocity) loses precision.`
              : "Too low for reliable sprint analysis.",
  });

  // Resolution
  const h = i.height ?? 0;
  factors.push({
    key: "resolution",
    label: "Resolution",
    valueText: i.width && i.height ? `${i.width}×${i.height}` : "unknown",
    status: h >= RES_GOOD_H ? "pass" : h >= RES_FAIR_H ? "warn" : i.height ? "fail" : "warn",
    weight: 2,
    why:
      h >= RES_GOOD_H
        ? "1080p or higher — pose keypoints are sharp."
        : h >= RES_FAIR_H
          ? "720p — usable, but a distant athlete has fewer pixels to track."
          : i.height
            ? "Low resolution — keypoint tracking will be noisier."
            : "Resolution unknown.",
  });

  // Codec (informational — decodability, low weight)
  factors.push({
    key: "codec",
    label: "Codec",
    valueText: i.codec ?? "unknown",
    status: i.codec ? "pass" : "warn",
    weight: 1,
    why: i.codec ? `${i.codec} decodes cleanly for pose extraction.` : "Codec unknown.",
  });

  // Camera motion — a stationary camera is ideal for spatial accuracy.
  const cameraCompensated = i.cameraAvailable && (i.cameraConfidence === "high" || i.cameraConfidence === "medium");
  factors.push({
    key: "camera",
    label: "Camera",
    valueText: i.cameraStatic == null ? "unknown" : i.cameraStatic ? "static" : "panning",
    status: i.cameraStatic ? "pass" : cameraCompensated ? "warn" : i.cameraStatic === false ? "fail" : "warn",
    weight: 3,
    why: i.cameraStatic
      ? "Stationary camera — image position maps directly to ground position, ideal for spatial metrics."
      : i.cameraStatic === false
        ? cameraCompensated
          ? `Panning camera, compensated with ${i.cameraConfidence} confidence — spatial metrics are recoverable but less certain than a static shot.`
          : "Panning camera without reliable motion compensation — spatial metrics are unreliable."
        : "Camera motion couldn't be determined.",
  });

  // Calibration — the two timing gates + known distance.
  factors.push({
    key: "calibration",
    label: "Calibration",
    valueText: i.calibrationPresent ? "complete" : "not set",
    status: i.calibrationPresent ? "pass" : "fail",
    weight: 4,
    why: i.calibrationPresent
      ? "Timing gates and a known distance are set — pixels map to metres and the zone is defined."
      : "No timing gates set — AVA can't convert pixels to metres, so step length and velocity are unavailable.",
  });

  // Athlete size in frame
  factors.push({
    key: "athleteSize",
    label: "Athlete size in frame",
    valueText: i.athleteFillFraction != null ? pct(i.athleteFillFraction) + " of frame height" : "unknown",
    status:
      i.athleteFillFraction == null
        ? "warn"
        : i.athleteFillFraction >= FILL_GOOD
          ? "pass"
          : i.athleteFillFraction >= FILL_FAIR
            ? "warn"
            : "fail",
    weight: 2,
    why:
      i.athleteFillFraction == null
        ? "Couldn't measure how much of the frame the athlete fills."
        : i.athleteFillFraction >= FILL_GOOD
          ? "The athlete fills enough of the frame for confident keypoint tracking."
          : i.athleteFillFraction >= FILL_FAIR
            ? "The athlete is fairly small in frame — tracking is workable but less precise, especially at the far end."
            : "The athlete is very small in frame — keypoints are hard to track reliably.",
  });

  // Tracking coverage
  factors.push({
    key: "coverage",
    label: "Tracking coverage",
    valueText: pct(i.trackingCoverage),
    status:
      i.trackingCoverage == null
        ? "warn"
        : i.trackingCoverage >= COVER_GOOD
          ? "pass"
          : i.trackingCoverage >= COVER_FAIR
            ? "warn"
            : "fail",
    weight: 3,
    why:
      i.trackingCoverage == null
        ? "Tracking coverage unknown."
        : i.trackingCoverage >= COVER_GOOD
          ? "The athlete is tracked through almost the whole clip."
          : i.trackingCoverage >= COVER_FAIR
            ? "The athlete is untracked for part of the clip — some steps may be missed."
            : "Large gaps in tracking — many steps are likely missed.",
  });

  // Pose confidence
  factors.push({
    key: "poseConfidence",
    label: "Pose confidence",
    valueText: pct(i.poseConfidence),
    status:
      i.poseConfidence == null
        ? "warn"
        : i.poseConfidence >= POSE_GOOD
          ? "pass"
          : i.poseConfidence >= POSE_FAIR
            ? "warn"
            : "fail",
    weight: 2,
    why:
      i.poseConfidence == null
        ? "Pose confidence unknown."
        : i.poseConfidence >= POSE_GOOD
          ? "The pose model is confident in the detected keypoints."
          : i.poseConfidence >= POSE_FAIR
            ? "Moderate pose confidence — foot events in particular may be noisier."
            : "Low pose confidence — derived metrics should be treated cautiously.",
  });

  // Missing frames
  factors.push({
    key: "missingFrames",
    label: "Missing frames",
    valueText: i.missingFrameFraction != null ? pct(i.missingFrameFraction) : "unknown",
    status:
      i.missingFrameFraction == null
        ? "warn"
        : i.missingFrameFraction <= MISSING_GOOD
          ? "pass"
          : i.missingFrameFraction <= MISSING_FAIR
            ? "warn"
            : "fail",
    weight: 1,
    why:
      i.missingFrameFraction == null
        ? "Couldn't determine dropped/untracked frames."
        : i.missingFrameFraction <= MISSING_GOOD
          ? "Almost every frame has a usable pose."
          : i.missingFrameFraction <= MISSING_FAIR
            ? "A few frames lack a usable pose — minor gaps in the trajectory."
            : "Many frames lack a usable pose — the trajectory has real gaps.",
  });

  return factors;
}

function ratingForScore(score: number): QualityRating {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "fair";
  return "poor";
}

const STARS: Record<QualityRating, number> = { excellent: 5, good: 4, fair: 3, poor: 2 };

/**
 * Judge each headline metric's trust level from the factors — spatial/zone metrics
 * need calibration + tracking + a handled camera; temporal (contact/flight) metrics
 * additionally need a high frame rate to be CERTIFIED rather than merely estimated.
 */
function judgeMetrics(i: RecordingQualityInputs): {
  certified: MetricJudgement[];
  estimated: MetricJudgement[];
  unavailable: MetricJudgement[];
} {
  const certified: MetricJudgement[] = [];
  const estimated: MetricJudgement[] = [];
  const unavailable: MetricJudgement[] = [];
  const push = (j: MetricJudgement) =>
    (j.availability === "certified" ? certified : j.availability === "estimated" ? estimated : unavailable).push(j);

  const coverage = i.trackingCoverage ?? 0;
  const pose = i.poseConfidence ?? 0;
  const cameraOk = i.cameraStatic === true || (i.cameraAvailable && i.cameraConfidence !== "low");
  const spatialTrusted = i.calibrationPresent && coverage >= COVER_GOOD && cameraOk;
  const spatialUsable = i.calibrationPresent && coverage >= COVER_USABLE;

  // Spatial / zone metrics — need the calibration gates + a handled camera.
  const spatialMetrics: { key: string; label: string }[] = [
    { key: "zoneTime", label: "Zone Time" },
    { key: "avgVelocity", label: "Average Velocity" },
    { key: "maxVelocity", label: "Max Velocity" },
    { key: "stepLength", label: "Step Length" },
    { key: "stepFrequency", label: "Step Frequency" },
  ];
  for (const mtr of spatialMetrics) {
    if (!i.calibrationPresent) {
      push({
        key: mtr.key,
        label: mtr.label,
        availability: "unavailable",
        why: "Needs two timing gates a known distance apart — add calibration to measure this.",
      });
    } else if (spatialTrusted) {
      push({
        key: mtr.key,
        label: mtr.label,
        availability: "certified",
        why:
          mtr.key === "stepFrequency"
            ? "Measured over the whole zone from many verified contacts — robust at 60 fps."
            : "Derived from calibrated positions with strong tracking and a handled camera.",
      });
    } else if (spatialUsable) {
      push({
        key: mtr.key,
        label: mtr.label,
        availability: "estimated",
        why: !cameraOk
          ? "Calibrated, but camera motion isn't well compensated — treat as an estimate."
          : "Calibrated, but tracking coverage is partial — some steps may be missed, so treat as an estimate.",
      });
    } else {
      push({
        key: mtr.key,
        label: mtr.label,
        availability: "unavailable",
        why: "Tracking coverage is too low to measure this reliably.",
      });
    }
  }

  // Temporal metrics — contact/flight. Frame-rate bound.
  const poseTooWeak = pose > 0 && pose < POSE_USABLE;
  const timingMetrics: { key: string; label: string }[] = [
    { key: "groundContact", label: "Ground Contact" },
    { key: "flightTime", label: "Flight Time" },
  ];
  for (const mtr of timingMetrics) {
    if (coverage < COVER_USABLE || poseTooWeak) {
      push({
        key: mtr.key,
        label: mtr.label,
        availability: "unavailable",
        why: "Foot events can't be detected reliably — tracking/pose is too weak.",
      });
    } else if (i.fps != null && i.fps >= FPS_HIGH_PRECISION) {
      push({
        key: mtr.key,
        label: mtr.label,
        availability: "certified",
        why: `At ${i.fps.toFixed(0)} fps a frame is a small share of an ~80 ms contact, so timing is trustworthy.`,
      });
    } else {
      push({
        key: mtr.key,
        label: mtr.label,
        availability: "estimated",
        why: `At ${i.fps ? i.fps.toFixed(0) : "≤60"} fps one frame is a large share of an ~80 ms contact — measured, but capture at ${FPS_HIGH_PRECISION}–240 fps to certify.`,
      });
    }
  }

  return { certified, estimated, unavailable };
}

function buildSummary(rating: QualityRating, certifiedCount: number, calibrationPresent: boolean): string {
  if (!calibrationPresent)
    return "Add timing-gate calibration to unlock certified step length and velocity for this recording.";
  switch (rating) {
    case "excellent":
      return `Excellent recording — ${certifiedCount} core metrics are certified. Contact and flight time are shown as estimates (60 fps).`;
    case "good":
      return `Good recording — the core spatial metrics are trustworthy; some are estimates. See each metric's reason below.`;
    case "fair":
      return "Fair recording — usable for zone and step-length trends, but read the flagged limits before drawing firm conclusions.";
    default:
      return "Low-quality recording — most metrics are estimates or unavailable. Improve the flagged factors for a trustworthy analysis.";
  }
}

/** Build the full recording-quality report from inspected inputs. */
export function buildRecordingQuality(inputs: RecordingQualityInputs): RecordingQualityReport {
  const factors = buildFactors(inputs);
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const score =
    totalWeight > 0
      ? Math.round((factors.reduce((s, f) => s + f.weight * STATUS_SCORE[f.status], 0) / totalWeight) * 100)
      : 0;

  // Critical gates: tracking coverage and calibration decide whether the recording
  // can support a trustworthy analysis AT ALL. If one fails the rating is capped at
  // "fair", if both fail at "poor" — a great camera can't rescue an untracked run.
  const criticalFails = factors.filter(
    (f) => (f.key === "coverage" || f.key === "calibration") && f.status === "fail",
  ).length;
  let rating = ratingForScore(score);
  if (criticalFails >= 2) rating = "poor";
  else if (criticalFails === 1 && (rating === "excellent" || rating === "good")) rating = "fair";
  const { certified, estimated, unavailable } = judgeMetrics(inputs);
  return {
    score,
    rating,
    stars: STARS[rating],
    factors,
    certified,
    estimated,
    unavailable,
    summary: buildSummary(rating, certified.length, inputs.calibrationPresent),
  };
}

// --- Pose summariser: derive athlete size / pose confidence / missing frames ---

const KEY_JOINTS = ["nose", "leftShoulder", "rightShoulder", "leftHip", "rightHip", "leftAnkle", "rightAnkle"] as const;
const EXTENT_TOP = ["nose", "leftShoulder", "rightShoulder"] as const;
const EXTENT_BOTTOM = ["leftAnkle", "rightAnkle", "leftHeel", "rightHeel"] as const;

const vis = (p: OverlayPoint | undefined, min = 0.4): p is OverlayPoint => !!p && (p.visibility ?? 1) >= min;

function lowestVisibleY(f: OverlayFrame, joints: readonly string[]): number | null {
  let y: number | null = null;
  for (const j of joints) {
    const p = f.landmarks[j];
    if (vis(p)) y = y == null ? p.y : Math.max(y, p.y);
  }
  return y;
}
function highestVisibleY(f: OverlayFrame, joints: readonly string[]): number | null {
  let y: number | null = null;
  for (const j of joints) {
    const p = f.landmarks[j];
    if (vis(p)) y = y == null ? p.y : Math.min(y, p.y);
  }
  return y;
}

export interface PoseQualitySummary {
  athleteFillFraction: number | null;
  poseConfidence: number | null;
  missingFrameFraction: number | null;
}

/**
 * Summarise pose quality from the overlay frames: how much of the frame the athlete
 * fills (top-of-body → foot vertical extent, normalized), the mean keypoint
 * confidence, and the fraction of frames with no usable pose. Pure.
 */
export function summarisePoseQuality(frames: OverlayFrame[]): PoseQualitySummary {
  if (!frames.length) return { athleteFillFraction: null, poseConfidence: null, missingFrameFraction: null };

  const fills: number[] = [];
  const confs: number[] = [];
  let missing = 0;

  for (const f of frames) {
    const top = highestVisibleY(f, EXTENT_TOP);
    const bottom = lowestVisibleY(f, EXTENT_BOTTOM);
    if (top != null && bottom != null && bottom > top) fills.push(bottom - top);

    let cSum = 0;
    let cN = 0;
    for (const j of KEY_JOINTS) {
      const p = f.landmarks[j];
      if (p) {
        cSum += p.visibility ?? 1;
        cN += 1;
      }
    }
    if (cN > 0) confs.push(cSum / cN);

    // A frame is "missing" when the torso isn't usably tracked.
    const torsoTracked = vis(f.landmarks.leftHip) || vis(f.landmarks.rightHip) || vis(f.landmarks.leftShoulder) || vis(f.landmarks.rightShoulder);
    if (!torsoTracked) missing += 1;
  }

  const mean = (a: number[]): number | null => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  return {
    athleteFillFraction: mean(fills),
    poseConfidence: mean(confs),
    missingFrameFraction: frames.length ? missing / frames.length : null,
  };
}
