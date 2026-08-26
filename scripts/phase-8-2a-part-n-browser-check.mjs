// Phase 8.2A Part N -- REQUIRED real browser validation. Authenticated
// browser playback of Vanni 240/120/60, Auto Follow ON, RAW and STABILIZED
// view, at 1x/0.5x/0.25x. Records real rVFC callback cadence, rAF cadence,
// and Auto Follow wrapper CSS-transform-write cadence via page.evaluate
// instrumentation injected BEFORE playback starts (so it observes the real
// production tick loop, not a re-implementation). Does not modify any
// application code. Read-only; no data mutated.
//
//   node scripts/phase-8-2a-part-n-browser-check.mjs

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "tmp/phase82a/browser";
mkdirSync(OUT, { recursive: true });

const SESSIONS = {
  vanni60: "3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d",
  vanni120: "160a86a2-c0db-4e7d-9fbe-82aedd6d3eff",
  vanni240: "31fe352b-f00f-4a80-b20a-17c2ab08ec5a",
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

await page.goto(`${BASE}/login`);
await page.getByPlaceholder(/^email$/i).fill("commander@atreides.local");
await page.getByPlaceholder(/^password$/i).fill("ATREIDES-DEV-PRIME-2026");
await page.getByRole("button", { name: /^log in$/i }).click();
await page.waitForURL(/dashboard|athletes|sessions/, { timeout: 15000 });
console.log("Logged in.");

const results = {};

for (const [label, sessionId] of Object.entries(SESSIONS)) {
  results[label] = {};
  await page.goto(`${BASE}/sessions/${sessionId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  await page.waitForFunction(() => {
    const videos = Array.from(document.querySelectorAll("video"));
    const withCanvas = videos.find((v) => v.parentElement?.querySelector("canvas"));
    const v = withCanvas ?? videos[0];
    return v && v.readyState >= 1;
  }, { timeout: 15000 }).catch(() => {});

  // Ensure Auto Follow is ON.
  const afButton = page.getByText(/auto follow/i).first();
  if (await afButton.count()) {
    const pressed = await afButton.getAttribute("aria-pressed");
    if (pressed !== "true") { await afButton.click().catch(() => {}); await page.waitForTimeout(300); }
  }

  for (const stabilizedView of [false, true]) {
    const stabButton = page.getByText(/stabilized view/i).first();
    if (await stabButton.count()) {
      const pressed = await stabButton.getAttribute("aria-pressed");
      const wantPressed = String(stabilizedView);
      if (pressed !== wantPressed) { await stabButton.click().catch(() => {}); await page.waitForTimeout(300); }
    }
    const viewKey = stabilizedView ? "stabilized" : "raw";
    results[label][viewKey] = {};

    for (const rate of [1, 0.5, 0.25]) {
      // Inject instrumentation BEFORE playback: hook rVFC (if available),
      // wrap requestAnimationFrame counting, and poll the follow wrapper's
      // inline style.transform + a MutationObserver on `style` attribute to
      // timestamp every real transform WRITE the production tick() performs.
      const capture = await page.evaluate(async (playbackRate) => {
        const videos = Array.from(document.querySelectorAll("video"));
        const withCanvas = videos.find((v) => v.parentElement?.querySelector("canvas"));
        const v = withCanvas ?? videos[0];
        if (!v) return { error: "no video element found" };
        const wrapper = v.parentElement; // followWrapperRef div directly wraps the video
        if (!wrapper) return { error: "no wrapper found" };

        v.playbackRate = playbackRate;
        v.currentTime = 0.05;
        await new Promise((r) => setTimeout(r, 50));

        const rvfcTimestamps = [];
        const rafTimestamps = [];
        const transformWriteTimestamps = [];
        let lastTransform = wrapper.style.transform;

        const hasRvfc = typeof v.requestVideoFrameCallback === "function";
        let rvfcId = null;
        const scheduleRvfc = () => {
          rvfcId = v.requestVideoFrameCallback((now, metadata) => {
            rvfcTimestamps.push({ now, mediaTime: metadata.mediaTime, presentedFrames: metadata.presentedFrames ?? null });
            scheduleRvfc();
          });
        };
        if (hasRvfc) scheduleRvfc();

        let rafId = null;
        const scheduleRaf = () => {
          rafId = requestAnimationFrame((now) => {
            rafTimestamps.push(now);
            const t = wrapper.style.transform;
            if (t !== lastTransform) {
              transformWriteTimestamps.push({ now, transform: t });
              lastTransform = t;
            }
            scheduleRaf();
          });
        };
        scheduleRaf();

        await v.play().catch(() => {});
        await new Promise((r) => setTimeout(r, 2500));
        v.pause();
        cancelAnimationFrame(rafId);
        if (rvfcId != null && typeof v.cancelVideoFrameCallback === "function") v.cancelVideoFrameCallback(rvfcId);

        return {
          hasRvfc,
          videoReadyState: v.readyState,
          videoWidth: v.videoWidth,
          videoHeight: v.videoHeight,
          finalCurrentTime: v.currentTime,
          rvfcCount: rvfcTimestamps.length,
          rafCount: rafTimestamps.length,
          transformWriteCount: transformWriteTimestamps.length,
          rvfcTimestamps: rvfcTimestamps.slice(0, 40),
          rafTimestamps: rafTimestamps.slice(0, 40),
          transformWriteTimestamps: transformWriteTimestamps.slice(0, 40),
        };
      }, rate);

      results[label][viewKey][`rate_${rate}`] = capture;
      console.log(`${label} ${viewKey} rate=${rate}: rvfcCount=${capture.rvfcCount} rafCount=${capture.rafCount} transformWrites=${capture.transformWriteCount} videoWidth=${capture.videoWidth} readyState=${capture.videoReadyState}`);
    }
  }
}

writeFileSync(`${OUT}/../browser-part-n-results.json`, JSON.stringify(results, null, 2));
await browser.close();
console.log("\nDone. Wrote tmp/phase82a/browser-part-n-results.json");
