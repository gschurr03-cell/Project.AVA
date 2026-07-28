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

export function sourcePointToCanonicalWorld(
  point: SourcePoint,
  sourceFrameIndex: number,
  evidence: RawCameraEvidence,
  width: number,
  height: number,
  referenceFrameIndex = WORLD_REFERENCE_FRAME_INDEX,
): CanonicalWorldPoint {
  const result = propagateSourcePoint(
    point, sourceFrameIndex, referenceFrameIndex, evidence, width, height,
  );
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
  const result = propagateSourcePoint(
    world, world.referenceFrameIndex, targetFrameIndex, evidence, width, height,
  );
  return {
    point: result.point,
    confidence: Math.min(world.projectionConfidence, result.confidence),
    projectable: world.projectable && result.safe,
    warnings: [...new Set([...world.warnings, ...result.warnings])],
  };
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
