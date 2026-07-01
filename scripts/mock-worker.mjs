// Local mock analysis worker (development only).
//
// Simulates the external pose-estimation worker: it polls for `queued`
// analyses, claims each one atomically, briefly "processes" it, then POSTs
// realistic mock metrics to the real, secured callback
// (/api/analyses/[id]/result). This closes the analysis loop in dev without
// any real pose detection.
//
// Run alongside the dev server:
//   Terminal 1:  npm run dev
//   Terminal 2:  npm run worker:mock
//
// NEVER deploy this: it uses the service-role key and is a dev convenience.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import ffprobe from "@ffprobe-installer/ffprobe";
import { createClient } from "@supabase/supabase-js";

const execFileAsync = promisify(execFile);

const {
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  ANALYSIS_WORKER_SECRET: WORKER_SECRET,
  WORKER_TARGET_URL,
} = process.env;

const TARGET_URL = WORKER_TARGET_URL ?? "http://localhost:3000";
const POLL_INTERVAL_MS = 3000;
const PROCESS_DELAY_MS = 1500; // fake "analysis" time so the UI shows running/analyzing
const MODEL_VERSION = "mock-worker-v1";
const VIDEO_BUCKET = "sprint-videos";
const SIGNED_URL_TTL_S = 300; // short-lived; a real worker would stream from this

// Fail fast on missing config rather than silently doing nothing.
const missing = [
  ["NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
  ["ANALYSIS_WORKER_SECRET", WORKER_SECRET],
]
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  console.error(`[mock-worker] missing env: ${missing.join(", ")}. Run via: npm run worker:mock`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const log = (msg) => console.log(`[mock-worker] ${new Date().toLocaleTimeString()} ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n, d = 2) => Number(n.toFixed(d));
const rand = (min, max, d = 2) => round(min + Math.random() * (max - min), d);

/** Realistic-ish sprint biomechanics values (SI units unless the name says otherwise). */
function mockMetrics() {
  return {
    topSpeedMps: rand(9.0, 11.5),
    avgStrideLengthM: rand(1.9, 2.5),
    strideFrequencyHz: rand(4.0, 5.0),
    groundContactTimeMs: round(rand(80, 120), 0),
    flightTimeMs: round(rand(100, 140), 0),
    peakKneeFlexionDeg: rand(95, 130, 1),
    avgTrunkLeanDeg: rand(5, 12, 1),
  };
}

/**
 * Atomically claim a queued analysis by flipping it to `running` only if it is
 * still `queued`. If the update returns no row, another tick/process already
 * took it, so we skip it. This is what prevents double-processing.
 */
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
  return data; // null when already claimed elsewhere
}

/**
 * Best-effort container guess from the first bytes of the file. No parser: just
 * magic-number matching. Returns a short label, or "unknown".
 */
function sniffContainer(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return "webm/mkv (EBML)";
  }
  // ISO base media (MP4/MOV/M4V): "ftyp" box type at offset 4.
  if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(...bytes.slice(8, 12)).trim();
    return `mp4/mov (ftyp${brand ? " " + brand : ""})`;
  }
  return "unknown";
}

/**
 * Gather lightweight context about a session's uploaded video without pulling
 * the whole file: authoritative size/type from Storage metadata, a short-lived
 * signed URL (the handle a real worker would stream from), and a container
 * guess from a 12-byte ranged read. Never throws — on any failure it returns a
 * context with a `warning`, so the mock still completes.
 *
 * Returns `{ ctx, signedUrl }`: `ctx` is safe to log; `signedUrl` is the raw,
 * token-bearing URL kept OUT of `ctx` so it can never be logged accidentally.
 */
async function inspectVideo(videoPath, originalFilename) {
  const ctx = {
    path: videoPath,
    filename: originalFilename ?? null,
    ext: videoPath.includes(".") ? videoPath.split(".").pop() : null,
    sizeBytes: null,
    contentType: null,
    updatedAt: null,
    container: null,
    signedUrl: false,
    warning: null,
  };
  try {
    const slash = videoPath.lastIndexOf("/");
    const folder = slash >= 0 ? videoPath.slice(0, slash) : "";
    const basename = videoPath.slice(slash + 1);

    // 1. Authoritative metadata (no bytes downloaded).
    const { data: list, error: listErr } = await supabase.storage
      .from(VIDEO_BUCKET)
      .list(folder, { search: basename, limit: 1 });
    if (listErr) throw new Error(`list: ${listErr.message}`);
    const obj = list?.find((o) => o.name === basename) ?? list?.[0];
    if (!obj) throw new Error("object not found in storage");
    ctx.sizeBytes = obj.metadata?.size ?? null;
    ctx.contentType = obj.metadata?.mimetype ?? null;
    ctx.updatedAt = obj.updated_at ?? obj.created_at ?? null;

    // 2. Short-lived signed URL — the retrievable handle for future processing.
    const { data: signed, error: signErr } = await supabase.storage
      .from(VIDEO_BUCKET)
      .createSignedUrl(videoPath, SIGNED_URL_TTL_S);
    if (signErr) throw new Error(`sign: ${signErr.message}`);
    ctx.signedUrl = Boolean(signed?.signedUrl);

    // 3. Sniff the container from a 12-byte ranged read (no full download).
    if (signed?.signedUrl) {
      const res = await fetch(signed.signedUrl, { headers: { Range: "bytes=0-11" } });
      if (res.ok || res.status === 206) {
        ctx.container = sniffContainer(new Uint8Array(await res.arrayBuffer()));
      } else {
        ctx.container = "unknown";
        ctx.warning = `range fetch HTTP ${res.status}`;
      }
    }
    return { ctx, signedUrl: signed?.signedUrl ?? null };
  } catch (err) {
    ctx.warning = err.message;
  }
  return { ctx, signedUrl: null };
}

/**
 * Extract intrinsic video metadata by running ffprobe against the signed URL
 * (ffprobe range-reads only what it needs; no full download). The URL is passed
 * as a single argv element via execFile — no shell, so no injection — and is
 * never logged. Returns null on any failure so the mock still completes.
 */
async function probeMetadata(signedUrl) {
  try {
    const { stdout } = await execFileAsync(
      ffprobe.path,
      [
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        signedUrl,
      ],
      { timeout: 20000, maxBuffer: 8 * 1024 * 1024 },
    );
    const probe = JSON.parse(stdout);
    const video = probe.streams?.find((s) => s.codec_type === "video");
    if (!video) return null;

    // avg_frame_rate is a rational like "30000/1001"; guard divide-by-zero.
    let fps = null;
    const [num, den] = String(video.avg_frame_rate ?? "").split("/").map(Number);
    if (num > 0 && den > 0) fps = Number((num / den).toFixed(3));

    const duration = Number(video.duration ?? probe.format?.duration);
    const size = Number(probe.format?.size);
    return {
      duration_s: Number.isFinite(duration) ? Number(duration.toFixed(3)) : null,
      width: video.width ?? null,
      height: video.height ?? null,
      fps,
      codec: video.codec_name ?? null,
      size_bytes: Number.isFinite(size) ? size : null,
    };
  } catch {
    return null;
  }
}

/** Deliver the result through the real, secured callback endpoint. */
async function deliver(analysisId, metrics) {
  const res = await fetch(`${TARGET_URL}/api/analyses/${analysisId}/result`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WORKER_SECRET}`,
    },
    body: JSON.stringify({ status: "complete", modelVersion: MODEL_VERSION, metrics }),
  });
  if (!res.ok) {
    throw new Error(`callback HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

async function processJob(job) {
  const claimed = await claim(job);
  if (!claimed) return; // lost the race
  log(`claimed ${claimed.id} (session ${claimed.session_id}) → running`);

  await supabase.from("sessions").update({ status: "analyzing" }).eq("id", claimed.session_id);
  log(`session ${claimed.session_id} → analyzing`);

  // Make the worker video-aware: fetch the session and inspect its uploaded
  // video. This context is logged and available for future real processing;
  // the mock still generates metrics regardless of what it finds.
  const { data: session } = await supabase
    .from("sessions")
    .select("video_path, original_filename")
    .eq("id", claimed.session_id)
    .single();

  if (session?.video_path) {
    const { ctx: v, signedUrl } = await inspectVideo(session.video_path, session.original_filename);
    log(
      `video ${v.path} | file=${v.filename ?? "—"} ext=${v.ext ?? "—"} ` +
        `size=${v.sizeBytes ?? "?"}B type=${v.contentType ?? "?"} container=${v.container ?? "?"} ` +
        `signedUrl=${v.signedUrl ? `minted (${SIGNED_URL_TTL_S}s)` : "no"}`,
    );
    if (v.warning) log(`video WARNING for ${claimed.session_id}: ${v.warning} — continuing with mock metrics`);

    // Intrinsic metadata via ffprobe, persisted to the session.
    if (signedUrl) {
      const meta = await probeMetadata(signedUrl);
      if (meta) {
        await supabase.from("sessions").update(meta).eq("id", claimed.session_id);
        log(
          `metadata ${claimed.session_id} → duration=${meta.duration_s ?? "?"}s ` +
            `res=${meta.width ?? "?"}x${meta.height ?? "?"} fps=${meta.fps ?? "?"} ` +
            `codec=${meta.codec ?? "?"} size=${meta.size_bytes ?? "?"}B`,
        );
      } else {
        log(`metadata WARNING for ${claimed.session_id}: ffprobe extraction failed — continuing`);
      }
    }
  } else {
    log(`video WARNING: session ${claimed.session_id} has no video_path — continuing with mock metrics`);
  }

  await sleep(PROCESS_DELAY_MS); // pretend to run pose estimation

  const metrics = mockMetrics();
  try {
    await deliver(claimed.id, metrics);
    log(`delivered ${claimed.id} via callback → complete (top speed ${metrics.topSpeedMps} m/s)`);
  } catch (err) {
    // Roll the claim back so the job is retried on the next tick.
    await supabase.from("analyses").update({ status: "queued" }).eq("id", claimed.id);
    await supabase.from("sessions").update({ status: "queued" }).eq("id", claimed.session_id);
    log(`delivery failed for ${claimed.id}: ${err.message} → released to queued`);
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
process.exit(0);
