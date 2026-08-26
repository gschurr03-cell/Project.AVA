// Phase 9.1B Parts A/G/H/I/J -- real before/after validation of the skeleton
// render-eligibility fix. Reproduces Phase 9.1A's exact pre-fix divergence
// (the PRE-FIX VideoOverlay.tsx policy, preserved here as a fixed historical
// reference matching that closed phase's own documented condition -- not
// re-read from source, since the source has now been fixed) against the
// CURRENT, POST-FIX VideoOverlay.tsx policy (verbatim copy, cross-checked
// against the live source text before use), for all four benchmarks.
//
// Read-only, standalone. Not imported by any src/ file.
//
//   node --env-file=.env.local scripts/phase-9-1b-eligibility-validation.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(root, "tmp/phase91b");
mkdirSync(OUT_DIR, { recursive: true });

const BENCHMARKS = {
  gav: { sessionId: "e04a7983-7406-4a00-bb89-8ada7b10bf9f", posePath: path.join(root, "tmp/phase80a/gav.pose.json") },
  vanni240: { sessionId: "31fe352b-f00f-4a80-b20a-17c2ab08ec5a", posePath: path.join(root, "tmp/phase80a/vanni240.pose.json") },
  vanni120: { sessionId: "160a86a2-c0db-4e7d-9fbe-82aedd6d3eff", posePath: path.join(root, "tmp/phase80a/vanni120.pose.json") },
  vanni60: { sessionId: "3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d", posePath: path.join(root, "tmp/phase80a/vanni60.pose.json") },
};

const JOINTS = ["nose", "leftShoulder", "rightShoulder", "leftElbow", "rightElbow", "leftWrist", "rightWrist", "leftHip", "rightHip", "leftKnee", "rightKnee", "leftAnkle", "rightAnkle", "leftHeel", "rightHeel", "leftFootIndex", "rightFootIndex"];
const BONES = [
  ["leftShoulder", "rightShoulder"], ["leftShoulder", "leftElbow"], ["leftElbow", "leftWrist"],
  ["rightShoulder", "rightElbow"], ["rightElbow", "rightWrist"], ["leftShoulder", "leftHip"],
  ["rightShoulder", "rightHip"], ["leftHip", "rightHip"], ["leftHip", "leftKnee"],
  ["leftKnee", "leftAnkle"], ["leftAnkle", "leftFootIndex"], ["rightHip", "rightKnee"],
  ["rightKnee", "rightAnkle"], ["rightAnkle", "rightFootIndex"],
];

// --- pre-fix policy: fixed historical reference, matching Phase 9.1A's own
// documented condition exactly (docs/phase-9-1a-vanni-240-skeleton-continuity-audit.md
// Section 8) -- this is what shipped BEFORE this phase's fix, preserved here
// as a comparison baseline, not re-derived from the (now-changed) source. ---
function preFixRenderStrips(f) {
  return f.boxOrigin === "predicted" || f.boxOrigin === "invalid" || f.boxOrigin === "frozen_suspect";
}

// --- post-fix policy: verbatim copy of the CURRENT VideoOverlay.tsx
// condition, cross-checked against the live source text before use. ---
function verifyLiveSourceMatch() {
  const src = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
  const needle =
    'const isIndependentlyCorroborated =\n        frame.boxOrigin === "frozen_suspect" && frame.independentLocalizationState === "independent_corroborated";\n      if (\n        (frame.boxOrigin === "predicted" || frame.boxOrigin === "invalid" || frame.boxOrigin === "frozen_suspect") &&\n        !isIndependentlyCorroborated\n      ) {\n        frame = { ...frame, landmarks: {} };\n      }';
  if (!src.includes(needle)) {
    throw new Error("VideoOverlay.tsx's post-fix eligibility condition no longer matches this script's copy -- re-audit before trusting this script's output");
  }
}
verifyLiveSourceMatch();
function postFixRenderStrips(f) {
  const isIndependentlyCorroborated = f.boxOrigin === "frozen_suspect" && f.independentLocalizationState === "independent_corroborated";
  return (f.boxOrigin === "predicted" || f.boxOrigin === "invalid" || f.boxOrigin === "frozen_suspect") && !isIndependentlyCorroborated;
}
// science policy, unchanged this phase, verified untouched (same text Phase
// 9.1A verified) -- used only as the "does this now match science" check.
function sciencePathStrips(f) {
  const stripped = f.boxOrigin === "predicted" || f.boxOrigin === "invalid" || f.boxOrigin === "frozen_suspect";
  const independentlyCorroborated = f.boxOrigin === "frozen_suspect" && f.independentLocalizationState === "independent_corroborated";
  return stripped && !independentlyCorroborated;
}
function verifyScienceUnchanged() {
  const src = readFileSync(path.join(root, "src/lib/benchmark/measurements.ts"), "utf8");
  if (!src.includes('f.boxOrigin === "frozen_suspect" && f.independentLocalizationState === "independent_corroborated"')) {
    throw new Error("measurements.ts's independent-corroboration exception no longer matches -- scientific policy must be untouched by Phase 9.1B");
  }
}
verifyScienceUnchanged();

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const out = path.join(root, ".p91b-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return origResolve.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};

const allResults = {};

try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, strict: false, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] }, noEmitOnError: false },
      files: [path.join(root, "src/lib/video/overlay.ts"), path.join(root, "src/lib/video/fps.ts")],
    }),
  );
  try {
    execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const outText = String(err.stdout ?? "") + String(err.stderr ?? "");
    if (!/worldProjection\.ts/.test(outText)) throw new Error(`tsc failed: ${outText}`);
  }
  const { buildOverlayFrames } = require(path.join(out, "lib/video/overlay.js"));
  const { normalizeFps } = require(path.join(out, "lib/video/fps.js"));

  const MP = [[0,"nose"],[11,"left_shoulder"],[12,"right_shoulder"],[13,"left_elbow"],[14,"right_elbow"],[15,"left_wrist"],[16,"right_wrist"],[23,"left_hip"],[24,"right_hip"],[25,"left_knee"],[26,"right_knee"],[27,"left_ankle"],[28,"right_ankle"],[29,"left_heel"],[30,"right_heel"],[31,"left_toe"],[32,"right_toe"]];

  for (const [label, { sessionId, posePath }] of Object.entries(BENCHMARKS)) {
    const { data: s, error } = await db.from("sessions").select("id, fps, fps_override").eq("id", sessionId).single();
    if (error) throw new Error(`${label}: ${error.message}`);

    const seq = JSON.parse(readFileSync(posePath, "utf8"));
    const rawFrames = seq.frames.map((f) => {
      const landmarksArray = [];
      for (const [i, key] of MP) {
        const kp = f.keypoints[key];
        if (kp) landmarksArray[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score };
      }
      return {
        frame: f.index, sourceFrameIndex: f.sourceFrameIndex, time: f.tMs / 1000, keypoints: landmarksArray,
        boxOrigin: f.boxOrigin, trackState: f.trackState,
        independentLocalizationState: f.independentLocalizationState,
      };
    });
    const overlayFrames = buildOverlayFrames({ ...seq, frames: rawFrames });
    const rawFps = Number(s.fps) || seq.fps;
    const normFps = normalizeFps(rawFps);

    const rows = overlayFrames.map((f) => {
      const rawLandmarkCount = Object.values(f.landmarks).filter(Boolean).length;
      const preStripped = preFixRenderStrips(f);
      const postStripped = postFixRenderStrips(f);
      const sciStripped = sciencePathStrips(f);
      const preLandmarks = preStripped ? {} : f.landmarks;
      const postLandmarks = postStripped ? {} : f.landmarks;
      const preBones = BONES.filter(([a, b]) => Boolean(preLandmarks[a]) && Boolean(preLandmarks[b])).length;
      const postBones = BONES.filter(([a, b]) => Boolean(postLandmarks[a]) && Boolean(postLandmarks[b])).length;
      return {
        sourceFrameIndex: f.sourceFrameIndex ?? f.frame,
        timeS: +f.time.toFixed(6),
        boxOrigin: f.boxOrigin ?? null,
        independentLocalizationState: f.independentLocalizationState ?? null,
        rawLandmarkCount,
        preFixStripped: preStripped, postFixStripped: postStripped, scienceStripped: sciStripped,
        preFixRenderableBones: preBones, postFixRenderableBones: postBones,
        recovered: preBones === 0 && postBones > 0,
        nowMatchesScience: postStripped === sciStripped,
      };
    });

    const recoveredFrames = rows.filter((r) => r.recovered);
    const stillStrippedButAthleteHadRawPose = rows.filter((r) => r.postFixStripped && r.rawLandmarkCount > 0);
    const allNowMatchScience = rows.every((r) => r.nowMatchesScience);

    // Genuine-gap preservation check: known Vanni 240 off-frame interval
    // (668-989, Phase 9.1A Section 6/14) must remain 100% dropout.
    let genuineGapCheck = null;
    if (label === "vanni240") {
      const slice = rows.filter((r) => r.sourceFrameIndex >= 668 && r.sourceFrameIndex <= 989);
      genuineGapCheck = { frameCount: slice.length, allStillZeroBones: slice.every((r) => r.postFixRenderableBones === 0) };
    }

    const summary = {
      label, sessionId, normFps, totalFrames: rows.length,
      preFixFullSkeletonCount: rows.filter((r) => r.preFixRenderableBones === BONES.length).length,
      postFixFullSkeletonCount: rows.filter((r) => r.postFixRenderableBones === BONES.length).length,
      recoveredFrameCount: recoveredFrames.length,
      recoveredFrames: recoveredFrames.map((r) => r.sourceFrameIndex),
      allNowMatchScience,
      stillStrippedWithRawPoseCount: stillStrippedButAthleteHadRawPose.length, // expected: genuine science-agreed rejections only
      genuineGapCheck,
    };

    allResults[label] = { summary, rows };
    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(summary, null, 2));

    writeFileSync(path.join(OUT_DIR, `${label}-before-after.json`), JSON.stringify(rows, null, 2));
  }

  writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(Object.fromEntries(Object.entries(allResults).map(([k, v]) => [k, v.summary])), null, 2));
  console.log(`\nWrote tmp/phase91b/*.json`);
} finally {
  Module._resolveFilename = origResolve;
  rmSync(out, { recursive: true, force: true });
}
