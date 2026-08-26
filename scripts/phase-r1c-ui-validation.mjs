// Phase R1C Part P -- real UI validation via the established H.264 test-copy
// technique (Phase 6.2B), using page.route() to serve the local decodable
// test copy AT the real signed video URL so React's normal video-loading
// lifecycle (and the overlay's RAF draw loop, which depends on it) runs
// exactly as it would in production -- rather than mutating `<video>.src`
// after mount, which was found to leave the draw loop stalled.
//
//   node scripts/phase-r1c-ui-validation.mjs
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const OUT = "tmp/phaseR1C/browser";
mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:3000";

const SESSIONS = {
  vanni240: { id: "31fe352b-f00f-4a80-b20a-17c2ab08ec5a", media: "tmp/phase66b-part-a/vanni240-browser-test-only.mp4", fps: 239.981 },
  vanni120: { id: "160a86a2-c0db-4e7d-9fbe-82aedd6d3eff", media: "tmp/phase66d-part-b/vanni120-browser-test-only.mp4", fps: 119.88 },
  vanni60: { id: "3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d", media: "tmp/phase66b-part-a/vanni60-browser-test-only.mp4", fps: 59.94 },
  gav: { id: "e04a7983-7406-4a00-bb89-8ada7b10bf9f", media: "tmp/phase66d-part-b/gav-browser-test-only.mp4", fps: 29.97 },
};

const browser = await chromium.launch();
const report = {};

async function validateSession(label, { id, media, fps }, seekTimes) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const consoleErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  // Serve the local H.264 test copy for ANY request to this session's signed
  // video URL, so `<video src={signedUrl}>` decodes successfully via the
  // normal React-managed src attribute (sandbox cannot decode the original
  // HEVC/MOV source -- Phase 6.2B).
  const mediaBuffer = readFileSync(media);
  const size = mediaBuffer.length;
  await page.route(`**/storage/v1/object/sign/sprint-videos/**`, (route) => {
    const url = route.request().url();
    if (!url.includes(`${id}.`)) return route.continue();
    const rangeHeader = route.request().headers()["range"];
    const match = rangeHeader && /bytes=(\d+)-(\d*)/.exec(rangeHeader);
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : size - 1;
      route.fulfill({
        status: 206,
        contentType: "video/mp4",
        body: mediaBuffer.subarray(start, end + 1),
        headers: { "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${size}` },
      });
    } else {
      route.fulfill({ status: 200, contentType: "video/mp4", body: mediaBuffer, headers: { "Accept-Ranges": "bytes" } });
    }
  });

  await page.goto(`${BASE}/login`);
  await page.getByPlaceholder(/^email$/i).fill("commander@atreides.local");
  await page.getByPlaceholder(/^password$/i).fill("ATREIDES-DEV-PRIME-2026");
  await page.getByRole("button", { name: /^log in$/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 15000 });

  await page.goto(`${BASE}/sessions/${id}`, { waitUntil: "networkidle" });

  // The real "Interactive Overlay" player: found by anchoring on the
  // "Skeleton" layer checkbox (unambiguous), not by video/canvas DOM index --
  // the page also has an unrelated <video> and a filmstrip <video>, both of
  // which can outrank the real player by naive index/`.last()` selection.
  const skeletonLabel = page.getByText("Skeleton", { exact: true }).first();
  await skeletonLabel.waitFor({ state: "visible", timeout: 15000 });
  const panel = skeletonLabel.locator("xpath=ancestor::div[.//video][1]");
  const video = panel.locator("video").first();
  await video.waitFor({ state: "attached" });
  await page.waitForFunction((el) => el.readyState >= 2, await video.elementHandle(), { timeout: 20000 });
  const probe = await video.evaluate((el) => ({ videoWidth: el.videoWidth, readyState: el.readyState }));

  for (const layerLabel of [/step numbers/i, /contacts/i]) {
    const checkbox = page.locator("label", { hasText: layerLabel }).locator("input[type=checkbox]").first();
    if (await checkbox.count()) { const checked = await checkbox.isChecked().catch(() => null); if (checked === false) await checkbox.check({ force: true }).catch(() => {}); }
  }
  const autoFollowBtn = page.getByRole("button", { name: /^.\s*auto follow$/i }).first();
  if (await autoFollowBtn.count()) await autoFollowBtn.click().catch(() => {});
  await page.waitForTimeout(300);

  // Warm-up: the overlay's draw/reveal loop needs a few real `timeupdate`
  // cycles after a fresh video swap before it starts tracking playback
  // position; a single cold seek straight to the target frame does not
  // reliably render (verified: identical single-seek calls to the SAME
  // target frame render inconsistently on the first seek of a session but
  // reliably once a few seeks have already happened). Step through a short
  // ramp first so every real capture below is on a "warm" player.
  for (const warmFrame of [0, 20, 50, 80]) {
    await video.evaluate((el, time) => { el.currentTime = time; }, warmFrame / fps);
    await page.waitForTimeout(250);
  }

  const captures = {};
  for (const [name, srcFrame] of Object.entries(seekTimes)) {
    // +0.05s margin: contacts are cumulative once revealed (never
    // disappear), and the swapped test copy's internal clock is not
    // bit-identical to the original source, so a small forward margin is a
    // safe, honest way to land on/after the target frame's reveal threshold.
    const t = srcFrame / fps + 0.05;
    // Step through a couple of intermediate points rather than jumping cold
    // -- the overlay's reveal loop tracks native `timeupdate` events and is
    // more reliable after a short ramp than after a single large seek.
    await video.evaluate((el, time) => { el.currentTime = time; }, Math.max(0, t - 0.1));
    await page.waitForTimeout(300);
    await video.evaluate((el, time) => { el.currentTime = time; }, t);
    const elHandle = await video.elementHandle();
    await page.waitForFunction(({ el, time }) => el.currentTime >= time - 0.05, { el: elHandle, time: t }, { timeout: 8000 });
    await page.waitForTimeout(1000);
    await video.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const shotPath = path.join(OUT, `${label}-${name}.png`);
    const box = await video.boundingBox();
    await page.screenshot({ path: shotPath, clip: { x: Math.max(0, box.x - 10), y: Math.max(0, box.y - 10), width: box.width + 20, height: box.height + 20 } }).catch(() => {});
    const frameReadout = await page.getByText(/^Frame /).textContent().catch(() => null);
    captures[name] = { t, sourceFrame: srcFrame, screenshot: shotPath, frameReadout };
    console.log(`${label} ${name}: t=${t.toFixed(4)}s (frame ${srcFrame}) readout="${frameReadout}"`);
  }

  report[label] = { decodedProbe: probe, consoleErrors, captures };
  await page.close();
}

// Vanni 240: Case 1 (contact-119-left, should now show meter label),
// Case 2 (contact-278-left, should show dot, no meter label), working contact (330).
// Captured ~20-25 frames past each contact's own source frame: the overlay
// briefly shows a transient "flight" phase badge right as a contact is
// first revealed, before settling to its steady-state label -- landing a
// bit further past the contact avoids capturing mid-transition.
await validateSession("vanni240", SESSIONS.vanni240, { "case1-frame119-left": 145, "case2-frame278-left": 300, "working-frame330": 355 });
// Spot-checks: one mid-run contact per remaining benchmark.
await validateSession("vanni120", SESSIONS.vanni120, { "spotcheck-frame30": 30 });
await validateSession("vanni60", SESSIONS.vanni60, { "spotcheck-frame15": 15 });
await validateSession("gav", SESSIONS.gav, { "spotcheck-frame10": 10 });

writeFileSync(path.join(OUT, "../ui-validation-report.json"), JSON.stringify(report, null, 2));
console.log(`\nTotal console errors: ${Object.values(report).reduce((n, r) => n + r.consoleErrors.length, 0)}`);
await browser.close();
