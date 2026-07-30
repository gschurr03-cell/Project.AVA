import type { RawCameraEvidence } from "./recordingMode";
import { propagateSourcePoint, type SourcePoint } from "../calibration/zoneAnchors";

/** Immutable normalized coordinates in one stable source-video reference frame. */
export const WORLD_COORDINATE_SCHEMA_VERSION = "ava-world-reference-v1" as const;
export const WORLD_REFERENCE_FRAME_INDEX = 0;

export type CanonicalWorldPoint = {
  x: number;
  y: number;
  referenceFrameIndex: number;
  sourceFrameIndex: number;
  coordinateSchemaVersion: typeof WORLD_COORDINATE_SCHEMA_VERSION;
  projectionConfidence: number;
  projectable: boolean;
  warnings: string[];
};

/**
 * Explicit frame→reference direction: convert a point observed in one source
 * frame back into the immutable reference-frame coordinate system. This is the
 * ONLY direction used when a historical contact is created — its source-frame
 * position is converted once, here, into the coordinate that gets stored.
 * Named (rather than calling the generic `propagateSourcePoint` directly) so
 * the direction of travel can never be mixed up at a call site.
 */
export function frameToReference(
  framePoint: SourcePoint,
  frameIndex: number,
  referenceFrameIndex: number,
  evidence: RawCameraEvidence,
  width: number,
  height: number,
) {
  return propagateSourcePoint(framePoint, frameIndex, referenceFrameIndex, evidence, width, height);
}

/**
 * Explicit reference→frame direction: reproject an immutable reference-frame
 * point into a target frame's source coordinates. This is the ONLY direction
 * used at render time — every frame is derived fresh from the stored
 * reference point, never from a previously rendered position.
 */
export function referenceToFrame(
  referencePoint: SourcePoint,
  referenceFrameIndex: number,
  targetFrameIndex: number,
  evidence: RawCameraEvidence,
  width: number,
  height: number,
) {
  return propagateSourcePoint(referencePoint, referenceFrameIndex, targetFrameIndex, evidence, width, height);
}

export function sourcePointToCanonicalWorld(
  point: SourcePoint,
  sourceFrameIndex: number,
  evidence: RawCameraEvidence,
  width: number,
  height: number,
  referenceFrameIndex = WORLD_REFERENCE_FRAME_INDEX,
): CanonicalWorldPoint {
  const result = frameToReference(point, sourceFrameIndex, referenceFrameIndex, evidence, width, height);
  return {
    ...result.point,
    referenceFrameIndex,
    sourceFrameIndex,
    coordinateSchemaVersion: WORLD_COORDINATE_SCHEMA_VERSION,
    projectionConfidence: result.confidence,
    projectable: result.safe,
    warnings: result.warnings,
  };
}

export function canonicalWorldToSourceFrame(
  world: CanonicalWorldPoint,
  targetFrameIndex: number,
  evidence: RawCameraEvidence,
  width: number,
  height: number,
) {
  const result = referenceToFrame(world, world.referenceFrameIndex, targetFrameIndex, evidence, width, height);
  return {
    point: result.point,
    confidence: Math.min(world.projectionConfidence, result.confidence),
    projectable: world.projectable && result.safe,
    warnings: [...new Set([...world.warnings, ...result.warnings])],
  };
}

/**
 * Round-trip proof for the frame↔reference transform pair: take a point
 * observed at `frameIndex`, convert it to the reference frame, then back to
 * `frameIndex`, and report how far it lands from the original (normalized
 * source units). A safe, well-conditioned transform chain should round-trip
 * to numerical noise; a large error means the chain is not safely invertible
 * for this point and callers must not trust it as a world anchor.
 */
export function verifyFrameReferenceRoundTrip(
  framePoint: SourcePoint,
  frameIndex: number,
  referenceFrameIndex: number,
  evidence: RawCameraEvidence,
  width: number,
  height: number,
): { ok: boolean; errorNormalized: number; roundTripped: SourcePoint } {
  const toReference = frameToReference(framePoint, frameIndex, referenceFrameIndex, evidence, width, height);
  const backToFrame = referenceToFrame(toReference.point, referenceFrameIndex, frameIndex, evidence, width, height);
  const errorNormalized = Math.hypot(
    backToFrame.point.x - framePoint.x,
    backToFrame.point.y - framePoint.y,
  );
  return {
    ok: toReference.safe && backToFrame.safe && errorNormalized < 1e-6,
    errorNormalized,
    roundTripped: backToFrame.point,
  };
}

/**
 * One historical physical-contact anchor (Part 3): the canonical, persisted/
 * rendered position is `referenceSourcePoint` (= `world.x, world.y`), NEVER
 * the original contact-frame pixel. `world` carries the full provenance
 * (reference frame, confidence, warnings); `contactFrameIndex`/`foot` are
 * diagnostic — they identify which detection produced this anchor but play no
 * role in rendering.
 */
export interface WorldContactAnchor {
  id: string;
  contactFrameIndex: number;
  foot: "left" | "right";
  world: CanonicalWorldPoint;
  cameraModelVersion: string;
}

export function toWorldContactAnchor(
  id: string,
  contactFrameIndex: number,
  foot: "left" | "right",
  world: CanonicalWorldPoint,
  cameraModelVersion: string,
): WorldContactAnchor {
  return { id, contactFrameIndex, foot, world, cameraModelVersion };
}

export type CanonicalWorldLine = {
  c1: CanonicalWorldPoint;
  c2: CanonicalWorldPoint;
  identity: "start" | "finish";
};

export function sourceLineToCanonicalWorld(
  c1: SourcePoint,
  c2: SourcePoint,
  sourceFrameIndex: number,
  identity: CanonicalWorldLine["identity"],
  evidence: RawCameraEvidence,
  width: number,
  height: number,
): CanonicalWorldLine {
  return {
    c1: sourcePointToCanonicalWorld(c1, sourceFrameIndex, evidence, width, height),
    c2: sourcePointToCanonicalWorld(c2, sourceFrameIndex, evidence, width, height),
    identity,
  };
}

export function projectCanonicalWorldLine(
  line: CanonicalWorldLine,
  targetFrameIndex: number,
  evidence: RawCameraEvidence,
  width: number,
  height: number,
) {
  const c1 = canonicalWorldToSourceFrame(line.c1, targetFrameIndex, evidence, width, height);
  const c2 = canonicalWorldToSourceFrame(line.c2, targetFrameIndex, evidence, width, height);
  return {
    c1: c1.point,
    c2: c2.point,
    midpoint: { x: (c1.point.x + c2.point.x) / 2, y: (c1.point.y + c2.point.y) / 2 },
    identity: line.identity,
    confidence: Math.min(c1.confidence, c2.confidence),
    projectable: c1.projectable && c2.projectable,
    warnings: [...new Set([...c1.warnings, ...c2.warnings])],
  };
}
