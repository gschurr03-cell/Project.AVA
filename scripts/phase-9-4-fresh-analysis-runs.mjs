// Phase 9.4 Parts C/D -- fresh analysis runs through the REAL user workflow:
// authenticated browser session, real "Rerun Analysis" button click (the
// exact `queueAnalysis` server action / `replace_working_analysis` RPC the
// product uses), then live progress observed BOTH via the real page (no
// manual reload) AND via direct DB polling for precise lifecycle timestamps.
//
// Sequential by design: the worker processes one job at a time (confirmed
// via /metrics: activeJobs never exceeds 1 in this deployment), and the
// product's own beta limit caps concurrent active analyses at 2 -- running
// one benchmark fully to completion before starting the next avoids that
// limit entirely and keeps each benchmark's lifecycle trace unambiguous.
//
//   node --env-file=.env.local scripts/phase-9-4-fresh-analysis-runs.mjs

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "tmp/phase94";
mkdirSync(OUT, { recursive: true });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const BENCHMARKS = [
  { label: "vanni60", sessionId: "3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d" },
  { label: "vanni120", sessionId: "160a86a2-c0db-4e7d-9fbe-82aedd6d3eff" },
  { label: "vanni240", sessionId: "31fe352b-f00f-4a80-b20a-17c2ab08ec5a" },
  { label: "gav", sessionId: "e04a7983-7406-4a00-bb89-8ada7b10bf9f" },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const consoleErrors = [];
page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
page.on("pageerror", (err) => consoleErrors.push(String(err)));

await page.goto(`${BASE}/login`);
await page.getByPlaceholder(/^email$/i).fill("commander@atreides.local");
await page.getByPlaceholder(/^password$/i).fill("ATREIDES-DEV-PRIME-2026");
await page.getByRole("button", { name: /^log in$/i }).click();
await page.waitForURL(/dashboard|athletes|sessions/, { timeout: 15000 });
console.log("Logged in.");

const results = {};

for (const { label, sessionId } of BENCHMARKS) {
  console.log(`\n=== ${label} ===`);
  const { data: before } = await db.from("sessions").select("current_working_analysis_id").eq("id", sessionId).single();
  const priorWorkingId = before?.current_working_analysis_id ?? null;
  const { data: priorJob } = priorWorkingId
    ? await db.from("analysis_jobs").select("started_at, completed_at").eq("analysis_id", priorWorkingId).single()
    : { data: null };
  const priorCompletedAt = priorJob?.completed_at ?? null;

  await page.goto(`${BASE}/sessions/${sessionId}`, { waitUntil: "networkidle" });
  const rerunButton = page.getByRole("button", { name: /rerun analysis/i }).first();
  await rerunButton.waitFor({ state: "visible", timeout: 15000 });
  const clickWallClock = Date.now();
  await rerunButton.click();
  await page.waitForURL(new RegExp(`/sessions/${sessionId}`), { timeout: 15000 });
  console.log(`${label}: clicked Rerun Analysis, redirected back to session page`);

  // Reruns REUSE the same analysis_id/job row (confirmed real behavior,
  // matching Phase 7.2B's own documented finding) rather than minting a new
  // one -- so "a fresh run happened" is detected by the job's own
  // completed_at/started_at advancing PAST this click, not by a changed
  // working-analysis id. Poll the DB directly for precise lifecycle
  // timestamps (authoritative); the live page is checked separately below
  // purely to confirm the UI itself transitions with no manual reload.
  const newAnalysisId = priorWorkingId;
  const stageTimestamps = {};
  const deadline = Date.now() + 8 * 60 * 1000;
  let lastStage = null;
  let sawFreshCycleStart = false;
  while (Date.now() < deadline) {
    const { data: job } = await db.from("analysis_jobs").select("status, progress, attempt_count, updated_at, created_at, claimed_at, started_at, completed_at").eq("analysis_id", newAnalysisId).single();
    if (job && job.status !== lastStage) {
      stageTimestamps[job.status] = { at: new Date().toISOString(), progressPercent: job.progress?.progressPercent ?? null, etaSeconds: job.progress?.etaSeconds ?? null, dbUpdatedAt: job.updated_at };
      console.log(`${label}: job.status=${job.status} progress=${job.progress?.progressPercent ?? "n/a"} eta=${job.progress?.etaSeconds ?? "n/a"}`);
      lastStage = job.status;
    }
    if (job?.status && job.status !== "completed") sawFreshCycleStart = true;
    if (job?.status === "completed" && (sawFreshCycleStart || job.completed_at !== priorCompletedAt)) break;
    if (job && ["failed", "dead_lettered", "cancelled"].includes(job.status)) throw new Error(`${label}: job ended ${job.status}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (lastStage !== "completed") throw new Error(`${label}: timed out waiting for completion`);
  const completedWallClock = Date.now();

  // Confirm the LIVE page (no manual reload since the click) reflects
  // completion -- reads the same DOM the coach would actually see.
  const liveDomText = await page.evaluate(() => document.body.innerText);
  const liveShowsComplete = /complete/i.test(liveDomText) && !/rerunning/i.test(liveDomText);

  const { data: finalAnalysis } = await db.from("analyses")
    .select("id, status, metrics, provenance, keypoints_path, completed_at, created_at, analysis_fps")
    .eq("id", newAnalysisId).single();

  results[label] = {
    sessionId, priorWorkingId, newAnalysisId,
    clickWallClockMs: clickWallClock, completedWallClockMs: completedWallClock,
    totalDurationS: +((completedWallClock - clickWallClock) / 1000).toFixed(1),
    stageTimestamps,
    liveDomShowsCompleteWithoutManualReload: liveShowsComplete,
    analysisFps: finalAnalysis?.analysis_fps ?? null,
    keypointsPath: finalAnalysis?.keypoints_path ?? null,
    completedAt: finalAnalysis?.completed_at ?? null,
  };
  console.log(`${label}: DONE in ${results[label].totalDurationS}s, new analysis ${newAnalysisId}, liveDomShowsComplete=${liveShowsComplete}`);
}

writeFileSync(`${OUT}/fresh-analysis-lifecycle.json`, JSON.stringify({ results, consoleErrors }, null, 2));
console.log(`\nConsole errors across entire run: ${consoleErrors.length}`);
console.log(`Wrote ${OUT}/fresh-analysis-lifecycle.json`);
await browser.close();
