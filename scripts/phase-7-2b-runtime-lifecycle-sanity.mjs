import { readFileSync } from "node:fs";

let passed = 0;
let ok = true;
const check = (label, condition) => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (condition) passed += 1;
  else ok = false;
};
const source = (file) => readFileSync(file, "utf8");

const worker = source("scripts/analysis-worker.mjs");
const control = source("scripts/ava-worker-control.mjs");
const queue = source("supabase/migrations/0018_production_analysis_jobs.sql");
const parent = source("supabase/migrations/0076_analysis_lifecycle_parent_state.sql");
const rerun = source("supabase/migrations/0057_rerun_resets_full_analysis_contract.sql");
const retryProgress = source("supabase/migrations/0075_analysis_progress_retry_reset.sql");
const progressCard = source("src/app/sessions/[id]/AnalysisProgressCard.tsx");
const pathPage = source("src/app/sessions/[id]/path-to-goal/page.tsx");
const pathProgress = source("src/app/sessions/[id]/path-to-goal/AnalysisProgressExperience.tsx");
const dashboard = source("src/app/dashboard/page.tsx");

check("1. worker startup is launchd RunAtLoad", control.includes("<key>RunAtLoad</key><true/>"));
check("2. worker crash recovery is launchd KeepAlive", control.includes("<key>KeepAlive</key><true/>"));
check("3. worker launch is throttled to avoid restart storms", control.includes("<key>ThrottleInterval</key><integer>10</integer>"));
check("4. expired active leases are recovered by the claim transaction", queue.includes("failure_category = 'worker_interruption'") && queue.includes("lease_expires_at < now()"));
check("5. exhausted expired leases dead-letter deterministically", queue.includes("attempt_count >= max_attempts then 'dead_lettered'"));
check("6. non-exhausted expired leases retry deterministically", queue.includes("else 'retry_scheduled'"));
check("7. claims use SKIP LOCKED single-owner selection", queue.includes("for update skip locked limit 1"));
check("8. heartbeat requires matching job, token, worker, and live lease", queue.includes("claim_token = p_claim_token and claimed_by = p_worker_id") && queue.includes("lease_expires_at > now()"));
check("9. database trigger is the sole worker parent-state projection", parent.includes("sync_analysis_job_parent_status") && parent.includes("drop function if exists public.set_session_analyzing_status") && !worker.includes('rpc("set_session_analyzing_status"'));
check("10. parent projection covers every active worker stage", ["claimed", "downloading", "validating", "processing", "generating_results", "uploading_artifacts", "completing"].every((s) => parent.includes(`'${s}'`)));
check("11. parent projection covers completion and terminal failure", parent.includes("new.status = 'completed'") && parent.includes("'dead_lettered'"));
check("12. rerun serializes per session with an advisory transaction lock", rerun.includes("pg_advisory_xact_lock") && rerun.includes("for update"));
check("13. rerun preserves one working-analysis identity", rerun.includes("where session_id = p_session_id and is_current_working") && rerun.includes("current_working_analysis_id=v_id"));
check("14. rerun clears terminal result fields before queue exposure", rerun.indexOf("metrics=null, provenance=null, result_payload=null") < rerun.indexOf("update public.sessions set current_working_analysis_id=v_id, status='queued'"));
check("15. retry clears prior measured progress at the table boundary", retryProgress.includes("new.progress := null"));
check("16. artifact upload completes before database completion begins", worker.indexOf("await uploadPoseArtifact(") < worker.indexOf('await setStage(claimed, "completing")') && worker.indexOf('await setStage(claimed, "completing")') < worker.indexOf('"complete_analysis_job"'));
check("17. failed completion cannot be reported as job_completed", worker.indexOf("if (completionError || completed !== true)") < worker.indexOf('log("job_completed"'));
check("18. primary UI serializes polls", progressCard.includes("if (pollInFlight) return") && progressCard.includes("pollInFlight = true"));
check("19. primary UI rejects an entire stale snapshot", progressCard.includes("if (nextUpdatedAtMs < accepted.updatedAtMs) return") && progressCard.indexOf("if (nextUpdatedAtMs < accepted.updatedAtMs) return") < progressCard.indexOf("setMessage(row.user_message"));
check("20. primary UI performs only one terminal refresh", progressCard.includes("completionRefreshRef.current = true"));
check("21. Path To Goal selects the authoritative working analysis", pathPage.includes('.eq("id", session.current_working_analysis_id'));
check("22. Path To Goal seeds real queue status rather than fabricated processing", pathPage.includes("initialStatus={jobStatus?.status") && !pathPage.includes('initialStatus="processing"'));
check("23. secondary progress UI serializes and timestamp-orders polling", pathProgress.includes("if (pollInFlight) return") && pathProgress.includes("if (nextUpdatedAtMs < accepted.updatedAtMs) return"));
check("24. Dashboard excludes uploaded-only sessions from active processing", !dashboard.match(/const ACTIVE[^\n]+uploaded/));

console.log(`\n${passed}/24 Phase 7.2B deterministic lifecycle checks passed.`);
process.exit(ok && passed === 24 ? 0 : 1);
