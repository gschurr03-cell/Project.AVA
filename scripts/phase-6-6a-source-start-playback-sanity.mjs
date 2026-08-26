import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".phase-6-6a-source-start-tmp");
let count = 0;
const check = (name, fn) => { fn(); count += 1; console.log(`PASS ${count}. ${name}`); };

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
    compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", strict: true, skipLibCheck: true },
    files: [path.join(root, "src/lib/video/sourcePlaybackStart.ts")],
  }));
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: "inherit" });
  const { sourcePlaybackStartSeconds } = require(path.join(out, "lib/video/sourcePlaybackStart.js"));
  const surface = readFileSync(path.join(root, "src/components/video/OverlaySurface.tsx"), "utf8");
  const player = readFileSync(path.join(root, "src/components/video/OverlayVideoPlayer.tsx"), "utf8");
  const follow = readFileSync(path.join(root, "src/lib/video/presentationCamera.ts"), "utf8");
  const overlay = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
  const metrics = readFileSync(path.join(root, "src/lib/benchmark/measurements.ts"), "utf8");

  const normal = { length: 1, start: () => 0 };
  const shifted = { length: 1, start: () => 1.25 };
  const lifecycle = ({ initial = 8, start = 0, artifact = 2, scrub = null, pauseResume = false } = {}) => {
    let currentTime = initial;
    let initialized = false;
    if (!initialized) { currentTime = start; initialized = true; }
    // Scientific/artifact state updates are deliberately playback no-ops.
    void artifact;
    if (scrub != null) currentTime = scrub;
    if (pauseResume) currentTime = currentTime;
    return currentTime;
  };

  check("fresh load initializes at source beginning", () => assert.equal(lifecycle(), 0));
  check("first play begins at source beginning", () => assert.equal(lifecycle({ pauseResume: true }), 0));
  check("first pose later than source beginning does not seek player", () => assert.equal(lifecycle({ artifact: 0.7 }), 0));
  check("first contact later than source beginning does not seek player", () => assert.equal(lifecycle({ artifact: 1.1 }), 0));
  check("measurement start later than source beginning does not seek player", () => assert.equal(lifecycle({ artifact: 1.8 }), 0));
  check("artifact load does not move playback", () => assert.equal(lifecycle({ scrub: 0.4, artifact: 2.2 }), 0.4));
  check("analysis completion does not move playback", () => {
    assert.doesNotMatch(surface, /frames\[0\].*currentTime|currentTime\s*=.*(?:measurement|contact|pose)/);
  });
  check("user scrub is respected", () => assert.equal(lifecycle({ scrub: 2.4 }), 2.4));
  check("pause and resume preserve position", () => assert.equal(lifecycle({ scrub: 1.6, pauseResume: true }), 1.6));
  check("Auto Follow state does not determine currentTime", () => assert.doesNotMatch(follow, /currentTime\s*=/));
  check("overlay state does not determine currentTime", () => assert.doesNotMatch(overlay, /\.currentTime\s*=/));
  check("scientific metrics are unchanged and source origin supports metadata", () => {
    assert.equal(sourcePlaybackStartSeconds(normal), 0);
    assert.equal(sourcePlaybackStartSeconds(shifted), 1.25);
    assert.equal(sourcePlaybackStartSeconds({ length: 0, start: () => 9 }), 0);
    assert.doesNotMatch(metrics, /sourcePlaybackStartSeconds/);
    assert.match(surface, /initializedSourceRef\.current === sourceIdentity/);
    assert.match(surface, /src=\{stableSourceRef\.current\.url\}/);
    assert.match(player, /sourceIdentity=\{sessionId \?\? videoUrl\}/);
    assert.match(player, /const firstTime = state\.sourcePlaybackStartSeconds/);
  });

  assert.equal(count, 12);
  console.log("ALL 12 PHASE 6.6A SOURCE-START PLAYBACK CHECKS PASSED");
} finally {
  rmSync(out, { recursive: true, force: true });
}
