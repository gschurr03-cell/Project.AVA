/**
 * Sprint phase detection (Day 59) — segment a sprint into its phases from the
 * relative velocity profile, so AVA can give phase-specific coaching.
 *
 * The backbone is the shape of the athlete's horizontal velocity over time:
 * it rises through the drive, tapers as they stand tall, plateaus at top speed,
 * and may fall at the end. We read that shape and cut it into bands:
 *   start → acceleration → transition → max velocity → maintenance → deceleration
 * (only the phases actually present are returned).
 *
 * Perspective handling: raw normalized COM motion is corrupted when the athlete
 * changes depth (nearer ⇒ more pixels per metre). We divide horizontal COM speed
 * by the athlete's *apparent leg length* each frame, giving body-lengths/sec —
 * a depth-invariant proxy (both scale with 1/depth), which recovers the true
 * velocity *shape* even on non-side-on footage. Only fractions of the peak are
 * used, so the constant aspect factor cancels.
 *
 * Design guarantees:
 *  - Pure & deterministic: no I/O, inputs read-only, same input → same output.
 *  - Separate from biomechanics/calibration/prediction: consumes overlay + step
 *    presentation data only; changes no metric math.
 *  - Honest: thin/ambiguous data lowers confidence and is explained, never faked.
 */

import { smoothSeries } from "@/lib/biomechanics/events/FootContactDetector";
import type { OverlayFrame, OverlayPoint } from "@/lib/video/overlay";
import { detectStepMarks, type StepMark } from "@/lib/video/steps";

export type PhaseConfidence = "high" | "medium" | "low";

export type SprintPhase =
  | "start"
  | "acceleration"
  | "transition"
  | "maxVelocity"
  | "maintenance"
  | "deceleration";

/** Fixed display order + copy for each phase. */
export const PHASE_LABELS: Record<SprintPhase, string> = {
  start: "Start / first steps",
  acceleration: "Acceleration",
  transition: "Transition",
  maxVelocity: "Max velocity",
  maintenance: "Speed maintenance",
  deceleration: "Deceleration",
};

/** One detected phase over a time span. */
export interface PhaseBand {
  phase: SprintPhase;
  startTime: number;
  endTime: number;
  /** Velocity as a fraction of peak at the band's start / end (0..1). */
  velocityStartPct: number;
  velocityEndPct: number;
  /** Detected step contacts within the band. */
  stepCount: number;
  confidence: PhaseConfidence;
  /** Why this phase was detected here. */
  explanation: string;
}

export interface PhaseReport {
  available: boolean;
  bands: PhaseBand[];
  /** Time (s) of peak velocity, or null when unavailable. */
  peakVelocityTime: number | null;
  /** Analyzed time span (s), for laying bands out proportionally. */
  spanStart: number;
  spanEnd: number;
  warnings: string[];
}

export interface PhaseDetectionConfig {
  /** Skip velocity samples across gaps longer than this (s). */
  maxGapS: number;
  /** Moving-average window (samples) for the velocity series. */
  smoothingWindow: number;
  /** Landmark visibility floor. */
  minVisibility: number;
  /** Merge phase bands shorter than this (s) into a neighbour. */
  minBandS: number;
}

export const DEFAULT_PHASE_CONFIG: PhaseDetectionConfig = {
  maxGapS: 0.2,
  smoothingWindow: 5,
  minVisibility: 0.4,
  minBandS: 0.12,
};

// Velocity fraction-of-peak thresholds that separate the phases.
const F_START = 0.3; // below this (while rising) = still driving out of the start
const F_ACCEL = 0.85; // rising through here = acceleration
const F_TRANSITION = 0.97; // rising above here = essentially at top speed
const F_MAINTAIN = 0.95; // after peak, holding above this = maintenance

const MIN_VELOCITY_SAMPLES = 6;

const visible = (p: OverlayPoint | undefined, min: number): p is OverlayPoint =>
  !!p && (p.visibility ?? 1) >= min;

const normDist = (a: OverlayPoint, b: OverlayPoint): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Apparent leg length (max of the two legs) in normalized units, or null. */
function legLength(frame: OverlayFrame, minVis: number): number | null {
  const legs: number[] = [];
  if (visible(frame.landmarks.leftHip, minVis) && visible(frame.landmarks.leftAnkle, minVis))
    legs.push(normDist(frame.landmarks.leftHip, frame.landmarks.leftAnkle));
  if (visible(frame.landmarks.rightHip, minVis) && visible(frame.landmarks.rightAnkle, minVis))
    legs.push(normDist(frame.landmarks.rightHip, frame.landmarks.rightAnkle));
  return legs.length ? Math.max(...legs) : null;
}

interface VelocitySample {
  t: number;
  v: number; // body-lengths per second (relative, depth-invariant)
}

/**
 * Build a depth-invariant horizontal velocity series: horizontal COM speed
 * divided by apparent leg length, sampled between consecutive well-tracked
 * frames and smoothed.
 */
function buildVelocitySeries(frames: OverlayFrame[], cfg: PhaseDetectionConfig): VelocitySample[] {
  const raw: VelocitySample[] = [];
  let prev: { t: number; x: number; leg: number } | null = null;

  for (const f of frames) {
    const leg = legLength(f, cfg.minVisibility);
    if (!f.centerOfMass || !leg || leg <= 0) {
      // Untrackable frame breaks the chain (avoid interpolating across a gap).
      prev = null;
      continue;
    }
    const cur = { t: f.time, x: f.centerOfMass.x, leg };
    if (prev) {
      const dt = cur.t - prev.t;
      if (dt > 0 && dt <= cfg.maxGapS) {
        const legAvg = (cur.leg + prev.leg) / 2;
        const v = Math.abs(cur.x - prev.x) / dt / legAvg;
        raw.push({ t: (cur.t + prev.t) / 2, v });
      }
    }
    prev = cur;
  }

  if (raw.length === 0) return raw;
  const smoothed = smoothSeries(
    raw.map((s) => s.v),
    cfg.smoothingWindow,
  );
  return raw.map((s, i) => ({ t: s.t, v: Number.isFinite(smoothed[i]) ? smoothed[i] : s.v }));
}

/** Phase for a sample given its velocity fraction and whether it's past the peak. */
function labelSample(fraction: number, pastPeak: boolean): SprintPhase {
  if (!pastPeak) {
    if (fraction < F_START) return "start";
    if (fraction < F_ACCEL) return "acceleration";
    if (fraction < F_TRANSITION) return "transition";
    return "maxVelocity";
  }
  if (fraction >= F_TRANSITION) return "maxVelocity";
  if (fraction >= F_MAINTAIN) return "maintenance";
  return "deceleration";
}

interface RawBand {
  phase: SprintPhase;
  from: number; // sample index
  to: number; // sample index (inclusive)
}

/** Group consecutive same-phase samples, then merge sub-threshold bands. */
function groupBands(
  samples: VelocitySample[],
  labels: SprintPhase[],
  minBandS: number,
): RawBand[] {
  let bands: RawBand[] = [];
  for (let i = 0; i < labels.length; i++) {
    const last = bands[bands.length - 1];
    if (last && last.phase === labels[i]) last.to = i;
    else bands.push({ phase: labels[i], from: i, to: i });
  }

  // Merge any band shorter than minBandS into the adjacent band with more samples
  // (re-run until stable) so brief flicker doesn't spawn spurious phases.
  let changed = true;
  while (changed && bands.length > 1) {
    changed = false;
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i];
      const duration = samples[b.to].t - samples[b.from].t;
      if (duration >= minBandS) continue;
      const prev = bands[i - 1];
      const next = bands[i + 1];
      const target =
        !prev ? next : !next ? prev : next.to - next.from >= prev.to - prev.from ? next : prev;
      if (!target) continue;
      target.from = Math.min(target.from, b.from);
      target.to = Math.max(target.to, b.to);
      bands.splice(i, 1);
      // Re-coalesce neighbours that may now share a phase.
      bands = bands.reduce<RawBand[]>((acc, cur) => {
        const l = acc[acc.length - 1];
        if (l && l.phase === cur.phase) l.to = Math.max(l.to, cur.to);
        else acc.push({ ...cur });
        return acc;
      }, []);
      changed = true;
      break;
    }
  }
  return bands;
}

function bandConfidence(sampleCount: number, quality: PhaseConfidence): PhaseConfidence {
  const order: PhaseConfidence[] = ["low", "medium", "high"];
  const self: PhaseConfidence = sampleCount >= 6 ? "high" : sampleCount >= 3 ? "medium" : "low";
  return order[Math.min(order.indexOf(self), order.indexOf(quality))];
}

const pct = (n: number): number => Math.round(n * 100);

function explain(
  phase: SprintPhase,
  startPct: number,
  endPct: number,
  stepCount: number,
): string {
  const steps = stepCount > 0 ? ` over ${stepCount} step${stepCount === 1 ? "" : "s"}` : "";
  switch (phase) {
    case "start":
      return `Velocity building from the blocks (${pct(startPct)}%→${pct(endPct)}% of peak)${steps}.`;
    case "acceleration":
      return `Velocity rising steeply (${pct(startPct)}%→${pct(endPct)}% of peak)${steps} — driving phase.`;
    case "transition":
      return `Velocity approaching peak (${pct(startPct)}%→${pct(endPct)}%) as the athlete stands tall${steps}.`;
    case "maxVelocity":
      return `Velocity within ${100 - Math.min(pct(startPct), pct(endPct))}% of peak — top speed${steps}.`;
    case "maintenance":
      return `Holding ${Math.min(pct(startPct), pct(endPct))}%+ of peak velocity${steps} — maintaining speed.`;
    case "deceleration":
      return `Velocity falling to ${pct(endPct)}% of peak${steps} — slowing down.`;
  }
}

/**
 * Detect sprint phases from overlay frames (+ optional step marks). Returns
 * `available: false` with an explanation when there isn't enough tracked motion.
 */
export function detectSprintPhases(
  frames: OverlayFrame[],
  steps?: StepMark[],
  config: PhaseDetectionConfig = DEFAULT_PHASE_CONFIG,
): PhaseReport {
  const empty: PhaseReport = {
    available: false,
    bands: [],
    peakVelocityTime: null,
    spanStart: 0,
    spanEnd: 0,
    warnings: [],
  };

  const samples = buildVelocitySeries(frames, config);
  if (samples.length < MIN_VELOCITY_SAMPLES) {
    return {
      ...empty,
      warnings: ["Not enough continuously-tracked motion to detect sprint phases."],
    };
  }

  const stepMarks = steps ?? detectStepMarks(frames);

  const velocities = samples.map((s) => s.v);
  const peakV = Math.max(...velocities);
  const peakIdx = velocities.indexOf(peakV);
  if (peakV <= 0) return { ...empty, warnings: ["Could not measure a velocity profile."] };

  const fractions = velocities.map((v) => v / peakV);
  const labels = fractions.map((f, i) => labelSample(f, i > peakIdx));

  const quality: PhaseConfidence =
    samples.length >= 25 ? "high" : samples.length >= 12 ? "medium" : "low";

  const rawBands = groupBands(samples, labels, config.minBandS);

  const bands: PhaseBand[] = rawBands.map((b) => {
    const startTime = samples[b.from].t;
    const endTime = samples[b.to].t;
    const velocityStartPct = fractions[b.from];
    const velocityEndPct = fractions[b.to];
    const stepCount = stepMarks.filter((m) => m.time >= startTime && m.time <= endTime).length;
    return {
      phase: b.phase,
      startTime,
      endTime,
      velocityStartPct,
      velocityEndPct,
      stepCount,
      confidence: bandConfidence(b.to - b.from + 1, quality),
      explanation: explain(b.phase, velocityStartPct, velocityEndPct, stepCount),
    };
  });

  const warnings: string[] = [];
  if (quality === "low")
    warnings.push("Sparse tracking — phase boundaries are approximate.");
  if (peakIdx >= samples.length - 2)
    warnings.push(
      "Velocity was still rising at the end of the clip — max velocity and later phases may be off-camera.",
    );

  return {
    available: true,
    bands,
    peakVelocityTime: samples[peakIdx].t,
    spanStart: samples[0].t,
    spanEnd: samples[samples.length - 1].t,
    warnings,
  };
}
