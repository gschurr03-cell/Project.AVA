"use client";

import { useEffect, useRef } from "react";
import type { OverlayFrame } from "@/lib/video/overlay";

type Props = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  frames: OverlayFrame[];
};

const bones = [
  ["leftShoulder", "rightShoulder"],
  ["leftShoulder", "leftElbow"],
  ["leftElbow", "leftWrist"],
  ["rightShoulder", "rightElbow"],
  ["rightElbow", "rightWrist"],
  ["leftShoulder", "leftHip"],
  ["rightShoulder", "rightHip"],
  ["leftHip", "rightHip"],
  ["leftHip", "leftKnee"],
  ["leftKnee", "leftAnkle"],
  ["leftAnkle", "leftFootIndex"],
  ["rightHip", "rightKnee"],
  ["rightKnee", "rightAnkle"],
  ["rightAnkle", "rightFootIndex"],
];

function scalePoint(point: { x: number; y: number }, width: number, height: number) {
  return {
    x: point.x <= 1 ? point.x * width : point.x,
    y: point.y <= 1 ? point.y * height : point.y,
  };
}

export default function VideoOverlay({ videoRef, frames }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !frames.length) return;

    const draw = () => {
      const rect = video.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const currentTime = video.currentTime;
      let frame = frames[0];

      for (const candidate of frames) {
        if (candidate.time <= currentTime) frame = candidate;
        else break;
      }

      ctx.lineWidth = 3;
      ctx.font = "13px system-ui";
      ctx.textBaseline = "middle";

      for (const [aName, bName] of bones) {
        const a = frame.landmarks[aName];
        const b = frame.landmarks[bName];
        if (!a || !b) continue;

        const ap = scalePoint(a, canvas.width, canvas.height);
        const bp = scalePoint(b, canvas.width, canvas.height);

        ctx.beginPath();
        ctx.moveTo(ap.x, ap.y);
        ctx.lineTo(bp.x, bp.y);
        ctx.stroke();
      }

      for (const point of Object.values(frame.landmarks)) {
        if (!point) continue;
        const p = scalePoint(point, canvas.width, canvas.height);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      if (frame.centerOfMass) {
        const com = scalePoint(frame.centerOfMass, canvas.width, canvas.height);

        ctx.beginPath();
        ctx.arc(com.x, com.y, 7, 0, Math.PI * 2);
        ctx.fill();

        const trail = frames
          .filter((f) => f.frame <= frame.frame && f.frame >= frame.frame - 30)
          .map((f) => f.centerOfMass)
          .filter(Boolean);

        ctx.beginPath();
        trail.forEach((p, i) => {
          const point = scalePoint(p!, canvas.width, canvas.height);
          if (i === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.stroke();

        if (frame.velocity) {
          ctx.beginPath();
          ctx.moveTo(com.x, com.y);
          ctx.lineTo(com.x + frame.velocity.x * 0.08, com.y + frame.velocity.y * 0.08);
          ctx.stroke();
        }
      }

      const angleLabels = [
        ["leftKnee", frame.angles.leftKnee],
        ["rightKnee", frame.angles.rightKnee],
        ["leftHip", frame.angles.leftHip],
        ["rightHip", frame.angles.rightHip],
        ["leftAnkle", frame.angles.leftAnkle],
        ["rightAnkle", frame.angles.rightAnkle],
      ] as const;

      for (const [joint, value] of angleLabels) {
        const point = frame.landmarks[joint];
        if (!point || value == null) continue;
        const p = scalePoint(point, canvas.width, canvas.height);
        ctx.fillText(`${value}°`, p.x + 8, p.y - 8);
      }

      for (const side of ["left", "right"] as const) {
        const key = side === "left" ? "leftFootIndex" : "rightFootIndex";
        const foot = frame.landmarks[key];
        if (!foot) continue;

        const p = scalePoint(foot, canvas.width, canvas.height);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillText(frame.footContact[side] ? "contact" : "flight", p.x + 12, p.y);
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [videoRef, frames]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
