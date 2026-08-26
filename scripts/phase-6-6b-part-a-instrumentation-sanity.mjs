import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".phase-6-6b-part-a-instrumentation-tmp");
let count = 0;
const check = (name, fn) => { fn(); count += 1; console.log(`PASS ${count}. ${name}`); };

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
    compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", strict: true, skipLibCheck: true },
    files: [
      path.join(root, "src/lib/video/playbackSyncDebug.ts"),
      path.join(root, "src/lib/video/overlayRenderClock.ts"),
    ],
  }));
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: "inherit" });
  const debug = require(path.join(out, "lib/video/playbackSyncDebug.js"));
  const clock = require(path.join(out, "lib/video/overlayRenderClock.js"));
  const overlaySource = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
  const metricsSource = readFileSync(path.join(root, "src/lib/benchmark/measurements.ts"), "utf8");

  delete global.window;
  check("debug instrumentation is disabled by default", () => assert.equal(debug.playbackSyncDebugEnabled(), false));

  const frames = [{ time: 0, sourceFrameIndex: 0 }, { time: 1 / 60, sourceFrameIndex: 1 }];
  const before = clock.selectOverlayFrame(frames, 0.012, 1 / 60);
  global.window = { location: { search: "?avaPlaybackSyncDebug=1" } };
  const after = clock.selectOverlayFrame(frames, 0.012, 1 / 60);
  check("instrumentation does not alter pose selection", () => assert.deepEqual(after, before));
  check("instrumentation does not alter timestamps", () => assert.equal(after.frame.time, before.frame.time));

  const artifact = { frames: structuredClone(frames) };
  const artifactBefore = JSON.stringify(artifact);
  clock.selectOverlayFrame(artifact.frames, 0.012, 1 / 60);
  check("instrumentation does not alter scientific pose artifact", () => assert.equal(JSON.stringify(artifact), artifactBefore));
  check("instrumentation does not alter measurements", () => {
    assert.doesNotMatch(metricsSource, /playbackSyncDebug|avaPlaybackSyncDebug/);
    assert.match(overlaySource, /nearest_pose_to_rvfc_media_time/);
    assert.match(overlaySource, /stale_after_cleanup/);
    assert.match(overlaySource, /callbackToPaintEndMs/);
  });

  assert.equal(count, 5);
  console.log("ALL 5 PHASE 6.6B PART A INSTRUMENTATION CHECKS PASSED");
} finally {
  delete global.window;
  rmSync(out, { recursive: true, force: true });
}

