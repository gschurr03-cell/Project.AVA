// Non-destructive FPS audit/repair for existing sessions (variable-frame-rate
// audit). Re-runs the CURRENT classification policy against evidence the
// worker already captured and stored (`sessions.fps`, `sessions.fps_metadata`)
// — no video re-download, no ffprobe re-run. This finds sessions whose stored
// `fps_classification` predates the native high-speed fix (i.e. still reads
// "high_speed_source_normalized_to_60" for what current policy would now
// classify natively) and reports the mismatch.
//
// Report only, by default:
//   node scripts/fps-session-check.mjs
//   node scripts/fps-session-check.mjs --session <id>
//
// Repair (only touches sessions.fps_classification/fps_metadata — never
// analyses.metrics, analyses.provenance, or any other historical row):
//   node scripts/fps-session-check.mjs --session <id> --repair
//
// Requires .env.local (local dev Supabase). Run with:
//   node --env-file=.env.local scripts/fps-session-check.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".fps-session-check-build");

const args = process.argv.slice(2);
const repair = args.includes("--repair");
const sessionIdx = args.indexOf("--session");
const sessionId = sessionIdx >= 0 ? args[sessionIdx + 1] : null;

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
      "Run with: node --env-file=.env.local scripts/fps-session-check.mjs",
  );
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  execFileSync(
    "npx",
    [
      "tsc",
      "src/lib/video/analysisFps.ts",
      "--outDir",
      out,
      "--module",
      "commonjs",
      "--target",
      "es2022",
      "--skipLibCheck",
      "--resolveJsonModule",
      "--esModuleInterop",
      "--moduleResolution",
      "node",
    ],
    { cwd: root, stdio: ["ignore", "inherit", "inherit"] },
  );

  const { classifySourceFpsTier, classifyFpsBand } = require(path.join(out, "analysisFps.js"));

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  let query = supabase
    .from("sessions")
    .select("id, name, fps, fps_classification, fps_metadata")
    .not("fps", "is", null);
  if (sessionId) query = query.eq("id", sessionId);
  const { data: sessions, error } = await query;
  if (error) throw new Error(`query failed: ${error.message}`);
  if (!sessions?.length) {
    console.log(sessionId ? `No session ${sessionId} with detected FPS found.` : "No sessions with detected FPS found.");
    process.exit(0);
  }

  let mismatches = 0;
  for (const session of sessions) {
    const meta = session.fps_metadata ?? {};
    const decision = classifySourceFpsTier({
      detectedFps: session.fps,
      averageFps: meta.averageFps,
      nominalFps: meta.nominalFps,
      realFps: meta.realFps,
      timestampFps: meta.timestampFps,
      variableFrameRate: meta.variableFrameRate,
    });
    const band = classifyFpsBand(session.fps);
    const stored = session.fps_classification;
    const current = decision.classification;
    const mismatch = stored !== current;
    if (mismatch) mismatches += 1;
    console.log(
      `${session.id}  "${session.name ?? ""}"  storedFps=${session.fps}  band=${band}\n` +
        `  stored classification:  ${stored ?? "(none)"}\n` +
        `  current classification: ${current}${mismatch ? "  <-- MISMATCH" : "  (matches)"}`,
    );
    // Only a re-detection of a historical "normalized to 60" row into the new
    // native-high-speed classification is safe to auto-repair: it corrects the
    // LABEL/metadata of already-detected evidence, not any measurement. Any
    // other mismatch (or a session with no prior analysis) needs a fresh
    // worker run, not a label rewrite, so this script refuses to touch it.
    const safeToRepair =
      mismatch &&
      stored === "high_speed_source_normalized_to_60" &&
      current === "validated_high_speed_native_class";
    if (mismatch && !safeToRepair) {
      console.log("  (not auto-repairable: re-run analysis to get a fresh, fully consistent result)");
    }
    if (repair && sessionId === session.id) {
      if (!safeToRepair) {
        console.log("  --repair requested but this session is not safely auto-repairable; no change made.");
        continue;
      }
      const { error: updateError } = await supabase
        .from("sessions")
        .update({ fps_classification: current })
        .eq("id", session.id);
      if (updateError) throw new Error(`repair update failed: ${updateError.message}`);
      console.log(
        "  REPAIRED: sessions.fps_classification -> " +
          current +
          " (analyses.metrics/provenance for any existing analysis were NOT touched; " +
          "re-run analysis to get a native-rate result).",
      );
    }
  }
  console.log(`\n${sessions.length} session(s) checked, ${mismatches} mismatch(es) found.`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
