/**
 * Sprint analysis for Project AVA.
 *
 * Combines foot-contact detection, step/stride segmentation, and per-frame
 * angle extraction into aggregate sprint metrics with warnings. Read-only over
 * the PoseSequence; does not touch the pose backends, ingestion, or schema.
 */
export * from "./SprintMetrics";
export * from "./SprintAnalyzer";
