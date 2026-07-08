"use client";

import {
  forwardRef,
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
import type { CalibrationGates } from "@/lib/calibration/gates";
import type { TrochanterMarker } from "@/lib/video/overlayAlignment";

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
  { key: "debug", label: "Alignment debug" },
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
        const next = smoothFollowStable(followRef.current, target);
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
    const cone: PendingCone = { ...point, t: videoRef.current?.currentTime ?? 0 };
    // Four cones make the two bars; a fifth click starts a fresh set.
    setPendingCones((prev) => (prev.length >= 4 ? [cone] : [...prev, cone]));
  };

  const toggleLayer = (key: keyof OverlayToggles) =>
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));

  // Known gate distance to display, from the new gate bars or a legacy calibration.
  const savedDistanceM =
    calibration?.savedGates?.distanceM ?? calibration?.saved?.distanceM ?? null;
  const hasCalibration = !!(calibration?.savedGates || calibration?.saved);

  return (
    <div className="space-y-3">
      {label && <h3 className="text-sm font-semibold text-[#A0A2A8]">{label}</h3>}

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
          />
          {overlaySlot}
        </div>
      </div>

      {controlsSlot}

      {/* Single compact toolbar: camera behaviour + calibration entry (dark). */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-[#121214] p-2">
        <button
          type="button"
          onClick={() => setAutoFollow((prev) => !prev)}
          aria-pressed={autoFollow}
          title="Keep the athlete centered and zoomed during playback"
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            autoFollow
              ? "bg-[#D72638] text-white"
              : "border border-white/[0.1] bg-white/[0.04] text-[#A0A2A8] hover:bg-white/[0.08]"
          }`}
        >
          {autoFollow ? "◉" : "○"} Auto Follow
        </button>

        {calibration && (
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
                ? "bg-[#D72638] text-white"
                : "border border-white/[0.1] bg-white/[0.04] text-[#A0A2A8] hover:bg-white/[0.08]"
            }`}
          >
            {calibrationMode ? "◉" : "○"} Calibrate gates
          </button>
        )}

        {calibration?.onSaveTrochanter && (
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
                ? "bg-[#D72638] text-white"
                : "border border-white/[0.1] bg-white/[0.04] text-[#A0A2A8] hover:bg-white/[0.08]"
            }`}
          >
            {trochanterMode ? "◉" : "○"} Trochanter anchor
          </button>
        )}

        <button
          type="button"
          onClick={() => setLayersOpen((prev) => !prev)}
          aria-pressed={layersOpen}
          className="ml-auto rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-[#A0A2A8] transition-colors hover:bg-white/[0.08]"
        >
          {layersOpen ? "▾" : "▸"} Layers
        </button>
      </div>

      {calibration?.onSaveTrochanter && (trochanterMode || calibration.trochanter) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-[#121214] p-3 text-xs text-[#A0A2A8]">
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
              <button type="submit" className="rounded-lg bg-[#D72638] px-3 py-1.5 font-semibold text-white">Save anchor</button>
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
        <div className="rounded-xl border border-white/[0.06] bg-[#121214] p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">
            Overlay layers
          </p>
          <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {TOGGLE_ITEMS.map(({ key, label: toggleLabel }) => {
              const on = toggles[key];
              return (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-[#F5F5F7] transition-colors hover:bg-white/[0.04]"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleLayer(key)}
                    className="h-4 w-4 shrink-0 accent-[#D72638]"
                  />
                  <span className={on ? "text-[#F5F5F7]" : "text-[#A0A2A8]"}>{toggleLabel}</span>
                </label>
              );
            })}
          </div>
          <p className="mt-2 border-t border-white/[0.06] pt-2 text-[11px] text-[#6B7280]">
            Skeleton is drawn only at <span className="font-medium text-[#A0A2A8]">0.25×</span> or
            paused for maximum visual accuracy.
          </p>
          {toggles.stepMarks && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[#6B7280]">
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

      {/* Calibration — collapsed by default (dark). */}
      {calibration && (
        <details
          className="group rounded-xl border border-white/[0.06] bg-[#121214]"
          open={calibrationMode}
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#A0A2A8] [&::-webkit-details-marker]:hidden">
            <span className="inline-block text-[#6B7280] transition group-open:rotate-90">▸</span>
            Calibration
            <span className="font-normal normal-case text-[#6B7280]">
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
                    ? "bg-[#D72638] text-white"
                    : "border border-white/[0.1] bg-white/[0.04] text-[#A0A2A8] hover:bg-white/[0.08]"
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
                      className="rounded-lg bg-[#D72638] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#e63a4b]"
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
                      className="rounded-lg border border-[#FF3B30]/40 px-3 py-1.5 text-xs font-semibold text-[#FF7A70] transition hover:bg-[#FF3B30]/10"
                    >
                      ✕ Remove
                    </button>
                  </form>
                </div>
              )}
            </div>

            {calibrationMode && (
              <div className="rounded-lg border border-white/[0.06] bg-[#19191C] p-3">
                <p className="text-xs text-[#A0A2A8]">
                  Mark the <span className="font-semibold text-[#F5F5F7]">start gate</span>: click{" "}
                  <span className="font-semibold text-[#F5F5F7]">cone 1</span> then{" "}
                  <span className="font-semibold text-[#F5F5F7]">cone 2</span>. Scrub to the finish,
                  then mark the <span className="font-semibold text-[#F5F5F7]">finish gate</span>{" "}
                  the same way. Enter the known distance and save.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-[#6B7280]">
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
                      <span className="font-mono text-[#A0A2A8]">
                        {pendingCones[i]
                          ? `x ${pendingCones[i].x.toFixed(3)} @ ${pendingCones[i].t.toFixed(2)}s`
                          : "— click to set"}
                      </span>
                    </span>
                  ))}
                </div>

                <form action={calibration.onSave} className="mt-3 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="id" value={calibration.sessionId} />
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
                  <div>
                    <label
                      htmlFor="calibration_known_distance_m"
                      className="block text-xs font-medium text-[#A0A2A8]"
                    >
                      Known distance <span className="text-[#6B7280]">(m)</span>
                    </label>
                    <input
                      id="calibration_known_distance_m"
                      name="calibration_known_distance_m"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={0}
                      placeholder="e.g. 20"
                      className="mt-1 w-32 rounded-lg border border-white/[0.08] bg-[#0d0d0f] px-3 py-2 text-sm text-[#F5F5F7] placeholder:text-[#6B7280] focus:border-[#D72638]/50 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={pendingCones.length < 4}
                    className="rounded-lg bg-[#D72638] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#e63a4b] disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingCones([])}
                    className="text-xs text-[#6B7280] hover:text-[#F5F5F7]"
                  >
                    Reset cones
                  </button>
                </form>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
});

export default OverlaySurface;
