"use client";

import { useEffect, useRef, useState } from "react";
import type { OverlayFrame } from "@/lib/video/overlay";
import type { StepDistanceScale } from "@/lib/video/steps";
import { saveGateCalibration, removeCalibration, recomputeFromZone } from "@/app/sessions/actions";
import OverlaySurface, {
  SPEEDS,
  frameIndexForTime,
  isInteractiveTarget,
  type OverlaySurfaceHandle,
  type SurfaceState,
  type SurfaceCalibration,
} from "./OverlaySurface";
import type { OverlayCalibrationPoints } from "./VideoOverlay";
import type { CalibrationGates } from "@/lib/calibration/gates";
import PlayerControls from "./PlayerControls";
import TelestrationCanvas from "./TelestrationCanvas";

type Props = {
  videoUrl: string;
  frames: OverlayFrame[];
  /** Calibration scale for step distances (metres); null → relative labels. */
  stepScale?: StepDistanceScale | null;
  /** Step frequency (steps/s) from verified contacts, shown in the legend. */
  stepCadenceHz?: number | null;
  /** Detected ground-contact count, shown alongside cadence. */
  stepContactCount?: number;
  /** Session id — enables the manual click-to-calibrate controls when present. */
  sessionId?: string;
  /** Saved legacy two-point calibration for this session, if any. */
  manualCalibration?: OverlayCalibrationPoints | null;
  /** Saved timing-gate bars (Day 66) for this session, if any. */
  calibrationGates?: CalibrationGates | null;
};

/**
 * Single-athlete overlay player: one {@link OverlaySurface} driven by one shared
 * {@link PlayerControls}. Transport goes through the surface's imperative handle
 * so the same controls are reused by the comparison player without duplication.
 */
export default function OverlayVideoPlayer({
  videoUrl,
  frames,
  stepScale = null,
  stepCadenceHz = null,
  stepContactCount = 0,
  sessionId,
  manualCalibration = null,
  calibrationGates = null,
}: Props) {
  const calibration: SurfaceCalibration | undefined = sessionId
    ? {
        sessionId,
        savedGates: calibrationGates,
        saved: manualCalibration,
        onSave: saveGateCalibration,
        onClear: removeCalibration,
        onRecompute: recomputeFromZone,
      }
    : undefined;
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
      stepScale={stepScale}
      stepCadenceHz={stepCadenceHz}
      stepContactCount={stepContactCount}
      calibration={calibration}
      onState={setState}
      overlaySlot={<TelestrationCanvas />}
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
