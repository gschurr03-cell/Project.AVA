import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".phase-6-1-overlay-fidelity-tmp");
const frame = (time, index) => ({ frame: index, time, landmarks: {} });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
    compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, strict: true, moduleResolution: "node" },
    files: [path.join(root, "src/lib/video/overlayRenderClock.ts"), path.join(root, "src/lib/video/coordinates.ts")],
  }));
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: "inherit" });
  const clock = require(path.join(out, "lib/video/overlayRenderClock.js"));
  const coordinates = require(path.join(out, "lib/video/coordinates.js"));

  const frames = [frame(0, 0), frame(1 / 60, 1), frame(2 / 60, 2)];
  assert.equal(clock.nativeOverlayFrameDuration(frames), 1 / 60);
  assert.equal(clock.selectOverlayFrame(frames, 1 / 60).index, 1);
  assert.equal(clock.selectOverlayFrame(frames, 1 / 120).index, 0, "midpoint tie must deterministically choose earlier evidence");
  assert.equal(clock.selectOverlayFrame(frames, 1 / 60 + 0.001).stale, false);
  assert.equal(clock.selectOverlayFrame(frames, 0.2).stale, true);
  assert.deepEqual(clock.selectOverlayFrame(frames, 0.021), clock.selectOverlayFrame(frames, 0.021));

  const rect = { x: 0, y: 0, width: 853.25, height: 479.953125 };
  const point = { x: 0.123456789, y: 0.876543211 };
  const first = coordinates.projectLandmark(point, rect, 1920, 1080);
  for (let index = 0; index < 1000; index += 1) {
    assert.deepEqual(coordinates.projectLandmark(point, rect, 1920, 1080), first);
  }
  assert.ok(Math.abs(first.x - point.x * rect.width) < 1e-12);
  assert.ok(Math.abs(first.y - point.y * rect.height) < 1e-12);

  const source = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
  assert.match(source, /requestVideoFrameCallback/);
  assert.match(source, /presentedMediaTimeS = promotion\.promoted\.mediaTimeS/);
  assert.match(source, /ctx\.setTransform\(dpr, 0, 0, dpr, 0, 0\)/);
  assert.doesNotMatch(source, /Math\.round\(p\.x|Math\.round\(ap\.x|Math\.round\(bp\.x/);
  console.log("ALL 13 PHASE 6.1 OVERLAY FIDELITY CHECKS PASSED");
} finally {
  rmSync(out, { recursive: true, force: true });
}
