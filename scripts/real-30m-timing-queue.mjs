// Queue the three-run validation set from the confirmed immutable V1 zone snapshot.
// The mutable V2 session draft is intentionally neither read nor modified.
import { createClient } from "@supabase/supabase-js";
import { isDeepStrictEqual } from "node:util";

const sourceAnalysisId = "da5d8219-1cb3-45a4-bb23-6b264ea9cfec"; // immutable V1, frames 72/170
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Local Supabase service environment is required.");
const db = createClient(url, key, { auth: { persistSession: false } });
const { data: source, error } = await db.from("analyses")
  .select("session_id,input_snapshot,analysis_pipeline_version,metric_schema_version,explainability_schema_version")
  .eq("id", sourceAnalysisId).single();
if (error || !source?.input_snapshot) throw new Error(error?.message ?? "confirmed V1 analysis missing");
const snapshot = structuredClone(source.input_snapshot);
const gates = snapshot.session.calibrationInputs.gates;
if (gates?.version !== 1 || gates?.startBoundary?.setupFrameIndex !== 72
  || gates?.finishBoundary?.setupFrameIndex !== 170 || gates?.distanceM !== 30) {
  throw new Error("confirmed V1 gate snapshot mismatch");
}
const enrich = (boundary, type, alignment) => ({ ...boundary,
  gateId: boundary.boundaryId, type, immutableVersion: 1,
  physicalLineOrientationDeg: Math.atan2(
    boundary.sourceFrameLine.c2.y-boundary.sourceFrameLine.c1.y,
    boundary.sourceFrameLine.c2.x-boundary.sourceFrameLine.c1.x,
  )*180/Math.PI,
  validationAlignment: alignment,
});
gates.zoneDistanceMeters = 30;
gates.startGateId = gates.startBoundary.boundaryId;
gates.finishGateId = gates.finishBoundary.boundaryId;
gates.travelDirection = "left_to_right";
gates.bodyReference = "torso";
gates.connectedZoneVisualizationDeprecated = true;
gates.startBoundary = enrich(gates.startBoundary, "start", {
  meanMidpointErrorPx: 14.907459585038907, driftRangePx: 0.6986124884402329,
  minimumConfidence: 0.7184953786856355, annotationCount: 5,
});
gates.finishBoundary = enrich(gates.finishBoundary, "finish", {
  meanMidpointErrorPx: 0.2969503714599247, driftRangePx: 0.4486237109095423,
  minimumConfidence: 0.6816910770204332, annotationCount: 5,
});
snapshot.capturedAt = "2026-07-17T02:10:00.000Z";
snapshot.session.timingZone = { ...snapshot.session.timingZone, distanceM: 30,
  direction: "left_to_right", bodyReference: "torso" };
snapshot.session.requestedOptions = { ...snapshot.session.requestedOptions, analysisFps: 30 };

const rows = Array.from({ length: 3 }, () => ({ session_id: source.session_id, status: "queued",
  model_version: "pending", input_snapshot: snapshot, analysis_fps: 30,
  analysis_pipeline_version: source.analysis_pipeline_version,
  metric_schema_version: source.metric_schema_version,
  explainability_schema_version: source.explainability_schema_version }));
const { data: queued, error: insertError } = await db.from("analyses").insert(rows)
  .select("id,version_number,input_snapshot").order("version_number");
if (insertError) throw new Error(insertError.message);
await db.from("sessions").update({ status: "queued" }).eq("id", source.session_id);
if (!queued?.every((row) => isDeepStrictEqual(row.input_snapshot, snapshot))) {
  throw new Error("repeatability snapshots were not persisted identically");
}
console.log(JSON.stringify({ sourceAnalysisId, sessionId: source.session_id,
  untouchedMutableDraft: true, queued: queued.map(({ id, version_number }) => ({ id, version_number })) }, null, 2));
