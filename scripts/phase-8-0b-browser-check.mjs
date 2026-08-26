// Phase 8.0B -- real browser validation (Part Q). Logs in with the permanent
// local dev account, opens each of the 4 real benchmark sessions, enables the
// Contacts + Step Numbers overlay layers, and screenshots the video so the
// on-screen step-length labels can be visually inspected. Also toggles Auto
// Follow and resizes the viewport to capture evidence for Part G (Auto
// Follow / resize cannot change the label VALUE -- only where it's drawn).
// Read-only: no data is mutated. Not part of any build/CI entry point.
//
//   node scripts/phase-8-0b-browser-check.mjs

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "tmp/phase80b/screenshots";
mkdirSync(OUT, { recursive: true });

const sessions = {
  gav: "e04a7983-7406-4a00-bb89-8ada7b10bf9f",
  vanni240: "31fe352b-f00f-4a80-b20a-17c2ab08ec5a",
  vanni120: "160a86a2-c0db-4e7d-9fbe-82aedd6d3eff",
  vanni60: "3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d",
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

await page.goto(`${BASE}/login`);
await page.getByPlaceholder(/^email$/i).fill("commander@atreides.local");
await page.getByPlaceholder(/^password$/i).fill("ATREIDES-DEV-PRIME-2026");
await page.getByRole("button", { name: /^log in$/i }).click();
await page.waitForURL(/dashboard|athletes|sessions/, { timeout: 15000 });
console.log("Logged in.");

for (const [label, id] of Object.entries(sessions)) {
  await page.goto(`${BASE}/sessions/${id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // Open the overlay-layers control and enable Contacts + Step Numbers if a
  // toggle is present (best-effort; the exact control UI isn't the subject of
  // this phase, so failures here are logged, not fatal).
  const toggles = ["Contacts", "Step Numbers", "Step numbers"];
  for (const t of toggles) {
    const el = page.getByText(t, { exact: false }).first();
    if (await el.count()) {
      try { await el.click({ timeout: 2000 }); } catch { /* best-effort */ }
    }
  }
  await page.waitForTimeout(500);

  // The page has TWO <video> elements: the analyzed OverlayVideoPlayer (with a
  // sibling <canvas> VideoOverlay paints step-length labels onto) and, further
  // down, a plain "Original Uploaded Video" preview with no canvas. Target the
  // one with a canvas sibling so we screenshot the actual labeled overlay.
  await page.waitForFunction(() => {
    const videos = Array.from(document.querySelectorAll("video"));
    const withCanvas = videos.find((v) => v.parentElement?.querySelector("canvas"));
    const v = withCanvas ?? videos[0];
    return v && v.readyState >= 1 && v.videoWidth > 0;
  }, { timeout: 15000 }).catch(() => {});
  const found = await page.evaluate(() => {
    const videos = Array.from(document.querySelectorAll("video"));
    const withCanvas = videos.find((v) => v.parentElement?.querySelector("canvas"));
    const v = withCanvas ?? videos[0];
    if (!v) return null;
    v.currentTime = Math.min(2, (v.duration || 4) * 0.7);
    const rect = v.getBoundingClientRect();
    return { top: rect.top + window.scrollY, left: rect.left + window.scrollX };
  });
  if (found) {
    await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 150)), found.top);
    await page.waitForTimeout(800);
  }

  await page.screenshot({ path: `${OUT}/${label}-autofollow-off.png`, fullPage: false });
  console.log(`Captured ${label} (Auto Follow off / default).`);

  // Auto Follow toggle, if present.
  const afToggle = page.getByText(/auto follow/i).first();
  if (await afToggle.count()) {
    try {
      await afToggle.click({ timeout: 2000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/${label}-autofollow-on.png`, fullPage: false });
      console.log(`Captured ${label} (Auto Follow on).`);
    } catch (err) {
      console.log(`Auto Follow toggle not clickable for ${label}: ${err.message}`);
    }
  } else {
    console.log(`No Auto Follow control found for ${label}.`);
  }

  // Resize (Part G): viewport change must not change the label VALUE (only
  // pixel position) -- captured for visual comparison.
  await page.setViewportSize({ width: 900, height: 700 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${label}-resized.png`, fullPage: false });
  console.log(`Captured ${label} (resized viewport).`);
  await page.setViewportSize({ width: 1400, height: 1000 });
}

await browser.close();
console.log("Done.");
