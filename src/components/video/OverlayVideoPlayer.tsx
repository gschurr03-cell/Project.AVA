"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OverlayFrame } from "@/lib/video/overlay";
import VideoOverlay, { type OverlayToggles } from "./VideoOverlay";

type Props = {
  videoUrl: string;
  frames: OverlayFrame[];
};

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

const SPEEDS = [0.25, 0.5, 1, 2] as const;

/** Pointer-to-joint hit radius, in CSS pixels. */
const HIT_RADIUS = 16;

/** "leftFootIndex" → "Left Foot Index" for the inspector label. */
function prettyJoint(name: string) {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

/** True when focus is on an element that should own these keys itself. */
function isInteractiveTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "VIDEO"].includes(el.tagName) ||
    el.isContentEditable
  );
}

/**
 * Index of the last frame at or before `time` (matches the overlay's picker).
 * Binary search over the ascending `frame.time` values; times before the first
 * frame return 0, preserving the previous linear-scan behavior.
 */
function frameIndexForTime(frames: OverlayFrame[], time: number) {
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

export default function OverlayVideoPlayer({ videoUrl, frames }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [toggles, setToggles] = useState<OverlayToggles>(DEFAULT_TOGGLES);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [hoveredJoint, setHoveredJoint] = useState<string | null>(null);
  const [selectedJoint, setSelectedJoint] = useState<string | null>(null);

  // Mirror the video element's clock/state into React for the readout + buttons.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTime = () => setCurrentTime(video.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onRate = () => setSpeed(video.playbackRate);

    video.addEventListener("timeupdate", onTime);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ratechange", onRate);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ratechange", onRate);
    };
  }, []);

  const hasFrames = frames.length > 0;
  const currentIndex = hasFrames ? frameIndexForTime(frames, currentTime) : 0;
  const currentFrame = frames[currentIndex];
  const firstTime = hasFrames ? frames[0].time : 0;
  const lastTime = hasFrames ? frames[frames.length - 1].time : 0;

  // Nearest joint (by landmark key) within HIT_RADIUS of the pointer, mapping
  // container pixels to the current frame's normalized landmark coordinates.
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

  // Inspector values for the pinned joint, read from the current + previous frame.
  const selectedPoint = selectedJoint ? currentFrame?.landmarks[selectedJoint] : undefined;
  const selectedAngle = selectedJoint ? (currentFrame?.angles[selectedJoint] ?? null) : null;
  const previousFrame = currentIndex > 0 ? frames[currentIndex - 1] : undefined;
  const previousAngle =
    selectedJoint && previousFrame ? (previousFrame.angles[selectedJoint] ?? null) : null;
  const deltaAngle =
    selectedAngle != null && previousAngle != null ? selectedAngle - previousAngle : null;

  const stepTo = useCallback(
    (index: number) => {
      const video = videoRef.current;
      if (!video || !frames.length) return;
      const clamped = Math.max(0, Math.min(frames.length - 1, index));
      video.pause();
      video.currentTime = frames[clamped].time;
      setCurrentTime(frames[clamped].time);
    },
    [frames],
  );

  const seekTo = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
    setCurrentTime(time);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  }, []);

  const changeSpeed = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setSpeed(rate);
  }, []);

  const toggleLayer = useCallback((key: keyof OverlayToggles) => {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Keyboard shortcuts: Space = play/pause, ←/→ = step frames. Ignored while a
  // form control or the native video is focused so it keeps its own key behavior.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!frames.length || isInteractiveTarget(event.target)) return;

      if (event.key === " ") {
        event.preventDefault();
        togglePlay();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        const video = videoRef.current;
        stepTo(frameIndexForTime(frames, video?.currentTime ?? 0) - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        const video = videoRef.current;
        stepTo(frameIndexForTime(frames, video?.currentTime ?? 0) + 1);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [frames, togglePlay, stepTo]);

  return (
    <div className="space-y-3">
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

      {/* Scrubber timeline */}
      <div className="rounded-xl border bg-white p-3">
        <input
          type="range"
          min={firstTime}
          max={lastTime}
          step="any"
          value={Math.min(Math.max(currentTime, firstTime), lastTime)}
          onChange={(event) => seekTo(Number(event.target.value))}
          disabled={!hasFrames}
          aria-label="Seek timeline"
          className="w-full accent-lane disabled:cursor-not-allowed disabled:opacity-40"
        />
      </div>

      {/* Frame transport */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
        <button
          type="button"
          onClick={() => stepTo(currentIndex - 1)}
          disabled={!hasFrames || currentIndex <= 0}
          className="rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous frame"
        >
          ◀ Prev
        </button>
        <button
          type="button"
          onClick={togglePlay}
          disabled={!hasFrames}
          className="rounded-md bg-lane px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPlaying ? "❚❚ Pause" : "▶ Play"}
        </button>
        <button
          type="button"
          onClick={() => stepTo(currentIndex + 1)}
          disabled={!hasFrames || currentIndex >= frames.length - 1}
          className="rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next frame"
        >
          Next ▶
        </button>

        <div className="ml-1 flex items-center gap-1">
          <span className="mr-1 text-xs font-medium uppercase tracking-wide text-gray-400">
            Speed
          </span>
          {SPEEDS.map((rate) => (
            <button
              key={rate}
              type="button"
              onClick={() => changeSpeed(rate)}
              disabled={!hasFrames}
              aria-pressed={speed === rate}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                speed === rate
                  ? "border-lane bg-lane text-white"
                  : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {rate}x
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-4 font-mono text-xs text-gray-600">
          <span>
            Frame{" "}
            <span className="font-semibold text-gray-900">{hasFrames ? currentIndex + 1 : 0}</span> /{" "}
            {frames.length}
          </span>
          <span>
            <span className="font-semibold text-gray-900">
              {(currentFrame?.time ?? currentTime).toFixed(2)}
            </span>
            s
          </span>
        </div>
      </div>

      {/* Layer toggles */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-gray-400">
          Overlays
        </span>
        {TOGGLE_ITEMS.map(({ key, label }) => {
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
              {label}
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
              <dd className="font-mono text-gray-900">
                {(currentFrame?.time ?? currentTime).toFixed(2)}s
              </dd>
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
}
