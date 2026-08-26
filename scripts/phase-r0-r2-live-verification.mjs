// Phase R0-R2 Part R5 -- real, authenticated, decoded-video browser
// verification against the ACTUAL user-facing route, after the safe clean
// rebuild (R0-B) and the R1 (step-length lookup) + R2 (full-height zone
// panes) fixes. Reuses the Phase 6.2B/9.4 real-decode technique (locally
// range-served H.264 test copies, still frame-timeline-accurate).
//
//   node scripts/phase-r0-r2-live-verification.mjs
import { createReadStream, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const OUT = "tmp/phaseR0R2/browser";
mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:3000";

const BENCHMARKS = {
  vanni240: { sessionId: "31fe352b-f00f-4a80-b20a-17c2ab08ec5a", media: "tmp/phase66b-part-a/vanni240-browser-test-only.mp4", probeAt: 2.3 },
  vanni120: { sessionId: "160a86a2-c0db-4e7d-9fbe-82aedd6d3eff", media: "tmp/phase66d-part-b/vanni120-browser-test-only.mp4", probeAt: 1.8 },
  vanni60: { sessionId: "3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d", media: "tmp/phase66b-part-a/vanni60-browser-test-only.mp4", probeAt: 1.6 },
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
console.log("Logged in.");

const results = {};

for (const [label, cfg] of Object.entries(BENCHMARKS)) {
  const server = await serveFile(cfg.media);
  const mediaUrl = `http://127.0.0.1:${server.address().port}/browser-validation.mp4`;
  await page.goto(`${BASE}/sessions/${cfg.sessionId}`, { waitUntil: "networkidle" });

  // R0-C: confirm the dev identity marker is present on the mounted canvas --
  // direct proof this exact route mounts this exact VideoOverlay build.
  const buildMarker = await page.evaluate(() => document.querySelector("canvas[data-ava-overlay-build]")?.getAttribute("data-ava-overlay-build") ?? null);

  const video = page.locator("video").last();
  await video.waitFor({ state: "attached" });
  await video.evaluate((el, src) => { el.src = src; el.load(); }, mediaUrl);
  await page.waitForFunction(() => [...document.querySelectorAll("video")].at(-1)?.readyState >= 2, null, { timeout: 20000 });
  const decodedProbe = await video.evaluate((el) => ({ videoWidth: el.videoWidth, videoHeight: el.videoHeight, readyState: el.readyState, duration: el.duration }));

  // Ensure Zones + Step Numbers layers are ON (default may vary by layer).
  const layersButton = page.getByRole("button", { name: /layers/i }).first();
  if (await layersButton.count()) {
    const pressed = await layersButton.getAttribute("aria-pressed");
    if (pressed === "false") await layersButton.click().catch(() => {});
  }
  for (const layerLabel of [/step numbers/i, /zones/i, /skeleton/i, /gates/i, /contacts/i]) {
    const checkbox = page.locator("label", { hasText: layerLabel }).locator("input[type=checkbox]").first();
    if (await checkbox.count()) {
      const checked = await checkbox.isChecked().catch(() => null);
      if (checked === false) await checkbox.check({ force: true }).catch(() => {});
    }
  }

  // Static frame first (paused): satisfies R5's "static frame validation is
  // sufficient" instruction for step labels/zone colors.
  await video.evaluate((el, t) => { el.currentTime = t; }, cfg.probeAt);
  await page.waitForFunction((t) => [...document.querySelectorAll("video")].at(-1)?.currentTime >= t - 0.05, cfg.probeAt, { timeout: 8000 });
  await page.waitForTimeout(300);
  const videoEl = video;
  await videoEl.scrollIntoViewIfNeeded();
  const playerContainer = videoEl.locator("xpath=ancestor::div[contains(@class,'overflow-hidden')][1]");
  if (await playerContainer.count()) {
    await playerContainer.screenshot({ path: path.join(OUT, `${label}-static-closeup.png`) }).catch(() => {});
  }

  // Auto Follow ON, real playback, close-up (R4 live verification).
  const autoFollowBtn = page.getByRole("button", { name: /^.\s*auto follow$/i }).first();
  if (await autoFollowBtn.count()) await autoFollowBtn.click().catch(() => {});
  await page.waitForTimeout(200);
  await video.evaluate((el) => el.play());
  await page.waitForTimeout(500);
  await video.evaluate((el) => el.pause());
  await page.waitForTimeout(150);
  if (await playerContainer.count()) {
    await playerContainer.screenshot({ path: path.join(OUT, `${label}-autofollow-closeup.png`) }).catch(() => {});
  }
  const autoFollowPressed = await autoFollowBtn.count() ? await autoFollowBtn.getAttribute("aria-pressed") : null;

  results[label] = { buildMarker, decodedProbe, autoFollowPressed };
  console.log(`${label}: buildMarker=${buildMarker} decodedProbe=${JSON.stringify(decodedProbe)} autoFollowPressed=${autoFollowPressed}`);
  server.close();
}

writeFileSync(path.join(OUT, "../results.json"), JSON.stringify({ results, consoleErrors }, null, 2));
console.log(`\nConsole errors: ${consoleErrors.length}`);
console.log("Wrote tmp/phaseR0R2/results.json");
await browser.close();
