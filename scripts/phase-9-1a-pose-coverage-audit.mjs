// Phase 9.1A Parts A/B/C/D/E/F/G -- real pose-coverage/dropout forensic audit.
// Calls the REAL, unmodified `buildOverlayFrames` against the real, current
// pose artifact, then replays -- VERBATIM, cross-checked against the live
// source text -- the two DIFFERENT landmark-stripping policies that actually
// run in production today:
//
//   RENDER PATH (VideoOverlay.tsx, lines ~664-666): strips ALL
//     predicted/invalid/frozen_suspect frames unconditionally -- no
//     independent-corroboration exception.
//   SCIENCE PATH (measurements.ts, lines ~565-570): strips the same three
//     origins EXCEPT a frozen_suspect frame whose independentLocalizationState
//     is "independent_corroborated" (Phase 4.2K).
//
// This directly tests whether the renderer is MORE conservative than the
// science -- i.e. whether frames the scientific pipeline trusts enough to use
// for contacts/steps/metrics are nonetheless hidden from the coach's skeleton
// view.
//
// Read-only, standalone. Not imported by any src/ file.
//
//   node --env-file=.env.local scripts/phase-9-1a-pose-coverage-audit.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(root, "tmp/phase91a");
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

// --- verify the two copied stripping policies still match live source ------
function verifyLiveSourceMatch() {
  const overlaySrc = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
  if (!overlaySrc.includes('if (frame.boxOrigin === "predicted" || frame.boxOrigin === "invalid" || frame.boxOrigin === "frozen_suspect") {\n        frame = { ...frame, landmarks: {} };\n      }')) {
    throw new Error("VideoOverlay.tsx's landmark-stripping condition no longer matches this script's copy");
  }
  if (/independentLocalizationState|independent_corroborated/.test(overlaySrc)) {
    throw new Error("VideoOverlay.tsx now references independentLocalizationState -- the render/science divergence this script measures may no longer exist; re-audit before trusting this script's output");
  }
  const measurementsSrc = readFileSync(path.join(root, "src/lib/benchmark/measurements.ts"), "utf8");
  if (!measurementsSrc.includes('f.boxOrigin === "frozen_suspect" && f.independentLocalizationState === "independent_corroborated"')) {
    throw new Error("measurements.ts's independent-corroboration exception no longer matches this script's copy");
  }
}
verifyLiveSourceMatch();

function renderPathStrips(f) {
  // Byte-for-byte VideoOverlay.tsx policy (verified above).
  return f.boxOrigin === "predicted" || f.boxOrigin === "invalid" || f.boxOrigin === "frozen_suspect";
}
function sciencePathStrips(f) {
  // Byte-for-byte measurements.ts policy (verified above).
  const stripped = f.boxOrigin === "predicted" || f.boxOrigin === "invalid" || f.boxOrigin === "frozen_suspect";
  const independentlyCorroborated = f.boxOrigin === "frozen_suspect" && f.independentLocalizationState === "independent_corroborated";
  return stripped && !independentlyCorroborated;
}

function nativeFrameDuration(frames) {
  const deltas = [];
  for (let i = 1; i < frames.length; i++) {
    const d = frames[i].time - frames[i - 1].time;
    if (d > 0 && Number.isFinite(d)) deltas.push(d);
  }
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)];
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const out = path.join(root, ".p91a-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return origResolve.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};

const allResults = {};
const identities = {};

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

  // [MediaPipe numeric index, raw-artifact snake_case key] -- the raw pose
  // artifact stores keypoints as an OBJECT keyed by snake_case name (verified
  // directly against the real JSON: f.keypoints["left_shoulder"], not an
  // array), matching the pattern established in every prior phase's own
  // forensic scripts (Phase 8.0A/8.0B/8.1A/9.0A).
  const MP = [[0,"nose"],[11,"left_shoulder"],[12,"right_shoulder"],[13,"left_elbow"],[14,"right_elbow"],[15,"left_wrist"],[16,"right_wrist"],[23,"left_hip"],[24,"right_hip"],[25,"left_knee"],[26,"right_knee"],[27,"left_ankle"],[28,"right_ankle"],[29,"left_heel"],[30,"right_heel"],[31,"left_toe"],[32,"right_toe"]];

  for (const [label, { sessionId, posePath }] of Object.entries(BENCHMARKS)) {
    const { data: s, error } = await db.from("sessions").select("id, fps, fps_override, current_working_analysis_id, athlete_id").eq("id", sessionId).single();
    if (error) throw new Error(`${label}: ${error.message}`);

    const seq = JSON.parse(readFileSync(posePath, "utf8"));
    // Raw per-source-frame landmarks WITHOUT any stripping applied -- the true
    // artifact content (what MediaPipe/the worker actually persisted).
    // buildOverlayFrames expects a flat, MediaPipe-index-ordered array (index
    // 0-32), matching every other Phase 8.x/9.x forensic script's own
    // reconstruction pattern -- NOT an object keyed by joint name.
    const rawFrames = seq.frames.map((f) => {
      const landmarksArray = [];
      for (const [i, key] of MP) {
        const kp = f.keypoints[key];
        if (kp) landmarksArray[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score };
      }
      return {
        frame: f.index, sourceFrameIndex: f.sourceFrameIndex, time: f.tMs / 1000, keypoints: landmarksArray,
        boxOrigin: f.boxOrigin, trackState: f.trackState,
        identityContinuityScore: f.identityContinuityScore,
        independentLocalizationState: f.independentLocalizationState,
      };
    });
    // buildOverlayFrames applies its own (non-stripping) transforms -- angles,
    // etc -- but does NOT itself strip landmarks by boxOrigin (verified: that
    // stripping is applied by EACH CONSUMER -- VideoOverlay.tsx and
    // measurements.ts -- independently, not centrally). So `overlayFrames`
    // here still carries the RAW artifact's landmarks; the two stripping
    // policies are applied explicitly below, matching each real consumer.
    const overlayFrames = buildOverlayFrames({ ...seq, frames: rawFrames });
    const rawFps = Number(s.fps) || seq.fps;
    const normFps = normalizeFps(rawFps);
    const nativeDt = nativeFrameDuration(overlayFrames);

    const rows = overlayFrames.map((f, i) => {
      const jointPresence = {};
      for (const j of JOINTS) jointPresence[j] = Boolean(f.landmarks[j]);
      const rawLandmarkCount = Object.values(f.landmarks).filter(Boolean).length;

      const renderStripped = renderPathStrips(f);
      const scienceStripped = sciencePathStrips(f);
      const renderLandmarks = renderStripped ? {} : f.landmarks;
      const scienceLandmarks = scienceStripped ? {} : f.landmarks;
      const renderLandmarkCount = renderStripped ? 0 : rawLandmarkCount;
      const scienceLandmarkCount = scienceStripped ? 0 : rawLandmarkCount;

      // How many of the 14 skeleton bone segments COULD be drawn from the
      // render-path landmarks (both endpoints present)?
      const renderableBones = BONES.filter(([a, b]) => Boolean(renderLandmarks[a]) && Boolean(renderLandmarks[b])).length;

      // Classification per Part C's taxonomy, restricted to what this script
      // can determine from artifact + stripping-policy data alone (canvas/
      // paint-level classes E vs F vs G are refined by the browser/paint
      // trace scripts, not here).
      let classification;
      if (rawLandmarkCount === 0) classification = "POSE_ARTIFACT_MISSING"; // E
      else if (renderStripped) classification = "POSE_REJECTED"; // F
      else if (renderableBones === 0) classification = "POSE_ARTIFACT_MISSING"; // E (landmarks exist but no adjacent pair for any bone)
      else if (renderableBones < BONES.length) classification = "PARTIAL_SKELETON"; // B
      else classification = "FULL_SKELETON_VISIBLE"; // A

      return {
        index: i,
        sourceFrameIndex: f.sourceFrameIndex ?? f.frame,
        timeS: +f.time.toFixed(6),
        boxOrigin: f.boxOrigin ?? null,
        trackState: f.trackState ?? null,
        independentLocalizationState: f.independentLocalizationState ?? null,
        rawLandmarkCount,
        renderLandmarkCount,
        scienceLandmarkCount,
        renderStripped,
        scienceStripped,
        renderVsScienceDivergent: renderStripped && !scienceStripped,
        renderableBones,
        totalBones: BONES.length,
        jointPresence,
        classification,
      };
    });

    // --- Part D: dropout intervals (contiguous runs where render path shows
    // zero renderable bones -- i.e. classification E or F). ---
    const dropoutIntervals = [];
    let cur = null;
    for (const r of rows) {
      const isDropout = r.renderableBones === 0;
      if (isDropout) {
        if (!cur) cur = { startIndex: r.index, endIndex: r.index };
        else cur.endIndex = r.index;
      } else if (cur) {
        dropoutIntervals.push(cur);
        cur = null;
      }
    }
    if (cur) dropoutIntervals.push(cur);
    const dropoutDetail = dropoutIntervals.map((iv) => {
      const startRow = rows[iv.startIndex], endRow = rows[iv.endIndex];
      const before = rows[iv.startIndex - 1] ?? null;
      const after = rows[iv.endIndex + 1] ?? null;
      const frameCount = iv.endIndex - iv.startIndex + 1;
      const causes = new Set(rows.slice(iv.startIndex, iv.endIndex + 1).map((r) => r.classification));
      const divergentCount = rows.slice(iv.startIndex, iv.endIndex + 1).filter((r) => r.renderVsScienceDivergent).length;
      return {
        startSourceFrameIndex: startRow.sourceFrameIndex, endSourceFrameIndex: endRow.sourceFrameIndex,
        startTimeS: startRow.timeS, endTimeS: endRow.timeS,
        durationMs: +((endRow.timeS - startRow.timeS) * 1000).toFixed(3),
        frameCount,
        precedingGoodPoseFrame: before ? { sourceFrameIndex: before.sourceFrameIndex, timeS: before.timeS } : null,
        followingGoodPoseFrame: after ? { sourceFrameIndex: after.sourceFrameIndex, timeS: after.timeS } : null,
        classifications: [...causes],
        divergentCount, // frames where science would have kept pose but render stripped it
        divergentFraction: +(divergentCount / frameCount).toFixed(4),
      };
    });

    // --- Part E: per-joint coverage (against the RENDER path, since that's
    // what the coach actually sees). ---
    const jointCoverage = {};
    for (const j of JOINTS) {
      let available = 0;
      for (const r of rows) {
        const renderStripped = r.renderStripped;
        if (!renderStripped && r.jointPresence[j]) available++;
      }
      jointCoverage[j] = { available, unavailable: rows.length - available, coverageFraction: +(available / rows.length).toFixed(4) };
    }

    // --- summary stats ---
    const totalFrames = rows.length;
    const fullSkeleton = rows.filter((r) => r.classification === "FULL_SKELETON_VISIBLE").length;
    const partial = rows.filter((r) => r.classification === "PARTIAL_SKELETON").length;
    const missing = rows.filter((r) => r.classification === "POSE_ARTIFACT_MISSING").length;
    const rejected = rows.filter((r) => r.classification === "POSE_REJECTED").length;
    const divergentFrameCount = rows.filter((r) => r.renderVsScienceDivergent).length;
    const frozenSuspectCount = rows.filter((r) => r.boxOrigin === "frozen_suspect").length;
    const frozenSuspectCorroboratedCount = rows.filter((r) => r.boxOrigin === "frozen_suspect" && r.independentLocalizationState === "independent_corroborated").length;

    const summary = {
      label, sessionId, currentWorkingAnalysisId: s.current_working_analysis_id, athleteId: s.athlete_id,
      normFps, totalFrames, nativeFrameDurationS: nativeDt,
      fullSkeletonCoveragePct: +((fullSkeleton / totalFrames) * 100).toFixed(2),
      partialSkeletonCoveragePct: +((partial / totalFrames) * 100).toFixed(2),
      trueDropoutPct: +(((missing + rejected) / totalFrames) * 100).toFixed(2),
      dropoutIntervalCount: dropoutDetail.length,
      longestDropoutMs: dropoutDetail.length ? Math.max(...dropoutDetail.map((d) => d.durationMs)) : 0,
      totalDropoutDurationMs: +dropoutDetail.reduce((s2, d) => s2 + d.durationMs, 0).toFixed(3),
      frozenSuspectFrameCount: frozenSuspectCount,
      frozenSuspectPct: +((frozenSuspectCount / totalFrames) * 100).toFixed(2),
      frozenSuspectIndependentlyCorroboratedCount: frozenSuspectCorroboratedCount,
      renderVsScienceDivergentFrameCount: divergentFrameCount,
      renderVsScienceDivergentPct: +((divergentFrameCount / totalFrames) * 100).toFixed(2),
    };

    allResults[label] = { summary, dropoutIntervals: dropoutDetail, jointCoverage };
    identities[label] = {
      sessionId, currentWorkingAnalysisId: s.current_working_analysis_id, athleteId: s.athlete_id,
      sourceFps: rawFps, normFps, frameCount: totalFrames,
      firstTimestampS: overlayFrames[0]?.time ?? null, lastTimestampS: overlayFrames[overlayFrames.length - 1]?.time ?? null,
      posePath, poseArtifactSha256: null, // filled by shell wrapper if needed
    };

    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(summary, null, 2));

    writeFileSync(path.join(OUT_DIR, `${label}-pose-coverage-timeline.json`), JSON.stringify(rows, null, 2));
    writeFileSync(path.join(OUT_DIR, `${label}-dropout-intervals.json`), JSON.stringify(dropoutDetail, null, 2));
    writeFileSync(path.join(OUT_DIR, `${label}-joint-coverage.json`), JSON.stringify(jointCoverage, null, 2));
  }

  writeFileSync(path.join(OUT_DIR, "benchmark-identities.json"), JSON.stringify(identities, null, 2));
  writeFileSync(path.join(OUT_DIR, "cross-fps-summary.json"), JSON.stringify(Object.fromEntries(Object.entries(allResults).map(([k, v]) => [k, v.summary])), null, 2));
  console.log(`\nWrote tmp/phase91a/*.json`);
} finally {
  Module._resolveFilename = origResolve;
  rmSync(out, { recursive: true, force: true });
}
