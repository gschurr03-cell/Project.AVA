"use client";

import { useEffect, useRef, useState } from "react";
import type { OverlayFrame } from "@/lib/video/overlay";
import type { StepDistanceScale, StepMark } from "@/lib/video/steps";
import {
  saveGateCalibration,
  saveGateCalibrationAction,
  removeCalibration,
  recomputeFromZone,
  saveTrochanterOverlayPoint,
  clearTrochanterOverlayPoint,
} from "@/app/sessions/actions";
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
import type { TrochanterMarker } from "@/lib/video/overlayAlignment";
import type { ZoneCoverage, ZoneStep } from "@/lib/benchmark/measurements";
import type { RawCameraEvidence, RecordingMode } from "@/lib/video/recordingMode";
import type { CameraPathArtifact } from "@/lib/video/cameraPathSchema";

type Props = {
  videoUrl: string;
  frames: OverlayFrame[];
  /** Calibration scale for step distances (metres); null → relative labels. */
  stepScale?: StepDistanceScale | null;
  /** Phase 8.0B — the authoritative individual-step model (same source as the
   *  Average/Peak Step Length cards); forwarded to VideoOverlay unchanged. */
  authoritativeSteps?: ZoneStep[] | null;
  /** Phase R1C — the authoritative full-run contact list; forwarded unchanged
   *  so the overlay renders contact markers directly from it. */
  authoritativeContacts?: StepMark[] | null;
  /** Step frequency (steps/s) from verified contacts, shown in the legend. */
  stepCadenceHz?: number | null;
  /** Detected ground-contact count, shown alongside cadence. */
  stepContactCount?: number;
  /** Session id — enables the manual click-to-calibrate controls when present. */
  sessionId?: string;
  /** Whether in-overlay gate/trochanter editing is offered (default false). Calibration
   *  editing now lives exclusively in the Timing Workspace. */
  allowCalibrationEditing?: boolean;
  /** Saved legacy two-point calibration for this session, if any. */
  manualCalibration?: OverlayCalibrationPoints | null;
  /** Saved timing-gate bars (Day 66) for this session, if any. */
  calibrationGates?: CalibrationGates | null;
  /** Acceleration event/split labels rendered on the normal full-frame overlay. */
  accelerationMarkers?: { label: string; timeS: number }[];
  trochanterMarker?: TrochanterMarker | null;
  athleteHeightCm?: number | null;
  enableTrochanterAlignment?: boolean;
  sourceFps?: number | null;
  analysisFps?: number | null;
  cameraEvidence?: RawCameraEvidence;
  cameraPath?: CameraPathArtifact;
  recordingMode?: RecordingMode;
  calibrationCameraType?: "stationary" | "panning";
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  /** Day 100 (Part 5) — the calibrated-zone coverage window, for the
   *  developer coverage-visualization overlay. Optional; omitted entirely
   *  before calibration/measurement exists. */
  zoneCoverage?: ZoneCoverage | null;
  analysisId?: string | null;
  sourceVideo?: string;
  sourceFpsClassification?: string | null;
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
  authoritativeSteps = null,
  authoritativeContacts = null,
  stepCadenceHz = null,
  stepContactCount = 0,
  sessionId,
  allowCalibrationEditing = false,
  manualCalibration = null,
  calibrationGates = null,
  accelerationMarkers = [],
  trochanterMarker = null,
  athleteHeightCm = null,
  enableTrochanterAlignment = false,
  sourceFps = null,
  analysisFps = null,
  cameraEvidence,
  cameraPath,
  recordingMode,
  calibrationCameraType,
  sourceWidth = null,
  sourceHeight = null,
  zoneCoverage = null,
  analysisId = null,
  sourceVideo = "unknown",
  sourceFpsClassification = null,
}: Props) {
  const calibration: SurfaceCalibration | undefined = sessionId
    ? {
        sessionId,
        savedGates: calibrationGates,
        saved: manualCalibration,
        onSave: saveGateCalibration,
        onSaveAction: saveGateCalibrationAction,
        onClear: removeCalibration,
        onRecompute: recomputeFromZone,
        trochanter: enableTrochanterAlignment ? trochanterMarker : null,
        athleteHeightCm,
        onSaveTrochanter: enableTrochanterAlignment ? saveTrochanterOverlayPoint : undefined,
        onClearTrochanter: enableTrochanterAlignment ? clearTrochanterOverlayPoint : undefined,
      }
    : undefined;
  const surfaceRef = useRef<OverlaySurfaceHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState(false);
  const [state, setState] = useState<SurfaceState>({
    currentTime: 0,
    isPlaying: false,
    speed: 1,
    sourcePlaybackStartSeconds: 0,
    duration: 0,
  });

  // Evidence bridge (Recommendation Evidence Frames): the Coaching Recommendations
  // card dispatches a window event when a coach clicks "View evidence"; we pause,
  // seek the video to that timestamp, scroll the player into view, and briefly flash
  // the frame so the coach sees where AVA found the limiter. Decoupled — the card
  // never imports the player.
  useEffect(() => {
    const onSeek = (event: Event) => {
      const detail = (event as CustomEvent<{ timeS: number }>).detail;
      if (!detail || typeof detail.timeS !== "number" || !Number.isFinite(detail.timeS)) return;
      surfaceRef.current?.pause();
      surfaceRef.current?.seek(detail.timeS);
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setFlash(true);
      window.setTimeout(() => setFlash(false), 1600);
    };
    window.addEventListener("ava:evidence-seek", onSeek as EventListener);
    return () => window.removeEventListener("ava:evidence-seek", onSeek as EventListener);
  }, []);

  const hasFrames = frames.length > 0;
  const currentIndex = hasFrames ? frameIndexForTime(frames, state.currentTime) : 0;
  const firstTime = state.sourcePlaybackStartSeconds;
  const lastTime = state.duration > firstTime
    ? state.duration
    : (hasFrames ? frames[frames.length - 1].time : firstTime);
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
    <div
      ref={containerRef}
      className={`scroll-mt-24 rounded-2xl transition-all duration-300 ${
        flash ? "ring-2 ring-[#2f80ed] ring-offset-2 ring-offset-[#081019]" : "ring-0"
      }`}
    >
    <OverlaySurface
      ref={surfaceRef}
      videoUrl={videoUrl}
      sourceIdentity={sessionId ?? videoUrl}
      frames={frames}
      stepScale={stepScale}
      authoritativeSteps={authoritativeSteps}
      authoritativeContacts={authoritativeContacts}
      stepCadenceHz={stepCadenceHz}
      stepContactCount={stepContactCount}
      calibration={calibration}
      allowCalibrationEditing={allowCalibrationEditing}
      cameraEvidence={cameraEvidence}
      cameraPath={cameraPath}
      recordingMode={recordingMode}
      calibrationCameraType={calibrationCameraType}
      sourceWidth={sourceWidth}
      sourceHeight={sourceHeight}
      zoneCoverage={zoneCoverage}
      analysisId={analysisId}
      sourceVideo={sourceVideo}
      sourceFps={sourceFps}
      sourceFpsClassification={sourceFpsClassification}
      onState={setState}
      overlaySlot={
        <>
          <TelestrationCanvas />
          {accelerationMarkers.length > 0 && (
            <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
              {accelerationMarkers.map((marker) => (
                <span
                  key={`${marker.label}-${marker.timeS}`}
                  className="rounded bg-black/70 px-2 py-1 text-[10px] font-semibold text-white"
                >
                  {marker.label} · {marker.timeS.toFixed(2)}s
                </span>
              ))}
            </div>
          )}
        </>
      }
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
          sourceFps={sourceFps}
          analysisFps={analysisFps}
          speeds={SPEEDS}
          onTogglePlay={() => surfaceRef.current?.togglePlay()}
          onSeek={(time) => surfaceRef.current?.seek(time)}
          onStepPrev={() => surfaceRef.current?.stepTo(currentIndex - 1)}
          onStepNext={() => surfaceRef.current?.stepTo(currentIndex + 1)}
          onSpeed={(rate) => surfaceRef.current?.setSpeed(rate)}
        />
      }
    />
    </div>
  );
}
