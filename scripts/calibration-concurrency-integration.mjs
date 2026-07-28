// LIVE local-DB integration proof for optimistic concurrency (Part 1 §3).
// Proves the compare-and-set at the sessions write boundary rejects a stale save,
// using a DISPOSABLE session row. Never touches existing analyses; records the
// analyses count before/after to prove non-destructiveness.
//
//   node --env-file=.env.local scripts/calibration-concurrency-integration.mjs
//
// Requires the local Supabase stack running (npx supabase start) + .env.local.

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

const countAnalyses = async () => {
  const { count } = await sb.from("analyses").select("*", { count: "exact", head: true });
  return count ?? 0;
};

// Simulate the server action's conditional write (the exact CAS shape used in
// saveGateCalibration): update only when the stored revision equals `expected`.
async function conditionalSave(sessionId, expectedRevision, newRevision) {
  const { data } = await sb
    .from("sessions")
    .update({ timing_zone_version: newRevision })
    .eq("id", sessionId)
    .eq("timing_zone_version", expectedRevision)
    .select("id");
  return (data ?? []).length; // rows written: 1 = applied, 0 = conflict
}

const analysesBefore = await countAnalyses();
console.log(`analyses before: ${analysesBefore}`);

// Pick an athlete + its coach to satisfy FK/ownership on the disposable session.
const { data: athlete, error: aErr } = await sb
  .from("athletes")
  .select("id, coach_id")
  .limit(1)
  .single();
if (aErr || !athlete) {
  console.error("No athlete available to attach a disposable session:", aErr?.message);
  process.exit(1);
}

const testId = randomUUID();
let created = false;
try {
  const { error: insErr } = await sb.from("sessions").insert({
    id: testId,
    athlete_id: athlete.id,
    created_by: athlete.coach_id,
    video_path: `${athlete.id}/${testId}.mp4`,
    original_filename: "concurrency-fixture.mp4",
    analysis_type: "fly",
    status: "uploaded",
    timing_zone_version: 4,
  });
  if (insErr) {
    console.error("Could not create disposable session:", insErr.message);
    process.exit(1);
  }
  created = true;
  console.log(`disposable session ${testId.slice(0, 8)} created at revision 4`);

  // Tab B commits revision 5 (unconditional, simulating a save that already landed).
  check("Tab B save advances revision 4 → 5", (await conditionalSave(testId, 4, 5)) === 1);

  // Tab A, still based on revision 4, attempts to save → CAS must reject (0 rows).
  check("Tab A stale save (based on rev 4) is REJECTED by CAS (0 rows written)",
    (await conditionalSave(testId, 4, 5)) === 0);

  // Revision 5 remains canonical after the rejected stale save.
  const { data: afterConflict } = await sb.from("sessions").select("timing_zone_version").eq("id", testId).single();
  check("revision 5 remains canonical after the rejected stale save", afterConflict?.timing_zone_version === 5);

  // Tab A reloads (now sees rev 5) and retries → produces revision 6 safely.
  check("Tab A retry after hydration (rev 5 → 6) succeeds", (await conditionalSave(testId, 5, 6)) === 1);
  const { data: afterRetry } = await sb.from("sessions").select("timing_zone_version").eq("id", testId).single();
  check("revision advances to 6 after the successful retry", afterRetry?.timing_zone_version === 6);
} finally {
  if (created) {
    await sb.from("sessions").delete().eq("id", testId);
    console.log(`disposable session ${testId.slice(0, 8)} deleted (cleanup)`);
  }
}

const analysesAfter = await countAnalyses();
console.log(`analyses after: ${analysesAfter}`);
check("existing analyses count unchanged (non-destructive)", analysesBefore === analysesAfter);

console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
process.exit(ok ? 0 : 1);
