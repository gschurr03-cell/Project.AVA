export interface AnalysisVersionIdentity {
  legacy: boolean;
  analysisFps: number | null;
  sourceModel: string | null;
  pipelineVersion: string | null;
  metricSchemaVersion: string | null;
  timingPolicyVersion: string | null;
  recordingModeVersion: string | null;
  cameraMotionModelVersion: string | null;
  compatibilityGroup: string | null;
  timingCompatibilityGroup: string | null;
}

export function versionIdentity(row: {
  analysis_fps?: number | null;
  model_version?: string | null;
  analysis_pipeline_version?: string | null;
  metric_schema_version?: string | null;
  timing_policy_version?: string | null;
  recording_mode_version?: string | null;
  camera_motion_model_version?: string | null;
  compatibility_group?: string | null;
  timing_compatibility_group?: string | null;
}): AnalysisVersionIdentity {
  const legacy =
    !row.analysis_pipeline_version ||
    !row.metric_schema_version ||
    !row.analysis_fps ||
    !row.timing_policy_version ||
    !row.recording_mode_version ||
    !row.camera_motion_model_version ||
    row.timing_policy_version === "legacy_unversioned";
  return {
    legacy,
    analysisFps: row.analysis_fps ?? null,
    sourceModel: row.model_version ?? null,
    pipelineVersion: row.analysis_pipeline_version ?? null,
    metricSchemaVersion: row.metric_schema_version ?? null,
    timingPolicyVersion: row.timing_policy_version ?? null,
    recordingModeVersion: row.recording_mode_version ?? null,
    cameraMotionModelVersion: row.camera_motion_model_version ?? null,
    compatibilityGroup: row.compatibility_group ?? null,
    timingCompatibilityGroup: row.timing_compatibility_group ?? null,
  };
}

/** Legacy compares only with legacy; versioned results require exact production identity. */
export function analysesAreCompatible(
  a: AnalysisVersionIdentity,
  b: AnalysisVersionIdentity,
): boolean {
  if (a.legacy || b.legacy) return a.legacy && b.legacy;
  return (
    a.analysisFps === b.analysisFps &&
    a.sourceModel === b.sourceModel &&
    a.pipelineVersion === b.pipelineVersion &&
    a.metricSchemaVersion === b.metricSchemaVersion &&
    a.timingPolicyVersion === b.timingPolicyVersion
    && a.recordingModeVersion === b.recordingModeVersion
    && a.cameraMotionModelVersion === b.cameraMotionModelVersion
    && a.compatibilityGroup === b.compatibilityGroup
    && a.timingCompatibilityGroup === b.timingCompatibilityGroup
  );
}
