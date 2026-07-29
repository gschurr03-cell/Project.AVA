export type AnalysisFailureCategory =
  | "upload_incomplete" | "unsupported_video" | "video_download_failed"
  | "video_validation_failed" | "calibration_invalid" | "timing_zone_invalid"
  | "tracking_failed" | "insufficient_valid_steps" | "metric_generation_failed"
  | "intelligence_generation_failed" | "artifact_upload_failed" | "worker_timeout"
  | "worker_terminated" | "database_error" | "storage_error" | "unknown";

export function classifyAnalysisFailure(code?: string | null): AnalysisFailureCategory {
  const value = (code ?? "").toLowerCase();
  if (/format|fps|unsupported/.test(value)) return "unsupported_video";
  if (/download/.test(value)) return "video_download_failed";
  if (/calibrat/.test(value)) return "calibration_invalid";
  if (/timing|gate|zone/.test(value)) return "timing_zone_invalid";
  if (/step/.test(value)) return "insufficient_valid_steps";
  if (/track|pose/.test(value)) return "tracking_failed";
  if (/artifact|upload/.test(value)) return "artifact_upload_failed";
  if (/timeout|stale/.test(value)) return "worker_timeout";
  if (/storage/.test(value)) return "storage_error";
  if (/database|postgres/.test(value)) return "database_error";
  return "unknown";
}

