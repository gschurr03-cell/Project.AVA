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
  console.error(`[analysis-worker] missing env: ${missing.join(", ")}. Run via: npm run worker:analysis`);
  process.exit(1);
}

const log = (msg) => console.log(`[analysis-worker] ${new Date().toLocaleTimeString()} ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- compile the TS pipeline once at startup ---
const buildDir = path.join(root, ".analysis-worker-build");
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
} catch (err) {
  console.error(`[analysis-worker] failed to compile pipeline: ${err.message}`);
  process.exit(1);
}
const { MediaPipePoseBackend } = require(path.join(buildDir, "mediapipe/index.js"));
const { analyzeSprint } = require(path.join(buildDir, "analysis/index.js"));
const { toAnalysisMetrics } = require(path.join(buildDir, "worker/index.js"));

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const backend = MediaPipePoseBackend.withPythonRuntime();

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
    .select("video_path, athlete_id")
    .eq("id", claimed.session_id)
    .single();

  if (!session?.video_path) {
    log(`session ${claimed.session_id} has no video — marking failed`);
    try {
      await callback(claimed.id, { status: "failed", modelVersion: MODEL_VERSION, error: "Session has no uploaded video." });
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

    log(`running MediaPipe on ${session.video_path}${MAX_FRAMES ? ` (maxFrames=${MAX_FRAMES})` : ""}...`);
    const opts = MAX_FRAMES ? { maxFrames: MAX_FRAMES } : {};
    const sequence = await backend.estimate({ signedUrl: signed.signedUrl }, opts);
    log(`pose: ${sequence.frames.length} frames @ ${sequence.fps}fps ${sequence.width}x${sequence.height}`);

    const analysis = analyzeSprint(sequence);
    const mapped = toAnalysisMetrics(analysis, MODEL_VERSION);
    const mm = mapped.metrics;
    log(
      `metrics: strideHz=${mm.strideFrequencyHz} gc=${mm.groundContactTimeMs}ms flight=${mm.flightTimeMs}ms ` +
        `peakKnee=${mm.peakKneeFlexionDeg}° trunk=${mm.avgTrunkLeanDeg}° (topSpeed/strideLen=0 placeholder)`,
    );
    if (mapped.warnings.length) log(`warnings: ${mapped.warnings.join(" | ")}`);

    writeArtifacts(claimed.id, sequence, analysis, mapped.warnings);
    const keypointsPath = await uploadPoseArtifact(
      session.athlete_id,
      claimed.session_id,
      claimed.id,
      sequence,
    );

    await callback(claimed.id, {
      status: "complete",
      modelVersion: MODEL_VERSION,
      metrics: mm,
      ...(keypointsPath ? { keypointsPath } : {}),
    });
    log(`delivered ${claimed.id} → complete`);
  } catch (err) {
    // A processing failure marks the analysis failed. If the callback itself is
    // unreachable, release the claim so the job is retried.
    log(`processing error for ${claimed.id}: ${err.message}`);
    try {
      await callback(claimed.id, { status: "failed", modelVersion: MODEL_VERSION, error: err.message });
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
