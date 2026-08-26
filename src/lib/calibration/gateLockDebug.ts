import { z } from "zod";
import type { RawCameraEvidence } from "../video/recordingMode";
import { propagateAnchorFromSetupToFrame, type GroundBoundary, type SourcePoint } from "./zoneAnchors";
import { cameraTrackingStateAt, isReliableCameraTransform } from "./cameraTracking";

const pointSchema = z.object({ x: z.number(), y: z.number() });
const rangeSchema = z.object({ startFrame: z.number().int().nonnegative(), endFrame: z.number().int().nonnegative() });
const gateStateSchema = z.object({
  midpoint: pointSchema, c1: pointSchema, c2: pointSchema,
  confidence: z.number().min(0).max(1), safe: z.boolean(),
});
export const gateLockDebugFrameSchema = z.object({
  frame: z.number().int().nonnegative(),
  timeS: z.number().nonnegative(),
  start: gateStateSchema.nullable(),
  finish: gateStateSchema.nullable(),
  // These fields were added to the v1 diagnostic payload after v1 artifacts
  // already existed. They are display/debug evidence, not scientific inputs;
  // keep them optional so an older, otherwise-valid pose sequence remains
  // readable. New artifacts still always emit them below.
  scientificStartGate: gateStateSchema.nullable().optional(),
  scientificFinishGate: gateStateSchema.nullable().optional(),
  transformSourceFrame: z.number().int().nonnegative().nullable().optional(),
  transformValid: z.boolean().optional(),
  transformHeld: z.boolean().optional(),
  transformRejectedReason: z.string().nullable().optional(),
  startDisplacementPx: z.number().nonnegative().nullable(),
  finishDisplacementPx: z.number().nonnegative().nullable(),
  transformConfidence: z.number().min(0).max(1).nullable(),
  supportingFeatureCount: z.number().int().nonnegative().nullable(),
  inlierRatio: z.number().min(0).max(1).nullable(),
  reprojectionErrorPx: z.number().nonnegative().nullable(),
});
export const gateLockDebugArtifactSchema = z.object({
  schemaVersion: z.literal("ava-gate-lock-debug-v1"),
  referenceFrameIndex: z.number().int().nonnegative(),
  referenceGates: z.object({
    start: z.object({ c1: pointSchema, c2: pointSchema }),
    finish: z.object({ c1: pointSchema, c2: pointSchema }),
  }),
  frames: z.array(gateLockDebugFrameSchema),
  invalidPropagationRanges: z.array(rangeSchema),
  maxGateDisplacementPx: z.number().nonnegative().nullable(),
  meanGateDisplacementPx: z.number().nonnegative().nullable(),
});

/**
 * Stationary-camera gate-lock visualization/debug artifact (Part 3, Day 94
 * audit). No such artifact existed before — an engineer diagnosing a gate-drift
 * report had only the raw pose/camera-evidence JSON to work from. Everything
 * here is derived from data the pipeline already computes (per-frame RANSAC
 * transform stats, the propagated boundary lines); nothing is newly measured,
 * so this can be computed for any already-completed analysis with world-anchor
 * gates, not just future ones.
 *
 * "Global background feature tracks" are reported as the per-frame AGGREGATE
 * evidence the pipeline actually persists (supportingFeatureCount, inlierRatio,
 * residualPx) — individual feature-point trajectories are not persisted
 * anywhere in the production artifact, so they cannot be reconstructed after
 * the fact; this is the honest, available substitute.
 */

export type GateLockDebugFrame = z.infer<typeof gateLockDebugFrameSchema>;
export type GateLockDebugArtifact = z.infer<typeof gateLockDebugArtifactSchema>;

const pixelDist = (a: SourcePoint, b: SourcePoint, width: number, height: number): number =>
  Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);

function frameRanges(indices: number[]): { startFrame: number; endFrame: number }[] {
  if (!indices.length) return [];
  const sorted = [...indices].sort((a, b) => a - b);
  const ranges: { startFrame: number; endFrame: number }[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
      continue;
    }
    ranges.push({ startFrame: start, endFrame: prev });
    start = sorted[i];
    prev = sorted[i];
  }
  ranges.push({ startFrame: start, endFrame: prev });
  return ranges;
}

/**
 * Build the debug artifact. Samples every `strideFrames`-th frame (default 5)
 * across the clip to keep the artifact's size bounded on long/high-fps clips —
 * this is a diagnostic overview, not a full per-frame dump.
 */
export function buildGateLockDebugArtifact(
  evidence: RawCameraEvidence,
  start: GroundBoundary,
  finish: GroundBoundary,
  width: number,
  height: number,
  frameCount: number,
  fps: number,
  strideFrames = 5,
): GateLockDebugArtifact {
  const referenceFrameIndex = start.setupFrameIndex;
  const referenceGates = {
    start: start.sourceFrameLine,
    finish: finish.sourceFrameLine,
  };

  const frames: GateLockDebugFrame[] = [];
  const invalidFrames = new Set<number>();
  const displacements: number[] = [];

  for (let f = 0; f < frameCount; f += strideFrames) {
    const s = propagateAnchorFromSetupToFrame(start, f, evidence, width, height);
    const g = propagateAnchorFromSetupToFrame(finish, f, evidence, width, height);
    if (!s.safe) invalidFrames.add(f);
    if (!g.safe) invalidFrames.add(f);
    const startDisp = s.safe ? pixelDist(s.midpoint, propagateAnchorFromSetupToFrame(start, referenceFrameIndex, evidence, width, height).midpoint, width, height) : null;
    const finishDisp = g.safe ? pixelDist(g.midpoint, propagateAnchorFromSetupToFrame(finish, referenceFrameIndex, evidence, width, height).midpoint, width, height) : null;
    if (startDisp != null) displacements.push(startDisp);
    if (finishDisp != null) displacements.push(finishDisp);
    const transform = evidence.transforms.find((t) => t.frame === f) ?? null;
    const transformValid = isReliableCameraTransform(transform);
    const trackingState = cameraTrackingStateAt(evidence, f);
    const transformHeld = trackingState === "degraded";
    const scientificStartGate = s.safe ? { midpoint: s.midpoint, c1: s.c1, c2: s.c2, confidence: s.confidence, safe: s.safe } : null;
    const scientificFinishGate = g.safe ? { midpoint: g.midpoint, c1: g.c1, c2: g.c2, confidence: g.confidence, safe: g.safe } : null;
    frames.push({
      frame: f,
      timeS: f / fps,
      start: scientificStartGate,
      finish: scientificFinishGate,
      scientificStartGate,
      scientificFinishGate,
      transformSourceFrame: transform?.frame ?? null,
      transformValid,
      transformHeld,
      transformRejectedReason: transformValid
        ? null
        : !transform
          ? "missing_camera_transform"
          : transformHeld
            ? "brief_camera_transform_degradation"
            : "camera_transform_rejected",
      startDisplacementPx: startDisp,
      finishDisplacementPx: finishDisp,
      transformConfidence: transform?.confidence ?? null,
      supportingFeatureCount: transform?.supportingFeatureCount ?? null,
      inlierRatio: transform?.inlierRatio ?? null,
      reprojectionErrorPx: transform?.residualPx ?? null,
    });
  }

  return {
    schemaVersion: "ava-gate-lock-debug-v1",
    referenceFrameIndex,
    referenceGates,
    frames,
    invalidPropagationRanges: frameRanges([...invalidFrames]),
    maxGateDisplacementPx: displacements.length ? Math.max(...displacements) : null,
    meanGateDisplacementPx: displacements.length ? displacements.reduce((a, b) => a + b, 0) / displacements.length : null,
  };
}
