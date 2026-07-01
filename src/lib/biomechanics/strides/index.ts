/**
 * Stride segmentation for Project AVA.
 *
 * Converts a heuristic `GaitEvent[]` stream (from the events module) into
 * structured step and stride segments. Pure and defensive; does not touch the
 * pose backends, ingestion, schema, metrics, or the event detector.
 */
export * from "./StrideSegments";
export * from "./StrideSegmenter";
