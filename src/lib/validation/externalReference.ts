import { z } from "zod";

export const EXTERNAL_REFERENCE_SCHEMA_VERSION = "ava-external-reference-v1";

export const externalReferenceSchema = z.object({
  schemaVersion: z.literal(EXTERNAL_REFERENCE_SCHEMA_VERSION),
  measuredValue: z.number().positive(),
  unit: z.enum(["seconds", "meters", "meters_per_second"]),
  referenceMethod: z.string().nullable(),
  referenceDistanceMeters: z.number().positive().nullable(),
  startDefinition: z.string().nullable(),
  finishDefinition: z.string().nullable(),
  timingSystem: z.string().nullable(),
  confidence: z.enum(["high", "moderate", "low", "unknown"]),
  source: z.string().min(1),
  completeness: z.enum(["complete", "partial", "value_only"]),
  comparabilityStatus: z.enum([
    "comparable",
    "incomplete_reference",
    "incompatible_boundaries",
    "not_yet_reviewed",
    "partially_compatible",
  ]),
  limitations: z.array(z.string()),
});
export type ExternalReference = z.infer<typeof externalReferenceSchema>;

export const validationFixtureManifestSchema = z.object({
  schemaVersion: z.literal("ava-validation-fixture-v1"),
  fixtureId: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  protectedSource: z.object({
    sessionId: z.string().uuid(),
    analysisId: z.string().uuid(),
    videoPath: z.string().min(1),
    sourceCommittedToRepository: z.literal(false),
  }),
  sourceMetadata: z.object({
    originalFilename: z.string().min(1),
    uploadedAt: z.string().datetime(),
    durationSeconds: z.number().nonnegative().nullable(),
    detectedFps: z.number().positive().nullable(),
    fpsClassification: z.string().nullable(),
    frameCount: z.number().int().nonnegative().nullable(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    codec: z.string().nullable(),
    variableFrameRate: z.boolean().nullable(),
    timeBase: z.string().nullable(),
    firstFrameTimestampSeconds: z.number().nonnegative().nullable(),
    lastFrameTimestampSeconds: z.number().nonnegative().nullable(),
    timestampDerivedFps: z.number().positive().nullable(),
    frameIntervalSeconds: z.object({
      minimum: z.number().positive(),
      p5: z.number().positive(),
      median: z.number().positive(),
      p95: z.number().positive(),
      maximum: z.number().positive(),
    }).nullable(),
    duplicateTimestampCount: z.number().int().nonnegative().nullable(),
    droppedFrameGapCount: z.number().int().nonnegative().nullable(),
    repeatPictureCount: z.number().int().nonnegative().nullable(),
    timestampIrregularity: z.enum(["none", "minor", "material", "unknown"]),
    trueCaptureClass: z.enum([
      "true_30_fps_cfr",
      "nominal_60_fps",
      "high_speed",
      "variable_frame_rate",
      "unknown",
    ]),
  }),
  athleteDirection: z.enum(["left_to_right", "right_to_left", "unknown"]),
  cameraDirection: z.enum(["left_to_right", "right_to_left", "mixed", "unknown"]),
  expectedRecordingClass: z.enum(["smooth_pan", "unstable_pan", "pan_with_zoom", "excessive_camera_motion"]),
  externalReference: externalReferenceSchema,
  validationStatus: z.enum(["identified", "processing", "manual_review_required", "regression_ready", "blocked"]),
  notes: z.array(z.string()),
  createdAt: z.string().datetime(),
});
export type ValidationFixtureManifest = z.infer<typeof validationFixtureManifestSchema>;
