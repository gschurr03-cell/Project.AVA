// Phase 4.1 (2026-08-05) — queue real production reruns for the 4 stationary
// benchmarks (Gav protected + Vanni 240/120/60) now that box_tracker.py has
// changed, via the SAME non-destructive RPC path the app's own "rerun
// analysis" Server Action uses (mirrors scripts/panning-real-fixture-
// validate.mjs's --requeue and docs/phase-1-vanni-240-zone-time-report.md
// Section 14's precedent). Each session's pre-fix working analysis is first
// explicitly saved as a version (save_working_analysis_snapshot) so the
// pre-fix result remains queryable for a real before/after comparison,
// exactly as Phase 1 did for vanni_fly_240 (Section 13) — this run does the
// same for all 4 benchmarks instead of just one.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Local Supabase service environment is required.");
const db = createClient(url, key, { auth: { persistSession: false } });

const SESSIONS = [
  { label: "gav", id: "e04a7983-7406-4a00-bb89-8ada7b10bf9f" },
  { label: "vanni_fly_240", id: "31fe352b-f00f-4a80-b20a-17c2ab08ec5a" },
  { label: "vanni_fly_120", id: "160a86a2-c0db-4e7d-9fbe-82aedd6d3eff" },
  { label: "vanni_fly_60", id: "3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d" },
];

const results = [];
for (const { label, id } of SESSIONS) {
  const { data: session, error: sessionError } = await db
    .from("sessions")
    .select("id,current_working_analysis_id,is_reference_benchmark")
    .eq("id", id)
    .single();
  if (sessionError || !session) throw sessionError ?? new Error(`${label}: session missing`);
  const { data: current, error: currentError } = await db
    .from("analyses")
    .select(
      "id,status,keypoints_path,input_snapshot,analysis_fps,analysis_pipeline_version,metric_schema_version,explainability_schema_version,timing_compatibility_group",
    )
    .eq("id", session.current_working_analysis_id)
    .single();
  if (currentError || !current) throw currentError ?? new Error(`${label}: current working analysis missing`);
  if (current.status !== "complete") throw new Error(`${label}: pre-fix working analysis is not complete (status=${current.status})`);

  const { data: savedId, error: saveError } = await db.rpc("save_working_analysis_snapshot", {
    p_session_id: id,
    p_notes: "Phase 4.1 pre-fix snapshot (box_tracker.py teleport-rejection change, 2026-08-05)",
  });
  if (saveError || !savedId) throw saveError ?? new Error(`${label}: save_working_analysis_snapshot failed`);
  if (current.keypoints_path) {
    const slash = current.keypoints_path.lastIndexOf("/");
    const destination = `${current.keypoints_path.slice(0, slash + 1)}${savedId}.pose.json`;
    const { error: copyError } = await db.storage
      .from(process.env.POSE_ARTIFACTS_BUCKET ?? "pose-artifacts")
      .copy(current.keypoints_path, destination);
    if (copyError) throw new Error(`${label}: pose snapshot copy failed: ${copyError.message}`);
    await db.from("analyses").update({ keypoints_path: destination }).eq("id", savedId);
  }

  const { data: requeuedId, error: queueError } = await db.rpc("replace_working_analysis", {
    p_session_id: id,
    p_input_snapshot: current.input_snapshot,
    p_analysis_fps: current.analysis_fps,
    p_pipeline_version: current.analysis_pipeline_version,
    p_metric_schema_version: current.metric_schema_version,
    p_explainability_schema_version: current.explainability_schema_version,
    p_timing_compatibility_group: current.timing_compatibility_group,
  });
  if (queueError || !requeuedId) throw queueError ?? new Error(`${label}: replace_working_analysis failed`);
  if (requeuedId !== current.id) {
    throw new Error(`${label}: ordinary rerun must reuse the current working identity (got ${requeuedId}, expected ${current.id})`);
  }

  results.push({ label, sessionId: id, workingAnalysisId: requeuedId, preFixSavedVersionId: savedId, isReferenceBenchmark: session.is_reference_benchmark });
}

console.log(JSON.stringify(results, null, 2));
