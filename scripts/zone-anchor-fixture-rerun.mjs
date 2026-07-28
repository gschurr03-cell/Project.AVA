// One-purpose local validation utility: upgrades the protected panning fixture's
// existing user-selected 30 m gates to the v1 ground-anchor contract and queues
// one immutable rerun. It never changes or uploads source media.
import { createClient } from "@supabase/supabase-js";

const sessionId = "2f1c901b-a5e2-4682-9049-1aa1fe8e89fb";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Local Supabase service environment is required.");
const db = createClient(url, key, { auth: { persistSession: false } });
const { data: session, error: sessionError } = await db.from("sessions")
  .select("id,video_path,calibration_gates,timing_direction,timing_body_reference")
  .eq("id", sessionId).single();
if (sessionError || !session?.calibration_gates) throw new Error(sessionError?.message ?? "fixture gates missing");
if (session.calibration_gates.schemaVersion === "ava-ground-anchor-v1") {
  console.log("fixture already uses world-anchored gates; no duplicate rerun queued");
  process.exit(0);
}
const { data: latest, error: latestError } = await db.from("analyses")
  .select("input_snapshot,analysis_fps,analysis_pipeline_version,metric_schema_version,explainability_schema_version")
  .eq("session_id", sessionId).eq("status", "complete").order("version_number", { ascending: false }).limit(1).single();
if (latestError || !latest?.input_snapshot) throw new Error(latestError?.message ?? "completed fixture analysis missing");
const old = session.calibration_gates;
const direction = session.timing_direction === "right_to_left" ? "right_to_left" : "left_to_right";
const side = (line) => -(line.c2.y-line.c1.y)*(direction === "left_to_right" ? 1 : -1) >= 0
  ? "negative_to_positive" : "positive_to_negative";
const boundary = (type, gate, setupFrameIndex, compensatedAnchorLine) => ({
  boundaryId: `${type}-v1`, boundaryType: type, setupFrameIndex, setupTimestampS: gate.timeS,
  sourceFrameLine: { c1: gate.c1, c2: gate.c2 }, compensatedAnchorLine,
  groundAnchorVersion: "ava-ground-anchor-v1", confidence: 1, selectedByUser: true,
  physicalReferenceDescription: `User-selected physical ${type} track marking`,
  propagationModelVersion: "ava-background-affine-anchor-v1",
  signedCrossingSide: side({ c1: compensatedAnchorLine.c1, c2: compensatedAnchorLine.c2 }),
});
const gates = { ...old, schemaVersion: "ava-ground-anchor-v1", version: 1,
  travelDirection: direction,
  bodyReference: ["torso","hips","head"].includes(session.timing_body_reference) ? session.timing_body_reference : "torso",
  startGate: { ...old.startGate, setupFrameIndex: 72 },
  finishGate: { ...old.finishGate, setupFrameIndex: 170 },
  startBoundary: boundary("start", old.startGate, 72, { c1: { x: 1.1633440420691503, y: .8845268424746197 }, c2: { x: 1.2381231379532762, y: .8588085521287763 } }),
  finishBoundary: boundary("finish", old.finishGate, 170, { c1: { x: 3.9646772712628966, y: 1.7774131688892847 }, c2: { x: 4.014849212656246, y: 1.8526450806983181 } }),
};
const snapshot = structuredClone(latest.input_snapshot);
snapshot.capturedAt = new Date().toISOString();
snapshot.session.calibrationInputs.gates = gates;
const { error: updateError } = await db.from("sessions").update({ calibration_gates: gates,
  timing_zone_schema_version: "ava-ground-anchor-v1", timing_zone_version: 1, status: "queued" }).eq("id", sessionId);
if (updateError) throw new Error(updateError.message);
const { data: analysis, error: insertError } = await db.from("analyses").insert({ session_id: sessionId,
  status: "queued", model_version: "pending", input_snapshot: snapshot,
  analysis_fps: latest.analysis_fps, analysis_pipeline_version: latest.analysis_pipeline_version,
  metric_schema_version: latest.metric_schema_version, explainability_schema_version: latest.explainability_schema_version,
}).select("id,version_number").single();
if (insertError) throw new Error(insertError.message);
console.log(JSON.stringify({ sessionId, unchangedVideoPath: session.video_path, queuedAnalysis: analysis,
  zoneSchemaVersion: gates.schemaVersion, zoneVersion: gates.version, physicalDistanceM: gates.distanceM }, null, 2));
