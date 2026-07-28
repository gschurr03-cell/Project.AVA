import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import ffprobePath from "@ffprobe-installer/ffprobe";

const localPath = "/tmp/real-side-pan-fly-001.mov";
const storagePath = "11111111-1111-4111-8111-111111111111/2f1c901b-a5e2-4682-9049-1aa1fe8e89fb.mov";
const manifest = JSON.parse(readFileSync("validation/fixtures/panning/real-side-pan-fly-001.json", "utf8"));
const probe = JSON.parse(execFileSync(ffprobePath.path, [
  "-v", "error", "-count_frames", "-select_streams", "v:0",
  "-show_entries", "stream=codec_name,width,height,avg_frame_rate,nb_read_frames,duration",
  "-of", "json", localPath,
], { encoding: "utf8" }));
const stream = probe.streams?.[0];
assert.equal(stream.codec_name, manifest.sourceMetadata.codec);
assert.equal(stream.width, manifest.sourceMetadata.width);
assert.equal(stream.height, manifest.sourceMetadata.height);
assert.equal(Number(stream.nb_read_frames), manifest.sourceMetadata.frameCount);
assert.ok(Math.abs(Number(stream.duration)-manifest.sourceMetadata.durationSeconds)<0.001);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Local Supabase service environment is required.");
const db = createClient(url, key, { auth: { persistSession: false } });
const { error } = await db.storage.from("sprint-videos").upload(
  storagePath,
  readFileSync(localPath),
  { contentType: "video/quicktime", upsert: false },
);
if (error) throw error;
console.log(JSON.stringify({
  restored: true, protected: true, storagePath,
  bytes: statSync(localPath).size, mediaEvidence: stream,
}, null, 2));
