/**
 * Joint & posture angle extraction for Project AVA.
 *
 * Computes per-frame knee/hip/ankle angles plus trunk lean and shoulder/hip
 * tilt from a canonical `PoseSequence`. Pure and read-only; does not touch the
 * pose backends, ingestion, schema, metrics, events, or strides modules.
 */
export * from "./JointAngles";
export * from "./AngleCalculator";
