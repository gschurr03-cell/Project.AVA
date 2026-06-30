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
