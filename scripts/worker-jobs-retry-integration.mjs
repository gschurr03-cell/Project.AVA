import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: session } = await supabase.from("sessions").select("id").not("video_path", "is", null).limit(1).single();
if (!session) throw new Error("Integration fixture requires an uploaded session.");
const ids = [];
const create = async () => {
  const id = crypto.randomUUID(); ids.push(id);
  const { error } = await supabase.from("analyses").insert({ id, session_id: session.id, model_version: "pending", status: "queued", analysis_pipeline_version: "ava-sprint-60-v1" });
  if (error) throw error; return id;
};
const claim = async (worker) => {
  const { data, error } = await supabase.rpc("claim_analysis_job", { p_worker_id: worker, p_worker_version: "retry-test", p_lease_seconds: 60 });
  if (error) throw error; return data?.[0] ?? null;
};

try {
  const recoveryAnalysis = await create();
  const first = await claim("recovery-a"); assert.equal(first.analysis_id, recoveryAnalysis);
  await supabase.from("analysis_jobs").update({ lease_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", first.id);
  await claim("recovery-scan");
  const { data: recovered } = await supabase.from("analysis_jobs").select("status, claim_token, next_attempt_at").eq("id", first.id).single();
  assert.equal(recovered.status, "retry_scheduled"); assert.equal(recovered.claim_token, null);
  await supabase.from("analysis_jobs").update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq("id", first.id);
  const second = await claim("recovery-b"); assert.equal(second.analysis_id, recoveryAnalysis);
  const staleComplete = await supabase.rpc("complete_analysis_job", { p_job_id: first.id, p_claim_token: first.claim_token, p_worker_id: "recovery-a", p_model_version: "x", p_metrics: {}, p_provenance: {}, p_input_snapshot: null, p_result_payload: {}, p_keypoints_path: null, p_source_fps: 60, p_artifact_paths: {} });
  assert.ok(staleComplete.error, "stale worker completion must fail");

  const retry = await supabase.rpc("fail_analysis_job", { p_job_id: second.id, p_claim_token: second.claim_token, p_worker_id: "recovery-b", p_error_code: "temporary_storage", p_error_message: "fixture", p_error_stage: "processing", p_failure_category: "retryable", p_user_message: "Temporary issue.", p_retryable: true, p_backoff_seconds: 30, p_user_action_required: false });
  assert.equal(retry.data, "retry_scheduled");

  const permanentAnalysis = await create();
  // Recovery job is delayed, so the next eligible claim is the permanent fixture.
  const permanent = await claim("permanent-a"); assert.equal(permanent.analysis_id, permanentAnalysis);
  const failed = await supabase.rpc("fail_analysis_job", { p_job_id: permanent.id, p_claim_token: permanent.claim_token, p_worker_id: "permanent-a", p_error_code: "unsupported_codec", p_error_message: "fixture", p_error_stage: "validating", p_failure_category: "permanent_input", p_user_message: "Unsupported recording.", p_retryable: false, p_backoff_seconds: 1, p_user_action_required: true });
  assert.equal(failed.data, "failed");

  const deadAnalysis = await create();
  let deadJob = await claim("dead-1"); assert.equal(deadJob.analysis_id, deadAnalysis);
  await supabase.from("analysis_jobs").update({ attempt_count: 4 }).eq("id", deadJob.id);
  const dead = await supabase.rpc("fail_analysis_job", { p_job_id: deadJob.id, p_claim_token: deadJob.claim_token, p_worker_id: "dead-1", p_error_code: "temporary", p_error_message: "fixture", p_error_stage: "processing", p_failure_category: "retryable", p_user_message: "Temporary issue.", p_retryable: true, p_backoff_seconds: 1, p_user_action_required: false });
  assert.equal(dead.data, "dead_lettered");
  console.log("worker-jobs retry integration: passed");
} finally {
  for (const id of ids) await supabase.from("analyses").delete().eq("id", id);
}
