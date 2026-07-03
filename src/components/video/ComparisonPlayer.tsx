"use client";

import { useEffect, useRef, useState } from "react";
import type { OverlayFrame } from "@/lib/video/overlay";
import OverlaySurface, {
  SPEEDS,
  frameIndexForTime,
  isInteractiveTarget,
  type OverlaySurfaceHandle,
  type SurfaceState,
} from "./OverlaySurface";
import PlayerControls from "./PlayerControls";

/** One athlete's clip + pose frames, with an optional column heading. */
export type ComparisonSide = {
  videoUrl: string;
  frames: OverlayFrame[];
  label?: string;
};

type Props = {
  left: ComparisonSide;
  right: ComparisonSide;
};

type LockKey = "playback" | "timeline" | "speed";

const LOCK_ITEMS: { key: LockKey; label: string }[] = [
  { key: "playback", label: "Lock playback" },
  { key: "timeline", label: "Lock timeline" },
  { key: "speed", label: "Lock speed" },
];

/**
 * Side-by-side comparison of two {@link OverlaySurface} views under one shared
 * {@link PlayerControls}. The controls drive the left (primary) surface; each
 * sync lock decides whether that action also mirrors to the right surface, so
 * coaches can align the clips or let a dimension drift. Each side keeps its own
 * layer toggles and joint inspector.
 */
export default function ComparisonPlayer({ left, right }: Props) {
  const leftRef = useRef<OverlaySurfaceHandle>(null);
  const rightRef = useRef<OverlaySurfaceHandle>(null);
  const [primary, setPrimary] = useState<SurfaceState>({
    currentTime: 0,
    isPlaying: false,
    speed: 1,
  });
  const [locks, setLocks] = useState<Record<LockKey, boolean>>({
    playback: true,
    timeline: true,
    speed: true,
  });

  // Shared readout/scrubber track the left surface; the right mirrors per lock.
  const frames = left.frames;
  const hasFrames = frames.length > 0;
  const currentIndex = hasFrames ? frameIndexForTime(frames, primary.currentTime) : 0;
  const firstTime = hasFrames ? frames[0].time : 0;
  const lastTime = hasFrames ? frames[frames.length - 1].time : 0;
  const currentFrameTime = frames[currentIndex]?.time ?? primary.currentTime;

  const togglePlay = () => {
    leftRef.current?.togglePlay();
    if (locks.playback) rightRef.current?.togglePlay();
  };
  const seek = (time: number) => {
    leftRef.current?.seek(time);
    if (locks.timeline) rightRef.current?.seek(time);
  };
  const stepTo = (index: number) => {
    leftRef.current?.stepTo(index);
    if (locks.playback) rightRef.current?.stepTo(index);
  };
  const changeSpeed = (rate: number) => {
    leftRef.current?.setSpeed(rate);
    if (locks.speed) rightRef.current?.setSpeed(rate);
  };

  // Keyboard shortcuts mirror the transport (respecting the playback lock).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!frames.length || isInteractiveTarget(event.target)) return;
      if (event.key === " ") {
        event.preventDefault();
        leftRef.current?.togglePlay();
        if (locks.playback) rightRef.current?.togglePlay();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const delta = event.key === "ArrowLeft" ? -1 : 1;
        leftRef.current?.stepBy(delta);
        if (locks.playback) rightRef.current?.stepBy(delta);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [frames, locks.playback]);

  const lockToggles = (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
      <span className="mr-1 text-xs font-medium uppercase tracking-wide text-gray-400">Sync</span>
      {LOCK_ITEMS.map(({ key, label }) => {
        const on = locks[key];
        return (
          <button
            key={key}
            type="button"
            onClick={() => setLocks((prev) => ({ ...prev, [key]: !prev[key] }))}
            aria-pressed={on}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              on
                ? "border-lane bg-lane text-white"
                : "border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
            }`}
          >
            {on ? "🔒" : "🔓"} {label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <OverlaySurface
          ref={leftRef}
          videoUrl={left.videoUrl}
          frames={left.frames}
          label={left.label ?? "Athlete A"}
          onState={setPrimary}
        />
        <OverlaySurface
          ref={rightRef}
          videoUrl={right.videoUrl}
          frames={right.frames}
          label={right.label ?? "Athlete B"}
        />
      </div>

      <PlayerControls
        hasFrames={hasFrames}
        isPlaying={primary.isPlaying}
        currentTime={primary.currentTime}
        currentIndex={currentIndex}
        frameCount={frames.length}
        firstTime={firstTime}
        lastTime={lastTime}
        currentFrameTime={currentFrameTime}
        speed={primary.speed}
        speeds={SPEEDS}
        onTogglePlay={togglePlay}
        onSeek={seek}
        onStepPrev={() => stepTo(currentIndex - 1)}
        onStepNext={() => stepTo(currentIndex + 1)}
        onSpeed={changeSpeed}
        extra={lockToggles}
      />
    </div>
  );
}
