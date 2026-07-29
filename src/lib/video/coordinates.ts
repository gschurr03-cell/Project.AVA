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

/** A minimal 2-D point; landmarks may also carry visibility, ignored here. */
export interface Point2D {
  x: number;
  y: number;
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
  const n = normalizeLandmark(point, sourceWidth, sourceHeight);
  return {
    x: rect.x + n.x * rect.width,
    y: rect.y + n.y * rect.height,
  };
}
