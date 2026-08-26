/**
 * Sprint measurements (Day 62 benchmark) — the full, deterministic metric set AVA
 * reports for a calibrated sprint, derived from verified ground contacts plus a
 * manual two-point ground calibration that ALSO bounds the measurement zone.
 *
 * Everything here is a *presentation / validation* computation built on the pose
 * overlay and the step detector — it never touches the worker's biomechanics math
 * (contact/flight time live there). The manual calibration points do double duty:
 *   • their pixel distance ↔ known metres gives the pixel→metre scale; and
 *   • their x-range bounds the zone, so only contacts *between the cones* count as
 *     valid steps (steps before the start / after the finish are excluded).
 *
 * Metric families (all kept strictly distinct — never conflate them):
 *   • Contacts        — one true ground contact = one step (total, left, right, valid-in-zone).
 *   • Step frequency  — steps per second = valid contacts ÷ elapsed zone time
 *                       (combined is primary; left/right are that side's share).
 *   • Step length     — Method 1: zone distance ÷ valid steps (average); Method 2:
 *                       distance between consecutive contacts (individual, + left/right).
 *   • Velocity        — cross-checked three independent ways (distance÷time,
 *                       avg-individual-length×freq, median-length×freq) plus a
 *                       max (longest step × freq) and the zone (distance÷time) value.
 *
 * Pure & deterministic: no I/O, inputs read-only.
 */

import type { OverlayFrame, OverlayPoint } from "@/lib/video/overlay";
import { type StepMark, type StepSide, type StepDistanceScale, stripUnstableLandmarks } from "@/lib/video/steps";
import { summariseContactFlight, type ContactFlightSummary } from "@/lib/video/contacts";
import { buildFullRunEvents } from "@/lib/video/events";
import { evaluateStepInterval, evaluateAggregateStepLength, type StepIntegrityReason } from "@/lib/video/stepIntegrity";
import { computePeakStrideLengthM, computeStrideRetentionPct } from "@/lib/benchmark/strideMetrics";
import {
  CONSERVATIVE_TIMING_POLICY_V1,
  reportNullableMilliseconds,
  reportStrideWindows,
  reportTimeSeconds,
  velocityFromReportedTime,
} from "@/lib/measurement/timingPolicy";
import type { ManualCalibrationPoints } from "@/lib/calibration";
import type { CalibrationGates } from "@/lib/calibration/gates";
import { detectWorldBoundaryCrossing } from "@/lib/calibration/zoneAnchors";
import { stepFrequenciesFromContacts } from "@/lib/video/cadence";
import type { RawCameraEvidence } from "@/lib/video/recordingMode";
import {
  sourceLineToCanonicalWorld,
  sourcePointToCanonicalWorld,
} from "@/lib/video/worldProjection";
import {
  analyzeZoneSteps,
  type ZoneStepSummary,
} from "@/lib/video/zoneStepAnalysis";
import {
  estimateCameraMotion,
  cameraOffsetAtTime,
  type CameraConfidence,
  type CameraTrack,
} from "@/lib/video/camera";
import {
  MEASUREMENT_MODEL_CANONICAL_LONGITUDINAL,
  DEFAULT_MEASUREMENT_MODEL_VERSION,
  type MeasurementModelVersion,
} from "@/lib/benchmark/measurementModel";

export type MeasurementConfidence = "high" | "medium" | "low";

/** How camera-motion compensation was applied to this session's spatial metrics. */
export interface CameraCompensation {
  available: boolean;
  confidence: CameraConfidence;
  coverage: number;
  warning: string | null;
  /** The estimator method used (e.g. "static-camera …" or "stance-foot …"). */
  method: string;
}

/** Transparency on which frames/contacts fed the measurements (Day 65). */
export interface MeasurementDiagnostics {
  totalFrames: number;
  /** Frames where at least one foot is tracked above the detection threshold. */
  trackedFrames: number;
  trackingCoverage: number;
  /** Time of the first / last detected ground contact. */
  firstContactTimeS: number | null;
  lastContactTimeS: number | null;
  /** Contacts counted toward the zone metrics. */
  includedContacts: number;
  /** Contacts dropped from the zone, with a structured reason code (Day 99
   *  Part 6) plus the existing human-readable reason (for honest diagnosis).
   *  `reasonCode` is one of the documented rejection taxonomy: today only
   *  "before_start_crossing" / "outside_zone" are actually produced (the only
   *  two exclusion causes this engine currently has); the remaining
   *  documented codes (missing_opposite_foot, insufficient_landmarks,
   *  low_pose_score, identity_not_verified, invalid_world_coordinate,
   *  boundary_step_not_supported, duplicate_contact, cadence_outlier) are
   *  reserved for exclusion causes that do not currently exist in this
   *  engine's logic — they are not fabricated here. */
  excludedContacts: {
    time: number;
    side: StepSide;
    sourceFrameIndex?: number;
    reasonCode: "before_start_crossing" | "outside_zone";
    reason: string;
  }[];
  /** Contact/flight timing transparency + the frame-rate precision floor (Day 68). */
  timing: TimingDiagnostics | null;
  notes: string[];
  /** Day 99 (Part 8) — how much of the calibrated zone the eligible steps
   *  actually span, so partial-zone coverage is always disclosed. */
  zoneCoverage: ZoneCoverage;
}

/** Zone-coverage provenance (Day 99, Part 8). All distances are metres along
 *  the travel direction from the START gate; null whenever the run isn't
 *  calibrated or has zero valid in-zone contacts. */
export interface ZoneCoverage {
  zoneDistanceM: number | null;
  measuredDistanceM: number | null;
  measuredZoneFraction: number | null;
  firstMeasuredPositionM: number | null;
  lastMeasuredPositionM: number | null;
  eligibleStepCount: number;
  missingEarlyZoneReason: string | null;
  missingLateZoneReason: string | null;
  /**
   * Day 100 — the "progressive measurement window": the same facts above,
   * named/shaped for a coverage-visualization consumer. Aliases, not a
   * second computation — `measurementStartPositionM`/`measurementEndPositionM`
   * are exactly `firstMeasuredPositionM`/`lastMeasuredPositionM`,
   * `coveragePercent` is `measuredZoneFraction * 100`. This window is
   * recomputed from whatever real contacts exist on every run — there is no
   * stored/cached boundary to go stale, so it "expands automatically" simply
   * because it is never anything other than a live function of current
   * evidence.
   */
  measurementStartPositionM: number | null;
  measurementEndPositionM: number | null;
  coveragePercent: number | null;
  /** One consolidated, human-readable reason covering whichever end(s) of
   *  the zone are missing evidence; null when coverage is effectively full. */
  coverageReason: string | null;
  /** Internal-only quality signal for the measured window itself (distinct
   *  from `stepLengthConfidence`, which grades the length VALUES) — reflects
   *  how much evidence backs the window boundary, not the numbers inside it. */
  coverageConfidence: MeasurementConfidence;
}

/** Contact/flight timing evidence: what was measured and the fps quantization floor. */
export interface TimingDiagnostics {
  /** Active frames-per-second used for all timing (contact/flight/frequency). */
  activeFps: number | null;
  /** One frame's duration in ms (= the raw timing quantum before interpolation). */
  frameMs: number | null;
  /** In-zone contacts timed, per foot. */
  leftContacts: number;
  rightContacts: number;
  /** Mean ground-contact WIDTH in whole frames, per foot (drives the floor). */
  contactFramesLeft: number | null;
  contactFramesRight: number | null;
  /** Per-foot contact + flight (ms), echoed here for the diagnostics panel. */
  groundContactLeftMs: number | null;
  groundContactRightMs: number | null;
  flightLeftMs: number | null;
  flightRightMs: number | null;
}

/**
 * Evidence for the zone start/finish crossings — added Day 94 after a session
 * with heavy athlete-tracking loss reported a fabricated ~8s zone time from an
 * extrapolated/clamped crossing pair. `verified` is the single source of truth
 * for whether `zoneTimeS` (and anything derived from it — average velocity,
 * step frequency's time base) may be presented as measured; when false, the
 * caller must show the metric unavailable with `timingAvailabilityReason`, not
 * substitute clip duration, pose-track duration, or contact span.
 */
export interface TimingCrossingProvenance {
  /** True only when BOTH crossings were directly bracketed/detected with
   *  sufficient confidence — never from extrapolation or a fallback span. */
  verified: boolean;
  startCrossingFrame: number | null;
  finishCrossingFrame: number | null;
  startCrossingTimestampS: number | null;
  finishCrossingTimestampS: number | null;
  crossingDetectionMethod: "world_anchored" | "screen_fixed_interpolated" | null;
  /** Always "automatic" today — no manual crossing-override UI exists yet. */
  timingAuthority: "automatic" | "manual";
  startCrossingExtrapolated: boolean;
  finishCrossingExtrapolated: boolean;
  /** Structured reason zone time is unavailable, e.g. "start_crossing_unavailable",
   *  "crossing_confidence_below_threshold", "crossing_extrapolated_not_verified",
   *  "athlete_tracking_unavailable", "not_calibrated". Null when verified. */
  timingAvailabilityReason: string | null;
  /**
   * Day 96 audit (Part 7) — the minimum crossing-evidence contract. A
   * crossing may be a genuine bracket (`verified` above already requires
   * that) and still occur immediately after/before a long fragmented
   * tracking gap, with almost no surrounding continuity to corroborate it —
   * `"verified"` requires BOTH a genuine bracket AND sufficient consecutive
   * tracked frames on both sides of both crossings; `"provisionally_verified"`
   * is evidence-backed but thin; `"unavailable"` is the existing gate.
   */
  timingStatus: "verified" | "provisionally_verified" | "unavailable";
  /** Consecutive tracked source frames immediately before/after each crossing
   *  (capped at 30) — the surrounding-continuity evidence `timingStatus` is
   *  derived from. */
  startContinuityFramesBefore: number;
  startContinuityFramesAfter: number;
  finishContinuityFramesBefore: number;
  finishContinuityFramesAfter: number;
  /** True when the crossing frame and the immediately-preceding source frame
   *  both have real torso pose evidence (not merely two tracked samples with
   *  a gap between them). */
  startBracketedByConsecutiveFrames: boolean;
  finishBracketedByConsecutiveFrames: boolean;
}

/** The measurement zone the two calibration points bound, in the athlete's travel direction. */
export interface SprintZone {
  /** Normalized x where the athlete enters the zone (first boundary reached). */
  entryX: number;
  /** Normalized x where the athlete exits the zone. */
  exitX: number;
  /** Lower/upper normalized x bound (order-independent), for the valid-step test. */
  minX: number;
  maxX: number;
  /** Known real-world zone length, metres. */
  distanceM: number;
}

/** One velocity estimate produced by an independent method. */
export interface VelocityEstimate {
  key: string;
  label: string;
  method: string;
  value: number | null;
}

/**
 * One in-zone step, exposed for transparency (Day 73): the landing contact plus the
 * step LENGTH from the previous contact. `stepLengthM` is the world contact-to-contact
 * displacement (the same value that feeds the per-side and individual averages), so a
 * coach can see the exact step-by-step sequence through the calibrated zone.
 */
export interface ZoneStep {
  /** 1-based step number within the zone. */
  index: number;
  /** This contact's stable identity (`contact-${sourceFrameIndex}-${side}-${index}`),
   *  identical to the id `contactId()` below and every other consumer (e.g.
   *  VideoOverlay.tsx) already derive from the same underlying StepMark — so a
   *  display consumer can look up this exact authoritative step length by
   *  contact identity instead of recomputing it (Phase 8.0B). */
  contactId: string;
  /** Landing foot of this contact. */
  side: StepSide;
  /** Contact time (s). */
  timeS: number;
  /** World x of the contact (normalized), camera-compensated. */
  worldX: number;
  /** Step length from the previous contact, metres (null for the first, uncalibrated).
   *  Scientifically ACCEPTED value only — eligible for Average/Peak Step Length,
   *  Step Frequency, and every other aggregate metric. Never broadened by Phase
   *  R1B; unchanged in semantics and value from every prior phase. */
  stepLengthM: number | null;
  /** Phase R1B — the same already-computed, already-authoritative calibrated
   *  physical distance (`WorldMark.distanceMetersFromPrev` on the legacy path,
   *  `ZoneStepInterval.rawLongitudinalDisplacementM` on the canonical path) for
   *  a contact-to-contact interval that represents a LEGITIMATE single step
   *  (no proven missing intermediate contact, no same-foot/non-alternating
   *  sequence, no non-forward/non-finite geometry, no low-confidence
   *  projection) — regardless of whether the interval also clears the
   *  cruise-phase-calibrated plausibility ceiling `stepLengthM` requires.
   *  PRESENTATION EVIDENCE ONLY: never read by any aggregate metric, zone
   *  summary, or evidence-eligibility computation. Whenever `stepLengthM` is
   *  non-null, `physicalStepLengthM` is always the identical value (accepted
   *  intervals are a strict subset of physically-legitimate ones) — see
   *  `docs/phase-r1b-presentation-only-physical-step-length-recovery.md`. */
  physicalStepLengthM: number | null;
  /** Why `physicalStepLengthM` does or doesn't equal `stepLengthM`, for
   *  forensic/debugging use only (never rendered to the coach). */
  physicalStepLengthState:
    | "accepted_for_metrics" // stepLengthM and physicalStepLengthM are equal and non-null
    | "presentation_only" // physicalStepLengthM exists but was rejected from aggregation (Phase R1A Case 1)
    | "missing_contact" // proven evidence gap (same-foot/non-alternating/missing-intermediate) -- Phase R1A Case 2
    | "invalid_interval"; // no candidate interval at all (e.g. the run's first-ever contact) or non-finite/non-forward geometry
  /** The previous contact's foot (the step is fromSide → side), or null. */
  fromSide: StepSide | null;
  /** Contact position along the start→finish sprint axis. */
  longitudinalM?: number;
  /** Lateral offset from the sprint axis; never folded into step length. */
  lateralM?: number;
  classification?: "before_zone" | "inside_zone" | "after_zone" | "boundary_ambiguous";
  qualityFlags?: string[];
}

/** Phase R1B — integrity reasons that prove a genuine evidence gap (no
 *  legitimate single physical step exists), shared between the legacy
 *  two-point path's `StepIntegrityReason`s and the canonical path's
 *  `ZoneStepQualityFlag`s (which include the same reasons plus its own
 *  `non_alternating_sequence`/`non_forward_interval`/`low_projection_confidence`,
 *  each an equally disqualifying geometric/evidence problem, never a mere
 *  cruise-phase-ceiling miss). `implausible_step_duration`,
 *  `implausible_step_distance`, and `implausible_step_length` are
 *  deliberately EXCLUDED from this set -- those are the aggregate-only
 *  plausibility-ceiling reasons Phase R1A proved can reject a real,
 *  legitimate physical interval (Case 1). */
const PHYSICAL_STEP_EVIDENCE_GAP_REASONS = new Set([
  "missing_intermediate_contact",
  "contact_sequence_gap",
  "foot_sequence_discontinuity",
  "non_alternating_sequence",
  "non_forward_interval",
  "low_projection_confidence",
]);

/** True when `reasons` proves a genuine evidence gap that must never be
 *  presented as a physical step length, even for display only. */
function hasPhysicalStepEvidenceGap(reasons: readonly string[] | undefined): boolean {
  return (reasons ?? []).some((reason) => PHYSICAL_STEP_EVIDENCE_GAP_REASONS.has(reason));
}

export interface SprintMeasurements {
  timingPolicyVersion: typeof CONSERVATIVE_TIMING_POLICY_V1;
  /** Phase R4B — which scientific step-length/Peak-Velocity-distance model
   *  actually produced this result. Reflects what ACTUALLY ran, not merely
   *  the caller's request: a caller may ask for CANONICAL_LONGITUDINAL, but
   *  if the calibration/evidence needed to compute it is unavailable, this
   *  field honestly reports LEGACY_2D — never silently promise a model that
   *  didn't run. Developer/scientific provenance only, never a consumer
   *  confidence percentage. */
  measurementModelVersion: MeasurementModelVersion;
  calibrated: boolean;
  /** Metres-per-pixel scale used, if any. */
  metersPerPixel: number | null;
  /** Phase R1C — the SAME authoritative, already-computed full-run contact
   *  list (`buildFullRunEvents(frames).contacts`, Stage 1) every scientific
   *  quantity below (contacts, zone steps, timing) derives from — frames
   *  already stripped of predicted/invalid/frozen_suspect landmarks (with
   *  the Phase 4.2K/9.1B `independent_corroborated` exception), across the
   *  WHOLE visible run, not just the calibrated zone. Exposed so presentation
   *  consumers (the overlay's contact markers/step numbers) can render
   *  directly from the authoritative contact set instead of independently
   *  re-detecting contacts on differently-filtered input, which previously
   *  produced a real, measured contact-set divergence (see
   *  docs/phase-r1c-authoritative-contact-render-alignment.md). Read-only:
   *  nothing here is derived FROM this field, it is exposed AFTER every
   *  other computation already used it internally. */
  fullRunContacts: StepMark[];

  // Contacts (one true ground contact = one step)
  totalContacts: number;
  leftContacts: number;
  rightContacts: number;
  validContacts: number;
  validLeftContacts: number;
  validRightContacts: number;
  /** Canonical spatial membership + interval evidence for the calibrated zone. */
  zoneStepSummary: ZoneStepSummary | null;

  // Zone + timing
  zone: SprintZone | null;
  zoneTimeS: number | null;
  rawZoneTimeS: number | null;
  reportedZoneTimeS: number | null;
  /** Torso start/finish gate crossing times (s) — the raw zone-timer endpoints. */
  zoneEntryTimeS: number | null;
  zoneExitTimeS: number | null;
  /** Evidence for whether the zone crossings — and therefore `zoneTimeS` — are
   *  verified, plus structured provenance for the timing result. */
  timingProvenance: TimingCrossingProvenance;

  // Step frequency (steps/s) — combined is the primary value
  combinedStepFrequencyHz: number | null;
  leftStepFrequencyHz: number | null;
  rightStepFrequencyHz: number | null;

  // Ground-contact + flight time (ms), per foot, measured from the overlay foot
  // trajectory over the in-zone contacts (Day 68). Null when uncomputable.
  groundContactLeftMs: number | null;
  groundContactRightMs: number | null;
  groundContactCombinedMs: number | null;
  rawGroundContactCombinedMs: number | null;
  reportedGroundContactCombinedMs: number | null;
  rawGroundContactLeftMs: number | null;
  rawGroundContactRightMs: number | null;
  flightLeftMs: number | null;
  flightRightMs: number | null;
  flightCombinedMs: number | null;
  rawFlightCombinedMs: number | null;
  reportedFlightCombinedMs: number | null;
  rawFlightLeftMs: number | null;
  rawFlightRightMs: number | null;

  // Step length (m) — null when uncalibrated. In AVA terms these are STRIDE lengths
  // (opposite-foot contact-to-contact distances); the field names are kept for
  // stability. See `strideMetrics.ts`.
  avgZoneStepLengthM: number | null;
  avgIndividualStepLengthM: number | null;
  /** AVA Peak Stride Length (m): average of the best 4 opposite-foot contact
   *  distances in the zone. Null with fewer than 2 valid distances. */
  peakStrideLengthM: number | null;
  /** Stride retention (%): avgIndividualStepLengthM ÷ peakStrideLengthM × 100. */
  strideRetentionPct: number | null;
  leftStepLengthM: number | null;
  rightStepLengthM: number | null;
  individualStepLengthsM: number[];
  /** Step-by-step sequence through the calibrated zone (Day 73 transparency). */
  zoneSteps: ZoneStep[];
  stepLengthConfidence: MeasurementConfidence;

  // Velocity (m/s)
  velocities: VelocityEstimate[];
  maxVelocityMps: number | null;
  rawMaxVelocityMps: number | null;
  reportedMaxVelocityMps: number | null;
  zoneVelocityMps: number | null;
  rawZoneVelocityMps: number | null;
  reportedZoneVelocityMps: number | null;
  strideVelocityWindows: Array<{
    startContactIndex: number;
    endContactIndex: number;
    distanceM: number;
    rawDurationS: number;
    reportedDurationS: number;
    rawVelocityMps: number;
    reportedVelocityMps: number;
  }>;
  /** Spread across the velocity methods + a note when they disagree materially. */
  velocitySpreadPct: number | null;
  velocityNote: string;

  /** Camera-motion compensation applied to the spatial (world-coordinate) metrics. */
  cameraCompensation: CameraCompensation;
  /** Which frames/contacts were included/excluded (Day 65 transparency). */
  diagnostics: MeasurementDiagnostics;

  warnings: string[];
}

const EPS = 1e-9;

/**
 * Minimum combined confidence (transform × body × boundary) a world-anchored
 * gate crossing must carry to count as VERIFIED. Matches the long-standing
 * `MIN_SAFE_ANCHOR_TRANSFORM_CONFIDENCE` threshold already used to gate whether
 * a propagated gate line itself is safe to render (zoneAnchors.ts) — a crossing
 * built on a line that wouldn't be safe to draw must not be treated as measured.
 */
const MIN_VERIFIED_CROSSING_CONFIDENCE = 0.45;

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Coefficient of variation (stddev / mean) of a positive sample; null if < 2. */
function coefficientOfVariation(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values);
  if (m == null || m === 0) return null;
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length;
  return Math.sqrt(variance) / Math.abs(m);
}

/**
 * Torso/chest point (Day 66): the midpoint of the shoulder-midpoint and the
 * hip-midpoint — roughly chest height, where a physical timing beam would catch
 * the athlete. Falls back to the COM (hip midpoint) when the shoulders aren't both
 * tracked, then to whichever midpoint is available. This is the point whose gate
 * crossings start/stop the timer.
 */
function torsoPoint(f: OverlayFrame): OverlayPoint | null {
  const vis = (p?: OverlayPoint): p is OverlayPoint => !!p && (p.visibility ?? 1) >= 0.4;
  const mid = (a?: OverlayPoint, b?: OverlayPoint): OverlayPoint | null =>
    vis(a) && vis(b) ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
  const shoulder = mid(f.landmarks.leftShoulder, f.landmarks.rightShoulder);
  const hip = mid(f.landmarks.leftHip, f.landmarks.rightHip);
  if (shoulder && hip) return { x: (shoulder.x + hip.x) / 2, y: (shoulder.y + hip.y) / 2 };
  return f.centerOfMass ?? shoulder ?? hip ?? null;
}

/** Torso (x, time, source frame) samples in frame order, dropping frames without a tracked torso. */
function torsoSeries(frames: OverlayFrame[]): { t: number; x: number; frame: number }[] {
  const out: { t: number; x: number; frame: number }[] = [];
  for (const f of frames) {
    const p = torsoPoint(f);
    if (p) out.push({ t: f.time, x: p.x, frame: f.sourceFrameIndex ?? f.frame });
  }
  return out;
}

type Sample = { t: number; x: number; frame: number };

/** Least-squares slope dx/dt over a time window at the start or end of the series. */
function boundarySlope(series: Sample[], atStart: boolean, windowS = 0.5): number | null {
  const n = series.length;
  if (n < 2) return null;
  const edge = atStart ? series[0].t : series[n - 1].t;
  const pts = atStart
    ? series.filter((s) => s.t <= edge + windowS)
    : series.filter((s) => s.t >= edge - windowS);
  if (pts.length < 2) return null;
  const k = pts.length;
  let st = 0, sx = 0, stt = 0, stx = 0;
  for (const p of pts) {
    st += p.t; sx += p.x; stt += p.t * p.t; stx += p.t * p.x;
  }
  const denom = k * stt - st * st;
  if (Math.abs(denom) < 1e-12) return null;
  return (k * stx - st * sx) / denom;
}

/**
 * A zone gate crossing time. `verified` is true only for a genuine bracketing
 * crossing — the tracked torso path was seen on both sides of the gate and the
 * time is a direct interpolation between two real tracked samples. Extrapolated
 * crossings (torso never actually seen crossing the gate; the time is inferred
 * from a constant-velocity projection) are reported for diagnostics but are
 * NEVER verified — an inferred instant is not an evidence-backed crossing, and
 * must never be silently reported as a measured zone time (Day 94 audit).
 */
interface Crossing {
  time: number;
  /** Nearest tracked source frame index to `time` (before/after the bracket, or
   *  the nearest tracked sample when extrapolated). For provenance only. */
  frame: number;
  extrapolated: boolean;
  verified: boolean;
}

/**
 * Time the torso reaches normalized x-position `target`, travelling in `direction`
 * (+1 rightwards, -1 leftwards). Interpolated between bracketing frames when the
 * tracked path spans the gate — this is the ONLY verified case. When the athlete
 * was ALREADY PAST the gate at the first tracked sample (entry, far-end runner
 * untracked) — or hadn't yet REACHED it at the last sample (exit) — the crossing
 * is EXTRAPOLATED to the gate at the torso's boundary velocity (constant-velocity
 * assumption). This is reported for diagnostics but marked `verified: false`: it
 * is an inference, not a measurement, and must not be presented as a verified
 * zone time. Null when the target can't be reached even by extrapolation (no
 * motion toward it) — this NEVER falls back to clamping at the first/last sample;
 * a crossing that cannot be established is reported as unavailable, not guessed.
 * `maxExtrapS` caps how far outside the tracked span we'll estimate.
 */
function crossingTime(
  series: Sample[],
  target: number,
  direction: number,
  maxExtrapS = 0.6,
): Crossing | null {
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const cur = series[i];
    const reached = direction >= 0 ? cur.x >= target : cur.x <= target;
    const wasBefore = direction >= 0 ? prev.x < target : prev.x > target;
    if (reached && wasBefore) {
      const span = cur.x - prev.x;
      const frac = Math.abs(span) < EPS ? 0 : (target - prev.x) / span;
      const frame = Math.abs(target - cur.x) <= Math.abs(target - prev.x) ? cur.frame : prev.frame;
      return { time: prev.t + frac * (cur.t - prev.t), frame, extrapolated: false, verified: true };
    }
  }
  if (!series.length) return null;
  const first = series[0];
  const last = series[series.length - 1];

  // Already past the gate at the first sample → back-extrapolate to the gate.
  // NEVER clamp to the first sample as if that were the crossing: an athlete
  // already past the gate with no usable velocity estimate has an UNKNOWN
  // crossing instant, not one equal to the first tracked frame.
  const pastAtStart = direction >= 0 ? first.x >= target : first.x <= target;
  if (pastAtStart) {
    const v = boundarySlope(series, true);
    if (v != null && direction * v > 0) {
      const dt = (first.x - target) / v; // > 0: the gate was crossed dt seconds earlier
      if (dt <= maxExtrapS) return { time: first.t - dt, frame: first.frame, extrapolated: true, verified: false };
    }
    return null;
  }

  // Never reached the gate by the last sample → forward-extrapolate to the gate.
  const reachedAtEnd = direction >= 0 ? last.x >= target : last.x <= target;
  if (!reachedAtEnd) {
    const v = boundarySlope(series, false);
    if (v != null && direction * v > 0) {
      const dt = (target - last.x) / v; // > 0: the gate is crossed dt seconds later
      if (dt <= maxExtrapS) return { time: last.t + dt, frame: last.frame, extrapolated: true, verified: false };
    }
  }
  return null;
}

/**
 * Compute the full sprint measurement set. When `points`/dimensions are missing,
 * returns the contact-only view (counts + a clip-span frequency) with all
 * metre-scaled fields null, so the UI shows relative/uncalibrated state instead
 * of inventing numbers.
 */
export function computeSprintMeasurements(
  rawFrames: OverlayFrame[],
  points: ManualCalibrationPoints | null | undefined,
  frameWidth: number | null | undefined,
  frameHeight: number | null | undefined,
  anchorOptions?: {
    gates: CalibrationGates | null;
    cameraEvidence?: RawCameraEvidence;
    /** Phase R4B — explicit scientific model request. Omitted/undefined
     *  callers (every call site prior to this phase, and every historical
     *  artifact) get LEGACY_2D — byte-identical to pre-R4B behavior. See
     *  `@/lib/benchmark/measurementModel` for the full contract. */
    measurementModelVersion?: MeasurementModelVersion;
  },
): SprintMeasurements {
  const requestedModelVersion = anchorOptions?.measurementModelVersion ?? DEFAULT_MEASUREMENT_MODEL_VERSION;
  const warnings: string[] = [];

  // Day 96 audit (Part 7): a "predicted"/"invalid" boxOrigin means the crop
  // that frame's landmarks came from was guided by extrapolation, not
  // verified box tracking/detection — even if MediaPipe found something
  // there, it is not independently confirmed to be the same athlete. Strip
  // those frames' landmarks (never their existence/diagnostics) BEFORE any
  // contact, crossing, or torso-position computation below, so a predicted
  // box can never generate a contact, crossing, or biomechanics value.
  // Frames without a boxOrigin at all (legacy artifacts, pre-Day-96) are
  // unaffected — absence of the field is not evidence of a prediction.
  //
  // Phase 4.2/4.2B (2026-08-05) — "frozen_suspect" joins this same gate.
  // box_tracker.py's stationary-lock detector retroactively applies this
  // origin only once a LATER identity-verified detection proved the box had
  // settled onto near-static structure instead of the real, moving athlete
  // (see box_tracker.py's `_resolve_freeze_run`) — i.e. it is evidence of a
  // wrong localization, not merely low confidence, and must be withheld
  // exactly like "predicted"/"invalid": never a contact, crossing, or
  // biomechanics value from a frame this project has actively disproven.
  //
  // Phase 4.2K (2026-08-07) — a narrow, evidence-gated EXCEPTION: a
  // "frozen_suspect" frame whose real box position independently agrees
  // (bidirectional-trajectory-verified, `independentLocalizationState ===
  // "independent_corroborated"`, mediapipe_pose_runner.py's
  // `verify_independent_localization`) with trusted evidence BOTH before AND
  // after the uncertain run is no longer withheld. This never applies to
  // "predicted"/"invalid" (those never carry a real detector-anchored box to
  // verify in the first place), and never promotes a frame whose independent
  // verification is merely absent/disagreeing — see that function's own
  // contract for the full, all-conditions-required authority chain.
  // Phase R1C: this stripping pass is now the shared `stripUnstableLandmarks`
  // helper (src/lib/video/steps.ts) so the render-side overlay applies the
  // identical eligibility gate before its own contact detection — see that
  // helper's docstring and docs/phase-r1c-authoritative-contact-render-alignment.md.
  const frames = stripUnstableLandmarks(rawFrames);

  // Camera-motion compensation (Day 64): estimate the camera pan so every SPATIAL
  // quantity below can be computed in stabilized WORLD coordinates. When the track
  // is unavailable the offsets are zero, so world == frame and this degrades
  // gracefully to the old frame-coordinate behaviour.
  const cameraTrack: CameraTrack = estimateCameraMotion(frames);
  const off = (t: number) => cameraOffsetAtTime(cameraTrack, t);
  const cameraCompensation: CameraCompensation = {
    available: cameraTrack.available,
    confidence: cameraTrack.confidence,
    coverage: cameraTrack.coverage,
    warning: cameraTrack.warning,
    method: cameraTrack.method,
  };
  if (cameraTrack.warning) warnings.push(cameraTrack.warning);

  const w = frameWidth ?? 0;
  const h = frameHeight ?? 0;

  // Gate world x-positions: each gate's frame x corrected by the camera offset at
  // the time it was placed (falls back to frame x when times/compensation are
  // absent). The known distance maps to the WORLD x-gap between the two gates.
  const gateWorldX = (frameX: number, timeS: number | null | undefined): number =>
    cameraTrack.available && timeS != null ? frameX + off(timeS).x : frameX;
  const gateAX = points ? gateWorldX(points.ax, points.aTimeS) : 0;
  const gateBX = points ? gateWorldX(points.bx, points.bTimeS) : 0;
  // Phase R4B — the same camera-offset compensation, applied to Y, so the
  // CANONICAL_LONGITUDINAL axis (which needs the gates' full 2D position,
  // not just x) is built from the identical already-existing `off()`
  // function every other world position in this file already uses — no new
  // camera-motion estimation, just applying the same one symmetrically.
  // Unused by the legacy scalar scale above (which is deliberately x-only,
  // per R4A's own finding) — computing it unconditionally costs nothing and
  // keeps this pure/deterministic like everything else here.
  const gateWorldY = (frameY: number, timeS: number | null | undefined): number =>
    cameraTrack.available && timeS != null ? frameY + off(timeS).y : frameY;

  const scale: StepDistanceScale | null =
    points && frameWidth && frameHeight
      ? {
          metersPerPixel: (() => {
            const px = Math.abs(gateAX - gateBX) * frameWidth;
            return px > 0 ? points.distanceM / px : 0;
          })(),
          frameWidth,
          frameHeight,
        }
      : null;
  const usableScale = scale && scale.metersPerPixel > 0 ? scale : null;

  // STAGE 1 — the full-run event stream: every reliable contact across the whole
  // visible run, detected with NO knowledge of the calibration gates or the zone
  // (Day 71). Calibration measures these events; it never decides which exist.
  const fullRun = buildFullRunEvents(frames);

  // STAGE 2 (this function) — measure the zone. Contacts in WORLD coordinates: each
  // mark's frame position shifted by the camera offset at its contact time, so gaps
  // reflect real ground travel — not camera pan — on panning footage.
  type WorldMark = StepMark & { wx: number; wy: number };
  const detected = fullRun.contacts;
  const worldPositions: WorldMark[] = detected.map((m) => {
    const o = off(m.time);
    return { ...m, wx: m.x + o.x, wy: m.y + o.y };
  });
  const marks: WorldMark[] = worldPositions.map((m, i) => {
    if (i === 0) return { ...m, distanceFromPrev: null, distanceMetersFromPrev: null };
    const prev = worldPositions[i - 1];
    const distNorm = Math.hypot(m.wx - prev.wx, m.wy - prev.wy);
    const meters = usableScale
      ? Math.hypot((m.wx - prev.wx) * w, (m.wy - prev.wy) * h) * usableScale.metersPerPixel
      : null;
    return { ...m, distanceFromPrev: distNorm, distanceMetersFromPrev: meters };
  });
  const totalContacts = marks.length;
  const leftContacts = marks.filter((m) => m.side === "left").length;
  const rightContacts = marks.filter((m) => m.side === "right").length;

  // Torso path in WORLD x (for zone-crossing timing under pan). The torso/chest
  // crossing each gate bar is what starts/stops the timer (Day 66), matching a
  // physical timing beam rather than the lower hip-only centre of mass.
  const worldSeries = torsoSeries(frames).map((s) => ({ t: s.t, x: s.x + off(s.t).x, frame: s.frame }));
  const minZoneX = Math.min(gateAX, gateBX);
  const maxZoneX = Math.max(gateAX, gateBX);
  const netTravel = worldSeries.length >= 2 ? worldSeries[worldSeries.length - 1].x - worldSeries[0].x : 1;
  // Direction of travel: prefer the coach-configured `travelDirection` (set once,
  // at calibration time, from the physical setup) over inferring it from the
  // torso track's net displacement. Net-travel inference is fragile with sparse
  // or unreliable tracking — a handful of stray/misidentified samples can flip
  // its sign and silently swap which gate is "entry" vs "exit" (Day 94 audit:
  // this produced an inverted zone on a session with heavy tracking loss).
  const configuredDirection = anchorOptions?.gates?.travelDirection;
  const travelsRightward = configuredDirection
    ? configuredDirection === "left_to_right"
    : netTravel >= 0;
  const zone: SprintZone | null = points
    ? {
        minX: minZoneX,
        maxX: maxZoneX,
        entryX: travelsRightward ? minZoneX : maxZoneX,
        exitX: travelsRightward ? maxZoneX : minZoneX,
        distanceM: points.distanceM,
      }
    : null;

  // Canonical zone membership (Day 93): classify each contact against the
  // world-locked start→finish axis. This is deliberately spatial only; timing
  // remains the independent torso/gate-crossing measurement below.
  // Phase R4B (Part D): whether the canonical longitudinal coordinate may be
  // computed no longer depends on `cameraType === "panning"` (i.e. merely on
  // whether `cameraEvidence` happens to be supplied) — a session may reach
  // the canonical path either because real camera-motion evidence exists
  // (unchanged from before this phase) OR because the caller explicitly
  // requested CANONICAL_LONGITUDINAL for a stationary camera (new this
  // phase). Camera-type-specific input eligibility (whether cameraEvidence
  // itself is trustworthy/available) is preserved exactly as-is; only the
  // SCIENTIFIC MODEL decision is now explicit, not inferred from it.
  const canUseCanonicalForStationary =
    requestedModelVersion === MEASUREMENT_MODEL_CANONICAL_LONGITUDINAL && !anchorOptions?.cameraEvidence;
  const anchoredGates =
    anchorOptions?.gates?.startBoundary &&
    anchorOptions.gates.finishBoundary &&
    (anchorOptions.cameraEvidence || canUseCanonicalForStationary) &&
    frameWidth &&
    frameHeight
      ? anchorOptions.gates
      : null;
  const contactId = (mark: StepMark) =>
    `contact-${mark.sourceFrameIndex}-${mark.side}-${mark.index}`;
  const zoneStepSummary: ZoneStepSummary | null = (() => {
    if (!anchoredGates || !frameWidth || !frameHeight) return null;
    const startBoundary = anchoredGates.startBoundary!;
    const finishBoundary = anchoredGates.finishBoundary!;
    let start: { x: number; y: number };
    let finish: { x: number; y: number };
    let contacts: { id: string; side: StepSide; timeS: number; sourceFrameIndex: number; x: number; y: number; confidence: number }[];
    if (anchorOptions?.cameraEvidence) {
      // UNCHANGED from before Phase R4B — real camera-motion-compensated
      // projection, byte-identical code path, still the only path used
      // whenever real cameraEvidence is supplied (panning cameras).
      const startLine = sourceLineToCanonicalWorld(
        startBoundary.sourceFrameLine.c1,
        startBoundary.sourceFrameLine.c2,
        startBoundary.setupFrameIndex,
        "start",
        anchorOptions.cameraEvidence,
        frameWidth,
        frameHeight,
      );
      const finishLine = sourceLineToCanonicalWorld(
        finishBoundary.sourceFrameLine.c1,
        finishBoundary.sourceFrameLine.c2,
        finishBoundary.setupFrameIndex,
        "finish",
        anchorOptions.cameraEvidence,
        frameWidth,
        frameHeight,
      );
      start = { x: (startLine.c1.x + startLine.c2.x) / 2, y: (startLine.c1.y + startLine.c2.y) / 2 };
      finish = { x: (finishLine.c1.x + finishLine.c2.x) / 2, y: (finishLine.c1.y + finishLine.c2.y) / 2 };
      const confidenceByFrame = new Map(
        frames.map((frame) => [frame.sourceFrameIndex ?? frame.frame, frame.trackingConfidence ?? 1]),
      );
      contacts = detected.map((mark) => {
        const world = sourcePointToCanonicalWorld(
          { x: mark.x, y: mark.y },
          mark.sourceFrameIndex,
          anchorOptions.cameraEvidence!,
          frameWidth,
          frameHeight,
        );
        return {
          id: contactId(mark),
          side: mark.side,
          timeS: mark.time,
          sourceFrameIndex: mark.sourceFrameIndex,
          x: world.x,
          y: world.y,
          confidence: Math.min(world.projectionConfidence, confidenceByFrame.get(mark.sourceFrameIndex) ?? 1),
        };
      });
    } else {
      // NEW this phase — no real camera-motion evidence (or none supplied),
      // reached only when the caller explicitly requested
      // CANONICAL_LONGITUDINAL. Reuses the SAME already-computed world
      // positions the legacy path itself uses (`gateWorldX/Y`, `off()`,
      // `WorldMark.wx/wy`) — for a genuinely stationary camera `off()` is
      // always {0,0}, so this is exactly the raw frame coordinate; for a
      // panning camera that simply wasn't given cameraEvidence, it degrades
      // to the same graceful frame-coordinate fallback the legacy path has
      // always used. No new camera-motion estimation, no
      // `propagateSourcePoint`/reliability-gated projection — those remain
      // exclusively the real-camera-evidence path above, unchanged.
      // Inline midpoint (not `gates.ts`'s `gateMidpoint()`, which expects a
      // full `GateBar` with `timeS` — `sourceFrameLine` is just the two
      // corner points) — identical arithmetic, `(c1+c2)/2`.
      const startMidFrame = {
        x: (startBoundary.sourceFrameLine.c1.x + startBoundary.sourceFrameLine.c2.x) / 2,
        y: (startBoundary.sourceFrameLine.c1.y + startBoundary.sourceFrameLine.c2.y) / 2,
      };
      const finishMidFrame = {
        x: (finishBoundary.sourceFrameLine.c1.x + finishBoundary.sourceFrameLine.c2.x) / 2,
        y: (finishBoundary.sourceFrameLine.c1.y + finishBoundary.sourceFrameLine.c2.y) / 2,
      };
      start = {
        x: gateWorldX(startMidFrame.x, startBoundary.setupTimestampS),
        y: gateWorldY(startMidFrame.y, startBoundary.setupTimestampS),
      };
      finish = {
        x: gateWorldX(finishMidFrame.x, finishBoundary.setupTimestampS),
        y: gateWorldY(finishMidFrame.y, finishBoundary.setupTimestampS),
      };
      contacts = worldPositions.map((m) => ({
        id: contactId(m),
        side: m.side,
        timeS: m.time,
        sourceFrameIndex: m.sourceFrameIndex,
        x: m.wx,
        y: m.wy,
        confidence: frames.find((f) => (f.sourceFrameIndex ?? f.frame) === m.sourceFrameIndex)?.trackingConfidence ?? 1,
      }));
    }
    return analyzeZoneSteps({
      contacts,
      start,
      finish,
      distanceM: anchoredGates.distanceM,
    });
  })();

  // Times the TORSO crosses the entry / exit gates (world x) — the zone timer.
  // A crossing is only VERIFIED when the tracked torso path was actually seen on
  // both sides of the gate (or, for the world-anchored path, detected with
  // adequate transform/body confidence) — never from extrapolation, a clamp to
  // the first/last tracked frame, or the span between unrelated contacts. Zone
  // TIME is reported ONLY when both the start and finish crossings are verified
  // (Day 94 audit: a session with heavy athlete-tracking loss previously reported
  // a fabricated ~8s zone time from an extrapolated/clamped crossing pair).
  let tEntry: number | null = null;
  let tExit: number | null = null;
  let entryExtrapolated = false;
  let exitExtrapolated = false;
  let entryVerified = false;
  let exitVerified = false;
  let startCrossingFrame: number | null = null;
  let finishCrossingFrame: number | null = null;
  let crossingDetectionMethod: "world_anchored" | "screen_fixed_interpolated" | null = null;
  let timingAvailabilityReason: string | null = null;
  const anchoredZone = anchorOptions?.gates?.startBoundary && anchorOptions.gates.finishBoundary
    && anchorOptions.cameraEvidence && frameWidth && frameHeight ? anchorOptions.gates : null;
  if (anchoredZone && anchorOptions?.cameraEvidence && frameWidth && frameHeight) {
    crossingDetectionMethod = "world_anchored";
    const samples = frames.flatMap((frame) => {
      const body = torsoPoint(frame);
      return body ? [{
        frameIndex: frame.sourceFrameIndex ?? frame.frame,
        timestampS: frame.time,
        bodyPoint: { x: body.x, y: body.y },
        confidence: frame.trackingConfidence ?? 0,
      }] : [];
    });
    const direction = anchoredZone.travelDirection ?? "left_to_right";
    const entry = detectWorldBoundaryCrossing(samples, anchoredZone.startBoundary!,
      anchorOptions.cameraEvidence, frameWidth, frameHeight, direction);
    const exit = detectWorldBoundaryCrossing(samples, anchoredZone.finishBoundary!,
      anchorOptions.cameraEvidence, frameWidth, frameHeight, direction);
    tEntry = entry?.timestampS ?? null;
    tExit = exit?.timestampS ?? null;
    startCrossingFrame = entry?.afterFrame ?? null;
    finishCrossingFrame = exit?.afterFrame ?? null;
    entryVerified = entry != null && entry.confidence >= MIN_VERIFIED_CROSSING_CONFIDENCE;
    exitVerified = exit != null && exit.confidence >= MIN_VERIFIED_CROSSING_CONFIDENCE;
    if (!entry || !exit) {
      timingAvailabilityReason = !entry && !exit
        ? "start_and_finish_crossings_unavailable"
        : !entry ? "start_crossing_unavailable" : "finish_crossing_unavailable";
      warnings.push(
        "Physical timing was withheld because a world-anchored boundary could not be propagated or crossed confidently.",
      );
    } else if (!entryVerified || !exitVerified) {
      timingAvailabilityReason = "crossing_confidence_below_threshold";
      warnings.push(
        "Physical timing was withheld because a world-anchored crossing was detected with insufficient confidence.",
      );
    }
  } else if (zone && worldSeries.length >= 2) {
    crossingDetectionMethod = "screen_fixed_interpolated";
    const dir = travelsRightward ? 1 : -1;
    const entryCross = crossingTime(worldSeries, zone.entryX, dir);
    const exitCross = crossingTime(worldSeries, zone.exitX, dir);
    if (entryCross) {
      tEntry = entryCross.time;
      entryExtrapolated = entryCross.extrapolated;
      entryVerified = entryCross.verified;
      startCrossingFrame = entryCross.frame;
    }
    if (exitCross) {
      tExit = exitCross.time;
      exitExtrapolated = exitCross.extrapolated;
      exitVerified = exitCross.verified;
      finishCrossingFrame = exitCross.frame;
    }
    if (!entryCross || !exitCross) {
      timingAvailabilityReason = !entryCross && !exitCross
        ? "start_and_finish_crossings_unavailable"
        : !entryCross ? "start_crossing_unavailable" : "finish_crossing_unavailable";
    } else if (!entryVerified || !exitVerified) {
      timingAvailabilityReason = "crossing_extrapolated_not_verified";
      warnings.push(
        "Physical timing was withheld because the athlete's tracked path did not directly bracket both calibration gates — the closest estimate was an extrapolation, not a verified crossing.",
      );
    }
  } else {
    timingAvailabilityReason = zone ? "athlete_tracking_unavailable" : "not_calibrated";
  }
  const zoneTimingVerified = entryVerified && exitVerified && tEntry != null && tExit != null && tExit > tEntry;
  if (zone && !zoneTimingVerified && timingAvailabilityReason == null) {
    timingAvailabilityReason = "crossing_order_invalid";
  }

  // Day 96 audit (Part 7) — the minimum crossing-evidence contract. A crossing
  // can be a genuine bracket (zoneTimingVerified above) and STILL sit right
  // after/before a long fragmented gap with almost nothing around it — that
  // is real evidence, but thin evidence, and must not be reported with the
  // same confidence as a crossing surrounded by dense, continuous tracking.
  const MIN_SURROUNDING_CONTINUITY_FRAMES = 3;
  const framesByIndex = new Map(frames.map((f) => [f.sourceFrameIndex ?? f.frame, f]));
  const countConsecutiveTracked = (centerIndex: number | null, direction: 1 | -1): number => {
    if (centerIndex == null) return 0;
    let count = 0;
    let i = centerIndex + direction;
    while (count < 30) {
      const f = framesByIndex.get(i);
      if (!f || !torsoPoint(f)) break;
      count += 1;
      i += direction;
    }
    return count;
  };
  const startContinuityBefore = countConsecutiveTracked(startCrossingFrame, -1);
  const startContinuityAfter = countConsecutiveTracked(startCrossingFrame, 1);
  const finishContinuityBefore = countConsecutiveTracked(finishCrossingFrame, -1);
  const finishContinuityAfter = countConsecutiveTracked(finishCrossingFrame, 1);
  const sufficientSurroundingContinuity =
    Math.min(startContinuityBefore, startContinuityAfter, finishContinuityBefore, finishContinuityAfter)
    >= MIN_SURROUNDING_CONTINUITY_FRAMES;
  // Bracketed by consecutive SOURCE frames (not merely two tracked samples
  // that happen to straddle the gate with a large gap in source-frame terms).
  const startBracketedConsecutively =
    startCrossingFrame != null && framesByIndex.has(startCrossingFrame) && framesByIndex.has(startCrossingFrame - 1)
    && torsoPoint(framesByIndex.get(startCrossingFrame - 1)!) != null;
  const finishBracketedConsecutively =
    finishCrossingFrame != null && framesByIndex.has(finishCrossingFrame) && framesByIndex.has(finishCrossingFrame - 1)
    && torsoPoint(framesByIndex.get(finishCrossingFrame - 1)!) != null;
  const timingStatus: "verified" | "provisionally_verified" | "unavailable" = !zoneTimingVerified
    ? "unavailable"
    : (sufficientSurroundingContinuity && !entryExtrapolated && !exitExtrapolated)
      ? "verified"
      : "provisionally_verified";
  if (timingStatus === "provisionally_verified" && timingAvailabilityReason == null) {
    timingAvailabilityReason = "insufficient_surrounding_continuity";
  }

  // Valid steps: a contact counts when it sits spatially between the two gates
  // (world x) OR when it falls temporally within the gate-crossing window. The
  // time criterion recovers boundary contacts that per-contact camera-compensation
  // noise would otherwise push just outside the gates — so all steps the athlete
  // actually took between the gates are counted.
  const inWindow = (m: WorldMark) =>
    tEntry != null && tExit != null && tExit > tEntry && m.time >= tEntry - EPS && m.time <= tExit + EPS;
  const inZone = (m: WorldMark) =>
    !zone || (m.wx >= zone.minX - EPS && m.wx <= zone.maxX + EPS) || inWindow(m);
  // Phase R4B (Part T): zoneStepSummary now activates for TWO different
  // reasons — real camera evidence (unchanged, pre-existing panning path)
  // or an explicit CANONICAL_LONGITUDINAL request with no camera evidence
  // (new, stationary path). Valid-contact zone membership and Step
  // Frequency must NOT change under the new path (R4A explicitly proved
  // Frequency already reconstructs correctly; this phase's scope is step
  // length + Peak Velocity's distance term ONLY) — so those two metrics
  // keep deferring to zoneStepSummary ONLY when it was reached the
  // pre-existing way. Under the new stationary-canonical path,
  // zoneStepSummary exists (for step-length/Peak-Velocity sourcing below)
  // but does not drive membership/frequency — those fall through to the
  // exact same legacy computation as before this phase.
  const zoneStepSummaryGovernsLegacyMetrics = zoneStepSummary != null && anchorOptions?.cameraEvidence != null;
  const canonicalInZoneIds = zoneStepSummaryGovernsLegacyMetrics
    ? new Set(zoneStepSummary!.contacts.filter((contact) => contact.countedInZone).map((contact) => contact.id))
    : null;
  const validMarks = canonicalInZoneIds
    ? marks.filter((mark) => canonicalInZoneIds.has(contactId(mark)))
    : marks.filter(inZone);
  const validContacts = validMarks.length;
  const validLeftContacts = validMarks.filter((m) => m.side === "left").length;
  const validRightContacts = validMarks.filter((m) => m.side === "right").length;

  // Legacy overlay numbering may still identify the contact before Start. It is
  // retained only for diagnostics; canonical zone lengths explicitly begin at the
  // first in-zone contact and never consume this pre-zone anchor.
  let entryStepMark: WorldMark | null = null;
  if (zone && validMarks.length) {
    const firstIdx = marks.indexOf(validMarks[0]);
    const candidate = firstIdx > 0 ? marks[firstIdx - 1] : null;
    if (candidate && !inZone(candidate)) {
      const gapS = validMarks[0].time - candidate.time;
      if (gapS > 0 && gapS <= 0.5) entryStepMark = candidate;
    }
  }

  // Elapsed time — the COM's traversal of the zone (world x) between the start
  // and finish crossings, and ONLY that. There is deliberately no fallback to the
  // span between the first/last valid contact, the pose-track duration, or the
  // clip/video duration: a zone time is either a verified crossing pair or it is
  // unavailable (Day 94 audit — see `timingAvailabilityReason`). `rawZoneTimeS`
  // is retained for diagnostics even when NOT verified (e.g. one extrapolated
  // endpoint); only `zoneTimeS`/`reportedZoneTimeS` — the reported figures — are
  // gated on `zoneTimingVerified`.
  let rawZoneTimeS: number | null = null;
  if (tEntry != null && tExit != null && tExit > tEntry) rawZoneTimeS = tExit - tEntry;
  const rawZoneElapsedS = zoneTimingVerified ? rawZoneTimeS : null;
  const reportedZoneElapsedS =
    rawZoneElapsedS == null ? null : reportTimeSeconds(rawZoneElapsedS);
  if (zone && !zoneTimingVerified) {
    warnings.push(
      `Zone time is unavailable: ${timingAvailabilityReason ?? "crossings could not be verified"}.`,
    );
  }

  // Step frequency — VueMotion definition (Day 63). A "step" is the interval
  // between two consecutive contacts; the step's SIDE is the landing foot (the
  // later contact). Frequency = 1 / mean(step interval):
  //   • combined  = 1 / mean(all step intervals)         (= (N-1)/span; primary)
  //   • left/right = 1 / mean(intervals landing on that foot)
  // Left + right therefore do NOT sum to combined — they match how VueMotion
  // reports per-side cadence, so benchmark comparisons are directly comparable.
  const freqMarks = zone ? validMarks : marks;
  const legacyFrequency = stepFrequenciesFromContacts(freqMarks);
  const {
    combined: combinedStepFrequencyHz,
    left: leftStepFrequencyHz,
    right: rightStepFrequencyHz,
  } = zoneStepSummaryGovernsLegacyMetrics
    ? {
        combined: zoneStepSummary!.summaries.stepFrequencyHz,
        left: zoneStepSummary!.summaries.leftStepFrequencyHz,
        right: zoneStepSummary!.summaries.rightStepFrequencyHz,
      }
    : legacyFrequency;

  // Ground-contact + flight time (Day 68): measured from the overlay foot
  // trajectory at each contact, restricted to the IN-ZONE contacts (through the
  // finish gate — nothing after it) so it matches the zone the coach defined. Per
  // foot + combined. The contact/flight of the entry step is NOT included (it's an
  // anchor only). Times come from the frames' own timestamps, so the active FPS is
  // already baked in.
  const zoneFrameSet = new Set((zone ? validMarks : marks).map((m) => m.frame));
  // Zone filter applied to the full-run contact phases (Stage 2 measuring Stage 1).
  // Canonical sessions additionally label every contact/flight boundary event and
  // average only full events. Partial boundary events remain visible as evidence.
  const contactPhases = fullRun.contactPhases.filter((p) => zoneFrameSet.has(p.frame));
  let contactFlight: ContactFlightSummary = summariseContactFlight(contactPhases);
  // Phase R4B: ground-contact/flight time are out of this phase's scope
  // (design-only per R4A Part J) — keep them on the pre-existing computation
  // under the new stationary-canonical path exactly like validMarks/frequency
  // above; unchanged (zoneStepSummary-driven) for the pre-existing panning path.
  if (zoneStepSummaryGovernsLegacyMetrics) {
    const markByFrameSide = new Map(
      detected.map((mark) => [`${mark.frame}:${mark.side}`, mark]),
    );
    const phaseById = new Map(
      fullRun.contactPhases.flatMap((phase) => {
        const mark = markByFrameSide.get(`${phase.frame}:${phase.side}`);
        return mark ? [[contactId(mark), phase] as const] : [];
      }),
    );
    zoneStepSummary.eventBoundaries.contactEvents = zoneStepSummary.contacts.map((contact) => {
      const phase = phaseById.get(contact.id);
      const status =
        contact.classification === "boundary_ambiguous"
          ? "boundary_ambiguous"
          : !contact.countedInZone
            ? "excluded"
            : phase && tExit != null && phase.toeOffTimeS > tExit + EPS
              ? "partial_event"
              : "full_event";
      return {
        contactId: contact.id,
        status,
        durationS: phase ? Number((phase.contactMs / 1000).toFixed(6)) : null,
      };
    });
    zoneStepSummary.eventBoundaries.flightEvents = zoneStepSummary.intervals.map((interval) => {
      const from = phaseById.get(interval.fromContactId);
      const to = phaseById.get(interval.toContactId);
      const durationS = from && to ? to.touchdownTimeS - from.toeOffTimeS : null;
      const status =
        !interval.valid || durationS == null || durationS < 0
          ? "excluded"
          : interval.kind === "trailing_exit"
            ? "partial_event"
            : "full_event";
      return {
        fromContactId: interval.fromContactId,
        toContactId: interval.toContactId,
        status,
        durationS: durationS == null || durationS < 0 ? null : Number(durationS.toFixed(6)),
      };
    });
    const fullContactIds = new Set(
      zoneStepSummary.eventBoundaries.contactEvents
        .filter((event) => event.status === "full_event")
        .map((event) => event.contactId),
    );
    const fullPhases = [...phaseById.entries()]
      .filter(([id]) => fullContactIds.has(id))
      .map(([, phase]) => phase);
    const fullFlights = zoneStepSummary.eventBoundaries.flightEvents
      .filter((event) => event.status === "full_event" && event.durationS != null);
    const leftContactsMs = fullPhases.filter((phase) => phase.side === "left").map((phase) => phase.contactMs);
    const rightContactsMs = fullPhases.filter((phase) => phase.side === "right").map((phase) => phase.contactMs);
    const flightSide = (event: (typeof fullFlights)[number]) =>
      zoneStepSummary.contacts.find((contact) => contact.id === event.fromContactId)?.side;
    const leftFlightsMs = fullFlights.filter((event) => flightSide(event) === "left").map((event) => event.durationS! * 1000);
    const rightFlightsMs = fullFlights.filter((event) => flightSide(event) === "right").map((event) => event.durationS! * 1000);
    const avg = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    contactFlight = {
      groundContactLeftMs: avg(leftContactsMs),
      groundContactRightMs: avg(rightContactsMs),
      groundContactCombinedMs: avg([...leftContactsMs, ...rightContactsMs]),
      flightLeftMs: avg(leftFlightsMs),
      flightRightMs: avg(rightFlightsMs),
      flightCombinedMs: avg([...leftFlightsMs, ...rightFlightsMs]),
      contactFramesLeft: avg(fullPhases.filter((phase) => phase.side === "left").map((phase) => phase.contactFrames)),
      contactFramesRight: avg(fullPhases.filter((phase) => phase.side === "right").map((phase) => phase.contactFrames)),
      leftContacts: leftContactsMs.length,
      rightContacts: rightContactsMs.length,
    };
    zoneStepSummary.summaries.averageContactTimeS =
      contactFlight.groundContactCombinedMs == null ? null : Number((contactFlight.groundContactCombinedMs / 1000).toFixed(6));
    zoneStepSummary.summaries.averageFlightTimeS =
      contactFlight.flightCombinedMs == null ? null : Number((contactFlight.flightCombinedMs / 1000).toFixed(6));
  }

  // Step lengths. With canonical gates, the interval window starts at the first
  // in-zone contact and ends at the first post-zone contact. Older, unanchored
  // calibrations retain their legacy gap behaviour as an explicit fallback.
  const gapMarks = zone ? validMarks : marks;
  const canonicalIntervals = zoneStepSummary?.intervals ?? null;
  const intervalByLandingId = new Map(
    (canonicalIntervals ?? []).map((interval) => [interval.toContactId, interval]),
  );

  // Day 103 (Part 7): the legacy (unanchored) gap path had NO missing-contact
  // integrity check at all — `distanceMetersFromPrev` was reported as a step
  // length however large the underlying gap. Real production evidence: a
  // 425ms/102-frame gap between two otherwise-valid contacts (a real
  // intermediate foot-strike went undetected) was reported as a 7.19m single
  // step. Evaluate every legacy gap the same way `zoneStepAnalysis.ts` now
  // does canonical intervals, BEFORE deriving any average/individual/per-side
  // number from it, so a merged-contact gap is marked unavailable instead of
  // displayed as a step.
  interface LegacyInterval {
    mark: WorldMark;
    distanceM: number | null;
    valid: boolean;
    reasons: StepIntegrityReason[];
  }
  const legacyCandidates: Array<{ mark: WorldMark; prev: WorldMark; distanceM: number; durationS: number }> = [];
  if (!canonicalIntervals) {
    for (const m of gapMarks) {
      const globalIdx = marks.indexOf(m);
      const prev = globalIdx > 0 ? marks[globalIdx - 1] : null;
      const distanceM = m.distanceMetersFromPrev;
      if (prev && distanceM != null && distanceM > 0) {
        legacyCandidates.push({ mark: m, prev, distanceM, durationS: m.time - prev.time });
      }
    }
  }
  const legacyIntervals: LegacyInterval[] = canonicalIntervals
    ? []
    : gapMarks.map((m) => {
        const candidate = legacyCandidates.find((c) => c.mark === m);
        if (!candidate) return { mark: m, distanceM: null, valid: false, reasons: [] };
        const neighborDistancesM = legacyCandidates
          .filter((other) => other.mark !== m)
          .map((other) => other.distanceM);
        const integrity = evaluateStepInterval({
          fromSide: candidate.prev.side, toSide: candidate.mark.side,
          durationS: candidate.durationS, distanceM: candidate.distanceM, neighborDistancesM,
        });
        return { mark: m, distanceM: candidate.distanceM, valid: integrity.valid, reasons: integrity.reasons };
      });
  const legacyIntervalByMark = new Map(legacyIntervals.map((entry) => [entry.mark, entry]));

  const individualStepLengthsM = canonicalIntervals
    ? canonicalIntervals
        .map((interval) => interval.longitudinalLengthM)
        .filter((value): value is number => value != null)
    : legacyIntervals
        .filter((entry) => entry.valid && entry.distanceM != null)
        .map((entry) => entry.distanceM as number);
  const leftGaps = canonicalIntervals
    ? canonicalIntervals
        .filter((interval) => interval.toSide === "left")
        .map((interval) => interval.longitudinalLengthM)
        .filter((value): value is number => value != null)
    : legacyIntervals
        .filter((entry) => entry.valid && entry.mark.side === "left" && entry.distanceM != null)
        .map((entry) => entry.distanceM as number);
  const rightGaps = canonicalIntervals
    ? canonicalIntervals
        .filter((interval) => interval.toSide === "right")
        .map((interval) => interval.longitudinalLengthM)
        .filter((value): value is number => value != null)
    : legacyIntervals
        .filter((entry) => entry.valid && entry.mark.side === "right" && entry.distanceM != null)
        .map((entry) => entry.distanceM as number);

  // Step-by-step sequence through the zone (Day 73): each valid in-zone contact with
  // its step length from the previous contact + which foot that was. Pure exposure of
  // the same numbers the averages use — no new math, so nothing downstream changes.
  const zoneSteps: ZoneStep[] = gapMarks.map((m, i) => {
    const globalIdx = marks.indexOf(m);
    const prev = globalIdx > 0 ? marks[globalIdx - 1] : null;
    const canonical = zoneStepSummary?.contacts.find((contact) => contact.id === contactId(m));
    const interval = intervalByLandingId.get(contactId(m));
    const legacy = legacyIntervalByMark.get(m);
    const stepLengthM = canonicalIntervals
      ? interval?.longitudinalLengthM ?? null
      : usableScale && legacy?.valid
        ? (legacy.distanceM ?? null)
        : null;
    // Phase R1B: the SAME already-computed calibrated physical distance
    // (never a second formula) -- `interval.rawLongitudinalDisplacementM`
    // (canonical) or `legacy.distanceM` (legacy two-point; already scale-
    // converted, already null when unscaled since it derives from
    // `WorldMark.distanceMetersFromPrev`) -- shown whenever the interval
    // represents a legitimate single step, even if it also carries a
    // cruise-phase-ceiling-only rejection reason `stepLengthM` requires.
    const physicalCandidateM = canonicalIntervals
      ? interval?.rawLongitudinalDisplacementM ?? null
      : legacy?.distanceM ?? null;
    const evidenceReasons = canonicalIntervals ? canonical?.qualityFlags : legacy?.reasons;
    const hasEvidenceGap = hasPhysicalStepEvidenceGap(evidenceReasons);
    const physicalStepLengthM = physicalCandidateM != null && Number.isFinite(physicalCandidateM) && physicalCandidateM > 0 && !hasEvidenceGap
      ? physicalCandidateM
      : null;
    const physicalStepLengthState: ZoneStep["physicalStepLengthState"] =
      stepLengthM != null
        ? "accepted_for_metrics"
        : physicalStepLengthM != null
          ? "presentation_only"
          : hasEvidenceGap
            ? "missing_contact"
            : "invalid_interval";
    return {
      index: i + 1,
      contactId: contactId(m),
      side: m.side,
      timeS: m.time,
      worldX: m.wx,
      stepLengthM,
      physicalStepLengthM,
      physicalStepLengthState,
      fromSide: interval ? interval.fromSide : prev ? prev.side : null,
      longitudinalM: canonical?.longitudinalM,
      lateralM: canonical?.lateralM,
      classification: canonical?.classification,
      qualityFlags: canonical?.qualityFlags ?? (legacy && legacy.reasons.length ? legacy.reasons : undefined),
    };
  });

  const avgIndividualStepLengthM = mean(individualStepLengthsM);
  const leftStepLengthM = zoneStepSummary?.summaries.leftStepAverageM ?? median(leftGaps);
  const rightStepLengthM = zoneStepSummary?.summaries.rightStepAverageM ?? median(rightGaps);
  // Day 104 (Part 6): this naive "zone distance ÷ contact count" aggregate
  // (Method 1, used only when the canonical per-interval `zoneStepSummary`
  // isn't available) implicitly assumes every real step in the zone was
  // detected — when pose evidence is fragmented (missed contacts, e.g. the
  // real Vanni 60fps clip), `validContacts` under-counts true steps and this
  // silently inflates the implied average. Guarded with the exact same
  // evidence-based ceiling `evaluateStepInterval` already applies to
  // individual intervals, rather than displaying an unprotected number.
  const avgZoneStepLengthNaive =
    !zoneStepSummary && zone && validContacts > 0 && usableScale ? zone.distanceM / validContacts : null;
  const zoneStepLengthIntegrity =
    avgZoneStepLengthNaive != null ? evaluateAggregateStepLength(avgZoneStepLengthNaive, individualStepLengthsM) : null;
  if (avgZoneStepLengthNaive != null && zoneStepLengthIntegrity && !zoneStepLengthIntegrity.valid) {
    warnings.push(
      `Zone-average step length unavailable: ${validContacts} contact(s) across ${zone!.distanceM}m implies ` +
        `${avgZoneStepLengthNaive.toFixed(2)}m/step, beyond the evidence-based ceiling ` +
        `(${zoneStepLengthIntegrity.ceilingM.toFixed(2)}m) — contact evidence is too sparse to trust (sparse_contact_evidence).`,
    );
  }
  const avgZoneStepLengthM = zoneStepSummary
    ? zoneStepSummary.summaries.averageStepLengthM
    : zoneStepLengthIntegrity?.valid
      ? avgZoneStepLengthNaive
      : null;

  // AVA Peak Stride Length (Day 82): average of the best-4 opposite-foot contact
  // distances (these gaps ARE AVA strides). Retention = zone average ÷ peak.
  const peakStrideLengthM = usableScale ? computePeakStrideLengthM(individualStepLengthsM) : null;
  const strideRetentionPct = usableScale
    ? computeStrideRetentionPct(avgIndividualStepLengthM, peakStrideLengthM)
    : null;

  // Individual reliability: tight spread → trust individual lengths; otherwise the
  // zone average is the trusted value and individuals are lower confidence.
  const cv = coefficientOfVariation(individualStepLengthsM);
  const stepLengthConfidence: MeasurementConfidence = zoneStepSummary
    ? zoneStepSummary.confidence.label === "high"
      ? "high"
      : zoneStepSummary.confidence.label === "moderate"
        ? "medium"
        : "low"
    : !usableScale
    ? "low"
    : cv == null
      ? "medium"
      : cv <= 0.15
        ? "high"
        : cv <= 0.3
          ? "medium"
          : "low";

  // Velocity, three independent ways + a max and the zone value.
  const rawDistanceOverTime =
    zone && rawZoneElapsedS && rawZoneElapsedS > 0 ? zone.distanceM / rawZoneElapsedS : null;
  const vDistanceOverTime =
    zone && rawZoneElapsedS && rawZoneElapsedS > 0
      ? velocityFromReportedTime(zone.distanceM, rawZoneElapsedS)
      : null;
  const vAvgLenFreq =
    avgIndividualStepLengthM != null && combinedStepFrequencyHz != null
      ? avgIndividualStepLengthM * combinedStepFrequencyHz
      : null;
  const medIndividual = median(individualStepLengthsM);
  const vMedianLenFreq =
    medIndividual != null && combinedStepFrequencyHz != null
      ? medIndividual * combinedStepFrequencyHz
      : null;

  const velocities: VelocityEstimate[] = [
    { key: "distanceTime", label: "Zone distance ÷ time", method: "distance / time", value: vDistanceOverTime },
    { key: "avgLenFreq", label: "Avg step length × cadence", method: "avg length × combined frequency", value: vAvgLenFreq },
    { key: "medianLenFreq", label: "Median step length × cadence", method: "median length × combined frequency", value: vMedianLenFreq },
  ];

  // Max velocity — the peak single-stride window (Day 73): the fastest L+R stride
  // through the zone, i.e. the world distance over TWO consecutive contacts ÷ its
  // elapsed time. Averaging a full stride (both feet, two intervals) smooths the
  // frame-quantization noise and the per-foot placement asymmetry that make a single
  // step's velocity unreliable, and it uses the same clock as the zone timer so it
  // stays consistent under FPS normalization. With too few contacts, top speed is
  // withheld rather than inferred from an averaged length×frequency estimate.
  const strideMarks = zone ? validMarks : marks;
  // Phase R4B (Part H): Peak Velocity's DISTANCE TERM only — same window
  // definition (2-interval/full-stride, same `strideMarks`, same `dt`
  // computation) as before this phase, unconditionally. Under
  // CANONICAL_LONGITUDINAL (zoneStepSummary active), the distance is
  // `s(b) - s(a)` — the SAME longitudinal coordinate Step Length already
  // uses, sourced from the SAME `zoneStepSummary.contacts` (no second
  // physical-position calculation). Under LEGACY_2D (zoneStepSummary null),
  // behavior is byte-identical to every prior phase: full 2D Euclidean.
  const longitudinalByContactId = zoneStepSummary
    ? new Map(zoneStepSummary.contacts.map((c) => [c.id, c.longitudinalM]))
    : null;
  const rawStrideWindows: Array<{
    startContactIndex: number;
    endContactIndex: number;
    distanceM: number;
    rawDurationS: number;
  }> = [];
  if (usableScale && strideMarks.length >= 3) {
    for (let i = 0; i + 2 < strideMarks.length; i++) {
      const a = strideMarks[i];
      const b = strideMarks[i + 2];
      const dt = b.time - a.time;
      if (dt <= 0) continue;
      let distM: number;
      if (longitudinalByContactId) {
        const sa = longitudinalByContactId.get(contactId(a));
        const sb = longitudinalByContactId.get(contactId(b));
        // A mark without a canonical longitudinal position (e.g. outside the
        // classified zone) has no legitimate longitudinal distance to report
        // — skip the window rather than silently falling back to a
        // different (2D) formula for only some windows.
        if (sa == null || sb == null) continue;
        distM = sb - sa;
      } else {
        distM = Math.hypot((b.wx - a.wx) * w, (b.wy - a.wy) * h) * usableScale.metersPerPixel;
      }
      rawStrideWindows.push({
        startContactIndex: i,
        endContactIndex: i + 2,
        distanceM: distM,
        rawDurationS: dt,
      });
    }
  }
  const reportedStrideWindows = reportStrideWindows(rawStrideWindows);
  const strideVelocityWindows = reportedStrideWindows.windows;
  const rawMaxVelocityMps = reportedStrideWindows.rawTopVelocityMps;
  const maxVelocityMps = reportedStrideWindows.reportedTopVelocityMps;
  const zoneVelocityMps = vDistanceOverTime;

  // Agreement across the three methods.
  const vals = velocities.map((v) => v.value).filter((v): v is number => v != null && v > 0);
  let velocitySpreadPct: number | null = null;
  let velocityNote = "";
  if (vals.length >= 2) {
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const avg = mean(vals)!;
    velocitySpreadPct = avg > 0 ? ((hi - lo) / avg) * 100 : null;
    if (velocitySpreadPct != null && velocitySpreadPct > 15) {
      velocityNote =
        "Velocity methods disagree by more than 15% — usually the calibration scale, the zone crossing, or step detection needs review. Treat these as lower confidence.";
      warnings.push(velocityNote);
    } else {
      velocityNote = "Velocity methods agree closely — high confidence.";
    }
  }

  if (!usableScale) {
    warnings.push("No manual calibration — set two ground points a known distance apart for metres.");
  }

  // --- Diagnostics: which frames/contacts were used, and why some were dropped ---
  const footVisible = (f: OverlayFrame) => {
    const la = f.landmarks.leftAnkle;
    const ra = f.landmarks.rightAnkle;
    return (la && (la.visibility ?? 1) >= 0.4) || (ra && (ra.visibility ?? 1) >= 0.4);
  };
  const trackedFrames = frames.filter(footVisible).length;
  // Day 99 (Part 6) — structured, non-silent rejection reasons for every
  // full-run contact NOT counted toward the zone metrics. `inZone` itself is
  // unchanged (this only labels its existing decision); a contact excluded
  // for being on the entry side of the start gate gets a different reason
  // than one past the finish gate, so "why was this contact dropped" is
  // always answerable from the artifact, never silent.
  const excludedContacts = marks
    .filter((m) => !inZone(m))
    .map((m) => {
      const beforeStart = zone
        ? (travelsRightward ? m.wx < zone.minX - EPS : m.wx > zone.maxX + EPS)
        : false;
      return {
        time: m.time,
        side: m.side,
        sourceFrameIndex: m.sourceFrameIndex,
        reasonCode: (beforeStart ? "before_start_crossing" : "outside_zone") as
          | "before_start_crossing"
          | "outside_zone",
        reason: beforeStart
          ? "before the calibration start gate (world x on the entry side of the zone)"
          : "outside the calibration gates (world x beyond the zone)",
      };
    });
  const diagNotes: string[] = [];
  const firstContactTimeS = marks.length ? marks[0].time : null;
  if (frames.length && firstContactTimeS != null) {
    // Flag when the athlete was untracked for a meaningful lead-in (pose coverage).
    const clipStart = frames[0].time;
    if (firstContactTimeS - clipStart > 0.4) {
      diagNotes.push(
        `First ground contact detected at ${firstContactTimeS.toFixed(2)}s — the athlete wasn't tracked for the first ${(firstContactTimeS - clipStart).toFixed(2)}s (too small/distant early), so the earliest steps are missing.`,
      );
    }
  }
  if (trackedFrames / Math.max(1, frames.length) < 0.75) {
    diagNotes.push(
      `Only ${Math.round((trackedFrames / Math.max(1, frames.length)) * 100)}% of frames have a tracked foot — spatial coverage is partial.`,
    );
  }
  // Missed EARLY in-zone steps (Day 66): if the first valid contact lags the start
  // gate by more than ~1.5 step intervals, the athlete took steps just inside the
  // zone that weren't detected (small/distant runner or low pose confidence at
  // entry) — the single most common cause of the 20 m benchmark under-counting.
  if (tEntry != null && validMarks.length) {
    const lead = validMarks[0].time - tEntry;
    const stepInterval =
      combinedStepFrequencyHz && combinedStepFrequencyHz > 0 ? 1 / combinedStepFrequencyHz : 0.2;
    if (lead > stepInterval * 1.5) {
      diagNotes.push(
        `First in-zone contact is ${lead.toFixed(2)}s (~${(lead / stepInterval).toFixed(1)} steps) after the torso crossed the start gate — the earliest steps inside the zone were likely missed. Re-run the analysis with the more accurate (heavy) pose model for the entry, or nudge the start gate to where tracking begins.`,
      );
    }
  }
  // Entry step (Day 68): note the Step-1 anchor. It anchors the sequence and
  // contributes the first in-zone stride LENGTH only — it is NOT in the cadence or
  // contact/flight averages (those use in-zone contacts through the finish gate).
  if (entryStepMark) {
    diagNotes.push(
      `Entry step marked as Step 1 (anchor): the last contact before the start gate (${entryStepMark.time.toFixed(2)}s) sets the first in-zone stride length but is excluded from the zone cadence/contact/flight averages.`,
    );
  }
  // Zone-timer extrapolation (Day 67): flag when a gate crossing was estimated past
  // the tracked span (far-end runner untracked at entry / left it at exit), so the
  // zone time is honest about where the constant-velocity assumption was applied.
  if (entryExtrapolated) {
    diagNotes.push(
      "Start-gate crossing was extrapolated to the gate at the torso's entry velocity (the athlete had already passed it when tracking began). This recovers the true zone-entry instant.",
    );
  }
  if (exitExtrapolated) {
    diagNotes.push(
      "Finish-gate crossing was extrapolated to the gate at the torso's exit velocity (tracking ended before the athlete reached it).",
    );
  }
  // Contact/flight timing transparency + the frame-rate precision floor (Day 68).
  // Active FPS is derived from the frames' own timestamps (median Δt); one frame is
  // the raw timing quantum, so contact (~80 ms) spans only a few frames and carries
  // a ±1-frame floor even with sub-frame interpolation.
  const dts: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    const dt = frames[i].time - frames[i - 1].time;
    if (dt > 0) dts.push(dt);
  }
  const medDt = median(dts);
  const activeFps = medDt && medDt > 0 ? 1 / medDt : null;
  const frameMs = medDt != null ? medDt * 1000 : null;
  const timing: TimingDiagnostics = {
    activeFps,
    frameMs,
    leftContacts: contactFlight.leftContacts,
    rightContacts: contactFlight.rightContacts,
    contactFramesLeft: contactFlight.contactFramesLeft,
    contactFramesRight: contactFlight.contactFramesRight,
    groundContactLeftMs: reportNullableMilliseconds(contactFlight.groundContactLeftMs),
    groundContactRightMs: reportNullableMilliseconds(contactFlight.groundContactRightMs),
    flightLeftMs: reportNullableMilliseconds(contactFlight.flightLeftMs),
    flightRightMs: reportNullableMilliseconds(contactFlight.flightRightMs),
  };
  if (frameMs != null && contactFlight.groundContactCombinedMs != null) {
    diagNotes.push(
      `Timing precision floor: at ${activeFps?.toFixed(0)} fps one frame = ${frameMs.toFixed(1)} ms. Ground contact (~${contactFlight.groundContactCombinedMs.toFixed(0)} ms ≈ ${(contactFlight.groundContactCombinedMs / frameMs).toFixed(1)} frames) carries a ±1-frame (~${frameMs.toFixed(0)} ms) floor; the L/R contact/flight spread near that size is quantization, not biomechanics. Capture at 120–240 fps to tighten.`,
    );
  }
  // Day 99 (Part 8) — zone-coverage provenance: how much of the calibrated
  // zone the eligible steps actually span, in real metres, so a partial-zone
  // measurement is always disclosed rather than presented as if it covered
  // the full distance. Positions are measured along the travel direction
  // from the START gate; independent of, and never a substitute for, the
  // step-length/velocity math itself.
  const positionAlongZoneM = (wx: number): number | null => {
    if (!zone || !usableScale || !w) return null;
    const fromStartNorm = travelsRightward ? wx - zone.minX : zone.maxX - wx;
    return fromStartNorm * w * usableScale.metersPerPixel;
  };
  const firstMeasuredPositionM = validMarks.length ? positionAlongZoneM(validMarks[0].wx) : null;
  const lastMeasuredPositionM = validMarks.length
    ? positionAlongZoneM(validMarks[validMarks.length - 1].wx)
    : null;
  const measuredDistanceM =
    firstMeasuredPositionM != null && lastMeasuredPositionM != null
      ? Math.abs(lastMeasuredPositionM - firstMeasuredPositionM)
      : null;
  const measuredZoneFraction =
    measuredDistanceM != null && zone?.distanceM ? measuredDistanceM / zone.distanceM : null;
  const COVERAGE_GAP_THRESHOLD_M = 0.5;
  const missingEarlyZoneReason =
    firstMeasuredPositionM != null && firstMeasuredPositionM > COVERAGE_GAP_THRESHOLD_M
      ? `Step metrics were not measured for the first ${firstMeasuredPositionM.toFixed(1)} m of the ${zone?.distanceM ?? "?"} m zone — insufficient pose evidence to detect a ground contact there.`
      : null;
  const missingLateZoneReason =
    lastMeasuredPositionM != null && zone?.distanceM != null && zone.distanceM - lastMeasuredPositionM > COVERAGE_GAP_THRESHOLD_M
      ? `Step metrics were not measured for the last ${(zone.distanceM - lastMeasuredPositionM).toFixed(1)} m of the ${zone.distanceM} m zone — insufficient pose evidence to detect a ground contact there.`
      : null;
  // Day 100 — coverage confidence: how much evidence backs the WINDOW
  // boundary itself (contact count + internal consistency), independent of
  // `stepLengthConfidence` (which grades the length values, not the window).
  // No manual tuning: purely a function of how many eligible steps exist and
  // whether the engine's own step-length consistency check is high.
  const eligibleStepCount = individualStepLengthsM.length;
  const coverageConfidence: MeasurementConfidence =
    eligibleStepCount === 0
      ? "low"
      : eligibleStepCount >= 3 && stepLengthConfidence === "high"
        ? "high"
        : eligibleStepCount >= 2
          ? "medium"
          : "low";
  const coverageReason =
    missingEarlyZoneReason && missingLateZoneReason
      ? `${missingEarlyZoneReason} ${missingLateZoneReason}`
      : missingEarlyZoneReason ?? missingLateZoneReason;

  const zoneCoverage: ZoneCoverage = {
    zoneDistanceM: zone?.distanceM ?? null,
    measuredDistanceM,
    measuredZoneFraction,
    firstMeasuredPositionM,
    lastMeasuredPositionM,
    eligibleStepCount,
    missingEarlyZoneReason,
    missingLateZoneReason,
    measurementStartPositionM: firstMeasuredPositionM,
    measurementEndPositionM: lastMeasuredPositionM,
    coveragePercent: measuredZoneFraction != null ? measuredZoneFraction * 100 : null,
    coverageReason,
    coverageConfidence,
  };

  const diagnostics: MeasurementDiagnostics = {
    totalFrames: frames.length,
    trackedFrames,
    trackingCoverage: frames.length ? trackedFrames / frames.length : 0,
    firstContactTimeS,
    lastContactTimeS: marks.length ? marks[marks.length - 1].time : null,
    includedContacts: validContacts,
    excludedContacts,
    timing,
    notes: diagNotes,
    zoneCoverage,
  };

  return {
    timingPolicyVersion: CONSERVATIVE_TIMING_POLICY_V1,
    // Phase R4B: reports what ACTUALLY ran (zoneStepSummary non-null means
    // the longitudinal path produced this session's step length/Peak
    // Velocity distance), not merely the caller's request — a
    // CANONICAL_LONGITUDINAL request with no usable calibration/gates still
    // honestly reports LEGACY_2D.
    measurementModelVersion: zoneStepSummary != null ? MEASUREMENT_MODEL_CANONICAL_LONGITUDINAL : DEFAULT_MEASUREMENT_MODEL_VERSION,
    calibrated: !!usableScale,
    metersPerPixel: usableScale ? usableScale.metersPerPixel : null,
    fullRunContacts: fullRun.contacts,
    totalContacts,
    leftContacts,
    rightContacts,
    validContacts,
    validLeftContacts,
    validRightContacts,
    zoneStepSummary,
    zone,
    zoneTimeS: reportedZoneElapsedS,
    rawZoneTimeS: rawZoneElapsedS,
    reportedZoneTimeS: reportedZoneElapsedS,
    zoneEntryTimeS: tEntry,
    zoneExitTimeS: tExit,
    timingProvenance: {
      verified: zoneTimingVerified,
      startCrossingFrame,
      finishCrossingFrame,
      startCrossingTimestampS: tEntry,
      finishCrossingTimestampS: tExit,
      crossingDetectionMethod,
      timingAuthority: "automatic",
      startCrossingExtrapolated: entryExtrapolated,
      finishCrossingExtrapolated: exitExtrapolated,
      timingAvailabilityReason: timingStatus === "verified" ? null : timingAvailabilityReason,
      timingStatus,
      startContinuityFramesBefore: startContinuityBefore,
      startContinuityFramesAfter: startContinuityAfter,
      finishContinuityFramesBefore: finishContinuityBefore,
      finishContinuityFramesAfter: finishContinuityAfter,
      startBracketedByConsecutiveFrames: startBracketedConsecutively,
      finishBracketedByConsecutiveFrames: finishBracketedConsecutively,
    },
    combinedStepFrequencyHz,
    leftStepFrequencyHz,
    rightStepFrequencyHz,
    groundContactLeftMs: reportNullableMilliseconds(contactFlight.groundContactLeftMs),
    groundContactRightMs: reportNullableMilliseconds(contactFlight.groundContactRightMs),
    groundContactCombinedMs: reportNullableMilliseconds(contactFlight.groundContactCombinedMs),
    rawGroundContactCombinedMs: contactFlight.groundContactCombinedMs,
    reportedGroundContactCombinedMs: reportNullableMilliseconds(contactFlight.groundContactCombinedMs),
    rawGroundContactLeftMs: contactFlight.groundContactLeftMs,
    rawGroundContactRightMs: contactFlight.groundContactRightMs,
    flightLeftMs: reportNullableMilliseconds(contactFlight.flightLeftMs),
    flightRightMs: reportNullableMilliseconds(contactFlight.flightRightMs),
    flightCombinedMs: reportNullableMilliseconds(contactFlight.flightCombinedMs),
    rawFlightCombinedMs: contactFlight.flightCombinedMs,
    reportedFlightCombinedMs: reportNullableMilliseconds(contactFlight.flightCombinedMs),
    rawFlightLeftMs: contactFlight.flightLeftMs,
    rawFlightRightMs: contactFlight.flightRightMs,
    avgZoneStepLengthM,
    avgIndividualStepLengthM: usableScale ? avgIndividualStepLengthM : null,
    peakStrideLengthM,
    strideRetentionPct,
    leftStepLengthM: usableScale ? leftStepLengthM : null,
    rightStepLengthM: usableScale ? rightStepLengthM : null,
    individualStepLengthsM,
    zoneSteps,
    stepLengthConfidence,
    velocities,
    maxVelocityMps,
    rawMaxVelocityMps,
    reportedMaxVelocityMps: maxVelocityMps,
    zoneVelocityMps,
    rawZoneVelocityMps: rawDistanceOverTime,
    reportedZoneVelocityMps: zoneVelocityMps,
    strideVelocityWindows,
    velocitySpreadPct,
    velocityNote,
    cameraCompensation,
    diagnostics,
    warnings,
  };
}
