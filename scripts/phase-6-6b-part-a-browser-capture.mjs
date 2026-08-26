import { createReadStream, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { chromium, webkit } from "@playwright/test";

const args = process.argv.slice(2);
const value = (flag, fallback = null) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : fallback;
};
const baseUrl = value("--base", "http://127.0.0.1:3001");
const sessionId = value("--session");
const label = value("--label", "capture");
const mode = value("--mode", "live1");
const startS = Number(value("--start", "1"));
const endS = Number(value("--end", "1.5"));
const sourceFps = Number(value("--fps", "240"));
const outputDir = path.resolve(value("--out", "tmp/phase66b-part-a"));
const mediaFile = value("--media-file");
const autoFollow = args.includes("--auto-follow");
if (!sessionId) throw new Error("--session is required");
mkdirSync(outputDir, { recursive: true });

let mediaServer = null;
let mediaUrl = null;
if (mediaFile) {
  const resolvedMedia = path.resolve(mediaFile);
  const size = statSync(resolvedMedia).size;
  mediaServer = createServer((request, response) => {
    const match = /bytes=(\d+)-(\d*)/.exec(request.headers.range ?? "");
    const start = match ? Number(match[1]) : 0;
    const end = match?.[2] ? Number(match[2]) : size - 1;
    response.writeHead(match ? 206 : 200, {
      "Content-Type": "video/mp4",
      "Content-Length": end - start + 1,
      "Accept-Ranges": "bytes",
      ...(match ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    });
    createReadStream(resolvedMedia, { start, end }).pipe(response);
  });
  await new Promise((resolve) => mediaServer.listen(0, "127.0.0.1", resolve));
  mediaUrl = `http://127.0.0.1:${mediaServer.address().port}/benchmark.mp4`;
}

const channel = value("--channel");
const browserType = value("--browser") === "webkit" ? webkit : chromium;
const browser = await browserType.launch({ headless: true, ...(channel ? { channel } : {}) });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 2,
});
try {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("input[name=email]").first().fill("commander@atreides.local");
  await page.locator("input[name=password]").fill("ATREIDES-DEV-PRIME-2026");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL(/dashboard/, { timeout: 30_000 });
  await page.goto(`${baseUrl}/sessions/${sessionId}?avaPlaybackSyncDebug=1`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForFunction(() => Boolean(window.__AVA_PLAYBACK_SYNC_DEBUG__), null, {
    timeout: 30_000,
  });
  const overlayVideo = page.locator("video").last();
  await overlayVideo.waitFor({ state: "attached" });
  if (mediaUrl) {
    await overlayVideo.evaluate((video, source) => {
      video.src = source;
      video.load();
    }, mediaUrl);
  }
  await page.waitForFunction(
    () => {
      const videos = document.querySelectorAll("video");
      return videos.length > 0 && videos[videos.length - 1].readyState >= 2;
    },
    null,
    { timeout: 20_000 },
  );
  const seek = async (time) => {
    await overlayVideo.evaluate(
      (video, target) =>
        new Promise((resolve, reject) => {
          const timeout = window.setTimeout(
            () => reject(new Error(`seek timeout at ${target}`)),
            5000,
          );
          video.addEventListener(
            "seeked",
            () => {
              window.clearTimeout(timeout);
              requestAnimationFrame(() => requestAnimationFrame(resolve));
            },
            { once: true },
          );
          video.pause();
          video.currentTime = target;
        }),
      time,
    );
  };

  if (autoFollow) {
    const toggle = page.getByRole("button", { name: /Auto Follow/ }).last();
    await toggle.click();
    await page.waitForFunction(
      () => document.querySelectorAll('button[aria-pressed="true"]').length > 0,
    );
  }

  // Headless Chromium does not emit a paused-seek rVFC for this test media
  // until decode has started. Pre-roll only prepares the decoder; the trace is
  // cleared afterward, before either measured path begins.
  await seek(startS);
  await overlayVideo.evaluate((video) => video.play());
  await page.waitForFunction(
    (target) => {
      const records = window.__AVA_PLAYBACK_SYNC_DEBUG__.trace.records;
      return records.some(
        (record) =>
          record.kind === "rvfc_callback" &&
          record.phase === "active" &&
          record.mediaTimeS >= target - 0.002,
      );
    },
    startS,
    { timeout: 20_000 },
  );
  await overlayVideo.evaluate((video) => video.pause());
  await seek(startS);
  await page.evaluate(() => window.__AVA_PLAYBACK_SYNC_DEBUG__.clear());
  await page.evaluate(() => {
    window.__AVA_AUTO_FOLLOW_MOTION__ = [];
    window.__AVA_AUTO_FOLLOW_ACTIVE__ = true;
    const sample = () => {
      if (!window.__AVA_AUTO_FOLLOW_ACTIVE__) return;
      const videos = document.querySelectorAll("video");
      const video = videos[videos.length - 1];
      const wrapper = video?.parentElement;
      window.__AVA_AUTO_FOLLOW_MOTION__.push({
        performanceMs: performance.now(),
        mediaTimeS: video?.currentTime ?? null,
        cameraMediaTimeS: wrapper?.dataset.presentationCameraTimeMs
          ? Number(wrapper.dataset.presentationCameraTimeMs) / 1000
          : null,
        cameraSourceFrameIndex: wrapper?.dataset.presentationCameraSourceFrame
          ? Number(wrapper.dataset.presentationCameraSourceFrame)
          : null,
        cameraState: wrapper?.dataset.presentationCameraState ?? null,
        transform: wrapper?.style.transform ?? "",
        paused: video?.paused ?? true,
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  if (mode === "scrub") {
    const frameCount = Math.max(30, Math.round((endS - startS) * sourceFps));
    for (let index = 0; index < frameCount; index += 1) {
      await seek(startS + (index / Math.max(1, frameCount - 1)) * (endS - startS));
    }
  } else {
    const rate = mode === "live05" ? 0.5 : mode === "live025" ? 0.25 : 1;
    await overlayVideo.evaluate((video, playbackRate) => {
      video.playbackRate = playbackRate;
      return video.play();
    }, rate);
    await page.waitForFunction(
      (target) => {
        const videos = document.querySelectorAll("video");
        return videos[videos.length - 1].currentTime >= target || videos[videos.length - 1].ended;
      },
      endS,
      { timeout: Math.max(15_000, ((endS - startS) / rate) * 3000) },
    );
    await overlayVideo.evaluate((video) => video.pause());
  }

  await page.waitForTimeout(250);
  await page.evaluate(() => {
    window.__AVA_AUTO_FOLLOW_ACTIVE__ = false;
  });
  await overlayVideo.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outputDir, `${label}-${mode}.png`), fullPage: false });
  const trace = await page.evaluate(() => ({
    ...window.__AVA_PLAYBACK_SYNC_DEBUG__.trace,
    autoFollowMotion: window.__AVA_AUTO_FOLLOW_MOTION__ ?? [],
  }));
  writeFileSync(
    path.join(outputDir, `${label}-${mode}.json`),
    JSON.stringify(trace, null, 2) + "\n",
  );
  console.log(JSON.stringify({ label, mode, records: trace.records.length, outputDir }, null, 2));
} finally {
  await browser.close();
  if (mediaServer) await new Promise((resolve) => mediaServer.close(resolve));
}
