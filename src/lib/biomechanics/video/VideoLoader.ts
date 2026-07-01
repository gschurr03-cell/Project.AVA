/**
 * Video loading — the first stage of the ingestion pipeline.
 *
 * A `VideoLoader` resolves a {@link VideoSource} (where the video lives, plus any
 * already-known hints) into a {@link LoadedVideo} handle the rest of the pipeline
 * can act on. The default implementation does no I/O — it just validates and
 * wraps the source — which is all the mock backend needs. A real loader (e.g.
 * one that downloads to a temp file or opens a stream for ffmpeg/MediaPipe)
 * implements the same interface and is injected without changing orchestration.
 */

/** Where a video is and any metadata already known about it. */
export interface VideoSource {
  /** Short-lived signed URL (how real backends stream the bytes). */
  signedUrl?: string;
  /** Local filesystem path, when the video is already on disk. */
  path?: string;
  /** Optional known intrinsics — a real extractor can override these. */
  width?: number;
  height?: number;
  durationS?: number;
  fps?: number;
}

/** A source that has been resolved to a concrete, fetchable locator. */
export interface LoadedVideo {
  source: VideoSource;
  /** The resolved `signedUrl` or `path` a downstream reader will open. */
  locator: string;
}

export interface VideoLoader {
  load(source: VideoSource): Promise<LoadedVideo>;
}

/**
 * Zero-I/O loader: validates that the source is addressable and wraps it. This
 * is enough for the mock backend, which never reads the bytes.
 */
export class DefaultVideoLoader implements VideoLoader {
  async load(source: VideoSource): Promise<LoadedVideo> {
    const locator = source.signedUrl ?? source.path;
    if (!locator) {
      throw new Error("VideoSource requires a signedUrl or path");
    }
    return { source, locator };
  }
}
