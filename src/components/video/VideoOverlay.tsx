"use client";

import { useEffect, useRef } from "react";
import type { OverlayFrame } from "@/lib/video/overlay";
import {
  detectStepMarks,
  applyRealWorldStepDistances,
  type StepDistanceScale,
} from "@/lib/video/steps";
import { estimateCameraMotion, cameraOffsetAtTime, gateFrameXAt } from "@/lib/video/camera";
import {
  getDisplayedVideoRect,
  projectLandmark,
  type DisplayRect,
  type Point2D,
} from "@/lib/video/coordinates";
import type { CalibrationGates } from "@/lib/calibration/gates";
import {
  athleteScalePxPerCm,
  trochanterDisplayCorrection,
  type TrochanterMarker,
} from "@/lib/video/overlayAlignment";
import type { FollowBox } from "@/lib/video/follow";

/** A cone placed while marking a timing-gate bar (carries its clip time). */
export type PendingCone = Point2D & { t: number };

/** Which overlay layers are drawn. Owned by {@link OverlayVideoPlayer}. */
export type OverlayToggles = {
  skeleton: boolean;
  angles: boolean;
  arms: boolean;
  comTrail: boolean;
  velocity: boolean;
  footLabels: boolean;
  stepMarks: boolean;
  /** Hidden coaching-view declutter switch: shows step indices, the step path,
   * and relative (uncalibrated) distances. Off by default. */
  debug: boolean;
};

/** Arm chains highlighted by the arm layer: [shoulder, elbow, wrist] per side. */
const armChains = [
  ["leftShoulder", "leftElbow", "leftWrist"],
  ["rightShoulder", "rightElbow", "rightWrist"],
] as const;

/** Two clicked gate points + their known distance, normalized to the frame. */
export type OverlayCalibrationPoints = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  distanceM: number;
  /** Clip time each gate was placed (Day 64), for ground-anchoring under pan. */
  aTimeS?: number | null;
  bTimeS?: number | null;
};

type Props = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  frames: OverlayFrame[];
  toggles: OverlayToggles;
  /** Landmark key currently under the cursor (transient highlight). */
  hoveredJoint: string | null;
  /** Landmark key pinned by a click (persistent highlight). */
  selectedJoint: string | null;
  /** Calibration scale for step distances; null → show relative (uncalibrated). */
  stepScale?: StepDistanceScale | null;
  /** Legacy saved manual calibration line (pre-Day-66), drawn fixed on the ground. */
  calibrationPoints?: OverlayCalibrationPoints | null;
  /** Saved timing-gate BARS (Day 66) — drawn cone-to-cone across the lane. */
  calibrationGates?: CalibrationGates | null;
  /** Cones placed so far while marking gates (0–4): [startC1, startC2, finishC1, finishC2]. */
  pendingGates?: PendingCone[];
  trochanterMarker?: TrochanterMarker | null;
  athleteHeightCm?: number | null;
  autoFollow?: boolean;
  followStateRef?: React.RefObject<{ current: FollowBox; target: FollowBox } | null>;
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
  bone: "#F5F5F7", // AVA white — neutral, high-contrast skeleton (no blue)
  jointFill: "#f8fafc", // slate-50
  jointStroke: "#0f172a", // slate-900
  jointFillSoft: "rgba(248, 250, 252, 0.7)", // slate-50, semi-transparent tiny dots
  jointStrokeSoft: "rgba(15, 23, 42, 0.45)", // slate-900, thin soft outline
  angle: "#fde047", // yellow-300
  com: "#fb923c", // orange-400
  trail: "rgba(251, 146, 60, 0.65)",
  velocity: "#f43f5e", // rose-500
  contact: "#4ade80", // green-400
  flight: "#cbd5e1", // slate-300
  hover: "#fbbf24", // amber-400
  selected: "#D72638", // AVA red — selection highlight (no cyan)
  arm: "#D4AF37", // gold — upper-arm/forearm segments (distinct from white legs)
  armAngle: "#E4C25A", // light gold — arm angle labels
  stepLeft: "#ef4444", // red-500 — left-foot ground contacts
  stepRight: "#22c55e", // green-500 — right-foot ground contacts
  stepPath: "rgba(226, 232, 240, 0.75)", // slate-200 — connecting step path (debug only)
  stepDist: "#e2e8f0", // slate-200 — uncalibrated distance labels
  calibration: "#facc15", // yellow-400 — manual calibration line + points
  calibrationPending: "#fef08a", // yellow-200 — points being placed
  zoneShade: "rgba(250, 204, 21, 0.16)", // translucent yellow — the detection zone fill
  labelBg: "rgba(15, 23, 42, 0.72)",
} as const;

/** Default overlay label font, and a smaller one for the decluttered step labels. */
const DEFAULT_LABEL_FONT = "600 7px system-ui, sans-serif";
const STEP_LABEL_FONT = "600 11px system-ui, sans-serif";

/** Axis-aligned box a pill label occupies, used to keep labels from overlapping. */
type LabelBox = { x: number; y: number; w: number; h: number };

/** The box {@link drawLabel} paints for `text` anchored at (x, y). */
function labelBox(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): LabelBox {
  const padX = 3;
  const padY = 2;
  const h = 9;
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
  const padX = 3;
  const padY = 2;
  const h = 9;
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
  stepScale = null,
  calibrationPoints = null,
  calibrationGates = null,
  pendingGates = [],
  trochanterMarker = null,
  athleteHeightCm = null,
  autoFollow = false,
  followStateRef,
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
  // Calibration line + in-progress clicks are read from refs too, so placing a
  // point (which updates on every click) never restarts the draw loop.
  const calibrationRef = useRef(calibrationPoints);
  calibrationRef.current = calibrationPoints;
  const calibrationGatesRef = useRef(calibrationGates);
  calibrationGatesRef.current = calibrationGates;
  const pendingRef = useRef(pendingGates);
  pendingRef.current = pendingGates;
  const trochanterRef = useRef(trochanterMarker);
  trochanterRef.current = trochanterMarker;

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !frames.length) return;

    // Detect step marks once per clip (cheap, O(frames)); the draw loop only
    // reveals the ones reached by the current playback time. When a calibration
    // scale is present, each gap also carries a real-world metre distance.
    const stepMarks = applyRealWorldStepDistances(detectStepMarks(frames), stepScale);

    // Camera-motion track (Day 64): lets a contact/gate captured at one time be
    // reprojected to where that ground point appears at the current time, so marks
    // stay planted on the track under a panning camera (identity when static).
    const cameraTrack = estimateCameraMotion(frames);

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

      // The media clock is authoritative at every playback rate. A fixed guessed
      // frame lead caused visible drift on non-60fps footage and while rate changed.
      const currentTime = video.currentTime;
      let frame = frames[0];
      for (let i = 0; i < frames.length; i++) {
        if (frames[i].time <= currentTime) {
          frame = frames[i];
        } else {
          // First frame after currentTime — keep whichever of the two is nearer.
          if (Math.abs(frames[i].time - currentTime) < Math.abs(frame.time - currentTime)) {
            frame = frames[i];
          }
          break;
        }
      }

      // Camera offset at the current time; ground points captured at `atTime` are
      // shifted by (offset_then − offset_now) so they track the ground under pan.
      const camNow = cameraOffsetAtTime(cameraTrack, currentTime);
      const groundToFrame = (nx: number, ny: number, atTime: number): Point2D => {
        const camThen = cameraOffsetAtTime(cameraTrack, atTime);
        return { x: nx + (camThen.x - camNow.x), y: ny + (camThen.y - camNow.y) };
      };

      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.font = DEFAULT_LABEL_FONT;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";

      // Skeleton sync (Day 76): the per-frame pose layers (skeleton, arms, angles,
      // COM, velocity, foot labels) track the MOVING athlete, so they trail slightly
      // at fast playback. We only draw them when the video is PAUSED (no motion to
      // trail) or at 0.25× — where sync is exact — for a clean, trustworthy overlay.
      // Ground-anchored layers (step marks, gates) are unaffected and always drawn.
      const showPose = video.paused || video.playbackRate < 0.4;

      // A trochanter anchor is a small DISPLAY-ONLY translation. It never enters
      // the stored landmarks, gate projection, step marks, or metric pipeline.
      const correction = trochanterDisplayCorrection(frames, trochanterRef.current);
      ctx.save();
      ctx.translate(correction.dx * picture.width, correction.dy * picture.height);

      // --- Skeleton (bones + joints) ---
      if (show.skeleton && showPose) {
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
          ctx.lineWidth = onSelected || onHovered ? 3.75 : 2.25;

          ctx.beginPath();
          ctx.moveTo(ap.x, ap.y);
          ctx.lineTo(bp.x, bp.y);
          ctx.stroke();
        }

        // Landmark dots (Day 73 cleanup): tiny (1.5 px) and semi-transparent so the
        // skeleton LINES read as a stick figure instead of a blob of circles when the
        // athlete is far/small. Visual only — coordinates are unchanged.
        ctx.lineWidth = 0.75;
        for (const point of Object.values(frame.landmarks)) {
          if (!point) continue;
          const p = project(point);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
          ctx.fillStyle = COLORS.jointFillSoft;
          ctx.fill();
          ctx.strokeStyle = COLORS.jointStrokeSoft;
          ctx.stroke();
        }
      }

      // --- Arm & shoulder layer (Day 54): emphasize upper-arm + forearm
      // segments and the shoulder line in a distinct colour, on top of the base
      // skeleton, so arm drive reads clearly during playback. Angle labels for
      // the arms are drawn later, alongside the other angle labels. ---
      if (show.arms && showPose) {
        // Shoulder line, then each arm's upper-arm + forearm segments.
        const armSegments: [string, string][] = [["leftShoulder", "rightShoulder"]];
        for (const [shoulder, elbow, wrist] of armChains) {
          armSegments.push([shoulder, elbow], [elbow, wrist]);
        }

        ctx.strokeStyle = COLORS.arm;
        ctx.lineWidth = 3;
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

        // Small joints at shoulders, elbows, and wrists (Day 73: shrunk so the arm
        // lines are what read, not the dots).
        ctx.lineWidth = 0.75;
        for (const [shoulder, elbow, wrist] of armChains) {
          for (const name of [shoulder, elbow, wrist]) {
            const pt = frame.landmarks[name];
            if (!pt) continue;
            const p = project(pt);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.25, 0, Math.PI * 2);
            ctx.fillStyle = COLORS.jointFillSoft;
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

        if (show.comTrail && showPose) {
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

        if (show.velocity && frame.velocity && showPose) {
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

      if (show.angles && showPose) {
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
      if (show.arms && showPose) {
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
      if (show.footLabels && showPose) {
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

      // End pose-only anatomical correction before ground/gate annotations.
      ctx.restore();

      // --- Step marks (Day 56, ground-fixed Day 62, decluttered Day 63): each
      // ground contact leaves ONE permanent dot at the exact spot the foot struck
      // (red = left, green = right) and ONE step-length label — nothing else — so
      // the overlay reads like chalk marks on the track. The dot is drawn from the
      // contact's STORED position, never the live foot, so it stays put as the
      // athlete runs on (and moves with the ground under Auto Follow). Indices and
      // the connecting path are hidden behind debug mode. A contact appears once
      // playback reaches it and disappears again on rewind. ---
      // Calibrated measurement zone (world-x bounds). Mirrors computeSprintMeasurements'
      // gate math EXACTLY — the SAME reduced gate midpoints (manual calibration points)
      // and the SAME camera-offset world-x (frameX + offset at placement time). Used
      // ONLY to decide whether a stride-length LABEL is drawn: the foot-contact marker,
      // its position/appearance, and every calculation are untouched. Null when there is
      // no calibrated zone, in which case labels render exactly as before.
      const zonePts = calibrationRef.current;
      const zoneWorldX = (frameX: number, timeS: number | null | undefined): number =>
        cameraTrack.available && timeS != null ? frameX + cameraOffsetAtTime(cameraTrack, timeS).x : frameX;
      const zoneMinX = zonePts
        ? Math.min(zoneWorldX(zonePts.ax, zonePts.aTimeS), zoneWorldX(zonePts.bx, zonePts.bTimeS))
        : null;
      const zoneMaxX = zonePts
        ? Math.max(zoneWorldX(zonePts.ax, zonePts.aTimeS), zoneWorldX(zonePts.bx, zonePts.bTimeS))
        : null;
      const labelInZone = (m: { x: number; time: number }): boolean => {
        if (zoneMinX == null || zoneMaxX == null) return true; // no calibrated zone → unchanged
        const wx = m.x + cameraOffsetAtTime(cameraTrack, m.time).x;
        return wx >= zoneMinX - 1e-9 && wx <= zoneMaxX + 1e-9;
      };

      if (show.stepMarks && stepMarks.length) {
        const reached = stepMarks.filter((m) => m.time <= currentTime + 1e-3);

        // Debug only: dashed step-to-step path linking consecutive contacts.
        if (show.debug && reached.length > 1) {
          ctx.strokeStyle = COLORS.stepPath;
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          reached.forEach((m, i) => {
            const p = project(groundToFrame(m.x, m.y, m.time));
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });
          ctx.stroke();
          ctx.setLineDash([]);
        }

        for (const mark of reached) {
          // Reproject the contact from its capture time into the current view so
          // it stays planted on the track as the camera pans (identity if static).
          const p = project(groundToFrame(mark.x, mark.y, mark.time));
          const color = mark.side === "left" ? COLORS.stepLeft : COLORS.stepRight;

          // One SMALL dot at the fixed ground contact position (Day 68: −50% size
          // + thinner outline to cut overlay clutter).
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = COLORS.jointStroke;
          ctx.stroke();

          // One step-length label (the gap from the previous contact), anchored at
          // this contact's ground spot — the ONLY text on a step in normal mode.
          // Real metres when calibrated; a relative estimate only in debug mode.
          // Never a contact/flight time. Drawn in a smaller font to stay unobtrusive.
          //
          // Show the numeric stride label ONLY for contacts INSIDE the calibrated zone
          // (the ones trusted metrics actually use). Out-of-zone contacts keep their
          // marker but drop the label — label-only, no effect on position or math.
          const meters = mark.distanceMetersFromPrev;
          ctx.font = STEP_LABEL_FONT;
          if (meters != null) {
            if (labelInZone(mark)) {
              placeLabel(ctx, `${meters.toFixed(2)} m`, p.x + 6, p.y + 10, color, placedLabels);
            }
          } else if (show.debug && mark.distanceFromPrev != null) {
            placeLabel(ctx, `≈${mark.distanceFromPrev.toFixed(2)} rel`, p.x + 6, p.y + 10, color, placedLabels);
          }
          ctx.font = DEFAULT_LABEL_FONT;

          // Debug only: the chronological side + index (L1/R2/…).
          if (show.debug) {
            placeLabel(ctx, `${mark.side === "left" ? "L" : "R"}${mark.index}`, p.x + 9, p.y - 11, color, placedLabels);
          }
        }
      }

      // --- Timing-gate BARS (Day 66): each gate is a real timing bar drawn
      // cone-to-cone across the lane (not a full-height line). Every cone is
      // world-anchored via `gateFrameXAt` — lifted to a fixed WORLD position
      // (frame-x at placement + the camera offset then) and projected back into the
      // CURRENT frame view — so the bar stays planted on the track: on a static
      // camera it sits still while the athlete runs THROUGH it; under a pan it
      // slides with the ground and, once a cone's world location leaves the frame,
      // the bar is not drawn (it never follows the athlete). ---
      // Small cone marker at a gate endpoint (Day 73: halved again to 1.75 px — the
      // yellow A/B laser-gate set-point dots, kept minimal. Visual only; the bar's
      // coordinates, labels, and calibration math are unchanged).
      const drawCone = (p: Point2D, color: string) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
        ctx.fill();
      };

      // Geometry of one gate bar: its two cone endpoints (frame px) + midpoint, or
      // null when either cone has panned outside the frame view.
      type BarGeom = { p1: Point2D; p2: Point2D; mid: Point2D };
      const barGeom = (c1: Point2D, c2: Point2D, timeS: number | null | undefined): BarGeom | null => {
        const rx1 = gateFrameXAt(c1.x, timeS, cameraTrack, currentTime);
        const rx2 = gateFrameXAt(c2.x, timeS, cameraTrack, currentTime);
        if (rx1 == null || rx2 == null) return null; // a cone is outside the frame
        const p1 = project({ x: rx1, y: c1.y });
        const p2 = project({ x: rx2, y: c2.y });
        return { p1, p2, mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } };
      };

      // Stroke a gate bar (cone-to-cone) with cone markers and an optional tag.
      // Day 74: thin (2 px) so the laser line is precise and unobtrusive.
      const strokeBar = (g: BarGeom, color: string, tag?: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(g.p1.x, g.p1.y);
        ctx.lineTo(g.p2.x, g.p2.y);
        ctx.stroke();
        drawCone(g.p1, color);
        drawCone(g.p2, color);
        if (tag) placeLabel(ctx, tag, g.mid.x + 8, g.mid.y - 12, color, placedLabels);
      };

      // Compute + stroke a gate bar in one step. Returns the midpoint, or null.
      const drawBar = (
        c1: Point2D,
        c2: Point2D,
        timeS: number | null | undefined,
        color: string,
        tag?: string,
      ): Point2D | null => {
        const g = barGeom(c1, c2, timeS);
        if (!g) return null;
        strokeBar(g, color, tag);
        return g.mid;
      };

      // Legacy vertical timing line (pre-Day-66 sessions store only two midpoints).
      const drawLegacyGate = (
        normX: number,
        atTime: number | null | undefined,
        color: string,
        tag?: string,
      ): number | null => {
        const renderedX = gateFrameXAt(normX, atTime, cameraTrack, currentTime);
        if (renderedX == null) return null;
        const x = project({ x: renderedX, y: 0 }).x;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, picture.height);
        ctx.stroke();
        if (tag) placeLabel(ctx, tag, x + 6, 14, color, placedLabels);
        return renderedX;
      };

      const savedGates = calibrationGatesRef.current;
      const savedCalibration = calibrationRef.current;
      if (savedGates) {
        const startG = barGeom(savedGates.startGate.c1, savedGates.startGate.c2, savedGates.startGate.timeS);
        const finishG = barGeom(savedGates.finishGate.c1, savedGates.finishGate.c2, savedGates.finishGate.timeS);
        // Yellow shaded DETECTION ZONE (Day 67): a translucent band between the two
        // gate bars, extending ~9 m up the lane so the active timing zone is obvious.
        // Its height uses the known gate distance for scale (px-per-metre = the gate
        // midpoint separation ÷ distanceM). Drawn first so the bars sit on top.
        if (startG && finishG && savedGates.distanceM > 0) {
          const sepPx = Math.hypot(finishG.mid.x - startG.mid.x, finishG.mid.y - startG.mid.y);
          const zoneH = (9 / savedGates.distanceM) * sepPx; // ~9 m upward, in px
          ctx.fillStyle = COLORS.zoneShade;
          ctx.beginPath();
          ctx.moveTo(startG.mid.x, startG.mid.y);
          ctx.lineTo(finishG.mid.x, finishG.mid.y);
          ctx.lineTo(finishG.mid.x, finishG.mid.y - zoneH);
          ctx.lineTo(startG.mid.x, startG.mid.y - zoneH);
          ctx.closePath();
          ctx.fill();
        }
        if (startG) strokeBar(startG, COLORS.calibration, "Start");
        if (finishG) strokeBar(finishG, COLORS.calibration, "Finish");
        // Label the known distance between the bars only when both are in view.
        if (startG && finishG) {
          const label = `${savedGates.distanceM}m`;
          ctx.font = "700 11px system-ui, sans-serif";
          placeLabel(ctx, label, Math.max(8, (picture.width - ctx.measureText(label).width) / 2), 14,
            COLORS.calibration, placedLabels);
          ctx.font = DEFAULT_LABEL_FONT;
        }
      } else if (savedCalibration) {
        // Backward-compat: old two-point calibrations render as vertical lines.
        const aX = drawLegacyGate(savedCalibration.ax, savedCalibration.aTimeS, COLORS.calibration, "A");
        const bX = drawLegacyGate(savedCalibration.bx, savedCalibration.bTimeS, COLORS.calibration, "B");
        if (aX != null && bX != null) {
          const mid = project({ x: (aX + bX) / 2, y: 0 }).x;
          placeLabel(ctx, `${savedCalibration.distanceM} m gate`, mid, 30, COLORS.calibration, placedLabels);
        }
      }

      // In-progress placement: [startC1, startC2, finishC1, finishC2]. Complete
      // pairs draw as a pending bar; a lone cone draws as a marker until its partner
      // is placed. Each cone is world-anchored by its own click time.
      const pending = pendingRef.current;
      if (pending && pending.length) {
        const pc = COLORS.calibrationPending;
        const drawPendingCone = (c: PendingCone) => {
          const rx = gateFrameXAt(c.x, c.t, cameraTrack, currentTime);
          if (rx != null) drawCone(project({ x: rx, y: c.y }), pc);
        };
        if (pending.length >= 2) drawBar(pending[0], pending[1], pending[0].t, pc, "Start");
        else if (pending.length === 1) drawPendingCone(pending[0]);
        if (pending.length >= 4) drawBar(pending[2], pending[3], pending[2].t, pc, "Finish");
        else if (pending.length === 3) drawPendingCone(pending[2]);
      }


      if (show.debug) {
        const rawHip = correction.detectedHip ? project(correction.detectedHip) : null;
        const marker = correction.marker ? project(correction.marker) : null;
        if (rawHip) {
          ctx.fillStyle = "#38bdf8";
          ctx.beginPath(); ctx.arc(rawHip.x, rawHip.y, 4, 0, Math.PI * 2); ctx.fill();
        }
        if (marker) {
          ctx.strokeStyle = "#f472b6"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(marker.x, marker.y, 6, 0, Math.PI * 2); ctx.stroke();
          if (rawHip) { ctx.beginPath(); ctx.moveTo(rawHip.x, rawHip.y); ctx.lineTo(marker.x, marker.y); ctx.stroke(); }
        }
        const follow = followStateRef?.current;
        const pxError = Math.hypot(correction.dx * picture.width, correction.dy * picture.height);
        const scale = athleteScalePxPerCm(frame, picture.height, athleteHeightCm);
        const lines = [
          `video ${currentTime.toFixed(3)}s · pose ${frame.time.toFixed(3)}s`,
          `render ${picture.width.toFixed(0)}×${picture.height.toFixed(0)} · canvas ${canvas.width}×${canvas.height} @${dpr.toFixed(2)}x`,
          `trochanter ${marker ? `${marker.x.toFixed(1)},${marker.y.toFixed(1)}` : "not set"} · offset ${(correction.dx * picture.width).toFixed(1)},${(correction.dy * picture.height).toFixed(1)}px`,
          `height ${athleteHeightCm ?? "—"}cm · scale ${scale?.toFixed(3) ?? "—"} px/cm · error ${pxError.toFixed(1)}px`,
          `follow ${autoFollow ? "on" : "off"} · transform ${follow ? `${follow.current.scale.toFixed(3)} @ ${follow.current.cx.toFixed(3)},${follow.current.cy.toFixed(3)}` : "identity"}`,
          `target ${follow ? `${follow.target.cx.toFixed(3)},${follow.target.cy.toFixed(3)}` : "—"} · offset ${follow ? `${(follow.current.cx - .5).toFixed(3)},${(follow.current.cy - .5).toFixed(3)}` : "0,0"}`,
        ];
        ctx.font = "600 10px ui-monospace, monospace";
        const panelW = Math.min(picture.width - 16, 520);
        ctx.fillStyle = "rgba(3,7,18,.82)"; ctx.fillRect(8, 28, panelW, lines.length * 15 + 12);
        ctx.fillStyle = "#e2e8f0";
        lines.forEach((line, i) => ctx.fillText(line, 14, 40 + i * 15));
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [videoRef, frames, stepScale]);

  // Position/size are driven imperatively in the draw loop so the canvas covers
  // exactly the displayed picture (letterbox-aware); left/top default to 0.
  return <canvas ref={canvasRef} className="pointer-events-none absolute left-0 top-0" />;
}
