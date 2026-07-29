"use client";

import { useRef, useState } from "react";

import VideoTimeline, { type VideoTimelineMarker } from "./VideoTimeline";

/** Format a number of seconds as m:ss. */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const PlayIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const PauseIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
    <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
  </svg>
);

const VolumeIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
    <path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2a4.5 4.5 0 0 0-2.5-4.03v8.06A4.5 4.5 0 0 0 16.5 12z" />
  </svg>
);

const MutedIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
    <path d="M3 10v4h4l5 5V5L7 10H3zm18.5-1.5-1.5-1.5-2.5 2.5L15 7v10l2.5-2.5 2.5 2.5 1.5-1.5-2.5-2.5 2.5-2.5z" />
  </svg>
);

/**
 * Reusable HTML5 video player with local playback controls. Presentation only:
 * no data fetching, coaching logic, metrics, or overlays — a foundation to build
 * synchronized biomechanics playback on later.
 */
export default function VideoPlayer({
  videoUrl,
  markers = [],
}: {
  videoUrl: string;
  markers?: VideoTimelineMarker[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const time = Number(event.target.value);
    video.currentTime = time;
    setCurrentTime(time);
  };

  return (
    <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-xl bg-gray-900 shadow-lg">
      <div className="relative aspect-video bg-black">
        <video
          ref={videoRef}
          src={videoUrl}
          preload="metadata"
          playsInline
          className="h-full w-full"
          onClick={togglePlay}
          onLoadedMetadata={(event) => {
            setDuration(event.currentTarget.duration);
            setIsLoading(false);
          }}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onWaiting={() => setIsLoading(true)}
          onPlaying={() => setIsLoading(false)}
        />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div
              className="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white"
              role="status"
              aria-label="Loading video"
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 bg-gray-900 px-4 py-3 text-white">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={currentTime}
          onChange={handleSeek}
          aria-label="Seek"
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-600 accent-lane"
        />

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="rounded-full p-2 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              {isPlaying ? PauseIcon : PlayIcon}
            </button>

            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? "Unmute" : "Mute"}
              className="rounded-full p-2 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              {isMuted ? MutedIcon : VolumeIcon}
            </button>
          </div>

          <div className="text-xs font-medium tabular-nums text-gray-300">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>
      </div>

      <div className="bg-gray-900 px-4 pb-4">
        <VideoTimeline duration={duration} markers={markers} />
      </div>
    </div>
  );
}
