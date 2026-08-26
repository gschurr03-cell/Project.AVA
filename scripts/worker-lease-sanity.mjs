// Day 95 audit (Part 6/7) — deterministic tests for:
//   - computeLeaseSeconds (pure, no DB)
//   - the real heartbeat_analysis_job RPC and database-owned parent projection
//     against synthetic, fully self-contained fixture rows (created via
//     direct postgres access since service_role deliberately has no
//     INSERT/UPDATE grant on these tables — the same lockdown that motivated
//     this whole fix — cleaned up unconditionally afterward).
//
//   node scripts/worker-lease-sanity.mjs
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  computeLeaseSeconds,
  computeProcessingTimeoutSeconds,
  LEASE_MAX_SECONDS,
  LEASE_SAFETY_MULTIPLIER,
  PROCESSING_TIMEOUT_MAX_SECONDS,
  PROCESSING_TIMEOUT_SAFETY_MULTIPLIER,
} from "./lib/worker-runtime.mjs";

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

// --- Part 6, test 11: computeLeaseSeconds scales with real job cost -------
const the240fpsSession = { duration_s: 9.803333, fps: 239.47983511113, width: 1920, height: 1080 };
const lease240 = computeLeaseSeconds(the240fpsSession, 180);
check(
  `1. a 240fps/2348-frame job's computed lease (${lease240}s) exceeds the fixed 180s default that failed on this exact clip`,
  lease240 > 180,
);
check(`2. the computed lease comfortably covers the OBSERVED real MediaPipe wall time (~295s)`, lease240 > 295);
check(`3. the computed lease respects the database-enforced ceiling (${LEASE_MAX_SECONDS}s)`, lease240 <= LEASE_MAX_SECONDS);

const tinyClip = { duration_s: 2, fps: 60, width: 1280, height: 720 };
check("4. a short 60fps clip's computed lease still never drops below the configured floor", computeLeaseSeconds(tinyClip, 180) >= 180);

const unknownSession = { duration_s: null, fps: null, width: null, height: null };
check("5. an unknown-cost (never-analyzed) session falls back to the configured floor exactly", computeLeaseSeconds(unknownSession, 180) === 180);

const hugeClip = { duration_s: 600, fps: 300, width: 3840, height: 2160 }; // pathological, tests the cap
check(`6. even a pathologically large job is capped at ${LEASE_MAX_SECONDS}s, never unbounded`, computeLeaseSeconds(hugeClip, 180) === LEASE_MAX_SECONDS);

// --- Part 9: computeProcessingTimeoutSeconds — the exact real-run failure --
// This is the exact session that got SIGKILLed by the flat 900s default
// subprocess timeout during this audit's real validation rerun (observed
// MediaPipe wall time ~933s with the Day 96 box-tracker + bounded expanded-
// crop-retry pipeline, exceeding the fixed 900s ceiling with no warning).
const timeout240 = computeProcessingTimeoutSeconds(the240fpsSession, 900);
check(
  `9. the scaled processing timeout (${timeout240}s) exceeds the flat 900s default that killed this exact real clip`,
  timeout240 > 900,
);
check("10. the scaled processing timeout comfortably exceeds the OBSERVED real MediaPipe wall time (~933s)", timeout240 > 933);
check(
  `11. the processing timeout's safety multiplier (${PROCESSING_TIMEOUT_SAFETY_MULTIPLIER}x) is wider than the lease's (${LEASE_SAFETY_MULTIPLIER}x) — it has no heartbeat renewal safety net`,
  PROCESSING_TIMEOUT_SAFETY_MULTIPLIER > LEASE_SAFETY_MULTIPLIER,
);
check("12. an unknown-cost session's processing timeout falls back to the configured default exactly", computeProcessingTimeoutSeconds(unknownSession, 900) === 900);
check(
  `13. even a pathologically large job's processing timeout is capped at ${PROCESSING_TIMEOUT_MAX_SECONDS}s, never unbounded`,
  computeProcessingTimeoutSeconds(hugeClip, 900) === PROCESSING_TIMEOUT_MAX_SECONDS,
);
check("14. a short 60fps clip's processing timeout still never drops below the configured floor", computeProcessingTimeoutSeconds(tinyClip, 900) >= 900);

// --- Part 6/7 DB-backed: real RPCs against synthetic fixture rows ---------
readFileSync(".env.local", "utf8").split("\n").forEach((l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
});
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const psql = (sql) =>
  execFileSync("docker", ["exec", "-i", "supabase_db_project-ava", "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-c", sql])
    .toString()
    .trim();

const athleteId = randomUUID();
const sessionAId = randomUUID();
const analysisAId = randomUUID();
const jobAId = randomUUID();
const sessionBId = randomUUID();
const analysisBId = randomUUID();
const jobBId = randomUUID();
const claimTokenA = randomUUID();
const claimTokenB = randomUUID();
const WORKER_ID = "worker-lease-sanity-test";

try {
  const coachId = psql("select id from auth.users where email='dev@projectava.local';");
  if (!coachId) throw new Error("dev coach account not found — run npm run dev:seed first");

  psql(`insert into public.athletes (id, coach_id, full_name) values ('${athleteId}', '${coachId}', 'Worker Lease Sanity (synthetic, safe to delete)');`);
  for (const [sid, aid, jid, token, status, leaseSql] of [
    [sessionAId, analysisAId, jobAId, claimTokenA, "processing", "now() + interval '30 seconds'"],  // healthy, within lease
    [sessionBId, analysisBId, jobBId, claimTokenB, "processing", "now() - interval '5 seconds'"],   // already expired
  ]) {
    psql(`insert into public.sessions (id, athlete_id, created_by, video_path, analysis_type) values ('${sid}', '${athleteId}', '${coachId}', 'synthetic/${sid}.mov', 'fly');`);
    psql(`insert into public.analyses (id, session_id, model_version, status, analysis_fps, version_number) values ('${aid}', '${sid}', 'test', 'queued', 60, 1);`);
    psql(`insert into public.analysis_jobs (id, analysis_id, session_id, athlete_id, status, claimed_by, claim_token, claimed_at, lease_expires_at, analysis_pipeline_version, source_video_path) values ('${jid}', '${aid}', '${sid}', '${athleteId}', '${status}', '${WORKER_ID}', '${token}', now(), ${leaseSql}, 'test', 'synthetic/${sid}.mov');`);
  }

  // --- 7. A healthy job's heartbeat succeeds and extends the lease. -------
  const { data: hbOk, error: hbOkErr } = await sb.rpc("heartbeat_analysis_job", {
    p_job_id: jobAId, p_claim_token: claimTokenA, p_worker_id: WORKER_ID, p_lease_seconds: 180,
  });
  check("7. a long-running healthy job's heartbeat succeeds (is not reclaimed)", hbOk === true && !hbOkErr);
  const newLease = psql(`select lease_expires_at > now() + interval '170 seconds' from public.analysis_jobs where id='${jobAId}';`);
  check("7b. a successful heartbeat actually extends lease_expires_at", newLease === "t");

  const progress10 = {
    stage: "pass1", framesCompleted: 10, totalFrames: 100,
    processedUnits: 10, totalUnits: 200, progressPercent: 20.7,
    throughputUnitsPerSecond: 5, etaSeconds: 38,
    capturedAtMs: Date.now(), updatedAt: new Date().toISOString(),
    method: "measured_work_units_v1",
  };
  const { data: progressOk } = await sb.rpc("report_analysis_job_progress", {
    p_job_id: jobAId, p_claim_token: claimTokenA, p_worker_id: WORKER_ID, p_progress: progress10,
  });
  check("7c. current claimant can persist measured work progress between heartbeats", progressOk === true);
  const { data: regressed } = await sb.rpc("report_analysis_job_progress", {
    p_job_id: jobAId, p_claim_token: claimTokenA, p_worker_id: WORKER_ID,
    p_progress: { ...progress10, framesCompleted: 5, processedUnits: 5 },
  });
  check("7d. progress cannot regress within an attempt", regressed !== true);
  const { data: wrongProgressOwner } = await sb.rpc("report_analysis_job_progress", {
    p_job_id: jobAId, p_claim_token: randomUUID(), p_worker_id: WORKER_ID, p_progress: progress10,
  });
  check("7e. a non-owner cannot report progress", wrongProgressOwner !== true);

  // --- 8. A stalled (already-expired) job's heartbeat fails, as required. -
  const { data: hbStale, error: hbStaleErr } = await sb.rpc("heartbeat_analysis_job", {
    p_job_id: jobBId, p_claim_token: claimTokenB, p_worker_id: WORKER_ID, p_lease_seconds: 180,
  });
  check("8. a stalled job (already past its lease) is NOT silently kept alive", hbStale !== true);

  // --- 13. The job trigger is the sole parent-state writer. ---------------
  const sessionAStatus = psql(`select status from public.sessions where id='${sessionAId}';`);
  check("13. claiming the job atomically projects its session to analyzing", sessionAStatus === "analyzing");
  const oldWriter = psql("select to_regprocedure('public.set_session_analyzing_status(uuid,uuid,text)') is not null;");
  check("13b. the obsolete second parent-state writer is absent", oldWriter === "f");
} finally {
  psql(`delete from public.athletes where id='${athleteId}';`);
}

console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
process.exit(ok ? 0 : 1);
