/** Format a number of seconds as m:ss. */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Purely presentational horizontal timeline. Plots marker dots proportionally
 * along a track between 0 and `duration`, with start/end time labels. No video,
 * playback, synchronization, interaction, or metrics — just the visual.
 */
export default function VideoTimeline({
  duration,
  markers,
}: {
  duration: number;
  markers: number[];
}) {
  const percentFor = (time: number): number => {
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    return Math.min(100, Math.max(0, (time / duration) * 100));
  };

  return (
    <div className="w-full rounded-lg border bg-white p-4 shadow-sm">
      <div className="relative h-2 w-full rounded-full bg-gray-200">
        {markers.map((marker, index) => (
          <span
            key={`${marker}-${index}`}
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-lane shadow"
            style={{ left: `${percentFor(marker)}%` }}
            title={formatTime(marker)}
          />
        ))}
      </div>

      <div className="mt-2 flex justify-between text-xs font-medium tabular-nums text-gray-500">
        <span>0:00</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
