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

  // --- MIN_SAFE_ANCHOR_TRANSFORM_CONFIDENCE (0.45) boundary regressions --------------
  // These were added after restoring the threshold from an unjustified 0.2 back to its
  // long-standing 0.45: they prove the fix is principled (the true boundary behaves
  // correctly on both sides), not merely that this file's original assertion passes.
  assert.equal(
    anchors.detectWorldBoundaryCrossing(samples, crossingBoundary, evidence(0, .44), 1280, 720, "left_to_right"),
    null, "confidence immediately below threshold (0.44) is unsafe",
  );
  assert.ok(
    anchors.detectWorldBoundaryCrossing(samples, crossingBoundary, evidence(0, .45), 1280, 720, "left_to_right"),
    "confidence exactly at threshold (0.45) is explicitly treated as safe (inclusive >=)",
  );
  const highConfidenceEvidence = (overrides) => ({
    cameraMotionModelVersion: "ava-background-affine-v1",
    dynamicCropVersion: "ava-mediapipe-roi-v1", athleteTrackingVersion: "ava-single-pose-continuity-v1",
    transforms: [transform(0, 0), { frame: 1, translationX: 0, translationY: 0, rotationDeg: 0, scale: 1,
      confidence: .95, supportingFeatureCount: 80, inlierRatio: .9, residualPx: 1, ...overrides }],
    athleteTrack: [], trackingLossRanges: [], unstableFrameRanges: [],
  });
  assert.equal(
    anchors.detectWorldBoundaryCrossing(samples, crossingBoundary, highConfidenceEvidence({ supportingFeatureCount: 10 }), 1280, 720, "left_to_right"),
    null, "high confidence (0.95) with insufficient features (10 < 24) remains unsafe",
  );
  assert.equal(
    anchors.detectWorldBoundaryCrossing(samples, crossingBoundary, highConfidenceEvidence({ residualPx: 3 }), 1280, 720, "left_to_right"),
    null, "high confidence (0.95) with excessive residual (3px > 2px) remains unsafe",
  );
  assert.equal(
    anchors.detectWorldBoundaryCrossing(samples, crossingBoundary, highConfidenceEvidence({ inlierRatio: .1 }), 1280, 720, "left_to_right"),
    null, "high confidence (0.95) with insufficient inlier ratio (0.1 < 0.2) remains unsafe",
  );

  // --- MAX_SAFE_ANCHOR_DEGRADED_FRAMES (6) hold-vs-loss boundary ---------------------
  // Frame 1 is the only reliable transform (translationX .02); every frame after it is
  // degraded (confidence .1) with a DIFFERENT translation (.05) that must never be
  // applied — a tolerated hold composes with the last reliable transform, never the
  // untrusted current one, so position must freeze at exactly the frame-1 result.
  const heldRun = (degradedCount) => ({
    cameraMotionModelVersion: "ava-background-affine-v1",
    dynamicCropVersion: "ava-mediapipe-roi-v1", athleteTrackingVersion: "ava-single-pose-continuity-v1",
    transforms: [
      transform(0, 0),
      { frame: 1, translationX: .02, translationY: 0, rotationDeg: 0, scale: 1,
        confidence: .95, supportingFeatureCount: 80, inlierRatio: .9, residualPx: 1 },
      ...Array.from({ length: degradedCount }, (_, i) => ({
        frame: i + 2, translationX: .05, translationY: 0, rotationDeg: 0, scale: 1,
        confidence: .1, supportingFeatureCount: 80, inlierRatio: .9, residualPx: 1,
      })),
    ],
    athleteTrack: [], trackingLossRanges: [], unstableFrameRanges: [],
  });
  const withinTolerance = anchors.propagateSourcePoint({ x: .5, y: .5 }, 0, 7, heldRun(6), 1280, 720);
  assert.equal(withinTolerance.safe, true, "6 consecutive degraded frames (== MAX_SAFE_ANCHOR_DEGRADED_FRAMES) stay non-fatal");
  assert.ok(Math.abs(withinTolerance.point.x - .52) < 1e-9,
    "a tolerated hold freezes at the last reliable transform's result and ignores the noisy transforms during the hold");
  assert.ok(withinTolerance.confidence <= .1 + 1e-9,
    "a tolerated hold still reports the true (low) confidence, so it reads as unsafe wherever confidence is compared to the threshold");
  const beyondTolerance = anchors.propagateSourcePoint({ x: .5, y: .5 }, 0, 8, heldRun(7), 1280, 720);
  assert.equal(beyondTolerance.safe, false, "7 consecutive degraded frames (> MAX_SAFE_ANCHOR_DEGRADED_FRAMES) become a fatal loss");

  console.log("zone anchor sanity: passed");
} finally {
  rmSync(out, { recursive: true, force: true });
}
