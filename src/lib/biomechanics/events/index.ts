/**
 * Gait-event detection for Project AVA.
 *
 * A first-pass, explainable heuristic that derives foot contact / toe-off
 * events from a canonical `PoseSequence`. Backend-agnostic and side-effect free;
 * does not touch the pose backends, ingestion, schema, or metrics.
 */
export * from "./GaitEvents";
export * from "./FootContactDetector";
