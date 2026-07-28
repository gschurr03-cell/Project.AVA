// Timing-zone WORLD-ANCHOR sanity (drift fix).
//
// Proves that a MANUAL-CONFIRMED timing zone stays anchored to a fixed source-video
// location across frames, driven ONLY by the authoritative background camera model —
// never by the athlete-derived camera estimate. The decisive test is the fails-before/
// passes-after pair on IDENTICAL inputs (a static camera with a moving athlete):
//   • the OLD render path (estimateCameraMotion + gateFrameXAt) DRIFTS the gate, and
//   • the NEW render path (reprojectSourceLineToFrame via camera evidence) does NOT.
//
// Also covers: setup-frame identity (no post-save shift), real-pan world anchoring,
// round-trip edit, resize invariance, shared transform, canonical immutability, and the
// authority routing that carries setupFrameIndex into the render directive.
//
//   node scripts/timing-zone-world-anchor-sanity.mjs

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, ".timing-zone-world-anchor-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

let ok = true;
const check = (label, fn) => {
  try { fn(); console.log(`PASS  ${label}`); }
  catch (err) { ok = false; console.log(`FAIL  ${label}\n      ${err.message}`); }
};

writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
  compilerOptions: {
    outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022",
    moduleResolution: "node", esModuleInterop: true, skipLibCheck: true, strict: true,
    baseUrl: path.join(root, "src"), paths: { "@/*": ["*"] },
  },
  include: [
    path.join(root, "src/lib/calibration/zoneAnchors.ts"),
    path.join(root, "src/lib/calibration/authority.ts"),
    path.join(root, "src/lib/calibration/gates.ts"),
    path.join(root, "src/lib/video/camera.ts"),
    path.join(root, "src/lib/video/coordinates.ts"),
    path.join(root, "src/lib/video/recordingMode.ts"),
    path.join(root, "src/lib/video/overlay.ts"),
  ],
}));

try {
  execFileSync(path.join(root, "node_modules/.bin/tsc"), ["-p", path.join(out, "tsconfig.json")], { stdio: "pipe" });
  const require = createRequire(import.meta.url);
  const originalResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    return originalResolve.call(this, request.startsWith("@/") ? path.join(out, request.slice(2)) : request, ...rest);
  };

  const anchors = require(path.join(out, "lib/calibration/zoneAnchors.js"));
  const authority = require(path.join(out, "lib/calibration/authority.js"));
  const camera = require(path.join(out, "lib/video/camera.js"));
  const coords = require(path.join(out, "lib/video/coordinates.js"));

  const W = 1280, H = 720;
  const N = 12;

  // Camera evidence keyed by SOURCE FRAME. translationX is the per-frame source-pixel
  // motion of a world-fixed point; 0 everywhere = a genuinely static camera.
  const evidence = (translationX) => ({
    cameraMotionModelVersion: "ava-background-affine-v1",
    dynamicCropVersion: "ava-mediapipe-roi-v1",
    athleteTrackingVersion: "ava-single-pose-continuity-v1",
    transforms: Array.from({ length: N }, (_, frame) => ({
      frame, translationX: frame ? translationX : 0, translationY: 0, rotationDeg: 0, scale: 1,
      confidence: 0.95, supportingFeatureCount: 80, inlierRatio: 0.9, residualPx: 1,
    })),
    athleteTrack: [], trackingLossRanges: [], unstableFrameRanges: [],
  });

  // A MOVING athlete in front of a STATIC camera. The planted (left) foot drifts a
  // little each frame (foot rolls through stance) — exactly the bias that makes an
  // athlete-derived camera estimate fabricate a phantom pan. COM travels < 40% of the
  // frame so the estimator's static-travel guard does NOT fire (as on real footage).
  const foot = (x, y) => ({ x, y, visibility: 1 });
  const movingAthleteFrames = Array.from({ length: N }, (_, i) => {
    const lx = 0.30 + i * 0.006; // planted foot phantom drift
    const rx = 0.60 + 0.03 * Math.sin(i); // swing foot
    return {
      frame: i, sourceFrameIndex: i, time: i / 30,
      landmarks: {
        leftAnkle: foot(lx, 0.85), leftHeel: foot(lx, 0.86), leftFootIndex: foot(lx, 0.87),
        rightAnkle: foot(rx, 0.80), rightHeel: foot(rx, 0.81), rightFootIndex: foot(rx, 0.82),
      },
      centerOfMass: { x: 0.45 + i * 0.008, y: 0.5 },
      angles: {}, velocity: null, footContact: { left: true, right: false },
    };
  });

  // The canonical (persisted) manual-confirmed gate: an immutable source-frame line.
  const gate = { c1: { x: 0.80, y: 0.30 }, c2: { x: 0.80, y: 0.80 }, timeS: 0, setupFrameIndex: 0 };

  // ---- 1. THE DRIFT: fails-before / passes-after on identical inputs -----------------
  check("static camera + moving athlete: OLD athlete-derived path DRIFTS the gate (the bug)", () => {
    const track = camera.estimateCameraMotion(movingAthleteFrames);
    const early = camera.gateFrameXAt(gate.c1.x, gate.timeS, track, movingAthleteFrames[0].time);
    const late = camera.gateFrameXAt(gate.c1.x, gate.timeS, track, movingAthleteFrames[N - 1].time);
    assert.ok(early != null && late != null, "gate stayed in view");
    assert.ok(Math.abs(late - early) > 0.01, `expected drift, got ${Math.abs(late - early)}`);
  });
  check("static camera + moving athlete: NEW authoritative path does NOT drift (the fix)", () => {
    const ev = evidence(0); // static camera → identity transforms
    const reprojectX = (targetFrame) =>
      anchors.reprojectSourceLineToFrame(gate.c1, gate.c2, gate.setupFrameIndex, targetFrame, ev, W, H).c1.x;
    const early = reprojectX(0);
    const mid = reprojectX(6);
    const late = reprojectX(N - 1);
    assert.ok(Math.abs(late - early) < 1e-9 && Math.abs(mid - early) < 1e-9,
      `expected zero drift, got early=${early} mid=${mid} late=${late}`);
    assert.equal(early, gate.c1.x, "static-camera projection equals the canonical source x");
  });

  // ---- 2. No-interaction canonical immutability -------------------------------------
  check("canonical anchor is never mutated by reprojection (immutable authority)", () => {
    const ev = evidence(0);
    const before = JSON.stringify(gate);
    for (let f = 0; f < N; f++) anchors.reprojectSourceLineToFrame(gate.c1, gate.c2, 0, f, ev, W, H);
    assert.equal(JSON.stringify(gate), before, "gate object unchanged");
  });

  // ---- 3. Setup-frame identity: no post-save pixel shift -----------------------------
  check("reprojection is exact (identity) at the setup frame — no post-save shift", () => {
    const line = anchors.reprojectSourceLineToFrame(gate.c1, gate.c2, 5, 5, evidence(0.02), W, H);
    assert.deepEqual(line.c1, gate.c1);
    assert.deepEqual(line.c2, gate.c2);
  });

  // ---- 4. Real pan: world anchoring --------------------------------------------------
  check("genuine camera pan: the confirmed gate tracks the world location (moves with evidence)", () => {
    const line = anchors.reprojectSourceLineToFrame(gate.c1, gate.c2, 0, 10, evidence(-0.01), W, H);
    assert.ok(Math.abs(line.midpoint.x - 0.70) < 1e-9, `expected 0.70, got ${line.midpoint.x}`);
    const rigid = Math.hypot(line.c2.x - line.c1.x, line.c2.y - line.c1.y);
    assert.ok(Math.abs(rigid - 0.5) < 1e-9, "line stays rigid (no bend/stretch) under translation");
  });

  // ---- 5. Round-trip edit: canonical → screen → inverse → canonical ------------------
  check("round-trip: canonical → project → inverse → canonical within tolerance", () => {
    const picture = { x: 40, y: 12, width: 1000, height: 562 };
    const rect = { x: 0, y: 0, width: picture.width, height: picture.height };
    const screen = coords.projectLandmark(gate.c1, rect, W, H);
    // Inverse of projectLandmark for normalized input: divide picture-local px by size.
    const back = { x: screen.x / picture.width, y: screen.y / picture.height };
    assert.ok(Math.abs(back.x - gate.c1.x) < 1e-9 && Math.abs(back.y - gate.c1.y) < 1e-9,
      `round-trip drift ${Math.abs(back.x - gate.c1.x)}`);
  });

  // ---- 6. Resize invariance ----------------------------------------------------------
  check("resize: the same canonical source coord recovers across two viewport sizes", () => {
    const invert = (picW, picH) => {
      const rect = { x: 0, y: 0, width: picW, height: picH };
      const p = coords.projectLandmark(gate.c1, rect, W, H);
      return { x: p.x / picW, y: p.y / picH };
    };
    const a = invert(1000, 562);
    const b = invert(640, 360);
    assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9, "resize changed the source mapping");
    assert.ok(Math.abs(a.x - gate.c1.x) < 1e-9, "recovered the canonical source x");
  });

  // ---- 7. Shared transform -----------------------------------------------------------
  check("shared transform: a gate endpoint and a source landmark at the same coord project identically", () => {
    const rect = { x: 0, y: 0, width: 1000, height: 562 };
    const landmark = { x: 0.80, y: 0.30 };
    const g = coords.projectLandmark(gate.c1, rect, W, H);
    const l = coords.projectLandmark(landmark, rect, W, H);
    assert.deepEqual(g, l, "timing zones and landmarks must share one projection");
  });

  // ---- 8. Authority routing carries the setup frame ----------------------------------
  check("authority: manual_confirmed routes to canonical_raw and carries setupFrameIndex", () => {
    const gates = {
      startGate: { c1: { x: 0.2, y: 0.3 }, c2: { x: 0.2, y: 0.8 }, timeS: 0, setupFrameIndex: 3 },
      finishGate: { c1: { x: 0.8, y: 0.3 }, c2: { x: 0.8, y: 0.8 }, timeS: 1, setupFrameIndex: 40 },
      distanceM: 20,
      calibrationSource: "manual_confirmed", revision: 2,
      startBoundary: { selectedByUser: true }, finishBoundary: { selectedByUser: true },
    };
    const directive = authority.selectRenderableGateGeometry(gates);
    assert.equal(directive.mode, "canonical_raw");
    assert.equal(directive.start.setupFrameIndex, 3);
    assert.equal(directive.finish.setupFrameIndex, 40);
    // The persisted coordinates are surfaced byte-for-byte (canonical authority).
    assert.deepEqual(directive.start.c1, gates.startGate.c1);
  });

  // ---- 9. Static camera stays exactly static across the whole clip -------------------
  check("static evidence keeps the gate numerically identical on every frame", () => {
    const ev = evidence(0);
    const base = anchors.reprojectSourceLineToFrame(gate.c1, gate.c2, 0, 0, ev, W, H);
    for (let f = 0; f < N; f++) {
      const line = anchors.reprojectSourceLineToFrame(gate.c1, gate.c2, 0, f, ev, W, H);
      assert.deepEqual(line.c1, base.c1);
      assert.deepEqual(line.c2, base.c2);
    }
  });

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
