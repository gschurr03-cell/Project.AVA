// Phase 8.2B Part U -- real browser validation. Authenticated Playwright
// session against Vanni 60/120/240, RAW + Auto Follow ON and STABILIZED +
// Auto Follow ON, at 1x/0.5x/0.25x, plus pause/resume/forward-scrub/
// backward-scrub/fresh-load/resize. Read-only; no data mutated.
//
//   node scripts/phase-8-2b-browser-check.mjs

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "tmp/phase82b/browser";
mkdirSync(OUT, { recursive: true });

const SESSIONS = {
  vanni60: "3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d",
  vanni120: "160a86a2-c0db-4e7d-9fbe-82aedd6d3eff",
  vanni240: "31fe352b-f00f-4a80-b20a-17c2ab08ec5a",
};

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

async function setToggle(namePattern, want) {
  const btn = page.getByText(namePattern).first();
  if (!(await btn.count())) return null;
  const pressed = await btn.getAttribute("aria-pressed");
  if (pressed !== String(want)) { await btn.click().catch(() => {}); await page.waitForTimeout(250); }
  return btn.getAttribute("aria-pressed");
}

for (const [label, sessionId] of Object.entries(SESSIONS)) {
  results[label] = {};
  // Fresh load.
  await page.goto(`${BASE}/sessions/${sessionId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && v.readyState >= 1;
  }, { timeout: 15000 }).catch(() => {});

  await setToggle(/auto follow/i, true);

  for (const stabilized of [false, true]) {
    await setToggle(/stabilized view/i, stabilized);
    const viewKey = stabilized ? "stabilized" : "raw";
    results[label][viewKey] = {};

    for (const rate of [1, 0.5, 0.25]) {
      const outcome = await page.evaluate(async ({ rate }) => {
        const videos = Array.from(document.querySelectorAll("video"));
        const withCanvas = videos.find((v) => v.parentElement?.querySelector("canvas"));
        const v = withCanvas ?? videos[0];
        if (!v) return { error: "no video" };
        const followWrapper = v.parentElement;
        const stabilizationWrapper = followWrapper?.parentElement;

        v.playbackRate = rate;
        v.currentTime = 0.05;
        await new Promise((r) => setTimeout(r, 80));
        const beforePlayTransform = followWrapper?.style.transform || "none";

        await v.play().catch(() => {});
        await new Promise((r) => setTimeout(r, 900));
        const duringPlayTransform = followWrapper?.style.transform || "none";

        v.pause();
        await new Promise((r) => setTimeout(r, 150));
        const afterPauseTransform1 = followWrapper?.style.transform || "none";
        await new Promise((r) => setTimeout(r, 150));
        const afterPauseTransform2 = followWrapper?.style.transform || "none";

        // Forward scrub.
        v.currentTime = Math.min(v.duration || 2, (v.currentTime || 0) + 1);
        await new Promise((r) => setTimeout(r, 200));
        const afterForwardScrub = followWrapper?.style.transform || "none";

        // Backward scrub.
        v.currentTime = Math.max(0, (v.currentTime || 0) - 0.8);
        await new Promise((r) => setTimeout(r, 200));
        const afterBackwardScrub = followWrapper?.style.transform || "none";

        return {
          hasFollowWrapper: !!followWrapper,
          hasStabilizationWrapper: !!stabilizationWrapper,
          stabilizationContainsFollow: stabilizationWrapper?.contains(followWrapper) ?? false,
          videoInsideFollowWrapper: followWrapper?.contains(v) ?? false,
          canvasInsideFollowWrapper: !!followWrapper?.querySelector("canvas"),
          presentationCameraTimeMs: followWrapper?.dataset.presentationCameraTimeMs ?? null,
          presentationCameraState: followWrapper?.dataset.presentationCameraState ?? null,
          stabilizationMotionClass: stabilizationWrapper?.dataset.stabilizationMotionClass ?? null,
          beforePlayTransform, duringPlayTransform,
          afterPauseTransform1, afterPauseTransform2,
          pauseDeterministic: afterPauseTransform1 === afterPauseTransform2,
          afterForwardScrub, afterBackwardScrub,
          videoWidth: v.videoWidth, readyState: v.readyState,
        };
      }, { rate });
      results[label][viewKey][`rate_${rate}`] = outcome;
      console.log(`${label} ${viewKey} rate=${rate}: pauseDeterministic=${outcome.pauseDeterministic} videoInsideFollow=${outcome.videoInsideFollowWrapper} canvasInsideFollow=${outcome.canvasInsideFollowWrapper} stabContainsFollow=${outcome.stabilizationContainsFollow} state=${outcome.presentationCameraState} videoWidth=${outcome.videoWidth}`);
    }
  }
}

// Resize check (Stabilized View + Auto Follow ON, vanni240 already loaded).
await page.setViewportSize({ width: 900, height: 700 });
await page.waitForTimeout(400);
const resizeOk = await page.evaluate(() => {
  const v = document.querySelector("video");
  const followWrapper = v?.parentElement;
  const stabilizationWrapper = followWrapper?.parentElement;
  return { hasFollowWrapper: !!followWrapper, hasStabilizationWrapper: !!stabilizationWrapper, videoWidth: v?.videoWidth ?? null };
});
results.resizeCheck = resizeOk;
console.log("Resize check:", JSON.stringify(resizeOk));

results.consoleErrors = consoleErrors;
console.log(`\nConsole errors across entire run: ${consoleErrors.length}`);
if (consoleErrors.length) console.log(consoleErrors.slice(0, 10));

writeFileSync(`${OUT}/../browser-part-u-results.json`, JSON.stringify(results, null, 2));
await browser.close();
console.log("\nDone. Wrote tmp/phase82b/browser-part-u-results.json");
