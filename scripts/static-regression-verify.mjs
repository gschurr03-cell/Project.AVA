import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
const baselineId = "27b1aa27-20be-400a-9310-4f9f2fbd695b";
const candidateId = process.argv[2];
if (!candidateId) throw new Error("candidate analysis id required");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await db.from("analyses").select("id,status,experimental,analysis_fps,recording_mode,metrics,result_payload,provenance").in("id", [baselineId,candidateId]);
if (error) throw new Error(error.message);
const baseline=data.find(row=>row.id===baselineId), candidate=data.find(row=>row.id===candidateId);
assert.equal(candidate?.status,"complete"); assert.equal(candidate.experimental,false); assert.equal(candidate.analysis_fps,60); assert.equal(candidate.recording_mode,"static_precision");
assert.deepEqual(candidate.metrics,baseline.metrics);
const scrubVolatile = (value) => {
  if (Array.isArray(value)) return value.map(scrubVolatile);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !["analysisId","createdAt","completedAt","capturedAt"].includes(key))
    .map(([key,item]) => [key,scrubVolatile(item)]));
  return value;
};
assert.deepEqual(scrubVolatile(candidate.result_payload),scrubVolatile(baseline.result_payload));
assert.equal(candidate.provenance?.experimental,false); assert.equal(candidate.provenance?.analysisFps,60);
console.log(JSON.stringify({ baselineId,candidateId,exactMetrics:true,exactDeterministicResultPayload:true,volatileIdentityAndTimestampsExcluded:true,experimentalBadge:false,analysisFps:60 },null,2));
