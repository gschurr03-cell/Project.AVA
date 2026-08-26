import { createReadStream, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { chromium } from "@playwright/test";

const key = process.argv[2];
const benchmarks = {
  gav: { sessionId: "e04a7983-7406-4a00-bb89-8ada7b10bf9f", media: "tmp/phase66d-part-b/gav-browser-test-only.mp4" },
  vanni240: { sessionId: "31fe352b-f00f-4a80-b20a-17c2ab08ec5a", media: "tmp/phase66b-part-a/vanni240-browser-test-only.mp4" },
  vanni120: { sessionId: "160a86a2-c0db-4e7d-9fbe-82aedd6d3eff", media: "tmp/phase66d-part-b/vanni120-browser-test-only.mp4" },
  vanni60: { sessionId: "3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d", media: "tmp/phase66b-part-a/vanni60-browser-test-only.mp4" },
};
const target = benchmarks[key];
if (!target) throw new Error(`Usage: phase-6-2b-browser-gate-validation.mjs <${Object.keys(benchmarks).join("|")}>`);
const out = path.resolve("tmp/phase62b/browser", key);
mkdirSync(out, { recursive: true });
const resolvedMedia = path.resolve(target.media);
const size = statSync(resolvedMedia).size;
const server = createServer((request, response) => {
  const match = /bytes=(\d+)-(\d*)/.exec(request.headers.range ?? "");
  const start = match ? Number(match[1]) : 0;
  const end = match?.[2] ? Number(match[2]) : size - 1;
  response.writeHead(match ? 206 : 200, {
    "Content-Type": "video/mp4", "Content-Length": end - start + 1, "Accept-Ranges": "bytes",
    ...(match ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
  });
  createReadStream(resolvedMedia, { start, end }).pipe(response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const mediaUrl = `http://127.0.0.1:${server.address().port}/browser-validation.mp4`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });

try {
  await page.goto("http://127.0.0.1:3001/login", { waitUntil: "domcontentloaded" });
  await page.locator("input[name=email]").first().fill("commander@atreides.local");
  await page.locator("input[name=password]").fill("ATREIDES-DEV-PRIME-2026");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL(/dashboard/, { timeout: 30_000 });
  await page.goto(`http://127.0.0.1:3001/sessions/${target.sessionId}?avaPlaybackSyncDebug=1`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.__AVA_PLAYBACK_SYNC_DEBUG__), null, { timeout: 30_000 });
  const video = page.locator("video").last();
  await video.waitFor({ state: "attached" });
  await video.evaluate((element, src) => { element.src = src; element.load(); }, mediaUrl);
  await page.waitForFunction(() => [...document.querySelectorAll("video")].at(-1)?.readyState >= 2, null, { timeout: 20_000 });

  const seek = async (time) => {
    await video.evaluate((element, targetTime) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`seek timeout ${targetTime}`)), 7000);
      element.addEventListener("seeked", () => { clearTimeout(timer); requestAnimationFrame(() => requestAnimationFrame(resolve)); }, { once: true });
      element.pause(); element.currentTime = Math.min(Math.max(0, targetTime), Math.max(0, element.duration - 0.05));
    }), time);
  };
  const waitUntil = async (time, rate = 1) => page.waitForFunction(
    (targetTime) => [...document.querySelectorAll("video")].at(-1)?.currentTime >= targetTime,
    time, { timeout: Math.max(15_000, 5000 / rate) },
  );
  const save = async (name, extra = {}) => {
    await page.waitForTimeout(250);
    await video.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: false });
    const trace = await page.evaluate(() => window.__AVA_PLAYBACK_SYNC_DEBUG__.trace);
    writeFileSync(path.join(out, `${name}.json`), `${JSON.stringify({ ...trace, validation: extra }, null, 2)}\n`);
    console.log(`${key}: ${name} ${trace.records.length} records`);
  };
  const clear = () => page.evaluate(() => window.__AVA_PLAYBACK_SYNC_DEBUG__.clear());

  await seek(0.1); await clear(); await save("fresh-load");
  for (const rate of [0.25, 0.5, 1]) {
    await seek(0.5); await clear();
    await video.evaluate((element, value) => { element.playbackRate = value; return element.play(); }, rate);
    await waitUntil(1.5, rate); await video.evaluate((element) => element.pause());
    await save(`live-${String(rate).replace(".", "_")}x`, { rate, autoFollow: false });
  }

  await seek(0.5); await clear(); await video.evaluate((element) => element.play()); await waitUntil(0.9);
  await video.evaluate((element) => element.pause()); await page.waitForTimeout(350);
  await video.evaluate((element) => element.play()); await waitUntil(1.3); await video.evaluate((element) => element.pause());
  await save("pause-resume", { pausedBetweenS: [0.9, 1.3] });

  await clear();
  for (const time of [0.25, 1.75, 0.75, 2.1]) await seek(time);
  await save("scrub-forward-back", { seekSequenceS: [0.25, 1.75, 0.75, 2.1] });

  await seek(1.0); await clear();
  await page.setViewportSize({ width: 1100, height: 760 }); await page.waitForTimeout(250);
  await page.setViewportSize({ width: 1600, height: 1050 }); await page.waitForTimeout(250);
  await save("resize", { viewports: [[1100, 760], [1600, 1050]] });

  const fullscreen = await video.evaluate(async (element) => {
    const container = element.parentElement;
    if (!container?.requestFullscreen) return { supported: false, entered: false, exited: false, error: "API unavailable" };
    try {
      await container.requestFullscreen(); const entered = document.fullscreenElement === container;
      if (entered) await document.exitFullscreen();
      return { supported: true, entered, exited: document.fullscreenElement == null, error: null };
    } catch (error) { return { supported: true, entered: false, exited: false, error: String(error) }; }
  });
  await save("fullscreen", fullscreen);

  const followToggle = page.getByRole("button", { name: /Auto Follow/ }).last();
  if ((await followToggle.getAttribute("aria-pressed")) !== "true") await followToggle.click();
  await seek(0.5); await clear(); await video.evaluate((element) => { element.playbackRate = 1; return element.play(); });
  await waitUntil(1.5); await video.evaluate((element) => element.pause());
  await save("autofollow-live-1x", { autoFollow: true });
  writeFileSync(path.join(out, "run-metadata.json"), `${JSON.stringify({ benchmark: key, sessionId: target.sessionId, scientificSourceRole: "original MOV and persisted scientific artifacts", browserValidationCopy: target.media, mediaUrl, fullscreen }, null, 2)}\n`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
