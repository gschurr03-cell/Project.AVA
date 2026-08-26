import type { Point2D, DisplayRect } from "./coordinates";

export const VISUALIZATION_LAYERS = {
  video: 0,
  worldPolygons: 20,
  worldGeometry: 30,
  athlete: 40,
  diagnostics: 50,
  userInterface: 60,
} as const;
export type VisualizationLayer = keyof typeof VISUALIZATION_LAYERS;
export type VisualizationCoordinateSpace = "world" | "athlete_source" | "screen";
export type OverlayCategory = "athlete" | "performance" | "course" | "developer";
export type OverlayId =
  | "skeleton" | "joint_angles" | "step_numbers" | "contacts"
  | "center_of_mass" | "velocity" | "gates" | "zones"
  | "tracking_box" | "crop_box" | "pose_diagnostics" | "camera_motion_debug";
export type OverlayEvidenceRequirement = "pose" | "contacts" | "center_of_mass" | "velocity" | "world_gates" | "tracking_box" | "crop_box" | "camera_motion" | "comparison_pose";
export type OverlayPresentationMode = "consumer" | "developer";

export interface OverlayDefinition {
  id: OverlayId;
  displayName: string;
  category: OverlayCategory;
  layer: VisualizationLayer;
  defaultVisible: boolean;
  consumerVisible: boolean;
  developerOnly: boolean;
  evidenceRequirement: OverlayEvidenceRequirement;
  dependencies: readonly OverlayId[];
  renderOwnership: string;
  keyboardShortcut?: string;
  description?: string;
}

export type OverlayVisibility = Record<OverlayId, boolean>;
export type OverlayEvidence = Record<OverlayEvidenceRequirement, boolean>;

export const OVERLAY_REGISTRY: readonly OverlayDefinition[] = [
  { id: "skeleton", displayName: "Skeleton", category: "athlete", layer: "athlete", defaultVisible: true, consumerVisible: true, developerOnly: false, evidenceRequirement: "pose", dependencies: [], renderOwnership: "VideoOverlay:connected-skeleton", description: "Connected torso, arms, legs, and joints." },
  { id: "joint_angles", displayName: "Joint Angles", category: "athlete", layer: "athlete", defaultVisible: false, consumerVisible: true, developerOnly: false, evidenceRequirement: "pose", dependencies: ["skeleton"], renderOwnership: "VideoOverlay:joint-angle-labels", description: "Angle labels are shown only while Skeleton is also visible." },
  { id: "center_of_mass", displayName: "Center of Mass", category: "athlete", layer: "athlete", defaultVisible: false, consumerVisible: true, developerOnly: false, evidenceRequirement: "center_of_mass", dependencies: [], renderOwnership: "VideoOverlay:center-of-mass" },
  { id: "step_numbers", displayName: "Step Numbers", category: "performance", layer: "athlete", defaultVisible: true, consumerVisible: true, developerOnly: false, evidenceRequirement: "contacts", dependencies: [], renderOwnership: "VideoOverlay:step-labels" },
  { id: "contacts", displayName: "Contact Events", category: "performance", layer: "athlete", defaultVisible: true, consumerVisible: true, developerOnly: false, evidenceRequirement: "contacts", dependencies: [], renderOwnership: "VideoOverlay:contact-markers" },
  { id: "velocity", displayName: "Velocity", category: "performance", layer: "athlete", defaultVisible: false, consumerVisible: true, developerOnly: false, evidenceRequirement: "velocity", dependencies: [], renderOwnership: "VideoOverlay:velocity-vector" },
  { id: "gates", displayName: "Gates", category: "course", layer: "worldGeometry", defaultVisible: true, consumerVisible: true, developerOnly: false, evidenceRequirement: "world_gates", dependencies: [], renderOwnership: "VideoOverlay:gate-lines" },
  { id: "zones", displayName: "Zones", category: "course", layer: "worldPolygons", defaultVisible: true, consumerVisible: true, developerOnly: false, evidenceRequirement: "world_gates", dependencies: [], renderOwnership: "VideoOverlay:world-zone-polygons" },
  { id: "tracking_box", displayName: "Tracking Box", category: "developer", layer: "diagnostics", defaultVisible: false, consumerVisible: false, developerOnly: true, evidenceRequirement: "tracking_box", dependencies: [], renderOwnership: "reserved:no-separate-tracking-box-artifact" },
  { id: "crop_box", displayName: "Crop Box", category: "developer", layer: "diagnostics", defaultVisible: false, consumerVisible: false, developerOnly: true, evidenceRequirement: "crop_box", dependencies: [], renderOwnership: "VideoOverlay:crop-box" },
  { id: "pose_diagnostics", displayName: "Pose Diagnostics", category: "developer", layer: "diagnostics", defaultVisible: false, consumerVisible: false, developerOnly: true, evidenceRequirement: "comparison_pose", dependencies: [], renderOwnership: "VideoOverlay:pose-comparison" },
  { id: "camera_motion_debug", displayName: "Camera Motion Debug", category: "developer", layer: "diagnostics", defaultVisible: false, consumerVisible: false, developerOnly: true, evidenceRequirement: "camera_motion", dependencies: [], renderOwnership: "VideoOverlay:camera-debug-hud" },
] as const;

export const DEFAULT_OVERLAY_VISIBILITY: OverlayVisibility = Object.fromEntries(
  OVERLAY_REGISTRY.map((overlay) => [overlay.id, overlay.defaultVisible]),
) as OverlayVisibility;

export function availableOverlayDefinitions(mode: OverlayPresentationMode): OverlayDefinition[] {
  return OVERLAY_REGISTRY.filter((overlay) => mode === "developer" || overlay.consumerVisible);
}

export function overlayAvailability(definition: OverlayDefinition, evidence: OverlayEvidence): { available: boolean; reason?: string } {
  if (evidence[definition.evidenceRequirement]) return { available: true };
  const reasons: Record<OverlayEvidenceRequirement, string> = {
    pose: "No renderable pose data",
    contacts: "No accepted contact evidence",
    center_of_mass: "No center-of-mass data",
    velocity: "No velocity data",
    world_gates: "No world-locked gates",
    tracking_box: "No separate tracking-box artifact",
    crop_box: "No crop-box evidence",
    camera_motion: "No camera-motion evidence",
    comparison_pose: "No comparison pose data",
  };
  return { available: false, reason: reasons[definition.evidenceRequirement] };
}

export function effectiveOverlayVisibility(visibility: OverlayVisibility, evidence: OverlayEvidence): OverlayVisibility {
  return Object.fromEntries(OVERLAY_REGISTRY.map((definition) => [
    definition.id,
    visibility[definition.id] && overlayAvailability(definition, evidence).available,
  ])) as OverlayVisibility;
}

/** Session-local visibility update. It cannot seek media or mutate any other overlay. */
export function toggleOverlayVisibility(visibility: OverlayVisibility, id: OverlayId): OverlayVisibility {
  return { ...visibility, [id]: !visibility[id] };
}

export interface VisualizationOverlay<Context = CanvasRenderingContext2D> {
  id: string;
  coordinateSpace: VisualizationCoordinateSpace;
  layer: VisualizationLayer;
  zOrder: number;
  visible: boolean | (() => boolean);
  dependencies: readonly string[];
  transformSource: "global_camera_path" | "presented_pose_frame" | "screen_identity";
  render(context: Context): void;
}

export function orderedVisibleOverlays<T>(overlays: readonly VisualizationOverlay<T>[]): VisualizationOverlay<T>[] {
  return overlays
    .map((overlay, registrationOrder) => ({ overlay, registrationOrder }))
    .filter(({ overlay }) => typeof overlay.visible === "function" ? overlay.visible() : overlay.visible)
    .sort((a, b) =>
      VISUALIZATION_LAYERS[a.overlay.layer] - VISUALIZATION_LAYERS[b.overlay.layer]
      || a.overlay.zOrder - b.overlay.zOrder
      || a.registrationOrder - b.registrationOrder)
    .map(({ overlay }) => overlay);
}

export function renderRegisteredOverlays<T>(overlays: readonly VisualizationOverlay<T>[], context: T): void {
  for (const overlay of orderedVisibleOverlays(overlays)) overlay.render(context);
}

export interface WorldBoundary {
  p1: Point2D;
  p2: Point2D;
  midpoint: Point2D;
}
export interface WorldZonePolygons {
  start: Point2D[];
  fly: Point2D[];
  finish: Point2D[];
}

export type WorldZoneRegion = "pre" | "measurement" | "post";

/** Presentation-only world-zone palette. Keep the colors here, beside the
 * region classifier and polygon contract, so the renderer cannot silently
 * fall back to a stale component-local blue guide. */
// Phase R2: colors chosen to read unambiguously as GREEN (entry) / LIGHT BLUE
// (measurement/fly) / RED (exit) at a glance -- the prior `measurement` value
// (AVA's brand blue, #2f80ed) was a medium/vivid blue that could read as a
// grayish tint over darker footage rather than a distinct light blue; a
// genuinely pale sky-blue is used here instead. Alpha raised slightly
// (0.18 -> 0.22) for clearer visibility, still translucent enough that the
// athlete/track remain fully inspectable underneath.
export const WORLD_ZONE_THEME: Readonly<Record<WorldZoneRegion, string>> = {
  pre: "rgba(34, 197, 94, 0.22)",
  measurement: "rgba(125, 211, 252, 0.22)",
  post: "rgba(239, 68, 68, 0.22)",
};

const side = (point: Point2D, boundary: WorldBoundary) =>
  (boundary.p2.x - boundary.p1.x) * (point.y - boundary.p1.y)
  - (boundary.p2.y - boundary.p1.y) * (point.x - boundary.p1.x);

function clipHalfPlane(polygon: readonly Point2D[], boundary: WorldBoundary, keepSign: number): Point2D[] {
  const output: Point2D[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    const currentValue = side(current, boundary) * keepSign;
    const previousValue = side(previous, boundary) * keepSign;
    const currentInside = currentValue >= -1e-9;
    const previousInside = previousValue >= -1e-9;
    if (currentInside !== previousInside) {
      const fraction = previousValue / (previousValue - currentValue);
      output.push({
        x: previous.x + fraction * (current.x - previous.x),
        y: previous.y + fraction * (current.y - previous.y),
      });
    }
    if (currentInside) output.push(current);
  }
  return output;
}

/** Partition the visible world viewport using the two already-transformed gate
 * lines. No screen-fixed x thresholds or hardcoded rectangles are involved. */
export function worldZonePolygons(
  start: WorldBoundary,
  finish: WorldBoundary,
  viewport: DisplayRect,
): WorldZonePolygons {
  const viewportPolygon = [
    { x: viewport.x, y: viewport.y },
    { x: viewport.x + viewport.width, y: viewport.y },
    { x: viewport.x + viewport.width, y: viewport.y + viewport.height },
    { x: viewport.x, y: viewport.y + viewport.height },
  ];
  const travel = { x: finish.midpoint.x - start.midpoint.x, y: finish.midpoint.y - start.midpoint.y };
  const probeBefore = { x: start.midpoint.x - travel.x, y: start.midpoint.y - travel.y };
  const probeAfter = { x: finish.midpoint.x + travel.x, y: finish.midpoint.y + travel.y };
  const beforeSign = Math.sign(side(probeBefore, start)) || 1;
  const afterSign = Math.sign(side(probeAfter, finish)) || 1;
  const startPolygon = clipHalfPlane(viewportPolygon, start, beforeSign);
  const finishPolygon = clipHalfPlane(viewportPolygon, finish, afterSign);
  const flyPolygon = clipHalfPlane(
    clipHalfPlane(viewportPolygon, start, -beforeSign),
    finish,
    -afterSign,
  );
  return { start: startPolygon, fly: flyPolygon, finish: finishPolygon };
}

/** Classify a resolved display/world point against the same two oriented
 * boundaries used by `worldZonePolygons`. This is diagnostic/presentation
 * state only; it is deliberately independent of scientific zone membership. */
export function classifyWorldZonePoint(
  point: Point2D,
  start: WorldBoundary,
  finish: WorldBoundary,
): WorldZoneRegion {
  const travel = {
    x: finish.midpoint.x - start.midpoint.x,
    y: finish.midpoint.y - start.midpoint.y,
  };
  const probeBefore = {
    x: start.midpoint.x - travel.x,
    y: start.midpoint.y - travel.y,
  };
  const probeAfter = {
    x: finish.midpoint.x + travel.x,
    y: finish.midpoint.y + travel.y,
  };
  const beforeSign = Math.sign(side(probeBefore, start)) || 1;
  const afterSign = Math.sign(side(probeAfter, finish)) || 1;
  if (side(point, start) * beforeSign >= -1e-9) return "pre";
  if (side(point, finish) * afterSign >= -1e-9) return "post";
  return "measurement";
}

export function drawWorldPolygon(ctx: CanvasRenderingContext2D, points: readonly Point2D[], fillStyle: string): void {
  if (points.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

export function drawWorldLine(ctx: CanvasRenderingContext2D, a: Point2D, b: Point2D, strokeStyle: string, lineWidth = 2): void {
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = strokeStyle; ctx.lineWidth = lineWidth; ctx.stroke();
}

export function drawWorldPoint(ctx: CanvasRenderingContext2D, point: Point2D, fillStyle: string, radius = 2): void {
  ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, Math.PI * 2); ctx.fillStyle = fillStyle; ctx.fill();
}

export function drawWorldLabel(ctx: CanvasRenderingContext2D, text: string, point: Point2D, fillStyle: string): void {
  ctx.fillStyle = fillStyle; ctx.fillText(text, point.x, point.y);
}

export function drawWorldArrow(ctx: CanvasRenderingContext2D, from: Point2D, to: Point2D, strokeStyle: string): void {
  drawWorldLine(ctx, from, to, strokeStyle);
}

export function drawWorldPath(ctx: CanvasRenderingContext2D, points: readonly Point2D[], strokeStyle: string): void {
  if (points.length < 2) return;
  ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
  ctx.strokeStyle = strokeStyle; ctx.stroke();
}

/** Complete ownership audit: every current visual belongs to exactly one layer. */
export const CURRENT_VISUALIZATION_MANIFEST = [
  ["video", "video"],
  ["start-zone", "worldPolygons"], ["fly-zone", "worldPolygons"], ["finish-zone", "worldPolygons"],
  ["start-gate", "worldGeometry"], ["finish-gate", "worldGeometry"], ["calibration-reference", "worldGeometry"],
  ["skeleton", "athlete"], ["joint-angles", "athlete"],
  ["center-of-mass", "athlete"], ["velocity", "athlete"],
  ["contacts", "athlete"], ["step-numbers", "athlete"], ["step-path", "athlete"],
  ["comparison-pose", "diagnostics"], ["tracking-box", "diagnostics"], ["crop-box", "diagnostics"],
  ["pose-confidence", "diagnostics"], ["camera-transform", "diagnostics"], ["debug-vectors", "diagnostics"],
  ["labels", "userInterface"], ["playback-controls", "userInterface"], ["metric-cards", "userInterface"],
] as const satisfies readonly (readonly [string, VisualizationLayer])[];
