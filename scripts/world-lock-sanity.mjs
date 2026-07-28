import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = process.cwd();
const out = path.join(root, ".world-lock-sanity-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const transform = (frame, translationX = 0, translationY = 0, scale = 1, confidence = 0.9) => ({
  frame, translationX, translationY, rotationDeg: 0, scale, confidence,
  supportingFeatureCount: 80, inlierRatio: 0.9, residualPx: 0.5,
});
const evidence = (transforms) => ({
  cameraMotionModelVersion: "ava-background-affine-v1",
  dynamicCropVersion: "ava-mediapipe-roi-v1",
  athleteTrackingVersion: "ava-single-pose-continuity-v1",
  transforms,
  athleteTrack: [],
  trackingLossRanges: [],
  unstableFrameRanges: [],
});

try {
  execFileSync("npx", [
    "tsc",
    "src/lib/video/worldProjection.ts",
    "src/lib/video/coordinates.ts",
    "--outDir", out,
    "--rootDir", "src/lib",
    "--module", "commonjs",
    "--target", "es2022",
    "--skipLibCheck",
    "--esModuleInterop",
    "--strict",
  ], { cwd: root, stdio: "inherit" });
  const world = require(path.join(out, "video/worldProjection.js"));
  const coordinates = require(path.join(out, "video/coordinates.js"));

  const pan = evidence([transform(0), transform(1, 0.1), transform(2, 0.1)]);
  const canonical = world.sourcePointToCanonicalWorld({ x: 0.7, y: 0.8 }, 2, pan, 1000, 500);
  assert.ok(Math.abs(canonical.x - 0.5) < 1e-12, "translation inverse-projects to reference");
  assert.deepEqual(world.canonicalWorldToSourceFrame(canonical, 2, pan, 1000, 500).point, { x: 0.7, y: 0.8 });

  const zoom = evidence([transform(0), transform(1, 0, 0, 1.1)]);
  const zoomWorld = world.sourcePointToCanonicalWorld({ x: 0.55, y: 0.55 }, 1, zoom, 1000, 1000);
  assert.deepEqual(world.canonicalWorldToSourceFrame(zoomWorld, 1, zoom, 1000, 1000).point, { x: 0.55, y: 0.55 });

  const homography = evidence([
    transform(0),
    { ...transform(1, 0.1), transformType: "homography", homography: [1, 0, 100, 0, 1, 0, 0, 0, 1] },
  ]);
  const homographyWorld = world.sourcePointToCanonicalWorld({ x: 0.6, y: 0.5 }, 1, homography, 1000, 500);
  assert.ok(Math.abs(homographyWorld.x - 0.5) < 1e-12);
  assert.deepEqual(world.canonicalWorldToSourceFrame(homographyWorld, 1, homography, 1000, 500).point, { x: 0.6, y: 0.5 });

  const start = world.sourceLineToCanonicalWorld({ x: 0.2, y: 0.7 }, { x: 0.2, y: 0.9 }, 0, "start", pan, 1000, 500);
  const finish = world.sourceLineToCanonicalWorld({ x: 0.8, y: 0.7 }, { x: 0.8, y: 0.9 }, 0, "finish", pan, 1000, 500);
  assert.equal(world.projectCanonicalWorldLine(start, 2, pan, 1000, 500).identity, "start");
  assert.equal(world.projectCanonicalWorldLine(finish, 2, pan, 1000, 500).identity, "finish");
  assert.ok(Math.abs((finish.c1.x - start.c1.x) - 0.6) < 1e-12, "canonical gate separation is immutable");

  const athleteMoved = { x: 0.95, y: 0.3 };
  assert.notDeepEqual(world.canonicalWorldToSourceFrame(canonical, 1, pan, 1000, 500).point, athleteMoved);

  const before = structuredClone(canonical);
  coordinates.projectLandmark(canonical, { x: 20, y: 10, width: 500, height: 250 }, 1000, 500);
  assert.deepEqual(canonical, before, "viewport projection cannot mutate canonical geometry");
  assert.deepEqual(
    world.canonicalWorldToSourceFrame(canonical, 2, pan, 1000, 500),
    world.canonicalWorldToSourceFrame(canonical, 2, pan, 1000, 500),
    "same frame rerenders deterministically",
  );
  world.canonicalWorldToSourceFrame(canonical, 0, pan, 1000, 500);
  world.canonicalWorldToSourceFrame(canonical, 2, pan, 1000, 500);
  assert.deepEqual(canonical, before, "forward/back seeking introduces no drift");
  coordinates.projectLandmark(canonical, { x: 0, y: 0, width: 320, height: 180 });
  coordinates.projectLandmark(canonical, { x: 0, y: 0, width: 1280, height: 720 });
  assert.deepEqual(canonical, before, "browser resize cannot mutate anchors");

  const clicked = { x: 0.7, y: 0.8 };
  const inverse = world.sourcePointToCanonicalWorld(clicked, 2, pan, 1000, 500);
  assert.deepEqual(world.canonicalWorldToSourceFrame(inverse, 2, pan, 1000, 500).point, clicked);

  const low = evidence([transform(0), transform(1, 0.1, 0, 1, 0.1)]);
  assert.equal(world.sourcePointToCanonicalWorld({ x: 0.5, y: 0.5 }, 1, low, 1000, 500).projectable, false);

  const overlay = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
  assert.doesNotMatch(overlay, /estimateCameraMotion\(frames\)/);
  assert.match(overlay, /sourcePointToCanonicalWorld/);
  assert.match(overlay, /canonicalWorldToSourceFrame/);
  console.log("world lock sanity: passed");
} finally {
  rmSync(out, { recursive: true, force: true });
}
