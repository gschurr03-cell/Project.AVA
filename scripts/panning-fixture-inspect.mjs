// Internal-only real fixture inspector. It reads the protected source through a short-lived
// signed URL, never copies it into the repository, and emits ffprobe evidence as JSON.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import ffprobePath from "@ffprobe-installer/ffprobe";

const root = process.cwd();
const fixtureId = process.argv[2] ?? "real-side-pan-fly-001";
const manifestPath = path.join(root, "validation/fixtures/panning", `${fixtureId}.json`);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Supabase service environment is required.");
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const { data, error } = await supabase.storage
  .from(process.env.VIDEO_BUCKET ?? "sprint-videos")
  .createSignedUrl(manifest.protectedSource.videoPath, 300);
if (error || !data?.signedUrl) throw new Error(`Could not sign protected fixture: ${error?.message ?? "unknown"}`);

const raw = execFileSync(ffprobePath.path, [
  "-v", "error", "-count_frames", "-show_entries",
  "stream=index,codec_name,codec_type,width,height,r_frame_rate,avg_frame_rate,time_base,start_time,nb_frames,nb_read_frames,duration:format=duration,size,format_name:frame=best_effort_timestamp_time,pkt_duration_time,repeat_pict",
  "-of", "json", data.signedUrl,
], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
const probe = JSON.parse(raw);
const timestamps = (probe.frames ?? [])
  .map((frame) => Number(frame.best_effort_timestamp_time))
  .filter(Number.isFinite);
const intervals = timestamps.slice(1).map((value, index) => value - timestamps[index]);
const sortedIntervals = [...intervals].sort((a, b) => a - b);
const quantile = (fraction) => sortedIntervals[Math.floor((sortedIntervals.length - 1) * fraction)];
const median = quantile(0.5);
const timeline = timestamps.length > 1 ? {
  firstFrameTimestampSeconds: timestamps[0],
  lastFrameTimestampSeconds: timestamps.at(-1),
  timestampDerivedFps: 1 / (intervals.reduce((sum, value) => sum + value, 0) / intervals.length),
  frameIntervalSeconds: {
    minimum: sortedIntervals[0],
    p5: quantile(0.05),
    median,
    p95: quantile(0.95),
    maximum: sortedIntervals.at(-1),
  },
  duplicateTimestampCount: intervals.filter((value) => value <= 1e-9).length,
  droppedFrameGapCount: intervals.filter((value) => value > median * 1.5).length,
  repeatPictureCount: (probe.frames ?? []).filter((frame) => Number(frame.repeat_pict) > 0).length,
} : null;
delete probe.frames;
let localEngineeringCopy = null;
if (process.argv.includes("--download-private-temp")) {
  const response = await fetch(data.signedUrl);
  if (!response.ok) throw new Error(`Protected fixture download failed: HTTP ${response.status}`);
  localEngineeringCopy = path.join("/tmp", `${fixtureId}.mov`);
  writeFileSync(localEngineeringCopy, Buffer.from(await response.arrayBuffer()), { mode: 0o600 });
}
console.log(JSON.stringify({ fixtureId, protectedSource: true, localEngineeringCopy, probe, timeline }, null, 2));
