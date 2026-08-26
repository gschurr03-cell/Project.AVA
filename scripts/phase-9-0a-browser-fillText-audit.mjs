// Phase 9.0A Part J/K/M -- real browser canvas instrumentation. Monkeypatches
// CanvasRenderingContext2D.prototype.fillText BEFORE the app mounts, so every
// real text string the production VideoOverlay canvas draws (step numbers,
// meter labels, everything) is captured with its exact (x, y) position and
// the canvas's own width/height -- proving, from the REAL running app (not a
// static read of the source), whether step-number text calls actually occur
// and where they land on screen. Does not require real video pixel decode
// (canvas drawing executes independently of video decode, per every prior
// phase's own finding that "the canvas/gate/frame-counter state was correct
// throughout" even when video pixels never painted).
//
// Read-only; no data mutated.
//
//   node scripts/phase-9-0a-browser-fillText-audit.mjs

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "tmp/phase90a/browser";
mkdirSync(OUT, { recursive: true });

const SESSIONS = {
  vanni60: "3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d",
  vanni120: "160a86a2-c0db-4e7d-9fbe-82aedd6d3eff",
  vanni240: "31fe352b-f00f-4a80-b20a-17c2ab08ec5a",
  gav: "e04a7983-7406-4a00-bb89-8ada7b10bf9f",
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const consoleErrors = [];
page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
page.on("pageerror", (err) => consoleErrors.push(String(err)));

// Install the fillText interceptor BEFORE any app script runs, via an
// init script (applies to every new document/navigation in this context).
await page.addInitScript(() => {
  window.__fillTextCalls = [];
  const proto = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;
  if (!proto) return;
  const orig = proto.fillText;
  proto.fillText = function (text, x, y, maxWidth) {
    try {
      window.__fillTextCalls.push({
        text, x, y,
        font: this.font, fillStyle: this.fillStyle,
        canvasWidth: this.canvas ? this.canvas.width : null,
        canvasHeight: this.canvas ? this.canvas.height : null,
        t: performance.now(),
      });
      if (window.__fillTextCalls.length > 20000) window.__fillTextCalls.splice(0, 10000);
    } catch { /* never let instrumentation break rendering */ }
    return orig.apply(this, arguments);
  };
});

await page.goto(`${BASE}/login`);
await page.getByPlaceholder(/^email$/i).fill("commander@atreides.local");
await page.getByPlaceholder(/^password$/i).fill("ATREIDES-DEV-PRIME-2026");
await page.getByRole("button", { name: /^log in$/i }).click();
await page.waitForURL(/dashboard|athletes|sessions/, { timeout: 15000 });
console.log("Logged in.");

const results = {};

for (const [label, sessionId] of Object.entries(SESSIONS)) {
  await page.goto(`${BASE}/sessions/${sessionId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && v.readyState >= 1;
  }, { timeout: 15000 }).catch(() => {});

  // Confirm the Layers panel's checkbox states for Contacts / Step Numbers /
  // Step Lengths as actually rendered right now (Part L: control-state audit).
  const toggleState = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll("label"));
    const stateFor = (pattern) => {
      const label = labels.find((l) => pattern.test(l.textContent || ""));
      const input = label?.querySelector('input[type="checkbox"]');
      return input ? { checked: input.checked, disabled: input.disabled, text: label.textContent?.trim() } : null;
    };
    return {
      contacts: stateFor(/^Contact Events/i) ?? stateFor(/Contact/i),
      stepNumbers: stateFor(/^Step Numbers/i),
      skeleton: stateFor(/^Skeleton/i),
    };
  });

  // Open the Layers panel if collapsed, so checkbox state is queryable/stable.
  const layersButton = page.getByText(/Layers/i).first();
  if (await layersButton.count()) {
    const pressed = await layersButton.getAttribute("aria-pressed");
    if (pressed === "false") { await layersButton.click().catch(() => {}); await page.waitForTimeout(200); }
  }

  // Clear any calls accumulated so far, then let the rAF/canvas loop run for a
  // few real animation frames at a fixed, known currentTime (avoids relying on
  // real video decode -- the canvas draw loop runs independent of it).
  await page.evaluate(() => { window.__fillTextCalls = []; });
  const probeResult = await page.evaluate(async () => {
    const v = document.querySelector("video");
    if (v) { v.pause(); v.currentTime = Math.min(0.6, v.duration || 0.6); }
    await new Promise((r) => setTimeout(r, 700)); // let several rAF ticks paint
    return { videoWidth: v?.videoWidth ?? null, readyState: v?.readyState ?? null, currentTime: v?.currentTime ?? null };
  });

  const calls = await page.evaluate(() => window.__fillTextCalls.slice(-4000));
  // Classify: a "step number" text is a bare small integer (1-2 digits, no
  // decimal point, no unit suffix) drawn in the step-label font size; a
  // "meter label" ends in " m"; anything else is unrelated overlay text.
  const stepNumberCalls = calls.filter((c) => /^\d{1,3}$/.test(String(c.text).trim()));
  const meterLabelCalls = calls.filter((c) => /\d+\.\d{2} m$/.test(String(c.text).trim()));

  results[label] = {
    toggleState,
    probeResult,
    totalFillTextCalls: calls.length,
    stepNumberCallCount: stepNumberCalls.length,
    meterLabelCallCount: meterLabelCalls.length,
    stepNumberSample: stepNumberCalls.slice(0, 15),
    meterLabelSample: meterLabelCalls.slice(0, 15),
    allDistinctTexts: [...new Set(calls.map((c) => String(c.text)))].slice(0, 60),
  };
  console.log(`${label}: fillText calls=${calls.length} stepNumberCalls=${stepNumberCalls.length} meterLabelCalls=${meterLabelCalls.length} contactsChecked=${toggleState.contacts?.checked} stepNumbersChecked=${toggleState.stepNumbers?.checked} videoWidth=${probeResult.videoWidth}`);
}

results.consoleErrors = consoleErrors;
writeFileSync(`${OUT}/../fillText-audit.json`, JSON.stringify(results, null, 2));
await browser.close();
console.log(`\nConsole errors: ${consoleErrors.length}`);
console.log("Done. Wrote tmp/phase90a/fillText-audit.json");
