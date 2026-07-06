"use client";

import type { ReactNode } from "react";

type Props = {
  hasFrames: boolean;
  isPlaying: boolean;
  currentTime: number;
  currentIndex: number;
  frameCount: number;
  firstTime: number;
  lastTime: number;
  currentFrameTime: number;
  speed: number;
  speeds: readonly number[];
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onStepPrev: () => void;
  onStepNext: () => void;
  onSpeed: (rate: number) => void;
  /** Extra controls (e.g. comparison sync locks) rendered as their own row. */
  extra?: ReactNode;
};

/**
 * Presentational transport: scrubber + prev/play/next + speed + readout. Holds
 * no video state of its own — a single player or the comparison player supplies
 * the values and wires the callbacks, so the same controls drive one or two
 * surfaces without duplication.
 */
export default function PlayerControls({
  hasFrames,
  isPlaying,
  currentTime,
  currentIndex,
  frameCount,
  firstTime,
  lastTime,
  currentFrameTime,
  speed,
  speeds,
  onTogglePlay,
  onSeek,
  onStepPrev,
  onStepNext,
  onSpeed,
  extra,
}: Props) {
  return (
    <div className="space-y-2">
      {/* Single compact transport toolbar: scrubber + play/step + speed + readout. */}
      <div className="rounded-xl border border-white/[0.06] bg-[#121214] p-3">
        <input
          type="range"
          min={firstTime}
          max={lastTime}
          step="any"
          value={Math.min(Math.max(currentTime, firstTime), lastTime)}
          onChange={(event) => onSeek(Number(event.target.value))}
          disabled={!hasFrames}
          aria-label="Seek timeline"
          className="w-full accent-[#D72638] disabled:cursor-not-allowed disabled:opacity-40"
        />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onStepPrev}
            disabled={!hasFrames || currentIndex <= 0}
            className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-[#A0A2A8] transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Previous frame"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            disabled={!hasFrames}
            className="rounded-lg bg-[#D72638] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[#e63a4b] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPlaying ? "❚❚ Pause" : "▶ Play"}
          </button>
          <button
            type="button"
            onClick={onStepNext}
            disabled={!hasFrames || currentIndex >= frameCount - 1}
            className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-[#A0A2A8] transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Next frame"
          >
            ▶
          </button>

          <div className="ml-1 flex items-center gap-1">
            {speeds.map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => onSpeed(rate)}
                disabled={!hasFrames}
                aria-pressed={speed === rate}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  speed === rate
                    ? "bg-[#D72638] text-white"
                    : "border border-white/[0.1] bg-white/[0.04] text-[#A0A2A8] hover:bg-white/[0.08]"
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-4 font-mono text-xs text-[#6B7280]">
            <span>
              Frame{" "}
              <span className="font-semibold text-[#F5F5F7]">{hasFrames ? currentIndex + 1 : 0}</span>{" "}
              / {frameCount}
            </span>
            <span>
              <span className="font-semibold text-[#F5F5F7]">{currentFrameTime.toFixed(2)}</span>s
            </span>
          </div>
        </div>
      </div>

      {extra}
    </div>
  );
}
