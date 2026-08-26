"use client";

import {
  forwardRef,
  useActionState,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { OverlayFrame } from "@/lib/video/overlay";
import { getDisplayedVideoRect, projectLandmark, type Point2D } from "@/lib/video/coordinates";
import { hasRenderablePoseData } from "@/lib/video/overlayAvailability";
import {
  DEFAULT_OVERLAY_VISIBILITY,
  availableOverlayDefinitions,
  effectiveOverlayVisibility,
  overlayAvailability,
  toggleOverlayVisibility,
  type OverlayCategory,
  type OverlayEvidence,
  type OverlayId,
  type OverlayPresentationMode,
  type OverlayVisibility,
} from "@/lib/video/worldVisualization";
import {
  IDENTITY_FOLLOW,
  followTransform,
  followsDiffer,
  type FollowBox,
} from "@/lib/video/follow";
import {
  buildPresentationCameraPath,
  FULL_FRAME_PRESENTATION_CAMERA,
  type PresentationCameraState,
} from "@/lib/video/presentationCamera";
import { indexCameraFramePaths } from "@/lib/video/cameraPath";
import {
  buildDisplayStabilizationPath,
  stabilizationCorrection,
  stabilizationDiffers,
  stabilizationTransform,
  IDENTITY_SIMILARITY,
  type DisplayStabilizationPathEntry,
  type SimilarityTransform,
} from "@/lib/video/displayStabilization";
import VideoOverlay, {
  type OverlayToggles,
  type OverlayCalibrationPoints,
  type PendingCone,
} from "./VideoOverlay";
import type { StepDistanceScale, StepMark } from "@/lib/video/steps";
import { useRouter } from "next/navigation";
import type { CalibrationGates } from "@/lib/calibration/gates";
import type { SaveGateResult } from "@/app/sessions/actions";
import type { TrochanterMarker } from "@/lib/video/overlayAlignment";
import {
  recordingModeUsesCameraProjection,
  type RawCameraEvidence,
  type RecordingMode,
} from "@/lib/video/recordingMode";
import type { CameraPathArtifact } from "@/lib/video/cameraPathSchema";
import type { ZoneCoverage, ZoneStep } from "@/lib/benchmark/measurements";
import { sourcePlaybackStartSeconds } from "@/lib/video/sourcePlaybackStart";
import {
  MAX_SAFE_ANCHOR_RESIDUAL_PX,
  MIN_SAFE_ANCHOR_FEATURES,
  MIN_SAFE_ANCHOR_TRANSFORM_CONFIDENCE,
  sourcePointToCompensated,
} from "@/lib/calibration/zoneAnchors";

/**
 * Optional timing-gate calibration wiring for the single-player surface (Day 66):
 * the coach marks two timing-gate BARS (each two cones, cone-to-cone across the
 * lane) a known distance apart, setting a high-confidence scale AND the timing
 * zone. The server actions persist / clear those gates for the session.
 */
export type SurfaceCalibration = {
  sessionId: string;
  /** Saved timing-gate bars (Day 66), for rendering the bars. */
  savedGates: CalibrationGates | null;
  /** Legacy two-point calibration (pre-Day-66), still rendered for old sessions. */
  saved: OverlayCalibrationPoints | null;
  onSave: (formData: FormData) => void | Promise<void>;
  /** Structured save (Part 1 §1) enabling inline Saving / Confirmed / Failed / Conflict states. */
  onSaveAction?: (prev: SaveGateResult | null, formData: FormData) => Promise<SaveGateResult>;
  onClear: (formData: FormData) => void | Promise<void>;
  /** Recompute the zone-derived metrics from the saved gates (no worker rerun). */
  onRecompute: (formData: FormData) => void | Promise<void>;
  trochanter?: TrochanterMarker | null;
  athleteHeightCm?: number | null;
  onSaveTrochanter?: (formData: FormData) => void | Promise<void>;
  onClearTrochanter?: (formData: FormData) => void | Promise<void>;
};

/** Playback rates offered by the shared controls. 0.1× is included for slow-motion
 *  frame-by-frame review (browsers clamp playbackRate ~0.0625 min, so 0.1 is safe). */
export const SPEEDS = [0.1, 0.25, 0.5, 1, 2] as const;

const GROUP_LABELS: Record<OverlayCategory, string> = {
  athlete: "Athlete",
  performance: "Performance",
  course: "Course",
  developer: "Developer",
};

/** Pointer-to-joint hit radius, in CSS pixels. */
const HIT_RADIUS = 16;

/**
 * Index of the last frame at or before `time`. Binary search over the ascending
 * `frame.time` values; times before the first frame return 0.
 */
export function frameIndexForTime(frames: OverlayFrame[], time: number) {
  let lo = 0;
  let hi = frames.length - 1;
  let idx = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].time <= time) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return idx;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Phase 8.2B — display-time interpolation of the already-resolved Auto
 * Follow camera path (`buildPresentationCameraPath`'s output). The prior
 * behavior (`resolvedCameraPath[frameIndexForTime(frames, presentedTime)]`)
 * snapped to whichever real source-frame camera state was last resolved
 * at-or-before `presentedTime`; at high source FPS relative to display
 * refresh, several valid fine-grained states fall between two display
 * repaints and were being skipped entirely (Phase 8.2A: `DISPLAY_REFRESH_COALESCING`).
 *
 * This does NOT recompute or resample the state machine (`presentationCamera.ts`
 * is untouched) — it reconstructs the already-computed continuous trajectory
 * at the exact presentation time by linearly interpolating between the two
 * resolved samples bracketing it. `path[i]` and `frames[i].time` are index-
 * aligned 1:1 (`buildPresentationCameraPath` maps over `frames` in place).
 *
 * No state-transition guard is needed: `stepPresentationCamera` integrates
 * cx/cy/scale continuously from `previous.cx/cy/scale` in every branch
 * (following/anticipating/holding/degraded/reacquiring/returning_to_full_frame) —
 * `directSelection` (the only snap) is used exclusively at index 0 of the
 * resolved path, never between two already-resolved adjacent samples. So the
 * resolved path itself has no internal discontinuity to guard against.
 *
 * No re-clamp is needed either: `clampFollow`'s valid region
 * `{cx : 0.5/scale <= cx <= 1-0.5/scale}` is convex in `(cx-0.5, scale)`
 * space (the boundary `scale >= 1/(1-2|cx-0.5|)` is a convex epigraph, same
 * for cy), so linearly interpolating between two already-valid clamped
 * states can never produce an out-of-bounds intermediate state.
 *
 * `scale` is interpolated linearly, not geometrically/log-space: the maximum
 * possible per-bracket scale change is bounded by
 * `maximumScaleVelocity * frameDt <= 0.3 * (1/56.5) ~= 0.005` (using the
 * slowest real benchmark's own native FPS, which produces the LARGEST
 * per-bracket dt), making the linear-vs-geometric interpolation error
 * second-order negligible (`O(relativeStep^2) ~= 3e-5`) at this magnitude.
 */
export function resolveDisplayCameraState(
  path: readonly PresentationCameraState[],
  frames: readonly OverlayFrame[],
  presentedTime: number,
  indexA: number,
): PresentationCameraState {
  const stateA = path[indexA];
  const indexB = Math.min(indexA + 1, path.length - 1);
  if (indexB === indexA) return stateA;
  const stateB = path[indexB];
  const tA = frames[indexA].time;
  const tB = frames[indexB].time;
  const span = tB - tA;
  if (!(span > 0)) return stateA; // duplicate/non-increasing timestamps: fail safe to A
  const alpha = Number.isFinite(presentedTime) ? Math.min(1, Math.max(0, (presentedTime - tA) / span)) : 0;
  if (alpha === 0) return stateA;
  return {
    ...stateA,
    cx: lerp(stateA.cx, stateB.cx, alpha),
    cy: lerp(stateA.cy, stateB.cy, alpha),
    scale: lerp(stateA.scale, stateB.scale, alpha),
    targetCenterSourceX: lerp(stateA.targetCenterSourceX, stateB.targetCenterSourceX, alpha),
    targetCenterSourceY: lerp(stateA.targetCenterSourceY, stateB.targetCenterSourceY, alpha),
    targetScale: lerp(stateA.targetScale, stateB.targetScale, alpha),
    timestampMs: presentedTime * 1000,
  };
}

/** True when focus is on an element that should own keyboard keys itself. */
export function isInteractiveTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "VIDEO"].includes(el.tagName) || el.isContentEditable
  );
}

/** Live playback state a surface reports up to whichever controls drive it. */
export type SurfaceState = {
  currentTime: number;
  isPlaying: boolean;
  speed: number;
  sourcePlaybackStartSeconds: number;
  duration: number;
};

/** Imperative controls a parent uses to drive one surface. */
export type OverlaySurfaceHandle = {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  stepTo: (index: number) => void;
  stepBy: (delta: number) => void;
  setSpeed: (rate: number) => void;
};

type Props = {
  videoUrl: string;
  /** Stable source identity; unlike a signed URL, this does not change when the
   * same session is refreshed after an analysis/artifact update. */
  sourceIdentity?: string;
  frames: OverlayFrame[];
  /** Optional heading (e.g. "Athlete A") shown above the video. */
  label?: string;
  /** Rendered between the video and the overlay toggles (single-player controls). */
  controlsSlot?: ReactNode;
  /** Extra layer(s) rendered inside the video container, above the pose overlay
   * (e.g. the telestration canvas). Absolutely positioned by the child. */
  overlaySlot?: ReactNode;
  /** Called whenever the underlying video clock/state changes. */
  onState?: (state: SurfaceState) => void;
  /** Calibration scale for step distances (metres); null → relative labels. */
  stepScale?: StepDistanceScale | null;
  /** Phase 8.0B — the authoritative individual-step model (same source as the
   *  Average/Peak Step Length cards); forwarded to VideoOverlay unchanged. */
  authoritativeSteps?: ZoneStep[] | null;
  /** Phase R1C — the authoritative full-run contact list; forwarded to
   *  VideoOverlay unchanged so it can render contact markers/dots directly
   *  from it instead of independently re-detecting them. */
  authoritativeContacts?: StepMark[] | null;
  /** Step frequency (steps/s) from verified contacts, for the legend readout. */
  stepCadenceHz?: number | null;
  /** Number of detected ground contacts, shown alongside the cadence. */
  stepContactCount?: number;
  /** Enables click-to-set manual ground calibration on this surface. */
  calibration?: SurfaceCalibration;
  /** Whether in-overlay gate/trochanter EDITING is offered. The MVP calibration authority
   *  is the Timing Workspace, so the Analysis-page overlay is read-only (default false):
   *  gates/contacts still render, but no placement controls appear here. */
  allowCalibrationEditing?: boolean;
  cameraEvidence?: RawCameraEvidence;
  cameraPath?: CameraPathArtifact;
  recordingMode?: RecordingMode;
  calibrationCameraType?: "stationary" | "panning";
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  zoneCoverage?: ZoneCoverage | null;
  analysisId?: string | null;
  sourceVideo?: string;
  sourceFps?: number | null;
  sourceFpsClassification?: string | null;
};

/** Clamp to the normalized [0,1] range landmarks/calibration points live in. */
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * One interactive overlay view: a video, its pose overlay, per-side layer
 * toggles, and the joint inspector. Playback is driven imperatively (via the
 * forwarded {@link OverlaySurfaceHandle}) so a single player or the comparison
 * player can share one set of transport controls across one or two surfaces.
 */
const OverlaySurface = forwardRef<OverlaySurfaceHandle, Props>(function OverlaySurface(
  {
    videoUrl,
    sourceIdentity = videoUrl,
    frames,
    label,
    controlsSlot,
    overlaySlot,
    onState,
    stepScale = null,
    authoritativeSteps = null,
    authoritativeContacts = null,
    stepCadenceHz = null,
    stepContactCount = 0,
    calibration,
    allowCalibrationEditing = false,
    cameraEvidence,
    cameraPath,
    recordingMode,
    calibrationCameraType,
    sourceWidth,
    sourceHeight,
    zoneCoverage = null,
    analysisId = null,
    sourceVideo = "unknown",
    sourceFps = null,
    sourceFpsClassification = null,
  },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // A server refresh may mint a different signed URL for the same source. Keep
  // the already-loaded URL so artifact/analysis refreshes cannot reload the
  // element and implicitly discard an explicit user position.
  const stableSourceRef = useRef({ identity: sourceIdentity, url: videoUrl });
  if (stableSourceRef.current.identity !== sourceIdentity) {
    stableSourceRef.current = { identity: sourceIdentity, url: videoUrl };
  }
  const containerRef = useRef<HTMLDivElement | null>(null);
  const followWrapperRef = useRef<HTMLDivElement | null>(null);
  // Phase 8.1B-2B: a SEPARATE wrapper OUTSIDE the Auto Follow wrapper, so a
  // small stabilization correction (expressed in source-normalized units)
  // scales correctly with whatever Auto Follow zoom is already applied
  // beneath it, and so the two remain fully independent (Part L) — this ref
  // is only ever written to when Stabilized View is on; RAW leaves it at
  // the untouched CSS default (no transform), byte-identical to pre-phase
  // markup.
  const stabilizationWrapperRef = useRef<HTMLDivElement | null>(null);
  const [toggles, setToggles] = useState<OverlayVisibility>(() => ({
    ...DEFAULT_OVERLAY_VISIBILITY,
  }));
  const [presentationMode, setPresentationMode] = useState<OverlayPresentationMode>("consumer");
  // A checked overlay checkbox must correspond to visible renderable data (Part 6,
  // Day 94 audit) — see `overlayAvailability.ts` for the (unit-tested) logic.
  const overlayEvidence: OverlayEvidence = {
    pose: hasRenderablePoseData(frames),
    contacts: stepContactCount > 0,
    center_of_mass: frames.some((frame) => frame.centerOfMass != null),
    velocity: frames.some((frame) => frame.velocity != null),
    world_gates: Boolean(calibration?.savedGates),
    tracking_box: false,
    crop_box: Boolean(cameraEvidence?.athleteTrack.some((frame) => frame.cropBox != null)),
    camera_motion: Boolean(cameraEvidence?.transforms.length),
    comparison_pose: frames.some((frame) => Boolean(frame.comparisonLandmarks)),
  };
  // What actually gets DRAWN — a checked toggle whose data is unavailable must
  // never render, so this (not the raw `toggles` state) is what's passed to the
  // rendering layer. `toggles` itself keeps the user's checked/unchecked intent,
  // so a layer reappears automatically if its data becomes available later.
  const effectiveToggles: OverlayToggles = effectiveOverlayVisibility(toggles, overlayEvidence);
  const [currentTime, setCurrentTime] = useState(0);
  const [hoveredJoint, setHoveredJoint] = useState<string | null>(null);
  const [autoFollow, setAutoFollow] = useState(false);
  // Phase 8.1B-2B: default ON. Unlike Auto Follow (a significant framing/zoom
  // change, kept opt-in per Phase 6.5), Stabilized View is a presentation-only,
  // sub-pixel-to-few-pixel correction with no framing change — closer in kind
  // to Phase 6.2's own always-on gate deadzone (which ships with no toggle at
  // all) than to Auto Follow. RAW remains one click away (Part O) for anyone
  // who wants to inspect the original, uncorrected camera motion.
  const [stabilizedView, setStabilizedView] = useState(true);
  const [layersOpen, setLayersOpen] = useState(true);
  // Gate calibration (Day 66): while `calibrationMode` is on, clicks drop cones
  // instead of selecting joints, in order [startC1, startC2, finishC1, finishC2].
  // `pendingCones` holds the 0–4 cones placed so far, normalized to the source
  // frame; each carries its clip time `t` for world-coordinate anchoring under pan.
  const [calibrationMode, setCalibrationMode] = useState(false);
  const [pendingCones, setPendingCones] = useState<PendingCone[]>([]);

  // Structured gate save (Part 1 §1/§2): drives inline Saving / Manual zone
  // confirmed / Save failed / Revision conflict states without relying on redirects.
  const router = useRouter();
  const [saveResult, saveDispatch, savePending] = useActionState<SaveGateResult | null, FormData>(
    calibration?.onSaveAction ?? (async () => null),
    null,
  );
  useEffect(() => {
    if (!saveResult) return;
    if (saveResult.ok) {
      // Confirmed: clear the local draft and hydrate the persisted canonical zone.
      setPendingCones([]);
      router.refresh();
    } else if (saveResult.status === "conflict") {
      // Load the latest canonical calibration; keep the draft cleared so the stale
      // edit is not re-submitted. The user edits again from the latest revision.
      setPendingCones([]);
      router.refresh();
    }
    // validation_error / error: keep the draft cones visible for retry.
  }, [saveResult, router]);
  const [trochanterMode, setTrochanterMode] = useState(false);
  const [pendingTrochanter, setPendingTrochanter] = useState<TrochanterMarker | null>(null);

  // Live copies for the rAF follow loop, so toggling/replaying doesn't restart it.
  const autoFollowRef = useRef(autoFollow);
  autoFollowRef.current = autoFollow;
  const stabilizedViewRef = useRef(stabilizedView);
  stabilizedViewRef.current = stabilizedView;
  const stabilizationRef = useRef<SimilarityTransform>(IDENTITY_SIMILARITY);
  // The current (smoothed) camera state; eased toward the per-frame target.
  const followRef = useRef<FollowBox>(IDENTITY_FOLLOW);
  const followStateRef = useRef<{
    current: FollowBox;
    target: FollowBox;
    cameraTimestampMs?: number;
    cameraSourceFrameIndex?: number | null;
  }>({
    current: IDENTITY_FOLLOW,
    target: IDENTITY_FOLLOW,
  });
  const presentedTimeRef = useRef(0);
  // One initialization per stable source identity. Artifact/analysis prop changes do
  // not reset this guard, and user playback is never continuously forced back.
  const initializedSourceRef = useRef<string | null>(null);
  const sourceStartRef = useRef(0);

  const onStateRef = useRef(onState);
  onStateRef.current = onState;

  // Push the element's clock/state into local state (overlay + inspector) and up
  // to the parent (shared controls readout).
  const syncFromVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    onStateRef.current?.({
      currentTime: video.currentTime,
      isPlaying: !video.paused,
      speed: video.playbackRate,
      sourcePlaybackStartSeconds: sourceStartRef.current,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
    });
  }, []);

  const initializeSourcePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video || initializedSourceRef.current === sourceIdentity) return;

    const sourceStart = sourcePlaybackStartSeconds(video.seekable);
    initializedSourceRef.current = sourceIdentity;
    sourceStartRef.current = sourceStart;
    if (Math.abs(video.currentTime - sourceStart) > Number.EPSILON) {
      video.currentTime = sourceStart;
    }
    syncFromVideo();
  }, [sourceIdentity, syncFromVideo]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handler = () => syncFromVideo();
    video.addEventListener("timeupdate", handler);
    video.addEventListener("play", handler);
    video.addEventListener("pause", handler);
    video.addEventListener("ratechange", handler);
    return () => {
      video.removeEventListener("timeupdate", handler);
      video.removeEventListener("play", handler);
      video.removeEventListener("pause", handler);
      video.removeEventListener("ratechange", handler);
    };
  }, [syncFromVideo]);

  // Phase 6.5 presentation camera: requestVideoFrameCallback supplies the same
  // authoritative presented-frame clock as the overlay. A paint loop applies one
  // shared transform to video + every canvas/DOM overlay; no scientific coordinate
  // reads this state. The path resolves once over every source pose timestamp,
  // so playback rate/display cadence cannot change its dynamics. The loop selects
  // that path by presented media time. It derives a torso/envelope target,
  // bounded source-time anticipation,
  // explicit hold/degraded/reacquisition behavior, and applies a
  // CSS transform to the wrapper holding BOTH the video and the pose canvas — so
  // the picture zooms/pans while the overlay stays aligned. When Auto Follow is
  // off it eases back to the identity transform. No effect on frames without pose.
  useEffect(() => {
    if (!frames.length) return;
    // Phase 8.1B-2B: resolved once over the complete source-time path, exactly
    // like `resolvedCameraPath` above (Part Q: so playback rate/scrub can
    // never change the dynamics). `getRawTransform` reads ONLY the existing,
    // already-validated `cameraPath` artifact's own `frameToGlobalMatrix` —
    // no new motion detection (Part B). Built unconditionally (mirrors
    // `resolvedCameraPath`'s own always-computed, then live-gated-in-tick
    // pattern below) so toggling Stabilized View never re-triggers this effect.
    const cameraPathIndex = cameraPath ? indexCameraFramePaths(cameraPath) : null;
    const width = sourceWidth ?? null;
    const height = sourceHeight ?? null;
    const getRawTransform = (sourceFrameIndex: number): SimilarityTransform | null => {
      if (!cameraPathIndex) return null;
      const framePath = cameraPathIndex.get(sourceFrameIndex);
      const m = framePath?.frameToGlobalMatrix;
      if (!m) return null;
      return { translationX: m.translationX, translationY: m.translationY, rotationDeg: m.rotationDeg, scale: m.scale };
    };
    const resolvedStabilizationPath: DisplayStabilizationPathEntry[] =
      cameraPathIndex && width && height
        ? buildDisplayStabilizationPath(
            frames.map((f) => ({ sourceFrameIndex: f.sourceFrameIndex ?? f.frame, timeS: f.time })),
            getRawTransform,
            width,
            height,
          )
        : [];
    // Two immutable presentation paths share the same verified athlete-box
    // observations. RAW preserves the established path exactly; Stabilized
    // solves the existing outer-wrapper composition for its crop centre, so
    // camera shake is not followed a second time. Keeping both paths avoids
    // re-integrating state when the view toggle changes.
    const resolvedCameraPath = buildPresentationCameraPath(frames);
    const resolvedStabilizedCameraPath =
      width && height
        ? buildPresentationCameraPath(frames, undefined, {
            corrections: resolvedStabilizationPath.map((entry) =>
              entry.raw ? stabilizationCorrection(entry.state, entry.raw, width, height) : null,
            ),
            sourceWidth: width,
            sourceHeight: height,
          })
        : resolvedCameraPath;
    let raf = 0;
    let videoFrameCallbackId: number | null = null;
    let stopped = false;
    const video = videoRef.current;
    if (!video) return;
    const schedulePresentedFrame = () => {
      videoFrameCallbackId = video.requestVideoFrameCallback((_now, metadata) => {
        if (stopped) return;
        presentedTimeRef.current = metadata.mediaTime;
        schedulePresentedFrame();
      });
    };
    if (typeof video.requestVideoFrameCallback === "function") schedulePresentedFrame();
    const tick = () => {
      const wrapper = followWrapperRef.current;
      const stabilizationWrapper = stabilizationWrapperRef.current;
      const video = videoRef.current;
      // Do not select against the pre-seek picture. Once seeking ends, the
      // authoritative path state at the selected source time is immediate.
      if (wrapper && video && !video.seeking) {
        const presentedTime =
          typeof video.requestVideoFrameCallback === "function"
            ? presentedTimeRef.current
            : video.currentTime;
        const frameIndex = frameIndexForTime(frames, presentedTime);
        const frame = frames[frameIndex];
        const camera =
          frame && autoFollowRef.current
            ? resolveDisplayCameraState(
                stabilizedViewRef.current ? resolvedStabilizedCameraPath : resolvedCameraPath,
                frames,
                presentedTime,
                frameIndex,
              )
            : {
                ...FULL_FRAME_PRESENTATION_CAMERA,
                timestampMs: presentedTime * 1000,
                sourceFrameIndex: frame?.sourceFrameIndex ?? frame?.frame ?? null,
              };
        const next: FollowBox = { cx: camera.cx, cy: camera.cy, scale: camera.scale };
        const target: FollowBox = {
          cx: camera.targetCenterSourceX,
          cy: camera.targetCenterSourceY,
          scale: camera.targetScale,
        };
        followStateRef.current = {
          current: next,
          target,
          cameraTimestampMs: camera.timestampMs,
          cameraSourceFrameIndex: camera.sourceFrameIndex,
        };
        wrapper.dataset.presentationCameraTimeMs = String(camera.timestampMs);
        wrapper.dataset.presentationCameraSourceFrame = String(camera.sourceFrameIndex ?? "");
        wrapper.dataset.presentationCameraState = camera.presentationState;
        wrapper.dataset.presentationCameraCenter = `${camera.cx.toFixed(6)},${camera.cy.toFixed(6)}`;
        wrapper.dataset.presentationCameraTarget = `${camera.targetCenterSourceX.toFixed(6)},${camera.targetCenterSourceY.toFixed(6)}`;
        wrapper.dataset.presentationCameraScale = camera.scale.toFixed(6);
        wrapper.dataset.presentationCameraProvenance = camera.provenance;
        const subjectBox = frame?.athleteBoundingBoxSource;
        wrapper.dataset.presentationSubjectCenter = subjectBox
          ? `${((subjectBox.x0 + subjectBox.x1) / 2).toFixed(6)},${((subjectBox.y0 + subjectBox.y1) / 2).toFixed(6)}`
          : "";
        if (followsDiffer(followRef.current, next)) {
          followRef.current = next;
          wrapper.style.transform = followTransform(next);
        }

        // Phase 8.1B-2B: RAW leaves this wrapper's transform at the untouched
        // CSS default (identity) — byte-identical to pre-phase behavior
        // (Part A/V#1). Stabilized reads the SAME frameIndex already resolved
        // above, so it is always evaluated at the exact source time the rest
        // of this tick uses.
        if (stabilizationWrapper) {
          const entry = resolvedStabilizationPath[frameIndex];
          const correction =
            stabilizedViewRef.current && entry?.raw
              ? stabilizationCorrection(entry.state, entry.raw, width ?? 1, height ?? 1)
              : IDENTITY_SIMILARITY;
          stabilizationWrapper.dataset.stabilizationMotionClass = entry?.state.motionClass ?? "stable";
          stabilizationWrapper.dataset.stabilizationDivergencePx = String(entry?.state.divergencePx ?? 0);
          stabilizationWrapper.dataset.stabilizationScale = correction.scale.toFixed(6);
          if (stabilizationDiffers(stabilizationRef.current, correction)) {
            stabilizationRef.current = correction;
            stabilizationWrapper.style.transform = stabilizationTransform(correction);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      if (videoFrameCallbackId != null && typeof video.cancelVideoFrameCallback === "function") {
        video.cancelVideoFrameCallback(videoFrameCallbackId);
      }
    };
  }, [frames, cameraPath, sourceWidth, sourceHeight]);

  useImperativeHandle(
    ref,
    () => ({
      play: () => {
        const video = videoRef.current;
        if (video) void video.play().catch(() => {});
      },
      pause: () => videoRef.current?.pause(),
      togglePlay: () => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) void video.play().catch(() => {});
        else video.pause();
      },
      seek: (time: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = time;
        syncFromVideo();
      },
      stepTo: (index: number) => {
        const video = videoRef.current;
        if (!video || !frames.length) return;
        const clamped = Math.max(0, Math.min(frames.length - 1, index));
        video.pause();
        video.currentTime = frames[clamped].time;
        syncFromVideo();
      },
      stepBy: (delta: number) => {
        const video = videoRef.current;
        if (!video || !frames.length) return;
        const clamped = Math.max(
          0,
          Math.min(frames.length - 1, frameIndexForTime(frames, video.currentTime) + delta),
        );
        video.pause();
        video.currentTime = frames[clamped].time;
        syncFromVideo();
      },
      setSpeed: (rate: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.playbackRate = rate;
        syncFromVideo();
      },
    }),
    [frames, syncFromVideo],
  );

  const hasFrames = frames.length > 0;
  const currentIndex = hasFrames ? frameIndexForTime(frames, currentTime) : 0;
  const currentFrame = frames[currentIndex];
  const currentSourceFrame = currentFrame?.sourceFrameIndex ?? currentFrame?.frame ?? currentIndex;
  const currentCameraTransform = cameraEvidence?.transforms.find(
    (item) => item.frame === currentSourceFrame,
  );
  const useCalibrationCameraProjection = calibrationCameraType
    ? calibrationCameraType === "panning"
    : recordingModeUsesCameraProjection(recordingMode);
  const currentAnchorUnsafe =
    useCalibrationCameraProjection &&
    !!cameraEvidence &&
    !!currentCameraTransform &&
    (currentCameraTransform.confidence < MIN_SAFE_ANCHOR_TRANSFORM_CONFIDENCE ||
      currentCameraTransform.supportingFeatureCount < MIN_SAFE_ANCHOR_FEATURES ||
      currentCameraTransform.residualPx == null ||
      currentCameraTransform.residualPx > MAX_SAFE_ANCHOR_RESIDUAL_PX);

  // Nearest joint within HIT_RADIUS of the pointer. Uses the same picture-rect
  // projection as the overlay renderer so hovering and drawing stay in lockstep,
  // including when the video letterboxes.
  const jointAtPointer = (clientX: number, clientY: number): string | null => {
    const video = videoRef.current;
    if (!video || !currentFrame) return null;

    const videoRect = video.getBoundingClientRect();
    const picture = getDisplayedVideoRect(video);
    // `getBoundingClientRect` reflects the Auto-Follow transform (scale/pan) while
    // `getDisplayedVideoRect` (clientWidth-based) does not. Normalizing the pointer
    // across the on-screen rect, then mapping into the untransformed picture, keeps
    // hit-testing correct at any zoom — with no transform the two rects coincide.
    const fx = videoRect.width ? (clientX - videoRect.left) / videoRect.width : 0;
    const fy = videoRect.height ? (clientY - videoRect.top) / videoRect.height : 0;
    const px = fx * video.clientWidth - picture.x;
    const py = fy * video.clientHeight - picture.y;

    const rect = { x: 0, y: 0, width: picture.width, height: picture.height };

    let best: string | null = null;
    let bestDist = HIT_RADIUS;
    for (const [name, point] of Object.entries(currentFrame.landmarks)) {
      if (!point) continue;
      const projected = projectLandmark(point, rect, video.videoWidth, video.videoHeight);
      const dist = Math.hypot(px - projected.x, py - projected.y);
      if (dist <= bestDist) {
        bestDist = dist;
        best = name;
      }
    }
    return best;
  };

  // Inverse of the overlay projection: a screen click → normalized [0,1] source
  // coordinate. Uses the same picture-rect + follow-transform math as
  // `jointAtPointer`, so a clicked ground point lands exactly where the overlay
  // would draw that coordinate — the calibration points stay glued to the ground.
  const groundPointAtPointer = (clientX: number, clientY: number): Point2D | null => {
    const video = videoRef.current;
    if (!video) return null;
    const videoRect = video.getBoundingClientRect();
    const picture = getDisplayedVideoRect(video);
    if (picture.width <= 0 || picture.height <= 0) return null;
    const fx = videoRect.width ? (clientX - videoRect.left) / videoRect.width : 0;
    const fy = videoRect.height ? (clientY - videoRect.top) / videoRect.height : 0;
    const px = fx * video.clientWidth - picture.x;
    const py = fy * video.clientHeight - picture.y;
    return { x: clamp01(px / picture.width), y: clamp01(py / picture.height) };
  };

  const handlePointerMove = (event: React.MouseEvent) => {
    if (calibrationMode || trochanterMode) return;
    const hit = jointAtPointer(event.clientX, event.clientY);
    setHoveredJoint((prev) => (prev === hit ? prev : hit));
  };

  // In calibration mode a click drops a ground point (cone by cone). Outside
  // calibration mode clicks do nothing (the joint inspector was removed).
  const handlePointerClick = (event: React.MouseEvent) => {
    if (trochanterMode) {
      const point = groundPointAtPointer(event.clientX, event.clientY);
      if (point) setPendingTrochanter({ ...point, timeS: videoRef.current?.currentTime ?? 0 });
      return;
    }
    if (!calibrationMode) return;
    const point = groundPointAtPointer(event.clientX, event.clientY);
    if (!point) return;
    const cone: PendingCone = {
      ...point,
      t: videoRef.current?.currentTime ?? 0,
      sourceFrameIndex: currentFrame?.sourceFrameIndex ?? currentFrame?.frame ?? currentIndex,
    };
    // Four cones make the two bars; a fifth click starts a fresh set.
    setPendingCones((prev) => (prev.length >= 4 ? [cone] : [...prev, cone]));
  };

  const toggleLayer = (key: OverlayId) => setToggles((prev) => toggleOverlayVisibility(prev, key));

  // Known gate distance to display, from the new gate bars or a legacy calibration.
  const savedDistanceM =
    calibration?.savedGates?.distanceM ?? calibration?.saved?.distanceM ?? null;
  const hasCalibration = !!(calibration?.savedGates || calibration?.saved);
  const compensatedPending = pendingCones.map((cone) =>
    useCalibrationCameraProjection && cameraEvidence && sourceWidth && sourceHeight
      ? sourcePointToCompensated(
          cone,
          cone.sourceFrameIndex,
          cameraEvidence,
          sourceWidth,
          sourceHeight,
        )
      : null,
  );

  return (
    <div className="space-y-3">
      {label && <h3 className="text-sm font-semibold text-[#b3bccb]">{label}</h3>}

      <div
        ref={containerRef}
        onMouseMove={handlePointerMove}
        onMouseLeave={() => setHoveredJoint(null)}
        onClick={handlePointerClick}
        className={`relative overflow-hidden rounded-xl border border-white/[0.08] bg-black ${
          calibrationMode || trochanterMode
            ? "cursor-crosshair"
            : hoveredJoint
              ? "cursor-pointer"
              : ""
        }`}
      >
        {/* Phase 8.1B-2B: Stabilized View wrapper — OUTSIDE (applied on top of)
            Auto Follow, so a small source-normalized correction scales
            correctly with whatever Auto Follow zoom is already applied
            beneath it (Part L). RAW leaves this at the untouched CSS default
            (no transform attribute at all), so RAW markup/behavior is
            byte-identical to pre-phase (Part A/V#1). */}
        <div ref={stabilizationWrapperRef} className="relative origin-top-left will-change-transform">
          {/* Auto-Follow transform target: the video and the pose overlay share this
              wrapper, so zoom/pan moves them together and the overlay stays aligned.
              The container's overflow-hidden clips whatever pans out of frame. */}
          <div ref={followWrapperRef} className="relative origin-top-left will-change-transform">
            <video
              ref={videoRef}
              src={stableSourceRef.current.url}
              preload="metadata"
              onLoadedMetadata={initializeSourcePlayback}
              // Native controls would pan out of reach while following; the shared
              // PlayerControls transport (rendered outside this wrapper) drives
              // playback in that mode. They're also hidden while calibrating so the
              // control bar doesn't swallow clicks meant to place ground points.
              controls={!autoFollow && !calibrationMode && !trochanterMode}
              playsInline
              className="block h-auto w-full object-contain object-center"
            />
            <VideoOverlay
              videoRef={videoRef}
              frames={frames}
              toggles={effectiveToggles}
              hoveredJoint={hoveredJoint}
              selectedJoint={null}
              stepScale={stepScale}
              authoritativeSteps={authoritativeSteps}
              authoritativeContacts={authoritativeContacts}
              calibrationPoints={calibration?.saved ?? null}
              calibrationGates={calibration?.savedGates ?? null}
              pendingGates={calibrationMode ? pendingCones : []}
              trochanterMarker={pendingTrochanter ?? calibration?.trochanter ?? null}
              athleteHeightCm={calibration?.athleteHeightCm ?? null}
              autoFollow={autoFollow}
              followStateRef={followStateRef}
              cameraEvidence={cameraEvidence}
              recordingMode={recordingMode}
              calibrationCameraType={calibrationCameraType}
              sourceWidth={sourceWidth}
              sourceHeight={sourceHeight}
              zoneCoverage={zoneCoverage}
              sessionId={calibration?.sessionId}
              analysisId={analysisId}
              sourceVideo={sourceVideo}
              sourceFps={sourceFps}
              sourceFpsClassification={sourceFpsClassification}
              cameraPath={cameraPath}
            />
            {overlaySlot}
          </div>
        </div>
      </div>

      {controlsSlot}

      {currentAnchorUnsafe && (
        <div className="rounded-lg border border-[#e46464]/35 bg-[#e46464]/10 px-3 py-2 text-xs text-[#e46464]">
          Boundary propagation is unsafe on source frame {currentSourceFrame}. Timing is withheld
          here; refine the anchor or review another frame.
        </div>
      )}
      {calibration?.saved && !calibration.savedGates && (
        <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
          This legacy calibration has no reference-frame geometry. Rerun the analysis and confirm
          the timing gates before displaying a world-locked zone.
        </div>
      )}

      {/* Single compact toolbar: camera behaviour + calibration entry (dark). */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-[#101827] p-2">
        <button
          type="button"
          onClick={() => {
            setAutoFollow((prev) => !prev);
          }}
          aria-pressed={autoFollow}
          title="Keep the athlete centered and zoomed during playback"
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            autoFollow
              ? "bg-[#2f80ed] text-white"
              : "border border-white/[0.1] bg-white/[0.04] text-[#b3bccb] hover:bg-white/[0.08]"
          }`}
        >
          {autoFollow ? "◉" : "○"} Auto Follow
        </button>

        <button
          type="button"
          onClick={() => {
            setStabilizedView((prev) => !prev);
          }}
          aria-pressed={stabilizedView}
          title="Smooth out small, real camera shake for calmer review — never hides real camera movement, only how it's displayed"
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            stabilizedView
              ? "bg-[#2f80ed] text-white"
              : "border border-white/[0.1] bg-white/[0.04] text-[#b3bccb] hover:bg-white/[0.08]"
          }`}
        >
          {stabilizedView ? "◉" : "○"} Stabilized View
        </button>

        {allowCalibrationEditing && calibration && (
          <button
            type="button"
            onClick={() => {
              setCalibrationMode((prev) => !prev);
              setPendingCones([]);
              setHoveredJoint(null);
            }}
            aria-pressed={calibrationMode}
            title="Mark two timing-gate bars (cone to cone) a known distance apart"
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              calibrationMode
                ? "bg-[#2f80ed] text-white"
                : "border border-white/[0.1] bg-white/[0.04] text-[#b3bccb] hover:bg-white/[0.08]"
            }`}
          >
            {calibrationMode ? "◉" : "○"} Calibrate gates
          </button>
        )}

        {allowCalibrationEditing && calibration?.onSaveTrochanter && (
          <button
            type="button"
            onClick={() => {
              setTrochanterMode((prev) => !prev);
              setCalibrationMode(false);
              setPendingTrochanter(null);
            }}
            aria-pressed={trochanterMode}
            title="Set an optional display-only anatomical alignment anchor"
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              trochanterMode
                ? "bg-[#2f80ed] text-white"
                : "border border-white/[0.1] bg-white/[0.04] text-[#b3bccb] hover:bg-white/[0.08]"
            }`}
          >
            {trochanterMode ? "◉" : "○"} Trochanter anchor
          </button>
        )}

        <button
          type="button"
          onClick={() => setLayersOpen((prev) => !prev)}
          aria-pressed={layersOpen}
          className="ml-auto rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-[#b3bccb] transition-colors hover:bg-white/[0.08]"
        >
          {layersOpen ? "▾" : "▸"} Layers
        </button>
        {process.env.NODE_ENV !== "production" && (
          <button
            type="button"
            onClick={() =>
              setPresentationMode((mode) => (mode === "consumer" ? "developer" : "consumer"))
            }
            aria-pressed={presentationMode === "developer"}
            className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-[#b3bccb] transition-colors hover:bg-white/[0.08]"
          >
            {presentationMode === "developer" ? "Developer overlays" : "Consumer overlays"}
          </button>
        )}
      </div>

      {calibration?.onSaveTrochanter && (trochanterMode || calibration.trochanter) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-[#101827] p-3 text-xs text-[#b3bccb]">
          <span>
            {pendingTrochanter
              ? `Anchor x ${pendingTrochanter.x.toFixed(3)}, y ${pendingTrochanter.y.toFixed(3)} at ${pendingTrochanter.timeS.toFixed(2)}s`
              : calibration.trochanter
                ? `Saved at ${calibration.trochanter.timeS.toFixed(2)}s`
                : "Pause on a clear frame, then click the athlete’s trochanter."}
          </span>
          {pendingTrochanter && (
            <form action={calibration.onSaveTrochanter} className="ml-auto">
              <input type="hidden" name="id" value={calibration.sessionId} />
              <input type="hidden" name="trochanter_x" value={pendingTrochanter.x} />
              <input type="hidden" name="trochanter_y" value={pendingTrochanter.y} />
              <input type="hidden" name="trochanter_time_s" value={pendingTrochanter.timeS} />
              <button
                type="submit"
                className="rounded-lg bg-[#2f80ed] px-3 py-1.5 font-semibold text-white"
              >
                Save anchor
              </button>
            </form>
          )}
          {calibration.trochanter && calibration.onClearTrochanter && (
            <form action={calibration.onClearTrochanter}>
              <input type="hidden" name="id" value={calibration.sessionId} />
              <button type="submit" className="rounded-lg border border-white/[0.1] px-3 py-1.5">
                Clear
              </button>
            </form>
          )}
        </div>
      )}

      {/* Layers panel: a vertical, scrollable list of toggles (checkbox style). */}
      {layersOpen && (
        <div className="rounded-xl border border-white/[0.06] bg-[#101827] p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#7e8797]">
            Overlay layers
          </p>
          <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
            {(["athlete", "performance", "course", "developer"] as const).map((category) => {
              const definitions = availableOverlayDefinitions(presentationMode).filter(
                (definition) => definition.category === category,
              );
              if (!definitions.length) return null;
              return (
                <fieldset key={category} className="space-y-1">
                  <legend className="px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7e8797]">
                    {GROUP_LABELS[category]}
                  </legend>
                  {definitions.map((definition) => {
                    const availability = overlayAvailability(definition, overlayEvidence);
                    const on = toggles[definition.id] && availability.available;
                    return (
                      <label
                        key={definition.id}
                        title={
                          availability.available ? definition.description : availability.reason
                        }
                        className={`flex min-h-10 items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors ${
                          availability.available
                            ? "cursor-pointer text-[#f5f7fb] hover:bg-white/[0.04]"
                            : "cursor-not-allowed opacity-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={!availability.available}
                          onChange={() => toggleLayer(definition.id)}
                          aria-describedby={`${definition.id}-availability`}
                          className="h-4 w-4 shrink-0 accent-[#2f80ed]"
                        />
                        <span className={on ? "text-[#f5f7fb]" : "text-[#b3bccb]"}>
                          {definition.displayName}
                          {!availability.available && (
                            <span
                              id={`${definition.id}-availability`}
                              className="ml-1 text-[11px] text-[#7e8797]"
                            >
                              — {availability.reason}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              );
            })}
          </div>
          <p className="mt-2 border-t border-white/[0.06] pt-2 text-[11px] text-[#7e8797]">
            Skeleton is drawn only at <span className="font-medium text-[#b3bccb]">0.25×</span> or
            paused for maximum visual accuracy.
          </p>
          {effectiveToggles.contacts && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[#7e8797]">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Left
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" /> Right
              </span>
              {stepCadenceHz != null && (
                <span>
                  · {stepCadenceHz.toFixed(2)} steps/s from {stepContactCount} contacts
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Calibration editing (Recompute / Remove / zone status) — Timing Workspace only. */}
      {allowCalibrationEditing && calibration && (
        <details
          className="group rounded-xl border border-white/[0.06] bg-[#101827]"
          open={calibrationMode}
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#b3bccb] [&::-webkit-details-marker]:hidden">
            <span className="inline-block text-[#7e8797] transition group-open:rotate-90">▸</span>
            Calibration
            <span className="font-normal normal-case text-[#7e8797]">
              {savedDistanceM != null
                ? `· ${savedDistanceM} m timing zone set`
                : "· distances are relative until set"}
            </span>
          </summary>

          <div className="space-y-3 border-t border-white/[0.06] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setCalibrationMode((prev) => !prev);
                  setPendingCones([]);
                  setHoveredJoint(null);
                }}
                aria-pressed={calibrationMode}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  calibrationMode
                    ? "bg-[#2f80ed] text-white"
                    : "border border-white/[0.1] bg-white/[0.04] text-[#b3bccb] hover:bg-white/[0.08]"
                }`}
              >
                {calibrationMode ? "◉" : "○"} Timing gates
              </button>
              {hasCalibration && (
                <div className="ml-auto flex items-center gap-2">
                  <form action={calibration.onRecompute}>
                    <input type="hidden" name="id" value={calibration.sessionId} />
                    <button
                      type="submit"
                      title="Recalculate the zone metrics from the saved gates using the existing pose — no re-upload"
                      className="rounded-lg bg-[#2f80ed] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#3b8eff]"
                    >
                      ↻ Recompute
                    </button>
                  </form>
                  <form
                    action={calibration.onClear}
                    onSubmit={() => {
                      setPendingCones([]);
                      setCalibrationMode(false);
                    }}
                  >
                    <input type="hidden" name="id" value={calibration.sessionId} />
                    <button
                      type="submit"
                      className="rounded-lg border border-[#e46464]/40 px-3 py-1.5 text-xs font-semibold text-[#e46464] transition hover:bg-[#e46464]/10"
                    >
                      ✕ Remove
                    </button>
                  </form>
                </div>
              )}
            </div>

            {calibrationMode && (
              <div className="rounded-lg border border-white/[0.06] bg-[#182233] p-3">
                <p className="text-xs text-[#b3bccb]">
                  Mark the <span className="font-semibold text-[#f5f7fb]">start gate</span>: click{" "}
                  <span className="font-semibold text-[#f5f7fb]">cone 1</span> then{" "}
                  <span className="font-semibold text-[#f5f7fb]">cone 2</span>. Scrub to the finish,
                  then mark the <span className="font-semibold text-[#f5f7fb]">finish gate</span>{" "}
                  the same way. Enter the known distance and save.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-[#7e8797]">
                  {(
                    [
                      ["Start · cone 1", 0],
                      ["Start · cone 2", 1],
                      ["Finish · cone 1", 2],
                      ["Finish · cone 2", 3],
                    ] as const
                  ).map(([coneLabel, i]) => (
                    <span key={coneLabel}>
                      {coneLabel}:{" "}
                      <span className="font-mono text-[#b3bccb]">
                        {pendingCones[i]
                          ? `x ${pendingCones[i].x.toFixed(3)} @ ${pendingCones[i].t.toFixed(2)}s`
                          : "— click to set"}
                      </span>
                    </span>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingCones([])}
                    className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs font-semibold text-[#b3bccb]"
                  >
                    {pendingCones.length >= 2 ? "Edit start" : "Set start"}
                  </button>
                  <button
                    type="button"
                    disabled={pendingCones.length < 2}
                    onClick={() => setPendingCones((previous) => previous.slice(0, 2))}
                    className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs font-semibold text-[#b3bccb] disabled:opacity-40"
                  >
                    {pendingCones.length >= 4 ? "Edit finish" : "Set finish"}
                  </button>
                  <span className="self-center text-[11px] text-[#7e8797]">
                    Preview is propagated with the production camera model; red dashed lines are
                    unsafe.
                  </span>
                </div>

                <form
                  action={calibration.onSaveAction ? saveDispatch : calibration.onSave}
                  className="mt-3 flex flex-wrap items-end gap-3"
                >
                  <input type="hidden" name="id" value={calibration.sessionId} />
                  {/* Optimistic-concurrency token: the revision this edit was based
                      on, so the server can reject a stale save (Part 1 §3). */}
                  <input
                    type="hidden"
                    name="expected_revision"
                    value={calibration.savedGates?.revision ?? calibration.savedGates?.version ?? 0}
                  />
                  <input type="hidden" name="gate_start_c1x" value={pendingCones[0]?.x ?? ""} />
                  <input type="hidden" name="gate_start_c1y" value={pendingCones[0]?.y ?? ""} />
                  <input type="hidden" name="gate_start_c2x" value={pendingCones[1]?.x ?? ""} />
                  <input type="hidden" name="gate_start_c2y" value={pendingCones[1]?.y ?? ""} />
                  <input type="hidden" name="gate_finish_c1x" value={pendingCones[2]?.x ?? ""} />
                  <input type="hidden" name="gate_finish_c1y" value={pendingCones[2]?.y ?? ""} />
                  <input type="hidden" name="gate_finish_c2x" value={pendingCones[3]?.x ?? ""} />
                  <input type="hidden" name="gate_finish_c2y" value={pendingCones[3]?.y ?? ""} />
                  <input type="hidden" name="gate_start_time_s" value={pendingCones[0]?.t ?? ""} />
                  <input type="hidden" name="gate_finish_time_s" value={pendingCones[2]?.t ?? ""} />
                  <input
                    type="hidden"
                    name="gate_start_frame"
                    value={pendingCones[0]?.sourceFrameIndex ?? ""}
                  />
                  <input
                    type="hidden"
                    name="gate_finish_frame"
                    value={pendingCones[2]?.sourceFrameIndex ?? ""}
                  />
                  <input type="hidden" name="gate_source_width" value={sourceWidth ?? ""} />
                  <input type="hidden" name="gate_source_height" value={sourceHeight ?? ""} />
                  {compensatedPending.map((point, index) => (
                    <span key={`compensated-${index}`}>
                      <input type="hidden" name={`gate_comp_${index}_x`} value={point?.x ?? ""} />
                      <input type="hidden" name={`gate_comp_${index}_y`} value={point?.y ?? ""} />
                    </span>
                  ))}
                  <div>
                    <label
                      htmlFor="calibration_known_distance_m"
                      className="block text-xs font-medium text-[#b3bccb]"
                    >
                      Known distance <span className="text-[#7e8797]">(m)</span>
                    </label>
                    <input
                      id="calibration_known_distance_m"
                      name="calibration_known_distance_m"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={0}
                      placeholder="e.g. 20"
                      className="mt-1 w-32 rounded-lg border border-white/[0.08] bg-[#081019] px-3 py-2 text-sm text-[#f5f7fb] placeholder:text-[#7e8797] focus:border-[#2f80ed]/50 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    data-testid="save-gates"
                    disabled={
                      pendingCones.length < 4 ||
                      !cameraEvidence ||
                      !sourceWidth ||
                      !sourceHeight ||
                      savePending
                    }
                    className="rounded-lg bg-[#2f80ed] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#3b8eff] disabled:opacity-50"
                  >
                    {savePending ? "Saving…" : "Save"}
                  </button>
                  {/* Inline save status (Part 1 §2). Draft cones stay visible on
                      failure; success/conflict re-hydrate the canonical zone. */}
                  {saveResult && (
                    <span
                      role="status"
                      data-testid="save-status"
                      data-save-status={saveResult.status}
                      className={`self-center text-[11px] font-semibold ${
                        saveResult.ok
                          ? "text-[#89d46a]"
                          : saveResult.status === "conflict"
                            ? "text-[#f5c451]"
                            : "text-[#e46464]"
                      }`}
                    >
                      {saveResult.ok
                        ? "Manual zone confirmed"
                        : saveResult.status === "conflict"
                          ? "This zone was updated elsewhere. AVA loaded the latest version."
                          : `Save failed${saveResult.message ? ` — ${saveResult.message}` : ""}`}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setPendingCones([])}
                    className="text-xs text-[#7e8797] hover:text-[#f5f7fb]"
                  >
                    Reset cones
                  </button>
                </form>
                {(!cameraEvidence || !sourceWidth || !sourceHeight) && (
                  <p className="mt-2 text-xs text-[#e46464]">
                    This artifact has no production camera-transform evidence. Rerun pose processing
                    before saving physical timing boundaries.
                  </p>
                )}
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
});

export default OverlaySurface;
