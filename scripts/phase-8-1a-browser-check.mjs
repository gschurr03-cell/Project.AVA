// Phase 8.1A -- real browser validation (Part A/M/Q). Logs in with the
// permanent local dev account, opens the Vanni 240 benchmark session (the
// clearest, largest, independently-confirmed drift case from the Node
// transform-trace/raw-source-motion-control evidence), seeks to the
// reference time (shortly after zone exit) and the max-drift time with Auto
// Follow explicitly OFF, and captures: a screenshot of each, plus real
// video/canvas geometry (videoWidth/videoHeight/clientWidth/clientHeight/
// devicePixelRatio/boundingClientRect) at each point, to rule out a browser
// geometry change (Part M) as a confound. Read-only; no data mutated.
//
//   node scripts/phase-8-1a-browser-check.mjs

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "tmp/phase81a/screenshots";
mkdirSync(OUT, { recursive: true });

const sessionId = "31fe352b-f00f-4a80-b20a-17c2ab08ec5a"; // vanni240
const refTimeS = 573 / 240;
const maxDriftTimeS = 1007 / 240;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

await page.goto(`${BASE}/login`);
await page.getByPlaceholder(/^email$/i).fill("commander@atreides.local");
await page.getByPlaceholder(/^password$/i).fill("ATREIDES-DEV-PRIME-2026");
await page.getByRole("button", { name: /^log in$/i }).click();
await page.waitForURL(/dashboard|athletes|sessions/, { timeout: 15000 });
console.log("Logged in.");

await page.goto(`${BASE}/sessions/${sessionId}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// Enable Contacts + Step Numbers + Zones + Gates overlay layers (checkbox
// inputs; only click ones NOT already checked so we always end up with all
// four ON, regardless of the page's default state).
for (const t of ["Contacts", "Step Numbers", "Zones", "Gates"]) {
  const label = page.locator("label", { hasText: t }).first();
  if (await label.count()) {
    const checkbox = label.locator('input[type="checkbox"]');
    if (await checkbox.count()) {
      const checked = await checkbox.isChecked().catch(() => false);
      if (!checked) { try { await label.click({ timeout: 2000 }); } catch { /* best-effort */ } }
    }
  }
}
await page.waitForTimeout(2000); // allow the video element to finish loading metadata

// Confirm Auto Follow is explicitly OFF (default state; click only if it reads pressed).
const afButton = page.getByText(/auto follow/i).first();
if (await afButton.count()) {
  const pressed = await afButton.getAttribute("aria-pressed");
  if (pressed === "true") { await afButton.click(); await page.waitForTimeout(300); }
}

await page.waitForFunction(() => {
  const videos = Array.from(document.querySelectorAll("video"));
  const withCanvas = videos.find((v) => v.parentElement?.querySelector("canvas"));
  const v = withCanvas ?? videos[0];
  return v && v.readyState >= 1 && v.videoWidth > 0;
}, { timeout: 15000 }).catch(() => {});

const captureAt = async (label, timeS) => {
  const geometry = await page.evaluate((t) => {
    const videos = Array.from(document.querySelectorAll("video"));
    const withCanvas = videos.find((v) => v.parentElement?.querySelector("canvas"));
    const v = withCanvas ?? videos[0];
    const canvas = v?.parentElement?.querySelector("canvas");
    if (!v) return null;
    v.currentTime = t;
    const vr = v.getBoundingClientRect();
    const cr = canvas?.getBoundingClientRect();
    return {
      videoWidth: v.videoWidth, videoHeight: v.videoHeight,
      clientWidth: v.clientWidth, clientHeight: v.clientHeight,
      boundingRect: { x: vr.x, y: vr.y, width: vr.width, height: vr.height },
      canvasBoundingRect: cr ? { x: cr.x, y: cr.y, width: cr.width, height: cr.height } : null,
      canvasBackingWidth: canvas?.width ?? null, canvasBackingHeight: canvas?.height ?? null,
      devicePixelRatio: window.devicePixelRatio,
      currentTime: v.currentTime,
      autoFollowTransform: v.parentElement?.style.transform || "none",
    };
  }, timeS);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/vanni240-${label}.png`, fullPage: false });
  console.log(`Captured ${label} @ t=${timeS.toFixed(3)}s`, JSON.stringify(geometry));
  return geometry;
};

// Scroll to the analyzed video (with-canvas one), not the raw preview lower on the page.
await page.evaluate(() => {
  const videos = Array.from(document.querySelectorAll("video"));
  const withCanvas = videos.find((v) => v.parentElement?.querySelector("canvas"));
  const v = withCanvas ?? videos[0];
  if (v) window.scrollTo(0, v.getBoundingClientRect().top + window.scrollY - 150);
});
await page.waitForTimeout(500);

const geomRef = await captureAt("A-reference", refTimeS);
const geomDrift = await captureAt("B-maxdrift", maxDriftTimeS);

writeFileSync(`${OUT}/../browser-geometry-check.json`, JSON.stringify({ geomRef, geomDrift }, null, 2));

await browser.close();
console.log("Done.");
