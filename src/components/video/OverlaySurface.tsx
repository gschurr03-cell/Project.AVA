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
};

/** Playback rates offered by the shared controls. */
export const SPEEDS = [0.25, 0.5, 1, 2] as const;

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
];

/** Pointer-to-joint hit radius, in CSS pixels. */
const HIT_RADIUS = 16;

/** "leftFootIndex" → "Left Foot Index" for the inspector label. */
function prettyJoint(name: string) {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

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
  const [selectedJoint, setSelectedJoint] = useState<string | null>(null);
  const [autoFollow, setAutoFollow] = useState(false);
  // Gate calibration (Day 66): while `calibrationMode` is on, clicks drop cones
  // instead of selecting joints, in order [startC1, startC2, finishC1, finishC2].
  // `pendingCones` holds the 0–4 cones placed so far, normalized to the source
  // frame; each carries its clip time `t` for world-coordinate anchoring under pan.
  const [calibrationMode, setCalibrationMode] = useState(false);
  const [pendingCones, setPendingCones] = useState<PendingCone[]>([]);

  // Live copies for the rAF follow loop, so toggling/replaying doesn't restart it.
  const autoFollowRef = useRef(autoFollow);
  autoFollowRef.current = autoFollow;
  // The current (smoothed) camera state; eased toward the per-frame target.
  const followRef = useRef<FollowBox>(IDENTITY_FOLLOW);

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
          // Coast on the last camera state when the frame is untrusted (too few
          // visible landmarks), avoiding a snap back to centre.
          target = (frame && computeFollowTarget(frame)) ?? followRef.current;
        }
        // Broadcast-style stabilization: dead-zone + damped vertical + separate,
        // deadbanded zoom so the viewport doesn't bounce or pulse each stride.
        const next = smoothFollowStable(followRef.current, target);
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
    if (calibrationMode) return; // no joint hover while marking ground points
    const hit = jointAtPointer(event.clientX, event.clientY);
    setHoveredJoint((prev) => (prev === hit ? prev : hit));
  };

  // In calibration mode a click drops a ground point (A, then B; a third click
  // starts a new pair). Otherwise: click a joint to pin it, click it again to
  // unpin; clicks that miss every joint leave selection alone.
  const handlePointerClick = (event: React.MouseEvent) => {
    if (calibrationMode) {
      const point = groundPointAtPointer(event.clientX, event.clientY);
      if (!point) return;
      const cone: PendingCone = { ...point, t: videoRef.current?.currentTime ?? 0 };
      // Four cones make the two bars; a fifth click starts a fresh set.
      setPendingCones((prev) => (prev.length >= 4 ? [cone] : [...prev, cone]));
      return;
    }
    const hit = jointAtPointer(event.clientX, event.clientY);
    if (!hit) return;
    setSelectedJoint((prev) => (prev === hit ? null : hit));
  };

  const toggleLayer = (key: keyof OverlayToggles) =>
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));

  // Inspector values for the pinned joint, read from the current + previous frame.
  const selectedPoint = selectedJoint ? currentFrame?.landmarks[selectedJoint] : undefined;
  const selectedAngle = selectedJoint ? (currentFrame?.angles[selectedJoint] ?? null) : null;
  const previousFrame = currentIndex > 0 ? frames[currentIndex - 1] : undefined;
  const previousAngle =
    selectedJoint && previousFrame ? (previousFrame.angles[selectedJoint] ?? null) : null;
  const deltaAngle =
    selectedAngle != null && previousAngle != null ? selectedAngle - previousAngle : null;

  // Known gate distance to display, from the new gate bars or a legacy calibration.
  const savedDistanceM = calibration?.savedGates?.distanceM ?? calibration?.saved?.distanceM ?? null;

  return (
    <div className="space-y-3">
      {label && <h3 className="text-sm font-semibold text-gray-700">{label}</h3>}

      <div
        ref={containerRef}
        onMouseMove={handlePointerMove}
        onMouseLeave={() => setHoveredJoint(null)}
        onClick={handlePointerClick}
        className={`relative overflow-hidden rounded-xl border bg-black ${
          calibrationMode ? "cursor-crosshair" : hoveredJoint ? "cursor-pointer" : ""
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
            controls={!autoFollow && !calibrationMode}
            playsInline
            className="block h-auto w-full"
          />
          <VideoOverlay
            videoRef={videoRef}
            frames={frames}
            toggles={toggles}
            hoveredJoint={hoveredJoint}
            selectedJoint={selectedJoint}
            stepScale={stepScale}
            calibrationPoints={calibration?.saved ?? null}
            calibrationGates={calibration?.savedGates ?? null}
            pendingGates={calibrationMode ? pendingCones : []}
          />
          {overlaySlot}
        </div>
      </div>

      {controlsSlot}

      {/* View controls (camera behaviour) */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-gray-400">View</span>
        <button
          type="button"
          onClick={() => setAutoFollow((prev) => !prev)}
          aria-pressed={autoFollow}
          title="Keep the athlete centered and zoomed during playback"
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            autoFollow
              ? "border-lane bg-lane text-white"
              : "border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
          }`}
        >
          {autoFollow ? "◉" : "○"} Auto Follow
        </button>
        <span className="text-xs text-gray-400">
          {autoFollow ? "Following athlete" : "Off"}
        </span>

        <button
          type="button"
          onClick={() => setToggles((prev) => ({ ...prev, debug: !prev.debug }))}
          aria-pressed={toggles.debug}
          title="Show step indices, the step path, and relative distances (debug)"
          className={`ml-auto rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            toggles.debug
              ? "border-lane bg-lane text-white"
              : "border-gray-300 bg-white text-gray-400 hover:bg-gray-50"
          }`}
        >
          {toggles.debug ? "◉" : "○"} Debug labels
        </button>
      </div>

      {/* Manual ground calibration (single-player only) */}
      {calibration && (
        <div className="space-y-3 rounded-xl border bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-medium uppercase tracking-wide text-gray-400">
              Calibrate
            </span>
            <button
              type="button"
              onClick={() => {
                setCalibrationMode((prev) => !prev);
                setPendingCones([]);
                setHoveredJoint(null);
              }}
              aria-pressed={calibrationMode}
              title="Mark two timing-gate bars (cone to cone) a known distance apart"
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                calibrationMode
                  ? "border-lane bg-lane text-white"
                  : "border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              {calibrationMode ? "◉" : "○"} Timing gates
            </button>
            {savedDistanceM != null ? (
              <span className="text-xs text-gray-500">
                Calibrated: {savedDistanceM} m between the start and finish gate bars.
              </span>
            ) : (
              <span className="text-xs text-gray-400">
                No timing gates set — distances show as relative units.
              </span>
            )}
            {(calibration.savedGates || calibration.saved) && (
              <div className="ml-auto flex items-center gap-2">
                <form action={calibration.onRecompute}>
                  <input type="hidden" name="id" value={calibration.sessionId} />
                  <button
                    type="submit"
                    title="Recalculate the zone metrics from the saved gates + known distance, using the existing pose — no re-upload, no re-analysis"
                    className="rounded-full border border-lane bg-lane px-3 py-1 text-xs font-medium text-white transition-colors hover:opacity-90"
                  >
                    ↻ Recompute from zone
                  </button>
                </form>
                <form
                  action={calibration.onClear}
                  onSubmit={() => {
                    // Also clear any in-progress placement so the UI resets fully.
                    setPendingCones([]);
                    setCalibrationMode(false);
                  }}
                >
                  <input type="hidden" name="id" value={calibration.sessionId} />
                  <button
                    type="submit"
                    title="Delete both gate bars, the known distance, and the calibration zone so you can re-add from scratch"
                    className="rounded-full border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                  >
                    ✕ Remove calibration
                  </button>
                </form>
              </div>
            )}
          </div>

          {savedDistanceM != null && !calibrationMode && (
            <p className="text-xs text-gray-400">
              Zone metrics recompute from these gates automatically when you save. To adjust the
              zone, click <span className="font-medium">Timing gates</span>, re-mark the bars, and
              save — or use <span className="font-medium">↻ Recompute from zone</span> to force a
              fresh pass from the saved gates. Both use the existing pose; no re-upload. (To
              re-detect the pose itself, rerun the full analysis from the session controls.)
            </p>
          )}

          {calibrationMode && (
            <div className="rounded-lg border bg-gray-50 p-3">
              <p className="text-xs text-gray-600">
                Mark the <span className="font-semibold">start gate</span>: click{" "}
                <span className="font-semibold">cone 1</span> then{" "}
                <span className="font-semibold">cone 2</span> (a bar is drawn between them). Scrub to
                the finish, then mark the <span className="font-semibold">finish gate</span> the same
                way. The athlete&apos;s torso crossing each bar starts/stops the timer. Enter the
                known distance (e.g. 20) and save.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-500">
                {(
                  [
                    ["Start · cone 1", 0],
                    ["Start · cone 2", 1],
                    ["Finish · cone 1", 2],
                    ["Finish · cone 2", 3],
                  ] as const
                ).map(([label, i]) => (
                  <span key={label}>
                    {label}:{" "}
                    <span className="font-mono text-gray-700">
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
                    className="block text-xs font-medium text-gray-700"
                  >
                    Known distance <span className="text-gray-400">(m)</span>
                  </label>
                  <input
                    id="calibration_known_distance_m"
                    name="calibration_known_distance_m"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={0}
                    placeholder="e.g. 20"
                    className="mt-1 w-32 rounded border px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={pendingCones.length < 4}
                  className="rounded bg-lane px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  Save calibration
                </button>
                <button
                  type="button"
                  onClick={() => setPendingCones([])}
                  className="text-xs text-gray-400 hover:text-gray-700"
                >
                  Reset cones
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Layer toggles */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-gray-400">
          Overlays
        </span>
        <span className="basis-full text-xs text-gray-400">
          Skeleton overlay is available only at <span className="font-medium text-gray-500">0.25×</span>{" "}
          (or paused) for maximum visual accuracy.
        </span>
        {TOGGLE_ITEMS.map(({ key, label: toggleLabel }) => {
          const on = toggles[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleLayer(key)}
              aria-pressed={on}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                on
                  ? "border-lane bg-lane text-white"
                  : "border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              {toggleLabel}
            </button>
          );
        })}
        {toggles.stepMarks && (
          <span className="ml-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Left
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" /> Right
            </span>
            <span>
              ·{" "}
              {stepScale
                ? "distances in metres (calibrated)"
                : "distances relative — set calibration for metres"}
            </span>
            {stepCadenceHz != null && (
              <span>
                · cadence {stepCadenceHz.toFixed(2)} steps/s from {stepContactCount} contacts
              </span>
            )}
          </span>
        )}
      </div>

      {/* Inspector */}
      <div className="rounded-xl border bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Inspector
          </span>
          {selectedJoint && (
            <button
              type="button"
              onClick={() => setSelectedJoint(null)}
              className="text-xs text-gray-400 hover:text-gray-700"
            >
              Clear
            </button>
          )}
        </div>

        {selectedJoint ? (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-gray-500">Joint</dt>
              <dd className="font-medium text-gray-900">{prettyJoint(selectedJoint)}</dd>

              <dt className="text-gray-500">Angle</dt>
              <dd className="font-mono text-gray-900">
                {selectedAngle != null ? `${selectedAngle}°` : "—"}
              </dd>

              <dt className="text-gray-500">Position (x, y)</dt>
              <dd className="font-mono text-gray-900">
                {selectedPoint
                  ? `${selectedPoint.x.toFixed(3)}, ${selectedPoint.y.toFixed(3)}`
                  : "—"}
              </dd>

              <dt className="text-gray-500">Frame</dt>
              <dd className="font-mono text-gray-900">
                {currentIndex + 1} / {frames.length}
              </dd>

              <dt className="text-gray-500">Timestamp</dt>
              <dd className="font-mono text-gray-900">{(currentFrame?.time ?? currentTime).toFixed(2)}s</dd>
            </dl>

            <div className="mt-3 border-t pt-3">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Angle history
              </span>
              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-gray-500">Current</dt>
                <dd className="font-mono text-gray-900">
                  {selectedAngle != null ? `${selectedAngle}°` : "—"}
                </dd>

                <dt className="text-gray-500">Previous</dt>
                <dd className="font-mono text-gray-900">
                  {previousAngle != null ? `${previousAngle}°` : "—"}
                </dd>

                <dt className="text-gray-500">Δ change</dt>
                <dd
                  className={`font-mono ${
                    deltaAngle == null || deltaAngle === 0
                      ? "text-gray-900"
                      : deltaAngle > 0
                        ? "text-green-600"
                        : "text-red-600"
                  }`}
                >
                  {deltaAngle != null ? `${deltaAngle > 0 ? "+" : ""}${deltaAngle}°` : "—"}
                </dd>
              </dl>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500">
            Hover a joint to highlight it; click to pin and inspect its angle and position.
          </p>
        )}
      </div>
    </div>
  );
});

export default OverlaySurface;
