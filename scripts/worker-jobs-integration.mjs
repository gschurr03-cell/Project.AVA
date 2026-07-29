import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: session, error: sessionError } = await supabase.from("sessions").select("id, athlete_id, video_path").not("video_path", "is", null).limit(1).single();
if (sessionError || !session) throw new Error(`Integration fixture requires one uploaded session: ${sessionError?.message}`);

const analysisId = crypto.randomUUID();
const { error: insertError } = await supabase.from("analyses").insert({ id: analysisId, session_id: session.id, model_version: "pending", status: "queued", analysis_fps: 60, analysis_pipeline_version: "ava-sprint-60-v1", metric_schema_version: "ava-metrics-v1", explainability_schema_version: "ava-explainability-v1" });
if (insertError) throw insertError;

try {
  const claim = (worker) => supabase.rpc("claim_analysis_job", { p_worker_id: worker, p_worker_version: "integration-test", p_lease_seconds: 60 });
  const [a, b] = await Promise.all([claim("integration-a"), claim("integration-b")]);
  if (a.error) throw a.error; if (b.error) throw b.error;
  const claims = [...(a.data ?? []), ...(b.data ?? [])].filter((job) => job.analysis_id === analysisId);
  assert.equal(claims.length, 1, "two workers must not claim one job");
  const job = claims[0];
  assert.ok(job.claim_token && job.lease_expires_at && job.attempt_count === 1);

  const before = new Date(job.lease_expires_at).getTime();
  const beat = await supabase.rpc("heartbeat_analysis_job", { p_job_id: job.id, p_claim_token: job.claim_token, p_worker_id: job.claimed_by, p_lease_seconds: 120 });
  assert.equal(beat.data, true); assert.equal(beat.error, null);
  const { data: afterBeat } = await supabase.from("analysis_jobs").select("lease_expires_at").eq("id", job.id).single();
  assert.ok(new Date(afterBeat.lease_expires_at).getTime() > before);

  const stale = await supabase.rpc("set_analysis_job_stage", { p_job_id: job.id, p_claim_token: crypto.randomUUID(), p_worker_id: job.claimed_by, p_status: "processing" });
  assert.equal(stale.data, false);

  const provenance = { analysisFps: 60, poseModelName: "mediapipe" };
  const result = { analysisId, sessionId: session.id, athleteId: session.athlete_id };
  const completeArgs = { p_job_id: job.id, p_claim_token: job.claim_token, p_worker_id: job.claimed_by, p_model_version: "mediapipe-test", p_metrics: {}, p_provenance: provenance, p_input_snapshot: null, p_result_payload: result, p_keypoints_path: null, p_source_fps: 120, p_artifact_paths: {} };
  const completed = await supabase.rpc("complete_analysis_job", completeArgs);
  assert.equal(completed.data, true); assert.equal(completed.error, null);
  const duplicate = await supabase.rpc("complete_analysis_job", { ...completeArgs, p_claim_token: crypto.randomUUID(), p_worker_id: "stale-worker" });
  assert.equal(duplicate.data, true); assert.equal(duplicate.error, null);
  const reclaimed = await claim("integration-c");
  assert.equal((reclaimed.data ?? []).some((candidate) => candidate.analysis_id === analysisId), false);
  console.log("worker-jobs integration: passed");
} finally {
  await supabase.from("analyses").delete().eq("id", analysisId);
}
