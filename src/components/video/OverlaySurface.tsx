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
import VideoOverlay, { type OverlayToggles } from "./VideoOverlay";

/** Playback rates offered by the shared controls. */
export const SPEEDS = [0.25, 0.5, 1, 2] as const;

const DEFAULT_TOGGLES: OverlayToggles = {
  skeleton: true,
  angles: true,
  comTrail: true,
  velocity: true,
  footLabels: true,
};

const TOGGLE_ITEMS: { key: keyof OverlayToggles; label: string }[] = [
  { key: "skeleton", label: "Skeleton" },
  { key: "angles", label: "Joint angles" },
  { key: "comTrail", label: "COM trail" },
  { key: "velocity", label: "Velocity" },
  { key: "footLabels", label: "Foot labels" },
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
  /** Called whenever the underlying video clock/state changes. */
  onState?: (state: SurfaceState) => void;
};

/**
 * One interactive overlay view: a video, its pose overlay, per-side layer
 * toggles, and the joint inspector. Playback is driven imperatively (via the
 * forwarded {@link OverlaySurfaceHandle}) so a single player or the comparison
 * player can share one set of transport controls across one or two surfaces.
 */
const OverlaySurface = forwardRef<OverlaySurfaceHandle, Props>(function OverlaySurface(
  { videoUrl, frames, label, controlsSlot, onState },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [toggles, setToggles] = useState<OverlayToggles>(DEFAULT_TOGGLES);
  const [currentTime, setCurrentTime] = useState(0);
  const [hoveredJoint, setHoveredJoint] = useState<string | null>(null);
  const [selectedJoint, setSelectedJoint] = useState<string | null>(null);

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

  // Nearest joint within HIT_RADIUS of the pointer, mapping container pixels to
  // the current frame's normalized landmark coordinates.
  const jointAtPointer = (clientX: number, clientY: number): string | null => {
    const container = containerRef.current;
    if (!container || !currentFrame) return null;

    const rect = container.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;

    let best: string | null = null;
    let bestDist = HIT_RADIUS;
    for (const [name, point] of Object.entries(currentFrame.landmarks)) {
      if (!point) continue;
      const x = point.x <= 1 ? point.x * rect.width : point.x;
      const y = point.y <= 1 ? point.y * rect.height : point.y;
      const dist = Math.hypot(px - x, py - y);
      if (dist <= bestDist) {
        bestDist = dist;
        best = name;
      }
    }
    return best;
  };

  const handlePointerMove = (event: React.MouseEvent) => {
    const hit = jointAtPointer(event.clientX, event.clientY);
    setHoveredJoint((prev) => (prev === hit ? prev : hit));
  };

  // Click a joint to pin it; click the same joint again to unpin. Clicks that
  // miss every joint (e.g. on the native video controls) leave selection alone.
  const handlePointerClick = (event: React.MouseEvent) => {
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

  return (
    <div className="space-y-3">
      {label && <h3 className="text-sm font-semibold text-gray-700">{label}</h3>}

      <div
        ref={containerRef}
        onMouseMove={handlePointerMove}
        onMouseLeave={() => setHoveredJoint(null)}
        onClick={handlePointerClick}
        className={`relative overflow-hidden rounded-xl border bg-black ${
          hoveredJoint ? "cursor-pointer" : ""
        }`}
      >
        <video ref={videoRef} src={videoUrl} controls playsInline className="h-auto w-full" />
        <VideoOverlay
          videoRef={videoRef}
          frames={frames}
          toggles={toggles}
          hoveredJoint={hoveredJoint}
          selectedJoint={selectedJoint}
        />
      </div>

      {controlsSlot}

      {/* Layer toggles */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-gray-400">
          Overlays
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
