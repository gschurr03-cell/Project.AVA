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
import { type StepMark, type StepSide, type StepDistanceScale } from "@/lib/video/steps";
import { summariseContactFlight, type ContactFlightSummary } from "@/lib/video/contacts";
import { buildFullRunEvents } from "@/lib/video/events";
import type { ManualCalibrationPoints } from "@/lib/calibration";
import { stepFrequenciesFromContacts } from "@/lib/video/cadence";
import {
  estimateCameraMotion,
  cameraOffsetAtTime,
  type CameraConfidence,
  type CameraTrack,
} from "@/lib/video/camera";

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
  /** Contacts dropped from the zone, with the reason (for honest diagnosis). */
  excludedContacts: { time: number; side: StepSide; reason: string }[];
  /** Contact/flight timing transparency + the frame-rate precision floor (Day 68). */
  timing: TimingDiagnostics | null;
  notes: string[];
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

export interface SprintMeasurements {
  calibrated: boolean;
  /** Metres-per-pixel scale used, if any. */
  metersPerPixel: number | null;

  // Contacts (one true ground contact = one step)
  totalContacts: number;
  leftContacts: number;
  rightContacts: number;
  validContacts: number;
  validLeftContacts: number;
  validRightContacts: number;

  // Zone + timing
  zone: SprintZone | null;
  zoneTimeS: number | null;

  // Step frequency (steps/s) — combined is the primary value
  combinedStepFrequencyHz: number | null;
  leftStepFrequencyHz: number | null;
  rightStepFrequencyHz: number | null;

  // Ground-contact + flight time (ms), per foot, measured from the overlay foot
  // trajectory over the in-zone contacts (Day 68). Null when uncomputable.
  groundContactLeftMs: number | null;
  groundContactRightMs: number | null;
  groundContactCombinedMs: number | null;
  flightLeftMs: number | null;
  flightRightMs: number | null;
  flightCombinedMs: number | null;

  // Step length (m) — null when uncalibrated
  avgZoneStepLengthM: number | null;
  avgIndividualStepLengthM: number | null;
  leftStepLengthM: number | null;
  rightStepLengthM: number | null;
  individualStepLengthsM: number[];
  stepLengthConfidence: MeasurementConfidence;

  // Velocity (m/s)
  velocities: VelocityEstimate[];
  maxVelocityMps: number | null;
  zoneVelocityMps: number | null;
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

/** Torso (x, time) samples in frame order, dropping frames without a tracked torso. */
function torsoSeries(frames: OverlayFrame[]): { t: number; x: number }[] {
  const out: { t: number; x: number }[] = [];
  for (const f of frames) {
    const p = torsoPoint(f);
    if (p) out.push({ t: f.time, x: p.x });
  }
  return out;
}

type Sample = { t: number; x: number };

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

/** A zone gate crossing time, plus whether it was extrapolated past the tracked span. */
interface Crossing {
  time: number;
  extrapolated: boolean;
}

/**
 * Time the torso reaches normalized x-position `target`, travelling in `direction`
 * (+1 rightwards, -1 leftwards). Interpolated between bracketing frames when the
 * tracked path spans the gate. When the athlete was ALREADY PAST the gate at the
 * first tracked sample (entry, far-end runner untracked) — or hadn't yet REACHED
 * it at the last sample (exit) — the crossing is EXTRAPOLATED to the gate at the
 * torso's boundary velocity (constant-velocity assumption, valid over the small
 * gap in a max-velocity fly zone). This recovers the true zone-entry instant that
 * clamping to the first tracked frame would otherwise lose. Null when the target
 * can't be reached even by extrapolation (no motion toward it). `maxExtrapS` caps
 * how far outside the tracked span we'll estimate.
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
      return { time: prev.t + frac * (cur.t - prev.t), extrapolated: false };
    }
  }
  if (!series.length) return null;
  const first = series[0];
  const last = series[series.length - 1];

  // Already past the gate at the first sample → back-extrapolate to the gate.
  const pastAtStart = direction >= 0 ? first.x >= target : first.x <= target;
  if (pastAtStart) {
    const v = boundarySlope(series, true);
    if (v != null && direction * v > 0) {
      const dt = (first.x - target) / v; // > 0: the gate was crossed dt seconds earlier
      if (dt <= maxExtrapS) return { time: first.t - dt, extrapolated: true };
    }
    return { time: first.t, extrapolated: false };
  }

  // Never reached the gate by the last sample → forward-extrapolate to the gate.
  const reachedAtEnd = direction >= 0 ? last.x >= target : last.x <= target;
  if (!reachedAtEnd) {
    const v = boundarySlope(series, false);
    if (v != null && direction * v > 0) {
      const dt = (target - last.x) / v; // > 0: the gate is crossed dt seconds later
      if (dt <= maxExtrapS) return { time: last.t + dt, extrapolated: true };
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
  frames: OverlayFrame[],
  points: ManualCalibrationPoints | null | undefined,
  frameWidth: number | null | undefined,
  frameHeight: number | null | undefined,
): SprintMeasurements {
  const warnings: string[] = [];

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
  const worldSeries = torsoSeries(frames).map((s) => ({ t: s.t, x: s.x + off(s.t).x }));
  const minZoneX = Math.min(gateAX, gateBX);
  const maxZoneX = Math.max(gateAX, gateBX);
  const netTravel = worldSeries.length >= 2 ? worldSeries[worldSeries.length - 1].x - worldSeries[0].x : 1;
  const zone: SprintZone | null = points
    ? {
        minX: minZoneX,
        maxX: maxZoneX,
        entryX: netTravel >= 0 ? minZoneX : maxZoneX,
        exitX: netTravel >= 0 ? maxZoneX : minZoneX,
        distanceM: points.distanceM,
      }
    : null;

  // Times the TORSO crosses the entry / exit gates (world x) — the zone timer.
  // Extrapolated to the gate when the far-end runner wasn't yet tracked at entry
  // (or had left the tracked span at exit), so the timer reflects the true crossing
  // instant rather than the first/last frame the athlete happened to be tracked.
  let tEntry: number | null = null;
  let tExit: number | null = null;
  let entryExtrapolated = false;
  let exitExtrapolated = false;
  if (zone && worldSeries.length >= 2) {
    const dir = netTravel >= 0 ? 1 : -1;
    const entryCross = crossingTime(worldSeries, zone.entryX, dir);
    const exitCross = crossingTime(worldSeries, zone.exitX, dir);
    if (entryCross) {
      tEntry = entryCross.time;
      entryExtrapolated = entryCross.extrapolated;
    }
    if (exitCross) {
      tExit = exitCross.time;
      exitExtrapolated = exitCross.extrapolated;
    }
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
  const validMarks = marks.filter(inZone);
  const validContacts = validMarks.length;
  const validLeftContacts = validMarks.filter((m) => m.side === "left").length;
  const validRightContacts = validMarks.filter((m) => m.side === "right").length;

  // Entry step (Day 68 refinement): the last contact just BEFORE the start gate is
  // marked as "Step 1", but it ONLY ANCHORS the sequence — it is NOT counted in the
  // zone averages (frequency, contact/flight). Its single contribution is the stride
  // LENGTH from it to the first in-zone contact, which lands in the zone; that gap is
  // already captured as the first in-zone contact's `distanceMetersFromPrev`, so no
  // separate handling (and no double count) is needed. All zone averages below use
  // the IN-ZONE contacts only, and nothing past the finish gate.
  let entryStepMark: WorldMark | null = null;
  if (zone && validMarks.length) {
    const firstIdx = marks.indexOf(validMarks[0]);
    const candidate = firstIdx > 0 ? marks[firstIdx - 1] : null;
    if (candidate && !inZone(candidate)) {
      const gapS = validMarks[0].time - candidate.time;
      if (gapS > 0 && gapS <= 0.5) entryStepMark = candidate;
    }
  }

  // Elapsed time. Primary: the COM's traversal of the zone (world x). Fallback (no
  // zone or COM never spans it): the span between the first and last VALID contact.
  let zoneTimeS: number | null = null;
  if (tEntry != null && tExit != null && tExit > tEntry) zoneTimeS = tExit - tEntry;
  // Fallback elapsed for velocity (distance ÷ time) when the COM path doesn't
  // cleanly cross both gates: the time span of the valid in-zone contacts.
  const contactSpanSource = zone ? validMarks : marks;
  const contactSpan =
    contactSpanSource.length >= 2
      ? contactSpanSource[contactSpanSource.length - 1].time - contactSpanSource[0].time
      : null;
  const zoneElapsedS = zoneTimeS ?? (contactSpan && contactSpan > 0 ? contactSpan : null);
  if (zone && zoneTimeS == null) {
    warnings.push(
      "Athlete's tracked path didn't cleanly cross both calibration gates — zone time falls back to the valid-contact time span.",
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
  const {
    combined: combinedStepFrequencyHz,
    left: leftStepFrequencyHz,
    right: rightStepFrequencyHz,
  } = stepFrequenciesFromContacts(freqMarks);

  // Ground-contact + flight time (Day 68): measured from the overlay foot
  // trajectory at each contact, restricted to the IN-ZONE contacts (through the
  // finish gate — nothing after it) so it matches the zone the coach defined. Per
  // foot + combined. The contact/flight of the entry step is NOT included (it's an
  // anchor only). Times come from the frames' own timestamps, so the active FPS is
  // already baked in.
  const zoneFrameSet = new Set((zone ? validMarks : marks).map((m) => m.frame));
  // Zone filter applied to the full-run contact phases (Stage 2 measuring Stage 1).
  const contactPhases = fullRun.contactPhases.filter((p) => zoneFrameSet.has(p.frame));
  const contactFlight: ContactFlightSummary = summariseContactFlight(contactPhases);

  // Step lengths. Individual gaps come straight from consecutive contact
  // positions (metres); the zone average is the known distance ÷ valid steps. The
  // entry step's stride length is already present as the first in-zone contact's
  // gap-to-previous, so the gap set stays the valid in-zone contacts (no re-add).
  const gapMarks = zone ? validMarks : marks;
  const individualStepLengthsM = gapMarks
    .map((m) => m.distanceMetersFromPrev)
    .filter((v): v is number => v != null && v > 0);
  const leftGaps = gapMarks
    .filter((m) => m.side === "left")
    .map((m) => m.distanceMetersFromPrev)
    .filter((v): v is number => v != null && v > 0);
  const rightGaps = gapMarks
    .filter((m) => m.side === "right")
    .map((m) => m.distanceMetersFromPrev)
    .filter((v): v is number => v != null && v > 0);

  const avgIndividualStepLengthM = mean(individualStepLengthsM);
  const leftStepLengthM = median(leftGaps);
  const rightStepLengthM = median(rightGaps);
  const avgZoneStepLengthM =
    zone && validContacts > 0 && usableScale ? zone.distanceM / validContacts : null;

  // Individual reliability: tight spread → trust individual lengths; otherwise the
  // zone average is the trusted value and individuals are lower confidence.
  const cv = coefficientOfVariation(individualStepLengthsM);
  const stepLengthConfidence: MeasurementConfidence = !usableScale
    ? "low"
    : cv == null
      ? "medium"
      : cv <= 0.15
        ? "high"
        : cv <= 0.3
          ? "medium"
          : "low";

  // Velocity, three independent ways + a max and the zone value.
  const vDistanceOverTime =
    zone && zoneElapsedS && zoneElapsedS > 0 ? zone.distanceM / zoneElapsedS : null;
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

  const maxIndividual = individualStepLengthsM.length ? Math.max(...individualStepLengthsM) : null;
  const maxVelocityMps =
    maxIndividual != null && combinedStepFrequencyHz != null
      ? maxIndividual * combinedStepFrequencyHz
      : null;
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
  const excludedContacts = marks
    .filter((m) => !inZone(m))
    .map((m) => ({
      time: m.time,
      side: m.side,
      reason: "outside the calibration gates (world x beyond the zone)",
    }));
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
    groundContactLeftMs: contactFlight.groundContactLeftMs,
    groundContactRightMs: contactFlight.groundContactRightMs,
    flightLeftMs: contactFlight.flightLeftMs,
    flightRightMs: contactFlight.flightRightMs,
  };
  if (frameMs != null && contactFlight.groundContactCombinedMs != null) {
    diagNotes.push(
      `Timing precision floor: at ${activeFps?.toFixed(0)} fps one frame = ${frameMs.toFixed(1)} ms. Ground contact (~${contactFlight.groundContactCombinedMs.toFixed(0)} ms ≈ ${(contactFlight.groundContactCombinedMs / frameMs).toFixed(1)} frames) carries a ±1-frame (~${frameMs.toFixed(0)} ms) floor; the L/R contact/flight spread near that size is quantization, not biomechanics. Capture at 120–240 fps to tighten.`,
    );
  }
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
  };

  return {
    calibrated: !!usableScale,
    metersPerPixel: usableScale ? usableScale.metersPerPixel : null,
    totalContacts,
    leftContacts,
    rightContacts,
    validContacts,
    validLeftContacts,
    validRightContacts,
    zone,
    zoneTimeS: zoneElapsedS,
    combinedStepFrequencyHz,
    leftStepFrequencyHz,
    rightStepFrequencyHz,
    groundContactLeftMs: contactFlight.groundContactLeftMs,
    groundContactRightMs: contactFlight.groundContactRightMs,
    groundContactCombinedMs: contactFlight.groundContactCombinedMs,
    flightLeftMs: contactFlight.flightLeftMs,
    flightRightMs: contactFlight.flightRightMs,
    flightCombinedMs: contactFlight.flightCombinedMs,
    avgZoneStepLengthM,
    avgIndividualStepLengthM: usableScale ? avgIndividualStepLengthM : null,
    leftStepLengthM: usableScale ? leftStepLengthM : null,
    rightStepLengthM: usableScale ? rightStepLengthM : null,
    individualStepLengthsM,
    stepLengthConfidence,
    velocities,
    maxVelocityMps,
    zoneVelocityMps,
    velocitySpreadPct,
    velocityNote,
    cameraCompensation,
    diagnostics,
    warnings,
  };
}
