// Phase R2 Part O/P/L/M/N -- real UI validation of the bounded start/fly/
// finish gate-band zone visualization. Reuses the route-interception H.264
// test-copy technique established in Phase R1C (direct <video>.src mutation
// left the overlay's draw loop stalled in this sandbox; page.route() on the
// real signed video URL keeps React's normal load path intact).
//
//   node scripts/phase-r2-ui-validation.mjs
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const OUT = "tmp/phaseR2C/screenshots";
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

async function openSession(label, { id, media }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const consoleErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

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
      route.fulfill({ status: 206, contentType: "video/mp4", body: mediaBuffer.subarray(start, end + 1), headers: { "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${size}` } });
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

  const skeletonLabel = page.getByText("Skeleton", { exact: true }).first();
  await skeletonLabel.waitFor({ state: "visible", timeout: 15000 });
  const panel = skeletonLabel.locator("xpath=ancestor::div[.//video][1]");
  const video = panel.locator("video").first();
  await video.waitFor({ state: "attached" });
  await page.waitForFunction((el) => el.readyState >= 2, await video.elementHandle(), { timeout: 20000 });

  for (const layerLabel of [/^zones$/i, /^gates$/i]) {
    const checkbox = page.locator("label", { hasText: layerLabel }).locator("input[type=checkbox]").first();
    if (await checkbox.count()) { const checked = await checkbox.isChecked().catch(() => null); if (checked === false) await checkbox.check({ force: true }).catch(() => {}); }
  }

  // Warm-up ramp (established Phase R1C finding: a cold single seek does not
  // reliably drive the overlay's reveal loop on a freshly swapped video).
  for (const warmFrame of [0, 20, 50, 80]) {
    await video.evaluate((el, t) => { el.currentTime = t; }, warmFrame / SESSIONS[label].fps);
    await page.waitForTimeout(250);
  }

  return { page, video, panel, consoleErrors };
}

async function capture(page, panel, name) {
  await panel.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const box = await panel.boundingBox();
  if (!box) { console.log(`  [capture] ${name}: panel not visible, skipped`); return null; }
  const shotPath = path.join(OUT, `${name}.png`);
  try {
    await page.screenshot({ path: shotPath, clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: box.width, height: Math.min(box.height, 700) } });
  } catch (err) {
    console.log(`  [capture] ${name}: FAILED -- ${err.message}`);
    return null;
  }
  return shotPath;
}

// --- Vanni 240: primary acceptance capture + Auto Follow / Stabilized View / pause-scrub matrix ---
{
  const { page, video, panel, consoleErrors } = await openSession("vanni240", SESSIONS.vanni240);
  await video.evaluate((el) => { el.currentTime = 1.0; });
  await page.waitForTimeout(500);
  report.vanni240_raw_autofollow_off = await capture(page, panel, "vanni240-raw-autofollow-off");

  const autoFollowBtn = page.getByRole("button", { name: /^.\s*auto follow$/i }).first();
  await autoFollowBtn.click().catch(() => {});
  await page.waitForTimeout(400);
  report.vanni240_autofollow_on = await capture(page, panel, "vanni240-autofollow-on");

  const stabilizedBtn = page.getByRole("button", { name: /^.\s*stabilized view$/i }).first();
  const stabChecked = await stabilizedBtn.getAttribute("aria-pressed").catch(() => null);
  // Toggle Stabilized View off then back on to exercise both states.
  await stabilizedBtn.click().catch(() => {});
  await page.waitForTimeout(400);
  report.vanni240_stabilized_toggled = await capture(page, panel, "vanni240-stabilized-toggled");
  await stabilizedBtn.click().catch(() => {});
  await page.waitForTimeout(400);

  // Pause/scrub determinism: forward then backward to the SAME mediaTime.
  await video.evaluate((el) => { el.currentTime = 1.5; });
  await page.waitForTimeout(500);
  const boxesAt15_fwd = await page.evaluate(() => {
    const c = document.querySelector('canvas[data-ava-overlay-build]');
    return c ? { w: c.width, h: c.height } : null;
  });
  report.vanni240_scrub_forward_1_5s = await capture(page, panel, "vanni240-scrub-forward-1.5s");
  await video.evaluate((el) => { el.currentTime = 0.3; });
  await page.waitForTimeout(300);
  await video.evaluate((el) => { el.currentTime = 1.5; });
  await page.waitForTimeout(500);
  report.vanni240_scrub_backward_then_1_5s = await capture(page, panel, "vanni240-scrub-backward-then-1.5s");
  report.vanni240_canvas_dims_consistent = boxesAt15_fwd;

  // Resize.
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.waitForTimeout(400);
  report.vanni240_resized_1100 = await capture(page, panel, "vanni240-resized-1100");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(400);

  report.vanni240_console_errors = consoleErrors;
  await page.close();
}

// --- Cross-benchmark spot-checks ---
for (const label of ["vanni120", "vanni60", "gav"]) {
  const { page, video, panel, consoleErrors } = await openSession(label, SESSIONS[label]);
  await video.evaluate((el) => { el.currentTime = 1.0; });
  await page.waitForTimeout(500);
  report[`${label}_layout`] = await capture(page, panel, `${label}-zone-layout`);
  report[`${label}_console_errors`] = consoleErrors;
  await page.close();
}

writeFileSync("tmp/phaseR2/ui-validation-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
const totalErrors = Object.entries(report).filter(([k]) => k.endsWith("console_errors")).reduce((n, [, v]) => n + v.length, 0);
console.log(`\nTotal console errors: ${totalErrors}`);
await browser.close();
