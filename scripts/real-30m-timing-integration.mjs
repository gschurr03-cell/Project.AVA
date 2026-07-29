import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { writeFile } from "node:fs/promises";

const sessionId = "2f1c901b-a5e2-4682-9049-1aa1fe8e89fb";
const ids = ["1fd773e1-e9f6-4f74-abd5-ad20dd0220d7", "8dc75995-39ab-4840-940d-e2eb5bfd9e56", "fbeb8169-4294-4ed7-b1bf-28b06f55f312"];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Local Supabase service environment is required.");
const db = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await db.from("analyses").select("id,status,experimental,analysis_fps,experimental_result,experimental_raw_fly_time_seconds,experimental_reported_fly_time_seconds,experimental_timing_uncertainty_seconds,experimental_timing_result_hash,input_snapshot,keypoints_path")
  .eq("session_id", sessionId).in("id", ids).order("id");
if (error) throw new Error(error.message);
assert.equal(data?.length, 3);
for (const row of data) {
  assert.equal(row.status, "complete"); assert.equal(row.experimental, true); assert.equal(row.analysis_fps, 30);
  const timing = row.experimental_result?.real30Timing;
  assert.ok(timing); assert.equal(timing.zoneDistanceMeters, 30);
  assert.equal(row.input_snapshot.session.calibrationInputs.gates.startBoundary.setupFrameIndex, 72);
  assert.equal(row.input_snapshot.session.calibrationInputs.gates.finishBoundary.setupFrameIndex, 170);
  assert.equal(timing.sourceEvidence.frameCount, 197); assert.equal(timing.sourceEvidence.syntheticFrameCount, 0);
  assert.equal(timing.startCrossing.frameBefore, 99); assert.equal(timing.startCrossing.frameAfter, 100);
  assert.equal(timing.finishCrossing.frameBefore, 166); assert.equal(timing.finishCrossing.frameAfter, 167);
  assert.equal(Number(row.experimental_raw_fly_time_seconds), timing.rawFlyTimeSeconds);
  assert.equal(Number(row.experimental_reported_fly_time_seconds), timing.reportedFlyTimeSeconds);
  assert.equal(Number(row.experimental_timing_uncertainty_seconds), timing.combinedUncertaintySeconds);
  assert.equal(row.experimental_timing_result_hash, timing.resultHash);
}
const timings = data.map((row) => row.experimental_result.real30Timing);
assert.ok(timings.every((value) => JSON.stringify(value) === JSON.stringify(timings[0])));
const { data: poseBlob, error: poseError } = await db.storage.from("pose-artifacts").download(data[0].keypoints_path);
if (poseError || !poseBlob) throw new Error(poseError?.message ?? "repeatability pose artifact missing");
await writeFile("/tmp/ava-real-30m-pose.json", Buffer.from(await poseBlob.arrayBuffer()));
await writeFile("/tmp/ava-real-30m-snapshot.json", JSON.stringify(data[0].input_snapshot, null, 2));
console.log(JSON.stringify({ repeatabilityRuns: 3, exactMatch: true, hash: timings[0].resultHash,
  rawFlyTimeSeconds: timings[0].rawFlyTimeSeconds, reportedFlyTimeSeconds: timings[0].reportedFlyTimeSeconds,
  reportedAverageVelocityMps: timings[0].reportedAverageVelocityMps,
  combinedUncertaintySeconds: timings[0].combinedUncertaintySeconds,
  reviewPoseArtifact: "/tmp/ava-real-30m-pose.json", reviewSnapshot: "/tmp/ava-real-30m-snapshot.json" }, null, 2));
