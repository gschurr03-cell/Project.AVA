/**
 * Coordinate transforms between pose-landmark space and the on-screen video.
 *
 * Pose landmarks are stored **normalized** to the source video: x,y ∈ [0,1],
 * where (0,0) is the top-left of the source frame and (1,1) the bottom-right.
 * To draw them on top of the rendered <video> we have to map that space onto the
 * rectangle the picture *actually* occupies inside the element — which is not
 * the element box whenever `object-fit` letterboxes (contain) or crops (cover)
 * the frame to a different aspect ratio.
 *
 * Everything here is pure and framework-free so the overlay renderer and the
 * pointer hit-testing share exactly one definition of "where does this landmark
 * land on screen", which is what keeps the skeleton glued to the athlete.
 */

/** A rectangle in CSS pixels, relative to the video element's content box. */
export interface DisplayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A crop in original source-video pixels. Omit it to project the full frame. */
export interface SourceCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type VideoFitMode = "contain" | "cover" | "fill";

/** A minimal 2-D point; landmarks may also carry visibility, ignored here. */
export interface Point2D {
  x: number;
  y: number;
}

export interface SourceToDisplayInput {
  /** Immutable point normalized over the ORIGINAL source frame. */
  point: Point2D;
  sourceWidth: number;
  sourceHeight: number;
  /** Current visible crop in original source pixels; defaults to the full frame. */
  sourceCrop?: SourceCropRect | null;
  /** Video element/content rectangle in CSS pixels. */
  displayRect: DisplayRect;
  fitMode: VideoFitMode;
}

export interface SourceToDisplayProjection {
  point: Point2D;
  crop: SourceCropRect;
  pictureRect: DisplayRect;
  scaleX: number;
  scaleY: number;
  letterboxOffsetX: number;
  letterboxOffsetY: number;
}

/**
 * The one source-video → display projection used by calibration overlays.
 *
 * The input point is always immutable original-source geometry. A caller may
 * supply the crop currently shown by the video, but athlete position and any
 * previous rendered point are deliberately absent from this API.
 */
export function sourceToDisplayProjection(input: SourceToDisplayInput): SourceToDisplayProjection {
  const sourceWidth = input.sourceWidth > 0 ? input.sourceWidth : 1;
  const sourceHeight = input.sourceHeight > 0 ? input.sourceHeight : 1;
  const crop = input.sourceCrop ?? { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  const cropWidth = crop.width > 0 ? crop.width : sourceWidth;
  const cropHeight = crop.height > 0 ? crop.height : sourceHeight;
  const pointPx = {
    x: input.point.x > 1 ? input.point.x : input.point.x * sourceWidth,
    y: input.point.y > 1 ? input.point.y : input.point.y * sourceHeight,
  };

  let scaleX = input.displayRect.width / cropWidth;
  let scaleY = input.displayRect.height / cropHeight;
  if (input.fitMode !== "fill") {
    const scale = input.fitMode === "cover"
      ? Math.max(scaleX, scaleY)
      : Math.min(scaleX, scaleY);
    scaleX = scale;
    scaleY = scale;
  }

  const pictureWidth = cropWidth * scaleX;
  const pictureHeight = cropHeight * scaleY;
  const letterboxOffsetX = (input.displayRect.width - pictureWidth) / 2;
  const letterboxOffsetY = (input.displayRect.height - pictureHeight) / 2;
  const pictureRect = {
    x: input.displayRect.x + letterboxOffsetX,
    y: input.displayRect.y + letterboxOffsetY,
    width: pictureWidth,
    height: pictureHeight,
  };
  return {
    point: {
      x: pictureRect.x + (pointPx.x - crop.x) * scaleX,
      y: pictureRect.y + (pointPx.y - crop.y) * scaleY,
    },
    crop: { ...crop, width: cropWidth, height: cropHeight },
    pictureRect,
    scaleX,
    scaleY,
    letterboxOffsetX,
    letterboxOffsetY,
  };
}

export function projectSourcePointToDisplay(input: SourceToDisplayInput): Point2D {
  return sourceToDisplayProjection(input).point;
}

/**
 * Mirrors the worker's crop→full-frame remap exactly (`landmark_dict` in
 * `mediapipe_pose_runner.py`: `full = (crop.origin + n * crop.size) / sourceSize`).
 * A landmark detected inside a pose-detection ROI/crop is normalized to that
 * crop, not to the full source frame — this undoes the crop offset and scale
 * BEFORE the point is treated as a full-source-frame coordinate.
 *
 * `crop` is in original source-video PIXELS (matching {@link SourceCropRect}).
 * With no crop (full-frame detection, the normal case once the worker has
 * already remapped its own output) this is the identity function.
 */
export function poseOrCropPointToFullSourcePoint(
  point: Point2D,
  crop: SourceCropRect | null | undefined,
  sourceWidth: number,
  sourceHeight: number,
): Point2D {
  if (!crop || sourceWidth <= 0 || sourceHeight <= 0) return point;
  const scaleX = crop.width / sourceWidth;
  const scaleY = crop.height / sourceHeight;
  const offsetX = crop.x / sourceWidth;
  const offsetY = crop.y / sourceHeight;
  return { x: offsetX + point.x * scaleX, y: offsetY + point.y * scaleY };
}

/** Exact inverse used by calibration pointer editing. */
export function unprojectDisplayPointToSource(
  point: Point2D,
  input: Omit<SourceToDisplayInput, "point">,
): Point2D {
  const projection = sourceToDisplayProjection({ ...input, point: { x: 0, y: 0 } });
  return {
    x: (projection.crop.x + (point.x - projection.pictureRect.x) / projection.scaleX)
      / (input.sourceWidth || 1),
    y: (projection.crop.y + (point.y - projection.pictureRect.y) / projection.scaleY)
      / (input.sourceHeight || 1),
  };
}

/**
 * The rectangle the video picture occupies inside its element's content box, in
 * CSS pixels relative to that box's top-left. Accounts for `object-fit` and the
 * default centered `object-position`.
 *
 * Before metadata loads (`videoWidth`/`videoHeight` are 0) or when the box has
 * no size, it falls back to filling the whole content box — the same result as
 * `object-fit: fill`, so early frames simply track the element until the true
 * aspect ratio is known.
 */
export function getDisplayedVideoRect(video: HTMLVideoElement): DisplayRect {
  const boxWidth = video.clientWidth;
  const boxHeight = video.clientHeight;
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;

  const fullBox: DisplayRect = { x: 0, y: 0, width: boxWidth, height: boxHeight };
  if (!sourceWidth || !sourceHeight || !boxWidth || !boxHeight) return fullBox;

  // `object-fit` decides how the intrinsic frame is scaled into the box.
  const objectFit =
    typeof window !== "undefined"
      ? window.getComputedStyle(video).objectFit || "fill"
      : "fill";

  if (objectFit === "fill" || objectFit === "none") {
    // "none" would render at intrinsic size; our videos are always scaled to the
    // element, so treat it like "fill" rather than guessing a crop offset.
    return fullBox;
  }

  const widthScale = boxWidth / sourceWidth;
  const heightScale = boxHeight / sourceHeight;
  // contain / scale-down letterbox (fit inside); cover crops (fill outside).
  const scale =
    objectFit === "cover" ? Math.max(widthScale, heightScale) : Math.min(widthScale, heightScale);

  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: (boxWidth - width) / 2,
    y: (boxHeight - height) / 2,
    width,
    height,
  };
}

/**
 * Reduce a landmark to normalized [0,1] source coordinates. Canonical pose data
 * is already normalized; a value > 1 is treated as an absolute source pixel and
 * divided by the intrinsic dimension. Divisors default to 1 so callers without
 * intrinsic sizes still get a defined (pass-through) result.
 */
export function normalizeLandmark(
  point: Point2D,
  sourceWidth = 1,
  sourceHeight = 1,
): Point2D {
  return {
    x: point.x > 1 ? point.x / (sourceWidth || 1) : point.x,
    y: point.y > 1 ? point.y / (sourceHeight || 1) : point.y,
  };
}

/**
 * Project a landmark onto the displayed picture rectangle, returning a point in
 * CSS pixels relative to the same origin as `rect`. This is the single mapping
 * used for both drawing and hit-testing.
 */
export function projectLandmark(
  point: Point2D,
  rect: DisplayRect,
  sourceWidth?: number,
  sourceHeight?: number,
): Point2D {
  return projectSourcePointToDisplay({
    point: normalizeLandmark(point, sourceWidth, sourceHeight),
    sourceWidth: sourceWidth || 1,
    sourceHeight: sourceHeight || 1,
    displayRect: rect,
    fitMode: "fill",
  });
}
