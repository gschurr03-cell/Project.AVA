"use client";

import { useRef } from "react";
import type { OverlayFrame } from "@/lib/video/overlay";
import VideoOverlay from "./VideoOverlay";

type Props = {
  videoUrl: string;
  frames: OverlayFrame[];
};

export default function OverlayVideoPlayer({ videoUrl, frames }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border bg-black">
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          playsInline
          className="h-auto w-full"
        />
        <VideoOverlay videoRef={videoRef} frames={frames} />
      </div>

      <div className="rounded-xl border bg-white p-4 text-sm text-gray-700">
        Overlay enabled: skeleton, joint angles, COM trail, velocity vector, and foot-contact labels.
      </div>
    </div>
  );
}
