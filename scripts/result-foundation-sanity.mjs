import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = process.cwd();
const out = path.join(root, ".result-foundation-sanity-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  execFileSync(
    "npx",
    [
      "tsc",
      "src/lib/analysis/resultContract.ts",
      "src/lib/analysis/historyCompatibility.ts",
      "src/lib/biomechanics/types.ts",
      "src/lib/biomechanics/worker/AnalysisMetricsMapper.ts",
      "--outDir",
      out,
      "--module",
      "commonjs",
      "--target",
      "es2022",
      "--skipLibCheck",
      "--esModuleInterop",
      "--strict",
    ],
    { cwd: root },
  );
  const contract = require(path.join(out, "analysis/resultContract.js"));
  const history = require(path.join(out, "analysis/historyCompatibility.js"));
  const { metricResultSchema, propagateConfidence } = contract;
  const timingMigration = readFileSync(
    path.join(root, "supabase/migrations/0020_conservative_timing_policy.sql"),
    "utf8",
  );
  assert.match(timingMigration, /timing_policy_version text/i);
  assert.match(timingMigration, /raw_timing_metrics jsonb/i);
  assert.match(timingMigration, /reported_timing_metrics jsonb/i);
  assert.match(timingMigration, /legacy_unversioned/i);
  const panningMigration = readFileSync(
    path.join(root, "supabase/migrations/0021_panning_analysis_foundation.sql"),
    "utf8",
  );
  assert.match(panningMigration, /recording_mode_version text/i);
  assert.match(panningMigration, /camera_motion_model_version text/i);
  assert.match(panningMigration, /spatial_metric_eligibility text/i);
  assert.match(panningMigration, /capture_camera_provenance_fields/i);

  assert.equal(
    metricResultSchema.parse({
      value: 0,
      unit: "m/s",
      status: "available",
      confidence: 0.9,
      confidenceLabel: "high",
      reasonCode: null,
      warning: null,
      source: "mediapipe",
      version: "v1",
    }).value,
    0,
  );
  assert.equal(
    metricResultSchema.parse({
      value: null,
      unit: "m/s",
      status: "withheld",
      confidence: null,
      confidenceLabel: "insufficient",
      reasonCode: "calibration_required",
      warning: null,
      source: "mediapipe",
      version: "v1",
    }).value,
    null,
  );
  assert.throws(() =>
    metricResultSchema.parse({
      value: null,
      unit: "m/s",
      status: "available",
      confidence: 1,
      confidenceLabel: "high",
      reasonCode: null,
      warning: null,
      source: "mediapipe",
      version: "v1",
    }),
  );
  assert.equal(propagateConfidence(0.9, 0.4, 0.8), 0.4);
  assert.throws(() =>
    contract.muscleGroupSchema.parse({
      muscleGroupId: "hamstrings",
      displayName: "Hamstrings",
      relationship: "possible_contributor",
      relevantAction: "hip extension",
      explanation: "May be associated",
      confidence: { score: 0.4, label: "low", rationale: "video association only" },
      diagnosticDisclaimer: "",
      suggestedConfirmationTests: [],
    }),
  );

  const now = "2026-07-16T12:00:00.000Z";
  const confidence = { score: 0.8, label: "high", rationale: "fixture" };
  const provenance = {
    originalSourceFps: 240,
    sourceFpsClassification: "high_speed_source_normalized_to_60",
    sourceFpsMetadata: {
      averageFps: 240,
      nominalFps: 240,
      realFps: 240,
      timestampFps: 240,
      variableFrameRate: false,
    },
    analysisFps: 60,
    timingPolicyVersion: "CONSERVATIVE_TIMING_POLICY_V1",
    sourceFrameCount: 240,
    analyzedFrameCount: 60,
    originalVideoWidth: 1920,
    originalVideoHeight: 1080,
    sourceDurationSeconds: 1,
    sourceCodec: "h264",
    videoPath: "athlete/video.mov",
    poseModelName: "mediapipe",
    poseModelVersion: "pose-v1",
    analysisPipelineVersion: "ava-sprint-60-v1",
    metricSchemaVersion: "ava-metrics-v1",
    explainabilitySchemaVersion: "ava-explainability-v1",
    calibrationMode: "none",
    calibrationSnapshot: {},
    cameraMode: "static",
    cameraMotionConfidence: 0.8,
    recordingQualityScore: 80,
    recordingQualityClassification: "good",
    globalAnalysisConfidence: confidence,
    analysisWarnings: [],
    createdAt: now,
    completedAt: now,
  };
  const inputSnapshot = {
    capturedAt: now,
    athlete: {
      id: "11111111-1111-4111-8111-111111111111",
      sex: null,
      dateOfBirth: null,
      heightCm: null,
      weightKg: null,
      legLengthCm: null,
      trochanterHeightM: null,
      personalBests: {},
      goals: {},
    },
    session: {
      analysisType: "fly",
      distanceM: null,
      benchmarkId: null,
      recordingMode: "uploaded_video",
      timingZone: {},
      calibrationInputs: {},
      requestedOptions: {},
    },
  };
  const baseResult = {
    schemaVersion: "ava-explainability-v1",
    analysisId: "22222222-2222-4222-8222-222222222222",
    athleteId: inputSnapshot.athlete.id,
    sessionId: "33333333-3333-4333-8333-333333333333",
    provenance,
    inputSnapshot,
    recordingAssessment: {},
    measurements: [],
    limitations: [],
    recommendations: [],
    retestPlans: [],
    warnings: [],
    overallConfidence: confidence,
  };
  assert.equal(contract.explainableAnalysisResultSchema.parse(baseResult).limitations.length, 0);
  assert.throws(() =>
    contract.explainableAnalysisResultSchema.parse({
      ...baseResult,
      limitations: [
        {
          limitationId: "l1",
          category: "speed",
          title: "Limiter",
          description: "fixture",
          severity: "low",
          priority: 1,
          trainability: "unknown",
          performanceImpact: "unknown",
          confidence,
          supportingMeasurementIds: ["missing"],
          targetRange: null,
          currentDeficit: null,
          observedPatterns: [],
          causeHypotheses: [],
          interventionIds: [],
          retestPlanId: null,
        },
      ],
    }),
  );

  const legacy = history.versionIdentity({ model_version: "old" });
  const current = history.versionIdentity({
    analysis_fps: 60,
    model_version: "mediapipe-sprint-0.1",
    analysis_pipeline_version: "ava-sprint-60-v1",
    metric_schema_version: "ava-metrics-v1",
    timing_policy_version: "CONSERVATIVE_TIMING_POLICY_V1",
    recording_mode_version: "ava-recording-mode-v1",
    camera_motion_model_version: "ava-background-affine-v1",
  });
  const incompatible = history.versionIdentity({
    analysis_fps: 120,
    model_version: "mediapipe-sprint-0.1",
    analysis_pipeline_version: "ava-sprint-60-v1",
    metric_schema_version: "ava-metrics-v1",
    timing_policy_version: "CONSERVATIVE_TIMING_POLICY_V1",
    recording_mode_version: "ava-recording-mode-v1",
    camera_motion_model_version: "ava-background-affine-v2",
  });
  assert.equal(history.analysesAreCompatible(legacy, current), false);
  assert.equal(history.analysesAreCompatible(current, incompatible), false);
  assert.equal(history.analysesAreCompatible(current, current), true);
  console.log("result-foundation sanity: passed");
} finally {
  rmSync(out, { recursive: true, force: true });
}
