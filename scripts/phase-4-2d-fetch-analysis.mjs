import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = createClient(url, key, { auth: { persistSession: false } });

const analysisId = process.argv[2];
const { data, error } = await db
  .from("analyses")
  .select("id, session_id, status, athlete_tracking_confidence, tracking_loss_ranges, metrics, keypoints_path")
  .eq("id", analysisId)
  .single();

if (error) {
  console.error(error);
  process.exit(1);
}

let origins = {};
let detectorInvocations = null;
let frameCount = null;
if (data.keypoints_path) {
  const { data: blob, error: dlError } = await db.storage.from("pose-artifacts").download(data.keypoints_path);
  if (!dlError) {
    const artifact = JSON.parse(await blob.text());
    frameCount = artifact.frames?.length ?? null;
    for (const f of artifact.frames ?? []) {
      const o = f.boxOrigin ?? "null";
      origins[o] = (origins[o] ?? 0) + 1;
    }
    detectorInvocations = (origins["detected"] ?? 0) + (origins["reacquired"] ?? 0);
  }
}

console.log(
  JSON.stringify(
    {
      status: data.status,
      athlete_tracking_confidence: data.athlete_tracking_confidence,
      tracking_loss_ranges: data.tracking_loss_ranges,
      strideFrequencyHz: data.metrics?.strideFrequencyHz,
      avgStrideLengthM: data.metrics?.avgStrideLengthM,
      topSpeedMps: data.metrics?.topSpeedMps,
      frameCount,
      originsCount: origins,
      detectorInvocations,
    },
    null,
    2
  )
);
