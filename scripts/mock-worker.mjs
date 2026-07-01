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

import { createClient } from "@supabase/supabase-js";

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
