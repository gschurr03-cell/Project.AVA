import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".phase-6-6b-part-b-tmp");
let count = 0;
const check = (name, fn) => { fn(); count += 1; console.log(`PASS ${count}. ${name}`); };
const candidate = (generation, mediaTimeS, expectedDisplayTimeMs, presentedFrames = 1) => ({
  generation, mediaTimeS, expectedDisplayTimeMs, presentedFrames, payload: { mediaTimeS },
});

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
    compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", strict: true, skipLibCheck: true },
    files: [
      path.join(root, "src/lib/video/overlayPresentationScheduler.ts"),
      path.join(root, "src/lib/video/overlayRenderClock.ts"),
    ],
  }));
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: "inherit" });
  const scheduler = require(path.join(out, "lib/video/overlayPresentationScheduler.js"));
  const clock = require(path.join(out, "lib/video/overlayRenderClock.js"));
  const overlaySource = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
  const measurementsSource = readFileSync(path.join(root, "src/lib/benchmark/measurements.ts"), "utf8");

  const frames = [{ time: 0, sourceFrameIndex: 0 }, { time: .25, sourceFrameIndex: 1 }, { time: .5, sourceFrameIndex: 2 }];
  check("rVFC mediaTime still selects the exact pose", () => assert.equal(clock.selectOverlayFrame(frames, .25, .25).frame.sourceFrameIndex, 1));

  let state = scheduler.createOverlayPresentationState();
  state = scheduler.enqueueOverlayPresentation(state, candidate(0, .25, 116, 2));
  check("a selected candidate is stored without early display", () => assert.equal(state.displayed, null));
  check("overlay N cannot replace visible N-1 before its boundary", () => assert.equal(scheduler.promoteOverlayPresentation(state, 115.999).promoted, null));
  let promotion = scheduler.promoteOverlayPresentation(state, 116);
  check("pending frame advances at its exact presentation boundary", () => assert.equal(promotion.promoted.mediaTimeS, .25));

  state = scheduler.createOverlayPresentationState();
  state = scheduler.enqueueOverlayPresentation(state, candidate(0, .25, 116, 2));
  state = scheduler.enqueueOverlayPresentation(state, candidate(0, .5, 132, 3), 116);
  check("multiple fast frames preserve the latest eligible frame and coalesce the future frame", () => {
    assert.equal(state.ready.mediaTimeS, .25);
    assert.equal(state.pending.mediaTimeS, .5);
    assert.equal(scheduler.promoteOverlayPresentation(state, 116).promoted.mediaTimeS, .25);
  });
  for (let index = 4; index <= 240; index += 1) state = scheduler.enqueueOverlayPresentation(state, candidate(0, index / 240, 200, index));
  check("240 fps candidates retain one pending token and no backlog", () => assert.equal(state.pending.presentedFrames, 240));

  promotion = scheduler.promoteOverlayPresentation(state, 200);
  check("pause can repaint the current promoted exact pose", () => assert.equal(promotion.state.displayed.mediaTimeS, 1));
  state = scheduler.invalidateOverlayPresentation(promotion.state);
  check("seek invalidates stale pending presentation", () => assert.equal(state.pending, null));
  const oldGenerationCandidate = candidate(0, 2, 300, 300);
  state = scheduler.enqueueOverlayPresentation(state, oldGenerationCandidate);
  check("source change rejects stale-generation callbacks", () => assert.equal(state.pending, null));
  state = scheduler.invalidateOverlayPresentation(state);
  check("playback-rate change advances the generation safely", () => assert.equal(state.generation, 2));

  for (const [rate, label] of [[.25, "0.25x"], [.5, "0.5x"], [1, "1x"]]) {
    let rateState = scheduler.createOverlayPresentationState();
    rateState = scheduler.enqueueOverlayPresentation(rateState, candidate(0, rate, 500, 1));
    check(`${label} promotion is metadata-bound, not rate-bound`, () => {
      assert.equal(scheduler.promoteOverlayPresentation(rateState, 499).promoted, null);
      assert.equal(scheduler.promoteOverlayPresentation(rateState, 500).promoted.mediaTimeS, rate);
    });
  }

  state = scheduler.createOverlayPresentationState();
  state = scheduler.enqueueOverlayPresentation(state, candidate(0, .5, 600, 4));
  check("resize rAF repaint cannot advance the pending timestamp", () => assert.equal(scheduler.promoteOverlayPresentation(state, 599).state.displayed, null));
  check("rAF cannot promote any future pending pose early", () => assert.equal(scheduler.promoteOverlayPresentation(state, -Infinity).promoted, null));
  check("currentTime/rAF fallback remains present", () => assert.match(overlaySource, /hasRvfc \? presentedMediaTimeS : video\.currentTime/));

  const artifact = { frames: structuredClone(frames) };
  const artifactBefore = JSON.stringify(artifact);
  clock.selectOverlayFrame(artifact.frames, .25, .25);
  check("scientific pose artifact remains unchanged", () => assert.equal(JSON.stringify(artifact), artifactBefore));
  check("scientific metric implementation remains outside presentation scheduling", () => {
    assert.doesNotMatch(measurementsSource, /overlayPresentationScheduler|expectedDisplayTime|requestVideoFrameCallback/);
    assert.match(overlaySource, /promoteOverlayPresentation/);
  });

  assert.equal(count, 18);
  console.log("ALL 18 PHASE 6.6B PART B PRESENTATION-SYNC CHECKS PASSED");
} finally {
  rmSync(out, { recursive: true, force: true });
}
