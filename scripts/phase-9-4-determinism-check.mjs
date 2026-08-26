// Phase 9.4 Part E -- rerun determinism. Downloads the artifact/metrics from
// the fresh run captured by phase-9-4-fresh-analysis-runs.mjs (pass 1),
// triggers one more real rerun via the actual RPC the "Rerun Analysis"
// button calls (pass 2), waits for completion, downloads pass 2's artifact,
// and compares. Scientific payload (pose keypoints, metrics, contacts,
// step identities, provenance fields) is compared for equality; lifecycle
// metadata that legitimately varies per run (timestamps, job ids) is
// explicitly excluded, matching Phase 7.2B's own established convention.
//
//   node --env-file=.env.local scripts/phase-9-4-determinism-check.mjs
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const OUT = "tmp/phase94";
mkdirSync(OUT, { recursive: true });
const sessionId = "31fe352b-f00f-4a80-b20a-17c2ab08ec5a"; // vanni240
const label = "vanni240";

async function captureCurrent(pass) {
  const { data: s } = await db.from("sessions").select("current_working_analysis_id").eq("id", sessionId).single();
  const analysisId = s.current_working_analysis_id;
  const { data: a } = await db.from("analyses")
    .select("id, status, metrics, provenance, keypoints_path, completed_at, analysis_fps, input_snapshot")
    .eq("id", analysisId).single();
  const { data: blob, error } = await db.storage.from("pose-artifacts").download(a.keypoints_path);
  if (error || !blob) throw error ?? new Error("artifact download failed");
  const buf = Buffer.from(await blob.arrayBuffer());
  const sha256 = createHash("sha256").update(buf).digest("hex");
  writeFileSync(`${OUT}/${label}-determinism-${pass}.pose.json`, buf);
  return { analysisId, status: a.status, metrics: a.metrics, provenance: a.provenance, completedAt: a.completed_at, analysisFps: a.analysis_fps, artifactSha256: sha256, artifactBytes: buf.length };
}

console.log("Capturing pass 1 (from the fresh run just completed)...");
const pass1 = await captureCurrent("pass1");
console.log(`pass1: analysisId=${pass1.analysisId} sha256=${pass1.artifactSha256.slice(0, 16)}... completedAt=${pass1.completedAt}`);

console.log("\nQueuing pass 2 via the real replace_working_analysis RPC (same path the Rerun Analysis button calls)...");
const { data: before } = await db.from("analyses").select("id, input_snapshot, analysis_fps, analysis_pipeline_version, metric_schema_version, explainability_schema_version, timing_compatibility_group").eq("id", pass1.analysisId).single();
const { data: requeuedId, error: queueError } = await db.rpc("replace_working_analysis", {
  p_session_id: sessionId,
  p_input_snapshot: before.input_snapshot,
  p_analysis_fps: before.analysis_fps,
  p_pipeline_version: before.analysis_pipeline_version,
  p_metric_schema_version: before.metric_schema_version,
  p_explainability_schema_version: before.explainability_schema_version,
  p_timing_compatibility_group: before.timing_compatibility_group,
});
if (queueError || requeuedId !== pass1.analysisId) throw queueError ?? new Error("working identity changed during rerun");

const deadline = Date.now() + 6 * 60 * 1000;
let lastStatus = null;
while (Date.now() < deadline) {
  const { data: job } = await db.from("analysis_jobs").select("status, completed_at").eq("analysis_id", requeuedId).single();
  if (job.status !== lastStatus) { console.log(`pass2: job.status=${job.status}`); lastStatus = job.status; }
  if (job.status === "completed" && job.completed_at !== pass1.completedAt) break;
  if (["failed", "dead_lettered", "cancelled"].includes(job.status)) throw new Error(`pass2 ended ${job.status}`);
  await new Promise((r) => setTimeout(r, 1000));
}

console.log("\nCapturing pass 2...");
const pass2 = await captureCurrent("pass2");
console.log(`pass2: analysisId=${pass2.analysisId} sha256=${pass2.artifactSha256.slice(0, 16)}... completedAt=${pass2.completedAt}`);

// Scientific comparison: strip lifecycle-only fields (timestamps, run ids)
// before comparing metrics/provenance for equality.
function stripLifecycle(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const clone = JSON.parse(JSON.stringify(obj));
  const strip = (o) => {
    if (Array.isArray(o)) { o.forEach(strip); return; }
    if (o && typeof o === "object") {
      for (const k of Object.keys(o)) {
        if (/completedAt|createdAt|capturedAt|timestamp|runId|jobId|analysisId/i.test(k)) delete o[k];
        else strip(o[k]);
      }
    }
  };
  strip(clone);
  return clone;
}

const metricsEqual = JSON.stringify(stripLifecycle(pass1.metrics)) === JSON.stringify(stripLifecycle(pass2.metrics));
const provenanceEqual = JSON.stringify(stripLifecycle(pass1.provenance)) === JSON.stringify(stripLifecycle(pass2.provenance));
const artifactByteIdentical = pass1.artifactSha256 === pass2.artifactSha256;

const report = {
  pass1: { analysisId: pass1.analysisId, artifactSha256: pass1.artifactSha256, artifactBytes: pass1.artifactBytes, completedAt: pass1.completedAt },
  pass2: { analysisId: pass2.analysisId, artifactSha256: pass2.artifactSha256, artifactBytes: pass2.artifactBytes, completedAt: pass2.completedAt },
  comparison: {
    workingAnalysisIdStable: pass1.analysisId === pass2.analysisId,
    artifactByteIdentical,
    metricsEqualAfterStrippingLifecycleFields: metricsEqual,
    provenanceEqualAfterStrippingLifecycleFields: provenanceEqual,
    onlyDifferenceIsLifecycleTimestamp: pass1.completedAt !== pass2.completedAt,
  },
};
writeFileSync(`${OUT}/${label}-determinism.json`, JSON.stringify(report, null, 2));
console.log("\n=== determinism result ===");
console.log(JSON.stringify(report.comparison, null, 2));
