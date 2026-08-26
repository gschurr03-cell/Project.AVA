// Phase 7.2B real lifecycle validation. Requeues the existing Vanni 60 working
// analysis with its exact stored input snapshot, observes parent/job ordering,
// and retains the completed artifact/result for deterministic comparison.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const label = process.argv[2];
if (!label || !/^[a-z0-9_-]+$/i.test(label)) throw new Error("Usage: phase-7-2b-real-rerun.mjs <pass-label>");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Local Supabase service environment is required.");
const db = createClient(url, key, { auth: { persistSession: false } });
const sessionId = "3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d";
const outDir = "tmp/phase72b";
mkdirSync(outDir, { recursive: true });

const { data: session, error: sessionError } = await db.from("sessions")
  .select("id,current_working_analysis_id,status").eq("id", sessionId).single();
if (sessionError || !session?.current_working_analysis_id) throw sessionError ?? new Error("Working analysis unavailable.");
const analysisId = session.current_working_analysis_id;
const { data: before, error: beforeError } = await db.from("analyses")
  .select("id,status,input_snapshot,analysis_fps,analysis_pipeline_version,metric_schema_version,explainability_schema_version,timing_compatibility_group")
  .eq("id", analysisId).single();
if (beforeError || !before || before.status !== "complete") throw beforeError ?? new Error("A completed working result is required.");

const { data: savedVersionId, error: saveError } = await db.rpc("save_working_analysis_snapshot", {
  p_session_id: sessionId,
  p_notes: `Phase 7.2B lifecycle determinism pre-${label} snapshot`,
});
if (saveError || !savedVersionId) throw saveError ?? new Error("Could not preserve pre-rerun result.");

const { data: requeuedId, error: queueError } = await db.rpc("replace_working_analysis", {
  p_session_id: sessionId,
  p_input_snapshot: before.input_snapshot,
  p_analysis_fps: before.analysis_fps,
  p_pipeline_version: before.analysis_pipeline_version,
  p_metric_schema_version: before.metric_schema_version,
  p_explainability_schema_version: before.explainability_schema_version,
  p_timing_compatibility_group: before.timing_compatibility_group,
});
if (queueError || requeuedId !== analysisId) throw queueError ?? new Error("Working identity changed during rerun.");

const observations = [];
let previousStatus = null;
const deadline = Date.now() + 20 * 60 * 1000;
while (Date.now() < deadline) {
  const [{ data: job, error: jobError }, { data: parentAnalysis }, { data: parentSession }] = await Promise.all([
    db.from("analysis_jobs").select("status,attempt_count,updated_at,completed_at,output_artifact_paths").eq("analysis_id", analysisId).single(),
    db.from("analyses").select("status").eq("id", analysisId).single(),
    db.from("sessions").select("status,current_working_analysis_id").eq("id", sessionId).single(),
  ]);
  if (jobError || !job) throw jobError ?? new Error("Job disappeared.");
  if (job.status !== previousStatus) {
    observations.push({ job: job.status, analysis: parentAnalysis?.status, session: parentSession?.status, updatedAt: job.updated_at });
    console.log(`${label}: ${job.status} / analysis=${parentAnalysis?.status} / session=${parentSession?.status}`);
    previousStatus = job.status;
  }
  if (job.status === "completed") break;
  if (["failed", "dead_lettered", "cancelled"].includes(job.status)) throw new Error(`Rerun ended ${job.status}.`);
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
if (previousStatus !== "completed") throw new Error("Timed out awaiting completion.");

const { data: result, error: resultError } = await db.from("analyses")
  .select("id,status,metrics,provenance,input_snapshot,result_payload,keypoints_path,completed_at")
  .eq("id", analysisId).single();
if (resultError || !result?.keypoints_path) throw resultError ?? new Error("Completed artifact pointer unavailable.");
const { data: blob, error: downloadError } = await db.storage.from(process.env.POSE_ARTIFACTS_BUCKET ?? "pose-artifacts").download(result.keypoints_path);
if (downloadError || !blob) throw downloadError ?? new Error("Artifact download failed.");
const artifact = Buffer.from(await blob.arrayBuffer());
const artifactSha256 = createHash("sha256").update(artifact).digest("hex");
writeFileSync(`${outDir}/${label}.pose.json`, artifact);
writeFileSync(`${outDir}/${label}.result.json`, `${JSON.stringify({ savedVersionId, analysisId, observations, artifactSha256, result }, null, 2)}\n`);
console.log(JSON.stringify({ label, savedVersionId, analysisId, artifactSha256, observations }, null, 2));
