"use client";

import { useEffect, useRef } from "react";
import type { OverlayFrame } from "@/lib/video/overlay";
import { detectStepMarks } from "@/lib/video/steps";
import {
  getDisplayedVideoRect,
  projectLandmark,
  type DisplayRect,
  type Point2D,
} from "@/lib/video/coordinates";

/** Which overlay layers are drawn. Owned by {@link OverlayVideoPlayer}. */
export type OverlayToggles = {
  skeleton: boolean;
  angles: boolean;
  arms: boolean;
  comTrail: boolean;
  velocity: boolean;
  footLabels: boolean;
  stepMarks: boolean;
};

/** Arm chains highlighted by the arm layer: [shoulder, elbow, wrist] per side. */
const armChains = [
  ["leftShoulder", "leftElbow", "leftWrist"],
  ["rightShoulder", "rightElbow", "rightWrist"],
] as const;

/** Most recent step contacts to draw at once (rolling window, keeps it legible). */
const MAX_VISIBLE_STEP_MARKS = 6;

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
  arm: "#a78bfa", // violet-400 — upper-arm/forearm segments
  armAngle: "#c4b5fd", // violet-300 — arm angle labels
  stepLeft: "#2dd4bf", // teal-400 — left-foot step marks
  stepRight: "#fb7185", // rose-400 — right-foot step marks
  stepPath: "rgba(226, 232, 240, 0.75)", // slate-200 — connecting step path
  stepDist: "#e2e8f0", // slate-200 — uncalibrated distance labels
  labelBg: "rgba(15, 23, 42, 0.72)",
} as const;

/** Axis-aligned box a pill label occupies, used to keep labels from overlapping. */
type LabelBox = { x: number; y: number; w: number; h: number };

/** The box {@link drawLabel} paints for `text` anchored at (x, y). */
function labelBox(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): LabelBox {
  const padX = 5;
  const padY = 3;
  const h = 16;
  const w = ctx.measureText(text).width;
  return { x: x - padX, y: y - h / 2 - padY, w: w + padX * 2, h: h + padY * 2 };
}

function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Draw a label near (x, y), nudging it vertically until it clears every box in
 * `placed`, then record its box. Keeps live angle labels readable and
 * non-overlapping while staying attached to their joint. Mutates `placed`.
 */
function placeLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  placed: LabelBox[],
) {
  let box = labelBox(ctx, text, x, y);
  if (placed.some((p) => boxesOverlap(box, p))) {
    const step = box.h + 2;
    const y0 = y;
    // Try growing offsets, alternating down/up (1,-1,2,-2,…) so a crowded label
    // settles as close to its anchor as possible instead of drifting one way.
    for (let i = 1; i <= 8; i++) {
      const offset = Math.ceil(i / 2) * step * (i % 2 === 1 ? 1 : -1);
      const candidate = labelBox(ctx, text, x, y0 + offset);
      if (i === 8 || !placed.some((p) => boxesOverlap(candidate, p))) {
        y = y0 + offset;
        box = candidate;
        break;
      }
    }
  }
  drawLabel(ctx, text, x, y, color);
  placed.push(box);
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
  // Last applied canvas geometry ("x:y:w:h:dpr"), so we only touch the bitmap /
  // style when the displayed picture actually changes size or position.
  const geometryRef = useRef<string>("");

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

    // Detect step marks once per clip (cheap, O(frames)); the draw loop only
    // reveals the ones reached by the current playback time.
    const stepMarks = detectStepMarks(frames);

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Map to the rectangle the picture actually occupies inside the <video>
      // (letterbox-aware), and back the canvas with device pixels so lines stay
      // crisp. The canvas is positioned to cover exactly that rectangle, so all
      // drawing happens in picture-local CSS pixels.
      const dpr = window.devicePixelRatio || 1;
      const picture = getDisplayedVideoRect(video);
      const geometry = `${picture.x}:${picture.y}:${picture.width}:${picture.height}:${dpr}`;
      if (geometry !== geometryRef.current) {
        geometryRef.current = geometry;
        canvas.style.left = `${picture.x}px`;
        canvas.style.top = `${picture.y}px`;
        canvas.style.width = `${picture.width}px`;
        canvas.style.height = `${picture.height}px`;
        canvas.width = Math.max(1, Math.round(picture.width * dpr));
        canvas.height = Math.max(1, Math.round(picture.height * dpr));
      }

      const rect: DisplayRect = { x: 0, y: 0, width: picture.width, height: picture.height };
      const project = (point: Point2D) =>
        projectLandmark(point, rect, video.videoWidth, video.videoHeight);

      const show = togglesRef.current;
      const hovered = hoveredRef.current;
      const selected = selectedRef.current;

      // Draw in CSS pixels; the DPR scale keeps the backing store sharp.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, picture.width, picture.height);

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

          const ap = project(a);
          const bp = project(b);

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
          const p = project(point);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = COLORS.jointFill;
          ctx.fill();
          ctx.strokeStyle = COLORS.jointStroke;
          ctx.stroke();
        }
      }

      // --- Arm & shoulder layer (Day 54): emphasize upper-arm + forearm
      // segments and the shoulder line in a distinct colour, on top of the base
      // skeleton, so arm drive reads clearly during playback. Angle labels for
      // the arms are drawn later, alongside the other angle labels. ---
      if (show.arms) {
        // Shoulder line, then each arm's upper-arm + forearm segments.
        const armSegments: [string, string][] = [["leftShoulder", "rightShoulder"]];
        for (const [shoulder, elbow, wrist] of armChains) {
          armSegments.push([shoulder, elbow], [elbow, wrist]);
        }

        ctx.strokeStyle = COLORS.arm;
        ctx.lineWidth = 4;
        for (const [aName, bName] of armSegments) {
          const a = frame.landmarks[aName];
          const b = frame.landmarks[bName];
          if (!a || !b) continue;
          const ap = project(a);
          const bp = project(b);
          ctx.beginPath();
          ctx.moveTo(ap.x, ap.y);
          ctx.lineTo(bp.x, bp.y);
          ctx.stroke();
        }

        // Emphasized joints at shoulders, elbows, and wrists.
        ctx.lineWidth = 2;
        for (const [shoulder, elbow, wrist] of armChains) {
          for (const name of [shoulder, elbow, wrist]) {
            const pt = frame.landmarks[name];
            if (!pt) continue;
            const p = project(pt);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = COLORS.jointFill;
            ctx.fill();
            ctx.strokeStyle = COLORS.arm;
            ctx.stroke();
          }
        }
      }

      // --- Hover / selection markers (drawn regardless of the skeleton toggle
      // so the inspected joint stays visible even with the skeleton hidden). ---
      const drawMarker = (name: string, color: string, radius: number) => {
        const pt = frame.landmarks[name];
        if (!pt) return null;
        const p = project(pt);
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
        const com = project(frame.centerOfMass);

        if (show.comTrail) {
          const trail = frames
            .filter((f) => f.frame <= frame.frame && f.frame >= frame.frame - 30)
            .map((f) => f.centerOfMass)
            .filter(Boolean);

          ctx.strokeStyle = COLORS.trail;
          ctx.lineWidth = 3;
          ctx.beginPath();
          trail.forEach((p, i) => {
            const point = project(p!);
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

      // --- Angle labels (lower body + arms) ---
      // Shared registry so arm labels can avoid overlapping the lower-body ones.
      // Lower-body labels keep their original fixed positions; only the newer arm
      // labels are nudged to stay readable.
      const placedLabels: LabelBox[] = [];

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
          const p = project(point);
          const text = `${value}°`;
          drawLabel(ctx, text, p.x + 10, p.y - 10, COLORS.angle);
          placedLabels.push(labelBox(ctx, text, p.x + 10, p.y - 10));
        }
      }

      // Elbow + shoulder angles, part of the arm layer. Placed with overlap
      // avoidance so both arms' labels stay legible even when they cross.
      if (show.arms) {
        const armAngleLabels = [
          ["leftElbow", frame.angles.leftElbow],
          ["rightElbow", frame.angles.rightElbow],
          ["leftShoulder", frame.angles.leftShoulder],
          ["rightShoulder", frame.angles.rightShoulder],
        ] as const;

        for (const [joint, value] of armAngleLabels) {
          const point = frame.landmarks[joint];
          if (!point || value == null) continue;
          const p = project(point);
          placeLabel(ctx, `${value}°`, p.x + 10, p.y - 10, COLORS.armAngle, placedLabels);
        }
      }

      // --- Foot-contact labels ---
      if (show.footLabels) {
        for (const side of ["left", "right"] as const) {
          const key = side === "left" ? "leftFootIndex" : "rightFootIndex";
          const foot = frame.landmarks[key];
          if (!foot) continue;

          const p = project(foot);
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

      // --- Step marks (Day 56): accumulated ground-contact footprints up to the
      // current time — L/R colour, chronological index, and an UNCALIBRATED
      // step-distance estimate (normalized image units, not real-world metres). ---
      if (show.stepMarks && stepMarks.length) {
        // Show a rolling window of the most recent contacts, not the whole run —
        // early strides (athlete far from camera) compress into a tiny region and
        // would pile up. Recent steps stay readable and sit near the athlete, so
        // they compose well with Auto Follow.
        const reached = stepMarks
          .filter((m) => m.time <= currentTime + 1e-3)
          .slice(-MAX_VISIBLE_STEP_MARKS);

        // Dashed path linking consecutive contacts (the step-to-step trail).
        if (reached.length > 1) {
          ctx.strokeStyle = COLORS.stepPath;
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          reached.forEach((m, i) => {
            const p = project(m);
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });
          ctx.stroke();
          ctx.setLineDash([]);

          // Uncalibrated distance at each segment midpoint (≈ signals estimate).
          for (let i = 1; i < reached.length; i++) {
            const d = reached[i].distanceFromPrev;
            if (d == null) continue;
            const a = project(reached[i - 1]);
            const b = project(reached[i]);
            drawLabel(ctx, `≈${d.toFixed(2)}`, (a.x + b.x) / 2, (a.y + b.y) / 2, COLORS.stepDist);
          }
        }

        // The contact marks themselves, with side + index labels.
        for (const mark of reached) {
          const p = project(mark);
          const color = mark.side === "left" ? COLORS.stepLeft : COLORS.stepRight;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = COLORS.jointStroke;
          ctx.stroke();
          drawLabel(ctx, `${mark.side === "left" ? "L" : "R"}${mark.index}`, p.x + 9, p.y + 11, color);
        }
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [videoRef, frames]);

  // Position/size are driven imperatively in the draw loop so the canvas covers
  // exactly the displayed picture (letterbox-aware); left/top default to 0.
  return <canvas ref={canvasRef} className="pointer-events-none absolute left-0 top-0" />;
}
