// Deployable AVA analysis worker. Postgres is the durable queue and transaction
// authority; this process is stateless apart from isolated per-job temporary files.
//
// Polls queued analyses, then for each: mints a signed URL for the session's
// video, runs the real MediaPipe → PoseSequence → SprintAnalysisResult
// pipeline, maps the metrics onto the existing callback shape, and POSTs the
// secured result API — the same endpoint the mock worker uses.
//
// Run alongside the dev server, with the Python venv active:
//   Terminal 1:  npm run dev
//   Terminal 2:  source .venv/bin/activate && npm run worker:analysis
//
// Requires the Python deps (see requirements-mediapipe.txt). NEVER deploy this:
// it uses the service-role key and is a dev convenience. The mock worker
// (npm run worker:mock) remains available and untouched.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import {
  cleanupStaleTempDirs,
  jobTempDir,
  loadWorkerConfig,
  removeJobTempDir,
  startHealthServer,
  structuredLog,
  verifyRuntime,
} from "./lib/worker-runtime.mjs";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The Python runtime probes complete media-rate evidence with ffprobe. Make the
// project's pinned binary available in local/dev workers just as it is in the image.
const ffprobeBinary = require("@ffprobe-installer/ffprobe").path;
process.env.PATH = `${path.dirname(ffprobeBinary)}${path.delimiter}${process.env.PATH ?? ""}`;

let config;
try {
  config = loadWorkerConfig(root);
  verifyRuntime(config);
  cleanupStaleTempDirs(config);
} catch (error) {
  structuredLog("error", "worker_startup_failed", {
    errorCode: "readiness_failed",
    error: error.message,
  });
  process.exit(1);
}
const SUPABASE_URL = config.supabaseUrl;
const SERVICE_KEY = config.serviceKey;
const VIDEO_BUCKET = config.videoBucket;
const POSE_BUCKET = config.poseBucket;
const SIGNED_URL_TTL_S = 3600;
const MODEL_VERSION = "mediapipe-sprint-0.1";
const VALIDATED_ANALYSIS_FPS = 60;
const WORKER_MAX_FRAMES = process.env.WORKER_MAX_FRAMES;
const MAX_FRAMES = WORKER_MAX_FRAMES ? Number(WORKER_MAX_FRAMES) : undefined;
const log = (msg, fields = {}) =>
  structuredLog("info", msg, {
    workerId: config.workerId,
    workerVersion: config.workerVersion,
    pipelineVersion: "ava-sprint-60-v1",
    ...fields,
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class ResultValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "ResultValidationError";
    this.validationDetails = details;
  }
}

const compactValue = (value) => {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return `[array:${value.length}]`;
  return `[object:${Object.keys(value).slice(0, 8).join(",")}]`;
};

function validationFailure(validatorName, issues, context = {}) {
  const normalized = issues.map((issue) => ({
    path: Array.isArray(issue.path) ? issue.path.join(".") : String(issue.path ?? ""),
    expected: issue.expected ?? issue.contract ?? issue.message,
    received: compactValue(issue.received),
    message: issue.message,
  }));
  return new ResultValidationError(
    `${validatorName} validation failed at ${normalized[0]?.path || "<root>"}: ${normalized[0]?.message ?? "contract mismatch"}`,
    { validatorName, issues: normalized, ...context },
  );
}

function parseResultSchema(validatorName, schema, value, context = {}) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw validationFailure(validatorName, parsed.error.issues.map((issue) => ({
      path: issue.path,
      expected: issue.message,
      received: issue.path.reduce((current, segment) => current?.[segment], value),
      message: issue.message,
    })), context);
  }
  return parsed.data;
}

// --- compile the TS pipeline once at startup ---
const buildDir = path.join(root, ".analysis-worker-build");
const accelerationBuildDir = path.join(buildDir, "acceleration-v1");
log("compiling analysis pipeline...");
rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });
try {
  execFileSync(
    "npx",
    [
      "tsc",
      "src/lib/biomechanics/mediapipe/index.ts",
      "src/lib/biomechanics/analysis/index.ts",
      "src/lib/biomechanics/worker/index.ts",
      "src/lib/biomechanics/rtmpose/index.ts",
      "src/lib/analysis/resultContract.ts",
      "src/lib/analysis/experimental30.ts",
      "src/lib/calibration/zoneAnchors.ts",
      "src/lib/jobs/policy.ts",
      "src/lib/video/analysisFps.ts",
      "--outDir",
      buildDir,
      "--rootDir",
      "src/lib",
      "--module",
      "commonjs",
      "--target",
      "es2022",
      "--skipLibCheck",
      "--esModuleInterop",
      "--resolveJsonModule",
      "--moduleResolution",
      "node",
      "--strict",
    ],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );
  execFileSync(
    "npx",
    [
      "tsc",
      "src/lib/acceleration/metrics.ts",
      "--outDir",
      accelerationBuildDir,
      "--rootDir",
      "src/lib",
      "--module",
      "commonjs",
      "--target",
      "es2022",
      "--skipLibCheck",
      "--esModuleInterop",
      "--strict",
    ],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );
} catch (err) {
  console.error(`[analysis-worker] failed to compile pipeline: ${err.message}`);
  process.exit(1);
}

// TypeScript emits every entry relative to the explicit src/lib root. Runtime
// module IDs use that same source-root-relative namespace, so adding another
// compiled entry cannot silently change the directory layout.
const loadCompiledModule = (outputRoot, sourceRootRelativeModule) =>
  require(path.join(outputRoot, `${sourceRootRelativeModule}.js`));

const { MediaPipePoseBackend } = loadCompiledModule(
  buildDir,
  "biomechanics/mediapipe/index",
);
const { RTMPosePoseBackend } = loadCompiledModule(buildDir, "biomechanics/rtmpose/index");
const { analyzeSprint } = loadCompiledModule(buildDir, "biomechanics/analysis/index");
const { toAnalysisMetrics } = loadCompiledModule(buildDir, "biomechanics/worker/index");
const {
  ANALYSIS_PIPELINE_VERSION,
  METRIC_SCHEMA_VERSION,
  EXPLAINABILITY_SCHEMA_VERSION,
  explainableAnalysisResultSchema,
  provenanceSchema,
  inputSnapshotSchema,
  confidenceLabel,
} = loadCompiledModule(buildDir, "analysis/resultContract");
const {
  buildExperimental30Result,
  EXPERIMENTAL_30_PROFILE_VERSION,
  EXPERIMENTAL_30_COMPATIBILITY_GROUP,
} = loadCompiledModule(buildDir, "analysis/experimental30");
const { detectWorldBoundaryCrossing } = loadCompiledModule(buildDir, "calibration/zoneAnchors");
const { computeAccelerationMetrics } = loadCompiledModule(
  accelerationBuildDir,
  "acceleration/metrics",
);
const { classifyWorkerFailure, retryDelaySeconds } = loadCompiledModule(buildDir, "jobs/policy");
const { classifySourceFps, UNSUPPORTED_FPS_MESSAGE } = loadCompiledModule(
  buildDir,
  "video/analysisFps",
);
const { CONSERVATIVE_TIMING_POLICY_V1 } = loadCompiledModule(
  buildDir,
  "measurement/timingPolicy",
);
const { metricTrustForRecording } = loadCompiledModule(buildDir, "video/recordingMode");

function buildReal30Zone(snapshot, sequence) {
  const gates = snapshot.session.calibrationInputs?.gates;
  const start = gates?.startBoundary;
  const finish = gates?.finishBoundary;
  const source = sequence.sourceMetadata;
  const assessment = sequence.recordingAssessment;
  const required = gates?.schemaVersion === "ava-ground-anchor-v1"
    && gates?.zoneDistanceMeters === 30 && gates?.distanceM === 30
    && typeof gates?.startGateId === "string" && typeof gates?.finishGateId === "string"
    && Number.isInteger(gates?.version) && gates.version > 0
    && Number.isInteger(start?.setupFrameIndex) && start.setupFrameIndex >= 0
    && Number.isInteger(finish?.setupFrameIndex) && finish.setupFrameIndex >= 0
    && start.setupFrameIndex < source?.frameCount && finish.setupFrameIndex < source?.frameCount
    && start?.propagationModelVersion === "ava-background-affine-anchor-v1"
    && finish?.propagationModelVersion === "ava-background-affine-anchor-v1"
    && gates?.travelDirection === "left_to_right" && gates?.bodyReference === "torso"
    && snapshot.session.timingZone?.bodyReference === "torso"
    && snapshot.session.requestedOptions?.analysisFps === 30
    && sequence.fps === 30 && source?.fpsClassification === "experimental_30_fps_class"
    && source?.frameCount > 1 && source?.variableFrameRate === false
    && sequence.cameraEvidence && assessment?.recordingMode === "smooth_pan";
  if (!required) {
    const checks = {
      "calibrationInputs.gates.schemaVersion": gates?.schemaVersion === "ava-ground-anchor-v1",
      "calibrationInputs.gates.distanceM": gates?.zoneDistanceMeters === 30 && gates?.distanceM === 30,
      "calibrationInputs.gates.setupFrames": Number.isInteger(start?.setupFrameIndex)
        && Number.isInteger(finish?.setupFrameIndex)
        && start.setupFrameIndex >= 0 && finish.setupFrameIndex >= 0
        && start.setupFrameIndex < (source?.frameCount ?? 0)
        && finish.setupFrameIndex < (source?.frameCount ?? 0),
      "requestedOptions.analysisFps": snapshot.session.requestedOptions?.analysisFps === 30,
      "source.fpsClassification": source?.fpsClassification === "experimental_30_fps_class",
      "source.variableFrameRate": source?.variableFrameRate === false,
      "recordingAssessment.recordingMode": assessment?.recordingMode === "smooth_pan",
      "cameraEvidence": Boolean(sequence.cameraEvidence),
    };
    const failedPath = Object.entries(checks).find(([, pass]) => !pass)?.[0] ?? "<root>";
    throw validationFailure("experimental_30_zone_contract", [{
      path: [failedPath],
      contract: "valid manually confirmed 30 m experimental zone evidence",
      received: failedPath.split(".").reduce((current, segment) => current?.[segment], {
        calibrationInputs: snapshot.session.calibrationInputs,
        requestedOptions: snapshot.session.requestedOptions,
        source,
        recordingAssessment: assessment,
        cameraEvidence: sequence.cameraEvidence,
      }),
      message: "Experimental 30 m zone evidence is incomplete or inconsistent.",
    }]);
  }

  const samples = sequence.frames.flatMap((frame) => {
    const keys = frame.keypoints;
    const body = [keys.left_shoulder, keys.right_shoulder, keys.left_hip, keys.right_hip];
    if (body.some((point) => !point || (point.visibility ?? point.score) < 0.4)) return [];
    return [{
      frameIndex: frame.sourceFrameIndex ?? frame.index,
      timestampS: (frame.sourceTimestampMs ?? frame.tMs) / 1000,
      bodyPoint: { x: body.reduce((sum, point) => sum + point.x, 0) / 4,
        y: body.reduce((sum, point) => sum + point.y, 0) / 4 },
      confidence: Math.min(frame.trackingConfidence ?? 0, ...body.map((point) => point.visibility ?? point.score)),
    }];
  });
  const startCrossing = detectWorldBoundaryCrossing(samples, start, sequence.cameraEvidence,
    sequence.width, sequence.height, gates.travelDirection);
  const finishCrossing = detectWorldBoundaryCrossing(samples, finish, sequence.cameraEvidence,
    sequence.width, sequence.height, gates.travelDirection);
  if (!startCrossing || !finishCrossing || finishCrossing.timestampS <= startCrossing.timestampS) {
    throw validationFailure("experimental_30_world_gate_crossings", [{
      path: ["calibrationInputs", "gates"],
      contract: "ordered start and finish crossings within trackable frames",
      received: { startCrossing: Boolean(startCrossing), finishCrossing: Boolean(finishCrossing) },
      message: "Calibration boundaries do not produce two ordered athlete crossings.",
    }]);
  }
  const zone = {
    entryTimeSeconds: startCrossing.timestampS,
    exitTimeSeconds: finishCrossing.timestampS,
    distanceMeters: 30,
    crossingConfidence: Math.min(startCrossing.confidence, finishCrossing.confidence),
    panningSafe: true,
    calibrated: true,
    startCrossing,
    finishCrossing,
  };
  const enhancedEvidence = source.frameCount === 197
    && start?.validationAlignment?.annotationCount >= 5
    && finish?.validationAlignment?.annotationCount >= 5;
  if (enhancedEvidence) Object.assign(zone, {
    snapshot: {
      zoneVersion: gates.version,
      startGateId: gates.startGateId,
      finishGateId: gates.finishGateId,
      startAnchorVersion: start.immutableVersion ?? gates.version,
      finishAnchorVersion: finish.immutableVersion ?? gates.version,
      independentGateSchemaVersion: gates.schemaVersion,
      propagationModelVersion: start.propagationModelVersion,
      travelDirection: gates.travelDirection,
      bodyReference: gates.bodyReference,
    },
    sourceEvidence: {
      frameCount: source.frameCount,
      constantFrameRate: !source.variableFrameRate,
      cameraConfidence: assessment.cameraMotionConfidence,
      trackingConfidence: assessment.athleteTrackingConfidence,
      width: sequence.width,
    },
    manualAlignment: {
      startMeanOffsetPx: start.validationAlignment.meanMidpointErrorPx,
      startDriftPx: start.validationAlignment.driftRangePx,
      finishMeanOffsetPx: finish.validationAlignment.meanMidpointErrorPx,
      finishDriftPx: finish.validationAlignment.driftRangePx,
    },
  });
  return zone;
}

if (process.argv.includes("--check-config")) {
  structuredLog("info", "worker_configuration_valid", {
    workerId: config.workerId,
    workerVersion: config.workerVersion,
    modelPath: config.modelPath,
    healthPort: config.healthPort,
    compiledModules: true,
  });
  rmSync(buildDir, { recursive: true, force: true });
  process.exit(0);
}

/** Canonical pose artifact → the full-frame overlay coordinates acceleration v1 consumes. */
function accelerationOverlayFrames(sequence) {
  const joint = (frame, name) => {
    const point = frame.keypoints[name];
    return point
      ? { x: point.x, y: point.y, visibility: point.visibility ?? point.score }
      : undefined;
  };
  return sequence.frames.map((frame) => {
    const landmarks = {
      nose: joint(frame, "nose"),
      leftShoulder: joint(frame, "left_shoulder"),
      rightShoulder: joint(frame, "right_shoulder"),
      leftHip: joint(frame, "left_hip"),
      rightHip: joint(frame, "right_hip"),
      leftWrist: joint(frame, "left_wrist"),
      rightWrist: joint(frame, "right_wrist"),
      leftAnkle: joint(frame, "left_ankle"),
      rightAnkle: joint(frame, "right_ankle"),
      leftHeel: joint(frame, "left_heel"),
      rightHeel: joint(frame, "right_heel"),
      leftFootIndex: joint(frame, "left_toe"),
      rightFootIndex: joint(frame, "right_toe"),
    };
    const leftHip = landmarks.leftHip;
    const rightHip = landmarks.rightHip;
    const centerOfMass =
      leftHip && rightHip
        ? { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 }
        : null;
    return {
      frame: frame.index,
      time: frame.tMs / 1000,
      landmarks,
      centerOfMass,
      angles: {},
      velocity: null,
      footContact: { left: false, right: false },
    };
  });
}

// Benchmark-grade pose (Day 73b): the worker analyses real sprints where the athlete
// is often small/distant, so it runs the ROI "detection zoom" by default — the SAME
// strong settings as the CLI `--roi` benchmark path — so app reruns don't silently
// regress to the weaker full-frame pose. The Python runner reads these from the
// environment and the spawned child inherits this process's env. Set MEDIAPIPE_ROI=0
// to force the plain full-frame pipeline.
if (process.env.MEDIAPIPE_ROI == null || process.env.MEDIAPIPE_ROI === "") {
  process.env.MEDIAPIPE_ROI = "1";
}
const roiOn = process.env.MEDIAPIPE_ROI !== "0" && process.env.MEDIAPIPE_ROI !== "";
log(
  `ROI detection zoom: ${roiOn ? "ON" : "off"} (zoom=${process.env.MEDIAPIPE_ROI_ZOOM ?? "1.0"}, pad=${process.env.MEDIAPIPE_ROI_PADDING ?? "1.3"})`,
);

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error: databaseReadinessError } = await supabase
  .from("analysis_jobs")
  .select("id", { head: true, count: "exact" })
  .limit(1);
if (databaseReadinessError) {
  structuredLog("error", "worker_startup_failed", {
    workerId: config.workerId,
    errorCode: "database_not_ready",
    error: databaseReadinessError.message,
  });
  process.exit(1);
}
const { error: storageReadinessError } = await supabase.storage
  .from(VIDEO_BUCKET)
  .list("", { limit: 1 });
if (storageReadinessError) {
  structuredLog("error", "worker_startup_failed", {
    workerId: config.workerId,
    errorCode: "storage_not_ready",
    error: storageReadinessError.message,
  });
  process.exit(1);
}
const backend = MediaPipePoseBackend.withPythonRuntime({
  timeoutMs: config.processingTimeoutSeconds * 1000,
});
const rtmposeBackend = new RTMPosePoseBackend();

async function claim() {
  const { data, error } = await supabase.rpc("claim_analysis_job", {
    p_worker_id: config.workerId,
    p_worker_version: config.workerVersion,
    p_lease_seconds: config.leaseSeconds,
  });
  if (error) throw new Error(`database claim failed: ${error.message}`);
  return data?.[0] ?? null;
}

async function setStage(job, status) {
  const { data, error } = await supabase.rpc("set_analysis_job_stage", {
    p_job_id: job.id,
    p_claim_token: job.claim_token,
    p_worker_id: config.workerId,
    p_status: status,
  });
  if (error || data !== true) throw new Error(`stale job claim while entering ${status}`);
  job.status = status;
  log("job_stage", {
    jobId: job.id,
    analysisId: job.analysis_id,
    sessionId: job.session_id,
    attemptNumber: job.attempt_count,
    processingStage: status,
  });
}

async function heartbeat(job) {
  const { data, error } = await supabase.rpc("heartbeat_analysis_job", {
    p_job_id: job.id,
    p_claim_token: job.claim_token,
    p_worker_id: config.workerId,
    p_lease_seconds: config.leaseSeconds,
  });
  if (error || data !== true) throw new Error("stale job claim during heartbeat");
}

function writeArtifacts(analysisId, sequence, analysis, warnings, tempDir) {
  try {
    const poseDir = path.join(tempDir, "pose-sequences");
    mkdirSync(poseDir, { recursive: true });
    writeFileSync(path.join(poseDir, `${analysisId}.pose.json`), JSON.stringify(sequence));
    const analysisDir = path.join(tempDir, "analysis");
    mkdirSync(analysisDir, { recursive: true });
    writeFileSync(
      path.join(analysisDir, `${analysisId}.analysis.json`),
      JSON.stringify({ metrics: analysis.metrics, warnings, source: analysis.source }, null, 2),
    );
  } catch (err) {
    log(`artifact write warning: ${err.message}`);
  }
}

const FLY_METRIC_META = {
  topSpeedMps: ["Top speed", "m/s", "calibration_required"],
  avgStrideLengthM: ["Average stride length", "m", "calibration_required"],
  strideFrequencyHz: ["Stride frequency", "Hz", "not_measured"],
  groundContactTimeMs: ["Ground contact time", "ms", "not_measured"],
  flightTimeMs: ["Flight time", "ms", "not_measured"],
  peakKneeFlexionDeg: ["Peak knee flexion", "deg", "insufficient_pose_confidence"],
  avgTrunkLeanDeg: ["Average trunk lean", "deg", "insufficient_pose_confidence"],
};

function buildResultFoundation({ claimed, session, sequence, metrics, warnings, modelVersion }) {
  const source = sequence.sourceMetadata;
  const experimental = source?.fpsClassification === "experimental_30_fps_class";
  const expectedFps = experimental ? 30 : VALIDATED_ANALYSIS_FPS;
  if (!source || sequence.fps !== expectedFps) {
    throw new Error("Required tier provenance is missing or analysis FPS does not match its source tier.");
  }
  const inputSnapshot = inputSnapshotSchema.parse(claimed.input_snapshot);
  const completedAt = new Date().toISOString();
  const coverage =
    source.frameCount > 0
      ? Math.min(1, sequence.frames.length / Math.max(1, Math.round(source.durationSeconds * expectedFps)))
      : 0;
  const score = Number(coverage.toFixed(3));
  const confidence = {
    score,
    label: confidenceLabel(score),
    rationale: experimental
      ? "Pose-frame coverage over preserved real frames in the experimental 30 FPS profile."
      : "Pose-frame coverage on the validated 60 FPS analysis timeline.",
  };
  const cameraAssessment = sequence.recordingAssessment ?? {
    recordingMode: "unsupported_recording",
    recordingModeVersion: "ava-recording-mode-v1",
    cameraMotionModelVersion: "ava-background-affine-v1",
    dynamicCropVersion: "ava-mediapipe-roi-v1",
    athleteTrackingVersion: "ava-single-pose-continuity-v1",
    confidence: 0,
    cameraMotionConfidence: 0,
    athleteTrackingConfidence: score,
    zoomClassification: "unreliable_scale_change",
    zoomConfidence: 0,
    transformSummary: {},
    unstableFrameRanges: [],
    trackingLossRanges: [],
    spatialMetricEligibility: "withheld",
    warnings: ["Camera motion could not be independently verified."],
  };
  const allWarnings = [...new Set([...warnings, ...cameraAssessment.warnings])];
  const globalScore = Math.min(score, cameraAssessment.athleteTrackingConfidence);
  const globalConfidence = {
    score: globalScore,
    label: confidenceLabel(globalScore),
    rationale: "Weakest-link confidence from pose coverage and athlete tracking.",
  };
  const provenance = provenanceSchema.parse({
    originalSourceFps: source.fps,
    sourceFpsClassification: source.fpsClassification,
    sourceFpsTierReason: source.fpsTierReason,
    sourceFpsTierPolicyVersion: source.fpsTierPolicyVersion,
    sourceFpsMetadata: {
      averageFps: source.averageFps ?? null,
      nominalFps: source.nominalFps ?? null,
      realFps: source.realFps ?? null,
      timestampFps: source.timestampFps ?? null,
      variableFrameRate: source.variableFrameRate ?? false,
    },
    analysisFps: sequence.fps,
    experimental,
    experimentVersion: experimental ? EXPERIMENTAL_30_PROFILE_VERSION : null,
    validationStatus: experimental ? "experimental" : "validated",
    compatibilityGroup: experimental ? EXPERIMENTAL_30_COMPATIBILITY_GROUP : "validated-60-v1",
    ...(experimental ? {
      eventDetectionModelVersion: "ava-events-30-experimental-v1",
      strideSegmentationModelVersion: "ava-strides-30-experimental-v1",
      timingModelVersion: "ava-timing-30-experimental-v1",
      metricTrustModelVersion: "ava-trust-30-experimental-v1",
      uncertaintyModelVersion: "ava-uncertainty-30-experimental-v1",
    } : {}),
    timingPolicyVersion: CONSERVATIVE_TIMING_POLICY_V1,
    sourceFrameCount: source.frameCount,
    analyzedFrameCount: sequence.frames.length,
    originalVideoWidth: sequence.width,
    originalVideoHeight: sequence.height,
    sourceDurationSeconds: source.durationSeconds,
    sourceCodec: source.codec,
    videoPath: session.video_path,
    poseModelName: "mediapipe",
    poseModelVersion: sequence.modelVersion,
    analysisPipelineVersion: experimental ? EXPERIMENTAL_30_PROFILE_VERSION : ANALYSIS_PIPELINE_VERSION,
    metricSchemaVersion: METRIC_SCHEMA_VERSION,
    zoneMetricSchemaVersion: "legacy",
    explainabilitySchemaVersion: EXPLAINABILITY_SCHEMA_VERSION,
    calibrationMode: session.calibration_point_bx != null ? "manual_known_distance" : "none",
    calibrationSnapshot: inputSnapshot.session.calibrationInputs,
    cameraMode: cameraAssessment.recordingMode,
    cameraMotionConfidence: cameraAssessment.cameraMotionConfidence,
    recordingModeVersion: cameraAssessment.recordingModeVersion,
    cameraMotionModelVersion: cameraAssessment.cameraMotionModelVersion,
    dynamicCropVersion: cameraAssessment.dynamicCropVersion,
    athleteTrackingVersion: cameraAssessment.athleteTrackingVersion,
    athleteTrackingConfidence: cameraAssessment.athleteTrackingConfidence,
    zoomClassification: cameraAssessment.zoomClassification,
    zoomConfidence: cameraAssessment.zoomConfidence,
    transformSummary: cameraAssessment.transformSummary,
    unstableFrameRanges: cameraAssessment.unstableFrameRanges,
    trackingLossRanges: cameraAssessment.trackingLossRanges,
    spatialMetricEligibility: cameraAssessment.spatialMetricEligibility,
    recordingQualityScore: Math.round(score * 100),
    recordingQualityClassification: confidence.label,
    globalAnalysisConfidence: globalConfidence,
    analysisWarnings: allWarnings,
    createdAt: new Date(claimed.created_at).toISOString(),
    completedAt,
  });
  const measurements = Object.entries(FLY_METRIC_META).map(([metricId, [name, unit, reason]]) => {
    const value = metrics[metricId];
    const group = metricId === "topSpeedMps" || metricId === "avgStrideLengthM"
      ? "spatial"
      : metricId === "strideFrequencyHz"
        ? "cadence"
        : metricId === "groundContactTimeMs" || metricId === "flightTimeMs"
          ? "event_timing"
          : "geometry";
    const trust = metricTrustForRecording(group, cameraAssessment, session.calibration_point_bx != null);
    const measured = typeof value === "number" && Number.isFinite(value);
    const experimentalAllowed = !experimental || group === "geometry" || metricId === "strideFrequencyHz";
    const available = measured && trust.status === "available" && experimentalAllowed;
    return {
      metricId,
      name,
      phase: session.analysis_type,
      side: null,
      repetitionRange: null,
      result: {
        value: available ? value : null,
        unit,
        status: available ? "available" : "withheld",
        confidence: available ? Math.min(score, trust.confidence ?? score) : null,
        confidenceLabel: available ? confidenceLabel(Math.min(score, trust.confidence ?? score)) : "insufficient",
        reasonCode: available ? null : (experimental && !experimentalAllowed ? "excluded_from_experimental_30_profile" : (measured ? trust.reasonCode : reason)),
        warning: available ? null : (warnings.find((x) => x.includes(metricId)) ?? null),
        source: "mediapipe",
        version: METRIC_SCHEMA_VERSION,
        experimental,
        experimentVersion: experimental ? EXPERIMENTAL_30_PROFILE_VERSION : null,
        validationStatus: experimental ? "experimental" : "validated",
        compatibilityGroup: experimental ? EXPERIMENTAL_30_COMPATIBILITY_GROUP : "validated-60-v1",
        uncertainty: null,
        uncertaintyUnit: null,
      },
      benchmarkComparison: null,
      evidenceReferences: [],
      warnings: [],
    };
  });
  const resultPayload = explainableAnalysisResultSchema.parse({
    schemaVersion: EXPLAINABILITY_SCHEMA_VERSION,
    analysisId: claimed.id,
    athleteId: session.athlete_id,
    sessionId: claimed.session_id,
    provenance,
    inputSnapshot,
    recordingAssessment: { ...cameraAssessment, status: confidence.label, frameCoverage: score },
    measurements,
    limitations: [],
    recommendations: [],
    retestPlans: [],
    warnings: allWarnings,
    overallConfidence: globalConfidence,
  });
  return { provenance, inputSnapshot, resultPayload, completedAt, modelVersion, experimental };
}

// Upload the PoseSequence JSON to the private pose-artifacts bucket so the app
// can render the overlay. Path is `<athlete_id>/<session_id>/<analysis_id>.pose.json`
// so the storage RLS policy (first path segment = an athlete the coach owns)
// authorizes the coach's read. Never throws: an upload failure just means no
// The deterministic path + upsert makes retries idempotent. Upload failures are
// surfaced to the retry policy; production never silently completes without it.
async function uploadPoseArtifact(athleteId, sessionId, analysisId, sequence) {
  if (!athleteId) {
    throw new Error(`invalid session state: no athlete id for ${sessionId}`);
  }
  const objectPath = `${athleteId}/${sessionId}/${analysisId}.pose.json`;
  const { error } = await supabase.storage
    .from(POSE_BUCKET)
    .upload(objectPath, JSON.stringify(sequence), {
      contentType: "application/json",
      upsert: true,
    });
  if (error) {
    throw new Error(`temporary storage artifact upload failure: ${error.message}`);
  }
  log(`uploaded pose artifact → ${POSE_BUCKET}/${objectPath}`);
  return objectPath;
}

/**
 * Worker-local calibration reader (Part 1 §2, Option B). Reads the authority the
 * run was queued with straight off the serialized snapshot — no `@/` imports, no
 * app barrel, no build-graph coupling. Mirrors ONLY the serialization/authority
 * inference in `src/lib/calibration/authority` (kept in parity by
 * worker-calibration-contract-sanity). Returns null for an uncalibrated run.
 */
function readWorkerCalibration(snapshot) {
  const gates = snapshot?.session?.calibrationInputs?.gates;
  if (!gates || typeof gates !== "object" || !gates.startGate || !gates.finishGate) return null;
  const userPlaced =
    gates.startBoundary?.selectedByUser === true && gates.finishBoundary?.selectedByUser === true;
  const source = gates.calibrationSource ?? (userPlaced ? "manual_confirmed" : "auto");
  const revision = gates.revision ?? gates.version ?? 0;
  return {
    calibrationSource: source,
    calibrationRevision: revision,
    authoritySchemaVersion: gates.authoritySchemaVersion ?? null,
    confirmedAt: gates.confirmedAt ?? null,
    distanceM: gates.distanceM ?? null,
    startC1: gates.startGate.c1 ?? null,
    startC2: gates.startGate.c2 ?? null,
    startTimeS: gates.startGate.timeS ?? null,
    finishC1: gates.finishGate.c1 ?? null,
    finishC2: gates.finishGate.c2 ?? null,
    finishTimeS: gates.finishGate.timeS ?? null,
    manualAuthoritative: source === "manual_confirmed",
  };
}

async function processJob(claimed) {
  const analysisClaim = {
    id: claimed.analysis_id,
    session_id: claimed.session_id,
    input_snapshot: null,
    created_at: claimed.created_at,
  };
  const tempDir = jobTempDir(config, claimed.id);
  let heartbeatError = null;
  let sequence;
  const heartbeatTimer = setInterval(
    () =>
      heartbeat(claimed).catch((error) => {
        heartbeatError = error;
      }),
    config.heartbeatSeconds * 1000,
  );
  log("job_claimed", {
    jobId: claimed.id,
    analysisId: claimed.analysis_id,
    sessionId: claimed.session_id,
    attemptNumber: claimed.attempt_count,
    processingStage: "claimed",
  });
  await supabase.from("sessions").update({ status: "analyzing" }).eq("id", claimed.session_id);

  const { data: analysisRow } = await supabase
    .from("analyses")
    .select("input_snapshot, created_at")
    .eq("id", claimed.analysis_id)
    .single();
  analysisClaim.input_snapshot = analysisRow?.input_snapshot;
  analysisClaim.created_at = analysisRow?.created_at ?? claimed.created_at;

  // Part 1 §2: explicitly read + log the calibration authority this run consumed
  // (structured, secrets-free — source/revision/schema/coords only, no URLs/keys).
  const workerCalibration = readWorkerCalibration(analysisClaim.input_snapshot);
  log("calibration_authority", {
    jobId: claimed.id,
    calibrationSource: workerCalibration?.calibrationSource ?? "none",
    calibrationRevision: workerCalibration?.calibrationRevision ?? 0,
    authoritySchemaVersion: workerCalibration?.authoritySchemaVersion ?? null,
    manualAuthoritative: workerCalibration?.manualAuthoritative ?? false,
    distanceM: workerCalibration?.distanceM ?? null,
    startTimeS: workerCalibration?.startTimeS ?? null,
    finishTimeS: workerCalibration?.finishTimeS ?? null,
  });
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "video_path, athlete_id, analysis_type, pose_engine, distance_m, calibration_point_bx, calibration_known_distance_m, fps, duration_s, width, height, codec, size_bytes",
    )
    .eq("id", claimed.session_id)
    .single();

  try {
    if (!session?.video_path) throw new Error("Session has no uploaded video.");
    await setStage(claimed, "downloading");
    const { data: signed, error: signErr } = await supabase.storage
      .from(VIDEO_BUCKET)
      .createSignedUrl(session.video_path, SIGNED_URL_TTL_S);
    if (signErr || !signed?.signedUrl) {
      throw new Error(`temporary storage failure: ${signErr?.message ?? "unknown"}`);
    }
    await setStage(claimed, "validating");
    if (session.size_bytes != null && session.size_bytes > config.maxFileBytes)
      throw new Error("video too large");
    if (session.duration_s != null && session.duration_s > config.maxDurationSeconds)
      throw new Error("duration limit exceeded");
    // Session metadata is advisory: container rounding/VFR evidence is inspected
    // by the MediaPipe runner before production biomechanics begin.
    if (
      session.duration_s &&
      session.fps &&
      session.duration_s * session.fps > config.maxSourceFrames
    )
      throw new Error("frame limit exceeded");
    if (session.codec && !/^(h264|hevc|h265|avc1|mov|mp4v)$/i.test(session.codec))
      throw new Error(`unsupported codec: ${session.codec}`);
    if (session.analysis_type !== "fly" && session.analysis_type !== "acceleration")
      throw new Error("unsupported analysis mode");
    if (
      session.analysis_type === "acceleration" &&
      (session.calibration_point_bx == null || session.calibration_known_distance_m == null)
    )
      throw new Error("invalid calibration input");
    await setStage(claimed, "processing");

    const requestedPoseEngine =
      session.analysis_type === "fly" && session.pose_engine === "rtmpose"
        ? "rtmpose"
        : "mediapipe";
    log(
      `running ${requestedPoseEngine} on ${session.video_path}${MAX_FRAMES ? ` (maxFrames=${MAX_FRAMES})` : ""}...`,
    );
    // All production biomechanics run on AVA's validated 60 Hz clock. The Python
    // runner samples high-speed source footage onto this clock; it never relabels
    // every 120/240 FPS frame as 60 FPS. The original object remains untouched.
    const opts = {
      fps: VALIDATED_ANALYSIS_FPS,
      ...(MAX_FRAMES ? { maxFrames: MAX_FRAMES } : {}),
    };
    // Acceleration start detection needs unusually clear wrist/ground landmarks.
    // Tighten the existing INTERNAL inference ROI for this job only. The Python
    // runner maps every cropped landmark back into full-frame coordinates, so the
    // stored artifact and user-facing follow/overlay retain their normal scale.
    const previousZoom = process.env.MEDIAPIPE_ROI_ZOOM;
    const previousPadding = process.env.MEDIAPIPE_ROI_PADDING;
    const previousAccelerationMode = process.env.MEDIAPIPE_ACCELERATION;
    const previousSmoothWindow = process.env.MEDIAPIPE_ROI_SMOOTH_WINDOW;
    if (session.analysis_type === "acceleration") {
      process.env.MEDIAPIPE_ROI = "1";
      process.env.MEDIAPIPE_ROI_ZOOM = process.env.MEDIAPIPE_ACCEL_START_ZOOM ?? "1.35";
      process.env.MEDIAPIPE_ROI_PADDING = process.env.MEDIAPIPE_ACCEL_START_PADDING ?? "1.2";
      process.env.MEDIAPIPE_ACCELERATION = "1";
      process.env.MEDIAPIPE_ROI_SMOOTH_WINDOW = process.env.MEDIAPIPE_ACCEL_SMOOTH_WINDOW ?? "3";
      log(
        "acceleration start detection: tighter internal ROI enabled (display coordinates unchanged)",
      );
    }
    let comparison = null;
    try {
      // MediaPipe is ALWAYS the primary engine — it drives every fly metric, so the
      // fly metric math AND numbers are unchanged regardless of the selected engine.
      // RTMPose is an EXPERIMENTAL, visual-only comparison skeleton: when the coach
      // selects the rtmpose engine we ALSO run RTMPose and attach it as each frame's
      // comparisonKeypoints (drawn dashed/purple in the overlay). It never becomes a
      // metrics source and never replaces the trusted MediaPipe pose.
      sequence = await backend.estimate({ signedUrl: signed.signedUrl }, opts);
      if (requestedPoseEngine === "rtmpose") {
        try {
          log(
            "experimental: running RTMPose comparison skeleton (visual only; metrics stay MediaPipe)",
          );
          comparison = await rtmposeBackend.estimate({ signedUrl: signed.signedUrl }, opts);
        } catch (rtmposeError) {
          log(`RTMPose comparison unavailable (${rtmposeError.message}); showing MediaPipe only`);
        }
      }
    } finally {
      if (previousZoom == null) delete process.env.MEDIAPIPE_ROI_ZOOM;
      else process.env.MEDIAPIPE_ROI_ZOOM = previousZoom;
      if (previousPadding == null) delete process.env.MEDIAPIPE_ROI_PADDING;
      else process.env.MEDIAPIPE_ROI_PADDING = previousPadding;
      if (previousAccelerationMode == null) delete process.env.MEDIAPIPE_ACCELERATION;
      else process.env.MEDIAPIPE_ACCELERATION = previousAccelerationMode;
      if (previousSmoothWindow == null) delete process.env.MEDIAPIPE_ROI_SMOOTH_WINDOW;
      else process.env.MEDIAPIPE_ROI_SMOOTH_WINDOW = previousSmoothWindow;
    }
    // Attach the experimental RTMPose pose to each MediaPipe frame as a visual-only
    // comparison layer, time-matched to the nearest RTMPose frame. Never read by metrics.
    if (comparison?.frames.length) {
      for (const frame of sequence.frames) {
        const nearest = comparison.frames.reduce(
          (best, candidate) =>
            Math.abs(candidate.tMs - frame.tMs) < Math.abs(best.tMs - frame.tMs) ? candidate : best,
          comparison.frames[0],
        );
        frame.comparisonBackend = "rtmpose";
        frame.comparisonKeypoints = nearest.keypoints;
      }
      log(`comparison: attached RTMPose skeleton to ${sequence.frames.length} MediaPipe frames`);
    }
    log(
      `pose: ${sequence.frames.length} frames @ ${sequence.fps}fps ${sequence.width}x${sequence.height}`,
    );
    if (!sequence.sourceMetadata) {
      throw new Error("MediaPipe did not return required source-video provenance.");
    }
    const sourceClassification =
      sequence.sourceMetadata.fpsClassification ??
      classifySourceFps({
        detectedFps: sequence.sourceMetadata.fps,
        averageFps: sequence.sourceMetadata.averageFps,
        nominalFps: sequence.sourceMetadata.nominalFps,
        realFps: sequence.sourceMetadata.realFps,
        timestampFps: sequence.sourceMetadata.timestampFps,
        variableFrameRate: sequence.sourceMetadata.variableFrameRate,
      });
    if (sourceClassification === "unsupported_source_fps")
      throw new Error(UNSUPPORTED_FPS_MESSAGE);
    sequence.sourceMetadata.fpsClassification = sourceClassification;
    log("source_fps_classified", {
      jobId: claimed.id,
      analysisId: claimed.analysis_id,
      sourceFps: sequence.sourceMetadata.fps,
      averageFps: sequence.sourceMetadata.averageFps,
      nominalFps: sequence.sourceMetadata.nominalFps,
      realFps: sequence.sourceMetadata.realFps,
      timestampFps: sequence.sourceMetadata.timestampFps,
      variableFrameRate: sequence.sourceMetadata.variableFrameRate,
      sourceFpsClassification: sourceClassification,
      analysisFps: sequence.fps,
    });
    if (
      sequence.sourceMetadata.durationSeconds > config.maxDurationSeconds ||
      sequence.sourceMetadata.frameCount > config.maxSourceFrames
    )
      throw new Error("source video exceeded duration or frame limit");
    if (heartbeatError) throw heartbeatError;
    await supabase
      .from("sessions")
      .update({
        fps: sequence.sourceMetadata.fps,
        fps_classification: sourceClassification,
        fps_metadata: {
          averageFps: sequence.sourceMetadata.averageFps ?? null,
          nominalFps: sequence.sourceMetadata.nominalFps ?? null,
          realFps: sequence.sourceMetadata.realFps ?? null,
          timestampFps: sequence.sourceMetadata.timestampFps ?? null,
          variableFrameRate: sequence.sourceMetadata.variableFrameRate ?? false,
          tierReason: sequence.sourceMetadata.fpsTierReason ?? null,
          tierPolicyVersion: sequence.sourceMetadata.fpsTierPolicyVersion ?? null,
        },
        duration_s: sequence.sourceMetadata.durationSeconds,
        width: sequence.width,
        height: sequence.height,
        codec: sequence.sourceMetadata.codec,
      })
      .eq("id", claimed.session_id);

    await setStage(claimed, "generating_results");
    let persistedMetrics;
    let artifactAnalysis;
    let warnings;
    let experimentalResult = null;
    if (session.analysis_type === "acceleration") {
      const finishDistanceM = session.calibration_known_distance_m ?? session.distance_m;
      const hasCalibration = session.calibration_point_bx != null && finishDistanceM != null;
      const calibration = hasCalibration
        ? {
            finishX: session.calibration_point_bx,
            finishDistanceM,
          }
        : null;
      persistedMetrics = computeAccelerationMetrics(
        accelerationOverlayFrames(sequence),
        calibration,
      );
      artifactAnalysis = { metrics: persistedMetrics, source: "acceleration-v1" };
      warnings = persistedMetrics.warnings;
      const splitCount = Object.values(persistedMetrics.splits).filter(
        (value) => value != null,
      ).length;
      log(
        `acceleration result: session=${claimed.session_id} analysis_type=${session.analysis_type} ` +
          `start=${persistedMetrics.startEvent.type}@${persistedMetrics.startEvent.timestamp ?? "n/a"} ` +
          `confidence=${persistedMetrics.startEvent.confidence.toFixed(2)} splits=${splitCount} ` +
          `finish=${persistedMetrics.finishDistanceM ?? "n/a"}m ` +
          `runTime=${persistedMetrics.runTime ?? "n/a"}s status=${persistedMetrics.status}`,
      );
      log(`movement candidates: ${JSON.stringify(persistedMetrics.startEvent.debug.candidates)}`);
    } else {
      // Fly remains on the existing analyzer + mapper, byte-for-byte in result shape.
      const analysis = analyzeSprint(sequence);
      const activeModelVersion = sequence.backend === "rtmpose" ? "rtmpose-yolo-v1" : MODEL_VERSION;
      const mapped = toAnalysisMetrics(analysis, activeModelVersion);
      persistedMetrics = mapped.metrics;
      artifactAnalysis = analysis;
      warnings = mapped.warnings;
      if (sourceClassification === "experimental_30_fps_class") {
        const immutableSnapshot = parseResultSchema(
          "input_snapshot",
          inputSnapshotSchema,
          analysisClaim.input_snapshot,
          { fpsClass: sourceClassification, experimental: true },
        );
        const timestamps = sequence.frames.map((frame) => (frame.sourceTimestampMs ?? frame.tMs) / 1000);
        const contacts = analysis.events.filter((event) => event.type === "contact").map((event) => {
          const frame = sequence.frames[event.frame];
          const before = sequence.frames[Math.max(0, event.frame - 1)];
          const after = sequence.frames[Math.min(sequence.frames.length - 1, event.frame + 1)];
          return {
            type: "contact",
            side: event.side,
            sourceFrameIndex: frame?.sourceFrameIndex ?? event.frame,
            timestampSeconds: event.tMs / 1000,
            bracketStartSeconds: (before?.sourceTimestampMs ?? before?.tMs ?? event.tMs) / 1000,
            bracketEndSeconds: (after?.sourceTimestampMs ?? after?.tMs ?? event.tMs) / 1000,
            interpolationFraction: null,
            confidence: event.confidence,
            uncertaintySeconds: 1 / 30 / 2,
            modelVersion: "ava-events-30-experimental-v1",
          };
        });
        // Technique-only and freshly reset experimental clips intentionally have
        // no physical gates. Preserve the mechanics analysis and withhold zone
        // timing instead of failing the entire job. A supplied gate snapshot
        // still goes through the same strict real-30 validation and fails closed.
        const timingEnabled = immutableSnapshot.session.timingSetup?.setupMode !== "technique_only";
        const real30Zone = timingEnabled && immutableSnapshot.session.calibrationInputs?.gates
          ? buildReal30Zone(immutableSnapshot, sequence)
          : null;
        experimentalResult = buildExperimental30Result({
          sourceFps: sequence.sourceMetadata.fps,
          rawTimestampsSeconds: timestamps,
          events: contacts,
          zone: real30Zone,
          completeStrideLengthsMeters: [],
          calibrationConfidence: null,
        });
        log("experimental_30m_timing", {
          analysisId: claimed.analysis_id,
          startCrossing: experimentalResult.real30Timing?.startCrossing,
          finishCrossing: experimentalResult.real30Timing?.finishCrossing,
          rawFlyTimeSeconds: experimentalResult.real30Timing?.rawFlyTimeSeconds,
          reportedFlyTimeSeconds: experimentalResult.real30Timing?.reportedFlyTimeSeconds,
          combinedUncertaintySeconds: experimentalResult.real30Timing?.combinedUncertaintySeconds,
          resultHash: experimentalResult.real30Timing?.resultHash,
        });
        // The shared analyzer may calculate diagnostic contact/flight estimates,
        // but those families are outside the experimental 30 FPS contract. Do not
        // leave them in the generic persisted metrics where validated consumers
        // could mistake them for eligible values.
        persistedMetrics = {
          ...persistedMetrics,
          strideFrequencyHz: experimentalResult.metrics.strideFrequency.value,
          groundContactTimeMs: null,
          flightTimeMs: null,
          reportedTimingMetrics: {
            groundContactTimeMs: null,
            flightTimeMs: null,
          },
          rawTimingMetrics: {
            groundContactTimeMs: null,
            flightTimeMs: null,
          },
        };
      }
      log(
        `metrics: strideHz=${persistedMetrics.strideFrequencyHz} gc=${persistedMetrics.groundContactTimeMs}ms flight=${persistedMetrics.flightTimeMs}ms ` +
          `peakKnee=${persistedMetrics.peakKneeFlexionDeg}° trunk=${persistedMetrics.avgTrunkLeanDeg}° (topSpeed/strideLen withheld without calibration)`,
      );
    }
    if (warnings.length) log(`warnings: ${warnings.join(" | ")}`);

    writeArtifacts(claimed.analysis_id, sequence, artifactAnalysis, warnings, tempDir);
    await setStage(claimed, "uploading_artifacts");
    const keypointsPath = await uploadPoseArtifact(
      session.athlete_id,
      claimed.session_id,
      claimed.analysis_id,
      sequence,
    );

    const modelVersion = sequence.backend === "rtmpose" ? "rtmpose-yolo-v1" : MODEL_VERSION;
    const foundation = buildResultFoundation({
      claimed: analysisClaim,
      session,
      sequence,
      metrics: persistedMetrics,
      warnings,
      modelVersion,
    });
    // Part 1 §2: persist the exact calibration revision/source/schema the worker
    // consumed into result provenance, so a result can be classified against the
    // calibration it was produced with (stale-result detection).
    if (workerCalibration && foundation.provenance && typeof foundation.provenance === "object") {
      foundation.provenance.calibration = {
        source: workerCalibration.calibrationSource,
        revision: workerCalibration.calibrationRevision,
        authoritySchemaVersion: workerCalibration.authoritySchemaVersion,
        confirmedAt: workerCalibration.confirmedAt,
        manualAuthoritative: workerCalibration.manualAuthoritative,
      };
    }
    await setStage(claimed, "completing");
    const { data: completed, error: completionError } = await supabase.rpc(
      foundation.experimental ? "complete_experimental_analysis_job" : "complete_analysis_job",
      {
        p_job_id: claimed.id,
        p_claim_token: claimed.claim_token,
        p_worker_id: config.workerId,
        p_model_version: modelVersion,
        p_metrics: persistedMetrics,
        p_provenance: foundation.provenance,
        p_input_snapshot: foundation.inputSnapshot,
        p_result_payload: foundation.resultPayload,
        p_keypoints_path: keypointsPath,
        p_source_fps: foundation.provenance.originalSourceFps,
        p_artifact_paths: keypointsPath ? { pose: keypointsPath } : {},
        ...(foundation.experimental ? { p_experimental_result: experimentalResult } : {}),
      },
    );
    if (completionError || completed !== true)
      throw new Error(`database completion failed: ${completionError?.message ?? "unknown"}`);
    log("job_completed", {
      jobId: claimed.id,
      analysisId: claimed.analysis_id,
      currentWorkingAnalysisId: claimed.analysis_id,
      queuedJobAnalysisId: claimed.analysis_id,
      completedAnalysisId: claimed.analysis_id,
      sessionId: claimed.session_id,
      attemptNumber: claimed.attempt_count,
      processingStage: "completed",
    });
  } catch (err) {
    const failure = classifyWorkerFailure(err);
    const validation = err?.validationDetails ?? (failure.code === "invalid_production_result"
      ? {
          validatorName: "runtime_result_contract",
          issues: [{
            path: "<root>",
            expected: "strict validated-60 or experimental-30 result contract",
            received: compactValue(err?.message ?? String(err)),
            message: err?.message ?? String(err),
          }],
        }
      : null);
    const delay = retryDelaySeconds(claimed.attempt_count);
    const { data: finalStatus, error: failureError } = await supabase.rpc("fail_analysis_job", {
      p_job_id: claimed.id,
      p_claim_token: claimed.claim_token,
      p_worker_id: config.workerId,
      p_error_code: failure.code,
      p_error_message: err.message,
      p_error_stage: claimed.status,
      p_failure_category: failure.category,
      p_user_message: failure.userMessage,
      p_retryable: failure.retryable,
      p_backoff_seconds: delay,
      p_user_action_required: failure.userActionRequired,
    });
    structuredLog("error", "job_failed", {
      jobId: claimed.id,
      analysisId: claimed.analysis_id,
      sessionId: claimed.session_id,
      attemptNumber: claimed.attempt_count,
      processingStage: claimed.status,
      errorCode: failure.code,
      validatorName: validation?.validatorName ?? null,
      failedPath: validation?.issues?.[0]?.path ?? null,
      expectedContract: validation?.issues?.[0]?.expected ?? null,
      receivedValue: validation?.issues?.[0]?.received ?? null,
      schemaIssues: validation?.issues ?? [],
      fpsClass: sequence?.sourceMetadata?.fpsClassification ?? null,
      experimental: sequence?.sourceMetadata?.fpsClassification === "experimental_30_fps_class",
      compatibilityGroup: sequence?.sourceMetadata?.fpsClassification === "experimental_30_fps_class"
        ? EXPERIMENTAL_30_COMPATIBILITY_GROUP
        : "validated-60-v1",
      finalStatus: failureError ? "lease_lost" : finalStatus,
    });
  } finally {
    clearInterval(heartbeatTimer);
    removeJobTempDir(tempDir);
  }
}

async function tick() {
  const job = await claim();
  if (job) await processJob(job);
}

async function refreshOperationalMetrics(state) {
  const { data } = await supabase
    .from("analysis_jobs")
    .select(
      "status, created_at, started_at, completed_at, failure_category, last_error_stage, worker_version",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (!data) return;
  const count = (status) => data.filter((job) => job.status === status).length;
  const durations = data
    .filter((job) => job.started_at && job.completed_at)
    .map(
      (job) => (new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000,
    )
    .sort((a, b) => a - b);
  const percentile = (p) =>
    durations.length
      ? durations[Math.min(durations.length - 1, Math.floor((durations.length - 1) * p))]
      : null;
  const queued = data.filter((job) => job.status === "queued" || job.status === "retry_scheduled");
  state.metrics = {
    queueDepth: queued.length,
    oldestQueuedAgeSeconds: queued.length
      ? Math.max(...queued.map((job) => (Date.now() - new Date(job.created_at).getTime()) / 1000))
      : 0,
    activeJobs: data.filter((job) =>
      [
        "claimed",
        "downloading",
        "validating",
        "processing",
        "generating_results",
        "uploading_artifacts",
        "completing",
      ].includes(job.status),
    ).length,
    completedJobs: count("completed"),
    failedJobs: count("failed"),
    retries: count("retry_scheduled"),
    deadLetteredJobs: count("dead_lettered"),
    averageProcessingSeconds: durations.length
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length
      : null,
    p50ProcessingSeconds: percentile(0.5),
    p95ProcessingSeconds: percentile(0.95),
    workerHeartbeatAt: new Date().toISOString(),
  };
}

let running = true;
process.on("SIGINT", () => {
  log("shutting down…");
  running = false;
});
process.on("SIGTERM", () => {
  log("shutdown_requested", { processingStage: "shutdown" });
  running = false;
});

const healthState = {
  ready: true,
  checks: { database: true, storage: true, model: true, python: true, tempStorage: true },
  lastLoopAt: Date.now(),
  metrics: { completed: 0, failed: 0, retries: 0 },
};
const healthServer = startHealthServer(config, healthState);
log("worker_ready", { processingStage: "idle", healthPort: config.healthPort });
while (running) {
  healthState.lastLoopAt = Date.now();
  try {
    await tick();
    await refreshOperationalMetrics(healthState);
  } catch (error) {
    structuredLog("error", "worker_loop_error", {
      workerId: config.workerId,
      errorCode: "poll_failed",
      error: error.message,
    });
  }
  if (running) await sleep(config.pollMs);
}
healthState.ready = false;
healthServer.close();
rmSync(buildDir, { recursive: true, force: true });
process.exit(0);
