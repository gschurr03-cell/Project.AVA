// Phase R1B Part O -- targeted real UI validation: seek directly to the
// exact Case 1 / Case 2 contact timestamps and capture close-ups, plus a
// later "always worked" contact for comparison. Real decoded video via the
// established H.264 test-copy technique.
//
//   node scripts/phase-r1b-targeted-verification.mjs
import { createReadStream, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const OUT = "tmp/phaseR1B/browser";
mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:3000";
const sessionId = "31fe352b-f00f-4a80-b20a-17c2ab08ec5a"; // vanni240
const media = "tmp/phase66b-part-a/vanni240-browser-test-only.mp4";

// Real production sourceFrameIndex/normFps -> source time.
const NORM_FPS = 239.981;
const CASE1_T = 119 / NORM_FPS; // contact-119-left-2
const CASE2_T = 278 / NORM_FPS; // contact-278-left-3 (should stay absent)
const WORKING_T = 330 / NORM_FPS; // contact-330-right-4 (always worked)

function serveFile(filePath) {
  const resolved = path.resolve(filePath);
  const size = statSync(resolved).size;
  const server = createServer((req, res) => {
    const match = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
    const start = match ? Number(match[1]) : 0;
    const end = match?.[2] ? Number(match[2]) : size - 1;
    res.writeHead(match ? 206 : 200, { "Content-Type": "video/mp4", "Content-Length": end - start + 1, "Accept-Ranges": "bytes", ...(match ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}) });
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

const server = await serveFile(media);
const mediaUrl = `http://127.0.0.1:${server.address().port}/browser-validation.mp4`;
await page.goto(`${BASE}/sessions/${sessionId}`, { waitUntil: "networkidle" });
const video = page.locator("video").last();
await video.waitFor({ state: "attached" });
await video.evaluate((el, src) => { el.src = src; el.load(); }, mediaUrl);
await page.waitForFunction(() => [...document.querySelectorAll("video")].at(-1)?.readyState >= 2, null, { timeout: 20000 });
const probe = await video.evaluate((el) => ({ videoWidth: el.videoWidth, readyState: el.readyState }));
console.log("decoded probe:", JSON.stringify(probe));

// Ensure Step Numbers layer is on.
for (const layerLabel of [/step numbers/i, /contacts/i]) {
  const checkbox = page.locator("label", { hasText: layerLabel }).locator("input[type=checkbox]").first();
  if (await checkbox.count()) { const checked = await checkbox.isChecked().catch(() => null); if (checked === false) await checkbox.check({ force: true }).catch(() => {}); }
}
// Auto Follow ON for a readable zoom level (matches the established, already
// successful capture pattern from the prior phase's real screenshots).
const autoFollowBtn = page.getByRole("button", { name: /^.\s*auto follow$/i }).first();
if (await autoFollowBtn.count()) await autoFollowBtn.click().catch(() => {});
await page.waitForTimeout(200);
const playerContainer = video.locator("xpath=ancestor::div[contains(@class,'overflow-hidden')][1]");

async function captureAt(label, t, clipFrac) {
  await video.evaluate((el, time) => { el.currentTime = time; }, t);
  await page.waitForFunction((time) => [...document.querySelectorAll("video")].at(-1)?.currentTime >= time - 0.05, t, { timeout: 8000 });
  await page.waitForTimeout(300);
  await video.scrollIntoViewIfNeeded();
  if (await playerContainer.count()) {
    await playerContainer.screenshot({ path: path.join(OUT, `${label}.png`) }).catch(() => {});
    if (clipFrac) {
      const box = await playerContainer.boundingBox();
      if (box) {
        const clip = { x: box.x + box.width * clipFrac.x0, y: box.y + box.height * clipFrac.y0, width: box.width * (clipFrac.x1 - clipFrac.x0), height: box.height * (clipFrac.y1 - clipFrac.y0) };
        await page.screenshot({ path: path.join(OUT, `${label}-closeup.png`), clip }).catch(() => {});
      }
    }
  }
  console.log(`captured ${label} at t=${t.toFixed(4)}s`);
}

// Auto Follow already zooms/centers on the athlete -- no manual clip needed.
await captureAt("case1-contact119-should-now-show-meter", CASE1_T);
await captureAt("case2-contact278-should-remain-absent", CASE2_T);
await captureAt("working-contact330-should-be-unchanged", WORKING_T);

writeFileSync(path.join(OUT, "../targeted-verification.json"), JSON.stringify({ decodedProbe: probe, consoleErrors, captures: { case1T: CASE1_T, case2T: CASE2_T, workingT: WORKING_T } }, null, 2));
console.log(`Console errors: ${consoleErrors.length}`);
server.close();
await browser.close();
