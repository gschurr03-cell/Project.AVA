// Phase 9.4 -- downloads the fresh pose artifacts + analysis rows produced
// by phase-9-4-fresh-analysis-runs.mjs, for use by every subsequent Part
// G-M validation script in this phase. Read-only against the DB (only
// downloads, no writes); does not touch tmp/phase80a/ (the historical
// baseline artifacts stay untouched, preserving benchmark history).
//
//   node --env-file=.env.local scripts/phase-9-4-download-fresh-artifacts.mjs
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const OUT = "tmp/phase94";
mkdirSync(OUT, { recursive: true });

const lifecycle = JSON.parse(readFileSync(`${OUT}/fresh-analysis-lifecycle.json`, "utf8")).results;

const identities = {};
for (const [label, run] of Object.entries(lifecycle)) {
  const { data: a } = await db.from("analyses")
    .select("id, session_id, status, metrics, provenance, keypoints_path, completed_at, analysis_fps, result_payload")
    .eq("id", run.newAnalysisId).single();
  const { data: blob, error } = await db.storage.from("pose-artifacts").download(a.keypoints_path);
  if (error || !blob) throw error ?? new Error(`${label}: artifact download failed`);
  const buf = Buffer.from(await blob.arrayBuffer());
  writeFileSync(`${OUT}/${label}.pose.json`, buf);
  identities[label] = {
    sessionId: run.sessionId, analysisId: a.id, keypointsPath: a.keypoints_path,
    analysisFps: a.analysis_fps, completedAt: a.completed_at, artifactBytes: buf.length,
    metrics: a.metrics, hasResultPayload: !!a.result_payload,
  };
  console.log(`${label}: downloaded ${buf.length} bytes -> ${OUT}/${label}.pose.json`);
}
writeFileSync(`${OUT}/fresh-benchmark-identities.json`, JSON.stringify(identities, null, 2));
console.log(`\nWrote ${OUT}/fresh-benchmark-identities.json`);
