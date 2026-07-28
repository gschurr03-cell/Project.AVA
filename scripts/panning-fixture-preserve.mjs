// Preserves real-fixture review evidence in private storage and the service-only registry.
// It never makes the source video or diagnostic imagery public.
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
const fixtureId = process.argv[2] ?? "real-side-pan-fly-001";
const manifest = JSON.parse(readFileSync(
  path.join(root, "validation/fixtures/panning", `${fixtureId}.json`),
  "utf8",
));
const manualAnnotation = JSON.parse(readFileSync(
  path.join(root, "validation/fixtures/panning", `${fixtureId}.manual.json`),
  "utf8",
));
const diagnosticPath = path.join("validation", fixtureId, "manual-contact-sheet.jpg");
const localDiagnostic = path.join("/tmp", `${fixtureId}-contact-sheet.jpg`);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Supabase service environment is required.");

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const artifact = readFileSync(localDiagnostic);
const { error: uploadError } = await supabase.storage
  .from(process.env.POSE_ARTIFACT_BUCKET ?? "pose-artifacts")
  .upload(diagnosticPath, artifact, { contentType: "image/jpeg", upsert: true });
if (uploadError) throw new Error(`Private diagnostic upload failed: ${uploadError.message}`);

const { error: updateError } = await supabase.from("validation_fixtures").upsert({
  fixture_id: manifest.fixtureId,
  schema_version: manifest.schemaVersion,
  name: manifest.name,
  session_id: manifest.protectedSource.sessionId,
  canonical_analysis_id: manifest.protectedSource.analysisId,
  protected_video_path: manifest.protectedSource.videoPath,
  expected_recording_class: manifest.expectedRecordingClass,
  source_metadata: manifest.sourceMetadata,
  external_reference: manifest.externalReference,
  validation_status: manifest.validationStatus,
  manual_annotation: manualAnnotation,
  diagnostic_artifact_path: diagnosticPath,
  notes: manifest.notes,
}, { onConflict: "fixture_id" });
if (updateError) throw new Error(`Fixture registry update failed: ${updateError.message}`);

console.log(JSON.stringify({
  fixtureId,
  validationStatus: manifest.validationStatus,
  diagnosticArtifact: { bucket: "private", path: diagnosticPath },
}, null, 2));
