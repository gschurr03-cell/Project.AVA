import {
  MAX_SAFE_ANCHOR_DEGRADED_FRAMES,
  MAX_SAFE_ANCHOR_RESIDUAL_PX,
  MIN_SAFE_ANCHOR_FEATURES,
  MIN_SAFE_ANCHOR_INLIER_RATIO,
  MIN_SAFE_ANCHOR_TRANSFORM_CONFIDENCE,
} from "./zoneAnchors";
import type { CameraTrackingSummary } from "./gates";
import type { RawCameraEvidence } from "../video/recordingMode";

export const PANNING_TRACKING_METHOD_VERSION = "ava-background-world-lock-v1";
/** 100 ms at the validated 60 Hz clock: brief enough to avoid indefinite guessing. */
export const MAX_TRACKING_HOLD_FRAMES = MAX_SAFE_ANCHOR_DEGRADED_FRAMES;
export const MIN_PANNING_RELIABILITY_RATIO = 0.7;

/**
 * Per-frame tracking QUALITY only — never conflate this with camera MODE
 * (stationary/panning). "unavailable" means no camera evidence exists at all
 * (e.g. no analysis has run yet); "initializing" means evidence exists but this
 * is the reference/setup frame itself, which has no incoming transform to judge.
 */
export type CameraTrackingState = "initializing" | "locked" | "degraded" | "lost" | "unavailable";
type Transform = RawCameraEvidence["transforms"][number];

/** Human label for a {@link CameraTrackingState}. Never mix camera MODE into this string. */
export function trackingStateLabel(state: CameraTrackingState): string {
  switch (state) {
    case "locked": return "Locked";
    case "degraded": return "Degraded";
    case "lost": return "Lost";
    case "unavailable": return "Unavailable";
    case "initializing": return "Initializing";
  }
}

/** Human label for camera MODE only — never mix tracking quality into this string. */
export function cameraModeLabel(cameraType: "stationary" | "panning"): string {
  return cameraType === "panning" ? "Panning camera" : "Stationary camera";
}

export function isReliableCameraTransform(transform: Transform | null | undefined): boolean {
  return Boolean(
    transform
      && transform.confidence >= MIN_SAFE_ANCHOR_TRANSFORM_CONFIDENCE
      && transform.supportingFeatureCount >= MIN_SAFE_ANCHOR_FEATURES
      && transform.inlierRatio >= MIN_SAFE_ANCHOR_INLIER_RATIO
      && transform.residualPx != null
      && transform.residualPx <= MAX_SAFE_ANCHOR_RESIDUAL_PX,
  );
}

function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.round((ordered.length - 1) * fraction))];
}

export function summarizeCameraTracking(evidence: RawCameraEvidence | null | undefined): CameraTrackingSummary | null {
  if (!evidence?.transforms.length) return null;
  const transforms = evidence.transforms;
  const considered = transforms.filter((item) => item.frame > 0);
  const reliable = considered.filter(isReliableCameraTransform);
  let longestLostRunFrames = 0;
  let currentLostRun = 0;
  for (const transform of considered) {
    if (isReliableCameraTransform(transform)) currentLostRun = 0;
    else {
      currentLostRun += 1;
      longestLostRunFrames = Math.max(longestLostRunFrames, currentLostRun);
    }
  }
  return {
    methodVersion: PANNING_TRACKING_METHOD_VERSION,
    transformCount: considered.length,
    reliableTransformCount: reliable.length,
    reliabilityRatio: considered.length ? reliable.length / considered.length : 0,
    meanFeatureCount: considered.length
      ? considered.reduce((sum, item) => sum + item.supportingFeatureCount, 0) / considered.length
      : 0,
    meanInlierRatio: considered.length
      ? considered.reduce((sum, item) => sum + item.inlierRatio, 0) / considered.length
      : 0,
    p95ReprojectionErrorPx: percentile(
      considered.flatMap((item) => item.residualPx == null ? [] : [item.residualPx]),
      0.95,
    ),
    lastReliableFrame: reliable.at(-1)?.frame ?? null,
    longestLostRunFrames,
    reviewed: false,
  };
}

export function cameraTrackingStateAt(
  evidence: RawCameraEvidence | null | undefined,
  frameIndex: number,
): CameraTrackingState {
  // No evidence at all is a distinct, honest state from "on the reference frame" —
  // collapsing both into "initializing" is what let a panning session with no
  // completed analysis yet silently read as indistinguishable from a healthy start.
  if (!evidence?.transforms.length) return "unavailable";
  if (frameIndex <= 0) return "initializing";
  const transform = evidence.transforms.find((item) => item.frame === frameIndex);
  if (isReliableCameraTransform(transform)) return "locked";
  const lastReliable = evidence.transforms
    .filter((item) => item.frame < frameIndex && isReliableCameraTransform(item))
    .at(-1);
  if (lastReliable && frameIndex - lastReliable.frame <= MAX_TRACKING_HOLD_FRAMES) return "degraded";
  return "lost";
}

export function panningTrackingCanBeConfirmed(summary: CameraTrackingSummary | null | undefined): boolean {
  return Boolean(
    summary
      && summary.transformCount > 0
      && summary.reliabilityRatio >= MIN_PANNING_RELIABILITY_RATIO
      && summary.longestLostRunFrames <= MAX_TRACKING_HOLD_FRAMES,
  );
}
