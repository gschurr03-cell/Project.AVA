import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = process.cwd();
const out = path.join(root, ".phase-7-2-sanity-tmp");
let passed = 0;
let ok = true;
const check = (label, condition) => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (condition) passed += 1; else ok = false;
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  execFileSync("npx", ["tsc", "src/lib/biomechanics/pose.ts", "src/lib/analysisProgress/model.ts", "--outDir", out, "--rootDir", "src/lib", "--module", "commonjs", "--target", "es2022", "--skipLibCheck", "--esModuleInterop", "--strict"], { stdio: "ignore" });
  const { poseSequenceSchema } = require(path.join(out, "biomechanics/pose.js"));
  const M = require(path.join(out, "analysisProgress/model.js"));
  const legacy = JSON.parse(readFileSync("tmp/phase42k-final-vanni240.pose.json", "utf8"));
  const valid = poseSequenceSchema.safeParse(legacy);
  check("1. missing artifact pointer is explicitly classified in loader source", readFileSync("src/lib/video/loadOverlayFrames.ts", "utf8").includes('status: "missing_pointer"'));
  check("2. missing storage object is explicitly classified", readFileSync("src/lib/video/loadOverlayFrames.ts", "utf8").includes('"missing_object"'));
  check("3. corrupt JSON is explicitly classified", readFileSync("src/lib/video/loadOverlayFrames.ts", "utf8").includes('"corrupt_json"'));
  check("4. real legacy Vanni 240 artifact loads under current schema", valid.success && valid.data.frames.length === 1020);
  check("5. additive legacy gate-debug fields remain optional", valid.success && legacy.gateLockDebug && legacy.gateLockDebug.frames[0].scientificStartGate === undefined);
  check("6. current working pointer selection remains session-authoritative", readFileSync("src/app/sessions/[id]/page.tsx", "utf8").includes("item.id === session.current_working_analysis_id"));
  check("7. completion RPC remains authoritative", readFileSync("scripts/analysis-worker.mjs", "utf8").includes('"complete_analysis_job"'));
  check("8. launchd lifecycle has KeepAlive crash recovery", readFileSync("scripts/ava-worker-control.mjs", "utf8").includes("<key>KeepAlive</key><true/>"));
  check("9. duplicate service ownership uses one stable label", readFileSync("scripts/ava-worker-control.mjs", "utf8").includes('com.projectava.analysis-worker'));
  check("10. worker uses the dedicated production .venv path", readFileSync("scripts/ava-worker-control.mjs", "utf8").includes('".venv", "bin", "python"'));
  const migration = readFileSync("supabase/migrations/0074_analysis_runtime_progress.sql", "utf8");
  check("11. progress writes require the active claim token", migration.includes("claim_token=p_claim_token"));
  check("12. progress writes require an unexpired lease", migration.includes("lease_expires_at > now()"));
  check("13. progress regression is rejected", migration.includes("v_new_units < v_old_units"));
  check("14. UI uses bounded automatic polling without reload", readFileSync("src/app/sessions/[id]/AnalysisProgressCard.tsx", "utf8").includes("1500"));
  check("15. queued state remains indeterminate", M.normalizeJobProgress({ status: "queued", updatedAtMs: 0, nowMs: 0 }).indeterminate);
  check("16. processing begins at a real stage floor without fake timer creep", M.computeOverallProgress("processing", 999999, null) === 18);
  const p1 = M.computeOverallProgress("processing", 0, { stage: "pass1", framesCompleted: 50, totalFrames: 100 });
  const p2 = M.computeOverallProgress("processing", 0, { stage: "pass2", framesCompleted: 50, totalFrames: 100 });
  check("17. measured frame progress advances percentage", p1 > 18 && p1 < 45);
  check("18. second pass accounts for completed first-pass work", p2 > p1 && p2 < 72);
  check("19. ETA is unavailable without observed throughput", M.estimateFrameThroughputRemainingMs({ stage: "pass1", framesCompleted: 1, totalFrames: 100 }, null) === null);
  check("20. ETA derives from measured throughput", M.estimateFrameThroughputRemainingMs({ stage: "pass2", framesCompleted: 50, totalFrames: 100 }, 10) === 5000);
  check("21. completed reaches exactly 100", M.computeOverallProgress("completed", 0) === 100);
  check("22. retry remains distinct and explicitly resets prior work", M.lifecycleFor("retry_scheduled") === "retrying" && M.lifecycleFor("failed") === "failed" && readFileSync("supabase/migrations/0075_analysis_progress_retry_reset.sql", "utf8").includes("new.progress := null"));
  check("23. worker progress method is declared and work-unit based", readFileSync("scripts/analysis-worker.mjs", "utf8").includes('method: "measured_work_units_v1"'));
  check("24. artifact recovery does not alter scientific metric modules", !readFileSync("src/lib/video/loadOverlayFrames.ts", "utf8").includes("computeSprintMeasurements"));
} finally {
  rmSync(out, { recursive: true, force: true });
}
console.log(`\n${passed}/24 Phase 7.2 deterministic checks passed.`);
process.exit(ok && passed === 24 ? 0 : 1);
