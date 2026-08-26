type TimedOverlayFrame = { time: number };

export type OverlayFrameSelection<T extends TimedOverlayFrame = TimedOverlayFrame> = {
  frame: T;
  index: number;
  timestampOffsetS: number;
  frameOffset: number;
  stale: boolean;
};

/** Median native frame spacing from persisted source timestamps. */
export function nativeOverlayFrameDuration(frames: readonly TimedOverlayFrame[]): number | null {
  const deltas: number[] = [];
  for (let index = 1; index < frames.length; index += 1) {
    const delta = frames[index].time - frames[index - 1].time;
    if (delta > 0 && Number.isFinite(delta)) deltas.push(delta);
  }
  if (!deltas.length) return null;
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)];
}

/**
 * Select the source pose nearest the timestamp of the frame the browser says it
 * presented. The result is pure and history-free: identical inputs always select
 * the same pose, including the exact midpoint tie (earlier frame wins).
 */
export function selectOverlayFrame<T extends TimedOverlayFrame>(
  frames: readonly T[],
  presentedMediaTimeS: number,
  nativeFrameDurationS = nativeOverlayFrameDuration(frames),
): OverlayFrameSelection<T> | null {
  if (!frames.length) return null;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].time < presentedMediaTimeS) lo = mid + 1;
    else hi = mid;
  }
  const after = lo;
  const before = Math.max(0, after - 1);
  const beforeOffset = Math.abs(frames[before].time - presentedMediaTimeS);
  const afterOffset = Math.abs(frames[after].time - presentedMediaTimeS);
  const index = afterOffset < beforeOffset ? after : before;
  const timestampOffsetS = Math.abs(frames[index].time - presentedMediaTimeS);
  const stale = nativeFrameDurationS != null && timestampOffsetS > nativeFrameDurationS * 0.5;
  return {
    frame: frames[index],
    index,
    timestampOffsetS,
    frameOffset: nativeFrameDurationS ? Math.round(timestampOffsetS / nativeFrameDurationS) : 0,
    stale,
  };
}
