"use client";

import { useEffect, useRef } from "react";
import type { OverlayFrame } from "@/lib/video/overlay";

/** Which overlay layers are drawn. Owned by {@link OverlayVideoPlayer}. */
export type OverlayToggles = {
  skeleton: boolean;
  angles: boolean;
  comTrail: boolean;
  velocity: boolean;
  footLabels: boolean;
};

type Props = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  frames: OverlayFrame[];
  toggles: OverlayToggles;
  /** Landmark key currently under the cursor (transient highlight). */
  hoveredJoint: string | null;
  /** Landmark key pinned by a click (persistent highlight). */
  selectedJoint: string | null;
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

// A readable, high-contrast palette that reads well over real sprint footage.
const COLORS = {
  bone: "#38bdf8", // sky-400
  jointFill: "#f8fafc", // slate-50
  jointStroke: "#0f172a", // slate-900
  angle: "#fde047", // yellow-300
  com: "#fb923c", // orange-400
  trail: "rgba(251, 146, 60, 0.65)",
  velocity: "#f43f5e", // rose-500
  contact: "#4ade80", // green-400
  flight: "#cbd5e1", // slate-300
  hover: "#fbbf24", // amber-400
  selected: "#22d3ee", // cyan-400
  labelBg: "rgba(15, 23, 42, 0.72)",
} as const;

function scalePoint(point: { x: number; y: number }, width: number, height: number) {
  return {
    x: point.x <= 1 ? point.x * width : point.x,
    y: point.y <= 1 ? point.y * height : point.y,
  };
}

/** Draw a small pill-backed label so text stays readable over any footage. */
function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  const padX = 5;
  const padY = 3;
  const h = 16;
  const w = ctx.measureText(text).width;

  ctx.fillStyle = COLORS.labelBg;
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x - padX, y - h / 2 - padY, w + padX * 2, h + padY * 2, 4);
    ctx.fill();
  } else {
    ctx.fillRect(x - padX, y - h / 2 - padY, w + padX * 2, h + padY * 2);
  }

  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export default function VideoOverlay({
  videoRef,
  frames,
  toggles,
  hoveredJoint,
  selectedJoint,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

  // Read toggles/selection from refs so flipping a layer or moving the cursor
  // doesn't tear down and restart the animation loop — the next frame simply
  // picks up the new value.
  const togglesRef = useRef(toggles);
  togglesRef.current = toggles;
  const hoveredRef = useRef(hoveredJoint);
  hoveredRef.current = hoveredJoint;
  const selectedRef = useRef(selectedJoint);
  selectedRef.current = selectedJoint;

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

      const show = togglesRef.current;
      const hovered = hoveredRef.current;
      const selected = selectedRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const currentTime = video.currentTime;
      let frame = frames[0];

      for (const candidate of frames) {
        if (candidate.time <= currentTime) frame = candidate;
        else break;
      }

      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.font = "600 13px system-ui, sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";

      // --- Skeleton (bones + joints) ---
      if (show.skeleton) {
        for (const [aName, bName] of bones) {
          const a = frame.landmarks[aName];
          const b = frame.landmarks[bName];
          if (!a || !b) continue;

          const ap = scalePoint(a, canvas.width, canvas.height);
          const bp = scalePoint(b, canvas.width, canvas.height);

          // A bone lights up when either endpoint is the hovered/selected joint.
          const onSelected = aName === selected || bName === selected;
          const onHovered = aName === hovered || bName === hovered;
          ctx.strokeStyle = onSelected ? COLORS.selected : onHovered ? COLORS.hover : COLORS.bone;
          ctx.lineWidth = onSelected || onHovered ? 5 : 3;

          ctx.beginPath();
          ctx.moveTo(ap.x, ap.y);
          ctx.lineTo(bp.x, bp.y);
          ctx.stroke();
        }

        ctx.lineWidth = 2;
        for (const point of Object.values(frame.landmarks)) {
          if (!point) continue;
          const p = scalePoint(point, canvas.width, canvas.height);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = COLORS.jointFill;
          ctx.fill();
          ctx.strokeStyle = COLORS.jointStroke;
          ctx.stroke();
        }
      }

      // --- Hover / selection markers (drawn regardless of the skeleton toggle
      // so the inspected joint stays visible even with the skeleton hidden). ---
      const drawMarker = (name: string, color: string, radius: number) => {
        const pt = frame.landmarks[name];
        if (!pt) return null;
        const p = scalePoint(pt, canvas.width, canvas.height);
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = COLORS.jointStroke;
        ctx.stroke();
        return p;
      };

      if (hovered && hovered !== selected) drawMarker(hovered, COLORS.hover, 7);
      if (selected) {
        const p = drawMarker(selected, COLORS.selected, 8);
        if (p) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
          ctx.strokeStyle = COLORS.selected;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      // --- Center of mass, trail, and velocity all key off the COM point ---
      if (frame.centerOfMass) {
        const com = scalePoint(frame.centerOfMass, canvas.width, canvas.height);

        if (show.comTrail) {
          const trail = frames
            .filter((f) => f.frame <= frame.frame && f.frame >= frame.frame - 30)
            .map((f) => f.centerOfMass)
            .filter(Boolean);

          ctx.strokeStyle = COLORS.trail;
          ctx.lineWidth = 3;
          ctx.beginPath();
          trail.forEach((p, i) => {
            const point = scalePoint(p!, canvas.width, canvas.height);
            if (i === 0) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
          });
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(com.x, com.y, 7, 0, Math.PI * 2);
          ctx.fillStyle = COLORS.com;
          ctx.fill();
        }

        if (show.velocity && frame.velocity) {
          const tipX = com.x + frame.velocity.x * 0.08;
          const tipY = com.y + frame.velocity.y * 0.08;

          ctx.strokeStyle = COLORS.velocity;
          ctx.fillStyle = COLORS.velocity;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(com.x, com.y);
          ctx.lineTo(tipX, tipY);
          ctx.stroke();

          // Arrowhead
          const headLen = 9;
          const ang = Math.atan2(tipY - com.y, tipX - com.x);
          if (Number.isFinite(ang)) {
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(
              tipX - headLen * Math.cos(ang - Math.PI / 6),
              tipY - headLen * Math.sin(ang - Math.PI / 6),
            );
            ctx.lineTo(
              tipX - headLen * Math.cos(ang + Math.PI / 6),
              tipY - headLen * Math.sin(ang + Math.PI / 6),
            );
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      // --- Joint angle labels ---
      if (show.angles) {
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
          drawLabel(ctx, `${value}°`, p.x + 10, p.y - 10, COLORS.angle);
        }
      }

      // --- Foot-contact labels ---
      if (show.footLabels) {
        for (const side of ["left", "right"] as const) {
          const key = side === "left" ? "leftFootIndex" : "rightFootIndex";
          const foot = frame.landmarks[key];
          if (!foot) continue;

          const p = scalePoint(foot, canvas.width, canvas.height);
          const inContact = frame.footContact[side];

          ctx.strokeStyle = inContact ? COLORS.contact : COLORS.flight;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
          ctx.stroke();

          drawLabel(
            ctx,
            inContact ? "contact" : "flight",
            p.x + 14,
            p.y,
            inContact ? COLORS.contact : COLORS.flight,
          );
        }
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [videoRef, frames]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />;
}
