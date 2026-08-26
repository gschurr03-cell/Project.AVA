import type { AccelerationFrame, AccelerationPoint } from "./types";

export const FIRST_DETECTED_MOVEMENT = "FIRST_DETECTED_MOVEMENT" as const;
export const NEEDS_REVIEW = "NEEDS_REVIEW" as const;
export type MovementSignal = "torso" | "shoulder" | "wrist" | "pose_anchor";

export interface MovementCandidateDebug {
  frame: number | null;
  timestamp: number | null;
  passed: boolean;
  reason: string;
}

export interface AccelerationStartEvent {
  type: typeof FIRST_DETECTED_MOVEMENT | typeof NEEDS_REVIEW;
  signal: MovementSignal | null;
  /** @deprecated use {@link zoneStartFrame} — kept as an alias for compatibility. */
  frame: number | null;
  /** The Zone Start Event frame (Part 3): t=0.000s for every metric in this
   *  analysis. Identical to `frame`; this is the canonical name per spec.
   *  Optional only for backward compatibility with analyses persisted before
   *  this field existed — new code always sets it alongside `frame`. */
  zoneStartFrame?: number | null;
  timestamp: number | null;
  confidence: number;
  reason: string;
  debug: { candidates: Record<MovementSignal, MovementCandidateDebug> };
  /** Whether this event is AVA's automatic suggestion or a coach-confirmed manual frame.
   *  Optional for backward compatibility with analyses persisted before this field
   *  existed — absent means "automatic" (the only kind that could exist then). */
  provenance?: "automatic" | "manual";
  /** Present only when `provenance === "manual"`. */
  startEventType?: import("./calibration").AccelerationStartEventType;
  /** True when the athlete was already moving at the moment they entered the
   *  calibrated zone (e.g. a mid-race clip, or a 10-20m zone) — Time Zero is
   *  then the zone-entry instant itself, since no rest-to-motion onset exists
   *  to detect. Absent/false for a classic standing-start onset. */
  alreadyMovingAtZoneEntry?: boolean;
}

const SIGNALS: MovementSignal[] = ["torso", "shoulder", "wrist", "pose_anchor"];
const visible = (point?: AccelerationPoint): point is AccelerationPoint =>
  !!point && (point.visibility ?? 1) >= 0.35;
const meanPoint = (points: AccelerationPoint[]) =>
  points.length
    ? {
        x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
      }
    : null;
const failed = (reason: string): MovementCandidateDebug => ({
  frame: null,
  timestamp: null,
  passed: false,
  reason,
});

type SignalSample = {
  frame: AccelerationFrame;
  point: { x: number; y: number };
  scale: number;
  confidence: number;
};

function frameScale(frame: AccelerationFrame): number {
  const values = Object.values(frame.landmarks).filter(visible);
  if (values.length < 2) return 0.35;
  return Math.max(
    0.1,
    Math.max(...values.map((point) => point.y)) - Math.min(...values.map((point) => point.y)),
  );
}

function signalPoint(frame: AccelerationFrame, signal: MovementSignal) {
  const lm = frame.landmarks;
  const hips = [lm.leftHip, lm.rightHip].filter(visible);
  const shoulders = [lm.leftShoulder, lm.rightShoulder].filter(visible);
  const wrists = [lm.leftWrist, lm.rightWrist].filter(visible);
  if (signal === "torso") return hips.length === 2 ? meanPoint(hips) : frame.centerOfMass;
  if (signal === "shoulder") return shoulders.length === 2 ? meanPoint(shoulders) : null;
  if (signal === "wrist") {
    const wrist = meanPoint(wrists);
    if (!wrist) return null;
    const anchor = meanPoint([...hips, ...shoulders]);
    return anchor ? { x: wrist.x - anchor.x, y: wrist.y - anchor.y } : wrist;
  }
  return meanPoint(Object.values(lm).filter(visible));
}

function track(frames: AccelerationFrame[], signal: MovementSignal): SignalSample[] {
  return frames.flatMap((frame) => {
    const point = signalPoint(frame, signal);
    if (!point) return [];
    const used = Object.values(frame.landmarks).filter(visible);
    const confidence = used.length
      ? used.reduce((sum, item) => sum + (item.visibility ?? 1), 0) / used.length
      : 0.45;
    return [{ frame, point, scale: frameScale(frame), confidence }];
  });
}

function assess(frames: AccelerationFrame[], signal: MovementSignal) {
  const samples = track(frames, signal);
  if (samples.length < 5) {
    return {
      event: null,
      debug: failed(`Only ${samples.length} usable ${signal} frames were found.`),
    };
  }
  const baselineCount = Math.min(5, Math.max(3, Math.floor(samples.length * 0.06)));
  const baseline = meanPoint(samples.slice(0, baselineCount).map((sample) => sample.point))!;
  let earliest: SignalSample | null = null;
  for (let i = baselineCount; i + 1 < samples.length; i++) {
    const window = samples.slice(i, i + 3);
    const moved = window.map((sample) => {
      const displacement = Math.hypot(sample.point.x - baseline.x, sample.point.y - baseline.y);
      const factor = signal === "wrist" ? 0.014 : signal === "pose_anchor" ? 0.012 : 0.016;
      return displacement >= Math.max(0.0045, sample.scale * factor);
    });
    if (moved[0]) earliest ??= window[0];
    if (!moved[0] || !moved[1] || (moved.length === 3 && !moved[2])) continue;
    const sample = window[0];
    const signalBase = signal === "torso" ? 0.62 : signal === "shoulder" ? 0.57 : 0.5;
    const confidence = Math.min(0.92, signalBase + sample.confidence * 0.28);
    const reason = `${signal} displacement exceeded the normalized set-position threshold for consecutive frames.`;
    return {
      event: {
        type: FIRST_DETECTED_MOVEMENT as typeof FIRST_DETECTED_MOVEMENT,
        signal,
        frame: sample.frame.frame,
        timestamp: sample.frame.time,
        confidence,
        reason,
      },
      debug: { frame: sample.frame.frame, timestamp: sample.frame.time, passed: true, reason },
    };
  }
  const reason = `No sustained ${signal} displacement exceeded its jitter threshold.`;
  return {
    event: null,
    debug: earliest
      ? { frame: earliest.frame.frame, timestamp: earliest.frame.time, passed: false, reason }
      : failed(reason),
  };
}

function emptyCandidates(): Record<MovementSignal, MovementCandidateDebug> {
  return Object.fromEntries(
    SIGNALS.map((signal) => [signal, failed("Not evaluated.")]),
  ) as Record<MovementSignal, MovementCandidateDebug>;
}

/**
 * @deprecated for the zone-based Acceleration Analysis engine. This scans the
 * WHOLE clip for the first movement, which assumes the clip opens on a
 * stationary athlete before the sprint starts. Kept only for the legacy
 * single-finish-gate engine (`computeAccelerationMetrics`). New calibrated
 * analyses use {@link detectZoneStartEvent} — Time Zero is scoped to the
 * calibrated zone, not the whole recording (a clip may begin mid-sprint).
 */
export function detectAccelerationStartEvent(frames: AccelerationFrame[]): AccelerationStartEvent {
  const candidates = emptyCandidates();
  for (const signal of SIGNALS) {
    const result = assess(frames, signal);
    candidates[signal] = result.debug;
    if (result.event) {
      return {
        ...result.event,
        zoneStartFrame: result.event.frame,
        debug: { candidates },
        provenance: "automatic",
      };
    }
  }
  return {
    type: NEEDS_REVIEW,
    signal: null,
    frame: null,
    zoneStartFrame: null,
    timestamp: null,
    confidence: 0,
    reason: "No reliable pose signal showed sustained movement from a usable baseline.",
    debug: { candidates },
    provenance: "automatic",
  };
}

/** Representative body position for zone-entry detection — torso midpoint,
 *  falling back to center of mass, matching the rest of the acceleration
 *  engine's convention (never the movement SIGNAL, which is chosen later). */
function torsoPointForZone(frame: AccelerationFrame): { x: number; y: number } | null {
  const hips = [frame.landmarks.leftHip, frame.landmarks.rightHip].filter(visible);
  if (hips.length === 2) return meanPoint(hips);
  return frame.centerOfMass;
}

/**
 * Finds the first frame at or past the zone's entry marker, in the direction
 * of travel. `marginNormalized` tolerates a small amount of jitter/occlusion
 * right at the boundary rather than requiring an exact crossing.
 */
function findZoneEntryIndex(
  frames: AccelerationFrame[],
  entryX: number,
  direction: 1 | -1,
  marginNormalized = 0.01,
): number {
  for (let i = 0; i < frames.length; i++) {
    const point = torsoPointForZone(frames[i]);
    if (!point) continue;
    if (direction * (point.x - entryX) >= -marginNormalized) return i;
  }
  return -1;
}

/**
 * Time Zero = the athlete's first observable movement INSIDE the calibrated
 * zone — never the start of the recording, never movement detected anywhere
 * else in the clip. This is what lets a clip begin after the sprint is
 * already underway (a 10-20m zone, or any mid-race capture): frames before
 * the zone's entry marker are never even considered.
 *
 * Two cases:
 *  1. The athlete is at rest when they enter the zone (a 0-10m zone starting
 *     in the blocks): Time Zero is the onset of movement, found by the same
 *     baseline/displacement algorithm `detectAccelerationStartEvent` uses,
 *     just restricted to frames from zone entry onward.
 *  2. The athlete is ALREADY moving at zone entry (a 10-20m zone, or any clip
 *     that begins mid-sprint): there is no rest baseline to detect an onset
 *     from, so fabricating one would be dishonest. Time Zero is the zone-entry
 *     instant itself, explicitly flagged via `alreadyMovingAtZoneEntry`.
 */
export function detectZoneStartEvent(
  frames: AccelerationFrame[],
  entryPoint: { x: number; y: number },
  direction: 1 | -1,
): AccelerationStartEvent {
  const entryIndex = findZoneEntryIndex(frames, entryPoint.x, direction);
  if (entryIndex < 0) {
    return {
      type: NEEDS_REVIEW,
      signal: null,
      frame: null,
      zoneStartFrame: null,
      timestamp: null,
      confidence: 0,
      reason: "The athlete was never observed inside the calibrated zone.",
      debug: { candidates: emptyCandidates() },
      provenance: "automatic",
    };
  }

  const zoneFrames = frames.slice(entryIndex);
  if (zoneFrames.length < 5) {
    return {
      type: NEEDS_REVIEW,
      signal: null,
      frame: zoneFrames[0]?.frame ?? null,
      zoneStartFrame: zoneFrames[0]?.frame ?? null,
      timestamp: zoneFrames[0]?.time ?? null,
      confidence: 0,
      reason: "Too few tracked frames remain inside the calibrated zone to detect movement.",
      debug: { candidates: emptyCandidates() },
      provenance: "automatic",
    };
  }

  // Already-in-motion check: if the torso has already moved a non-trivial
  // amount across the first few in-zone frames, there is no rest position to
  // detect an "onset" from — the athlete entered the zone already sprinting.
  const earlyWindow = zoneFrames.slice(0, Math.min(6, zoneFrames.length));
  const earlyPoints = earlyWindow
    .map(torsoPointForZone)
    .filter((p): p is { x: number; y: number } => p != null);
  const alreadyMoving =
    earlyPoints.length >= 3 &&
    Math.hypot(
      earlyPoints[earlyPoints.length - 1].x - earlyPoints[0].x,
      earlyPoints[earlyPoints.length - 1].y - earlyPoints[0].y,
    ) >= 0.02;

  if (alreadyMoving) {
    const entryFrame = zoneFrames[0];
    return {
      type: FIRST_DETECTED_MOVEMENT,
      signal: "torso",
      frame: entryFrame.frame,
      zoneStartFrame: entryFrame.frame,
      timestamp: entryFrame.time,
      confidence: 0.7,
      reason: "The athlete was already in motion at zone entry; Time Zero is the zone-entry instant.",
      debug: { candidates: emptyCandidates() },
      provenance: "automatic",
      alreadyMovingAtZoneEntry: true,
    };
  }

  const candidates = emptyCandidates();
  for (const signal of SIGNALS) {
    const result = assess(zoneFrames, signal);
    candidates[signal] = result.debug;
    if (result.event) {
      return {
        ...result.event,
        zoneStartFrame: result.event.frame,
        debug: { candidates },
        provenance: "automatic",
      };
    }
  }
  return {
    type: NEEDS_REVIEW,
    signal: null,
    frame: null,
    zoneStartFrame: null,
    timestamp: null,
    confidence: 0,
    reason: "No reliable pose signal showed a sustained movement onset inside the calibrated zone.",
    debug: { candidates },
    provenance: "automatic",
  };
}

/**
 * A coach-confirmed manual frame is always authoritative over the automatic
 * suggestion (Part 3). `frames` supplies the timestamp for the chosen frame;
 * `override.zoneStartFrame` is a source-video frame index, matched by
 * {@link AccelerationFrame.frame}.
 */
export function resolveAccelerationStartEvent(
  automatic: AccelerationStartEvent,
  override: import("./calibration").AccelerationStartOverride | null | undefined,
  frames: AccelerationFrame[],
): AccelerationStartEvent {
  if (!override) return automatic;
  const matched = frames.find((frame) => frame.frame === override.zoneStartFrame);
  return {
    type: FIRST_DETECTED_MOVEMENT,
    signal: null,
    frame: override.zoneStartFrame,
    zoneStartFrame: override.zoneStartFrame,
    timestamp: matched?.time ?? null,
    confidence: override.confidence,
    reason: override.startEventType
      ? `Manually confirmed Zone Start Event (${override.startEventType.replace(/_/g, " ")}).`
      : "Manually confirmed Zone Start Event.",
    debug: automatic.debug,
    provenance: "manual",
    startEventType: override.startEventType,
  };
}
