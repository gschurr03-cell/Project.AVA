import type { OverlayFrame } from "@/lib/video/overlay";
import type { OverlayToggles } from "@/components/video/VideoOverlay";

/**
 * A checked overlay checkbox must correspond to visible renderable data (Part 6,
 * Day 94 audit): a session with failed athlete tracking previously showed all six
 * pose toggles checked with nothing actually drawn. Pulled out of
 * `OverlaySurface.tsx` so the availability decision is unit-testable without a
 * DOM/React render.
 */
export const POSE_DEPENDENT_TOGGLES: ReadonlySet<keyof OverlayToggles> = new Set([
  "skeleton",
  "joint_angles",
  "center_of_mass",
  "velocity",
]);

/** True when at least one frame has a landmark tracked above the same 0.4
 *  visibility floor the measurement engine (`torsoPoint`) uses to accept a sample. */
export function hasRenderablePoseData(frames: Pick<OverlayFrame, "landmarks">[]): boolean {
  return frames.some((frame) =>
    Object.values(frame.landmarks).some((point) => (point?.visibility ?? 1) >= 0.4),
  );
}

export function overlayLayerAvailable(
  key: keyof OverlayToggles,
  evidence: { hasPoseData: boolean; hasStepMarkData: boolean },
): boolean {
  if (POSE_DEPENDENT_TOGGLES.has(key)) return evidence.hasPoseData;
  if (key === "contacts" || key === "step_numbers") return evidence.hasStepMarkData;
  return true;
}

/** The toggle state actually safe to render: a checked toggle whose data is
 *  unavailable is forced off. The caller's raw toggle state is left untouched
 *  so a layer reappears automatically once its data becomes available. */
export function effectiveOverlayToggles(
  toggles: OverlayToggles,
  evidence: { hasPoseData: boolean; hasStepMarkData: boolean },
): OverlayToggles {
  const result = {} as OverlayToggles;
  for (const key of Object.keys(toggles) as (keyof OverlayToggles)[]) {
    result[key] = toggles[key] && overlayLayerAvailable(key, evidence);
  }
  return result;
}
