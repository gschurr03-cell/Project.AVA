import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, ".world-anchor-sanity-tmp");
const require = createRequire(import.meta.url);
let ok = true;
const check = (label, condition) => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) ok = false;
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  execFileSync("npx", [
    "tsc",
    "src/lib/video/worldAnchor.ts", "src/lib/video/worldProjection.ts", "src/lib/video/coordinates.ts",
    "--outDir", out, "--rootDir", "src/lib", "--module", "commonjs", "--target", "es2022",
    "--skipLibCheck", "--esModuleInterop", "--strict",
  ], { cwd: root, stdio: "inherit" });
  const worldAnchor = require(path.join(out, "video/worldAnchor.js"));
  const world = require(path.join(out, "video/worldProjection.js"));
  const coordinates = require(path.join(out, "video/coordinates.js"));

  const WIDTH = 1000, HEIGHT = 500;
  const transform = (frame, translationX = 0, confidence = 0.9) => ({
    frame, translationX, translationY: 0, rotationDeg: 0, scale: 1, confidence,
    supportingFeatureCount: 80, inlierRatio: 0.9, residualPx: 0.5,
  });
  // A steady leftward-panning camera: each frame the background shifts by -0.08
  // (normalized), i.e. a world point drifts steadily toward and past the left edge
  // as playback advances — a real, deterministic camera path, not per-frame chaining
  // of rendered coordinates (each frame's transform is independent, evidence-derived).
  const panEvidence = (n, dx = -0.08) => ({
    cameraMotionModelVersion: "ava-background-affine-v1",
    dynamicCropVersion: "ava-mediapipe-roi-v1",
    athleteTrackingVersion: "ava-single-pose-continuity-v1",
    transforms: Array.from({ length: n + 1 }, (_, frame) => transform(frame, frame ? dx : 0)),
    athleteTrack: [], trackingLossRanges: [], unstableFrameRanges: [],
  });
  const displayRect = { x: 0, y: 0, width: 1100, height: 618.75 };

  // --- isSourcePointVisible: purely geometric, no clamping ---
  check("a point inside [0,1] is visible", worldAnchor.isSourcePointVisible({ x: 0.5, y: 0.5 }));
  check("a point at exactly the boundary is visible", worldAnchor.isSourcePointVisible({ x: 0, y: 1 }));
  check("a point past the left edge is NOT visible", !worldAnchor.isSourcePointVisible({ x: -0.01, y: 0.5 }));
  check("a point past the right edge is NOT visible", !worldAnchor.isSourcePointVisible({ x: 1.2, y: 0.5 }));

  // --- Known camera pan: a world point starts visible, drifts left, crosses the
  // edge, becomes offscreen, and stays undrawn — with the underlying projected
  // SOURCE coordinate continuing mathematically past the boundary (proving it is
  // computed fresh from the immutable reference point every frame, never clamped).
  const evidence = panEvidence(12);
  const originalPoint = { x: 0.5, y: 0.5 };
  const worldPoint = world.sourcePointToCanonicalWorld(originalPoint, 0, evidence, WIDTH, HEIGHT);
  const frameResults = [];
  for (let f = 0; f <= 12; f += 1) {
    frameResults.push(worldAnchor.projectWorldAnchorToFrame(worldPoint, f, evidence, WIDTH, HEIGHT, displayRect));
  }
  check("frame 0 (reference frame): visible, x == 0.5 exactly",
    frameResults[0].visible && Math.abs(frameResults[0].sourcePoint.x - 0.5) < 1e-9);
  check("by frame 6 (0.5 - 6*0.08 = 0.02): still (barely) visible",
    frameResults[6].visible && Math.abs(frameResults[6].sourcePoint.x - 0.02) < 1e-9);
  check("by frame 7 (0.5 - 7*0.08 = -0.06): offscreen, NOT drawn",
    !frameResults[7].visible);
  check("the offscreen source coordinate is the real negative value, not clamped to 0",
    Math.abs(frameResults[7].sourcePoint.x - (-0.06)) < 1e-9);
  check("frame 12 (0.5 - 12*0.08 = -0.46): still offscreen, coordinate keeps going, never clamped",
    !frameResults[12].visible && Math.abs(frameResults[12].sourcePoint.x - (-0.46)) < 1e-9);
  check("frames 7..12 are ALL undrawn (no re-entry, no clamping back into view)",
    frameResults.slice(7).every((r) => !r.visible));
  check("returning to the original frame (0) restores the exact original location",
    Math.abs(frameResults[0].sourcePoint.x - originalPoint.x) < 1e-9
    && Math.abs(frameResults[0].sourcePoint.y - originalPoint.y) < 1e-9);

  // --- Inverse case: a point that starts OFFSCREEN (to the right, out of the
  // reference frame) and pans INTO view as the (leftward-panning) camera advances.
  const enteringPoint = { x: 1.3, y: 0.4 }; // off the right edge at the reference frame
  const enteringWorld = world.sourcePointToCanonicalWorld(enteringPoint, 0, evidence, WIDTH, HEIGHT);
  const enterAt0 = worldAnchor.projectWorldAnchorToFrame(enteringWorld, 0, evidence, WIDTH, HEIGHT, displayRect);
  const enterAt10 = worldAnchor.projectWorldAnchorToFrame(enteringWorld, 10, evidence, WIDTH, HEIGHT, displayRect); // 1.3-10*0.08=0.5
  check("a point starts offscreen (past the right edge) and is not drawn",
    !enterAt0.visible && Math.abs(enterAt0.sourcePoint.x - 1.3) < 1e-9);
  check("the same point later pans into view and IS drawn, at the correct location",
    enterAt10.visible && Math.abs(enterAt10.sourcePoint.x - 0.5) < 1e-9);

  // --- Gate test: two endpoints, both leave the frame together; backward scrub
  // restores them exactly.
  const gateLine = world.sourceLineToCanonicalWorld(
    { x: 0.45, y: 0.3 }, { x: 0.55, y: 0.3 }, 0, "start", evidence, WIDTH, HEIGHT,
  );
  const gateAt0 = world.projectCanonicalWorldLine(gateLine, 0, evidence, WIDTH, HEIGHT);
  const gateAt7 = world.projectCanonicalWorldLine(gateLine, 7, evidence, WIDTH, HEIGHT); // both endpoints < 0
  const gateAtRestore = world.projectCanonicalWorldLine(gateLine, 0, evidence, WIDTH, HEIGHT);
  check("gate starts fully visible", worldAnchor.isSourcePointVisible(gateAt0.c1) && worldAnchor.isSourcePointVisible(gateAt0.c2));
  check("after enough pan, BOTH gate endpoints are offscreen (no partial fallback)",
    !worldAnchor.isSourcePointVisible(gateAt7.c1) && !worldAnchor.isSourcePointVisible(gateAt7.c2));
  check("backward scrub restores the gate to its exact original endpoints",
    JSON.stringify(gateAtRestore.c1) === JSON.stringify(gateAt0.c1)
    && JSON.stringify(gateAtRestore.c2) === JSON.stringify(gateAt0.c2));

  // --- Step-history test: three contacts at different world (reference-frame)
  // positions and different anchor frames. As the camera pans, earlier contacts
  // must leave frame while later/nearby ones remain — the viewport must never
  // retain all three simultaneously once the pan is large enough.
  const contacts = [
    world.sourcePointToCanonicalWorld({ x: 0.1, y: 0.6 }, 0, evidence, WIDTH, HEIGHT),
    world.sourcePointToCanonicalWorld({ x: 0.5, y: 0.6 }, 4, evidence, WIDTH, HEIGHT),
    world.sourcePointToCanonicalWorld({ x: 0.9, y: 0.6 }, 8, evidence, WIDTH, HEIGHT),
  ];
  const visibilityAtFrame = (f) => contacts.map((c) =>
    worldAnchor.projectWorldAnchorToFrame(c, f, evidence, WIDTH, HEIGHT, displayRect).visible);
  check("at frame 12, not all three historical contacts remain visible simultaneously",
    visibilityAtFrame(12).filter(Boolean).length < 3);
  check("at frame 0, the earliest contact (created here) is visible",
    visibilityAtFrame(0)[0] === true);

  // --- Athlete-separation: projectWorldAnchorToFrame takes no athlete-position
  // input at all — the same world point + target frame always yields the same
  // projection, regardless of anything about the athlete's current position.
  const a1 = worldAnchor.projectWorldAnchorToFrame(worldPoint, 3, evidence, WIDTH, HEIGHT, displayRect);
  const a2 = worldAnchor.projectWorldAnchorToFrame(worldPoint, 3, evidence, WIDTH, HEIGHT, displayRect);
  check("repeated projection at the same frame is byte-identical (no athlete/session state leaks in)",
    JSON.stringify(a1) === JSON.stringify(a2));

  // --- Determinism: forward vs backward access to the same frame must match.
  const forward = [0, 1, 2, 3, 4, 5, 6].map((f) => worldAnchor.projectWorldAnchorToFrame(worldPoint, f, evidence, WIDTH, HEIGHT, displayRect));
  const backward = [6, 5, 4, 3, 2, 1, 0].map((f) => worldAnchor.projectWorldAnchorToFrame(worldPoint, f, evidence, WIDTH, HEIGHT, displayRect)).reverse();
  check("forward and backward frame access produce identical projections",
    JSON.stringify(forward) === JSON.stringify(backward));

  // --- Unsafe transform chain: visible geometrically, but not safe -> callers must
  // not draw it (checked at the VideoOverlay call site; here we prove the flag).
  const unsafeEvidence = panEvidence(3, -0.001);
  unsafeEvidence.transforms[1].confidence = 0.01;
  unsafeEvidence.transforms[2].confidence = 0.01;
  unsafeEvidence.transforms[3].confidence = 0.01;
  const unsafeWorld = world.sourcePointToCanonicalWorld({ x: 0.5, y: 0.5 }, 0, unsafeEvidence, WIDTH, HEIGHT);
  // A run this short (3 frames) is within the tolerated hold window, so it stays
  // geometrically frozen/visible but the chain is flagged unsafe once genuinely lost;
  // extend it past the tolerance to force safe:false deterministically.
  const longUnsafe = panEvidence(10, -0.001);
  for (let f = 1; f <= 10; f += 1) longUnsafe.transforms[f].confidence = 0.01;
  const longUnsafeWorld = world.sourcePointToCanonicalWorld({ x: 0.5, y: 0.5 }, 0, longUnsafe, WIDTH, HEIGHT);
  const unsafeResult = worldAnchor.projectWorldAnchorToFrame(longUnsafeWorld, 10, longUnsafe, WIDTH, HEIGHT, displayRect);
  check("a genuinely lost tracking chain is flagged unsafe (callers must not draw it)", unsafeResult.safe === false);

  // --- Test A (crop/ROI normalization): a landmark detected inside a pose ROI
  // crop must be converted to full-source coordinates via the exact worker
  // formula (`full = (crop.origin + n*crop.size) / sourceSize`) before it is
  // ever treated as a world-anchorable source point.
  const crop = { x: 200, y: 100, width: 400, height: 300 }; // pixels, within a 1000x500 source
  const cropLocalPoint = { x: 0.5, y: 0.5 }; // dead center of the crop
  const fullSource = coordinates.poseOrCropPointToFullSourcePoint(cropLocalPoint, crop, WIDTH, HEIGHT);
  check("Test A: crop-center point reconstructs to the exact full-source point",
    Math.abs(fullSource.x - (200 + 200) / WIDTH) < 1e-9 && Math.abs(fullSource.y - (100 + 150) / HEIGHT) < 1e-9);
  check("Test A: no crop (identity) returns the point unchanged",
    JSON.stringify(coordinates.poseOrCropPointToFullSourcePoint({ x: 0.37, y: 0.61 }, null, WIDTH, HEIGHT))
    === JSON.stringify({ x: 0.37, y: 0.61 }));

  // --- Test B (explicit transform-direction round trip): frameToReference
  // then referenceToFrame must return (to numerical noise) the original point,
  // using the explicitly-named directional functions, not the generic primitive.
  const roundTripEvidence = panEvidence(9, -0.03);
  const contactFramePoint = { x: 0.62, y: 0.44 };
  const toRef = world.frameToReference(contactFramePoint, 6, 0, roundTripEvidence, WIDTH, HEIGHT);
  const backToFrame = world.referenceToFrame(toRef.point, 0, 6, roundTripEvidence, WIDTH, HEIGHT);
  check("Test B: frameToReference -> referenceToFrame round-trips to the original point",
    Math.hypot(backToFrame.point.x - contactFramePoint.x, backToFrame.point.y - contactFramePoint.y) < 1e-9);
  const roundTrip = world.verifyFrameReferenceRoundTrip(contactFramePoint, 6, 0, roundTripEvidence, WIDTH, HEIGHT);
  check("Test B: verifyFrameReferenceRoundTrip reports ok with near-zero error on a safe chain",
    roundTrip.ok && roundTrip.errorNormalized < 1e-6);

  // --- Part 3: WorldContactAnchor formalization — referenceSourcePoint (not the
  // contact-frame point) is the canonical stored/rendered anchor.
  const contactWorld = world.sourcePointToCanonicalWorld(contactFramePoint, 6, roundTripEvidence, WIDTH, HEIGHT);
  const anchor = world.toWorldContactAnchor("contact-6-left-1", 6, "left", contactWorld, "ava-background-affine-v1");
  check("Part 3: WorldContactAnchor's contactFrameIndex identifies the detection, distinct from the reference frame",
    anchor.contactFrameIndex === 6 && anchor.world.referenceFrameIndex === 0);
  check("Part 3: the canonical anchor is world.x/y (reference space) — pans (frame 6, translationX -0.03/frame) mean it differs from the raw contact-frame point",
    Math.abs(anchor.world.x - contactFramePoint.x) > 1e-4 || Math.abs(anchor.world.y - contactFramePoint.y) > 1e-4);

  // --- Test G (multiple contact frames -> distinct, scene-aligned positions,
  // never collapsing into the false "viewport trail" from the bug report): three
  // contacts at DIFFERENT physical (world) locations, observed at different
  // frames, must project to three DIFFERENT display points in one target frame
  // — never the same point, and never simply their own original screen pixel.
  const distinctG = [
    world.sourcePointToCanonicalWorld({ x: 0.15, y: 0.5 }, 2, evidence, WIDTH, HEIGHT),
    world.sourcePointToCanonicalWorld({ x: 0.50, y: 0.5 }, 5, evidence, WIDTH, HEIGHT),
    world.sourcePointToCanonicalWorld({ x: 0.85, y: 0.5 }, 9, evidence, WIDTH, HEIGHT),
  ];
  const projectedG = distinctG.map((c) => worldAnchor.projectWorldAnchorToFrame(c, 9, evidence, WIDTH, HEIGHT, displayRect));
  const distinctXs = new Set(projectedG.map((p) => p.sourcePoint.x.toFixed(6)));
  check("Test G: three physically-distinct contacts remain distinct when reprojected into one target frame",
    distinctXs.size === 3);
} finally {
  rmSync(out, { recursive: true, force: true });
}

console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
process.exit(ok ? 0 : 1);
