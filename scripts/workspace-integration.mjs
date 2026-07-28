import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Local Supabase service environment is required.");
const supabase = createClient(url, key, { auth: { persistSession: false } });
const sessionId = process.argv[2] ?? "2f1c901b-a5e2-4682-9049-1aa1fe8e89fb";
const { data: session, error: sessionError } = await supabase.from("sessions")
  .select("id,video_path,width,height,fps").eq("id", sessionId).single();
if (sessionError || !session?.video_path) throw new Error(sessionError?.message ?? "fixture source missing");
const { data: versions, error: versionsError } = await supabase.from("analyses")
  .select("id,status,keypoints_path,version_number,parent_analysis_id,workspace_config,analysis_pipeline_version,analysis_fps,experimental")
  .eq("session_id", sessionId).order("version_number");
if (versionsError || !versions?.length) throw new Error(versionsError?.message ?? "versions missing");
assert.equal(new Set(versions.map((item) => item.version_number)).size, versions.length);
versions.forEach((item, index) => assert.equal(item.version_number, index + 1));
for (let index = 1; index < versions.length; index += 1) assert.equal(versions[index].parent_analysis_id, versions[index - 1].id);
assert.ok(versions.every((item) => item.workspace_config && typeof item.workspace_config === "object"));
const completed = [...versions].reverse().find((item) => item.status === "complete" && item.keypoints_path);
assert.ok(completed, "a completed selected version has a pose artifact");
const { data: videoSigned, error: videoError } = await supabase.storage.from("sprint-videos").createSignedUrl(session.video_path, 120);
assert.ok(!videoError && videoSigned?.signedUrl, "original video remains signable after reruns");
const response = await fetch(videoSigned.signedUrl, { headers: { Range: "bytes=0-0" } });
assert.ok(response.status === 206 || response.status === 200, `source range request succeeds (${response.status})`);
const { data: pose, error: poseError } = await supabase.storage.from("pose-artifacts").download(completed.keypoints_path);
assert.ok(!poseError && pose, "selected pose artifact remains downloadable");
const artifact = JSON.parse(await pose.text());
assert.ok(Array.isArray(artifact.frames) && artifact.frames.length > 0, "overlay frames exist independently of metrics parsing");
console.log(JSON.stringify({ sessionId, originalVideoPath: session.video_path, versions: versions.length, selectedVersion: completed.version_number, overlayFrames: artifact.frames.length }, null, 2));
