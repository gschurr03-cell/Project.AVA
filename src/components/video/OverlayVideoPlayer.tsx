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

type Props = {
  videoUrl: string;
  frames: OverlayFrame[];
};

/**
 * Single-athlete overlay player: one {@link OverlaySurface} driven by one shared
 * {@link PlayerControls}. Transport goes through the surface's imperative handle
 * so the same controls are reused by the comparison player without duplication.
 */
export default function OverlayVideoPlayer({ videoUrl, frames }: Props) {
  const surfaceRef = useRef<OverlaySurfaceHandle>(null);
  const [state, setState] = useState<SurfaceState>({
    currentTime: 0,
    isPlaying: false,
    speed: 1,
  });

  const hasFrames = frames.length > 0;
  const currentIndex = hasFrames ? frameIndexForTime(frames, state.currentTime) : 0;
  const firstTime = hasFrames ? frames[0].time : 0;
  const lastTime = hasFrames ? frames[frames.length - 1].time : 0;
  const currentFrameTime = frames[currentIndex]?.time ?? state.currentTime;

  // Keyboard shortcuts: Space = play/pause, ←/→ = step frames. Ignored while a
  // form control or the native video is focused so it keeps its own key behavior.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!frames.length || isInteractiveTarget(event.target)) return;
      if (event.key === " ") {
        event.preventDefault();
        surfaceRef.current?.togglePlay();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        surfaceRef.current?.stepBy(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        surfaceRef.current?.stepBy(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [frames]);

  return (
    <OverlaySurface
      ref={surfaceRef}
      videoUrl={videoUrl}
      frames={frames}
      onState={setState}
      controlsSlot={
        <PlayerControls
          hasFrames={hasFrames}
          isPlaying={state.isPlaying}
          currentTime={state.currentTime}
          currentIndex={currentIndex}
          frameCount={frames.length}
          firstTime={firstTime}
          lastTime={lastTime}
          currentFrameTime={currentFrameTime}
          speed={state.speed}
          speeds={SPEEDS}
          onTogglePlay={() => surfaceRef.current?.togglePlay()}
          onSeek={(time) => surfaceRef.current?.seek(time)}
          onStepPrev={() => surfaceRef.current?.stepTo(currentIndex - 1)}
          onStepNext={() => surfaceRef.current?.stepTo(currentIndex + 1)}
          onSpeed={(rate) => surfaceRef.current?.setSpeed(rate)}
        />
      }
    />
  );
}
