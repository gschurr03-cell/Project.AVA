import {
  PROJECTION_ENGINE_VERSION, PROJECTION_SCHEMA_VERSION,
  projectionSnapshotSchema, type ProjectionInput, type ProjectionOutput,
  type ProjectionSnapshot,
} from "./contracts";

export function createProjectionSnapshot(
  snapshotId: string, input: ProjectionInput, output: ProjectionOutput,
): ProjectionSnapshot {
  return projectionSnapshotSchema.parse({
    snapshotId, athleteId: input.athleteId,
    engineVersion: PROJECTION_ENGINE_VERSION, schemaVersion: PROJECTION_SCHEMA_VERSION,
    input, output, createdAt: input.generatedAt,
  });
}

