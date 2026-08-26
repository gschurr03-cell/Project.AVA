// Phase 8.1B-2B Part U -- real browser validation. Logs in with the
// permanent local dev account and exercises RAW/STABILIZED x Auto Follow
// OFF/ON for Vanni 120/240/60: confirms the toggle controls work, the new
// two-wrapper DOM structure is present with live dataset diagnostics, no
// console errors occur in any of the 4 combinations, and captures
// screenshots. Read-only.
//
// Disclosed, pre-existing environment limitation (also hit and disclosed in
// Phase 8.0B/8.1A's own browser checks): this headless Chromium session
// never successfully decodes real pixels for these benchmark .mov files
// (`video.videoWidth` stays 0 and `requestVideoFrameCallback` never fires a
// real callback, even during active playback with currentTime advancing) --
// so the LIVE, per-frame dataset value (stabilizationTransform/motionClass)
// cannot be captured changing in real time in THIS environment. The
// authoritative quantitative before/after evidence is
// scripts/phase-8-1b2b-motion-metrics.mjs, which calls the real production
// module against real, current cameraPath data directly (Part S).
//
//   node scripts/phase-8-1b2b-browser-check.mjs

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "tmp/phase81b2b/screenshots";
mkdirSync(OUT, { recursive: true });

const sessions = {
  vanni120: "160a86a2-c0db-4e7d-9fbe-82aedd6d3eff",
  vanni240: "31fe352b-f00f-4a80-b20a-17c2ab08ec5a",
  vanni60: "3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d",
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const consoleErrors = [];
page.on("pageerror", (err) => consoleErrors.push({ type: "pageerror", message: err.message }));
page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push({ type: "console.error", message: msg.text() }); });

await page.goto(`${BASE}/login`);
await page.getByPlaceholder(/^email$/i).fill("commander@atreides.local");
await page.getByPlaceholder(/^password$/i).fill("ATREIDES-DEV-PRIME-2026");
await page.getByRole("button", { name: /^log in$/i }).click();
await page.waitForURL(/dashboard|athletes|sessions/, { timeout: 15000 });
console.log("Logged in.");

const findVideoAndScroll = async () => {
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const videos = Array.from(document.querySelectorAll("video"));
    const withCanvas = videos.find((v) => v.parentElement?.querySelector("canvas"));
    const v = withCanvas ?? videos[0];
    if (v) window.scrollTo(0, v.getBoundingClientRect().top + window.scrollY - 150);
  });
  await page.waitForTimeout(300);
};

const setToggle = async (label, desired) => {
  const btn = page.locator("button", { hasText: label }).first();
  if (await btn.count()) {
    const pressed = await btn.getAttribute("aria-pressed");
    if ((pressed === "true") !== desired) {
      await btn.click();
      await page.waitForTimeout(300);
    }
    return await btn.getAttribute("aria-pressed");
  }
  return null;
};

const readStructure = async () => page.evaluate(() => {
  const videos = Array.from(document.querySelectorAll("video"));
  const withCanvas = videos.find((v) => v.parentElement?.querySelector("canvas"));
  const v = withCanvas ?? videos[0];
  const followWrapper = v?.parentElement ?? null;
  const stabilizationWrapper = followWrapper?.parentElement ?? null;
  return {
    videoFound: Boolean(v),
    canvasSiblingFound: Boolean(followWrapper?.querySelector("canvas")),
    followWrapperPresent: Boolean(followWrapper),
    stabilizationWrapperPresent: Boolean(stabilizationWrapper),
    stabilizationWrapperHasDatasetHooks:
      stabilizationWrapper?.dataset.stabilizationMotionClass !== undefined &&
      stabilizationWrapper?.dataset.stabilizationDivergencePx !== undefined,
  };
});

const results = {};

for (const [label, id] of Object.entries(sessions)) {
  results[label] = { combinations: {} };
  await page.goto(`${BASE}/sessions/${id}`, { waitUntil: "networkidle" });
  await findVideoAndScroll();

  for (const stabilized of [true, false]) {
    for (const autoFollow of [false, true]) {
      const modeLabel = `${stabilized ? "STAB" : "RAW"}_af${autoFollow ? "ON" : "OFF"}`;
      const errCountBefore = consoleErrors.length;
      const stabPressed = await setToggle("Stabilized View", stabilized);
      const afPressed = await setToggle("Auto Follow", autoFollow);
      await findVideoAndScroll();
      const structure = await readStructure();
      await page.screenshot({ path: `${OUT}/${label}_${modeLabel}.png` });
      const newErrors = consoleErrors.slice(errCountBefore);
      results[label].combinations[modeLabel] = {
        stabilizedViewPressed: stabPressed,
        autoFollowPressed: afPressed,
        ...structure,
        consoleErrorsIntroduced: newErrors,
      };
      console.log(label, modeLabel, JSON.stringify(results[label].combinations[modeLabel]));
    }
  }
}

// Resize + fullscreen-class check on Vanni 120, Stabilized ON.
await page.goto(`${BASE}/sessions/${sessions.vanni120}`, { waitUntil: "networkidle" });
await findVideoAndScroll();
await setToggle("Stabilized View", true);
await page.screenshot({ path: `${OUT}/vanni120_resize_before.png` });
await page.setViewportSize({ width: 900, height: 700 });
await findVideoAndScroll();
const resizeStructure = await readStructure();
await page.screenshot({ path: `${OUT}/vanni120_resize_after.png` });
await page.setViewportSize({ width: 1400, height: 1000 });
results.resizeCheck = resizeStructure;
console.log("resizeCheck", JSON.stringify(resizeStructure));

results.totalConsoleErrors = consoleErrors.length;
results.consoleErrorsSample = consoleErrors.slice(0, 10);
console.log("Total console errors across entire run:", consoleErrors.length);

writeFileSync("tmp/phase81b2b/browser-check-results.json", JSON.stringify(results, null, 2));
await browser.close();
console.log("Done.");
