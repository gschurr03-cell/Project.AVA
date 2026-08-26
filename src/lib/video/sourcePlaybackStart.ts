/**
 * Authoritative beginning of the playable source-media timeline.
 *
 * Scientific evidence can begin later than the recording. It is deliberately
 * not an input here. For ordinary file media the browser timeline begins at 0;
 * a non-zero first seekable range is retained for media with a shifted origin.
 */
export function sourcePlaybackStartSeconds(
  seekable: Pick<TimeRanges, "length" | "start"> | null | undefined,
): number {
  if (!seekable || seekable.length === 0) return 0;

  try {
    const firstPlayableSecond = seekable.start(0);
    return Number.isFinite(firstPlayableSecond) && firstPlayableSecond >= 0
      ? firstPlayableSecond
      : 0;
  } catch {
    return 0;
  }
}

