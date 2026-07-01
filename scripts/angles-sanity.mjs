// Runtime sanity for joint-angle extraction.
//
//   node scripts/angles-sanity.mjs
//
// Compiles the angles module to a throwaway dir, asserts angles on a synthetic
// pose with known geometry, checks that missing/low-confidence keypoints are
// handled safely, and (if the real artifact exists) prints an angle summary.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".angles-sanity-tmp");
const artifact = path.join(root, "artifacts/pose-sequences/test.pose.json");

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};
const approx = (a, b, tol = 0.5) => a != null && Math.abs(a - b) <= tol;

// A synthetic upright pose with hand-computable angles:
//   knees & hips straight (180deg), ankles bent 90deg, trunk/tilts level (0deg).
const POSE = {
  nose: [0.5, 0.1],
  left_shoulder: [0.45, 0.3],
  right_shoulder: [0.55, 0.3],
  left_hip: [0.45, 0.5],
  right_hip: [0.55, 0.5],
  left_knee: [0.45, 0.7],
  right_knee: [0.55, 0.7],
  left_ankle: [0.45, 0.9],
  right_ankle: [0.55, 0.9],
  left_toe: [0.55, 0.9], // horizontal from ankle → 90deg ankle angle
  right_toe: [0.65, 0.9],
};

function seqFrom(coords, { frames = 2, score = 0.9, fps = 30 } = {}) {
  const kp = ([x, y]) => ({ x, y, score, visibility: score });
  const frameAt = (index) => ({
    index,
    tMs: (index / fps) * 1000,
    keypoints: Object.fromEntries(Object.entries(coords).map(([j, xy]) => [j, kp(xy)])),
  });
  return {
    backend: "synthetic",
    modelVersion: "synthetic",
    coordSpace: "normalized",
    fps,
    width: 1920,
    height: 1080,
    frames: Array.from({ length: frames }, (_, i) => frameAt(i)),
  };
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  execFileSync(
    "npx",
    // `--strict` so zod infers the same (required) keypoint types the project
    // build uses; without it x/y degrade to optional and the compile fails.
    ["tsc", "src/lib/biomechanics/angles/index.ts", "--outDir", out, "--module", "commonjs", "--target", "es2022", "--skipLibCheck", "--esModuleInterop", "--strict"],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );
  const { calculateFrameAngles } = require(path.join(out, "angles/index.js"));

  // (1) Synthetic pose → expected angles.
  const fa = calculateFrameAngles(seqFrom(POSE))[0];
  check(`knee ≈180 (L=${fa.leftKneeDeg}, R=${fa.rightKneeDeg})`, approx(fa.leftKneeDeg, 180) && approx(fa.rightKneeDeg, 180));
  check(`hip ≈180 (L=${fa.leftHipDeg}, R=${fa.rightHipDeg})`, approx(fa.leftHipDeg, 180) && approx(fa.rightHipDeg, 180));
  check(`ankle ≈90 (L=${fa.leftAnkleDeg}, R=${fa.rightAnkleDeg})`, approx(fa.leftAnkleDeg, 90) && approx(fa.rightAnkleDeg, 90));
  check(`trunk/tilts ≈0 (trunk=${fa.trunkLeanDeg}, shoulder=${fa.shoulderTiltDeg}, hip=${fa.hipTiltDeg})`, approx(fa.trunkLeanDeg, 0) && approx(fa.shoulderTiltDeg, 0) && approx(fa.hipTiltDeg, 0));
  check(`well-typed FrameAngles (frame=0, confidence #, source)`, fa.frame === 0 && typeof fa.confidence === "number" && fa.source === "pose_geometry");

  // (2) Missing keypoints omit only affected angles.
  const missing = { ...POSE };
  delete missing.left_ankle;
  const fam = calculateFrameAngles(seqFrom(missing))[0];
  check(`missing left_ankle → leftKnee/leftAnkle omitted, rightKnee/trunk kept`,
    fam.leftKneeDeg === undefined && fam.leftAnkleDeg === undefined && approx(fam.rightKneeDeg, 180) && approx(fam.trunkLeanDeg, 0));

  // (3) Low-confidence keypoints are ignored.
  check(`low-confidence (score 0.2) → [] (all frames omitted)`, calculateFrameAngles(seqFrom(POSE, { score: 0.2 })).length === 0);

  // (4) Empty sequence returns [].
  check(`empty sequence → []`, calculateFrameAngles(seqFrom(POSE, { frames: 0 })).length === 0);

  // (5) Real artifact summary.
  if (existsSync(artifact)) {
    const seq = JSON.parse(readFileSync(artifact, "utf8"));
    const angles = calculateFrameAngles(seq);
    const withL = angles.filter((a) => a.leftKneeDeg != null).length;
    const withR = angles.filter((a) => a.rightKneeDeg != null).length;
    const knees = angles.flatMap((a) => [a.leftKneeDeg, a.rightKneeDeg]).filter((x) => x != null);
    const trunks = angles.map((a) => a.trunkLeanDeg).filter((x) => x != null);
    const avgTrunk = trunks.length ? trunks.reduce((x, y) => x + y, 0) / trunks.length : null;
    const kneeRange = knees.length ? `${Math.min(...knees).toFixed(1)}..${Math.max(...knees).toFixed(1)}` : "n/a";
    console.log(
      `real artifact: ${seq.frames.length} frames → ${angles.length} analyzed; ` +
        `L knee=${withL}, R knee=${withR}; knee range ${kneeRange}; ` +
        `avg trunk lean ${avgTrunk != null ? avgTrunk.toFixed(1) : "n/a"}`,
    );
    check(`real artifact returned a typed array`, Array.isArray(angles));
  } else {
    console.log("real artifact: (not present — skipping optional summary)");
  }

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
