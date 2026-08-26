// Day 94 audit (Part 3) — the gate-lock pipeline rejects/holds through bad
// per-frame camera transforms but never smoothed the ACCEPTED ones, so
// wind/tripod-bounce jitter that stays within the acceptance thresholds
// (confidence/features/residual) passed straight through to gate propagation.
// This proves `smooth_camera_transforms` (mediapipe_pose_runner.py) dampens
// synthetic high-frequency camera shake while preserving the true underlying
// motion, that it never bridges across an untrustworthy frame, and — the
// architectural guarantee — that both gates stay rigidly spaced/oriented
// under shake because they are driven by the SAME smoothed transform chain.
//
//   node scripts/gate-lock-smoothing-sanity.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { execFileSync as execFileSyncTsc } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, ".gate-lock-smoothing-sanity-tmp");
let ok = true;
const check = (label, condition) => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) ok = false;
};

// --- 1. Python: synthetic shake in, smoothed motion out --------------------
const N = 60;
const trueTx = (i) => 0.0004 * i; // slow genuine drift, ~static-ish
const shakeTx = Array.from({ length: N }, (_, i) => trueTx(i) + (i % 2 === 0 ? 0.0035 : -0.0035));
const shakeRot = Array.from({ length: N }, (_, i) => (i % 2 === 0 ? 0.25 : -0.25));
const transforms = Array.from({ length: N }, (_, i) => ({
  frame: i, translationX: shakeTx[i], translationY: 0.0,
  rotationDeg: shakeRot[i], scale: 1.0, confidence: 0.92,
  supportingFeatureCount: 200, inlierRatio: 0.95, residualPx: 1.2,
}));
// One untrustworthy frame in the middle with a wildly different value — must
// pass through UNCHANGED and must not contaminate its smoothed neighbors.
const badIndex = 30;
transforms[badIndex] = {
  frame: badIndex, translationX: 5.0, translationY: 0.0, rotationDeg: 40.0,
  scale: 3.0, confidence: 0.05, supportingFeatureCount: 3, inlierRatio: 0.05, residualPx: 40.0,
};

const pyOut = execFileSync(".venv/bin/python", ["-c", `
import sys, json
sys.path.insert(0, "src/lib/biomechanics/mediapipe/runtime")
import camera_path as cp
from mediapipe_pose_runner import smooth_camera_transforms
transforms = json.loads(sys.argv[1])
smoothed = smooth_camera_transforms(transforms, cp)
print(json.dumps(smoothed))
`, JSON.stringify(transforms)], { cwd: root }).toString().trim();
const smoothed = JSON.parse(pyOut);

check("1. smoothing preserves the frame count", smoothed.length === N);

const rms = (values) => Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length);
const rawJitter = rms(shakeTx.map((v, i) => v - trueTx(i)));
const smoothedJitter = rms(smoothed.map((t, i) => t.translationX - trueTx(i)).filter((_, i) => i !== badIndex && i > 5));
check(
  `2. synthetic camera-shake translation jitter is reduced (raw RMS ${rawJitter.toFixed(5)} → smoothed RMS ${smoothedJitter.toFixed(5)})`,
  smoothedJitter < rawJitter * 0.6,
);
const rawRotJitter = rms(shakeRot);
const smoothedRotJitter = rms(smoothed.map((t) => t.rotationDeg).filter((_, i) => i !== badIndex && i > 5));
check(
  `3. synthetic camera-shake rotation jitter is reduced (raw RMS ${rawRotJitter.toFixed(3)}deg → smoothed RMS ${smoothedRotJitter.toFixed(3)}deg)`,
  smoothedRotJitter < rawRotJitter * 0.6,
);
check(
  "4. an untrustworthy frame passes through UNCHANGED (never smoothed)",
  smoothed[badIndex].translationX === 5.0 && smoothed[badIndex].rotationDeg === 40.0,
);
check(
  "5. the untrustworthy frame's value does not leak into its neighbor's smoothing",
  Math.abs(smoothed[badIndex + 1].translationX - trueTx(badIndex + 1)) < 0.01,
);
check(
  "6. diagnostic fields (confidence/inlierRatio/residualPx/supportingFeatureCount) are never altered by smoothing",
  transforms.every((t, i) =>
    smoothed[i].confidence === t.confidence &&
    smoothed[i].inlierRatio === t.inlierRatio &&
    smoothed[i].residualPx === t.residualPx &&
    smoothed[i].supportingFeatureCount === t.supportingFeatureCount,
  ),
);

// --- 2. TS: both gates stay rigidly spaced/oriented under the SAME smoothed
// transform chain — the architectural guarantee that shake can never make the
// two gates drift apart from each other, only (bounded) move together. -------
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const orig = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return orig.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};
writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
  compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] } },
  include: [path.join(root, "src/lib/calibration/zoneAnchors.ts"), path.join(root, "src/lib/video/recordingMode.ts")],
}));
try {
  execFileSyncTsc(path.join(root, "node_modules/.bin/tsc"), ["-p", path.join(out, "tsconfig.json")], { stdio: "pipe" });
  const require = createRequire(import.meta.url);
  const anchors = require(path.join(out, "lib/calibration/zoneAnchors.js"));

  const W = 1920, H = 1080;
  const evidence = {
    cameraMotionModelVersion: "ava-background-affine-v1",
    dynamicCropVersion: "ava-mediapipe-roi-v1", athleteTrackingVersion: "ava-single-pose-continuity-v1",
    transforms: [{ frame: 0, translationX: 0, translationY: 0, rotationDeg: 0, scale: 1, confidence: 0.92, supportingFeatureCount: 200, inlierRatio: 0.95, residualPx: 1.2 },
      ...smoothed.slice(1).map((t) => ({ ...t, translationY: 0 }))],
    athleteTrack: [], trackingLossRanges: [], unstableFrameRanges: [],
  };
  const start = { boundaryId: "start-v1", boundaryType: "start", setupFrameIndex: 0, setupTimestampS: 0,
    sourceFrameLine: { c1: { x: 0.15, y: 0.5 }, c2: { x: 0.15, y: 0.9 } },
    compensatedAnchorLine: { c1: { x: 0.15, y: 0.5 }, c2: { x: 0.15, y: 0.9 } },
    groundAnchorVersion: "ava-ground-anchor-v1", confidence: 1, selectedByUser: true,
    physicalReferenceDescription: "start line", propagationModelVersion: "ava-background-affine-anchor-v1",
    signedCrossingSide: "negative_to_positive" };
  const finish = { ...start, boundaryId: "finish-v1", boundaryType: "finish",
    sourceFrameLine: { c1: { x: 0.85, y: 0.5 }, c2: { x: 0.85, y: 0.9 } },
    compensatedAnchorLine: { c1: { x: 0.85, y: 0.5 }, c2: { x: 0.85, y: 0.9 } },
    signedCrossingSide: "positive_to_negative" };

  // Distance in PIXEL space (translation/rotation are physically pixel-space
  // quantities normalized only for storage) — a rigid motion (rotation +
  // translation, constant scale=1 here) preserves Euclidean pixel distance
  // between any two co-transformed points EXACTLY, regardless of shake.
  const pixelDist = (a, b) => Math.hypot((a.x - b.x) * W, (a.y - b.y) * H);
  const trueSeparationPx = pixelDist({ x: 0.15, y: 0.7 }, { x: 0.85, y: 0.7 });
  const separations = [];
  for (let f = 0; f < N; f += 5) {
    const s = anchors.propagateAnchorFromSetupToFrame(start, f, evidence, W, H);
    const g = anchors.propagateAnchorFromSetupToFrame(finish, f, evidence, W, H);
    if (!s.safe || !g.safe) continue;
    separations.push(pixelDist(s.midpoint, g.midpoint));
  }
  check("7. both gates were propagated across the shaken clip", separations.length >= 5);
  const maxDeviationPx = Math.max(...separations.map((s) => Math.abs(s - trueSeparationPx)));
  check(
    `8. gate-to-gate spacing under synthetic camera shake stays fixed (max deviation ${maxDeviationPx.toFixed(3)}px of ${trueSeparationPx.toFixed(1)}px)`,
    maxDeviationPx < 0.5,
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}

console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
process.exit(ok ? 0 : 1);
