import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync("src/app/sessions/[id]/timing/TimingWorkspace.tsx", "utf8");
const route = readFileSync("src/app/sessions/[id]/timing/page.tsx", "utf8");
const action = readFileSync("src/app/sessions/actions.ts", "utf8");
const migration = readFileSync("supabase/migrations/0034_timing_workspace.sql", "utf8");

for (const region of ["Timing goal", "Setup mode", "Inspector", "Timeline", "Crossing review"]) {
  assert(client.includes(region), `workspace is missing ${region}`);
}
for (const control of ["startBefore", "startAfter", "finishBefore", "finishAfter"]) {
  assert(client.includes(control), `workspace is missing ${control}`);
}
assert(client.includes("Confirm manual"));
assert(client.includes("manual_physical_line"));
assert(client.includes("No timing calculation is performed here."));
assert(route.includes("current_working_analysis_id"));
assert(route.includes("loadOverlayFrames"));
assert(action.includes("Persist reversible Timing Workspace UI/draft state"));
assert(!action.slice(action.indexOf("export async function saveTimingWorkspace"), action.indexOf("function blankToNull")).includes("queueAnalysis"));
assert(migration.includes("never authoritative timing calculations"));

console.log("timing workspace sanity: passed");
