/**
 * Video ingestion layer for Project AVA.
 *
 * Turns a video source into a normalized {@link PoseSequence} through a
 * backend-agnostic, dependency-injected pipeline:
 *
 *   load video → extract metadata → plan frames → backend.estimate()
 *
 * Everything is swappable — MediaPipe (or a real ffprobe/ffmpeg extractor)
 * replaces the mock defaults without any change to `processVideo`.
 */
export * from "./VideoLoader";
export * from "./VideoMetadata";
export * from "./FrameExtractor";
export * from "./processVideo";
