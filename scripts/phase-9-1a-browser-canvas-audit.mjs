// Phase 9.1A Parts I/J/K/S -- real browser canvas instrumentation for
// skeleton bone draw calls. Monkeypatches CanvasRenderingContext2D.prototype
// (stroke, moveTo/lineTo call counting via a wrapped beginPath/stroke pair)
// BEFORE the app mounts, so every real skeleton bone `ctx.stroke()` call is
// captured with the canvas's presented state at that instant -- testing
// whether the app's OWN presentation clock (VideoOverlay's independent
// `presentedMediaTimeS`, distinct from OverlaySurface's Auto Follow clock,
// Phase 9.0A Section 12) advances far enough during real playback in this
// sandboxed browser to exercise the skeleton draw path at all.
//
// Read-only; no data mutated.
//
//   node scripts/phase-9-1a-browser-canvas-audit.mjs

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "tmp/phase91a/browser";
mkdirSync(OUT, { recursive: true });

const sessionId = "31fe352b-f00f-4a80-b20a-17c2ab08ec5a"; // vanni240
// Known dropout-interval boundary timestamps (source seconds), from the real
// reconstruction this phase produced (tmp/phase91a/vanni240-dropout-intervals.json).
const PROBE_TIMES = {
  beforeInterval2: 0.35, insideInterval2: 0.6, afterInterval2: 1.1,
  insideInterval3: 2.3, insideInterval4: 3.2,
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const consoleErrors = [];
page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
page.on("pageerror", (err) => consoleErrors.push(String(err)));

await page.addInitScript(() => {
  window.__boneStrokes = [];
  window.__lineToCalls = 0;
  const proto = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;
  if (!proto) return;
  const origLineTo = proto.lineTo;
  proto.lineTo = function (x, y) {
    window.__lineToCalls++;
    return origLineTo.apply(this, arguments);
  };
  const origStroke = proto.stroke;
  let strokeCount = 0;
  proto.stroke = function () {
    strokeCount++;
    if (strokeCount <= 20000) window.__boneStrokes.push({ t: performance.now(), lineWidth: this.lineWidth, strokeStyle: this.strokeStyle });
    return origStroke.apply(this, arguments);
  };
});

await page.goto(`${BASE}/login`);
await page.getByPlaceholder(/^email$/i).fill("commander@atreides.local");
await page.getByPlaceholder(/^password$/i).fill("ATREIDES-DEV-PRIME-2026");
await page.getByRole("button", { name: /^log in$/i }).click();
await page.waitForURL(/dashboard|athletes|sessions/, { timeout: 15000 });
console.log("Logged in.");

await page.goto(`${BASE}/sessions/${sessionId}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.waitForFunction(() => {
  const v = document.querySelector("video");
  return v && v.readyState >= 1;
}, { timeout: 15000 }).catch(() => {});

const results = {};

// Test 1: real, continuous 1x playback for 4.3s (the whole clip) -- see
// whether ANY skeleton stroke ever fires.
await page.evaluate(() => { window.__boneStrokes = []; window.__lineToCalls = 0; });
const playResult = await page.evaluate(async () => {
  const v = document.querySelector("video");
  if (!v) return { error: "no video" };
  v.playbackRate = 1;
  v.currentTime = 0;
  await v.play().catch(() => {});
  await new Promise((r) => setTimeout(r, 4500));
  v.pause();
  return { videoWidth: v.videoWidth, currentTime: v.currentTime, readyState: v.readyState };
});
const playStrokes = await page.evaluate(() => ({ boneStrokes: window.__boneStrokes.length, lineToCalls: window.__lineToCalls }));
results.continuousPlayback1x = { ...playResult, ...playStrokes };
console.log("Continuous 1x playback:", JSON.stringify(results.continuousPlayback1x));

// Test 2: pause + direct seek to each known dropout-interval probe time,
// checking whether landmark-driven canvas activity (lineTo calls, a proxy
// for skeleton bone segments) changes between "inside dropout" and
// "outside dropout" times when using a DIRECT SEEK (not live playback) --
// this is Part I's core comparison.
for (const [label, t] of Object.entries(PROBE_TIMES)) {
  await page.evaluate(() => { window.__boneStrokes = []; window.__lineToCalls = 0; });
  const seekResult = await page.evaluate(async (time) => {
    const v = document.querySelector("video");
    if (!v) return { error: "no video" };
    v.pause();
    v.currentTime = time;
    await new Promise((r) => setTimeout(r, 500));
    return { videoWidth: v.videoWidth, currentTime: v.currentTime, readyState: v.readyState };
  }, t);
  const seekStrokes = await page.evaluate(() => ({ boneStrokes: window.__boneStrokes.length, lineToCalls: window.__lineToCalls }));
  results[`seek_${label}`] = { requestedTimeS: t, ...seekResult, ...seekStrokes };
  console.log(`Seek ${label} @ t=${t}:`, JSON.stringify(results[`seek_${label}`]));
}

results.consoleErrors = consoleErrors;
console.log(`\nConsole errors: ${consoleErrors.length}`);
writeFileSync(`${OUT}/../browser-canvas-audit.json`, JSON.stringify(results, null, 2));
await browser.close();
console.log("Done. Wrote tmp/phase91a/browser-canvas-audit.json");
