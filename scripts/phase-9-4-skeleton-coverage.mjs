// Phase 9.4 Part J -- skeleton continuity re-check on FRESH artifacts, using
// the CURRENT (post-9.1B) production eligibility policy.
//
// Note on methodology: the original Phase 9.1A audit script
// (scripts/phase-9-1a-pose-coverage-audit.mjs) intentionally self-checks
// that VideoOverlay.tsx's landmark-stripping condition still lacks the
// `independent_corroborated` exception -- i.e. it is frozen to the PRE-9.1B
// behavior and is EXPECTED to throw after 9.1B's real fix unified the
// render and science eligibility policies (this is documented, expected,
// non-regression behavior, already noted in every regression run since
// Phase 9.1B shipped). This script instead uses the CURRENT, single, unified
// policy both VideoOverlay.tsx and measurements.ts share today, verified
// against the live source text before use.
//
//   node --env-file=.env.local scripts/phase-9-4-skeleton-coverage.mjs
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(root, "tmp/phase94");
mkdirSync(OUT_DIR, { recursive: true });

const BENCHMARKS = {
  gav: path.join(root, "tmp/phase94/gav.pose.json"),
  vanni60: path.join(root, "tmp/phase94/vanni60.pose.json"),
  vanni120: path.join(root, "tmp/phase94/vanni120.pose.json"),
  vanni240: path.join(root, "tmp/phase94/vanni240.pose.json"),
};

function verifyLiveSourceMatch() {
  const overlaySrc = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
  if (!overlaySrc.includes("independentLocalizationState") || !overlaySrc.includes("independent_corroborated")) {
    throw new Error("VideoOverlay.tsx no longer contains the Phase 9.1B corroboration exception -- re-audit before trusting this script");
  }
}
verifyLiveSourceMatch();

// Current, unified policy (identical in VideoOverlay.tsx post-9.1B and measurements.ts).
function currentPolicyStrips(f) {
  const stripped = f.boxOrigin === "predicted" || f.boxOrigin === "invalid" || f.boxOrigin === "frozen_suspect";
  const independentlyCorroborated = f.boxOrigin === "frozen_suspect" && f.independentLocalizationState === "independent_corroborated";
  return stripped && !independentlyCorroborated;
}

const BONES = [
  ["leftShoulder", "rightShoulder"], ["leftShoulder", "leftElbow"], ["leftElbow", "leftWrist"],
  ["rightShoulder", "rightElbow"], ["rightElbow", "rightWrist"], ["leftShoulder", "leftHip"],
  ["rightShoulder", "rightHip"], ["leftHip", "rightHip"], ["leftHip", "leftKnee"],
  ["leftKnee", "leftAnkle"], ["leftAnkle", "leftFootIndex"], ["rightHip", "rightKnee"],
  ["rightKnee", "rightAnkle"], ["rightAnkle", "rightFootIndex"],
];

const out = path.join(root, ".p94-coverage-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return origResolve.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};

const summaries = {};
try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, strict: false, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] }, noEmitOnError: false }, files: [path.join(root, "src/lib/video/overlay.ts"), path.join(root, "src/lib/video/fps.ts")] }),
  );
  try { execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (err) { const t = String(err.stdout ?? "") + String(err.stderr ?? ""); if (!/worldProjection\.ts/.test(t)) throw new Error(t); }
  const { buildOverlayFrames } = require(path.join(out, "lib/video/overlay.js"));

  const MP = [[0,"nose"],[11,"left_shoulder"],[12,"right_shoulder"],[13,"left_elbow"],[14,"right_elbow"],[15,"left_wrist"],[16,"right_wrist"],[23,"left_hip"],[24,"right_hip"],[25,"left_knee"],[26,"right_knee"],[27,"left_ankle"],[28,"right_ankle"],[29,"left_heel"],[30,"right_heel"],[31,"left_toe"],[32,"right_toe"]];

  for (const [label, posePath] of Object.entries(BENCHMARKS)) {
    const seq = JSON.parse(readFileSync(posePath, "utf8"));
    const rawFrames = seq.frames.map((f) => {
      const landmarksArray = [];
      for (const [i, key] of MP) { const kp = f.keypoints[key]; if (kp) landmarksArray[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score }; }
      return { frame: f.index, sourceFrameIndex: f.sourceFrameIndex, time: f.tMs / 1000, keypoints: landmarksArray, boxOrigin: f.boxOrigin, trackState: f.trackState, independentLocalizationState: f.independentLocalizationState };
    });
    const overlayFrames = buildOverlayFrames({ ...seq, frames: rawFrames });

    let full = 0, partial = 0, missing = 0, rejected = 0, corroboratedRecovered = 0, frozenSuspect = 0;
    for (const f of overlayFrames) {
      const rawCount = Object.values(f.landmarks).filter(Boolean).length;
      const stripped = currentPolicyStrips(f);
      const landmarks = stripped ? {} : f.landmarks;
      const renderableBones = BONES.filter(([a, b]) => Boolean(landmarks[a]) && Boolean(landmarks[b])).length;
      if (f.boxOrigin === "frozen_suspect") {
        frozenSuspect++;
        if (!stripped) corroboratedRecovered++;
      }
      if (rawCount === 0) missing++;
      else if (stripped) rejected++;
      else if (renderableBones === 0) missing++;
      else if (renderableBones < BONES.length) partial++;
      else full++;
    }
    const total = overlayFrames.length;
    summaries[label] = {
      totalFrames: total,
      fullSkeletonFrames: full, fullSkeletonPct: +((full / total) * 100).toFixed(2),
      partialSkeletonFrames: partial, partialSkeletonPct: +((partial / total) * 100).toFixed(2),
      genuineNoPoseFrames: missing, genuineNoPosePct: +((missing / total) * 100).toFixed(2),
      rejectedLowTrustFrames: rejected, rejectedPct: +((rejected / total) * 100).toFixed(2),
      frozenSuspectFrames: frozenSuspect,
      independentCorroboratedRecoveredFrames: corroboratedRecovered,
    };
    console.log(`${label}: ${JSON.stringify(summaries[label])}`);
  }
  writeFileSync(path.join(OUT_DIR, "skeleton-coverage-fresh.json"), JSON.stringify(summaries, null, 2));
  console.log(`\nWrote ${OUT_DIR}/skeleton-coverage-fresh.json`);
} finally {
  Module._resolveFilename = origResolve;
  rmSync(out, { recursive: true, force: true });
}
