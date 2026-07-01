/** Display labels for the `session_status` enum. */
export const STATUS_LABELS: Record<string, string> = {
  uploaded: "Uploaded",
  queued: "Queued",
  analyzing: "Analyzing",
  complete: "Complete",
  failed: "Failed",
};

/** Display labels for the `analysis_status` enum. */
export const ANALYSIS_STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  complete: "Complete",
  failed: "Failed",
};

/** Format a duration in seconds as `m:ss` (or `h:mm:ss`). Null → "—". */
export function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** Human-readable byte size (e.g. "8.4 MB"). Null → "—". */
export function formatBytes(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${i === 0 ? n : n.toFixed(1)} ${units[i]}`;
}

/**
 * Human-facing label for a session: the coach's chosen name, else the original
 * uploaded filename, else the storage object's basename (the UUID), else the id.
 */
export function sessionDisplayName(session: {
  id: string;
  name: string | null;
  original_filename: string | null;
  video_path: string | null;
}): string {
  return (
    session.name ?? session.original_filename ?? session.video_path?.split("/").pop() ?? session.id
  );
}
