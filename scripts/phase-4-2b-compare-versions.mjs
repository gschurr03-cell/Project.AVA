import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = createClient(url, key, { auth: { persistSession: false } });

const analysisId = process.argv[2];
const savedVersionId = process.argv[3];

const { data: current, error: e1 } = await db.from("analyses").select("*").eq("id", analysisId).single();
if (e1) throw e1;
const { data: saved, error: e2 } = await db.from("analyses").select("*").eq("id", savedVersionId).maybeSingle();
if (e2) throw e2;

function summarize(row) {
  const m = row?.metrics ?? {};
  return {
    status: row?.status,
    athleteTrackingConfidence: m.athleteTrackingConfidence,
    trackingLossRanges: m.trackingLossRanges,
    strideFrequencyHz: m.strideFrequencyHz,
    zoneTimeS: m.zoneTimeS,
    avgVelocityMps: m.avgVelocityMps,
    peakVelocityMps: m.peakVelocityMps,
    avgStepLengthM: m.avgStepLengthM,
  };
}

console.log("BEFORE (saved version):", JSON.stringify(summarize(saved), null, 2));
console.log("AFTER (current working):", JSON.stringify(summarize(current), null, 2));
