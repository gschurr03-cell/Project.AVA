// Unit tests for the analysis-progress domain (pure model, no fake progress).
//   node scripts/analysis-progress-sanity.mjs
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".analysis-progress-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
execFileSync(
  "npx",
  ["tsc", "src/lib/analysisProgress/model.ts", "--outDir", out, "--module", "commonjs", "--target", "es2022", "--skipLibCheck"],
  { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
);
const M = require(path.join(out, "model.js"));

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};
const near = (a, b, t = 1e-6) => Math.abs(a - b) <= t;

// --- Stage weights ---------------------------------------------------------
check("stage weights total exactly 100", M.totalStageWeight() === 100);
check("seven user-facing stages", M.STAGE_DEFINITIONS.length === 7);

// --- No fake progress: monotonic bands, nothing reaches 100 before completed ---
const forward = ["queued", "claimed", "downloading", "validating", "processing", "generating_results", "uploading_artifacts", "completing", "completed"];
let monotonic = true;
let prevCeil = -1;
for (const s of forward) {
  const band = M.STATUS_BANDS[s];
  if (!band) continue;
  if (band.floor < prevCeil - 1e-9) monotonic = false;
  prevCeil = band.ceiling;
}
check("status bands are monotonic (floor ≥ prev ceiling)", monotonic);

let noPremature100 = true;
for (const s of forward) {
  if (s === "completed") continue;
  // Even with an absurdly long elapsed time the bar must stay < 100.
  const p = M.computeOverallProgress(s, 10_000_000);
  if (p != null && p >= 100) noPremature100 = false;
}
check("no forward status reaches 100 before `completed` (huge elapsed)", noPremature100);
check("`completed` is exactly 100", M.computeOverallProgress("completed", 0) === 100);
check("`queued` bar is 0", M.computeOverallProgress("queued", 5000) === 0);

// Creep stays strictly inside its band and is monotonic in elapsed time.
let creepMonotonic = true;
let creepInBand = true;
let last = -1;
const band = M.STATUS_BANDS.processing;
for (const e of [0, 1000, 5000, 20000, 45000, 120000, 600000]) {
  const p = M.computeOverallProgress("processing", e);
  if (p < last - 1e-9) creepMonotonic = false;
  if (p < band.floor - 1e-9 || p > band.ceiling + 1e-9) creepInBand = false;
  last = p;
}
check("processing creep is monotonic in elapsed", creepMonotonic);
check("processing creep never leaves its band", creepInBand);
check("processing creep never touches its ceiling", M.computeOverallProgress("processing", 10_000_000) < band.ceiling);

// Off-path / failure statuses have no bar.
check("failed has no progress bar", M.computeOverallProgress("failed", 0) === null);
check("retry_scheduled has no progress bar", M.computeOverallProgress("retry_scheduled", 0) === null);

// --- Stage state machine over forward indices ------------------------------
const preparing = M.STAGE_DEFINITIONS.find((d) => d.id === "preparing_video");
check("preparing is active at claimed", M.stageState(preparing, M.forwardIndex("claimed")) === "active");
check("preparing is done at processing", M.stageState(preparing, M.forwardIndex("processing")) === "done");
const tracking = M.STAGE_DEFINITIONS.find((d) => d.id === "tracking_movement");
const identifying = M.STAGE_DEFINITIONS.find((d) => d.id === "identifying_steps");
check(
  "tracking + identifying are BOTH active during processing (shared worker status)",
  M.stageState(tracking, M.forwardIndex("processing")) === "active" &&
    M.stageState(identifying, M.forwardIndex("processing")) === "active",
);
const finalizing = M.STAGE_DEFINITIONS.find((d) => d.id === "finalizing_results");
check("finalizing only done at completed", M.stageState(finalizing, M.forwardIndex("completing")) === "active" && M.stageState(finalizing, M.forwardIndex("completed")) === "done");

// --- State-machine legality ------------------------------------------------
check("processing→generating_results legal", M.isLegalTransition("processing", "generating_results"));
check("processing→retry_scheduled legal (retry loop)", M.isLegalTransition("processing", "retry_scheduled"));
check("retry_scheduled→claimed legal", M.isLegalTransition("retry_scheduled", "claimed"));
check("completed→processing ILLEGAL (stale poll ignored)", !M.isLegalTransition("completed", "processing"));
check("downloading→completed ILLEGAL (skips stages)", !M.isLegalTransition("downloading", "completed"));
check("same-status no-op is legal", M.isLegalTransition("processing", "processing"));

// --- ETA hierarchy + bucketed display --------------------------------------
check("completed → no ETA", M.estimateEta("completed", 0).kind === "none");
check("queued → indeterminate ETA", M.estimateEta("queued", 0).kind === "indeterminate");
const etaProc = M.estimateEta("processing", 0);
check("processing ETA is ready & positive", etaProc.kind === "ready" && etaProc.ms > 0);
const etaCompleting = M.estimateEta("completing", 0);
check("later stage has smaller remaining ETA than earlier", etaCompleting.ms < etaProc.ms);
check("overrunning stage does not go negative", M.estimateEta("processing", 10_000_000).ms >= 0);
check("format: none → null", M.formatEta({ kind: "none", ms: null }) === null);
check("format: indeterminate → waiting", M.formatEta({ kind: "indeterminate", ms: null }) === "Waiting to start");
check("format buckets seconds", M.formatEta({ kind: "ready", ms: 3000 }) === "A few seconds left");
check("format rounds minutes up", M.formatEta({ kind: "ready", ms: 130000 }) === "About 3 min left");

// --- Delay detection (heartbeat-free) --------------------------------------
check("processing not delayed early", !M.isDelayed("processing", 10000));
check("processing delayed after long overrun", M.isDelayed("processing", 45000 * 3));

// --- Normalized model (the object UIs render) ------------------------------
const now = 1_000_000;
const proc = M.normalizeJobProgress({ status: "processing", updatedAtMs: now - 5000, nowMs: now, attemptCount: 1, userMessage: null });
check("normalize: processing lifecycle", proc.lifecycle === "processing");
check("normalize: processing active stage is tracking_movement", proc.activeStageId === "tracking_movement");
check("normalize: processing progress within band", proc.overallProgress > 18 && proc.overallProgress < 72);
check("normalize: processing not terminal", !proc.isTerminal && !proc.isFailure);
check("normalize: processing has an ETA label", typeof proc.etaLabel === "string");

const queued = M.normalizeJobProgress({ status: "queued", updatedAtMs: now, nowMs: now });
check("normalize: queued is indeterminate", queued.indeterminate === true);
check("normalize: queued has no active stage", queued.activeStageId === null);

const done = M.normalizeJobProgress({ status: "completed", updatedAtMs: now, nowMs: now });
check("normalize: completed is 100 + terminal", done.overallProgress === 100 && done.isTerminal && !done.isFailure);
check("normalize: completed marks every stage done", done.stages.every((s) => s.state === "done"));

const failed = M.normalizeJobProgress({ status: "failed", updatedAtMs: now, nowMs: now, userMessage: "boom" });
check("normalize: failed is failure + terminal + no bar", failed.isFailure && failed.isTerminal && failed.overallProgress === null);
check("normalize: failed carries user message", failed.userMessage === "boom");

const retry = M.normalizeJobProgress({ status: "retry_scheduled", updatedAtMs: now, nowMs: now, attemptCount: 2 });
check("normalize: retry lifecycle + attempt count", retry.lifecycle === "retrying" && retry.attemptCount === 2);

// Progress is a pure function of (status, elapsed): identical inputs → identical output.
const a = M.normalizeJobProgress({ status: "generating_results", updatedAtMs: now - 3000, nowMs: now });
const b = M.normalizeJobProgress({ status: "generating_results", updatedAtMs: now - 3000, nowMs: now });
check("normalize is deterministic for identical inputs", a.overallProgressRaw === b.overallProgressRaw && near(a.overallProgressRaw, b.overallProgressRaw));

console.log(ok ? "\nAll analysis-progress checks passed." : "\nFAILURES present.");
rmSync(out, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
