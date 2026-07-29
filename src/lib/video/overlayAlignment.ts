type OverlayPoint = { x: number; y: number; visibility?: number };
type AlignmentFrame = {
  time: number;
  landmarks: Record<string, OverlayPoint>;
};

export type TrochanterMarker = { x: number; y: number; timeS: number };
export type DisplayCorrection = {
  dx: number;
  dy: number;
  detectedHip: OverlayPoint | null;
  marker: TrochanterMarker | null;
};

const midpoint = (a?: OverlayPoint, b?: OverlayPoint): OverlayPoint | null =>
  a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;

/** Display-only anatomical alignment. Source landmarks are never mutated. */
export function trochanterDisplayCorrection(
  frames: AlignmentFrame[],
  marker: TrochanterMarker | null,
  maxOffset = 0.04,
): DisplayCorrection {
  if (!marker || !frames.length) return { dx: 0, dy: 0, detectedHip: null, marker };
  let frame = frames[0];
  for (const candidate of frames) {
    if (Math.abs(candidate.time - marker.timeS) < Math.abs(frame.time - marker.timeS)) frame = candidate;
  }
  const detectedHip = midpoint(frame.landmarks.leftHip, frame.landmarks.rightHip);
  if (!detectedHip) return { dx: 0, dy: 0, detectedHip: null, marker };
  const clamp = (value: number) => Math.max(-maxOffset, Math.min(maxOffset, value));
  return {
    dx: clamp(marker.x - detectedHip.x),
    dy: clamp(marker.y - detectedHip.y),
    detectedHip,
    marker,
  };
}

export function applyDisplayCorrection(point: OverlayPoint, correction: DisplayCorrection) {
  return { ...point, x: point.x + correction.dx, y: point.y + correction.dy };
}

/** Pixels per centimetre, used only as an overlay scale sanity readout. */
export function athleteScalePxPerCm(
  frame: AlignmentFrame,
  renderHeightPx: number,
  athleteHeightCm: number | null,
): number | null {
  if (!athleteHeightCm || athleteHeightCm <= 0) return null;
  const top = frame.landmarks.nose;
  const leftAnkle = frame.landmarks.leftAnkle;
  const rightAnkle = frame.landmarks.rightAnkle;
  const ankle = midpoint(leftAnkle, rightAnkle) ?? leftAnkle ?? rightAnkle;
  if (!top || !ankle) return null;
  return (Math.hypot(ankle.x - top.x, ankle.y - top.y) * renderHeightPx) / athleteHeightCm;
}
