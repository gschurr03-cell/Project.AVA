"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { OverlayFrame } from "@/lib/video/overlay";
import { computeAnchor, type AlignmentMode } from "@/lib/video/alignment";
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

const ALIGN_ITEMS: { key: AlignmentMode; label: string }[] = [
  { key: "start", label: "Video Start" },
  { key: "contact", label: "First Foot Contact" },
  { key: "com", label: "First COM Motion" },
];

const MANUAL_OFFSET_LIMIT = 1; // ±1.0 s

/**
 * Side-by-side comparison of two {@link OverlaySurface} views under one shared
 * {@link PlayerControls}. The timeline runs in *aligned time* (τ), where τ = 0
 * is each clip's detected anchor (foot contact / COM motion / start), so the two
 * sprints line up by the athlete's movement rather than by video start. A manual
 * offset nudges the right clip ±1s relative to the left. Sync locks decide which
 * dimensions mirror from the left (primary) to the right surface.
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
  const [mode, setMode] = useState<AlignmentMode>("contact");
  const [manualOffset, setManualOffset] = useState(0);

  const anchorLeft = useMemo(() => computeAnchor(left.frames, mode), [left.frames, mode]);
  const anchorRight = useMemo(() => computeAnchor(right.frames, mode), [right.frames, mode]);

  const leftFrames = left.frames;
  const hasFrames = leftFrames.length > 0;
  const leftIndex = hasFrames ? frameIndexForTime(leftFrames, primary.currentTime) : 0;

  // Aligned time τ = real time − anchor. The timeline domain is the left clip's
  // aligned range (τ = 0 at its anchor).
  const tau = primary.currentTime - anchorLeft;
  const alignedFirst = hasFrames ? leftFrames[0].time - anchorLeft : 0;
  const alignedLast = hasFrames ? leftFrames[leftFrames.length - 1].time - anchorLeft : 0;
  const snappedTau = (leftFrames[leftIndex]?.time ?? primary.currentTime) - anchorLeft;

  // Refs so the keydown listener reads live values without re-binding constantly.
  const anchorRef = useRef({ left: anchorLeft, right: anchorRight });
  anchorRef.current = { left: anchorLeft, right: anchorRight };
  const offsetRef = useRef(manualOffset);
  offsetRef.current = manualOffset;
  const locksRef = useRef(locks);
  locksRef.current = locks;
  const timeRef = useRef(primary.currentTime);
  timeRef.current = primary.currentTime;

  // Put the right clip at the aligned time τ (plus manual offset).
  const alignRightTo = (targetTau: number) => {
    rightRef.current?.seek(anchorRight + targetTau + manualOffset);
  };

  const seekAligned = (targetTau: number) => {
    leftRef.current?.seek(anchorLeft + targetTau);
    if (locks.timeline) alignRightTo(targetTau);
  };

  const stepFramesAligned = (delta: number) => {
    if (!leftFrames.length) return;
    const nextIndex = Math.max(
      0,
      Math.min(leftFrames.length - 1, frameIndexForTime(leftFrames, timeRef.current) + delta),
    );
    const nextTau = leftFrames[nextIndex].time - anchorRef.current.left;
    leftRef.current?.stepTo(nextIndex);
    if (locksRef.current.playback) {
      rightRef.current?.pause();
      rightRef.current?.seek(anchorRef.current.right + nextTau + offsetRef.current);
    }
  };

  const toggleBothPlay = () => {
    leftRef.current?.togglePlay();
    if (locksRef.current.playback) rightRef.current?.togglePlay();
  };

  const changeSpeedBoth = (rate: number) => {
    leftRef.current?.setSpeed(rate);
    if (locks.speed) rightRef.current?.setSpeed(rate);
  };

  const handleModeChange = (next: AlignmentMode) => setMode(next);

  const handleOffsetChange = (value: number) => {
    setManualOffset(value);
    rightRef.current?.seek(anchorRight + (timeRef.current - anchorLeft) + value);
  };

  // Snap both clips to their anchor (τ = 0) on mount and whenever the alignment
  // basis changes, so the pair starts aligned by movement.
  useEffect(() => {
    leftRef.current?.seek(anchorLeft);
    rightRef.current?.seek(anchorRight + offsetRef.current);
  }, [anchorLeft, anchorRight]);

  // Keyboard shortcuts mirror the transport (respecting the playback lock).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!leftFrames.length || isInteractiveTarget(event.target)) return;
      if (event.key === " ") {
        event.preventDefault();
        leftRef.current?.togglePlay();
        if (locksRef.current.playback) rightRef.current?.togglePlay();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        stepFramesAligned(event.key === "ArrowLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // stepFramesAligned reads live values through refs, so `leftFrames` is the
    // only binding this listener depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftFrames]);

  const alignmentControls = (
    <div className="space-y-3">
      {/* Alignment mode */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-gray-400">
          Alignment
        </span>
        {ALIGN_ITEMS.map(({ key, label }) => {
          const on = mode === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleModeChange(key)}
              aria-pressed={on}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                on
                  ? "border-lane bg-lane text-white"
                  : "border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              {on ? "●" : "○"} {label}
            </button>
          );
        })}
      </div>

      {/* Manual offset */}
      <div className="rounded-xl border bg-white p-3">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-medium uppercase tracking-wide text-gray-400">Manual offset</span>
          <span className="font-mono text-gray-700">
            {manualOffset >= 0 ? "+" : ""}
            {manualOffset.toFixed(2)}s
          </span>
        </div>
        <input
          type="range"
          min={-MANUAL_OFFSET_LIMIT}
          max={MANUAL_OFFSET_LIMIT}
          step={0.01}
          value={manualOffset}
          onChange={(event) => handleOffsetChange(Number(event.target.value))}
          disabled={!hasFrames}
          aria-label="Manual alignment offset"
          className="w-full accent-lane disabled:cursor-not-allowed disabled:opacity-40"
        />
      </div>

      {/* Sync locks */}
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
        currentTime={tau}
        currentIndex={leftIndex}
        frameCount={leftFrames.length}
        firstTime={alignedFirst}
        lastTime={alignedLast}
        currentFrameTime={snappedTau}
        speed={primary.speed}
        speeds={SPEEDS}
        onTogglePlay={toggleBothPlay}
        onSeek={seekAligned}
        onStepPrev={() => stepFramesAligned(-1)}
        onStepNext={() => stepFramesAligned(1)}
        onSpeed={changeSpeedBoth}
        extra={alignmentControls}
      />
    </div>
  );
}
