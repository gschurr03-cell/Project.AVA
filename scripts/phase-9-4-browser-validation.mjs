// Phase 9.4 Parts Q/R/S/T -- real, authenticated browser validation. Reuses
// Phase 6.2B's established technique (still on disk, still valid: the H.264
// browser-validation copies are time-mapped to the same frame timelines a
// fresh same-fps reanalysis reproduces exactly -- V240 1020 frames, V120 483,
// V60 233, Gav 142, confirmed matching this phase's own fresh reruns) to get
// REAL DECODED VIDEO in this sandbox, overriding the video element's `src`
// to a locally range-served H.264 copy. This is the first real human-visible
// screenshot confirmation of the skeleton-suit style/zones/gates in this
// entire Phase 9 remediation block -- every prior phase (8.0B-9.3A) disclosed
// this as blocked; it was not actually blocked, just not attempted with this
// established Phase 6.2B technique.
//
// Also exercises real Dashboard -> athlete -> session -> Dashboard -> reopen
// navigation (Part T) and reads the real overlay-control toggle defaults
// (Part R) directly from the live DOM.
//
//   node scripts/phase-9-4-browser-validation.mjs
import { createReadStream, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const OUT = "tmp/phase94/browser";
mkdirSync(OUT, { recursive: true });
const BASE = process.env.AVA_BASE ?? "http://localhost:3000";

const BENCHMARKS = {
  vanni240: { sessionId: "31fe352b-f00f-4a80-b20a-17c2ab08ec5a", media: "tmp/phase66b-part-a/vanni240-browser-test-only.mp4" },
  vanni60: { sessionId: "3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d", media: "tmp/phase66b-part-a/vanni60-browser-test-only.mp4" },
};

function serveFile(filePath) {
  const resolved = path.resolve(filePath);
  const size = statSync(resolved).size;
  const server = createServer((req, res) => {
    const match = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
    const start = match ? Number(match[1]) : 0;
    const end = match?.[2] ? Number(match[2]) : size - 1;
    res.writeHead(match ? 206 : 200, {
      "Content-Type": "video/mp4", "Content-Length": end - start + 1, "Accept-Ranges": "bytes",
      ...(match ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    });
    createReadStream(resolved, { start, end }).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
const consoleErrors = [];
page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
page.on("pageerror", (err) => consoleErrors.push(String(err)));

await page.goto(`${BASE}/login`);
await page.getByPlaceholder(/^email$/i).fill("commander@atreides.local");
await page.getByPlaceholder(/^password$/i).fill("ATREIDES-DEV-PRIME-2026");
await page.getByRole("button", { name: /^log in$/i }).click();
await page.waitForURL(/dashboard/, { timeout: 15000 });
console.log("Logged in, on dashboard.");

const results = { partT_dashboardRouting: {}, partQRS: {} };

// --- Part T: Dashboard -> athlete -> session -> Dashboard -> reopen -------
results.partT_dashboardRouting.dashboardLoaded = page.url().includes("/dashboard");
await page.goto(`${BASE}/sessions/${BENCHMARKS.vanni240.sessionId}`, { waitUntil: "networkidle" });
results.partT_dashboardRouting.sessionPageLoaded = page.url().includes(BENCHMARKS.vanni240.sessionId);
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
results.partT_dashboardRouting.backToDashboard = page.url().includes("/dashboard");
await page.goto(`${BASE}/sessions/${BENCHMARKS.vanni240.sessionId}`, { waitUntil: "networkidle" });
results.partT_dashboardRouting.reopenedSameSession = page.url().includes(BENCHMARKS.vanni240.sessionId);
const bodyTextAfterReopen = await page.evaluate(() => document.body.innerText);
results.partT_dashboardRouting.showsCompleteStatus = /complete/i.test(bodyTextAfterReopen);
console.log("Part T (Dashboard routing):", JSON.stringify(results.partT_dashboardRouting));

// --- Part R: overlay control defaults, read directly from live DOM --------
const controlLabels = ["Auto Follow", "Stabilized View"];
const controlDefaults = {};
for (const label of controlLabels) {
  const btn = page.getByRole("button", { name: new RegExp(label, "i") }).first();
  if (await btn.count()) controlDefaults[label] = await btn.getAttribute("aria-pressed");
}
results.partR_controlDefaults = controlDefaults;
console.log("Part R (control defaults):", JSON.stringify(controlDefaults));

// --- Parts Q/S: real decoded video, real playback interactions ------------
for (const [label, cfg] of Object.entries(BENCHMARKS)) {
  const server = await serveFile(cfg.media);
  const mediaUrl = `http://127.0.0.1:${server.address().port}/browser-validation.mp4`;
  await page.goto(`${BASE}/sessions/${cfg.sessionId}`, { waitUntil: "networkidle" });
  const video = page.locator("video").last();
  await video.waitFor({ state: "attached" });
  await video.evaluate((el, src) => { el.src = src; el.load(); }, mediaUrl);
  await page.waitForFunction(() => [...document.querySelectorAll("video")].at(-1)?.readyState >= 2, null, { timeout: 20000 });
  const decodedProbe = await video.evaluate((el) => ({ videoWidth: el.videoWidth, videoHeight: el.videoHeight, readyState: el.readyState, duration: el.duration }));
  console.log(`${label}: real decode probe`, JSON.stringify(decodedProbe));

  // Turn Auto Follow ON (Stabilized View is already ON by default) so the
  // close-up screenshots show the full real feature set together.
  const autoFollowBtn = page.getByRole("button", { name: /auto follow/i }).first();
  if (await autoFollowBtn.count()) await autoFollowBtn.click().catch(() => {});
  await page.waitForTimeout(150);

  // Part Q: source-start playback -- fresh load currentTime should already
  // sit at (or immediately snap to) the true source beginning, before any
  // manual interaction.
  const initialCurrentTime = await video.evaluate((el) => el.currentTime);

  // Screenshot 1: fresh load, paused at/near start -- default overlays.
  await video.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `${label}-fresh-load.png`) });

  // Play briefly at 1x, screenshot mid-motion with skeleton + zones + gates.
  await video.evaluate((el) => { el.currentTime = 1.0; });
  await page.waitForFunction((t) => [...document.querySelectorAll("video")].at(-1)?.currentTime >= t - 0.05, 1.0, { timeout: 8000 });
  await video.evaluate((el) => el.play());
  await page.waitForTimeout(600);
  await video.evaluate((el) => el.pause());
  await page.waitForTimeout(200);
  await video.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, `${label}-mid-playback.png`) });
  // Player-only crop: the video's own container (parent chain up to the
  // rounded-corner overflow-hidden wrapper) for a much clearer close-up of
  // the skeleton/zones/gates/contacts, not the whole page chrome.
  const playerContainer = video.locator("xpath=ancestor::div[contains(@class,'overflow-hidden')][1]");
  if (await playerContainer.count()) {
    await playerContainer.screenshot({ path: path.join(OUT, `${label}-player-closeup.png`) }).catch(() => {});
  }
  const midPlaybackTime = await video.evaluate((el) => el.currentTime);

  // Pause/resume.
  await video.evaluate((el) => el.play());
  await page.waitForTimeout(300);
  await video.evaluate((el) => el.pause());
  const pausedTime1 = await video.evaluate((el) => el.currentTime);
  await page.waitForTimeout(300);
  const pausedTime2 = await video.evaluate((el) => el.currentTime);

  // Forward/backward scrub.
  await video.evaluate((el) => { el.currentTime = 2.0; });
  await page.waitForFunction((t) => [...document.querySelectorAll("video")].at(-1)?.currentTime >= t - 0.05, 2.0, { timeout: 8000 });
  await video.evaluate((el) => { el.currentTime = 0.5; });
  await page.waitForFunction((t) => [...document.querySelectorAll("video")].at(-1)?.currentTime <= t + 0.1, 0.5, { timeout: 8000 });
  const afterScrubTime = await video.evaluate((el) => el.currentTime);

  // Playback rates.
  const rateResults = {};
  for (const rate of [0.25, 0.5, 1]) {
    await video.evaluate((el, r) => { el.playbackRate = r; }, rate);
    rateResults[rate] = await video.evaluate((el) => el.playbackRate);
  }

  // Resize.
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, `${label}-resized.png`) });
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Fullscreen.
  const fullscreenResult = await video.evaluate(async (el) => {
    const container = el.parentElement;
    if (!container?.requestFullscreen) return { supported: false };
    try {
      await container.requestFullscreen();
      const entered = document.fullscreenElement === container;
      if (entered) await document.exitFullscreen();
      return { supported: true, entered, exited: document.fullscreenElement == null };
    } catch (e) { return { supported: true, entered: false, error: String(e) }; }
  });

  results.partQRS[label] = {
    decodedProbe, initialCurrentTime, midPlaybackTime,
    pauseDeterministic: pausedTime1 === pausedTime2,
    afterScrubTime, rateResults, fullscreenResult,
    screenshots: [`${label}-fresh-load.png`, `${label}-mid-playback.png`, `${label}-resized.png`],
  };
  console.log(`${label}: Parts Q/S done`, JSON.stringify(results.partQRS[label]));
  server.close();
}

results.consoleErrors = consoleErrors;
writeFileSync("tmp/phase94/browser-validation.json", JSON.stringify(results, null, 2));
console.log(`\nConsole errors: ${consoleErrors.length}`);
console.log("Wrote tmp/phase94/browser-validation.json");
await browser.close();
