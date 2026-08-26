"use client";

import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { unprojectDisplayPointToSource } from "@/lib/video/coordinates";
import {
  validateAccelerationCalibration,
  formatMarkerDistanceLabel,
  type AccelerationMarker,
} from "@/lib/acceleration/calibration";
import { saveAccelerationCalibration, saveAccelerationStartOverride } from "@/app/sessions/actions";

// Common presets for a fast click — but the distance input below accepts ANY
// value (Part 2.5: "the zone should support arbitrary calibrated ranges"),
// e.g. a 12m or 37.5m marker works identically to these.
const DISTANCE_PRESETS = [0, 5, 10, 15, 20, 25, 30, 35, 40];

const ERROR_LABEL: Record<string, string> = {
  insufficient_markers: "Place at least two distance markers to define a zone.",
  duplicate_distance: "Two markers cannot share the same distance.",
  reversed_or_unordered_markers: "Markers must be placed in increasing distance order along the track.",
  markers_not_collinear: "One or more markers are far off the zone's entry→exit line — re-check placement.",
};

interface DraftMarker {
  distanceM: number;
  x: number;
  y: number;
  frameIndex: number | null;
}

export default function AccelerationCalibrationPanel({
  sessionId,
  videoUrl,
  sourceWidth,
  sourceHeight,
  fps,
  savedMarkers,
  savedTravelDirection,
  expectedRevision,
  suggestedStart,
  savedStartOverride,
}: {
  sessionId: string;
  videoUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  fps: number;
  savedMarkers: DraftMarker[];
  savedTravelDirection: "left_to_right" | "right_to_left" | null;
  expectedRevision: number;
  suggestedStart: { frame: number | null; timestamp: number | null; confidence: number; signal: string | null } | null;
  savedStartOverride: { zoneStartFrame: number } | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [markers, setMarkers] = useState<DraftMarker[]>(savedMarkers);
  const [distanceInput, setDistanceInput] = useState("");
  const [armedDistance, setArmedDistance] = useState<number | null>(null);
  const [travelDirection, setTravelDirection] = useState<"left_to_right" | "right_to_left">(
    savedTravelDirection ?? "left_to_right",
  );
  const [currentFrame, setCurrentFrame] = useState(savedStartOverride?.zoneStartFrame ?? suggestedStart?.frame ?? 0);
  const [section, setSection] = useState<"markers" | "start">("markers");

  const fullMarkers: AccelerationMarker[] = useMemo(
    () =>
      markers.map((m) => ({
        id: `m-${m.distanceM}`,
        distanceM: m.distanceM,
        point: { x: m.x, y: m.y },
        frameIndex: m.frameIndex,
      })),
    [markers],
  );
  const validation = useMemo(() => validateAccelerationCalibration(fullMarkers), [fullMarkers]);

  const seekToFrame = (frame: number) => {
    const video = videoRef.current;
    if (!video || fps <= 0) return;
    const clamped = Math.max(0, frame);
    video.currentTime = clamped / fps;
    setCurrentFrame(clamped);
  };

  const armDistance = (distanceM: number) => {
    setArmedDistance(distanceM);
    setDistanceInput(String(distanceM));
  };

  const handleStageClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (armedDistance == null || !videoRef.current) return;
    const video = videoRef.current;
    const rect = video.getBoundingClientRect();
    const source = unprojectDisplayPointToSource(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      {
        sourceWidth,
        sourceHeight,
        displayRect: { x: 0, y: 0, width: rect.width, height: rect.height },
        fitMode: "contain",
      },
    );
    const point = { x: Math.max(0, Math.min(1, source.x)), y: Math.max(0, Math.min(1, source.y)) };
    const frame = Math.round(video.currentTime * fps);
    const distanceM = armedDistance;
    setMarkers((prev) => [...prev.filter((m) => m.distanceM !== distanceM), { distanceM, ...point, frameIndex: frame }]);
    if (process.env.NODE_ENV !== "production") {
      console.log("[acceleration-calibration-edit]", {
        sessionId,
        distanceM,
        frame,
        x: point.x,
        y: point.y,
        sourceWidth,
        sourceHeight,
      });
    }
    setArmedDistance(null);
  };

  const markersJson = JSON.stringify(markers.map((m) => ({ distanceM: m.distanceM, x: m.x, y: m.y, frameIndex: m.frameIndex })));

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSection("markers")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${section === "markers" ? "bg-[#2f80ed] text-white" : "border border-white/[0.1] text-[#b3bccb]"}`}
        >
          Distance markers
        </button>
        <button
          type="button"
          onClick={() => setSection("start")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${section === "start" ? "bg-[#2f80ed] text-white" : "border border-white/[0.1] text-[#b3bccb]"}`}
        >
          Start event
        </button>
      </div>

      <div className="relative overflow-hidden rounded-lg bg-black">
        <video ref={videoRef} src={videoUrl} className="block w-full" playsInline />
        <div
          className={`absolute inset-0 ${section === "markers" && armedDistance != null ? "cursor-crosshair" : ""}`}
          onClick={section === "markers" ? handleStageClick : undefined}
        >
          {markers.map((m) => (
            <div
              key={m.distanceM}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#f5c451] bg-[#f5c451]/30 px-1.5 py-0.5 text-[10px] font-bold text-[#0b1220]"
              style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
            >
              {formatMarkerDistanceLabel(m.distanceM)}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => seekToFrame(currentFrame - 1)} className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs text-[#b3bccb]">
          ◀ Frame
        </button>
        <button type="button" onClick={() => seekToFrame(currentFrame + 1)} className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs text-[#b3bccb]">
          Frame ▶
        </button>
        <span className="text-xs text-[#7e8797]">Frame {currentFrame}</span>
      </div>

      {section === "markers" ? (
        <>
          <p className="mt-3 text-sm text-[#b3bccb]">
            Scrub to a frame where a known track distance is visible, enter that distance, then click it in the
            video. Only fixed track features — lines, cones, markers — never the athlete. Any two or more markers
            define an Analysis Zone at ANY distances — e.g. 12m + 27m analyzes 12-27m acceleration on its own, with
            no 0m marker needed. The zone&apos;s lowest marker is where timing, calibration, contacts, steps,
            velocity, and acceleration all begin; nothing outside the zone is used for official metrics.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min={0}
              max={400}
              value={distanceInput}
              onChange={(e) => {
                setDistanceInput(e.target.value);
                const parsed = Number(e.target.value);
                setArmedDistance(e.target.value !== "" && Number.isFinite(parsed) ? parsed : null);
              }}
              placeholder="Distance (m)"
              className="w-28 rounded-lg border border-white/[0.08] bg-[#081019] px-3 py-1.5 text-sm text-[#f5f7fb] placeholder:text-[#7e8797]"
            />
            <span className="text-xs text-[#7e8797]">{armedDistance != null ? "Click the video to place it" : "Enter a distance, then click the video"}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {DISTANCE_PRESETS.map((distanceM) => {
              const placed = markers.find((m) => m.distanceM === distanceM);
              return (
                <button
                  key={distanceM}
                  type="button"
                  onClick={() => armDistance(distanceM)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    armedDistance === distanceM
                      ? "bg-[#f5c451] text-[#0b1220]"
                      : placed
                        ? "border border-[#89d46a]/40 bg-[#89d46a]/10 text-[#89d46a]"
                        : "border border-white/[0.1] text-[#b3bccb]"
                  }`}
                >
                  {formatMarkerDistanceLabel(distanceM)} {placed ? "✓" : ""}
                </button>
              );
            })}
            {markers.length > 0 && (
              <button type="button" onClick={() => setMarkers([])} className="text-xs text-[#7e8797] hover:text-[#f5f7fb]">
                Reset markers
              </button>
            )}
          </div>
          {markers.length > 0 && (
            <p className="mt-2 text-[11px] text-[#7e8797]">
              Placed: {[...markers].sort((a, b) => a.distanceM - b.distanceM).map((m) => formatMarkerDistanceLabel(m.distanceM)).join(", ")}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-3 text-xs text-[#b3bccb]">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={travelDirection === "left_to_right"}
                onChange={() => setTravelDirection("left_to_right")}
              />
              Left → right
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={travelDirection === "right_to_left"}
                onChange={() => setTravelDirection("right_to_left")}
              />
              Right → left
            </label>
          </div>

          <div className="mt-3 text-xs">
            {validation.valid ? (
              <span className="text-[#89d46a]">
                Ready to save · coverage {validation.coverageMinM}–{validation.coverageMaxM} m
              </span>
            ) : (
              <span className="text-[#f5c451]">{validation.reasons.map((r) => ERROR_LABEL[r] ?? r).join(" ")}</span>
            )}
          </div>

          <form action={saveAccelerationCalibration} className="mt-3">
            <input type="hidden" name="id" value={sessionId} />
            <input type="hidden" name="markers" value={markersJson} />
            <input type="hidden" name="travel_direction" value={travelDirection} />
            <input type="hidden" name="expected_revision" value={expectedRevision} />
            <input type="hidden" name="source_frame_width" value={sourceWidth} />
            <input type="hidden" name="source_frame_height" value={sourceHeight} />
            <button
              type="submit"
              disabled={!validation.valid}
              className="rounded-lg bg-[#2f80ed] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Save calibration &amp; run analysis
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-[#b3bccb]">
            Time Zero is the athlete&apos;s first observable movement inside the calibrated zone — never the start of
            the recording. If the clip begins after the athlete is already moving through the zone (e.g. a 10-20m
            zone), Time Zero is the instant they enter the zone instead.{" "}
            {suggestedStart?.frame != null
              ? `AVA suggests frame ${suggestedStart.frame} (${Math.round(suggestedStart.confidence * 100)}% confidence via ${suggestedStart.signal ?? "fallback"}). Step frames to review, then confirm.`
              : "Step to the true start frame and confirm it. A confirmed frame is always authoritative over AVA's suggestion."}
          </p>
          {suggestedStart?.frame != null && (
            <button
              type="button"
              onClick={() => seekToFrame(suggestedStart.frame!)}
              className="mt-2 rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs text-[#b3bccb]"
            >
              Jump to suggested frame
            </button>
          )}
          <form action={saveAccelerationStartOverride} className="mt-3">
            <input type="hidden" name="id" value={sessionId} />
            <input type="hidden" name="start_frame_index" value={currentFrame} />
            <input type="hidden" name="suggested_frame_index" value={suggestedStart?.frame ?? ""} />
            <input type="hidden" name="suggested_confidence" value={suggestedStart?.confidence ?? ""} />
            <input type="hidden" name="expected_revision" value={expectedRevision} />
            <button type="submit" className="rounded-lg bg-[#2f80ed] px-4 py-2 text-sm font-semibold text-white">
              Confirm frame {currentFrame} as the Zone Start Event &amp; rerun
            </button>
          </form>
        </>
      )}
    </div>
  );
}
