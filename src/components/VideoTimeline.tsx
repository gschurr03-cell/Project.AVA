/** Format a number of seconds as m:ss. */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** A single event marker plotted on the timeline. */
export interface VideoTimelineMarker {
  id: string;
  timeSeconds: number;
  label?: string;
  kind?: "contact" | "toeOff" | "step" | "custom";
}

/** Dot colour by marker kind. */
const MARKER_COLOR: Record<NonNullable<VideoTimelineMarker["kind"]>, string> = {
  contact: "bg-lane",
  toeOff: "bg-amber-500",
  step: "bg-emerald-500",
  custom: "bg-gray-400",
};

/**
 * Purely presentational horizontal timeline. Renders start/end time labels and,
 * when provided, event marker dots positioned proportionally between 0 and
 * `duration`. Markers are optional — with none supplied the timeline is just the
 * track and labels (its original behaviour). No video, playback, or metrics.
 */
export default function VideoTimeline({
  duration,
  markers = [],
}: {
  duration: number;
  markers?: VideoTimelineMarker[];
}) {
  const hasDuration = Number.isFinite(duration) && duration > 0;

  // Ignore markers outside [0, duration] (and anything non-finite).
  const visibleMarkers = hasDuration
    ? markers.filter(
        (marker) =>
          Number.isFinite(marker.timeSeconds) &&
          marker.timeSeconds >= 0 &&
          marker.timeSeconds <= duration,
      )
    : [];

  return (
    <div className="w-full rounded-lg border bg-white p-4 shadow-sm">
      <div className="relative h-2 w-full rounded-full bg-gray-200">
        {visibleMarkers.map((marker) => {
          const percent = (marker.timeSeconds / duration) * 100;
          const kind = marker.kind ?? "custom";
          const title = marker.label ?? `${kind} @ ${formatTime(marker.timeSeconds)}`;
          return (
            <span
              key={marker.id}
              className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ${MARKER_COLOR[kind]}`}
              style={{ left: `${percent}%` }}
              title={title}
              aria-label={title}
            />
          );
        })}
      </div>

      <div className="mt-2 flex justify-between text-xs font-medium tabular-nums text-gray-500">
        <span>0:00</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
