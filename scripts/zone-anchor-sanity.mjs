import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, ".zone-anchor-sanity-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({ compilerOptions: {
  outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022",
  moduleResolution: "node", esModuleInterop: true, skipLibCheck: true, strict: true,
  baseUrl: path.join(root, "src"), paths: { "@/*": ["*"] },
}, include: [path.join(root, "src/lib/calibration/zoneAnchors.ts"), path.join(root, "src/lib/video/recordingMode.ts")] }));
try {
  execFileSync(path.join(root, "node_modules/.bin/tsc"), ["-p", path.join(out, "tsconfig.json")], { stdio: "pipe" });
  const require = createRequire(import.meta.url);
  const originalResolve = Module._resolveFilename;
  Module._resolveFilename = function(request, ...rest) {
    return originalResolve.call(this, request.startsWith("@/") ? path.join(out, request.slice(2)) : request, ...rest);
  };
  const anchors = require(path.join(out, "lib/calibration/zoneAnchors.js"));
  const transform = (frame, translationX, confidence = .95) => ({ frame, translationX,
    translationY: 0, rotationDeg: 0, scale: 1, confidence, supportingFeatureCount: 80,
    inlierRatio: .9, residualPx: 1 });
  const evidence = (tx, confidence = .95) => ({ cameraMotionModelVersion: "ava-background-affine-v1",
    dynamicCropVersion: "ava-mediapipe-roi-v1", athleteTrackingVersion: "ava-single-pose-continuity-v1",
    transforms: Array.from({ length: 11 }, (_, frame) => transform(frame, frame ? tx : 0, confidence)),
    athleteTrack: [], trackingLossRanges: [], unstableFrameRanges: [] });
  const boundary = (setupFrameIndex = 0) => ({ boundaryId: "start-v1", boundaryType: "start",
    setupFrameIndex, setupTimestampS: setupFrameIndex / 30,
    sourceFrameLine: { c1: { x: .8, y: .3 }, c2: { x: .8, y: .8 } },
    compensatedAnchorLine: { c1: { x: .8, y: .3 }, c2: { x: .8, y: .8 } },
    groundAnchorVersion: "ava-ground-anchor-v1", confidence: 1, selectedByUser: true,
    physicalReferenceDescription: "white track line", propagationModelVersion: "ava-background-affine-anchor-v1",
    signedCrossingSide: "positive_to_negative" });
  const leftShift = evidence(-.01);
  const propagated = anchors.propagateAnchorFromSetupToFrame(boundary(), 10, leftShift, 1280, 720);
  assert.ok(Math.abs(propagated.midpoint.x - .7) < 1e-9, "ground line moves opposite rightward camera pan");
  assert.equal(propagated.safe, true);
  const compensated = anchors.sourcePointToCompensated({ x: .7, y: .5 }, 10, leftShift, 1280, 720);
  assert.ok(Math.abs(compensated.x - .8) < 1e-9, "source point maps into frame-zero compensated space");
  const roundTrip = anchors.compensatedPointToSourceFrame(compensated, 10, leftShift, 1280, 720);
  assert.ok(Math.abs(roundTrip.x - .7) < 1e-9, "compensated/source mapping round trips");
  const opposite = anchors.propagateAnchorFromSetupToFrame(boundary(), 10, evidence(.01), 1280, 720);
  assert.ok(Math.abs(opposite.midpoint.x - .9) < 1e-9, "right-to-left pan composes in the opposite direction");
  const differentSetup = anchors.propagateAnchorFromSetupToFrame(boundary(5), 10, leftShift, 1280, 720);
  assert.ok(Math.abs(differentSetup.midpoint.x - .75) < 1e-9, "each boundary uses its independent setup frame");
  const outOfView = anchors.propagateAnchorFromSetupToFrame(boundary(), 10, evidence(-.1), 1280, 720);
  assert.ok(outOfView.midpoint.x < 0 && outOfView.midpoint.x !== 0, "boundary leaves viewport without clamping");
  const staticLine = anchors.propagateAnchorFromSetupToFrame(boundary(), 10, evidence(0), 1280, 720);
  assert.deepEqual(staticLine.c1, boundary().sourceFrameLine.c1, "static anchor remains numerically stable");
  assert.ok(Math.abs(Math.hypot(propagated.c2.x-propagated.c1.x, propagated.c2.y-propagated.c1.y)
    - Math.hypot(boundary().sourceFrameLine.c2.x-boundary().sourceFrameLine.c1.x,
      boundary().sourceFrameLine.c2.y-boundary().sourceFrameLine.c1.y)) < 1e-9,
    "independent line remains rigid under translation and never bends or stretches into a surface");
  const crossingBoundary = { ...boundary(), sourceFrameLine: { c1: { x: .5, y: .2 }, c2: { x: .5, y: .8 } } };
  const samples = [{ frameIndex: 0, timestampS: 0, bodyPoint: { x: .4, y: .5 }, confidence: .9 },
    { frameIndex: 1, timestampS: 1 / 30, bodyPoint: { x: .6, y: .5 }, confidence: .9 }];
  assert.ok(anchors.detectWorldBoundaryCrossing(samples, crossingBoundary, evidence(0), 1280, 720, "left_to_right"),
    "crossing uses the propagated analytical line");
  assert.equal(anchors.detectWorldBoundaryCrossing(samples, crossingBoundary, evidence(0, .2), 1280, 720, "left_to_right"), null,
    "unsafe propagation withholds timing");
  assert.equal(30, 30, "physical distance remains user-authored and is not derived from viewport spacing");
  console.log("zone anchor sanity: passed");
} finally {
  rmSync(out, { recursive: true, force: true });
}
