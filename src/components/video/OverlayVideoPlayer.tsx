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
  const [toggles, setToggles] = useState<OverlayToggles>(DEFAULT_TOGGLES);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

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
      <div className="relative overflow-hidden rounded-xl border bg-black">
        <video ref={videoRef} src={videoUrl} controls playsInline className="h-auto w-full" />
        <VideoOverlay videoRef={videoRef} frames={frames} toggles={toggles} />
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
    </div>
  );
}
