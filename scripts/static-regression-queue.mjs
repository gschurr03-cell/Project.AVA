import { createClient } from "@supabase/supabase-js";
const sourceAnalysisId = "27b1aa27-20be-400a-9310-4f9f2fbd695b";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Local Supabase service environment is required.");
const db = createClient(url, key, { auth: { persistSession: false } });
const { data: source, error } = await db.from("analyses").select("session_id,input_snapshot,analysis_pipeline_version,metric_schema_version,explainability_schema_version,analysis_fps,experimental,recording_mode,result_payload,metrics,provenance").eq("id", sourceAnalysisId).single();
if (error || !source) throw new Error(error?.message ?? "trusted static baseline missing");
if (source.experimental || source.analysis_fps !== 60 || source.recording_mode !== "static_precision") throw new Error(`baseline is not trusted static 60 FPS: ${JSON.stringify({experimental:source.experimental,analysisFps:source.analysis_fps,recordingMode:source.recording_mode})}`);
const { data: queued, error: insertError } = await db.from("analyses").insert({ session_id: source.session_id,
  status: "queued", model_version: "pending", input_snapshot: source.input_snapshot, analysis_fps: 60,
  analysis_pipeline_version: source.analysis_pipeline_version, metric_schema_version: source.metric_schema_version,
  explainability_schema_version: source.explainability_schema_version }).select("id,version_number").single();
if (insertError) throw new Error(insertError.message);
await db.from("sessions").update({ status: "queued" }).eq("id", source.session_id);
console.log(JSON.stringify({ baseline: sourceAnalysisId, queued: queued.id, versionNumber: queued.version_number }, null, 2));
