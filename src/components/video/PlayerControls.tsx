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
    <div className="space-y-3">
      {/* Scrubber timeline */}
      <div className="rounded-xl border bg-white p-3">
        <input
          type="range"
          min={firstTime}
          max={lastTime}
          step="any"
          value={Math.min(Math.max(currentTime, firstTime), lastTime)}
          onChange={(event) => onSeek(Number(event.target.value))}
          disabled={!hasFrames}
          aria-label="Seek timeline"
          className="w-full accent-lane disabled:cursor-not-allowed disabled:opacity-40"
        />
      </div>

      {/* Frame transport */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
        <button
          type="button"
          onClick={onStepPrev}
          disabled={!hasFrames || currentIndex <= 0}
          className="rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous frame"
        >
          ◀ Prev
        </button>
        <button
          type="button"
          onClick={onTogglePlay}
          disabled={!hasFrames}
          className="rounded-md bg-lane px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPlaying ? "❚❚ Pause" : "▶ Play"}
        </button>
        <button
          type="button"
          onClick={onStepNext}
          disabled={!hasFrames || currentIndex >= frameCount - 1}
          className="rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next frame"
        >
          Next ▶
        </button>

        <div className="ml-1 flex items-center gap-1">
          <span className="mr-1 text-xs font-medium uppercase tracking-wide text-gray-400">
            Speed
          </span>
          {speeds.map((rate) => (
            <button
              key={rate}
              type="button"
              onClick={() => onSpeed(rate)}
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
            {frameCount}
          </span>
          <span>
            <span className="font-semibold text-gray-900">{currentFrameTime.toFixed(2)}</span>s
          </span>
        </div>
      </div>

      {extra}
    </div>
  );
}
