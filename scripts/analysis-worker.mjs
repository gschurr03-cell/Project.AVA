// Real analysis worker (development).
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

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const {
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  ANALYSIS_WORKER_SECRET: WORKER_SECRET,
  WORKER_TARGET_URL,
  WORKER_MAX_FRAMES,
} = process.env;

const TARGET_URL = WORKER_TARGET_URL ?? "http://localhost:3000";
const VIDEO_BUCKET = "sprint-videos";
const POSE_BUCKET = process.env.POSE_ARTIFACTS_BUCKET ?? "pose-artifacts";
const SIGNED_URL_TTL_S = 3600;
const POLL_INTERVAL_MS = 3000;
const MODEL_VERSION = "mediapipe-sprint-0.1";
const MAX_FRAMES = WORKER_MAX_FRAMES ? Number(WORKER_MAX_FRAMES) : undefined;

const missing = [
  ["NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
  ["ANALYSIS_WORKER_SECRET", WORKER_SECRET],
]
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  console.error(
    `[analysis-worker] missing env: ${missing.join(", ")}. Run via: npm run worker:analysis`,
  );
  process.exit(1);
}

const log = (msg) => console.log(`[analysis-worker] ${new Date().toLocaleTimeString()} ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
      "--outDir",
      buildDir,
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
const { MediaPipePoseBackend } = require(path.join(buildDir, "mediapipe/index.js"));
const { RTMPosePoseBackend } = require(path.join(buildDir, "rtmpose/index.js"));
const { analyzeSprint } = require(path.join(buildDir, "analysis/index.js"));
const { toAnalysisMetrics } = require(path.join(buildDir, "worker/index.js"));
const { computeAccelerationMetrics } = require(
  path.join(accelerationBuildDir, "acceleration/metrics.js"),
);

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
const backend = MediaPipePoseBackend.withPythonRuntime();
const rtmposeBackend = new RTMPosePoseBackend();

async function claim(job) {
  const { data, error } = await supabase
    .from("analyses")
    .update({ status: "running" })
    .eq("id", job.id)
    .eq("status", "queued")
    .select("id, session_id")
    .maybeSingle();
  if (error) {
    log(`claim error for ${job.id}: ${error.message}`);
    return null;
  }
  return data;
}

async function release(claimed) {
  await supabase.from("analyses").update({ status: "queued" }).eq("id", claimed.id);
  await supabase.from("sessions").update({ status: "queued" }).eq("id", claimed.session_id);
}

async function callback(analysisId, body) {
  const res = await fetch(`${TARGET_URL}/api/analyses/${analysisId}/result`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${WORKER_SECRET}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`callback HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

function writeArtifacts(analysisId, sequence, analysis, warnings) {
  try {
    const poseDir = path.join(root, "artifacts", "pose-sequences");
    mkdirSync(poseDir, { recursive: true });
    writeFileSync(path.join(poseDir, `${analysisId}.pose.json`), JSON.stringify(sequence));
    const analysisDir = path.join(root, "artifacts", "analysis");
    mkdirSync(analysisDir, { recursive: true });
    writeFileSync(
      path.join(analysisDir, `${analysisId}.analysis.json`),
      JSON.stringify({ metrics: analysis.metrics, warnings, source: analysis.source }, null, 2),
    );
  } catch (err) {
    log(`artifact write warning: ${err.message}`);
  }
}

// Upload the PoseSequence JSON to the private pose-artifacts bucket so the app
// can render the overlay. Path is `<athlete_id>/<session_id>/<analysis_id>.pose.json`
// so the storage RLS policy (first path segment = an athlete the coach owns)
// authorizes the coach's read. Never throws: an upload failure just means no
// overlay for this analysis, so the analysis still completes normally.
async function uploadPoseArtifact(athleteId, sessionId, analysisId, sequence) {
  if (!athleteId) {
    log(`no athlete_id for session ${sessionId} — skipping pose artifact upload`);
    return null;
  }
  const objectPath = `${athleteId}/${sessionId}/${analysisId}.pose.json`;
  const { error } = await supabase.storage
    .from(POSE_BUCKET)
    .upload(objectPath, JSON.stringify(sequence), {
      contentType: "application/json",
      upsert: true,
    });
  if (error) {
    log(`pose artifact upload failed: ${error.message}`);
    return null;
  }
  log(`uploaded pose artifact → ${POSE_BUCKET}/${objectPath}`);
  return objectPath;
}

async function processJob(job) {
  const claimed = await claim(job);
  if (!claimed) return; // lost the race
  log(`claimed ${claimed.id} (session ${claimed.session_id}) → running`);
  await supabase.from("sessions").update({ status: "analyzing" }).eq("id", claimed.session_id);

  const { data: session } = await supabase
    .from("sessions")
    .select(
      "video_path, athlete_id, analysis_type, pose_engine, distance_m, calibration_point_bx, calibration_known_distance_m",
    )
    .eq("id", claimed.session_id)
    .single();

  if (!session?.video_path) {
    log(`session ${claimed.session_id} has no video — marking failed`);
    try {
      await callback(claimed.id, {
        status: "failed",
        modelVersion: MODEL_VERSION,
        error: "Session has no uploaded video.",
      });
    } catch (err) {
      await release(claimed);
      log(`could not deliver failure (${err.message}) → released`);
    }
    return;
  }

  try {
    const { data: signed, error: signErr } = await supabase.storage
      .from(VIDEO_BUCKET)
      .createSignedUrl(session.video_path, SIGNED_URL_TTL_S);
    if (signErr || !signed?.signedUrl) {
      throw new Error(`could not sign video URL: ${signErr?.message ?? "unknown"}`);
    }

    const requestedPoseEngine =
      session.analysis_type === "fly" && session.pose_engine === "rtmpose" ? "rtmpose" : "mediapipe";
    log(`running ${requestedPoseEngine} on ${session.video_path}${MAX_FRAMES ? ` (maxFrames=${MAX_FRAMES})` : ""}...`);
    const opts = MAX_FRAMES ? { maxFrames: MAX_FRAMES } : {};
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
      process.env.MEDIAPIPE_ROI_SMOOTH_WINDOW =
        process.env.MEDIAPIPE_ACCEL_SMOOTH_WINDOW ?? "3";
      log(
        "acceleration start detection: tighter internal ROI enabled (display coordinates unchanged)",
      );
    }
    let sequence;
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
          log("experimental: running RTMPose comparison skeleton (visual only; metrics stay MediaPipe)");
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

    let persistedMetrics;
    let artifactAnalysis;
    let warnings;
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
      const activeModelVersion =
        sequence.backend === "rtmpose" ? "rtmpose-yolo-v1" : MODEL_VERSION;
      const mapped = toAnalysisMetrics(analysis, activeModelVersion);
      persistedMetrics = mapped.metrics;
      artifactAnalysis = analysis;
      warnings = mapped.warnings;
      log(
        `metrics: strideHz=${persistedMetrics.strideFrequencyHz} gc=${persistedMetrics.groundContactTimeMs}ms flight=${persistedMetrics.flightTimeMs}ms ` +
          `peakKnee=${persistedMetrics.peakKneeFlexionDeg}° trunk=${persistedMetrics.avgTrunkLeanDeg}° (topSpeed/strideLen=0 placeholder)`,
      );
    }
    if (warnings.length) log(`warnings: ${warnings.join(" | ")}`);

    writeArtifacts(claimed.id, sequence, artifactAnalysis, warnings);
    const keypointsPath = await uploadPoseArtifact(
      session.athlete_id,
      claimed.session_id,
      claimed.id,
      sequence,
    );

    await callback(claimed.id, {
      status: "complete",
      modelVersion: sequence.backend === "rtmpose" ? "rtmpose-yolo-v1" : MODEL_VERSION,
      metrics: persistedMetrics,
      ...(keypointsPath ? { keypointsPath } : {}),
    });
    log(`delivered ${claimed.id} → complete`);
  } catch (err) {
    // A processing failure marks the analysis failed. If the callback itself is
    // unreachable, release the claim so the job is retried.
    log(`processing error for ${claimed.id}: ${err.message}`);
    try {
      await callback(claimed.id, {
        status: "failed",
        modelVersion: MODEL_VERSION,
        error: err.message,
      });
      log(`marked ${claimed.id} → failed`);
    } catch (deliverErr) {
      await release(claimed);
      log(`could not deliver failure (${deliverErr.message}) → released to queued`);
    }
  }
}

async function tick() {
  const { data: jobs, error } = await supabase
    .from("analyses")
    .select("id, session_id")
    .eq("status", "queued")
    .order("created_at", { ascending: true });
  if (error) {
    log(`poll error: ${error.message}`);
    return;
  }
  if (!jobs?.length) return;
  log(`found ${jobs.length} queued job(s)`);
  for (const job of jobs) await processJob(job);
}

let running = true;
process.on("SIGINT", () => {
  log("shutting down…");
  running = false;
});

log(`polling ${TARGET_URL} every ${POLL_INTERVAL_MS / 1000}s — Ctrl-C to stop`);
while (running) {
  await tick();
  if (running) await sleep(POLL_INTERVAL_MS);
}
rmSync(buildDir, { recursive: true, force: true });
process.exit(0);
