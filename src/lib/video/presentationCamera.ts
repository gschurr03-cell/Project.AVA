import type { OverlayFrame, OverlayPoint } from "./overlay";
import { clampFollow, IDENTITY_FOLLOW, type FollowBox } from "./follow";
import {
  compensateFollowCenterForStabilization,
  type SimilarityTransform,
} from "./displayStabilization";

export type PresentationCameraStateName =
  | "full_frame"
  | "following"
  | "anticipating"
  | "holding"
  | "reacquiring"
  | "degraded"
  | "returning_to_full_frame";

export interface PresentationCameraState extends FollowBox {
  enabled: boolean;
  centerSourceX: number;
  centerSourceY: number;
  targetCenterSourceX: number;
  targetCenterSourceY: number;
  targetScale: number;
  rawTargetCenterSourceX: number;
  rawTargetCenterSourceY: number;
  rawTargetScale: number;
  rawTargetVelocityX: number;
  targetVelocityX: number;
  targetVelocityY: number;
  velocityX: number;
  velocityY: number;
  scaleVelocity: number;
  presentationState: PresentationCameraStateName;
  sourceFrameIndex: number | null;
  timestampMs: number;
  lastSupportedTimestampMs: number | null;
  provenance:
    | "verified_tracking_box"
    | "verified_pose_torso"
    | "verified_pose_envelope"
    | "held_verified"
    | "full_frame";
  fallbackReason: string | null;
  envelope: AthleteEnvelope | null;
}

export interface AthleteEnvelope {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export interface PresentationCameraConfig {
  minVisibility: number;
  minLandmarks: number;
  maxScale: number;
  horizontalTimeConstantS: number;
  verticalTimeConstantS: number;
  zoomTimeConstantS: number;
  velocityTimeConstantS: number;
  anticipationS: number;
  maximumLead: number;
  maximumCenterVelocity: number;
  maximumCenterAcceleration: number;
  maximumScaleVelocity: number;
  maximumTargetVelocity: number;
  maximumTargetAcceleration: number;
  targetTimeConstantS: number;
  horizontalDeadband: number;
  verticalDeadband: number;
  scaleDeadband: number;
  uncertaintyHoldS: number;
  returnTimeConstantS: number;
  horizontalPadding: number;
  verticalPadding: number;
}

export const DEFAULT_PRESENTATION_CAMERA_CONFIG: PresentationCameraConfig = {
  minVisibility: 0.3,
  minLandmarks: 4,
  maxScale: 2.5,
  horizontalTimeConstantS: 0.11,
  verticalTimeConstantS: 0.65,
  zoomTimeConstantS: 0.5,
  velocityTimeConstantS: 0.16,
  anticipationS: 0.16,
  maximumLead: 0.075,
  maximumCenterVelocity: 0.9,
  maximumCenterAcceleration: 4.5,
  maximumScaleVelocity: 0.3,
  maximumTargetVelocity: 0.9,
  maximumTargetAcceleration: 6,
  targetTimeConstantS: 0.08,
  horizontalDeadband: 0,
  verticalDeadband: 0.045,
  scaleDeadband: 0.06,
  uncertaintyHoldS: 0.35,
  returnTimeConstantS: 0.65,
  horizontalPadding: 0.42,
  verticalPadding: 0.28,
};

export const FULL_FRAME_PRESENTATION_CAMERA: PresentationCameraState = {
  ...IDENTITY_FOLLOW,
  enabled: false,
  centerSourceX: 0.5,
  centerSourceY: 0.5,
  targetCenterSourceX: 0.5,
  targetCenterSourceY: 0.5,
  targetScale: 1,
  rawTargetCenterSourceX: 0.5,
  rawTargetCenterSourceY: 0.5,
  rawTargetScale: 1,
  rawTargetVelocityX: 0,
  targetVelocityX: 0,
  targetVelocityY: 0,
  velocityX: 0,
  velocityY: 0,
  scaleVelocity: 0,
  presentationState: "full_frame",
  sourceFrameIndex: null,
  timestampMs: 0,
  lastSupportedTimestampMs: null,
  provenance: "full_frame",
  fallbackReason: null,
  envelope: null,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const expAlpha = (dt: number, tau: number) => 1 - Math.exp(-Math.max(0, dt) / Math.max(1e-6, tau));
const midpoint = (a?: OverlayPoint, b?: OverlayPoint) =>
  a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;

export function presentationEvidenceSupported(frame: OverlayFrame): boolean {
  if (frame.trackState === "lost" || frame.trackState === "terminated") return false;
  return (
    frame.boxOrigin == null ||
    frame.boxOrigin === "detected" ||
    frame.boxOrigin === "tracked" ||
    frame.boxOrigin === "reacquired"
  );
}

export function athletePresentationObservation(
  frame: OverlayFrame,
  config = DEFAULT_PRESENTATION_CAMERA_CONFIG,
) {
  if (!presentationEvidenceSupported(frame)) return null;
  // The tracker box is persistent, source-space evidence. Prefer it over the
  // live landmark envelope: limb extension, a briefly omitted joint, or pose
  // detector pixel noise must not become a camera pan/zoom command. The
  // box-origin gate above ensures that prediction-only and suspect boxes never
  // drive presentation either. Old artifacts simply fall through to the
  // established pose-based path below.
  const trackedBox = frame.athleteBoundingBoxSource;
  if (trackedBox) {
    const minX = clamp(Math.min(trackedBox.x0, trackedBox.x1), 0, 1);
    const minY = clamp(Math.min(trackedBox.y0, trackedBox.y1), 0, 1);
    const maxX = clamp(Math.max(trackedBox.x0, trackedBox.x1), 0, 1);
    const maxY = clamp(Math.max(trackedBox.y0, trackedBox.y1), 0, 1);
    if (maxX > minX && maxY > minY) {
      const envelope = { minX, minY, maxX, maxY };
      const width = Math.max(maxX - minX, 0.04);
      const height = Math.max(maxY - minY, 0.08);
      const scale = Math.max(
        1,
        Math.min(
          config.maxScale,
          Math.min(
            1 / (width * (1 + config.horizontalPadding * 2)),
            1 / (height * (1 + config.verticalPadding * 2)),
          ),
        ),
      );
      return {
        anchor: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
        envelope,
        scale,
        provenance: "verified_tracking_box" as const,
      };
    }
  }
  const points = Object.values(frame.landmarks).filter(
    (point): point is OverlayPoint => !!point && (point.visibility ?? 1) >= config.minVisibility,
  );
  if (points.length < config.minLandmarks) return null;
  const envelope: AthleteEnvelope = {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
  const hips = midpoint(frame.landmarks.leftHip, frame.landmarks.rightHip);
  const shoulders = midpoint(frame.landmarks.leftShoulder, frame.landmarks.rightShoulder);
  const torso =
    hips && shoulders ? { x: (hips.x + shoulders.x) / 2, y: (hips.y + shoulders.y) / 2 } : null;
  const anchor = torso ?? {
    x: (envelope.minX + envelope.maxX) / 2,
    y: (envelope.minY + envelope.maxY) / 2,
  };
  const width = Math.max(envelope.maxX - envelope.minX, 0.04);
  const height = Math.max(envelope.maxY - envelope.minY, 0.08);
  const scale = Math.max(
    1,
    Math.min(
      config.maxScale,
      Math.min(
        1 / (width * (1 + config.horizontalPadding * 2)),
        1 / (height * (1 + config.verticalPadding * 2)),
      ),
    ),
  );
  return {
    anchor,
    envelope,
    scale,
    provenance: torso ? ("verified_pose_torso" as const) : ("verified_pose_envelope" as const),
  };
}

function boundedAxis(
  current: number,
  currentVelocity: number,
  target: number,
  dt: number,
  tau: number,
  maxVelocity: number,
  maxAcceleration: number,
) {
  if (dt <= 0) return { value: target, velocity: 0 };
  const desired = clamp(((target - current) * expAlpha(dt, tau)) / dt, -maxVelocity, maxVelocity);
  const velocity = clamp(
    desired,
    currentVelocity - maxAcceleration * dt,
    currentVelocity + maxAcceleration * dt,
  );
  return { value: current + velocity * dt, velocity };
}

/**
 * Compose an intentional pan step with a scale step while keeping `anchor` at
 * the screen position produced by the pan alone. This prevents zoom from
 * silently adding a second apparent translation. Edge clamping remains honest:
 * the viewport never reveals pixels outside the source.
 */
export function zoomDecoupledFollow(
  previous: Pick<FollowBox, "cx" | "cy" | "scale">,
  desiredCenter: Pick<FollowBox, "cx" | "cy">,
  nextScale: number,
  anchor: { x: number; y: number },
): FollowBox {
  const scale = Math.max(1, nextScale);
  return clampFollow({
    scale,
    cx: anchor.x - (previous.scale / scale) * (anchor.x - desiredCenter.cx),
    cy: anchor.y - (previous.scale / scale) * (anchor.y - desiredCenter.cy),
  });
}

export interface PresentationCameraStepOptions {
  enabled: boolean;
  directSelection?: boolean;
  /** Existing display correction for this source frame. Presentation-only. */
  stabilizationCorrection?: SimilarityTransform | null;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
}

export function stepPresentationCamera(
  previous: PresentationCameraState,
  frame: OverlayFrame,
  timestampMs: number,
  options: PresentationCameraStepOptions,
  config = DEFAULT_PRESENTATION_CAMERA_CONFIG,
): PresentationCameraState {
  const sourceFrameIndex = frame.sourceFrameIndex ?? frame.frame;
  if (!options.enabled) return { ...FULL_FRAME_PRESENTATION_CAMERA, timestampMs, sourceFrameIndex };
  const dt = clamp((timestampMs - previous.timestampMs) / 1000, 0, 0.25);
  const observation = athletePresentationObservation(frame, config);
  if (
    timestampMs <= previous.timestampMs &&
    !options.directSelection &&
    previous.lastSupportedTimestampMs != null
  )
    return previous;
  if (!observation) {
    const sinceSupported =
      previous.lastSupportedTimestampMs == null
        ? Infinity
        : (timestampMs - previous.lastSupportedTimestampMs) / 1000;
    if (frame.trackState !== "terminated" && sinceSupported <= config.uncertaintyHoldS) {
      const velocityX =
        previous.velocityX > 0
          ? Math.max(0, previous.velocityX - config.maximumCenterAcceleration * dt)
          : Math.min(0, previous.velocityX + config.maximumCenterAcceleration * dt);
      const velocityY =
        previous.velocityY > 0
          ? Math.max(0, previous.velocityY - config.maximumCenterAcceleration * dt)
          : Math.min(0, previous.velocityY + config.maximumCenterAcceleration * dt);
      const box = clampFollow({
        cx: previous.cx + velocityX * dt,
        cy: previous.cy + velocityY * dt,
        scale: previous.scale,
      });
      const rawTargetVelocityX =
        previous.rawTargetVelocityX > 0
          ? Math.max(0, previous.rawTargetVelocityX - config.maximumTargetAcceleration * dt)
          : Math.min(0, previous.rawTargetVelocityX + config.maximumTargetAcceleration * dt);
      return {
        ...previous,
        ...box,
        centerSourceX: box.cx,
        centerSourceY: box.cy,
        enabled: true,
        timestampMs,
        sourceFrameIndex,
        velocityX,
        velocityY,
        scaleVelocity: 0,
        rawTargetVelocityX,
        targetVelocityX: rawTargetVelocityX,
        presentationState: "holding",
        provenance: "held_verified",
        fallbackReason: frame.boxOrigin ?? frame.trackState ?? "pose_unavailable",
      };
    }
    const targetX = boundedAxis(
      previous.targetCenterSourceX,
      previous.targetVelocityX,
      0.5,
      dt,
      config.targetTimeConstantS,
      config.maximumTargetVelocity,
      config.maximumTargetAcceleration,
    );
    const targetY = boundedAxis(
      previous.targetCenterSourceY,
      previous.targetVelocityY,
      0.5,
      dt,
      config.returnTimeConstantS,
      config.maximumTargetVelocity / 3,
      config.maximumTargetAcceleration / 3,
    );
    const x = boundedAxis(
      previous.cx,
      previous.velocityX,
      targetX.value,
      dt,
      config.returnTimeConstantS,
      config.maximumCenterVelocity,
      config.maximumCenterAcceleration,
    );
    const y = boundedAxis(
      previous.cy,
      previous.velocityY,
      targetY.value,
      dt,
      config.returnTimeConstantS,
      config.maximumCenterVelocity / 3,
      config.maximumCenterAcceleration / 3,
    );
    const scaleDesired = clamp(
      ((1 - previous.scale) * expAlpha(dt, config.returnTimeConstantS)) / Math.max(dt, 1e-6),
      -config.maximumScaleVelocity,
      config.maximumScaleVelocity,
    );
    const nextScale = previous.scale + scaleDesired * dt;
    const box = zoomDecoupledFollow(previous, { cx: x.value, cy: y.value }, nextScale, {
      x: previous.cx,
      y: previous.cy,
    });
    return {
      ...previous,
      ...box,
      enabled: true,
      centerSourceX: box.cx,
      centerSourceY: box.cy,
      targetCenterSourceX: targetX.value,
      targetCenterSourceY: targetY.value,
      targetScale: 1,
      rawTargetCenterSourceX: 0.5,
      rawTargetCenterSourceY: 0.5,
      rawTargetScale: 1,
      rawTargetVelocityX: 0,
      targetVelocityX: targetX.velocity,
      targetVelocityY: targetY.velocity,
      velocityX: x.velocity,
      velocityY: y.velocity,
      scaleVelocity: scaleDesired,
      presentationState: frame.trackState === "terminated" ? "returning_to_full_frame" : "degraded",
      sourceFrameIndex,
      timestampMs,
      provenance: "full_frame",
      fallbackReason:
        frame.trackState === "terminated" ? "athlete_exited_frame" : "unsupported_localization",
      envelope: null,
    };
  }
  const compensatedAnchor =
    options.stabilizationCorrection && options.sourceWidth && options.sourceHeight
      ? compensateFollowCenterForStabilization(
          observation.anchor,
          observation.anchor,
          previous.scale,
          options.stabilizationCorrection,
          options.sourceWidth,
          options.sourceHeight,
        )
      : observation.anchor;
  // Lead is derived from the presentation-space subject motion, not raw screen
  // motion. That prevents a small global shake from becoming a false running
  // velocity and a second pan command.
  const rawVelocity =
    dt > 0 ? (compensatedAnchor.x - previous.rawTargetCenterSourceX) / dt : 0;
  const velocityAlpha = expAlpha(dt, config.velocityTimeConstantS);
  const estimatedVelocity =
    previous.rawTargetVelocityX + (rawVelocity - previous.rawTargetVelocityX) * velocityAlpha;
  const lead = clamp(
    estimatedVelocity * config.anticipationS,
    -config.maximumLead,
    config.maximumLead,
  );
  const uncompensatedTarget = { x: observation.anchor.x + lead, y: observation.anchor.y };
  const compensatedTarget =
    options.stabilizationCorrection && options.sourceWidth && options.sourceHeight
      ? compensateFollowCenterForStabilization(
          observation.anchor,
          uncompensatedTarget,
          previous.scale,
          options.stabilizationCorrection,
          options.sourceWidth,
          options.sourceHeight,
        )
      : uncompensatedTarget;
  const rawTargetX = compensatedTarget.x;
  const rawTargetY = compensatedTarget.y;
  const rawTargetScale = observation.scale;
  const targetYRaw =
    Math.abs(rawTargetY - previous.targetCenterSourceY) <= config.verticalDeadband
      ? previous.targetCenterSourceY
      : rawTargetY;
  const targetScale =
    Math.abs(rawTargetScale - previous.targetScale) <= config.scaleDeadband
      ? previous.targetScale
      : rawTargetScale;
  const reacquiring =
    previous.presentationState === "holding" ||
    previous.presentationState === "degraded" ||
    frame.boxOrigin === "reacquired";
  if (options.directSelection || previous.lastSupportedTimestampMs == null) {
    const box = clampFollow({ cx: rawTargetX, cy: targetYRaw, scale: targetScale });
    return {
      ...previous,
      ...box,
      enabled: true,
      centerSourceX: box.cx,
      centerSourceY: box.cy,
      targetCenterSourceX: rawTargetX,
      targetCenterSourceY: targetYRaw,
      targetScale,
      rawTargetCenterSourceX: rawTargetX,
      rawTargetCenterSourceY: rawTargetY,
      rawTargetScale,
      rawTargetVelocityX: 0,
      targetVelocityX: 0,
      targetVelocityY: 0,
      velocityX: 0,
      velocityY: 0,
      scaleVelocity: 0,
      presentationState: reacquiring
        ? "reacquiring"
        : Math.abs(lead) > 0.002
          ? "anticipating"
          : "following",
      sourceFrameIndex,
      timestampMs,
      lastSupportedTimestampMs: timestampMs,
      provenance: observation.provenance,
      fallbackReason: null,
      envelope: observation.envelope,
    };
  }
  const trajectoryX = boundedAxis(
    previous.targetCenterSourceX,
    previous.targetVelocityX,
    rawTargetX,
    dt,
    config.targetTimeConstantS,
    config.maximumTargetVelocity,
    config.maximumTargetAcceleration,
  );
  const trajectoryY = boundedAxis(
    previous.targetCenterSourceY,
    previous.targetVelocityY,
    targetYRaw,
    dt,
    config.verticalTimeConstantS,
    config.maximumTargetVelocity / 3,
    config.maximumTargetAcceleration / 3,
  );
  const x = boundedAxis(
    previous.cx,
    previous.velocityX,
    trajectoryX.value,
    dt,
    config.horizontalTimeConstantS,
    config.maximumCenterVelocity,
    config.maximumCenterAcceleration,
  );
  const y = boundedAxis(
    previous.cy,
    previous.velocityY,
    trajectoryY.value,
    dt,
    config.verticalTimeConstantS,
    config.maximumCenterVelocity / 3,
    config.maximumCenterAcceleration / 3,
  );
  const scaleDesired = clamp(
    ((targetScale - previous.scale) * expAlpha(dt, config.zoomTimeConstantS)) / Math.max(dt, 1e-6),
    -config.maximumScaleVelocity,
    config.maximumScaleVelocity,
  );
  const nextScale = previous.scale + scaleDesired * dt;
  const box = zoomDecoupledFollow(
    previous,
    { cx: x.value, cy: y.value },
    nextScale,
    observation.anchor,
  );
  return {
    ...previous,
    ...box,
    enabled: true,
    centerSourceX: box.cx,
    centerSourceY: box.cy,
    targetCenterSourceX: trajectoryX.value,
    targetCenterSourceY: trajectoryY.value,
    targetScale,
    rawTargetCenterSourceX: rawTargetX,
    rawTargetCenterSourceY: rawTargetY,
    rawTargetScale,
    rawTargetVelocityX: estimatedVelocity,
    targetVelocityX: trajectoryX.velocity,
    targetVelocityY: trajectoryY.velocity,
    velocityX: x.velocity,
    velocityY: y.velocity,
    scaleVelocity: scaleDesired,
    presentationState: reacquiring
      ? "reacquiring"
      : Math.abs(lead) > 0.002
        ? "anticipating"
        : "following",
    sourceFrameIndex,
    timestampMs,
    lastSupportedTimestampMs: timestampMs,
    provenance: observation.provenance,
    fallbackReason: null,
    envelope: observation.envelope,
  };
}

/**
 * Resolve the presentation camera once over the complete source-time pose path.
 * Playback then selects this immutable path instead of integrating only the
 * subset of source frames a particular display rate happens to present.
 */
export function buildPresentationCameraPath(
  frames: readonly OverlayFrame[],
  config = DEFAULT_PRESENTATION_CAMERA_CONFIG,
  motionCompensation?: {
    corrections: readonly (SimilarityTransform | null | undefined)[];
    sourceWidth: number;
    sourceHeight: number;
  },
): PresentationCameraState[] {
  let state = FULL_FRAME_PRESENTATION_CAMERA;
  return frames.map((frame, index) => {
    state = stepPresentationCamera(
      state,
      frame,
      frame.time * 1000,
      {
        enabled: true,
        directSelection: index === 0,
        stabilizationCorrection: motionCompensation?.corrections[index] ?? null,
        sourceWidth: motionCompensation?.sourceWidth ?? null,
        sourceHeight: motionCompensation?.sourceHeight ?? null,
      },
      config,
    );
    return state;
  });
}

export interface PresentationViewport {
  crop: { x: number; y: number; width: number; height: number };
  scale: number;
  translation: { x: number; y: number };
}
export function presentationViewport(
  camera: Pick<PresentationCameraState, "cx" | "cy" | "scale">,
): PresentationViewport {
  const box = clampFollow(camera);
  const width = 1 / box.scale,
    height = 1 / box.scale;
  return {
    crop: { x: box.cx - width / 2, y: box.cy - height / 2, width, height },
    scale: box.scale,
    translation: { x: 0.5 - box.scale * box.cx, y: 0.5 - box.scale * box.cy },
  };
}
export function sourceToViewportPoint(
  point: { x: number; y: number },
  camera: Pick<PresentationCameraState, "cx" | "cy" | "scale">,
) {
  const v = presentationViewport(camera);
  return { x: (point.x - v.crop.x) / v.crop.width, y: (point.y - v.crop.y) / v.crop.height };
}
export function sourceToViewportRect(
  rect: { x: number; y: number; width: number; height: number },
  camera: Pick<PresentationCameraState, "cx" | "cy" | "scale">,
) {
  const p = sourceToViewportPoint(rect, camera);
  return { ...p, width: rect.width * camera.scale, height: rect.height * camera.scale };
}
export function sourceToViewportPath(
  points: readonly { x: number; y: number }[],
  camera: Pick<PresentationCameraState, "cx" | "cy" | "scale">,
) {
  return points.map((point) => sourceToViewportPoint(point, camera));
}
