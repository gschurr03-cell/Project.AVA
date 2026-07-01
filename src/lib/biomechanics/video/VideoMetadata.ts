import type { LoadedVideo } from "./VideoLoader";

/**
 * Metadata extraction — the second stage of the ingestion pipeline.
 *
 * A `MetadataExtractor` turns a {@link LoadedVideo} into the intrinsics the rest
 * of the pipeline needs (dimensions and timing at minimum). The default
 * implementation derives them from hints already on the source, falling back to
 * sane defaults, so it stays pure and importable anywhere. A real extractor —
 * e.g. one shelling out to the bundled `ffprobe` (already a dependency) — slots
 * in via dependency injection with zero orchestration change.
 */
export interface VideoMetadata {
  width: number;
  height: number;
  durationS: number;
  fps: number;
  codec?: string;
  sizeBytes?: number;
}

export interface MetadataExtractor {
  extract(video: LoadedVideo): Promise<VideoMetadata>;
}

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const DEFAULT_FPS = 30;
const DEFAULT_DURATION_S = 0; // 0 = unknown; downstream falls back to a default frame count

/**
 * Pure extractor that reuses whatever intrinsics the caller already knows
 * (e.g. the values ffprobe wrote onto the session) and defaults the rest.
 */
export class DefaultMetadataExtractor implements MetadataExtractor {
  async extract(video: LoadedVideo): Promise<VideoMetadata> {
    const { source } = video;
    return {
      width: source.width ?? DEFAULT_WIDTH,
      height: source.height ?? DEFAULT_HEIGHT,
      fps: source.fps ?? DEFAULT_FPS,
      durationS: source.durationS ?? DEFAULT_DURATION_S,
    };
  }
}
