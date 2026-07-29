import { ACCEPTED_VIDEO_EXTENSIONS, MAX_UPLOAD_BYTES } from "../privacy/consent";
import { BETA_LIMITS } from "./config";

export type VideoPreflightMessage = { code: string; message: string };
export type VideoPreflightResult = {
  status: "supported" | "warning" | "unsupported";
  fileType: string | null;
  fileSizeBytes: number | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  orientation: "landscape" | "portrait" | "unknown";
  warnings: VideoPreflightMessage[];
  blockingIssues: VideoPreflightMessage[];
  preflightVersion: "ava-video-preflight-v1";
};

export function preflightVideo(input: {
  fileName: string;
  fileType?: string | null;
  fileSizeBytes?: number | null;
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  frameRate?: number | null;
}): VideoPreflightResult {
  const warnings: VideoPreflightMessage[] = [];
  const blockingIssues: VideoPreflightMessage[] = [];
  const extension = input.fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!ACCEPTED_VIDEO_EXTENSIONS.includes(extension as typeof ACCEPTED_VIDEO_EXTENSIONS[number]))
    blockingIssues.push({ code: "unsupported_format", message: "Choose an MP4, MOV, or M4V video." });
  if (input.fileSizeBytes === 0)
    blockingIssues.push({ code: "empty_file", message: "The selected file is empty." });
  if ((input.fileSizeBytes ?? 0) > MAX_UPLOAD_BYTES)
    blockingIssues.push({ code: "file_too_large", message: "Videos must be 512 MB or smaller." });
  if ((input.durationSeconds ?? 0) > BETA_LIMITS.maxVideoDurationSeconds)
    blockingIssues.push({ code: "duration_too_long", message: "Processing currently supports clips up to 60 seconds." });
  if (input.frameRate != null && input.frameRate < 60)
    warnings.push({ code: "low_frame_rate", message: "Below 60 FPS may reduce timing precision and can be unsupported for authoritative timing." });
  if (input.width && input.height && input.height > input.width)
    warnings.push({ code: "portrait_orientation", message: "Landscape side-angle video is easier to calibrate and review." });
  if (input.durationSeconds == null)
    warnings.push({ code: "metadata_unavailable", message: "Duration and orientation will be verified during processing." });
  return {
    status: blockingIssues.length ? "unsupported" : warnings.length ? "warning" : "supported",
    fileType: input.fileType ?? null,
    fileSizeBytes: input.fileSizeBytes ?? null,
    durationSeconds: input.durationSeconds ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    frameRate: input.frameRate ?? null,
    orientation: input.width && input.height
      ? input.width >= input.height ? "landscape" : "portrait"
      : "unknown",
    warnings,
    blockingIssues,
    preflightVersion: "ava-video-preflight-v1",
  };
}
