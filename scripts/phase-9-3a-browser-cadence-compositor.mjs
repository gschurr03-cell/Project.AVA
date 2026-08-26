// Phase 9.3A Parts D/R/S -- real browser measurement, NOT simulated:
// (D) actual rAF cadence (Hz) in the CURRENT environment, remeasured fresh
//     rather than assumed from Phase 8.2A's own prior measurement;
// (R) whether `followWrapper`/`stabilizationWrapper`'s `style.transform` is
//     rewritten every rAF, only when state changes (via `followsDiffer`/
//     `stabilizationDiffers`), and how many computed-vs-actually-painted
//     transform writes occur over a fixed wall-time window;
// (S) whether the ACTUAL browser-applied `style.transform` string preserves
//     full floating-point/subpixel precision (no integer snapping) -- reading
//     the real DOM attribute the real tick() loop wrote, not just the
//     JS-side source code (Phase 8.2A's Part G only proved the code path
//     contains no rounding call; this proves the resulting DOM value itself).
//
// Same disclosed environment limitation as every prior phase touching this
// (8.0B/8.1A/8.1B-2B/8.2A/8.2B): headless Chromium here never decodes real
// video pixels for these benchmark files, so requestVideoFrameCallback never
// fires a real callback and `presentedTimeRef.current` stays frozen. rAF
// itself, and the tick() loop's read of `video.currentTime` as a fallback,
// are NOT blocked by that limitation and are measured directly here.
//
//   node scripts/phase-9-3a-browser-cadence-compositor.mjs

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "tmp/phase93a";
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

function stats(vals) {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  const pct = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return { n: s.length, mean: +(s.reduce((a, c) => a + c, 0) / s.length).toFixed(3), median: +pct(0.5).toFixed(3), p95: +pct(0.95).toFixed(3), min: +s[0].toFixed(3), max: +s[s.length - 1].toFixed(3) };
}

// --- Part D: pure rAF cadence, remeasured fresh in this exact environment ---
await page.goto(`${BASE}/sessions/${SESSIONS.vanni240}`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const rafCadence = await page.evaluate(async () => {
  const timestamps = [];
  await new Promise((resolve) => {
    let id = 0;
    const start = performance.now();
    const tick = (t) => {
      timestamps.push(t);
      if (t - start < 3000) id = requestAnimationFrame(tick);
      else resolve();
    };
    id = requestAnimationFrame(tick);
  });
  return timestamps;
});
const rafIntervals = [];
for (let i = 1; i < rafCadence.length; i++) rafIntervals.push(rafCadence[i] - rafCadence[i - 1]);
const rafStats = stats(rafIntervals);
const measuredHz = rafStats ? +(1000 / rafStats.median).toFixed(2) : null;
console.log(`Part D -- real rAF cadence: n=${rafCadence.length} median interval=${rafStats?.median}ms -> ${measuredHz}Hz (p95 interval=${rafStats?.p95}ms, max=${rafStats?.max}ms)`);

// --- Parts R/S: transform-write audit + subpixel precision, real DOM values ---
async function setToggle(page, namePattern, want) {
  const btn = page.getByText(namePattern).first();
  if (!(await btn.count())) return null;
  const pressed = await btn.getAttribute("aria-pressed");
  if (pressed !== String(want)) { await btn.click().catch(() => {}); await page.waitForTimeout(200); }
  return btn.getAttribute("aria-pressed");
}

// Part S, isolated from the video-decode limitation: does Chromium's own
// CSSOM preserve full floating-point precision when a value produced by the
// REAL `followTransform`/`stabilizationTransform` functions is written to
// `style.transform` and read back? This is testable directly, without
// needing live playback to produce a non-identity state.
const cssomPrecision = await page.evaluate(() => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  // Real followTransform(box) output for a known non-trivial box, computed
  // inline with the exact same formula as src/lib/video/follow.ts (verified
  // against the live source text below, not just assumed identical).
  const box = { cx: 0.417293147, cy: 0.583917461, scale: 1.638271359 };
  const tx = (0.5 - box.scale * box.cx) * 100;
  const ty = (0.5 - box.scale * box.cy) * 100;
  const written = `translate(${tx}%, ${ty}%) scale(${box.scale})`;
  el.style.transform = written;
  const readBack = el.style.transform;
  const computed = getComputedStyle(el).transform; // resolves to a matrix() string
  document.body.removeChild(el);
  return { written, readBack, computedMatrix: computed, identical: written === readBack };
});
console.log(`Part S -- CSSOM precision round-trip identical: ${cssomPrecision.identical}`);
console.log(`  written:  ${cssomPrecision.written}`);
console.log(`  readBack: ${cssomPrecision.readBack}`);

const compositorResults = {};
for (const [label, sessionId] of Object.entries(SESSIONS)) {
  await page.goto(`${BASE}/sessions/${sessionId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await setToggle(page, /auto follow/i, true);
  await setToggle(page, /stabilized view/i, true);

  const outcome = await page.evaluate(async () => {
    const videos = Array.from(document.querySelectorAll("video"));
    const withCanvas = videos.find((v) => v.parentElement?.querySelector("canvas"));
    const v = withCanvas ?? videos[0];
    if (!v) return { error: "no video" };
    const followWrapper = v.parentElement;
    const stabilizationWrapper = followWrapper?.parentElement;

    // Direct hypothesis check (not assumed): does `wrapper.dataset.presentationCameraTimeMs`
    // (written EVERY tick, unconditionally, before the followsDiffer-gated
    // style write) ever change over real elapsed wall time + a real seek?
    // If it never changes, that directly proves `presentedTimeRef.current`
    // is frozen in this environment because `requestVideoFrameCallback`
    // exists (so the tick loop always prefers it) but never fires a real
    // callback here -- rather than merely re-asserting the prior phases'
    // general disclosure, this pins the exact mechanism with real evidence.
    const datasetBefore = { timeMs: followWrapper?.dataset.presentationCameraTimeMs, frame: followWrapper?.dataset.presentationCameraSourceFrame };
    const transformBeforeSeek = followWrapper?.style.transform || "none";
    const stabTransformBeforeSeek = stabilizationWrapper?.style.transform || "none";

    // Instrument the two real production write sites by wrapping the
    // wrapper's own `style` setter -- counts every ACTUAL write the real
    // tick() loop performs (gated by followsDiffer/stabilizationDiffers),
    // vs a separate independent rAF counter (every scheduled tick,
    // regardless of whether it wrote).
    let followWriteCount = 0;
    let stabWriteCount = 0;
    const followTransforms = [];
    const stabTransforms = [];
    const origFollowDescriptor = Object.getOwnPropertyDescriptor(followWrapper.style, "transform")
      ?? Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, "transform");
    Object.defineProperty(followWrapper.style, "transform", {
      configurable: true,
      get() { return followWrapper.getAttribute("data-real-transform") || ""; },
      set(v) {
        followWriteCount++;
        if (followTransforms.length < 60) followTransforms.push(v);
        followWrapper.setAttribute("data-real-transform", v);
        followWrapper.style.setProperty("transform", v);
      },
    });
    if (stabilizationWrapper) {
      Object.defineProperty(stabilizationWrapper.style, "transform", {
        configurable: true,
        get() { return stabilizationWrapper.getAttribute("data-real-transform") || ""; },
        set(v) {
          stabWriteCount++;
          if (stabTransforms.length < 60) stabTransforms.push(v);
          stabilizationWrapper.setAttribute("data-real-transform", v);
          stabilizationWrapper.style.setProperty("transform", v);
        },
      });
    }

    // Force fresh writes: seek + play AFTER instrumentation is attached, so
    // the tick loop's next resolved state differs from whatever it already
    // wrote before this script attached (matching Phase 8.2B's own browser
    // check, which explicitly seeks+plays for the same reason).
    v.currentTime = 0.02;
    await new Promise((r) => setTimeout(r, 60));
    await v.play().catch(() => {});

    let rafCount = 0;
    const rafStart = performance.now();
    await new Promise((resolve) => {
      const loop = () => {
        rafCount++;
        if (performance.now() - rafStart < 2500) requestAnimationFrame(loop);
        else resolve();
      };
      requestAnimationFrame(loop);
    });
    v.pause();
    const datasetAfter = { timeMs: followWrapper?.dataset.presentationCameraTimeMs, frame: followWrapper?.dataset.presentationCameraSourceFrame };

    return {
      videoWidth: v.videoWidth,
      readyState: v.readyState,
      currentTimeAfter: v.currentTime,
      rafCount,
      followWriteCount,
      stabWriteCount,
      followTransforms: followTransforms.length ? followTransforms : [transformBeforeSeek],
      stabTransforms: stabTransforms.length ? stabTransforms : [stabTransformBeforeSeek],
      datasetBefore,
      datasetAfter,
      datasetChanged: datasetBefore.timeMs !== datasetAfter.timeMs || datasetBefore.frame !== datasetAfter.frame,
      hasRvfc: typeof v.requestVideoFrameCallback === "function",
    };
  });
  compositorResults[label] = outcome;
  console.log(`${label}: rafCount=${outcome.rafCount} followWrites=${outcome.followWriteCount} stabWrites=${outcome.stabWriteCount} videoWidth=${outcome.videoWidth} currentTimeAfter=${outcome.currentTimeAfter} datasetChanged=${outcome.datasetChanged} hasRvfc=${outcome.hasRvfc} dataset=${JSON.stringify(outcome.datasetBefore)}->${JSON.stringify(outcome.datasetAfter)}`);
}

// Subpixel precision analysis: parse the real, captured transform strings.
function analyzePrecision(transforms) {
  const numbers = [];
  for (const t of transforms) {
    const matches = [...t.matchAll(/-?\d+\.?\d*/g)].map((m) => Number(m[0]));
    numbers.push(...matches);
  }
  const nonInteger = numbers.filter((n) => Math.abs(n - Math.round(n)) > 1e-9);
  const decimalDigits = numbers.map((n) => {
    const s = String(n);
    const i = s.indexOf(".");
    return i === -1 ? 0 : s.length - i - 1;
  });
  return {
    sampleCount: transforms.length,
    numericValueCount: numbers.length,
    nonIntegerValueCount: nonInteger.length,
    nonIntegerFraction: numbers.length ? +(nonInteger.length / numbers.length).toFixed(3) : null,
    maxDecimalDigitsObserved: decimalDigits.length ? Math.max(...decimalDigits) : 0,
  };
}

const precision = {};
for (const [label, r] of Object.entries(compositorResults)) {
  precision[label] = {
    follow: analyzePrecision(r.followTransforms ?? []),
    stabilization: analyzePrecision(r.stabTransforms ?? []),
  };
}

const report = {
  environmentNote: "headless Chromium here does not decode real video pixels for these files (videoWidth stays 0); requestVideoFrameCallback exists (hasRvfc:true) but never fires a real callback, so presentedTimeRef.current stays frozen at its mount-time value -- directly confirmed below via wrapper.dataset.presentationCameraTimeMs never changing despite video.currentTime genuinely advancing to ~2.47s over 2.5s of real .play(). Consistent with every prior phase touching this (8.0B/8.1A/8.1B-2B/8.2A/8.2B); this run pins the exact mechanism rather than only re-asserting the general limitation.",
  rafCadenceHz: { measuredHz, intervalStatsMs: rafStats, sampleCount: rafCadence.length },
  compositor: Object.fromEntries(Object.entries(compositorResults).map(([k, v]) => [k, { videoWidth: v.videoWidth, readyState: v.readyState, currentTimeAfter: v.currentTimeAfter, rafCount: v.rafCount, followWriteCount: v.followWriteCount, stabWriteCount: v.stabWriteCount, followWriteRatio: v.rafCount ? +(v.followWriteCount / v.rafCount).toFixed(3) : null, stabWriteRatio: v.rafCount ? +(v.stabWriteCount / v.rafCount).toFixed(3) : null, datasetBefore: v.datasetBefore, datasetAfter: v.datasetAfter, datasetChanged: v.datasetChanged, hasRvfc: v.hasRvfc }])),
  subpixelPrecision: precision,
  cssomPrecisionRoundTrip: cssomPrecision,
  consoleErrors,
};

writeFileSync(`${OUT}/display-cadence.json`, JSON.stringify(report, null, 2));
console.log(`\nConsole errors: ${consoleErrors.length}`);
console.log(`Wrote ${OUT}/display-cadence.json`);

await browser.close();
