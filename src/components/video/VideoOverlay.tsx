"use client";

import { useEffect, useRef } from "react";
import type { OverlayFrame } from "@/lib/video/overlay";
import {
  detectStepMarks,
  applyRealWorldStepDistances,
  type StepDistanceScale,
} from "@/lib/video/steps";
import {
  propagateAnchorFromSetupToFrame,
  propagateSourcePoint,
  sourceLineIntersectsViewport,
} from "@/lib/calibration/zoneAnchors";
import {
  canonicalWorldToSourceFrame,
  projectCanonicalWorldLine,
  sourceLineToCanonicalWorld,
  sourcePointToCanonicalWorld,
  WORLD_COORDINATE_SCHEMA_VERSION,
} from "@/lib/video/worldProjection";
import type { RawCameraEvidence } from "@/lib/video/recordingMode";
import {
  getDisplayedVideoRect,
  projectLandmark,
  type DisplayRect,
  type Point2D,
} from "@/lib/video/coordinates";
import type { CalibrationGates } from "@/lib/calibration/gates";
import { selectRenderableGateGeometry } from "@/lib/calibration/authority";
import {
  athleteScalePxPerCm,
  trochanterDisplayCorrection,
  type TrochanterMarker,
} from "@/lib/video/overlayAlignment";
import type { FollowBox } from "@/lib/video/follow";
import { analyzeZoneSteps } from "@/lib/video/zoneStepAnalysis";

/** A cone placed while marking a timing-gate bar (carries its clip time). */
export type PendingCone = Point2D & { t: number; sourceFrameIndex: number };

/** Which overlay layers are drawn. Owned by {@link OverlayVideoPlayer}. */
export type OverlayToggles = {
  skeleton: boolean;
  angles: boolean;
  arms: boolean;
  comTrail: boolean;
  velocity: boolean;
  footLabels: boolean;
  stepMarks: boolean;
  /** Experimental A/B pose comparison: overlays the second engine's skeleton
   * (RTMPose) as a dashed purple stick figure over the solid MediaPipe primary,
   * with a compact frame/timestamp/backend HUD. Visual only — never touches
   * metrics. Off by default. */
  compare: boolean;
  /** Hidden coaching-view declutter switch: shows step indices, the step path,
   * relative (uncalibrated) distances, and the full alignment/follow diagnostics.
   * Dev-only, off by default, and not exposed in the customer UI. */
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
  cameraEvidence?: RawCameraEvidence;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
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

// Overlay palette (premium sports identity): the video is the hero — overlays stay
// minimal and readable, using blue / white / muted-gray, with green reserved for
// success indicators. Start & finish gates are blue; left contact blue, right contact
// white; ground-contact success is green.
const COLORS = {
  bone: "#f5f7fb", // AVA white — neutral, high-contrast skeleton
  jointFill: "#f8fafc",
  jointStroke: "#0f172a",
  jointFillSoft: "rgba(248, 250, 252, 0.7)",
  jointStrokeSoft: "rgba(15, 23, 42, 0.45)",
  angle: "#b3bccb", // muted gray — analytical angle labels (no yellow)
  com: "#3b8eff", // blue — centre-of-mass marker
  trail: "rgba(47, 128, 237, 0.55)", // soft blue COM trail
  velocity: "#f5f7fb", // white — velocity vector
  contact: "#89d46a", // green — success indicator (ground contact)
  flight: "#b3bccb", // muted gray
  hover: "#3b8eff", // blue — hover highlight
  selected: "#2f80ed", // AVA blue — selection highlight
  arm: "#b3bccb", // muted gray — upper-arm/forearm segments
  armAngle: "#7e8797", // muted — arm angle labels
  stepLeft: "#2f80ed", // blue — left-foot ground contacts
  stepRight: "#f5f7fb", // white — right-foot ground contacts
  stepPath: "rgba(179, 188, 203, 0.6)", // muted gray — connecting step path (debug only)
  stepDist: "#b3bccb", // muted gray — uncalibrated distance labels
  calibration: "#2f80ed", // blue — timing-gate bars (start & finish)
  calibrationPending: "#3b8eff", // light blue — points being placed
  labelBg: "rgba(8, 16, 25, 0.78)",
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
  cameraEvidence,
  sourceWidth,
  sourceHeight,
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
    const worldSteps = stepMarks.map((mark) => ({
      ...mark,
      world: cameraEvidence && sourceWidth && sourceHeight
        ? sourcePointToCanonicalWorld(
            mark,
            mark.sourceFrameIndex,
            cameraEvidence,
            sourceWidth,
            sourceHeight,
          )
        : null,
    }));
    // Display-only step labels use the same immutable world points as the dots.
    // This does not alter worker metrics or timing values.
    const canonicalSteps = worldSteps.map((mark, index) => {
      const previous = worldSteps[index - 1];
      if (!stepScale || !mark.world?.projectable || !previous?.world?.projectable) return mark;
      const dx = (mark.world.x - previous.world.x) * stepScale.frameWidth;
      const dy = (mark.world.y - previous.world.y) * stepScale.frameHeight;
      return { ...mark, distanceMetersFromPrev: Math.hypot(dx, dy) * stepScale.metersPerPixel };
    });
    const zoneMetrics = (() => {
      const gates = calibrationGatesRef.current;
      if (
        !gates?.startBoundary ||
        !gates.finishBoundary ||
        !cameraEvidence ||
        !sourceWidth ||
        !sourceHeight ||
        !canonicalSteps.every((mark) => mark.world)
      ) return null;
      const canonicalMidpoint = (boundary: NonNullable<typeof gates.startBoundary>, identity: "start" | "finish") => {
        const line = sourceLineToCanonicalWorld(
          boundary.sourceFrameLine.c1,
          boundary.sourceFrameLine.c2,
          boundary.setupFrameIndex,
          identity,
          cameraEvidence,
          sourceWidth,
          sourceHeight,
        );
        return { x: (line.c1.x + line.c2.x) / 2, y: (line.c1.y + line.c2.y) / 2 };
      };
      return analyzeZoneSteps({
        start: canonicalMidpoint(gates.startBoundary, "start"),
        finish: canonicalMidpoint(gates.finishBoundary, "finish"),
        distanceM: gates.distanceM,
        contacts: canonicalSteps.map((mark) => ({
          id: `contact-${mark.sourceFrameIndex}-${mark.side}-${mark.index}`,
          side: mark.side,
          timeS: mark.time,
          sourceFrameIndex: mark.sourceFrameIndex,
          x: mark.world!.x,
          y: mark.world!.y,
          confidence: mark.world!.projectionConfidence,
        })),
      });
    })();
    const classifiedById = new Map(zoneMetrics?.contacts.map((contact) => [contact.id, contact]) ?? []);
    const intervalByEndpoint = new Map(zoneMetrics?.intervals.map((interval) => [interval.toContactId, interval]) ?? []);

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
      const currentSourceFrame = frame.sourceFrameIndex ?? frame.frame;

      const projectWorldStep = (mark: (typeof canonicalSteps)[number]): Point2D | null => {
        // A detected ground contact is a permanent chalk mark on the track: once
        // playback has reached it, it must stay visible for the rest of the clip.
        // Camera motion (pan/zoom) only changes WHERE the world point projects into
        // the current view, never WHETHER it exists — so we always render the
        // best-effort reprojected position and NEVER cull on projection confidence /
        // safety. (Low confidence can affect trust styling elsewhere, not existence.)
        if (!mark.world || !cameraEvidence || !sourceWidth || !sourceHeight) {
          // No camera evidence (static clip): the raw source position is already
          // world-locked — there is no pan to compensate.
          return project(mark);
        }
        const result = canonicalWorldToSourceFrame(
          mark.world,
          currentSourceFrame,
          cameraEvidence,
          sourceWidth,
          sourceHeight,
        );
        return project(result.point);
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
      if (show.stepMarks && canonicalSteps.length) {
        const reached = canonicalSteps.filter((m) => m.time <= currentTime + 1e-3);

        // Debug only: dashed step-to-step path linking consecutive contacts.
        if (show.debug && reached.length > 1) {
          ctx.strokeStyle = COLORS.stepPath;
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          reached.forEach((m, i) => {
            const p = projectWorldStep(m);
            if (!p) return;
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });
          ctx.stroke();
          ctx.setLineDash([]);
        }

        for (const mark of reached) {
          const markId = `contact-${mark.sourceFrameIndex}-${mark.side}-${mark.index}`;
          const classification = classifiedById.get(markId);
          const isFinalEndpoint = zoneMetrics?.stepWindow.firstPostZoneContactId === markId;
          // Reproject the contact from its capture time into the current view so
          // it stays planted on the track as the camera pans (identity if static).
          const p = projectWorldStep(mark);
          if (!p) continue;
          const color = classification?.classification === "boundary_ambiguous"
            ? "#f5c451"
            : isFinalEndpoint
              ? "#5AA9FF"
              : classification?.countedInZone
                ? mark.side === "left" ? COLORS.stepLeft : COLORS.stepRight
                : "#777A80";

          // One SMALL dot at the fixed ground contact position (Day 68: −50% size
          // + thinner outline to cut overlay clutter).
          ctx.beginPath();
          if (isFinalEndpoint) {
            ctx.moveTo(p.x, p.y - 4);
            ctx.lineTo(p.x + 4, p.y);
            ctx.lineTo(p.x, p.y + 4);
            ctx.lineTo(p.x - 4, p.y);
            ctx.closePath();
          } else {
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          }
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
          const meters = intervalByEndpoint.get(markId)?.longitudinalLengthM ?? null;
          ctx.font = STEP_LABEL_FONT;
          if (meters != null) {
            placeLabel(ctx, `${meters.toFixed(2)} m`, p.x + 6, p.y + 10, color, placedLabels);
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
      type BarGeom = { p1: Point2D; p2: Point2D; mid: Point2D; confidence?: number; safe?: boolean };
      let diagnosticStartGate: BarGeom | null = null;
      let diagnosticFinishGate: BarGeom | null = null;
      // Stroke a gate bar (cone-to-cone) with cone markers and an optional tag.
      // Day 74: thin (2 px) so the laser line is precise and unobtrusive.
      const strokeBar = (g: BarGeom, color: string, tag?: string) => {
        ctx.strokeStyle = g.safe === false ? "#e46464" : color;
        ctx.lineWidth = 2;
        ctx.setLineDash(g.safe === false ? [5, 4] : []);
        ctx.beginPath();
        ctx.moveTo(g.p1.x, g.p1.y);
        ctx.lineTo(g.p2.x, g.p2.y);
        ctx.stroke();
        ctx.setLineDash([]);
        drawCone(g.p1, color);
        drawCone(g.p2, color);
        if (tag) placeLabel(ctx, tag, g.mid.x + 8, g.mid.y - 12,
          g.safe === false ? "#e46464" : color, placedLabels);
      };

      const savedGates = calibrationGatesRef.current;
      const savedCalibration = calibrationRef.current;
      if (savedGates) {
        const authoritativeGeom = (boundary: typeof savedGates.startBoundary): BarGeom | null => {
          if (!boundary || !cameraEvidence || !sourceWidth || !sourceHeight) return null;
          const propagated = propagateAnchorFromSetupToFrame(
            boundary, currentSourceFrame, cameraEvidence, sourceWidth, sourceHeight,
          );
          if (!sourceLineIntersectsViewport(propagated.c1, propagated.c2)) return null;
          return {
            p1: project(propagated.c1), p2: project(propagated.c2),
            mid: project(propagated.midpoint), confidence: propagated.confidence, safe: propagated.safe,
          };
        };
        const migratedGeom = (bar: typeof savedGates.startGate): BarGeom | null => {
          if (!cameraEvidence || !sourceWidth || !sourceHeight) return null;
          const setupOverlayFrame = frames.reduce((best, candidate) =>
            Math.abs(candidate.time - bar.timeS) < Math.abs(best.time - bar.timeS) ? candidate : best,
          );
          const setupFrame = bar.setupFrameIndex ?? setupOverlayFrame?.sourceFrameIndex ?? setupOverlayFrame?.frame;
          if (setupFrame == null) return null;
          const a = propagateSourcePoint(bar.c1, setupFrame, currentSourceFrame, cameraEvidence, sourceWidth, sourceHeight);
          const b = propagateSourcePoint(bar.c2, setupFrame, currentSourceFrame, cameraEvidence, sourceWidth, sourceHeight);
          if (!sourceLineIntersectsViewport(a.point, b.point)) return null;
          const p1 = project(a.point); const p2 = project(b.point);
          return { p1, p2, mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
            confidence: Math.min(a.confidence, b.confidence), safe: a.safe && b.safe };
        };
        // Authority-first rendering (Part 1): a MANUAL-CONFIRMED zone is drawn from
        // its exact persisted c1/c2, reprojected to the CURRENT source frame through
        // the AUTHORITATIVE background camera model only — never through the
        // athlete-derived camera estimate (`cameraTrack`/`gateFrameXAt`), which slides
        // a confirmed zone off its painted line as the runner moves (the drift bug).
        //
        // The canonical source anchor is immutable; each frame we derive its display
        // position fresh:  canonical anchor → source-camera transform (identity when
        // the camera is static or evidence is absent) → project() into the picture
        // rect → the shared follow-wrapper transform (same as the video). It is exact
        // at the setup frame (no post-save pixel shift) and stays glued to the world
        // location on every other frame. Auto / draft zones keep the derived chain.
        const setupFrameFor = (timeS: number, explicit?: number): number | undefined => {
          if (explicit != null) return explicit;
          if (!frames.length) return undefined;
          const nearest = frames.reduce((best, candidate) =>
            Math.abs(candidate.time - timeS) < Math.abs(best.time - timeS) ? candidate : best,
          );
          return nearest.sourceFrameIndex ?? nearest.frame;
        };
        const canonicalGeom = (
          canonical: { c1: Point2D; c2: Point2D; timeS: number; setupFrameIndex?: number },
          identity: "start" | "finish",
        ): BarGeom | null => {
          // Authoritative reprojection when production camera evidence is available.
          if (cameraEvidence && sourceWidth && sourceHeight) {
            const setupFrame = setupFrameFor(canonical.timeS, canonical.setupFrameIndex);
            if (setupFrame != null) {
              const worldLine = sourceLineToCanonicalWorld(
                canonical.c1,
                canonical.c2,
                setupFrame,
                identity,
                cameraEvidence,
                sourceWidth,
                sourceHeight,
              );
              const line = projectCanonicalWorldLine(
                worldLine, currentSourceFrame, cameraEvidence, sourceWidth, sourceHeight,
              );
              if (!sourceLineIntersectsViewport(line.c1, line.c2)) return null;
              return {
                p1: project(line.c1), p2: project(line.c2), mid: project(line.midpoint),
                confidence: line.confidence, safe: line.projectable,
              };
            }
          }
          // Identity fallback (no evidence / static camera): draw the canonical anchor
          // at its raw stored source coordinates. NEVER reproject a confirmed zone via
          // athlete-motion-derived camera estimates.
          if (!sourceLineIntersectsViewport(canonical.c1, canonical.c2)) return null;
          const p1 = project(canonical.c1);
          const p2 = project(canonical.c2);
          return { p1, p2, mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } };
        };
        const gateDirective = selectRenderableGateGeometry(savedGates);
        const startG =
          gateDirective.mode === "canonical_raw"
            ? canonicalGeom(gateDirective.start, "start")
            : authoritativeGeom(savedGates.startBoundary)
              ?? migratedGeom(savedGates.startGate);
        const finishG =
          gateDirective.mode === "canonical_raw"
            ? canonicalGeom(gateDirective.finish, "finish")
            : authoritativeGeom(savedGates.finishBoundary)
              ?? migratedGeom(savedGates.finishGate);
        diagnosticStartGate = startG;
        diagnosticFinishGate = finishG;

        // Dev-only drift diagnostic: proves the canonical source anchor is unchanged
        // while only its projection moves. Gated behind the debug toggle + non-prod.
        if (show.debug && process.env.NODE_ENV !== "production" && gateDirective.mode === "canonical_raw") {
          console.debug("[timing-zone] canonical anchor immutable; projection derived fresh", {
            sourceFrame: currentSourceFrame,
            canonicalStart: gateDirective.start.c1,
            projectedStart: startG?.p1 ?? null,
            hasCameraEvidence: !!(cameraEvidence && sourceWidth && sourceHeight),
          });
        }
        if (startG) strokeBar(startG, COLORS.calibration, "Start");
        if (finishG) strokeBar(finishG, COLORS.calibration, "Finish");
      } else if (savedCalibration) {
        // Legacy midpoint-only records lack source-frame and background-transform
        // provenance. They require a rerun instead of being misdrawn as world data.
      }

      // In-progress placement: [startC1, startC2, finishC1, finishC2]. Complete
      // pairs draw as a pending bar; a lone cone draws as a marker until its partner
      // is placed. Each cone is world-anchored by its own click time.
      const pending = pendingRef.current;
      if (pending && pending.length) {
        const pc = COLORS.calibrationPending;
        const drawPendingCone = (c: PendingCone) => {
          if (cameraEvidence && sourceWidth && sourceHeight) {
            const result = propagateSourcePoint(c, c.sourceFrameIndex, frame.sourceFrameIndex ?? frame.frame,
              cameraEvidence, sourceWidth, sourceHeight);
            drawCone(project(result.point), result.safe ? pc : "#e46464");
          } else {
            // No background-camera evidence: no fabricated world-lock preview.
          }
        };
        const pendingGeom = (c1: PendingCone, c2: PendingCone): BarGeom | null => {
          if (!cameraEvidence || !sourceWidth || !sourceHeight) return null;
          const target = frame.sourceFrameIndex ?? frame.frame;
          const a = propagateSourcePoint(c1, c1.sourceFrameIndex, target, cameraEvidence, sourceWidth, sourceHeight);
          const b = propagateSourcePoint(c2, c2.sourceFrameIndex, target, cameraEvidence, sourceWidth, sourceHeight);
          if (!sourceLineIntersectsViewport(a.point, b.point)) return null;
          const p1 = project(a.point); const p2 = project(b.point);
          return { p1, p2, mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
            confidence: Math.min(a.confidence, b.confidence), safe: a.safe && b.safe };
        };
        if (pending.length >= 2) { const g = pendingGeom(pending[0], pending[1]); if (g) strokeBar(g, pc, "Start"); }
        else if (pending.length === 1) drawPendingCone(pending[0]);
        if (pending.length >= 4) { const g = pendingGeom(pending[2], pending[3]); if (g) strokeBar(g, pc, "Finish"); }
        else if (pending.length === 3) drawPendingCone(pending[2]);
      }


      // --- Comparison mode (experimental): draw the SECOND engine's pose
      // (RTMPose, carried in comparisonLandmarks) as a DASHED PURPLE stick figure
      // over the solid MediaPipe primary skeleton, plus a compact HUD with the
      // engine names, frame index, and video/pose timestamps. Visual only — the
      // comparison pose never enters any metric. Also shown inside the dev debug
      // view so nothing is lost there. ---
      const showComparison = show.compare || show.debug;
      if (showComparison) {
        if (frame.comparisonLandmarks) {
          ctx.save();
          ctx.translate(correction.dx * picture.width, correction.dy * picture.height);
          ctx.strokeStyle = "#c084fc"; // purple-400 — RTMPose comparison skeleton
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          for (const [aName, bName] of bones) {
            const a = frame.comparisonLandmarks[aName];
            const b = frame.comparisonLandmarks[bName];
            if (!a || !b) continue;
            const ap = project(a); const bp = project(b);
            ctx.beginPath(); ctx.moveTo(ap.x, ap.y); ctx.lineTo(bp.x, bp.y); ctx.stroke();
          }
          ctx.setLineDash([]);
          ctx.restore();
        }
        // Compact readout: primary vs comparison engine, the frame index, both
        // clocks, and the person-track confidence — enough to line the two
        // skeletons up frame by frame.
        const hud = [
          `primary ${frame.backend ?? "pose"} · comparison ${frame.comparisonBackend ?? "none"} · frame ${frame.frame}`,
          `video ${currentTime.toFixed(3)}s · pose ${frame.time.toFixed(3)}s`,
          `tracking confidence ${frame.trackingConfidence?.toFixed(3) ?? "unavailable"}`,
        ];
        ctx.font = "600 10px ui-monospace, monospace";
        const hudW = Math.min(picture.width - 16, 380);
        ctx.textAlign = "left";
        ctx.fillStyle = "rgba(3,7,18,.82)";
        ctx.fillRect(8, 28, hudW, hud.length * 15 + 24);
        ctx.fillStyle = "#e2e8f0";
        hud.forEach((line, i) => ctx.fillText(line, 14, 40 + i * 15));
        // Legend so the dashed figure is unambiguous during the demo.
        ctx.fillStyle = "#c084fc";
        ctx.fillText("╌╌ RTMPose (experimental)   ── MediaPipe", 14, 40 + hud.length * 15 + 4);
        ctx.font = DEFAULT_LABEL_FONT;
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
        const sourceFrame = frame.sourceFrameIndex ?? frame.frame;
        const cameraFrame = cameraEvidence?.transforms.find((item) => item.frame === sourceFrame);
        const athleteTrack = cameraEvidence?.athleteTrack.find((item) => item.frame === sourceFrame);
        if (athleteTrack?.cropBox) {
          const topLeft = project({ x: athleteTrack.cropBox.x, y: athleteTrack.cropBox.y });
          const bottomRight = project({
            x: athleteTrack.cropBox.x + athleteTrack.cropBox.width,
            y: athleteTrack.cropBox.y + athleteTrack.cropBox.height,
          });
          ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
          ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
          ctx.setLineDash([]);
        }
        const pxError = Math.hypot(correction.dx * picture.width, correction.dy * picture.height);
        const scale = athleteScalePxPerCm(frame, picture.height, athleteHeightCm);
        const lines = [
          `world ${WORLD_COORDINATE_SCHEMA_VERSION} · reference frame 0 · source frame ${sourceFrame}`,
          `primary ${frame.backend ?? "pose"} · comparison ${frame.comparisonBackend ?? "off"} · frame ${frame.frame}`,
          `video ${currentTime.toFixed(3)}s · pose ${frame.time.toFixed(3)}s`,
          `tracking confidence ${frame.trackingConfidence?.toFixed(3) ?? "unavailable"}`,
          `render ${picture.width.toFixed(0)}×${picture.height.toFixed(0)} · canvas ${canvas.width}×${canvas.height} @${dpr.toFixed(2)}x`,
          `trochanter ${marker ? `${marker.x.toFixed(1)},${marker.y.toFixed(1)}` : "not set"} · offset ${(correction.dx * picture.width).toFixed(1)},${(correction.dy * picture.height).toFixed(1)}px`,
          `height ${athleteHeightCm ?? "—"}cm · scale ${scale?.toFixed(3) ?? "—"} px/cm · error ${pxError.toFixed(1)}px`,
          `follow ${autoFollow ? "on" : "off"} · transform ${follow ? `${follow.current.scale.toFixed(3)} @ ${follow.current.cx.toFixed(3)},${follow.current.cy.toFixed(3)}` : "identity"}`,
          `target ${follow ? `${follow.target.cx.toFixed(3)},${follow.target.cy.toFixed(3)}` : "—"} · offset ${follow ? `${(follow.current.cx - .5).toFixed(3)},${(follow.current.cy - .5).toFixed(3)}` : "0,0"}`,
          `camera prev→current ${cameraFrame ? `${cameraFrame.translationX.toFixed(4)},${cameraFrame.translationY.toFixed(4)} · rot ${cameraFrame.rotationDeg.toFixed(2)}° · scale ${cameraFrame.scale.toFixed(4)}` : "unavailable"}`,
          `transform confidence ${cameraFrame?.confidence.toFixed(3) ?? "—"} · features ${cameraFrame?.supportingFeatureCount ?? "—"} · residual ${cameraFrame?.residualPx?.toFixed(2) ?? "—"}px`,
          `canonical steps ${canonicalSteps.length} · projectable ${canonicalSteps.filter((step) => projectWorldStep(step)).length}`,
          `canonical start ${calibrationGatesRef.current ? `${calibrationGatesRef.current.startGate.c1.x.toFixed(4)},${calibrationGatesRef.current.startGate.c1.y.toFixed(4)}` : "—"} · finish ${calibrationGatesRef.current ? `${calibrationGatesRef.current.finishGate.c1.x.toFixed(4)},${calibrationGatesRef.current.finishGate.c1.y.toFixed(4)}` : "—"}`,
          `viewport start ${diagnosticStartGate ? `${diagnosticStartGate.mid.x.toFixed(1)},${diagnosticStartGate.mid.y.toFixed(1)}` : "not projectable"} · finish ${diagnosticFinishGate ? `${diagnosticFinishGate.mid.x.toFixed(1)},${diagnosticFinishGate.mid.y.toFixed(1)}` : "not projectable"}`,
          `projection ${cameraEvidence ? "background RANSAC affine" : "legacy/rerun required"} · fallback ${cameraEvidence ? "none" : "withheld"} · reprojection ${cameraFrame?.residualPx?.toFixed(2) ?? "—"}px`,
          `crop ${athleteTrack ? `${athleteTrack.cropSource} · confidence ${athleteTrack.cropConfidence.toFixed(3)}` : "unavailable"} · analytical anchors ignore crop/follow`,
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
  }, [
    videoRef,
    frames,
    stepScale,
    cameraEvidence,
    sourceWidth,
    sourceHeight,
    athleteHeightCm,
    autoFollow,
    followStateRef,
  ]);

  // Position/size are driven imperatively in the draw loop so the canvas covers
  // exactly the displayed picture (letterbox-aware); left/top default to 0.
  return <canvas ref={canvasRef} className="pointer-events-none absolute left-0 top-0" />;
}
