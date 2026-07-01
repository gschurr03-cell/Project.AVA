import type { LoadedVideo } from "./VideoLoader";
import type { VideoMetadata } from "./VideoMetadata";

/**
 * Frame extraction — the third stage of the ingestion pipeline.
 *
 * A `FrameExtractor` produces the temporal grid (frame indices + timestamps) a
 * per-frame pose estimator walks. The default implementation derives that grid
 * from the metadata's fps/duration without decoding any pixels — enough to plan
 * the sequence for the mock backend. A real extractor (ffmpeg/MediaPipe) decodes
 * actual frames along the same timeline and implements the same interface, so
 * it is injected without touching orchestration.
 */
export interface FrameInfo {
  index: number;
  /** Timestamp in milliseconds from the start of the clip. */
  tMs: number;
}

export interface FrameTimeline {
  fps: number;
  count: number;
  frames: FrameInfo[];
}

export interface FrameExtractionOptions {
  /** Cap the number of frames (dev/debug or bounded processing). */
  maxFrames?: number;
}

export interface FrameExtractor {
  extract(
    video: LoadedVideo,
    metadata: VideoMetadata,
    opts?: FrameExtractionOptions,
  ): Promise<FrameTimeline>;
}

const FALLBACK_FPS = 30;

/**
 * Metadata-driven timeline builder: no pixel decoding, just the frame schedule
 * implied by fps and duration (optionally capped by `maxFrames`).
 */
export class DefaultFrameExtractor implements FrameExtractor {
  async extract(
    video: LoadedVideo,
    metadata: VideoMetadata,
    opts: FrameExtractionOptions = {},
  ): Promise<FrameTimeline> {
    if (!video.locator) {
      throw new Error("FrameExtractor received an unloaded video");
    }
    const fps = metadata.fps > 0 ? metadata.fps : FALLBACK_FPS;
    const fromDuration = metadata.durationS > 0 ? Math.round(metadata.durationS * fps) : 0;
    const count =
      opts.maxFrames != null ? Math.min(opts.maxFrames, fromDuration || opts.maxFrames) : fromDuration;
    const frames: FrameInfo[] = Array.from({ length: count }, (_, index) => ({
      index,
      tMs: (index / fps) * 1000,
    }));
    return { fps, count, frames };
  }
}
