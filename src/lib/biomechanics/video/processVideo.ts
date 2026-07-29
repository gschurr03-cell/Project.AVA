import type { PoseBackend, PoseEstimateOptions, VideoRef } from "../pose-backend";
import type { PoseSequence } from "../pose";

import { DefaultVideoLoader } from "./VideoLoader";
import type { VideoLoader, VideoSource } from "./VideoLoader";
import { DefaultMetadataExtractor } from "./VideoMetadata";
import type { MetadataExtractor } from "./VideoMetadata";
import { DefaultFrameExtractor } from "./FrameExtractor";
import type { FrameExtractor } from "./FrameExtractor";

/**
 * Ingestion dependencies. The pose backend is deliberately required so a
 * production caller can never receive fabricated metrics through an implicit
 * mock fallback. Loaders/extractors remain injectable development seams.
 */
export interface ProcessVideoDeps {
  backend: PoseBackend;
  loader?: VideoLoader;
  metadataExtractor?: MetadataExtractor;
  frameExtractor?: FrameExtractor;
}

export interface ProcessVideoOptions {
  /** Override the frame rate used for the sequence. */
  fps?: number;
  /** Cap the number of frames processed. */
  maxFrames?: number;
}

/**
 * Orchestrate video ingestion into a {@link PoseSequence}:
 *
 *   load video → extract metadata → plan frames → backend.estimate()
 *
 * The pipeline is backend-agnostic: it only ever calls the explicitly supplied
 * {@link PoseBackend} contract (`VideoRef` in, `PoseSequence` out).
 */
export async function processVideo(
  source: VideoSource,
  deps: ProcessVideoDeps,
  options: ProcessVideoOptions = {},
): Promise<PoseSequence> {
  if (!deps?.backend) {
    throw new Error("processVideo requires an explicit pose backend");
  }
  const backend = deps.backend;
  const loader = deps.loader ?? new DefaultVideoLoader();
  const metadataExtractor = deps.metadataExtractor ?? new DefaultMetadataExtractor();
  const frameExtractor = deps.frameExtractor ?? new DefaultFrameExtractor();

  // 1. Load: resolve the source to a fetchable handle.
  const loaded = await loader.load(source);

  // 2. Metadata: dimensions + timing that shape the sequence.
  const metadata = await metadataExtractor.extract(loaded);

  // 3. Frames: the temporal grid (a real extractor decodes pixels here).
  const timeline = await frameExtractor.extract(loaded, metadata, {
    maxFrames: options.maxFrames,
  });

  // 4. Estimate: hand the injected backend a VideoRef, exactly per the contract.
  const fps = options.fps ?? metadata.fps;
  const ref: VideoRef = {
    signedUrl: loaded.source.signedUrl,
    width: metadata.width,
    height: metadata.height,
    durationS: metadata.durationS,
    fps,
  };
  const estimateOpts: PoseEstimateOptions = {
    fps,
    maxFrames: options.maxFrames ?? (timeline.count > 0 ? timeline.count : undefined),
  };

  return backend.estimate(ref, estimateOpts);
}
