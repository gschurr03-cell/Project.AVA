import type { Point2D } from "./coordinates";

export type WorldLockedBoundary = { p1: Point2D; p2: Point2D; midpoint: Point2D };
export type WorldLockedZoneScene = { start: WorldLockedBoundary; finish: WorldLockedBoundary };

/** Reusable Phase 6.3-ready polygon. Every corner derives from the same two
 * world-locked boundaries; no independent screen anchor can enter the result. */
export function zonePolygon(scene: WorldLockedZoneScene): [Point2D, Point2D, Point2D, Point2D] {
  return [scene.start.p1, scene.finish.p1, scene.finish.p2, scene.start.p2];
}

export function boundaryLength(boundary: WorldLockedBoundary): number {
  return Math.hypot(boundary.p2.x - boundary.p1.x, boundary.p2.y - boundary.p1.y);
}

export function boundaryOrientationDeg(boundary: WorldLockedBoundary): number {
  return Math.atan2(boundary.p2.y - boundary.p1.y, boundary.p2.x - boundary.p1.x) * 180 / Math.PI;
}
