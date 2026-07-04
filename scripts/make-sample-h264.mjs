// One-off: produce the committed, browser-universal H.264 dev-seed video.
//
//   npm run sample:transcode
//
// The local source samples/videos/test.mp4 is HEVC, which some Chrome builds
// cannot decode. This writes an H.264 (High profile, yuv420p, +faststart) copy
// to the committed seed fixtures at samples/seed/demo-sprint.mp4, so the seeded
// demo video plays reliably everywhere and the seed needs no ffmpeg at runtime.
// Re-run this only if the source clip changes; resolution is preserved, so the
// bundled pose artifact stays aligned.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import ffmpegPath from "ffmpeg-static";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "samples/videos/test.mp4");
const out = path.join(root, "samples/seed/demo-sprint.mp4");

if (!existsSync(src)) {
  console.error(`[transcode] missing source: ${path.relative(root, src)}`);
  process.exit(1);
}
if (!ffmpegPath) {
  console.error("[transcode] ffmpeg-static binary not found (npm install -D ffmpeg-static)");
  process.exit(1);
}

console.log("[transcode] samples/videos/test.mp4 (HEVC) → samples/seed/demo-sprint.mp4 (H.264, yuv420p, +faststart)…");
execFileSync(
  ffmpegPath,
  [
    "-y",
    "-i", src,
    "-c:v", "libx264",
    "-profile:v", "high",
    "-pix_fmt", "yuv420p", // required for broad browser decode
    "-crf", "23",
    "-preset", "medium",
    "-an", // the clip has no meaningful audio; drop it
    "-movflags", "+faststart", // move moov atom up front for streaming
    out,
  ],
  { cwd: root, stdio: ["ignore", "inherit", "inherit"] },
);
console.log(`[transcode] wrote ${path.relative(root, out)}`);
