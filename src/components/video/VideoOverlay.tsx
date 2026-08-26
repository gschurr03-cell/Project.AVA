"use client";

import { useEffect, useMemo, useRef } from "react";
import type { OverlayFrame, OverlayPoint } from "@/lib/video/overlay";
import {
  detectStepMarks,
  applyRealWorldStepDistances,
  stripUnstableLandmarks,
  type StepDistanceScale,
  type StepMark,
} from "@/lib/video/steps";
import {
  MIN_SAFE_ANCHOR_TRANSFORM_CONFIDENCE,
  propagateAnchorFromSetupToFrame,
  propagateSourcePoint,
  sourceLineIntersectsViewport,
} from "@/lib/calibration/zoneAnchors";
import {
  projectCanonicalWorldLine,
  sourceLineToCanonicalWorld,
  sourcePointToCanonicalWorld,
  toWorldContactAnchor,
  verifyFrameReferenceRoundTrip,
  WORLD_COORDINATE_SCHEMA_VERSION,
  WORLD_REFERENCE_FRAME_INDEX,
} from "@/lib/video/worldProjection";
import { projectWorldAnchorToFrame } from "@/lib/video/worldAnchor";
import {
  recordingModeUsesCameraProjection,
  type RawCameraEvidence,
  type RecordingMode,
} from "@/lib/video/recordingMode";
import { cameraTrackingStateAt } from "@/lib/calibration/cameraTracking";
import { WORLD_LOCK_BUILD_TAG } from "@/lib/video/buildTag";
import type { CameraPathArtifact } from "@/lib/video/cameraPathSchema";
import { framePointToGlobal, globalPointToFrame, indexCameraFramePaths } from "@/lib/video/cameraPath";
import {
  getDisplayedVideoRect,
  projectLandmark,
  projectSourcePointToDisplay,
  type DisplayRect,
  type Point2D,
} from "@/lib/video/coordinates";
import type { CalibrationGates } from "@/lib/calibration/gates";
import { selectRenderableGateGeometry } from "@/lib/calibration/authority";
import {
  athleteScalePxPerCm,
  trochanterDisplayCorrection,
  type TrochanterMarker,
} from "@/lib/video/overlayAlignment";
import type { FollowBox } from "@/lib/video/follow";
import { analyzeZoneSteps } from "@/lib/video/zoneStepAnalysis";
import type { ZoneStep } from "@/lib/benchmark/measurements";
import {
  stabilizeGateZone,
  pointDistance,
  midpoint,
  lineOrientationDeg,
  type GateZoneDisplayState,
} from "@/lib/video/gateStabilization";
import type { ZoneCoverage } from "@/lib/benchmark/measurements";
import { stationaryGateLine, stationaryThreeZoneRects, type StationaryZoneRect } from "@/lib/video/stationaryGateGeometry";
import {
  drawWorldPolygon,
  renderRegisteredOverlays,
  WORLD_ZONE_THEME,
  worldZonePolygons,
  type OverlayVisibility,
  type VisualizationOverlay,
} from "@/lib/video/worldVisualization";
import {
  nativeOverlayFrameDuration,
  selectOverlayFrame,
} from "@/lib/video/overlayRenderClock";
import {
  createPlaybackSyncRecorder,
  nextPlaybackSyncDebugId,
  type PlaybackSyncIdentity,
} from "@/lib/video/playbackSyncDebug";
import {
  createOverlayPresentationState,
  enqueueOverlayPresentation,
  invalidateOverlayPresentation,
  OVERLAY_PRESENTATION_SUBMISSION_LEAD_MS,
  promoteOverlayPresentation,
} from "@/lib/video/overlayPresentationScheduler";

/** A cone placed while marking a timing-gate bar (carries its clip time). */
export type PendingCone = Point2D & { t: number; sourceFrameIndex: number };

/** Which overlay layers are drawn. Owned by {@link OverlayVideoPlayer}. */
export type OverlayToggles = OverlayVisibility;

/** Two clicked gate points + their known distance, normalized to the frame. */
export type OverlayCalibrationPoints = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  distanceM: number;
  /** Clip time each gate was placed (Day 64), for ground-anchoring under pan. */
  aTimeS?: number | null;
  bTimeS?: number | null;
};

type Props = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  frames: OverlayFrame[];
  toggles: OverlayToggles;
  /** Landmark key currently under the cursor (transient highlight). */
  hoveredJoint: string | null;
  /** Landmark key pinned by a click (persistent highlight). */
  selectedJoint: string | null;
  /** Calibration scale for step distances; null → show relative (uncalibrated). */
  stepScale?: StepDistanceScale | null;
  /** Phase 8.0B — the authoritative individual-step model, computed once
   *  server-side by `computeSprintMeasurements` (the SAME source the "Average
   *  Step Length" / "Peak Step Length" cards use). The overlay's step-length
   *  LABEL VALUE must come from here, keyed by `ZoneStep.contactId`, never
   *  from an independently recomputed distance — see VideoOverlay's own
   *  contact-marker code below. `null`/absent → no scientific step-length
   *  label is shown for any contact (never a recomputed substitute). */
  authoritativeSteps?: ZoneStep[] | null;
  /** Phase R1C — the SAME authoritative, already-computed full-run contact
   *  list (`measurements.fullRunContacts`, i.e. `buildFullRunEvents(frames).contacts`
   *  on landmark-stripped frames) every scientific quantity derives from.
   *  When present, the contact-marker/dot loop below consumes these
   *  identities DIRECTLY instead of independently re-detecting contacts —
   *  the two previously diverged on real benchmark data (a genuinely
   *  different contact SET, not just different numbering; see
   *  docs/phase-r1c-authoritative-contact-render-alignment.md). Each mark's
   *  `time` is re-mapped onto this component's own raw playback timeline
   *  (joined by the shared `frame` index) so reveal-gating against
   *  `currentTime` stays correct even when the scientific path's FPS-
   *  normalized clock differs from raw video playback time; `x`/`y`/
   *  `sourceFrameIndex`/`side` are timeline-independent and reused as-is.
   *  `null`/absent (no authoritative measurement set, e.g. non-"fly"
   *  analyses) falls back to the prior independent-detection behavior. */
  authoritativeContacts?: StepMark[] | null;
  /** Legacy saved manual calibration line (pre-Day-66), drawn fixed on the ground. */
  calibrationPoints?: OverlayCalibrationPoints | null;
  /** Saved timing-gate BARS (Day 66) — drawn cone-to-cone across the lane. */
  calibrationGates?: CalibrationGates | null;
  /** Cones placed so far while marking gates (0–4): [startC1, startC2, finishC1, finishC2]. */
  pendingGates?: PendingCone[];
  trochanterMarker?: TrochanterMarker | null;
  athleteHeightCm?: number | null;
  autoFollow?: boolean;
  followStateRef?: React.RefObject<{
    current: FollowBox;
    target: FollowBox;
    cameraTimestampMs?: number;
    cameraSourceFrameIndex?: number | null;
  } | null>;
  cameraEvidence?: RawCameraEvidence;
  /** Phase 1 global keyframe camera path — preferred over `cameraEvidence`'s
   *  legacy chain-walk for gate/contact world-lock when present (Part 9). */
  cameraPath?: CameraPathArtifact;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  recordingMode?: RecordingMode;
  calibrationCameraType?: "stationary" | "panning";
  /** For [world-lock-runtime] diagnostics only — never used to alter rendering. */
  sessionId?: string;
  analysisId?: string | null;
  sourceVideo?: string;
  sourceFps?: number | null;
  sourceFpsClassification?: string | null;
  /** Day 100 (Part 5) — the calibrated-zone coverage window. Debug-view only
   *  (drawn as a coverage bar + included in the debug HUD text); never
   *  alters any pose/gate/contact rendering. */
  zoneCoverage?: ZoneCoverage | null;
};

/**
 * Phase 9.2B ("skeleton suit" temporal jitter, evidence-backed by Phase
 * 9.2A Sections 17-19): a small, bounded, DISPLAY-ONLY smoothing pass for
 * the four PROXIMAL joints only (shoulders/hips — the joints Phase 9.2A
 * measured a physically-implausible, FPS-amplified p95 jitter velocity on,
 * 45-59 athlete-heights/second on Vanni 240 vs. Gav's 6-7; median values
 * were already plausible everywhere, so only high-frequency noise is
 * damped, not real motion). Distal joints (wrists/ankles/heels/toes) and
 * the nose are deliberately left unsmoothed, per that report's own
 * proximal-vs-distal finding and this phase's explicit "no material distal
 * lag" requirement (fast limb motion near touchdown/toe-off must not be
 * softened into a contact-timing illusion).
 *
 * This function has ONE input beyond its own previous state: the CURRENT
 * frame's own raw, already-resolved (post-eligibility-gate) source-
 * normalized joint positions and the PRESENTED SOURCE TIME (never a frame
 * count or wall-clock value) — nothing here reads `video.currentTime`
 * directly, Auto Follow, Stabilized View, or any transform. It never
 * creates a joint that is not already present in `rawJoints` (no
 * fabrication through a genuine pose gap), and it never persists across a
 * seek/scrub/large real jump (see the two independent reset conditions
 * below) or a fresh mount (`previous === null`). Pure and stateless in the
 * sense that identical (previous, rawJoints, timeS) inputs always produce
 * an identical output — the caller owns storing the returned state.
 */
export const SKELETON_SMOOTHED_JOINT_NAMES = ["leftShoulder", "rightShoulder", "leftHip", "rightHip"] as const;
export type SkeletonSmoothedJointName = (typeof SKELETON_SMOOTHED_JOINT_NAMES)[number];
/** Source-time constant: at 240fps (dt~4.2ms) this averages ~6-7 fine
 * frames (~27ms) of pure noise; at 60fps (dt~16.7ms) it responds within
 * ~1 tick — the SAME formula naturally adapts its effective strength to
 * source FPS without any FPS-specific branch (Part AC: no FPS-specific
 * hacks). 25ms is far below a sprint stride cycle (~300-400ms), so real
 * proximal motion is not perceptibly delayed. */
export const SKELETON_SMOOTHING_TIME_CONSTANT_S = 0.025;
/** A per-joint raw-to-raw jump (normalized source units, ~8% of frame
 * width/height) beyond this is treated as genuine large motion or a
 * seek/scrub target, never smoothed through (Part Q). */
export const SKELETON_SMOOTHING_MAX_JUMP_NORMALIZED = 0.08;
/** A source-time gap this large between two ticks can only be a
 * seek/scrub/pause-resume discontinuity, never real consecutive playback
 * (Part R) -- hard reset, no animated catch-up. */
export const SKELETON_SMOOTHING_MAX_DT_S = 0.5;

export interface SkeletonSmoothingState {
  timeS: number;
  joints: Partial<Record<SkeletonSmoothedJointName, { x: number; y: number }>>;
}

export function stepSkeletonSmoothing(
  previous: SkeletonSmoothingState | null,
  rawJoints: Partial<Record<SkeletonSmoothedJointName, { x: number; y: number }>>,
  timeS: number,
): SkeletonSmoothingState {
  const dt = previous ? timeS - previous.timeS : Infinity;
  const hardReset = !previous || !(dt > 0) || dt > SKELETON_SMOOTHING_MAX_DT_S;
  const alpha = hardReset ? 1 : 1 - Math.exp(-dt / SKELETON_SMOOTHING_TIME_CONSTANT_S);
  const joints: SkeletonSmoothingState["joints"] = {};
  for (const name of SKELETON_SMOOTHED_JOINT_NAMES) {
    const raw = rawJoints[name];
    if (!raw) continue; // no evidence this frame -- never fabricate/hold a joint
    const prevJoint = hardReset ? undefined : previous!.joints[name];
    if (!prevJoint) {
      joints[name] = { x: raw.x, y: raw.y };
      continue;
    }
    const jump = Math.hypot(raw.x - prevJoint.x, raw.y - prevJoint.y);
    if (jump > SKELETON_SMOOTHING_MAX_JUMP_NORMALIZED) {
      joints[name] = { x: raw.x, y: raw.y }; // genuine large motion or a seek target -- follow it exactly
      continue;
    }
    joints[name] = {
      x: prevJoint.x + (raw.x - prevJoint.x) * alpha,
      y: prevJoint.y + (raw.y - prevJoint.y) * alpha,
    };
  }
  return { timeS, joints };
}

const bones = [
  ["leftShoulder", "rightShoulder"],
  ["leftShoulder", "leftElbow"],
  ["leftElbow", "leftWrist"],
  ["rightShoulder", "rightElbow"],
  ["rightElbow", "rightWrist"],
  ["leftShoulder", "leftHip"],
  ["rightShoulder", "rightHip"],
  ["leftHip", "rightHip"],
  ["leftHip", "leftKnee"],
  ["leftKnee", "leftAnkle"],
  ["leftAnkle", "leftFootIndex"],
  ["rightHip", "rightKnee"],
  ["rightKnee", "rightAnkle"],
  ["rightAnkle", "rightFootIndex"],
];

// Overlay palette (premium sports identity): the video is the hero — overlays stay
// minimal and readable, using blue / white / muted-gray, with green reserved for
// success indicators. Start & finish gates are blue; left contact blue, right contact
// white; ground-contact success is green.
const COLORS = {
  bone: "#f5f7fb", // AVA white — neutral, high-contrast skeleton
  // Phase 9.2B: a dark, low-alpha stroke drawn once, slightly wider, behind
  // every bone line — keeps a light bone visible against light footage
  // (track surface, bright skin) without changing its semantic color.
  boneHalo: "rgba(6, 10, 18, 0.55)",
  jointFill: "#f8fafc",
  jointStroke: "#0f172a",
  jointFillSoft: "rgba(248, 250, 252, 0.7)",
  jointStrokeSoft: "rgba(15, 23, 42, 0.45)",
  angle: "#b3bccb", // muted gray — analytical angle labels (no yellow)
  com: "#3b8eff", // blue — centre-of-mass marker
  trail: "rgba(47, 128, 237, 0.55)", // soft blue COM trail
  velocity: "#f5f7fb", // white — velocity vector
  contact: "#89d46a", // green — success indicator (ground contact)
  flight: "#b3bccb", // muted gray
  hover: "#3b8eff", // blue — hover highlight
  selected: "#2f80ed", // AVA blue — selection highlight
  arm: "#b3bccb", // muted gray — upper-arm/forearm segments
  armAngle: "#7e8797", // muted — arm angle labels
  stepLeft: "#2f80ed", // blue — left-foot ground contacts
  stepRight: "#f5f7fb", // white — right-foot ground contacts
  stepPath: "rgba(179, 188, 203, 0.6)", // muted gray — connecting step path (debug only)
  stepDist: "#b3bccb", // muted gray — uncalibrated distance labels
  calibration: "#2f80ed", // blue — timing-gate bars (start & finish)
  calibrationPending: "#3b8eff", // light blue — points being placed
  labelBg: "rgba(8, 16, 25, 0.78)",
} as const;

/** Default overlay label font, and a smaller one for the decluttered step labels. */
const DEFAULT_LABEL_FONT = "600 7px system-ui, sans-serif";
const STEP_LABEL_FONT = "600 11px system-ui, sans-serif";

/**
 * Phase 9.2B ("skeleton suit" visual style, evidence-backed by Phase 9.2A —
 * see that report's Sections 20/24/26): CSS-pixel stroke/radius values for
 * the skeleton renderer only. All are read through the SAME
 * `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` the canvas already applies once
 * per draw, so a CSS-pixel value here is already resolution/DPR-aware
 * without any extra per-value DPR math — unchanged from how `bone`'s prior
 * 2.25/3.75 constants were already resolution-aware. Values are presentation
 * constants, not derived from any benchmark/FPS/athlete — Phase 9.2A's own
 * "no Vanni-specific, FPS-specific, or athlete-specific constant" rule.
 */
const SKELETON_BONE_WIDTH = 3.5; // was 2.25
const SKELETON_BONE_WIDTH_EMPHASIZED = 5.25; // was 3.75 (same 1.5x hover/selected ratio)
const SKELETON_HALO_WIDTH_DELTA = 2; // halo stroke is this much wider than the bone itself
const SKELETON_JOINT_RADIUS = 3; // was 1
const SKELETON_JOINT_STROKE_WIDTH = 1.25; // was 0.75

/** Axis-aligned box a pill label occupies, used to keep labels from overlapping. */
type LabelBox = { x: number; y: number; w: number; h: number };

/** The box {@link drawLabel} paints for `text` anchored at (x, y). */
function labelBox(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): LabelBox {
  const padX = 3;
  const padY = 2;
  const h = 9;
  const w = ctx.measureText(text).width;
  return { x: x - padX, y: y - h / 2 - padY, w: w + padX * 2, h: h + padY * 2 };
}

function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Draw a label near (x, y), nudging it vertically until it clears every box in
 * `placed`, then record its box. Keeps live angle labels readable and
 * non-overlapping while staying attached to their joint. Mutates `placed`.
 */
function placeLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  placed: LabelBox[],
) {
  let box = labelBox(ctx, text, x, y);
  if (placed.some((p) => boxesOverlap(box, p))) {
    const step = box.h + 2;
    const y0 = y;
    // Try growing offsets, alternating down/up (1,-1,2,-2,…) so a crowded label
    // settles as close to its anchor as possible instead of drifting one way.
    for (let i = 1; i <= 8; i++) {
      const offset = Math.ceil(i / 2) * step * (i % 2 === 1 ? 1 : -1);
      const candidate = labelBox(ctx, text, x, y0 + offset);
      if (i === 8 || !placed.some((p) => boxesOverlap(candidate, p))) {
        y = y0 + offset;
        box = candidate;
        break;
      }
    }
  }
  drawLabel(ctx, text, x, y, color);
  placed.push(box);
}

/** Draw a small pill-backed label so text stays readable over any footage. */
function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  const padX = 3;
  const padY = 2;
  const h = 9;
  const w = ctx.measureText(text).width;

  ctx.fillStyle = COLORS.labelBg;
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x - padX, y - h / 2 - padY, w + padX * 2, h + padY * 2, 4);
    ctx.fill();
  } else {
    ctx.fillRect(x - padX, y - h / 2 - padY, w + padX * 2, h + padY * 2);
  }

  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export default function VideoOverlay({
  videoRef,
  frames,
  toggles,
  hoveredJoint,
  selectedJoint,
  stepScale = null,
  authoritativeSteps = null,
  authoritativeContacts = null,
  calibrationPoints = null,
  calibrationGates = null,
  pendingGates = [],
  trochanterMarker = null,
  athleteHeightCm = null,
  autoFollow = false,
  followStateRef,
  cameraEvidence,
  cameraPath,
  sourceWidth,
  sourceHeight,
  recordingMode,
  calibrationCameraType,
  sessionId,
  analysisId = null,
  sourceVideo = "unknown",
  sourceFps = null,
  sourceFpsClassification = null,
  zoneCoverage = null,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const reactRenderVersionRef = useRef(0);
  reactRenderVersionRef.current += 1;
  // Last applied canvas geometry ("x:y:w:h:dpr"), so we only touch the bitmap /
  // style when the displayed picture actually changes size or position.
  const geometryRef = useRef<string>("");

  // Read toggles/selection from refs so flipping a layer or moving the cursor
  // doesn't tear down and restart the animation loop — the next frame simply
  // picks up the new value.
  const togglesRef = useRef(toggles);
  togglesRef.current = toggles;
  const hoveredRef = useRef(hoveredJoint);
  hoveredRef.current = hoveredJoint;
  const selectedRef = useRef(selectedJoint);
  selectedRef.current = selectedJoint;
  // Calibration line + in-progress clicks are read from refs too, so placing a
  // point (which updates on every click) never restarts the draw loop.
  const calibrationRef = useRef(calibrationPoints);
  calibrationRef.current = calibrationPoints;
  const calibrationGatesRef = useRef(calibrationGates);
  calibrationGatesRef.current = calibrationGates;
  const pendingRef = useRef(pendingGates);
  pendingRef.current = pendingGates;
  const trochanterRef = useRef(trochanterMarker);
  trochanterRef.current = trochanterMarker;
  // Phase 9.2B: display-only proximal-joint smoothing state (see
  // `stepSkeletonSmoothing` above) -- lives only inside this draw loop,
  // never read by any scientific consumer, reset automatically on any
  // seek/scrub/large jump or fresh mount.
  const skeletonSmoothingRef = useRef<SkeletonSmoothingState | null>(null);
  // [world-contact-render] sampling: dedupe by (source frame, contact id) so a
  // paused video (rAF still ticking at 60fps) or the HUD's second projection
  // pass for the same frame never re-logs — one entry per contact per distinct
  // source frame actually reached, not per animation tick.
  const contactRenderLogFrameRef = useRef<number>(-1);
  const contactRenderLoggedIdsRef = useRef<Set<string>>(new Set());
  // Day 104 (Part 5): the native per-source-frame duration, derived from the
  // REAL median spacing between consecutive frame timestamps — never assumed
  // from a prop, so it stays correct across 60/120/240fps footage, and it is
  // robust to pose-evidence gaps since `frames[]` carries one entry per
  // analysis frame regardless of whether landmarks were recovered for it.
  const nativeFrameDurationS = useMemo(() => nativeOverlayFrameDuration(frames), [frames]);
  // Diagnostics (Part 5): the most recent frame/timestamp offset between the
  // rendered pose frame and the true video playhead, surfaced in the debug
  // HUD below — never claimed as precise beyond what was actually measured.
  const overlaySyncRef = useRef<{ frameOffset: number; timestampOffsetS: number; stale: boolean }>({
    frameOffset: 0,
    timestampOffsetS: 0,
    stale: false,
  });
  // [world-lock-runtime] sampling: one summary per distinct source frame reached.
  const worldLockRuntimeLoggedFrameRef = useRef<number>(-1);
  // Day 99 — shared display-level gate stabilization (Part 3). One function,
  // applied identically to both gates: if a gate's newly-projected display
  // point moved by less than GATE_DISPLAY_DEADBAND_PX since the last drawn
  // frame, keep drawing the PREVIOUS pixel position instead of the new one.
  // This never touches the world anchor, the camera transform, or which
  // coordinates are computed — only which of two visually-indistinguishable
  // pixel positions gets drawn, so sub-pixel transform/rounding noise can
  // never read as a visible bob. Both gates share this exact function and
  // threshold (never independently tuned), so they can never drift apart
  // from each other as a side effect of stabilization itself.
  const gateDisplayRef = useRef<GateZoneDisplayState | null>(null);
  // Day 99 (Part 3) — the gate-stability diagnostics acceptance criteria asks
  // for: displacement by frame, spacing by frame, orientation by frame, raw
  // vs. display transform state, rejected-transform frames. Populated every
  // draw() call; read by the Part 9 debug panel below.
  const gateDiagnosticsRef = useRef<{
    sourceFrame: number;
    startMidDisplacementPx: number;
    finishMidDisplacementPx: number;
    gateSpacingPx: number;
    startOrientationDeg: number;
    finishOrientationDeg: number;
    rawTransform: "camera_projected" | "identity_static";
    displayTransform: "shared_deadband_stabilized";
    rejectedTransformFrame: number | null;
    // Day 104 (Part 7): raw (pre-deadband) vs rendered (post-deadband,
    // what's actually drawn) gate midpoints — the developer-facing evidence
    // that the full-height stationary redesign never altered the underlying
    // crossing geometry, only how it's painted.
    rawStartPx: Point2D | null;
    rawFinishPx: Point2D | null;
    renderedStartPx: Point2D | null;
    renderedFinishPx: Point2D | null;
    renderedStartP1: Point2D | null;
    renderedStartP2: Point2D | null;
    renderedFinishP1: Point2D | null;
    renderedFinishP2: Point2D | null;
    held: boolean;
    cameraPathState: string | null;
    cameraTransform: unknown;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !frames.length) return;

    const effectId = nextPlaybackSyncDebugId();
    const identity: PlaybackSyncIdentity = {
      sessionId: sessionId ?? null,
      analysisId,
      sourceVideo,
      sourceFps,
      sourceFpsClassification,
    };
    const debug = createPlaybackSyncRecorder(identity, effectId);
    const rafLoopId = debug ? nextPlaybackSyncDebugId() : 0;
    const rvfcGenerationId = debug ? nextPlaybackSyncDebugId() : 0;
    let lastBrowserEvent = "effect_mount";
    let invalidatePendingPresentation: (reason: string) => void = () => {};
    const recordVideoEvent = (event: Event) => {
      lastBrowserEvent = event.type;
      if (event.type === "seeking" || event.type === "pause" || event.type === "ratechange" || event.type === "emptied") {
        invalidatePendingPresentation(event.type);
      }
      debug?.record({
        kind: "video_event",
        eventType: event.type,
        videoPaused: video.paused,
        videoSeeking: video.seeking,
        playbackRate: video.playbackRate,
        videoCurrentTimeS: video.currentTime,
        reactRenderVersion: reactRenderVersionRef.current,
        rafLoopId,
        rvfcGenerationId,
      });
    };
    const tracedVideoEvents = ["loadedmetadata", "seeking", "seeked", "timeupdate", "play", "playing", "pause", "ratechange", "ended", "emptied"];
    tracedVideoEvents.forEach((eventName) => video.addEventListener(eventName, recordVideoEvent));
    debug?.record({
      kind: "effect",
      phase: "mount",
      videoSource: video.currentSrc || video.getAttribute("src"),
      reactRenderVersion: reactRenderVersionRef.current,
      rafLoopId,
      rvfcGenerationId,
    });
    debug?.record({ kind: "raf_loop", phase: "created", rafLoopId, rvfcGenerationId });

    // Phase 1: an O(1) index into the global keyframe camera path, when the
    // analysis has one — built once per clip, exactly like the legacy
    // per-frame chain it supersedes. `null` when absent (older analyses),
    // which every consumer below falls back on to the unchanged legacy path.
    const cameraPathIndex = cameraPath ? indexCameraFramePaths(cameraPath) : null;

    // Detect step marks once per clip (cheap, O(frames)); the draw loop only
    // reveals the ones reached by the current playback time. When a calibration
    // scale is present, each gap also carries a real-world metre distance.
    //
    // Phase R1C: when the authoritative full-run contact set is available
    // (`authoritativeContacts`, i.e. `measurements.fullRunContacts` — the
    // SAME contacts every scientific quantity derives from), consume it
    // DIRECTLY rather than independently re-detecting contacts. The two
    // previously diverged on real benchmark data: `measurements.ts` strips
    // predicted/invalid/frozen_suspect landmarks (Phase 4.2K exception
    // aside) before detecting contacts, while this file called
    // `detectStepMarks` on fully unstripped frames — a genuinely different
    // contact SET, not merely different numbering (see
    // docs/phase-r1c-authoritative-contact-render-alignment.md).
    //
    // `authoritativeContacts` is computed on the FPS-NORMALIZED clock
    // (`overlayFrames`, Day 75), while this component's `frames` prop and
    // `currentTime` (from the actual `<video>` element) are on the RAW
    // playback timeline — so each mark's `time` is re-mapped onto the raw
    // timeline here, joined by the shared, order-preserved `frame` index
    // (`applyFpsOverride` only ever rewrites `time`, never `frame`/
    // `sourceFrameIndex`/landmark positions). `x`/`y`/`sourceFrameIndex`/
    // `side`/`index`/distance fields are timeline-independent and reused
    // exactly as computed authoritatively.
    //
    // Falls back to the prior independent-detection behavior (now sharing
    // the same `stripUnstableLandmarks` eligibility gate `measurements.ts`
    // uses, so it stays as close to authoritative as a same-clock
    // computation can) only when no authoritative set is available at all
    // (non-"fly" analyses).
    const stepMarks = authoritativeContacts
      ? (() => {
          const rawTimeByFrame = new Map(frames.map((f) => [f.frame, f.time]));
          return applyRealWorldStepDistances(
            authoritativeContacts.map((mark) => ({ ...mark, time: rawTimeByFrame.get(mark.frame) ?? mark.time })),
            stepScale,
          );
        })()
      : applyRealWorldStepDistances(detectStepMarks(stripUnstableLandmarks(frames)), stepScale);
    const worldSteps = stepMarks.map((mark) => ({
      ...mark,
      world: cameraEvidence && sourceWidth && sourceHeight
        ? sourcePointToCanonicalWorld(
            mark,
            mark.sourceFrameIndex,
            cameraEvidence,
            sourceWidth,
            sourceHeight,
          )
        : null,
    }));
    // `[world-contact-create]` fires once per contact the FIRST time debug is
    // observed on (from inside `draw`, which reads the live toggle every
    // frame) — not at computation time above, since the debug checkbox is
    // normally flipped on well after this effect's one-time setup has already
    // run. `contactCreateLoggedIds` is shared across every `draw()` call for
    // this clip, so each contact still logs exactly once, however late.
    const contactCreateLoggedIds = new Set<string>();
    const logContactCreateIfNeeded = () => {
      if (process.env.NODE_ENV === "production" || !cameraEvidence || !sourceWidth || !sourceHeight) return;
      for (const mark of worldSteps) {
        if (!mark.world) continue;
        const anchor = toWorldContactAnchor(
          `contact-${mark.sourceFrameIndex}-${mark.side}-${mark.index}`,
          mark.sourceFrameIndex,
          mark.side,
          mark.world,
          cameraEvidence.cameraMotionModelVersion,
        );
        if (contactCreateLoggedIds.has(anchor.id)) continue;
        contactCreateLoggedIds.add(anchor.id);
        const roundTrip = verifyFrameReferenceRoundTrip(
          mark, mark.sourceFrameIndex, mark.world.referenceFrameIndex, cameraEvidence, sourceWidth, sourceHeight,
        );
        console.debug("[world-contact-create]", {
          contactId: anchor.id,
          contactFrameIndex: anchor.contactFrameIndex,
          referenceFrameIndex: mark.world.referenceFrameIndex,
          cropOrRoiCoordinate: null, // worker already remaps crop→full-frame before this artifact is written
          fullSourceContactCoordinate: { x: mark.x, y: mark.y },
          cameraModelVersion: anchor.cameraModelVersion,
          storedReferencePoint: { x: mark.world.x, y: mark.world.y },
          roundTripErrorNormalized: roundTrip.errorNormalized,
          roundTripSafe: roundTrip.ok,
          confidence: mark.world.projectionConfidence,
        });
      }
    };
    // Display-only step labels use the same immutable world points as the dots.
    // This does not alter worker metrics or timing values.
    const canonicalSteps = worldSteps.map((mark, index) => {
      const previous = worldSteps[index - 1];
      if (!stepScale || !mark.world?.projectable || !previous?.world?.projectable) return mark;
      const dx = (mark.world.x - previous.world.x) * stepScale.frameWidth;
      const dy = (mark.world.y - previous.world.y) * stepScale.frameHeight;
      return { ...mark, distanceMetersFromPrev: Math.hypot(dx, dy) * stepScale.metersPerPixel };
    });
    const zoneMetrics = (() => {
      const gates = calibrationGatesRef.current;
      if (
        !gates?.startBoundary ||
        !gates.finishBoundary ||
        !cameraEvidence ||
        !sourceWidth ||
        !sourceHeight ||
        !canonicalSteps.every((mark) => mark.world)
      ) return null;
      const canonicalMidpoint = (boundary: NonNullable<typeof gates.startBoundary>, identity: "start" | "finish") => {
        const line = sourceLineToCanonicalWorld(
          boundary.sourceFrameLine.c1,
          boundary.sourceFrameLine.c2,
          boundary.setupFrameIndex,
          identity,
          cameraEvidence,
          sourceWidth,
          sourceHeight,
        );
        return { x: (line.c1.x + line.c2.x) / 2, y: (line.c1.y + line.c2.y) / 2 };
      };
      return analyzeZoneSteps({
        start: canonicalMidpoint(gates.startBoundary, "start"),
        finish: canonicalMidpoint(gates.finishBoundary, "finish"),
        distanceM: gates.distanceM,
        contacts: canonicalSteps.map((mark) => ({
          id: `contact-${mark.sourceFrameIndex}-${mark.side}-${mark.index}`,
          side: mark.side,
          timeS: mark.time,
          sourceFrameIndex: mark.sourceFrameIndex,
          x: mark.world!.x,
          y: mark.world!.y,
          confidence: mark.world!.projectionConfidence,
        })),
      });
    })();
    const classifiedById = new Map(zoneMetrics?.contacts.map((contact) => [contact.id, contact]) ?? []);
    // Phase 8.0B: the ONLY source for a step-length LABEL VALUE. `zoneMetrics`
    // above (this file's own homography-projected `analyzeZoneSteps` call) is
    // a real, but SEPARATE, computation from the authoritative "Average/Peak
    // Step Length" path (`measurements.ts`'s legacy two-point-calibration
    // scale) -- it remains used above only for contact-marker CLASSIFICATION
    // (color/shape), never for the metre value.
    //
    // Phase R1 fix: `authoritativeSteps[].contactId` is built by
    // `measurements.ts` from ITS OWN internal `detectStepMarks()` call, run
    // on frames with predicted/invalid/frozen_suspect (uncorroborated)
    // landmarks stripped first. This file's own marker loop below runs
    // `detectStepMarks()` on the UNSTRIPPED frames it's handed (matching
    // `loadOverlayFrames.ts`'s real, zero-pre-stripping behavior) -- a
    // different input, so it can detect a different number of contacts in a
    // different order. Both `index` fields are each internally consistent,
    // but they are NOT the same sequence, so the trailing `-${index}` in a
    // reconstructed `contact-${sourceFrameIndex}-${side}-${index}` string
    // essentially never matches (verified against real Vanni 240 data: 0/8
    // authoritative contacts matched under the old full-contactId lookup).
    // `sourceFrameIndex` + `side` alone already uniquely identifies a
    // physical contact (two contacts cannot land on the same source frame),
    // so the lookup key below is parsed out of the authoritative
    // `contactId`'s own stable, documented format instead of depending on
    // either side's index numbering.
    // Phase R1B: the label reads `physicalStepLengthM` (a real, calibrated
    // physical distance for a legitimate single step, per
    // docs/phase-r1b-presentation-only-physical-step-length-recovery.md),
    // NOT the narrower aggregate-eligible `stepLengthM` -- displaying a step
    // length must not require aggregate-metric eligibility (Part I). Whenever
    // an interval IS aggregate-eligible, `physicalStepLengthM` is defined to
    // equal `stepLengthM` exactly, so no previously-shown value changes.
    const authoritativeStepLengthByFrameSide = new Map(
      (authoritativeSteps ?? [])
        .filter((step) => step.physicalStepLengthM != null)
        .flatMap((step) => {
          const match = /^contact-(\d+)-(left|right)-\d+$/.exec(step.contactId);
          if (!match) return [];
          return [[`${match[1]}-${match[2]}`, step.physicalStepLengthM as number] as const];
        }),
    );

    type PresentedFrameDebug = {
      callbackNowMs: number;
      callbackFiredPerformanceMs: number;
      mediaTimeS: number;
      presentedFrames: number | null;
      expectedDisplayTimeMs: number | null;
      presentationTimeMs: number | null;
      width: number | null;
      height: number | null;
      registrationId: number;
    };
    const draw = (
      presentedMediaTimeS = video.currentTime,
      provenance: "requestVideoFrameCallback" | "requestAnimationFrame_fallback" = "requestAnimationFrame_fallback",
      presentedFrameDebug: PresentedFrameDebug | null = null,
    ) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const paintStartPerformanceMs = debug ? performance.now() : 0;

      // Map to the rectangle the picture actually occupies inside the <video>
      // (letterbox-aware), and back the canvas with device pixels so lines stay
      // crisp. The canvas is positioned to cover exactly that rectangle, so all
      // drawing happens in picture-local CSS pixels.
      const dpr = window.devicePixelRatio || 1;
      const picture = getDisplayedVideoRect(video);
      const geometry = `${picture.x}:${picture.y}:${picture.width}:${picture.height}:${dpr}`;
      if (geometry !== geometryRef.current) {
        geometryRef.current = geometry;
        canvas.style.left = `${picture.x}px`;
        canvas.style.top = `${picture.y}px`;
        canvas.style.width = `${picture.width}px`;
        canvas.style.height = `${picture.height}px`;
        canvas.width = Math.max(1, Math.round(picture.width * dpr));
        canvas.height = Math.max(1, Math.round(picture.height * dpr));
      }

      const rect: DisplayRect = { x: 0, y: 0, width: picture.width, height: picture.height };
      const project = (point: Point2D) =>
        projectLandmark(point, rect, video.videoWidth, video.videoHeight);

      const show = togglesRef.current;
      const hovered = hoveredRef.current;
      const selected = selectedRef.current;
      if (show.camera_motion_debug) logContactCreateIfNeeded();

      // Draw in CSS pixels; the DPR scale keeps the backing store sharp.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, picture.width, picture.height);

      // The media clock is authoritative at every playback rate. A fixed guessed
      // frame lead caused visible drift on non-60fps footage and while rate changed.
      const currentTime = presentedMediaTimeS;
      const poseSelectionStartPerformanceMs = debug ? performance.now() : 0;
      const selection = selectOverlayFrame(frames, currentTime, nativeFrameDurationS);
      const poseSelectionEndPerformanceMs = debug ? performance.now() : 0;
      if (!selection) return;
      let frame = selection.frame;
      const currentSourceFrame = frame.sourceFrameIndex ?? frame.frame;
      // Day 104 (Part 5): the nearest-frame scan above always returns SOME
      // frame, no matter how far away in time it actually is — during a real
      // pose-evidence gap (e.g. Vanni 60fps's mid-run tracking loss), the
      // "nearest" available real-landmark frame can be tens or hundreds of
      // milliseconds from the true playhead, which renders as a skeleton
      // visibly lagging (or leading) the athlete rather than disappearing
      // honestly. Reject it (never render current pose/foot markers) once it
      // is stale by more than half one NATIVE source-frame duration — a
      // bound derived from the real measured frame spacing, not a prop, so
      // it holds at 60/120/240fps alike. Historical trails are unaffected
      // (drawn from `canonicalSteps`/committed contacts, not this frame).
      const offsetS = selection.timestampOffsetS;
      const isStaleOverlayFrame = selection.stale;
      overlaySyncRef.current = {
        frameOffset: selection.frameOffset,
        timestampOffsetS: offsetS,
        stale: isStaleOverlayFrame,
      };
      if (isStaleOverlayFrame) {
        frame = { ...frame, landmarks: {} };
      }
      // Day 99: a "predicted"/"invalid" boxOrigin means this frame's crop was
      // guided by extrapolation, not verified box tracking/detection — the same
      // provenance check `computeSprintMeasurements` already applies before any
      // contact/crossing computation (src/lib/benchmark/measurements.ts). The
      // renderer previously had no equivalent check and would draw a full
      // skeleton on an unverified frame. Predicted boxes may guide the crop but
      // must never produce a rendered skeleton — strip landmarks here, the same
      // way, before any pose layer reads them below.
      //
      // Phase 4.2/4.2B (2026-08-05): "frozen_suspect" joins this same check —
      // this origin is retroactively applied only once box_tracker.py has
      // independently PROVEN a run of frames was localized onto near-static
      // background rather than the real athlete (see box_tracker.py's
      // `_resolve_freeze_run`). Not extending this existing, already-shipped
      // honesty check to the new origin would silently render a skeleton this
      // project has actively disproven as if it were ordinary tracked
      // evidence — this is not new UI behavior, it is the same rule already
      // in force, applied to a schema value that did not previously exist.
      //
      // Phase 9.1B: mirrors `measurements.ts`'s own eligibility policy
      // exactly (`computeSprintMeasurements`'s `frames` map, the same
      // stripped/independentlyCorroborated boolean pair) — a "frozen_suspect"
      // frame Phase 4.2K's independent bidirectional-trajectory check has
      // proven "independent_corroborated" is scientifically trusted enough to
      // feed contacts/steps/metrics; withholding its skeleton here while the
      // measurement pipeline already relies on it was a real, provable
      // render/science divergence (Phase 9.1A). This never applies to
      // "predicted"/"invalid" (no detector-anchored box exists to verify) and
      // never promotes a frame whose independent verification is merely
      // absent/disagreeing — identical to the scientific gate's own contract.
      const isIndependentlyCorroborated =
        frame.boxOrigin === "frozen_suspect" && frame.independentLocalizationState === "independent_corroborated";
      if (
        (frame.boxOrigin === "predicted" || frame.boxOrigin === "invalid" || frame.boxOrigin === "frozen_suspect") &&
        !isIndependentlyCorroborated
      ) {
        frame = { ...frame, landmarks: {} };
      }
      const useCameraProjection = calibrationCameraType
        ? calibrationCameraType === "panning"
        : recordingModeUsesCameraProjection(recordingMode);
      // Phase 6.2: camera MODE controls presentation style, not whether real
      // background motion exists. Stationary recordings still use available
      // world evidence for DISPLAY gate projection so tripod shake is visible to
      // the compensator. Scientific crossing code is outside this renderer.
      const useGateWorldLock = Boolean(
        (cameraPathIndex || cameraEvidence) && sourceWidth && sourceHeight,
      );
      if (contactRenderLogFrameRef.current !== currentSourceFrame) {
        contactRenderLogFrameRef.current = currentSourceFrame;
        contactRenderLoggedIdsRef.current.clear();
      }

      // A detected ground contact is a permanent chalk mark on the physical track: its
      // canonical coordinate never changes. What CAN change is whether the current
      // frame's view still contains that physical location — camera motion moves the
      // VIEW, never the mark, and the mark must be free to leave the frame entirely,
      // exactly like gates. `null` here means "do not draw this frame" — never a
      // clamped, recentered, or screen-fixed substitute.
      const projectWorldStep = (mark: (typeof canonicalSteps)[number]): Point2D | null => {
        // Phase 1: prefer the precomputed global camera path when present — a
        // direct lookup + one applied transform, resolved once by the worker,
        // never the legacy per-frame chain below (Part 9: gates and contacts
        // consume the exact same artifact through cameraPath.ts).
        if (cameraPathIndex && sourceWidth && sourceHeight) {
          const contactId = `contact-${mark.sourceFrameIndex}-${mark.side}-${mark.index}`;
          const g = framePointToGlobal(cameraPathIndex, mark.sourceFrameIndex, mark, sourceWidth, sourceHeight);
          const f = g.available
            ? globalPointToFrame(cameraPathIndex, currentSourceFrame, g.point, sourceWidth, sourceHeight)
            : { available: false as const, point: mark, state: "unavailable" as const };
          if (show.camera_motion_debug && process.env.NODE_ENV !== "production" && !contactRenderLoggedIdsRef.current.has(contactId)) {
            contactRenderLoggedIdsRef.current.add(contactId);
            console.debug("[world-contact-render]", {
              contactId, currentFrame: currentSourceFrame, cameraPathVersion: cameraPath?.version,
              creationFrameGloballyAvailable: g.available, globalPoint: g.available ? g.point : null,
              projectedState: f.available ? "anchored" : f.state, projectionPath: "cameraPath.ts:globalPointToFrame",
            });
          }
          if (!g.available || !f.available) return null;
          return projectSourcePointToDisplay({ point: f.point, sourceWidth, sourceHeight, displayRect: rect, fitMode: "fill" });
        }
        if (!useCameraProjection || !mark.world || !cameraEvidence || !sourceWidth || !sourceHeight) {
          // Stationary mode (or no camera evidence at all): the raw source position IS
          // the world position — there is no pan to compensate for.
          return project(mark);
        }
        const result = projectWorldAnchorToFrame(
          mark.world, currentSourceFrame, cameraEvidence, sourceWidth, sourceHeight, rect, "fill",
        );
        const contactId = `contact-${mark.sourceFrameIndex}-${mark.side}-${mark.index}`;
        if (show.camera_motion_debug && process.env.NODE_ENV !== "production" && !contactRenderLoggedIdsRef.current.has(contactId)) {
          contactRenderLoggedIdsRef.current.add(contactId);
          console.debug("[world-contact-render]", {
            contactId,
            currentFrame: currentSourceFrame,
            storedReferencePoint: { x: mark.world.x, y: mark.world.y, referenceFrameIndex: mark.world.referenceFrameIndex },
            referenceToCurrentTransform: cameraEvidence.transforms.find((item) => item.frame === currentSourceFrame) ?? null,
            projectedCurrentFrameSourcePoint: result.sourcePoint,
            displayPoint: result.displayPoint,
            visible: result.visible,
            offscreen: !result.visible,
            safe: result.safe,
            projectionPath: "projectWorldAnchorToFrame(worldAnchor.ts) -> canonicalWorldToSourceFrame -> referenceToFrame",
          });
        }
        // Never draw offscreen (visible=false) or built on an untrustworthy transform
        // chain (safe=false) — no clamping, no fallback position, no forced onscreen.
        if (!result.visible || !result.safe) return null;
        return result.displayPoint;
      };

      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.font = DEFAULT_LABEL_FONT;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";

      // Skeleton sync (Day 76, revised Day 99): the per-frame pose layers (skeleton,
      // arms, angles, COM, velocity, foot labels) track the MOVING athlete, so they
      // trail visibly at FAST playback (2×+). At normal (1×) speed or slower the
      // nearest-source-frame lookup above is accurate enough to read as synced, and
      // withholding pose entirely at 1× left a coach unable to see ANY skeleton/foot
      // marker during ordinary playback — the pose overlay must be visible whenever
      // valid evidence exists, not only when paused. Ground-anchored layers (step
      // marks, gates) are unaffected and always drawn regardless of this gate.
      const showPose = video.paused || video.playbackRate <= 1.01;

      // A trochanter anchor is a small DISPLAY-ONLY translation. It never enters
      // the stored landmarks, gate projection, step marks, or metric pipeline.
      const correction = trochanterDisplayCorrection(frames, trochanterRef.current);
      ctx.save();
      ctx.translate(correction.dx * picture.width, correction.dy * picture.height);

      // --- Skeleton (bones + joints) ---
      // Phase 9.2B ("skeleton suit" visual fidelity, evidence-backed by Phase
      // 9.2A): the style change (thicker stroke, dark halo pass, rounder
      // solid joint markers) paints the SAME coordinate every non-proximal
      // joint always had — Phase 9.2A found 0px projection error and no
      // systematic placement error, so "floating" is a style/perception
      // issue there, not repositioned. The ONE real, quantified exception is
      // the four PROXIMAL joints (shoulders/hips): Phase 9.2A measured a
      // physically-implausible, FPS-amplified frame-to-frame jitter on them
      // specifically (Sections 17-19) that a style change cannot address (it
      // is an inter-frame phenomenon). `stepSkeletonSmoothing` (defined near
      // `bones` above) applies a small, bounded, source-time, display-only
      // ease to those four joints ONLY — never fabricated when raw evidence
      // is absent, never applied across a seek/scrub/large jump, and never
      // read by any scientific consumer (`frame.landmarks` itself is
      // untouched; only this local `resolvedJoint` lookup differs for these
      // four names, for this draw call alone).
      const rawProximalJoints: SkeletonSmoothingState["joints"] = {};
      for (const name of SKELETON_SMOOTHED_JOINT_NAMES) {
        const lm = frame.landmarks[name];
        if (lm) rawProximalJoints[name] = { x: lm.x, y: lm.y };
      }
      skeletonSmoothingRef.current = stepSkeletonSmoothing(skeletonSmoothingRef.current, rawProximalJoints, currentTime);
      const smoothedProximal = skeletonSmoothingRef.current.joints;
      const resolvedJoint = (name: string): OverlayPoint | undefined => {
        const raw = frame.landmarks[name];
        if (!raw) return undefined; // never fabricate a joint absent from real evidence
        const smoothed = (smoothedProximal as Record<string, { x: number; y: number } | undefined>)[name];
        return smoothed ? { x: smoothed.x, y: smoothed.y, visibility: raw.visibility } : raw;
      };

      if (show.skeleton && showPose) {
        for (const [aName, bName] of bones) {
          const a = resolvedJoint(aName);
          const b = resolvedJoint(bName);
          if (!a || !b) continue;

          const ap = project(a);
          const bp = project(b);

          // A bone lights up when either endpoint is the hovered/selected joint.
          const onSelected = aName === selected || bName === selected;
          const onHovered = aName === hovered || bName === hovered;
          const boneWidth = onSelected || onHovered ? SKELETON_BONE_WIDTH_EMPHASIZED : SKELETON_BONE_WIDTH;

          // Dark halo pass first (wider, low-alpha stroke) so the bone reads
          // as attached against both light and dark footage/backgrounds —
          // the same coordinates, drawn once more underneath the real stroke.
          ctx.strokeStyle = COLORS.boneHalo;
          ctx.lineWidth = boneWidth + SKELETON_HALO_WIDTH_DELTA;
          ctx.beginPath();
          ctx.moveTo(ap.x, ap.y);
          ctx.lineTo(bp.x, bp.y);
          ctx.stroke();

          ctx.strokeStyle = onSelected ? COLORS.selected : onHovered ? COLORS.hover : COLORS.bone;
          ctx.lineWidth = boneWidth;
          ctx.beginPath();
          ctx.moveTo(ap.x, ap.y);
          ctx.lineTo(bp.x, bp.y);
          ctx.stroke();
        }

        // Landmark dots (Phase 9.2B: enlarged from the prior 1px/soft-alpha
        // dots — see the style rationale above — so each bone visibly
        // terminates INTO a solid joint marker instead of appearing as a
        // free-floating stroke). Resolved by NAME (not `Object.values`
        // directly) so the four smoothed proximal joints draw their dot at
        // the exact same position as their own bone endpoints above —
        // every other joint's dot is still exactly `project(rawLandmark)`.
        for (const name of Object.keys(frame.landmarks)) {
          const point = resolvedJoint(name);
          if (!point) continue;
          const p = project(point);
          ctx.beginPath();
          ctx.arc(p.x, p.y, SKELETON_JOINT_RADIUS, 0, Math.PI * 2);
          ctx.fillStyle = COLORS.jointFill;
          ctx.fill();
          ctx.lineWidth = SKELETON_JOINT_STROKE_WIDTH;
          ctx.strokeStyle = COLORS.jointStroke;
          ctx.stroke();
        }
      }

      // --- Hover / selection markers (drawn regardless of the skeleton toggle
      // so the inspected joint stays visible even with the skeleton hidden). ---
      const drawMarker = (name: string, color: string, radius: number) => {
        const pt = frame.landmarks[name];
        if (!pt) return null;
        const p = project(pt);
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = COLORS.jointStroke;
        ctx.stroke();
        return p;
      };

      if (hovered && hovered !== selected) drawMarker(hovered, COLORS.hover, 7);
      if (selected) {
        const p = drawMarker(selected, COLORS.selected, 8);
        if (p) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
          ctx.strokeStyle = COLORS.selected;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      // --- Center of mass, trail, and velocity all key off the COM point ---
      if (frame.centerOfMass) {
        const com = project(frame.centerOfMass);

        if (show.center_of_mass && showPose) {
          const trail = frames
            .filter((f) => f.frame <= frame.frame && f.frame >= frame.frame - 30)
            .map((f) => f.centerOfMass)
            .filter(Boolean);

          ctx.strokeStyle = COLORS.trail;
          ctx.lineWidth = 3;
          ctx.beginPath();
          trail.forEach((p, i) => {
            const point = project(p!);
            if (i === 0) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
          });
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(com.x, com.y, 7, 0, Math.PI * 2);
          ctx.fillStyle = COLORS.com;
          ctx.fill();
        }

        if (show.velocity && frame.velocity && showPose) {
          const tipX = com.x + frame.velocity.x * 0.08;
          const tipY = com.y + frame.velocity.y * 0.08;

          ctx.strokeStyle = COLORS.velocity;
          ctx.fillStyle = COLORS.velocity;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(com.x, com.y);
          ctx.lineTo(tipX, tipY);
          ctx.stroke();

          // Arrowhead
          const headLen = 9;
          const ang = Math.atan2(tipY - com.y, tipX - com.x);
          if (Number.isFinite(ang)) {
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(
              tipX - headLen * Math.cos(ang - Math.PI / 6),
              tipY - headLen * Math.sin(ang - Math.PI / 6),
            );
            ctx.lineTo(
              tipX - headLen * Math.cos(ang + Math.PI / 6),
              tipY - headLen * Math.sin(ang + Math.PI / 6),
            );
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      // --- Angle labels (lower body + arms) ---
      // Shared registry so arm labels can avoid overlapping the lower-body ones.
      // Lower-body labels keep their original fixed positions; only the newer arm
      // labels are nudged to stay readable.
      const placedLabels: LabelBox[] = [];

      if (show.joint_angles && show.skeleton && showPose) {
        const angleLabels = [
          ["leftKnee", frame.angles.leftKnee],
          ["rightKnee", frame.angles.rightKnee],
          ["leftHip", frame.angles.leftHip],
          ["rightHip", frame.angles.rightHip],
          ["leftAnkle", frame.angles.leftAnkle],
          ["rightAnkle", frame.angles.rightAnkle],
        ] as const;

        for (const [joint, value] of angleLabels) {
          const point = frame.landmarks[joint];
          if (!point || value == null) continue;
          const p = project(point);
          const text = `${value}°`;
          drawLabel(ctx, text, p.x + 10, p.y - 10, COLORS.angle);
          placedLabels.push(labelBox(ctx, text, p.x + 10, p.y - 10));
        }
      }

      // Elbow + shoulder angles share the Joint Angles visibility contract.
      if (show.joint_angles && show.skeleton && showPose) {
        const armAngleLabels = [
          ["leftElbow", frame.angles.leftElbow],
          ["rightElbow", frame.angles.rightElbow],
          ["leftShoulder", frame.angles.leftShoulder],
          ["rightShoulder", frame.angles.rightShoulder],
        ] as const;

        for (const [joint, value] of armAngleLabels) {
          const point = frame.landmarks[joint];
          if (!point || value == null) continue;
          const p = project(point);
          placeLabel(ctx, `${value}°`, p.x + 10, p.y - 10, COLORS.armAngle, placedLabels);
        }
      }

      // --- Foot-contact labels ---
      if (show.contacts && showPose) {
        for (const side of ["left", "right"] as const) {
          const key = side === "left" ? "leftFootIndex" : "rightFootIndex";
          const foot = frame.landmarks[key];
          if (!foot) continue;

          const p = project(foot);
          const inContact = frame.footContact[side];

          ctx.strokeStyle = inContact ? COLORS.contact : COLORS.flight;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
          ctx.stroke();

          drawLabel(
            ctx,
            inContact ? "contact" : "flight",
            p.x + 14,
            p.y,
            inContact ? COLORS.contact : COLORS.flight,
          );
        }
      }

      // End pose-only anatomical correction before ground/gate annotations.
      ctx.restore();

      // --- Step marks (Day 56, ground-fixed Day 62, decluttered Day 63): each
      // ground contact leaves ONE permanent dot at the exact spot the foot struck
      // (red = left, green = right) and ONE step-length label — nothing else — so
      // the overlay reads like chalk marks on the track. The dot is drawn from the
      // contact's STORED position, never the live foot, so it stays put as the
      // athlete runs on (and moves with the ground under Auto Follow). Indices and
      // the connecting path are hidden behind debug mode. A contact appears once
      // playback reaches it and disappears again on rewind. ---
      // Calibrated measurement zone (world-x bounds). Mirrors computeSprintMeasurements'
      // gate math EXACTLY — the SAME reduced gate midpoints (manual calibration points)
      // and the SAME camera-offset world-x (frameX + offset at placement time). Used
      // ONLY to decide whether a stride-length LABEL is drawn: the foot-contact marker,
      // its position/appearance, and every calculation are untouched. Null when there is
      // no calibrated zone, in which case labels render exactly as before.
      if ((show.contacts || show.step_numbers) && canonicalSteps.length) {
        const reached = canonicalSteps.filter((m) => m.time <= currentTime + 1e-3);

        // Debug only: dashed step-to-step path linking consecutive contacts. A contact
        // that is offscreen/unsafe at this frame breaks the path (new subpath on the
        // next visible contact) rather than drawing a straight jump across the gap —
        // stride segments must clip at the frame boundary like everything else here.
        if (show.camera_motion_debug && reached.length > 1) {
          ctx.strokeStyle = COLORS.stepPath;
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          let needsMove = true;
          reached.forEach((m) => {
            const p = projectWorldStep(m);
            if (!p) { needsMove = true; return; }
            if (needsMove) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
            needsMove = false;
          });
          ctx.stroke();
          ctx.setLineDash([]);
        }

        for (const mark of reached) {
          const markId = `contact-${mark.sourceFrameIndex}-${mark.side}-${mark.index}`;
          const classification = classifiedById.get(markId);
          const isFinalEndpoint = zoneMetrics?.stepWindow.firstPostZoneContactId === markId;
          // Reproject the contact from its capture time into the current view so
          // it stays planted on the track as the camera pans (identity if static).
          const p = projectWorldStep(mark);
          if (!p) continue;
          const color = classification?.classification === "boundary_ambiguous"
            ? "#f5c451"
            : isFinalEndpoint
              ? "#5AA9FF"
              : classification?.countedInZone
                ? mark.side === "left" ? COLORS.stepLeft : COLORS.stepRight
                : "#777A80";

          // One SMALL dot at the fixed ground contact position (Day 68: −50% size
          // + thinner outline to cut overlay clutter).
          if (show.contacts) {
            ctx.beginPath();
            if (isFinalEndpoint) {
              ctx.moveTo(p.x, p.y - 4);
              ctx.lineTo(p.x + 4, p.y);
              ctx.lineTo(p.x, p.y + 4);
              ctx.lineTo(p.x - 4, p.y);
              ctx.closePath();
            } else {
              ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            }
            ctx.fillStyle = color;
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = COLORS.jointStroke;
            ctx.stroke();
          }

          // One step-length label (the gap from the previous contact), anchored at
          // this contact's ground spot — the ONLY text on a step in normal mode.
          // Real metres when calibrated; a relative estimate only in debug mode.
          // Never a contact/flight time. Drawn in a smaller font to stay unobtrusive.
          //
          // Show the numeric stride label ONLY for contacts INSIDE the calibrated zone
          // (the ones trusted metrics actually use). Out-of-zone contacts keep their
          // marker but drop the label — label-only, no effect on position or math.
          const meters = authoritativeStepLengthByFrameSide.get(`${mark.sourceFrameIndex}-${mark.side}`) ?? null;
          ctx.font = STEP_LABEL_FONT;
          if (show.step_numbers) {
            placeLabel(ctx, `${mark.index}`, p.x + 7, p.y - 10, color, placedLabels);
          }
          if (show.step_numbers && meters != null) {
            placeLabel(ctx, `${meters.toFixed(2)} m`, p.x + 6, p.y + 10, color, placedLabels);
          } else if (show.camera_motion_debug && mark.distanceFromPrev != null) {
            placeLabel(ctx, `≈${mark.distanceFromPrev.toFixed(2)} rel`, p.x + 6, p.y + 10, color, placedLabels);
          }
          ctx.font = DEFAULT_LABEL_FONT;

          // Debug only: the chronological side + index (L1/R2/…).
          if (show.camera_motion_debug) {
            placeLabel(ctx, `${mark.side === "left" ? "L" : "R"}${mark.index}`, p.x + 9, p.y - 11, color, placedLabels);
          }
        }
      }

      // --- Timing-gate BARS (Day 66): each gate is a real timing bar drawn
      // cone-to-cone across the lane (not a full-height line). Every cone is
      // world-anchored via `gateFrameXAt` — lifted to a fixed WORLD position
      // (frame-x at placement + the camera offset then) and projected back into the
      // CURRENT frame view — so the bar stays planted on the track: on a static
      // camera it sits still while the athlete runs THROUGH it; under a pan it
      // slides with the ground and, once a cone's world location leaves the frame,
      // the bar is not drawn (it never follows the athlete). ---
      // Small cone marker at a gate endpoint (Day 73: halved again to 1.75 px — the
      // yellow A/B laser-gate set-point dots, kept minimal. Visual only; the bar's
      // coordinates, labels, and calibration math are unchanged).
      const drawCone = (p: Point2D, color: string) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
        ctx.fill();
      };

      // Geometry of one gate bar: its two cone endpoints (frame px) + midpoint, or
      // null when either cone has panned outside the frame view.
      type BarGeom = { p1: Point2D; p2: Point2D; mid: Point2D; confidence?: number; safe?: boolean };
      let diagnosticStartGate: BarGeom | null = null;
      let diagnosticFinishGate: BarGeom | null = null;
      // Stroke a gate bar (cone-to-cone) with cone markers and an optional tag.
      // Day 74: thin (2 px) so the laser line is precise and unobtrusive.
      // A gate whose camera-transform chain is unsafe is never drawn at all — a
      // dashed/red line at a possibly-wrong position is still a false gate. The
      // caller checks `safe` and shows a non-positional status note instead.
      const strokeBar = (g: BarGeom, color: string, tag?: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(g.p1.x, g.p1.y);
        ctx.lineTo(g.p2.x, g.p2.y);
        ctx.stroke();
        drawCone(g.p1, color);
        drawCone(g.p2, color);
        if (tag) placeLabel(ctx, tag, g.mid.x + 8, g.mid.y - 12, color, placedLabels);
      };

      const savedGates = calibrationGatesRef.current;
      const savedCalibration = calibrationRef.current;
      if (savedGates) {
        const authoritativeGeom = (boundary: typeof savedGates.startBoundary): BarGeom | null => {
          if (!boundary) return null;
          if (!useGateWorldLock || !cameraEvidence || !sourceWidth || !sourceHeight) {
            const p1=project(boundary.sourceFrameLine.c1),p2=project(boundary.sourceFrameLine.c2);
            return {p1,p2,mid:{x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2},confidence:boundary.confidence,safe:true};
          }
          const propagated = propagateAnchorFromSetupToFrame(
            boundary, currentSourceFrame, cameraEvidence, sourceWidth, sourceHeight,
          );
          if (!sourceLineIntersectsViewport(propagated.c1, propagated.c2)) return null;
          return {
            p1: project(propagated.c1), p2: project(propagated.c2),
            mid: project(propagated.midpoint), confidence: propagated.confidence, safe: propagated.safe,
          };
        };
        const migratedGeom = (bar: typeof savedGates.startGate): BarGeom | null => {
          if (!useGateWorldLock || !cameraEvidence || !sourceWidth || !sourceHeight) {
            const p1=project(bar.c1),p2=project(bar.c2);
            return {p1,p2,mid:{x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2},safe:true};
          }
          const setupOverlayFrame = frames.reduce((best, candidate) =>
            Math.abs(candidate.time - bar.timeS) < Math.abs(best.time - bar.timeS) ? candidate : best,
          );
          const setupFrame = bar.setupFrameIndex ?? setupOverlayFrame?.sourceFrameIndex ?? setupOverlayFrame?.frame;
          if (setupFrame == null) return null;
          const a = propagateSourcePoint(bar.c1, setupFrame, currentSourceFrame, cameraEvidence, sourceWidth, sourceHeight);
          const b = propagateSourcePoint(bar.c2, setupFrame, currentSourceFrame, cameraEvidence, sourceWidth, sourceHeight);
          if (!sourceLineIntersectsViewport(a.point, b.point)) return null;
          const p1 = project(a.point); const p2 = project(b.point);
          return { p1, p2, mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
            confidence: Math.min(a.confidence, b.confidence), safe: a.safe && b.safe };
        };
        // Authority-first rendering (Part 1): a MANUAL-CONFIRMED zone is drawn from
        // its exact persisted c1/c2, reprojected to the CURRENT source frame through
        // the AUTHORITATIVE background camera model only — never through the
        // athlete-derived camera estimate (`cameraTrack`/`gateFrameXAt`), which slides
        // a confirmed zone off its painted line as the runner moves (the drift bug).
        //
        // The canonical source anchor is immutable; each frame we derive its display
        // position fresh:  canonical anchor → source-camera transform (identity when
        // the camera is static or evidence is absent) → project() into the picture
        // rect → the shared follow-wrapper transform (same as the video). It is exact
        // at the setup frame (no post-save pixel shift) and stays glued to the world
        // location on every other frame. Auto / draft zones keep the derived chain.
        const setupFrameFor = (timeS: number, explicit?: number): number | undefined => {
          if (explicit != null) return explicit;
          if (!frames.length) return undefined;
          const nearest = frames.reduce((best, candidate) =>
            Math.abs(candidate.time - timeS) < Math.abs(best.time - timeS) ? candidate : best,
          );
          return nearest.sourceFrameIndex ?? nearest.frame;
        };
        const canonicalGeom = (
          canonical: { c1: Point2D; c2: Point2D; timeS: number; setupFrameIndex?: number },
          identity: "start" | "finish",
        ): BarGeom | null => {
          // Preferred Phase 6.2 path: one pre-resolved setup→global lookup and
          // one global→current lookup. This has no playback-time chain walk or
          // drift accumulation and works for stationary shake and genuine pan.
          if (cameraPathIndex && sourceWidth && sourceHeight) {
            const setupFrame = setupFrameFor(canonical.timeS, canonical.setupFrameIndex);
            if (setupFrame != null) {
              const globalA = framePointToGlobal(cameraPathIndex, setupFrame, canonical.c1, sourceWidth, sourceHeight);
              const globalB = framePointToGlobal(cameraPathIndex, setupFrame, canonical.c2, sourceWidth, sourceHeight);
              const currentA = globalA.available
                ? globalPointToFrame(cameraPathIndex, currentSourceFrame, globalA.point, sourceWidth, sourceHeight)
                : null;
              const currentB = globalB.available
                ? globalPointToFrame(cameraPathIndex, currentSourceFrame, globalB.point, sourceWidth, sourceHeight)
                : null;
              if (currentA?.available && currentB?.available) {
                if (!sourceLineIntersectsViewport(currentA.point, currentB.point)) return null;
                const p1 = project(currentA.point);
                const p2 = project(currentB.point);
                return { p1, p2, mid: midpoint(p1, p2), safe: true };
              }
              // A global-path gap is explicit. Never silently substitute an
              // identity/screen-fixed gate while the camera may have moved.
              const p1 = project(canonical.c1);
              const p2 = project(canonical.c2);
              return { p1, p2, mid: midpoint(p1, p2), safe: false };
            }
          }
          // Authoritative reprojection when production camera evidence is available.
          if (useGateWorldLock && cameraEvidence && sourceWidth && sourceHeight) {
            const setupFrame = setupFrameFor(canonical.timeS, canonical.setupFrameIndex);
            if (setupFrame != null) {
              const worldLine = sourceLineToCanonicalWorld(
                canonical.c1,
                canonical.c2,
                setupFrame,
                identity,
                cameraEvidence,
                sourceWidth,
                sourceHeight,
              );
              const line = projectCanonicalWorldLine(
                worldLine, currentSourceFrame, cameraEvidence, sourceWidth, sourceHeight,
              );
              if (!sourceLineIntersectsViewport(line.c1, line.c2)) return null;
              return {
                p1: project(line.c1), p2: project(line.c2), mid: project(line.midpoint),
                confidence: line.confidence, safe: line.projectable,
              };
            }
          }
          // Identity fallback (no evidence / static camera): draw the canonical anchor
          // at its raw stored source coordinates. NEVER reproject a confirmed zone via
          // athlete-motion-derived camera estimates.
          if (!sourceLineIntersectsViewport(canonical.c1, canonical.c2)) return null;
          const p1 = project(canonical.c1);
          const p2 = project(canonical.c2);
          return { p1, p2, mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } };
        };
        const gateDirective = selectRenderableGateGeometry(savedGates);
        const startG =
          gateDirective.mode === "canonical_raw"
            ? canonicalGeom(gateDirective.start, "start")
            : authoritativeGeom(savedGates.startBoundary)
              ?? migratedGeom(savedGates.startGate);
        const finishG =
          gateDirective.mode === "canonical_raw"
            ? canonicalGeom(gateDirective.finish, "finish")
            : authoritativeGeom(savedGates.finishBoundary)
              ?? migratedGeom(savedGates.finishGate);
        diagnosticStartGate = startG;
        diagnosticFinishGate = finishG;
        // Day 104 (Part 7) — captured BEFORE the deadband stabilization below
        // mutates `startG`/`finishG` in place, so the debug HUD can show the
        // true raw-vs-rendered comparison, not two views of the same object.
        const rawStartMid = startG ? { ...startG.mid } : null;
        const rawFinishMid = finishG ? { ...finishG.mid } : null;

        // Phase 6.2: one SOURCE-pixel, resolution-aware decision for the entire
        // start/finish/zone scene. The old code stabilized four endpoints
        // independently in CSS pixels, which could change line length/orientation
        // and let the two boundaries update on different frames. This holds or
        // accepts all four points atomically and never touches scientific geometry.
        const zoneStab = startG && finishG && sourceWidth && sourceHeight
          ? stabilizeGateZone(
              { start: { p1: startG.p1, p2: startG.p2 }, finish: { p1: finishG.p1, p2: finishG.p2 } },
              gateDisplayRef.current,
              sourceWidth,
              sourceHeight,
              picture.width,
              picture.height,
            )
          : null;
        gateDisplayRef.current = zoneStab?.display ?? null;
        if (startG && finishG && zoneStab) {
          startG.p1 = zoneStab.display.start.p1;
          startG.p2 = zoneStab.display.start.p2;
          startG.mid = midpoint(startG.p1, startG.p2);
          finishG.p1 = zoneStab.display.finish.p1;
          finishG.p2 = zoneStab.display.finish.p2;
          finishG.mid = midpoint(finishG.p1, finishG.p2);
        }

        // Day 99 (Part 3) — gate diagnostics: spacing/orientation of the
        // DISPLAYED lines, plus raw pre-stabilization displacement, so a
        // regression is visible as a number, not just re-discovered by eye.
        // gate spacing/orientation is measured in DISPLAY space (px); it exists
        // to prove the two gates never move independently of each other, not as
        // a substitute for the world-space distance calibration measures.
        if (startG && finishG) {
          gateDiagnosticsRef.current = {
            sourceFrame: currentSourceFrame,
            startMidDisplacementPx: zoneStab?.displacementSourcePx ?? 0,
            finishMidDisplacementPx: zoneStab?.displacementSourcePx ?? 0,
            gateSpacingPx: pointDistance(startG.mid, finishG.mid),
            startOrientationDeg: lineOrientationDeg(startG.p1, startG.p2),
            finishOrientationDeg: lineOrientationDeg(finishG.p1, finishG.p2),
            rawTransform: useGateWorldLock ? "camera_projected" : "identity_static",
            displayTransform: "shared_deadband_stabilized",
            rejectedTransformFrame:
              (startG.safe === false || finishG.safe === false) ? currentSourceFrame : null,
            rawStartPx: rawStartMid,
            rawFinishPx: rawFinishMid,
            renderedStartPx: { ...startG.mid },
            renderedFinishPx: { ...finishG.mid },
            renderedStartP1: { ...startG.p1 },
            renderedStartP2: { ...startG.p2 },
            renderedFinishP1: { ...finishG.p1 },
            renderedFinishP2: { ...finishG.p2 },
            held: zoneStab?.held ?? false,
            cameraPathState: cameraPathIndex?.get(currentSourceFrame)?.state ?? null,
            cameraTransform: cameraPathIndex?.get(currentSourceFrame)?.globalToFrameMatrix ?? null,
          };
        }

        // Dev-only drift diagnostic: proves the canonical source anchor is unchanged
        // while only its projection moves. Gated behind the debug toggle + non-prod.
        if (show.camera_motion_debug && process.env.NODE_ENV !== "production" && gateDirective.mode === "canonical_raw") {
          console.debug("[timing-zone] canonical anchor immutable; projection derived fresh", {
            sourceFrame: currentSourceFrame,
            canonicalStart: gateDirective.start.c1,
            projectedStart: startG?.p1 ?? null,
            hasCameraEvidence: !!(useGateWorldLock && cameraEvidence && sourceWidth && sourceHeight),
          });
        }
        if (show.camera_motion_debug && process.env.NODE_ENV !== "production") {
          const currentTransform = cameraEvidence?.transforms.find((item) => item.frame === currentSourceFrame) ?? null;
          for (const [id, geom, referenceCoordinate] of [
            ["start", startG, gateDirective.mode === "canonical_raw" ? gateDirective.start.c1 : savedGates.startGate.c1],
            ["finish", finishG, gateDirective.mode === "canonical_raw" ? gateDirective.finish.c1 : savedGates.finishGate.c1],
          ] as const) {
            console.debug("[world-anchor-gate]", {
              gateId: id,
              currentFrame: currentSourceFrame,
              referenceCoordinate,
              currentAffineTransform: currentTransform,
              projectedDisplayCoordinate: geom?.p1 ?? null,
              visible: geom != null,
              safe: geom ? geom.safe !== false : null,
              clamped: false,
            });
          }
        }
        // [world-lock-runtime]: one summary per distinct source frame, covering BOTH
        // gates and historical contacts, so the two can be directly compared — this is
        // the diagnostic that answers "do gates and contacts use different projection
        // paths" and "why did a contact stop rendering" from the running app itself,
        // rather than from static code reading.
        if (show.camera_motion_debug && process.env.NODE_ENV !== "production"
          && worldLockRuntimeLoggedFrameRef.current !== currentSourceFrame) {
          worldLockRuntimeLoggedFrameRef.current = currentSourceFrame;
          const currentTransform = cameraEvidence?.transforms.find((item) => item.frame === currentSourceFrame) ?? null;
          const projectableContacts = canonicalSteps.filter((m) => m.world?.projectable).length;
          const visibleContacts = canonicalSteps.filter((m) => projectWorldStep(m) !== null).length;
          const rejectedContacts = canonicalSteps
            .filter((m) => !m.world?.projectable)
            .map((m) => ({
              contactId: `contact-${m.sourceFrameIndex}-${m.side}-${m.index}`,
              reasons: m.world?.warnings ?? (cameraEvidence ? ["no_camera_evidence_for_contact"] : ["no_camera_evidence_at_all"]),
            }));
          const activeFramePath = cameraPathIndex?.get(currentSourceFrame) ?? null;
          const activeKeyframe = activeFramePath
            ? cameraPath?.keyframes.find((kf) => kf.keyframeId === activeFramePath.keyframeId) ?? null
            : null;
          console.debug("[world-lock-runtime]", {
            sourceRevision: WORLD_LOCK_BUILD_TAG,
            sessionId: sessionId ?? null,
            cameraMode: calibrationCameraType ?? recordingMode ?? null,
            currentFrame: currentSourceFrame,
            referenceFrameIndex: WORLD_REFERENCE_FRAME_INDEX,
            cameraArtifactVersion: cameraEvidence?.cameraMotionModelVersion ?? null,
            transformAvailable: currentTransform != null,
            transformModel: currentTransform?.transformType ?? null,
            transformConfidence: currentTransform?.confidence ?? null,
            trackingState: cameraTrackingStateAt(cameraEvidence, currentSourceFrame),
            gateProjectionPath: cameraPathIndex
              ? "cameraPath.ts:globalPointToFrame (precomputed, no chain-walk)"
              : !useCameraProjection
                ? "stationary-raw"
                : gateDirective.mode === "canonical_raw"
                  ? "worldProjection.ts:projectCanonicalWorldLine (propagateSourcePoint)"
                  : "authority.ts:selectRenderableGateGeometry (legacy path)",
            contactProjectionPath: cameraPathIndex
              ? "cameraPath.ts:globalPointToFrame (precomputed, no chain-walk)"
              : !useCameraProjection
                ? "coordinates.ts:project (raw, no camera compensation)"
                : "worldAnchor.ts:projectWorldAnchorToFrame (propagateSourcePoint)",
            canonicalContacts: canonicalSteps.length,
            projectableContacts,
            visibleContacts,
            rejectedContacts,
            gateAVisible: startG != null,
            gateBVisible: finishG != null,
            // Phase 1 extensions (Part 11) — undefined/null when no camera path artifact.
            cameraPathArtifactVersion: cameraPath?.version ?? null,
            frameKeyframeId: activeFramePath?.keyframeId ?? null,
            globalPathAvailable: activeFramePath?.state === "anchored",
            relockSegmentId: activeKeyframe?.relockEvent ? activeKeyframe.keyframeId : null,
            projectionResumedAfterGap: Boolean(activeKeyframe?.relockEvent),
          });
        }
        // Day 104 (Part 7): stationary-camera redesign — full-height vertical
        // gate lines + a translucent zone tint, instead of the short cone-to-
        // cone segment. Explicitly gated to the NON-panning path only
        // (`!useCameraProjection`): panning gate rendering is untouched, per
        // this task's "do not work on panning" constraint. The line/fill are
        // drawn purely from `startG.mid`/`finishG.mid` — the exact same
        // authoritative, stabilized point the old segment used — so this is a
        // display-only change; the crossing calculation upstream (`savedGates`,
        // `gateDirective`, `canonicalGeom`) is completely unmodified.
        const stationaryZoneDisplay = !useCameraProjection;
        // Phase R2: fill a screen-space rectangle (already in picture-local
        // coordinates, matching `stationaryGateLine`'s own coordinate space)
        // with a translucent color -- no world/perspective math, deliberately
        // simpler than `drawWorldPolygon`.
        const drawStationaryZoneRect = (context: CanvasRenderingContext2D, r: StationaryZoneRect, fillStyle: string) => {
          if (r.width <= 0 || r.height <= 0) return;
          context.fillStyle = fillStyle;
          context.fillRect(r.x, r.y, r.width, r.height);
        };
        // Phase 6.3: all three zones derive from the SAME already-world-locked,
        // atomically-stabilized boundary scene as the gates. They are clipped
        // against the visible world viewport, never hardcoded as screen rects.
        // `destination-over` gives the declarative World Polygons layer its
        // effective z-order behind athlete/contact graphics while this legacy
        // monolithic renderer is incrementally migrated to the registry.
        if (show.zones && startG && finishG && startG.safe !== false && finishG.safe !== false) {
          // Phase R2: stationary-camera zones are three screen-filling
          // vertical panes (top of the displayed video to bottom, per the
          // product's explicit design intent), anchored at the SAME already-
          // authoritative, already-stabilized gate midpoints
          // `strokeStationaryGate` draws its full-height gate LINES from
          // (`startG.mid.x`/`finishG.mid.x`) -- not a new geometry, just a
          // rectangle fill instead of a perspective-clipped polygon fill.
          // Panning is explicitly out of scope: it keeps the prior
          // `worldZonePolygons` perspective-quadrilateral behavior unchanged.
          if (stationaryZoneDisplay) {
            const zones = stationaryThreeZoneRects(startG.mid.x, finishG.mid.x, picture.width, picture.height);
            const zoneOverlays: VisualizationOverlay[] = [
              { id: "start-zone", coordinateSpace: "world", layer: "worldPolygons", zOrder: 0, visible: true,
                dependencies: ["start-gate", "global-camera-path"], transformSource: "global_camera_path",
                render: (context) => drawStationaryZoneRect(context, zones.pre, WORLD_ZONE_THEME.pre) },
              { id: "fly-zone", coordinateSpace: "world", layer: "worldPolygons", zOrder: 1, visible: true,
                dependencies: ["start-gate", "finish-gate", "global-camera-path"], transformSource: "global_camera_path",
                render: (context) => drawStationaryZoneRect(context, zones.fly, WORLD_ZONE_THEME.measurement) },
              { id: "finish-zone", coordinateSpace: "world", layer: "worldPolygons", zOrder: 2, visible: true,
                dependencies: ["finish-gate", "global-camera-path"], transformSource: "global_camera_path",
                render: (context) => drawStationaryZoneRect(context, zones.post, WORLD_ZONE_THEME.post) },
            ];
            ctx.save();
            ctx.globalCompositeOperation = "destination-over";
            renderRegisteredOverlays(zoneOverlays, ctx);
            ctx.restore();
          } else {
            const polygons = worldZonePolygons(
              { p1: startG.p1, p2: startG.p2, midpoint: startG.mid },
              { p1: finishG.p1, p2: finishG.p2, midpoint: finishG.mid },
              rect,
            );
            const zoneOverlays: VisualizationOverlay[] = [
              { id: "start-zone", coordinateSpace: "world", layer: "worldPolygons", zOrder: 0, visible: true,
                dependencies: ["start-gate", "global-camera-path"], transformSource: "global_camera_path",
                render: (context) => drawWorldPolygon(context, polygons.start, WORLD_ZONE_THEME.pre) },
              { id: "fly-zone", coordinateSpace: "world", layer: "worldPolygons", zOrder: 1, visible: true,
                dependencies: ["start-gate", "finish-gate", "global-camera-path"], transformSource: "global_camera_path",
                render: (context) => drawWorldPolygon(context, polygons.fly, WORLD_ZONE_THEME.measurement) },
              { id: "finish-zone", coordinateSpace: "world", layer: "worldPolygons", zOrder: 2, visible: true,
                dependencies: ["finish-gate", "global-camera-path"], transformSource: "global_camera_path",
                render: (context) => drawWorldPolygon(context, polygons.finish, WORLD_ZONE_THEME.post) },
            ];
            ctx.save();
            ctx.globalCompositeOperation = "destination-over";
            renderRegisteredOverlays(zoneOverlays, ctx);
            ctx.restore();
          }
        }
        const strokeStationaryGate = (g: BarGeom, color: string, label: string) => {
          const line = stationaryGateLine(g.mid.x, picture.height);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(line.x, line.y0);
          ctx.lineTo(line.x, line.y1);
          ctx.stroke();
          placeLabel(ctx, label, line.x + 6, 18, color, placedLabels);
        };
        // `null` means offscreen (normal, expected while panning — never an error and
        // never noted). `safe:false` means onscreen but the camera-transform chain is
        // untrustworthy right now — never draw a possibly-wrong line; show a
        // non-positional status note instead of a false screen-fixed gate.
        if (show.gates && startG) {
          if (startG.safe === false) drawLabel(ctx, "Start gate: tracking unavailable", 14, 56, "#e46464");
          else if (stationaryZoneDisplay) strokeStationaryGate(startG, COLORS.calibration, "Start");
          else strokeBar(startG, COLORS.calibration, "Start");
        }
        if (show.gates && finishG) {
          if (finishG.safe === false) drawLabel(ctx, "Finish gate: tracking unavailable", 14, 70, "#e46464");
          else if (stationaryZoneDisplay) strokeStationaryGate(finishG, COLORS.calibration, "Finish");
          else strokeBar(finishG, COLORS.calibration, "Finish");
        }
      } else if (savedCalibration) {
        // Legacy midpoint-only records lack source-frame and background-transform
        // provenance. They require a rerun instead of being misdrawn as world data.
      }

      // In-progress placement: [startC1, startC2, finishC1, finishC2]. Complete
      // pairs draw as a pending bar; a lone cone draws as a marker until its partner
      // is placed. Each cone is world-anchored by its own click time.
      //
      // Stationary mode: the raw stored point IS the current display point (no camera
      // motion to compensate), so it always renders normally.
      //
      // Panning mode: a pending cone was clicked on a potentially DIFFERENT source
      // frame than the one currently displayed. Once the camera has panned, its raw
      // stored coordinate no longer corresponds to where that landmark is on screen
      // NOW, so it may only be drawn after reprojecting through the background camera
      // model — and only when that reprojection actually clears the same reliability
      // bar (`MIN_SAFE_ANCHOR_TRANSFORM_CONFIDENCE`, features, inliers, residual) a
      // saved gate's crossing would need. Reprojection missing OR unreliable must
      // never fall back to the raw/screen-locked point (that would silently imply a
      // false, stale location); it hides the cone and surfaces a clearly
      // non-authoritative status note instead. The click itself (`pendingRef.current`)
      // is untouched by any of this — only what gets drawn changes, so placement can
      // never be lost while tracking is temporarily unavailable.
      const pending = pendingRef.current;
      if (pending && pending.length) {
        const pc = COLORS.calibrationPending;
        let notedTrackingUnavailable = false;
        const noteTrackingUnavailable = () => {
          if (notedTrackingUnavailable) return;
          notedTrackingUnavailable = true;
          ctx.font = DEFAULT_LABEL_FONT;
          drawLabel(ctx, "Camera tracking unavailable — pending gate hidden", 14, 56, "#e46464");
        };
        // Reprojects one pending cone to the current frame, returning null unless the
        // transform actually clears the same reliability bar a saved crossing needs.
        // `allFramesReliable` (not just confidence) is required: a held/degraded
        // transform can report high raw confidence while still failing on feature
        // count, inlier ratio, or residual.
        const reliablePendingPoint = (c: PendingCone): Point2D | null => {
          if (!cameraEvidence || !sourceWidth || !sourceHeight) return null;
          const target = frame.sourceFrameIndex ?? frame.frame;
          const result = propagateSourcePoint(c, c.sourceFrameIndex, target, cameraEvidence, sourceWidth, sourceHeight);
          if (!result.safe || !result.allFramesReliable || result.confidence < MIN_SAFE_ANCHOR_TRANSFORM_CONFIDENCE) return null;
          return result.point;
        };
        const drawPendingCone = (c: PendingCone) => {
          if (!useCameraProjection) { drawCone(project(c), pc); return; }
          const point = reliablePendingPoint(c);
          if (!point) { noteTrackingUnavailable(); return; }
          drawCone(project(point), pc);
        };
        const pendingGeom = (c1: PendingCone, c2: PendingCone): BarGeom | null => {
          if (!useCameraProjection) {
            const p1=project(c1),p2=project(c2);
            return {p1,p2,mid:{x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2}};
          }
          const a = reliablePendingPoint(c1);
          const b = reliablePendingPoint(c2);
          if (!a || !b) { noteTrackingUnavailable(); return null; }
          if (!sourceLineIntersectsViewport(a, b)) return null;
          const p1 = project(a); const p2 = project(b);
          return { p1, p2, mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } };
        };
        if (pending.length >= 2) { const g = pendingGeom(pending[0], pending[1]); if (g) strokeBar(g, pc, "Start"); }
        else if (pending.length === 1) drawPendingCone(pending[0]);
        if (pending.length >= 4) { const g = pendingGeom(pending[2], pending[3]); if (g) strokeBar(g, pc, "Finish"); }
        else if (pending.length === 3) drawPendingCone(pending[2]);
      }


      // --- Comparison mode (experimental): draw the SECOND engine's pose
      // (RTMPose, carried in comparisonLandmarks) as a DASHED PURPLE stick figure
      // over the solid MediaPipe primary skeleton, plus a compact HUD with the
      // engine names, frame index, and video/pose timestamps. Visual only — the
      // comparison pose never enters any metric. Also shown inside the dev debug
      // view so nothing is lost there. ---
      const showComparison = show.pose_diagnostics || show.camera_motion_debug;
      if (showComparison) {
        if (frame.comparisonLandmarks) {
          ctx.save();
          ctx.translate(correction.dx * picture.width, correction.dy * picture.height);
          ctx.strokeStyle = "#c084fc"; // purple-400 — RTMPose comparison skeleton
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          for (const [aName, bName] of bones) {
            const a = frame.comparisonLandmarks[aName];
            const b = frame.comparisonLandmarks[bName];
            if (!a || !b) continue;
            const ap = project(a); const bp = project(b);
            ctx.beginPath(); ctx.moveTo(ap.x, ap.y); ctx.lineTo(bp.x, bp.y); ctx.stroke();
          }
          ctx.setLineDash([]);
          ctx.restore();
        }
        // Compact readout: primary vs comparison engine, the frame index, both
        // clocks, and the person-track confidence — enough to line the two
        // skeletons up frame by frame.
        const hud = [
          `primary ${frame.backend ?? "pose"} · comparison ${frame.comparisonBackend ?? "none"} · frame ${frame.frame}`,
          `video ${currentTime.toFixed(3)}s · pose ${frame.time.toFixed(3)}s`,
          `tracking confidence ${frame.trackingConfidence?.toFixed(3) ?? "unavailable"}`,
        ];
        ctx.font = "600 10px ui-monospace, monospace";
        const hudW = Math.min(picture.width - 16, 380);
        ctx.textAlign = "left";
        ctx.fillStyle = "rgba(3,7,18,.82)";
        ctx.fillRect(8, 28, hudW, hud.length * 15 + 24);
        ctx.fillStyle = "#e2e8f0";
        hud.forEach((line, i) => ctx.fillText(line, 14, 40 + i * 15));
        // Legend so the dashed figure is unambiguous during the demo.
        ctx.fillStyle = "#c084fc";
        ctx.fillText("╌╌ RTMPose (experimental)   ── MediaPipe", 14, 40 + hud.length * 15 + 4);
        ctx.font = DEFAULT_LABEL_FONT;
      }

      // Day 100 (Part 5) — coverage visualization: the calibrated zone as one
      // bar, with the measured sub-region highlighted and the unsupported
      // region dimmed, so "how much of the zone is real evidence" is a single
      // glance, not a re-derivation. Purely illustrative (fractions of the
      // known zone distance) — draws nothing on top of pose/gate/contact
      // rendering and never influences it.
      if (show.camera_motion_debug && zoneCoverage && zoneCoverage.zoneDistanceM) {
        const barX = 8;
        const barY = picture.height - 26;
        const barW = Math.min(picture.width - 16, 400);
        const barH = 14;
        ctx.fillStyle = "rgba(3,7,18,.82)";
        ctx.fillRect(barX - 2, barY - 16, barW + 4, barH + 20);
        // Unsupported region (full zone width, dim).
        ctx.fillStyle = "rgba(148, 163, 184, 0.35)";
        ctx.fillRect(barX, barY, barW, barH);
        // Supported (measured) region.
        const startFrac = (zoneCoverage.measurementStartPositionM ?? 0) / zoneCoverage.zoneDistanceM;
        const endFrac = (zoneCoverage.measurementEndPositionM ?? 0) / zoneCoverage.zoneDistanceM;
        const clampedStart = Math.max(0, Math.min(1, startFrac));
        const clampedEnd = Math.max(0, Math.min(1, endFrac));
        if (zoneCoverage.eligibleStepCount > 0 && clampedEnd > clampedStart) {
          ctx.fillStyle = "#89d46a";
          ctx.fillRect(barX + clampedStart * barW, barY, (clampedEnd - clampedStart) * barW, barH);
        }
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "600 9px ui-monospace, monospace";
        ctx.fillText(
          `zone coverage: ${zoneCoverage.coveragePercent?.toFixed(0) ?? "0"}% ` +
            `(${zoneCoverage.measurementStartPositionM?.toFixed(1) ?? "—"}m → ` +
            `${zoneCoverage.measurementEndPositionM?.toFixed(1) ?? "—"}m of ${zoneCoverage.zoneDistanceM}m, ` +
            `confidence ${zoneCoverage.coverageConfidence})`,
          barX,
          barY - 4,
        );
        ctx.font = DEFAULT_LABEL_FONT;
      }

      if (show.camera_motion_debug) {
        const rawHip = correction.detectedHip ? project(correction.detectedHip) : null;
        const marker = correction.marker ? project(correction.marker) : null;
        if (rawHip) {
          ctx.fillStyle = "#38bdf8";
          ctx.beginPath(); ctx.arc(rawHip.x, rawHip.y, 4, 0, Math.PI * 2); ctx.fill();
        }
        if (marker) {
          ctx.strokeStyle = "#f472b6"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(marker.x, marker.y, 6, 0, Math.PI * 2); ctx.stroke();
          if (rawHip) { ctx.beginPath(); ctx.moveTo(rawHip.x, rawHip.y); ctx.lineTo(marker.x, marker.y); ctx.stroke(); }
        }
        const follow = followStateRef?.current;
        const sourceFrame = frame.sourceFrameIndex ?? frame.frame;
        const cameraFrame = cameraEvidence?.transforms.find((item) => item.frame === sourceFrame);
        const athleteTrack = cameraEvidence?.athleteTrack.find((item) => item.frame === sourceFrame);
        if (show.crop_box && athleteTrack?.cropBox) {
          const topLeft = project({ x: athleteTrack.cropBox.x, y: athleteTrack.cropBox.y });
          const bottomRight = project({
            x: athleteTrack.cropBox.x + athleteTrack.cropBox.width,
            y: athleteTrack.cropBox.y + athleteTrack.cropBox.height,
          });
          ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
          ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
          ctx.setLineDash([]);
        }
        const pxError = Math.hypot(correction.dx * picture.width, correction.dy * picture.height);
        const scale = athleteScalePxPerCm(frame, picture.height, athleteHeightCm);
        const lines = [
          `world ${WORLD_COORDINATE_SCHEMA_VERSION} · reference frame 0 · source frame ${sourceFrame}`,
          `primary ${frame.backend ?? "pose"} · comparison ${frame.comparisonBackend ?? "off"} · frame ${frame.frame}`,
          `video ${currentTime.toFixed(3)}s · pose ${frame.time.toFixed(3)}s`,
          `tracking confidence ${frame.trackingConfidence?.toFixed(3) ?? "unavailable"}`,
          `render ${picture.width.toFixed(0)}×${picture.height.toFixed(0)} · canvas ${canvas.width}×${canvas.height} @${dpr.toFixed(2)}x`,
          `trochanter ${marker ? `${marker.x.toFixed(1)},${marker.y.toFixed(1)}` : "not set"} · offset ${(correction.dx * picture.width).toFixed(1)},${(correction.dy * picture.height).toFixed(1)}px`,
          `height ${athleteHeightCm ?? "—"}cm · scale ${scale?.toFixed(3) ?? "—"} px/cm · error ${pxError.toFixed(1)}px`,
          `follow ${autoFollow ? "on" : "off"} · transform ${follow ? `${follow.current.scale.toFixed(3)} @ ${follow.current.cx.toFixed(3)},${follow.current.cy.toFixed(3)}` : "identity"}`,
          `target ${follow ? `${follow.target.cx.toFixed(3)},${follow.target.cy.toFixed(3)}` : "—"} · offset ${follow ? `${(follow.current.cx - .5).toFixed(3)},${(follow.current.cy - .5).toFixed(3)}` : "0,0"}`,
          `camera prev→current ${cameraFrame ? `${cameraFrame.translationX.toFixed(4)},${cameraFrame.translationY.toFixed(4)} · rot ${cameraFrame.rotationDeg.toFixed(2)}° · scale ${cameraFrame.scale.toFixed(4)}` : "unavailable"}`,
          `transform confidence ${cameraFrame?.confidence.toFixed(3) ?? "—"} · features ${cameraFrame?.supportingFeatureCount ?? "—"} · residual ${cameraFrame?.residualPx?.toFixed(2) ?? "—"}px`,
          `canonical steps ${canonicalSteps.length} · projectable ${canonicalSteps.filter((step) => projectWorldStep(step)).length}`,
          `canonical start ${calibrationGatesRef.current ? `${calibrationGatesRef.current.startGate.c1.x.toFixed(4)},${calibrationGatesRef.current.startGate.c1.y.toFixed(4)}` : "—"} · finish ${calibrationGatesRef.current ? `${calibrationGatesRef.current.finishGate.c1.x.toFixed(4)},${calibrationGatesRef.current.finishGate.c1.y.toFixed(4)}` : "—"}`,
          `viewport start ${diagnosticStartGate ? `${diagnosticStartGate.mid.x.toFixed(1)},${diagnosticStartGate.mid.y.toFixed(1)}` : "not projectable"} · finish ${diagnosticFinishGate ? `${diagnosticFinishGate.mid.x.toFixed(1)},${diagnosticFinishGate.mid.y.toFixed(1)}` : "not projectable"}`,
          `projection ${cameraEvidence ? "background RANSAC affine" : "legacy/rerun required"} · fallback ${cameraEvidence ? "none" : "withheld"} · reprojection ${cameraFrame?.residualPx?.toFixed(2) ?? "—"}px`,
          `crop ${athleteTrack ? `${athleteTrack.cropSource} · confidence ${athleteTrack.cropConfidence.toFixed(3)}` : "unavailable"} · analytical anchors ignore crop/follow`,
          // Day 99 (Part 9) — the debug-panel fields this pass added: pose
          // provenance, contact state at this frame, and the gate-stability
          // diagnostics (Part 3) so both are visible from the running app,
          // not only reconstructible from static code reading.
          `boxOrigin ${frame.boxOrigin ?? "unknown"} · trackState ${frame.trackState ?? "unknown"} · landmarks ${Object.keys(frame.landmarks).length}`,
          // Day 104 (Part 5) — real measured overlay sync: frame offset (in
          // native source frames) and timestamp offset between the rendered
          // pose frame and the true video playhead, plus whether this frame
          // was rejected for being stale (never rendered as current pose).
          `overlay sync: frame offset ${overlaySyncRef.current.frameOffset} · timestamp offset ${(overlaySyncRef.current.timestampOffsetS * 1000).toFixed(1)}ms · native frame ${nativeFrameDurationS ? (nativeFrameDurationS * 1000).toFixed(2) : "—"}ms · ${overlaySyncRef.current.stale ? "STALE (rejected)" : "fresh"}`,
          `contact at frame ${canonicalSteps.find((s) => s.sourceFrameIndex === sourceFrame) ? `${canonicalSteps.find((s) => s.sourceFrameIndex === sourceFrame)!.side} (projectable: ${canonicalSteps.filter((s) => s.sourceFrameIndex === sourceFrame).some((s) => projectWorldStep(s)) ? "yes" : "no"})` : "none"}`,
          `gate spacing ${gateDiagnosticsRef.current ? gateDiagnosticsRef.current.gateSpacingPx.toFixed(1) : "—"}px · orientation start ${gateDiagnosticsRef.current ? gateDiagnosticsRef.current.startOrientationDeg.toFixed(2) : "—"}° finish ${gateDiagnosticsRef.current ? gateDiagnosticsRef.current.finishOrientationDeg.toFixed(2) : "—"}°`,
          `gate displacement start ${gateDiagnosticsRef.current ? gateDiagnosticsRef.current.startMidDisplacementPx.toFixed(2) : "—"}px finish ${gateDiagnosticsRef.current ? gateDiagnosticsRef.current.finishMidDisplacementPx.toFixed(2) : "—"}px · raw transform ${gateDiagnosticsRef.current?.rawTransform ?? "—"} · display ${gateDiagnosticsRef.current?.displayTransform ?? "—"} · rejected frame ${gateDiagnosticsRef.current?.rejectedTransformFrame ?? "none"}`,
          // Day 104 (Part 7) — raw vs rendered gate coordinates: proves the
          // full-height stationary display never moved the underlying
          // authoritative crossing geometry, only how far the line is drawn.
          `gate raw px: start ${gateDiagnosticsRef.current?.rawStartPx ? `${gateDiagnosticsRef.current.rawStartPx.x.toFixed(1)},${gateDiagnosticsRef.current.rawStartPx.y.toFixed(1)}` : "—"} finish ${gateDiagnosticsRef.current?.rawFinishPx ? `${gateDiagnosticsRef.current.rawFinishPx.x.toFixed(1)},${gateDiagnosticsRef.current.rawFinishPx.y.toFixed(1)}` : "—"}`,
          `gate rendered px: start ${gateDiagnosticsRef.current?.renderedStartPx ? `${gateDiagnosticsRef.current.renderedStartPx.x.toFixed(1)},${gateDiagnosticsRef.current.renderedStartPx.y.toFixed(1)}` : "—"} finish ${gateDiagnosticsRef.current?.renderedFinishPx ? `${gateDiagnosticsRef.current.renderedFinishPx.x.toFixed(1)},${gateDiagnosticsRef.current.renderedFinishPx.y.toFixed(1)}` : "—"} · stationary zone display ${!useCameraProjection}`,
        ];
        ctx.font = "600 10px ui-monospace, monospace";
        const panelW = Math.min(picture.width - 16, 520);
        ctx.fillStyle = "rgba(3,7,18,.82)"; ctx.fillRect(8, 28, panelW, lines.length * 15 + 12);
        ctx.fillStyle = "#e2e8f0";
        lines.forEach((line, i) => ctx.fillText(line, 14, 40 + i * 15));
      }

      if (debug) {
        const paintEndPerformanceMs = performance.now();
        const selectedPoseTimestampS = selection.frame.time;
        const signedDeltaS = currentTime - selectedPoseTimestampS;
        const sourceFrameEquivalentDelta = nativeFrameDurationS
          ? signedDeltaS / nativeFrameDurationS
          : null;
        const roundedFrameAge = sourceFrameEquivalentDelta == null
          ? null
          : Math.round(sourceFrameEquivalentDelta);
        const poseAgeClass = roundedFrameAge == null
          ? "UNKNOWN"
          : roundedFrameAge < 0
            ? "FUTURE_POSE"
            : roundedFrameAge === 0
              ? "EXACT"
              : roundedFrameAge === 1
                ? "ONE_FRAME_OLD"
                : roundedFrameAge === 2
                  ? "TWO_FRAMES_OLD"
                  : "THREE_PLUS_FRAMES_OLD";
        const follow = followStateRef?.current;
        debug.record({
          kind: "paint",
          browserEventOrCallbackType: lastBrowserEvent,
          stateProvenance: provenance,
          selectionMethod: provenance === "requestVideoFrameCallback"
            ? "nearest_pose_to_rvfc_media_time"
            : "nearest_pose_to_video_current_time_fallback",
          videoPaused: video.paused,
          videoSeeking: video.seeking,
          playbackRate: video.playbackRate,
          videoCurrentTimeS: video.currentTime,
          mediaTimeS: currentTime,
          presentedFrames: presentedFrameDebug?.presentedFrames ?? null,
          expectedDisplayTimeMs: presentedFrameDebug?.expectedDisplayTimeMs ?? null,
          presentationTimeMs: presentedFrameDebug?.presentationTimeMs ?? null,
          decodedWidth: presentedFrameDebug?.width ?? null,
          decodedHeight: presentedFrameDebug?.height ?? null,
          callbackNowMs: presentedFrameDebug?.callbackNowMs ?? null,
          callbackFiredPerformanceMs: presentedFrameDebug?.callbackFiredPerformanceMs ?? null,
          poseSelectionStartPerformanceMs,
          poseSelectionEndPerformanceMs,
          paintStartPerformanceMs,
          paintEndPerformanceMs,
          selectedPoseTimestampS,
          selectedPoseSourceFrameIndex: selection.frame.sourceFrameIndex ?? selection.frame.frame,
          selectedPoseArtifactFrameIndex: selection.frame.frame,
          selectedPoseArrayIndex: selection.index,
          previousAvailablePoseTimestampS: frames[selection.index - 1]?.time ?? null,
          nextAvailablePoseTimestampS: frames[selection.index + 1]?.time ?? null,
          signedMediaPoseDeltaS: signedDeltaS,
          absoluteMediaPoseDeltaS: Math.abs(signedDeltaS),
          sourceFrameEquivalentDelta,
          poseAgeClass,
          staleRejected: selection.stale,
          reactRenderVersion: reactRenderVersionRef.current,
          rafLoopId,
          rvfcGenerationId,
          rvfcRegistrationId: presentedFrameDebug?.registrationId ?? null,
          presentationCameraTimestampMs: follow?.cameraTimestampMs ?? null,
          presentationCameraSourceFrameIndex: follow?.cameraSourceFrameIndex ?? null,
          canvasCssWidth: picture.width,
          canvasCssHeight: picture.height,
          canvasBackingWidth: canvas.width,
          canvasBackingHeight: canvas.height,
          displayedFrameX: picture.x,
          displayedFrameY: picture.y,
          displayedFrameWidth: picture.width,
          displayedFrameHeight: picture.height,
          videoIntrinsicWidth: video.videoWidth,
          videoIntrinsicHeight: video.videoHeight,
          callbackToSelectionMs: presentedFrameDebug
            ? poseSelectionStartPerformanceMs - presentedFrameDebug.callbackFiredPerformanceMs
            : null,
          selectionToPaintEndMs: paintEndPerformanceMs - poseSelectionEndPerformanceMs,
          callbackToPaintEndMs: presentedFrameDebug
            ? paintEndPerformanceMs - presentedFrameDebug.callbackFiredPerformanceMs
            : null,
          paintEndToExpectedDisplayMs: presentedFrameDebug?.expectedDisplayTimeMs != null
            ? presentedFrameDebug.expectedDisplayTimeMs - paintEndPerformanceMs
            : null,
          gateDiagnostics: gateDiagnosticsRef.current,
        });
      }

    };

    // A video-frame callback is synchronized to the decoded frame actually
    // submitted for composition. `requestAnimationFrame` is only a display-paint
    // clock and can observe an advanced `currentTime` while the previous video
    // frame is still visible, which makes fast limbs appear one frame detached.
    // Keep rAF solely as the compatibility fallback for older browsers.
    let videoFrameCallbackId: number | null = null;
    let stopped = false;
    let presentedMediaTimeS = video.currentTime;
    let latestPresentedFrameDebug: PresentedFrameDebug | null = null;
    let presentationState = createOverlayPresentationState<PresentedFrameDebug>();
    invalidatePendingPresentation = (reason) => {
      presentationState = invalidateOverlayPresentation(presentationState);
      debug?.record({
        kind: "presentation_invalidation",
        reason,
        presentationGeneration: presentationState.generation,
        displayedMediaTimeS: presentationState.displayed?.mediaTimeS ?? presentedMediaTimeS,
      });
    };
    const promoteAtPresentationBoundary = (
      presentationClockMs: number,
      trigger: "requestVideoFrameCallback" | "requestAnimationFrame",
    ) => {
      const promotion = promoteOverlayPresentation(
        presentationState,
        presentationClockMs,
        OVERLAY_PRESENTATION_SUBMISSION_LEAD_MS,
      );
      presentationState = promotion.state;
      if (!promotion.promoted) return false;
      presentedMediaTimeS = promotion.promoted.mediaTimeS;
      latestPresentedFrameDebug = promotion.promoted.payload;
      debug?.record({
        kind: "presentation_promotion",
        trigger,
        registrationId: promotion.promoted.payload.registrationId,
        mediaTimeS: promotion.promoted.mediaTimeS,
        presentedFrames: promotion.promoted.presentedFrames,
        expectedDisplayTimeMs: promotion.promoted.expectedDisplayTimeMs,
        presentationClockMs,
        promotionRelativeToExpectedDisplayMs: presentationClockMs - promotion.promoted.expectedDisplayTimeMs,
        presentationGeneration: presentationState.generation,
      });
      return true;
    };
    const schedulePresentedFrame = () => {
      const registrationId = debug ? nextPlaybackSyncDebugId() : 0;
      const registrationGeneration = presentationState.generation;
      const registrationSource = video.currentSrc;
      debug?.record({ kind: "rvfc_registration", phase: "registered", rvfcGenerationId, registrationId });
      videoFrameCallbackId = video.requestVideoFrameCallback((now, metadata) => {
        const callbackFiredPerformanceMs = performance.now();
        const extendedMetadata = metadata as VideoFrameCallbackMetadata & { presentationTime?: number };
        debug?.record({
          kind: "rvfc_callback",
          phase: stopped ? "stale_after_cleanup" : "active",
          rvfcGenerationId,
          registrationId,
          callbackNowMs: now,
          callbackFiredPerformanceMs,
          mediaTimeS: metadata.mediaTime,
          presentedFrames: metadata.presentedFrames,
          expectedDisplayTimeMs: metadata.expectedDisplayTime,
          presentationTimeMs: extendedMetadata.presentationTime ?? null,
          width: metadata.width,
          height: metadata.height,
          videoCurrentTimeS: video.currentTime,
          videoPaused: video.paused,
          videoSeeking: video.seeking,
          playbackRate: video.playbackRate,
        });
        if (stopped) return;
        // A paused seek commonly reuses the already-registered callback. Once
        // seeking has settled, that callback's metadata describes the newly
        // decoded current frame and is authoritative even though the seek
        // advanced the generation. Never carry this exception across sources.
        const candidateGeneration = video.paused
          && !video.seeking
          && video.currentSrc === registrationSource
          ? presentationState.generation
          : registrationGeneration;
        const frameDebug: PresentedFrameDebug = {
          callbackNowMs: now,
          callbackFiredPerformanceMs,
          mediaTimeS: metadata.mediaTime,
          presentedFrames: metadata.presentedFrames,
          expectedDisplayTimeMs: metadata.expectedDisplayTime,
          presentationTimeMs: extendedMetadata.presentationTime ?? null,
          width: metadata.width,
          height: metadata.height,
          registrationId,
        };
        presentationState = enqueueOverlayPresentation(presentationState, {
          generation: candidateGeneration,
          mediaTimeS: metadata.mediaTime,
          expectedDisplayTimeMs: metadata.expectedDisplayTime,
          presentedFrames: metadata.presentedFrames,
          payload: frameDebug,
        }, callbackFiredPerformanceMs + OVERLAY_PRESENTATION_SUBMISSION_LEAD_MS);
        debug?.record({
          kind: "presentation_candidate",
          accepted: presentationState.pending?.payload === frameDebug,
          registrationGeneration,
          candidateGeneration,
          activeGeneration: presentationState.generation,
          registrationId,
          mediaTimeS: metadata.mediaTime,
          presentedFrames: metadata.presentedFrames,
          expectedDisplayTimeMs: metadata.expectedDisplayTime,
        });
        lastBrowserEvent = "requestVideoFrameCallback";
        // rAF callbacks registered by the continuous responsive-paint loop may
        // run before rVFC in the same rendering update. If this callback makes
        // the prior candidate eligible, submit that exact overlay now rather
        // than waiting a whole additional refresh. A future candidate is still
        // held; this path cannot paint before its metadata boundary.
        if (promoteAtPresentationBoundary(callbackFiredPerformanceMs, "requestVideoFrameCallback")) {
          draw(presentedMediaTimeS, "requestVideoFrameCallback", latestPresentedFrameDebug);
        }
        schedulePresentedFrame();
      });
    };
    if (typeof video.requestVideoFrameCallback === "function") {
      schedulePresentedFrame();
    }
    // Keep painting on rAF so paused resizes, hover state, and non-pose layers
    // remain responsive. With RVFC support the timestamp is the last frame the
    // browser reported as presented; only the compatibility path samples the
    // less precise playhead clock.
    const drawPaint = (animationFrameTimeMs: number) => {
      const hasRvfc = typeof video.requestVideoFrameCallback === "function";
      if (hasRvfc) {
        promoteAtPresentationBoundary(animationFrameTimeMs, "requestAnimationFrame");
      }
      draw(
        hasRvfc ? presentedMediaTimeS : video.currentTime,
        hasRvfc ? "requestVideoFrameCallback" : "requestAnimationFrame_fallback",
        hasRvfc ? latestPresentedFrameDebug : null,
      );
      animationRef.current = requestAnimationFrame(drawPaint);
    };
    animationRef.current = requestAnimationFrame(drawPaint);

    return () => {
      stopped = true;
      invalidatePendingPresentation("effect_cleanup");
      debug?.record({
        kind: "effect",
        phase: "cleanup",
        reactRenderVersion: reactRenderVersionRef.current,
        rafLoopId,
        rvfcGenerationId,
        lastVideoFrameCallbackId: videoFrameCallbackId,
        lastAnimationFrameId: animationRef.current,
      });
      debug?.record({ kind: "raf_loop", phase: "cleanup", rafLoopId, rvfcGenerationId });
      tracedVideoEvents.forEach((eventName) => video.removeEventListener(eventName, recordVideoEvent));
      if (videoFrameCallbackId != null && typeof video.cancelVideoFrameCallback === "function") {
        video.cancelVideoFrameCallback(videoFrameCallbackId);
      }
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [
    videoRef,
    frames,
    stepScale,
    authoritativeSteps,
    authoritativeContacts,
    cameraEvidence,
    cameraPath,
    recordingMode,
    calibrationCameraType,
    sourceWidth,
    sourceHeight,
    athleteHeightCm,
    autoFollow,
    followStateRef,
    sessionId,
    analysisId,
    sourceVideo,
    sourceFps,
    sourceFpsClassification,
    zoneCoverage,
    nativeFrameDurationS,
  ]);

  // Position/size are driven imperatively in the draw loop so the canvas covers
  // exactly the displayed picture (letterbox-aware); left/top default to 0.
  //
  // Phase R0-C: a dev-only, visually invisible build-identity marker (a plain
  // DOM data attribute, never rendered/painted) so a live browser check can
  // prove which VideoOverlay implementation is actually mounted, distinct
  // from trusting a filename/import-graph read alone. Not consumer-visible.
  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute left-0 top-0"
      data-ava-overlay-build="phase-r0-r2-live-ui-reconciliation"
    />
  );
}
