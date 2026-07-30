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
import {
  anticipateFollowTarget,
  IDENTITY_FOLLOW,
  computeFollowTarget,
  followTransform,
  followsDiffer,
  smoothFollowStable,
  type FollowBox,
} from "@/lib/video/follow";
import VideoOverlay, {
  type OverlayToggles,
  type OverlayCalibrationPoints,
  type PendingCone,
} from "./VideoOverlay";
import type { StepDistanceScale } from "@/lib/video/steps";
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

const DEFAULT_TOGGLES: OverlayToggles = {
  skeleton: true,
  angles: true,
  arms: true,
  comTrail: true,
  velocity: true,
  footLabels: true,
  stepMarks: true,
  compare: false,
  debug: false,
};

const TOGGLE_ITEMS: { key: keyof OverlayToggles; label: string }[] = [
  { key: "skeleton", label: "Skeleton" },
  { key: "angles", label: "Joint angles" },
  { key: "arms", label: "Arms" },
  { key: "comTrail", label: "COM trail" },
  { key: "velocity", label: "Velocity" },
  { key: "footLabels", label: "Foot labels" },
  { key: "stepMarks", label: "Step marks" },
  { key: "compare", label: "Compare RTMPose (dashed purple)" },
  ...(process.env.NODE_ENV !== "production"
    ? [{ key: "debug" as const, label: "Engineering: camera / crop / anchors" }]
    : []),
];

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

/** True when focus is on an element that should own keyboard keys itself. */
export function isInteractiveTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "VIDEO"].includes(el.tagName) || el.isContentEditable
  );
}

/** Live playback state a surface reports up to whichever controls drive it. */
export type SurfaceState = { currentTime: number; isPlaying: boolean; speed: number };

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
    frames,
    label,
    controlsSlot,
    overlaySlot,
    onState,
    stepScale = null,
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
  },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const followWrapperRef = useRef<HTMLDivElement | null>(null);
  const [toggles, setToggles] = useState<OverlayToggles>(DEFAULT_TOGGLES);
  const [currentTime, setCurrentTime] = useState(0);
  const [hoveredJoint, setHoveredJoint] = useState<string | null>(null);
  const [autoFollow, setAutoFollow] = useState(false);
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
  // The current (smoothed) camera state; eased toward the per-frame target.
  const followRef = useRef<FollowBox>(IDENTITY_FOLLOW);
  const followStateRef = useRef<{ current: FollowBox; target: FollowBox }>({
    current: IDENTITY_FOLLOW,
    target: IDENTITY_FOLLOW,
  });

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
    });
  }, []);

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

  // Auto Follow: a continuous rAF loop that keeps the athlete centred. It reads
  // the live video clock (so it stays smooth mid-playback, not just on timeupdate),
  // derives a per-frame target from the pose bbox, eases toward it, and applies a
  // CSS transform to the wrapper holding BOTH the video and the pose canvas — so
  // the picture zooms/pans while the overlay stays aligned. When Auto Follow is
  // off it eases back to the identity transform. No effect on frames without pose.
  useEffect(() => {
    if (!frames.length) return;
    let raf = 0;
    const tick = () => {
      const wrapper = followWrapperRef.current;
      const video = videoRef.current;
      if (wrapper && video) {
        let target: FollowBox = IDENTITY_FOLLOW;
        if (autoFollowRef.current) {
          const frame = frames[frameIndexForTime(frames, video.currentTime)];
          const futureFrame = frames[frameIndexForTime(frames, video.currentTime + 0.1)];
          // Coast on the last camera state when the frame is untrusted (too few
          // visible landmarks), avoiding a snap back to centre.
          const currentTarget = (frame && computeFollowTarget(frame)) ?? followRef.current;
          const futureTarget = futureFrame ? computeFollowTarget(futureFrame) : null;
          target = anticipateFollowTarget(currentTarget, futureTarget);
        }
        // Broadcast-style stabilization: dead-zone + damped vertical + separate,
        // deadbanded zoom so the viewport doesn't bounce or pulse each stride.
        // Playback uses broadcast-style easing. A paused/seeked frame is exact and
        // history-free so forward/back seeking always reproduces the same viewport;
        // canonical overlay geometry never depends on this display transform.
        const next = video.paused ? target : smoothFollowStable(followRef.current, target);
        followStateRef.current = { current: next, target };
        if (followsDiffer(followRef.current, next)) {
          followRef.current = next;
          wrapper.style.transform = followTransform(next);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frames]);

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
  const currentCameraTransform = cameraEvidence?.transforms.find((item) => item.frame === currentSourceFrame);
  const useCalibrationCameraProjection = calibrationCameraType
    ? calibrationCameraType === "panning"
    : recordingModeUsesCameraProjection(recordingMode);
  const currentAnchorUnsafe = useCalibrationCameraProjection
    && !!cameraEvidence && !!currentCameraTransform && (
    currentCameraTransform.confidence < MIN_SAFE_ANCHOR_TRANSFORM_CONFIDENCE
    || currentCameraTransform.supportingFeatureCount < MIN_SAFE_ANCHOR_FEATURES
    || currentCameraTransform.residualPx == null
    || currentCameraTransform.residualPx > MAX_SAFE_ANCHOR_RESIDUAL_PX
  );

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

  const toggleLayer = (key: keyof OverlayToggles) =>
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));

  // Known gate distance to display, from the new gate bars or a legacy calibration.
  const savedDistanceM =
    calibration?.savedGates?.distanceM ?? calibration?.saved?.distanceM ?? null;
  const hasCalibration = !!(calibration?.savedGates || calibration?.saved);
  const compensatedPending = pendingCones.map((cone) =>
    useCalibrationCameraProjection && cameraEvidence && sourceWidth && sourceHeight
      ? sourcePointToCompensated(cone, cone.sourceFrameIndex, cameraEvidence, sourceWidth, sourceHeight)
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
          calibrationMode || trochanterMode ? "cursor-crosshair" : hoveredJoint ? "cursor-pointer" : ""
        }`}
      >
        {/* Auto-Follow transform target: the video and the pose overlay share this
            wrapper, so zoom/pan moves them together and the overlay stays aligned.
            The container's overflow-hidden clips whatever pans out of frame. */}
        <div ref={followWrapperRef} className="relative origin-top-left will-change-transform">
          <video
            ref={videoRef}
            src={videoUrl}
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
            toggles={toggles}
            hoveredJoint={hoveredJoint}
            selectedJoint={null}
            stepScale={stepScale}
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
            sessionId={calibration?.sessionId}
            cameraPath={cameraPath}
          />
          {overlaySlot}
        </div>
      </div>

      {controlsSlot}

      {currentAnchorUnsafe && (
        <div className="rounded-lg border border-[#e46464]/35 bg-[#e46464]/10 px-3 py-2 text-xs text-[#e46464]">
          Boundary propagation is unsafe on source frame {currentSourceFrame}. Timing is withheld here; refine the anchor or review another frame.
        </div>
      )}
      {calibration?.saved && !calibration.savedGates && (
        <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
          This legacy calibration has no reference-frame geometry. Rerun the analysis and confirm the timing gates before displaying a world-locked zone.
        </div>
      )}

      {/* Single compact toolbar: camera behaviour + calibration entry (dark). */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-[#101827] p-2">
        <button
          type="button"
          onClick={() => setAutoFollow((prev) => !prev)}
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
              <button type="submit" className="rounded-lg bg-[#2f80ed] px-3 py-1.5 font-semibold text-white">Save anchor</button>
            </form>
          )}
          {calibration.trochanter && calibration.onClearTrochanter && (
            <form action={calibration.onClearTrochanter}>
              <input type="hidden" name="id" value={calibration.sessionId} />
              <button type="submit" className="rounded-lg border border-white/[0.1] px-3 py-1.5">Clear</button>
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
          <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {TOGGLE_ITEMS.map(({ key, label: toggleLabel }) => {
              const on = toggles[key];
              return (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-[#f5f7fb] transition-colors hover:bg-white/[0.04]"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleLayer(key)}
                    className="h-4 w-4 shrink-0 accent-[#2f80ed]"
                  />
                  <span className={on ? "text-[#f5f7fb]" : "text-[#b3bccb]"}>{toggleLabel}</span>
                </label>
              );
            })}
          </div>
          <p className="mt-2 border-t border-white/[0.06] pt-2 text-[11px] text-[#7e8797]">
            Skeleton is drawn only at <span className="font-medium text-[#b3bccb]">0.25×</span> or
            paused for maximum visual accuracy.
          </p>
          {toggles.stepMarks && (
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
                  <button type="button" onClick={() => setPendingCones([])}
                    className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs font-semibold text-[#b3bccb]">
                    {pendingCones.length >= 2 ? "Edit start" : "Set start"}
                  </button>
                  <button type="button" disabled={pendingCones.length < 2}
                    onClick={() => setPendingCones((previous) => previous.slice(0, 2))}
                    className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs font-semibold text-[#b3bccb] disabled:opacity-40">
                    {pendingCones.length >= 4 ? "Edit finish" : "Set finish"}
                  </button>
                  <span className="self-center text-[11px] text-[#7e8797]">
                    Preview is propagated with the production camera model; red dashed lines are unsafe.
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
                  <input type="hidden" name="gate_start_frame" value={pendingCones[0]?.sourceFrameIndex ?? ""} />
                  <input type="hidden" name="gate_finish_frame" value={pendingCones[2]?.sourceFrameIndex ?? ""} />
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
                      pendingCones.length < 4 || !cameraEvidence || !sourceWidth || !sourceHeight || savePending
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
                    This artifact has no production camera-transform evidence. Rerun pose processing before saving physical timing boundaries.
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
