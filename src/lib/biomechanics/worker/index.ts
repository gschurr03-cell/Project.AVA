/**
 * Worker glue for Project AVA.
 *
 * Maps the biomechanics analysis result onto the existing analysis-callback
 * metric shape. Additive only — does not modify the pose, events, strides,
 * angles, or analysis modules.
 */
export * from "./AnalysisMetricsMapper";
