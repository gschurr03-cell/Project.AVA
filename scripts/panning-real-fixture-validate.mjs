import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const SESSION_ID = "2f1c901b-a5e2-4682-9049-1aa1fe8e89fb";
const SOURCE_PATH = "11111111-1111-4111-8111-111111111111/2f1c901b-a5e2-4682-9049-1aa1fe8e89fb.mov";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Local Supabase service environment is required.");
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: before, error: beforeError } = await db.from("sessions")
  .select("id,video_path,current_working_analysis_id,timing_workspace,calibration_gates,timing_setup,fps,fps_classification")
  .eq("id", SESSION_ID).single();
if (beforeError || !before) throw beforeError ?? new Error("fixture session missing");
assert.equal(before.video_path, SOURCE_PATH);
assert.equal(before.fps_classification, "experimental_30_fps_class");

const { data: visibleBefore } = await db.from("analyses")
  .select("id,analysis_kind,is_current_working,status,performance_result_status,input_snapshot,analysis_pipeline_version,metric_schema_version,explainability_schema_version,timing_compatibility_group")
  .eq("session_id", SESSION_ID).in("analysis_kind", ["working", "saved"]);
const current = visibleBefore?.find((row) => row.is_current_working);
if (!current) throw new Error("fixture current working analysis missing");

if (process.argv.includes("--requeue")) {
  const { data: reusedId, error: queueError } = await db.rpc("replace_working_analysis", {
    p_session_id: SESSION_ID,
    p_input_snapshot: current.input_snapshot,
    p_analysis_fps: 30,
    p_pipeline_version: current.analysis_pipeline_version,
    p_metric_schema_version: current.metric_schema_version,
    p_explainability_schema_version: current.explainability_schema_version,
    p_timing_compatibility_group: current.timing_compatibility_group,
  });
  if (queueError || !reusedId) throw queueError ?? new Error("fixture could not be requeued");
  assert.equal(reusedId, current.id, "ordinary rerun must reuse the current working identity");
  console.log(JSON.stringify({ phase: "requeue", workingAnalysisId: reusedId, identityReused: true }, null, 2));
  process.exit(0);
}

if (process.argv.includes("--persist-reviewed-draft")) {
  const start = { c1: { x: 657/1280, y: 496/720 }, c2: { x: 763/1280, y: 471/720 } };
  const finish = { c1: { x: 1020/1280, y: 457/720 }, c2: { x: 1108/1280, y: 498/720 } };
  const evidence = (referenceType, frame, line) => ({
    source: "manual_physical_line", referenceType, userConfirmed: true, frame,
    automaticCandidate: null, manualAdjustment: line, finalLine: line,
  });
  const draft = {
    schemaVersion: "ava-timing-workspace-v1", goal: "custom", setupMode: "marked_zone",
    distanceM: 30, bodyReference: "torso",
    overlays: { pose: true, skeleton: true, gates: true, landmarks: false, confidence: true,
      searchWindow: true, tracking: true, plane: true, opacity: .9 },
    gates: { start, finish },
    gateReview: { start: { accepted: true, locked: false }, finish: { accepted: true, locked: false } },
    gateEvidence: {
      start: evidence("white_tape", 84, start),
      finish: evidence("painted_transverse_line", 170, finish),
    },
    keyframes: [
      { id: "fixture-start-84", gate: "start", frame: 84, line: start, confidenceOverride: null },
      { id: "fixture-finish-170", gate: "finish", frame: 170, line: finish, confidenceOverride: null },
    ],
    manual: { startBefore: null, startAfter: null, finishBefore: null, finishAfter: null,
      startInterpolation: .5, finishInterpolation: .5 },
    timelineZoom: 2, selectedGate: "start",
  };
  const { error: draftError } = await db.from("sessions").update({ timing_workspace: draft }).eq("id", SESSION_ID);
  if (draftError) throw draftError;
  console.log(JSON.stringify({
    phase: "persist_reviewed_draft", sessionId: SESSION_ID,
    physicalReferences: { start: "white_tape", finish: "painted_transverse_line" },
    conesUsed: false, automaticCandidateClaimed: false, automaticReadiness: "withheld",
  }, null, 2));
  process.exit(0);
}

if (process.argv.includes("--reset-and-queue")) {
  const savedIds = (visibleBefore ?? []).filter((row) => row.analysis_kind === "saved").map((row) => row.id).sort();
  const snapshot = structuredClone(current.input_snapshot);
  snapshot.capturedAt = new Date().toISOString();
  snapshot.session.timingZone = {
    ...snapshot.session.timingZone, startS: null, endS: null, distanceM: null,
  };
  snapshot.session.timingSetup = {
    schemaVersion: "ava-timing-setup-v1", setupVersion: 1, setupMode: "technique_only",
    distance: { distanceM: null, status: "unknown", measurementMethod: null,
      uncertaintyM: null, evidence: null, confirmedAt: null },
    bodyReference: "torso", validationStatus: "eligible",
  };
  snapshot.session.calibrationInputs = {
    pointA: [null, null], pointB: [null, null], knownDistanceM: null,
    pointATimeS: null, pointBTimeS: null, gates: null,
  };
  snapshot.session.requestedOptions = {
    ...snapshot.session.requestedOptions, analysisFps: 30, poseEngine: "mediapipe",
  };

  const { error: resetError } = await db.rpc("reset_working_analysis", { p_session_id: SESSION_ID });
  if (resetError) throw resetError;
  const { error: draftError } = await db.from("sessions").update({ timing_workspace: {} }).eq("id", SESSION_ID);
  if (draftError) throw draftError;
  const { data: reset } = await db.from("sessions")
    .select("video_path,current_working_analysis_id,timing_workspace,calibration_gates,timing_setup")
    .eq("id", SESSION_ID).single();
  assert.equal(reset.video_path, SOURCE_PATH);
  assert.equal(reset.current_working_analysis_id, null);
  assert.deepEqual(reset.timing_workspace, {});
  assert.equal(reset.calibration_gates, null);
  assert.equal(reset.timing_setup.setupMode, "technique_only");
  const { data: archivedPrior } = await db.from("analyses")
    .select("analysis_kind,is_current_working,performance_result_status")
    .eq("id", current.id).single();
  assert.equal(archivedPrior.analysis_kind, "archived");
  assert.equal(archivedPrior.is_current_working, false);
  assert.equal(archivedPrior.performance_result_status, "invalid_gate_propagation");

  const { data: newId, error: queueError } = await db.rpc("replace_working_analysis", {
    p_session_id: SESSION_ID,
    p_input_snapshot: snapshot,
    p_analysis_fps: 30,
    p_pipeline_version: current.analysis_pipeline_version,
    p_metric_schema_version: current.metric_schema_version,
    p_explainability_schema_version: current.explainability_schema_version,
    p_timing_compatibility_group: "experimental-30-technique-only-v1",
  });
  if (queueError || !newId) throw queueError ?? new Error("fresh working analysis was not queued");
  const { data: visibleAfter } = await db.from("analyses")
    .select("id,analysis_kind,is_current_working").eq("session_id", SESSION_ID)
    .in("analysis_kind", ["working", "saved"]);
  assert.deepEqual((visibleAfter ?? []).filter((row) => row.analysis_kind === "saved").map((row) => row.id).sort(), savedIds);
  assert.equal(visibleAfter?.filter((row) => row.is_current_working).length, 1);
  console.log(JSON.stringify({
    phase: "reset_and_queue", sessionId: SESSION_ID, sourcePreserved: true,
    priorWorkingAnalysisId: current.id, queuedWorkingAnalysisId: newId,
    priorInvalidResultArchived: true, inheritedTimingCleared: true,
  }, null, 2));
  process.exit(0);
}

const { data: working, error: workingError } = await db.from("analyses")
  .select("id,status,keypoints_path,source_fps,experimental,experimental_result,performance_result_status,input_snapshot")
  .eq("id", before.current_working_analysis_id).single();
if (workingError || !working) throw workingError ?? new Error("fresh working analysis missing");
const { data: jobs } = await db.from("analysis_jobs")
  .select("id,analysis_id,status,last_error_code,last_error_message,output_artifact_paths")
  .eq("analysis_id", working.id);
assert.equal(working.input_snapshot.session.calibrationInputs.gates, null);
assert.equal(working.input_snapshot.session.timingSetup.setupMode, "technique_only");
assert.equal(before.calibration_gates, null);
if (Object.keys(before.timing_workspace ?? {}).length) {
  assert.equal(before.timing_workspace.gateEvidence.start.referenceType, "white_tape");
  assert.equal(before.timing_workspace.gateEvidence.finish.referenceType, "painted_transverse_line");
  assert.equal(before.timing_workspace.gateEvidence.start.automaticCandidate, null);
  assert.equal(before.timing_workspace.gateEvidence.finish.automaticCandidate, null);
  assert.equal(before.timing_workspace.manual.startBefore, null);
  assert.equal(before.timing_workspace.manual.finishBefore, null);
}
if (working.status === "complete") {
  assert.ok(working.keypoints_path, "completed fixture needs a pose artifact");
  assert.equal(working.source_fps, 30);
  assert.equal(working.experimental, true);
  assert.equal(working.experimental_result?.metrics?.zoneTime?.value ?? null, null);
  if (process.argv.includes("--prepare-local-gate-fixture")) {
    const { data: artifact, error: artifactError } = await db.storage
      .from("pose-artifacts").download(working.keypoints_path);
    if (artifactError || !artifact) throw artifactError ?? new Error("fresh pose artifact unavailable");
    writeFileSync("/tmp/ava-real-30m-pose.json", Buffer.from(await artifact.arrayBuffer()), { mode: 0o600 });
  }
}
console.log(JSON.stringify({
  phase: "verify", sessionId: SESSION_ID, workingAnalysisId: working.id,
  status: working.status, poseArtifactPath: working.keypoints_path,
  fps: working.source_fps, automaticTiming: working.experimental_result?.metrics?.zoneTime?.value ?? null,
  jobs,
}, null, 2));
