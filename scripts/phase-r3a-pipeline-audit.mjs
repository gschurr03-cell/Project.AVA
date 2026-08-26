// Phase R3A -- comprehensive forensic pipeline audit for cross-FPS contact
// acquisition. Read-only against real, cached production pose artifacts
// (tmp/phase94/*.pose.json, the same Phase 9.4 fresh-rerun artifacts used
// throughout R1A-R2C). Uses the tsc-to-tmp-dir pattern to run REAL
// production functions (buildOverlayFrames, stripUnstableLandmarks,
// detectStepMarks) -- never modifies src/. Additionally requires an
// INSTRUMENTED COPY of steps.ts (written to the throwaway tmp dir only) to
// expose internal candidate/rejection state for Part G, since detectSide()
// is not exported -- the copy is verified byte-identical to the real file
// except for the additive instrumentation exports.
//
//   node scripts/phase-r3a-pipeline-audit.mjs
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync, cpSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(root, "tmp/phaseR3A");
mkdirSync(OUT_DIR, { recursive: true });

const BENCHMARKS = {
  gav: { pose: "tmp/phase94/gav.pose.json", sessionId: "e04a7983-7406-4a00-bb89-8ada7b10bf9f" },
  vanni60: { pose: "tmp/phase94/vanni60.pose.json", sessionId: "3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d" },
  vanni120: { pose: "tmp/phase94/vanni120.pose.json", sessionId: "160a86a2-c0db-4e7d-9fbe-82aedd6d3eff" },
  vanni240: { pose: "tmp/phase94/vanni240.pose.json", sessionId: "31fe352b-f00f-4a80-b20a-17c2ab08ec5a" },
};
const MP = [[0,"nose"],[11,"left_shoulder"],[12,"right_shoulder"],[13,"left_elbow"],[14,"right_elbow"],[15,"left_wrist"],[16,"right_wrist"],[23,"left_hip"],[24,"right_hip"],[25,"left_knee"],[26,"right_knee"],[27,"left_ankle"],[28,"right_ankle"],[29,"left_heel"],[30,"right_heel"],[31,"left_toe"],[32,"right_toe"]];
const MP_KEY_TO_OVERLAY = { left_ankle: "leftAnkle", right_ankle: "rightAnkle", left_heel: "leftHeel", right_heel: "rightHeel", left_toe: "leftFootIndex", right_toe: "rightFootIndex" };

// --- Build an instrumented throwaway copy of src/, adding named exports to
// steps.ts that expose detectSide's raw candidates/rejections without
// changing ANY existing line of behavior (purely additive, verified below). ---
const instrRoot = path.join(root, ".r3a-instrumented-src");
rmSync(instrRoot, { recursive: true, force: true });
mkdirSync(path.join(instrRoot, "src"), { recursive: true });
cpSync(path.join(root, "src"), path.join(instrRoot, "src"), { recursive: true });

const realStepsSrc = readFileSync(path.join(root, "src/lib/video/steps.ts"), "utf8");
const instrumentedMarker = "export function __r3a_detectSideInstrumented";
const instrumentedAddition = `
${instrumentedMarker}(
  frames: OverlayFrame[],
  side: StepSide,
  config: StepDetectionConfig = DEFAULT_STEP_CONFIG,
) {
  const joints = SIDE_FOOT_JOINTS[side];
  const samples = frames.map((f) => footSample(f, joints, config.minVisibility));
  const ys = samples.map((s) => (s ? s.y : NaN));
  const result = detectSide(frames, side, config);
  return { samples, ys, accepted: result.accepted, candidates: result.candidates };
}
`;
if (!realStepsSrc.includes("const SIDE_FOOT_JOINTS")) throw new Error("steps.ts internal shape changed -- re-audit instrumentation before trusting this script");
writeFileSync(path.join(instrRoot, "src/lib/video/steps.ts"), realStepsSrc + instrumentedAddition);

const out = path.join(root, ".r3a-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return origResolve.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};

const results = {};
try {
  writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
    compilerOptions: { outDir: out, rootDir: path.join(instrRoot, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, strict: false, moduleResolution: "node", baseUrl: instrRoot, paths: { "@/*": ["src/*"] }, noEmitOnError: false },
    files: [path.join(instrRoot, "src/lib/video/overlay.ts"), path.join(instrRoot, "src/lib/video/fps.ts"), path.join(instrRoot, "src/lib/video/steps.ts"), path.join(instrRoot, "src/lib/benchmark/measurements.ts")],
  }));
  try { execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (err) { const t = String(err.stdout ?? "") + String(err.stderr ?? ""); if (!/worldProjection\.ts/.test(t)) throw new Error(t); }

  const { buildOverlayFrames } = require(path.join(out, "lib/video/overlay.js"));
  const { applyFpsOverride, normalizeFps } = require(path.join(out, "lib/video/fps.js"));
  const { detectStepMarks, stripUnstableLandmarks, __r3a_detectSideInstrumented, DEFAULT_STEP_CONFIG } = require(path.join(out, "lib/video/steps.js"));

  for (const [label, b] of Object.entries(BENCHMARKS)) {
    const seq = JSON.parse(readFileSync(path.join(root, b.pose), "utf8"));
    const rawFrames = seq.frames.map((f) => {
      const landmarks = [];
      for (const [i, key] of MP) { const kp = f.keypoints[key]; if (kp) landmarks[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score }; }
      return { frame: f.index, sourceFrameIndex: f.sourceFrameIndex, time: f.tMs / 1000, landmarks, boxOrigin: f.boxOrigin, independentLocalizationState: f.independentLocalizationState };
    });
    const baseFrames = buildOverlayFrames({ ...seq, frames: rawFrames });
    const normFps = normalizeFps(seq.fps);
    const overlayFrames = applyFpsOverride(baseFrames, normFps);
    const strippedFrames = stripUnstableLandmarks(overlayFrames);

    // --- Pose-density-by-fps (Part L) ---
    const boxOriginCounts = {};
    let independentCorroboratedCount = 0;
    let noPoseCount = 0;
    for (const f of seq.frames) {
      const bo = f.boxOrigin ?? "none";
      boxOriginCounts[bo] = (boxOriginCounts[bo] ?? 0) + 1;
      if (f.boxOrigin === "frozen_suspect" && f.independentLocalizationState === "independent_corroborated") independentCorroboratedCount++;
      const hasAnyLandmark = MP.some(([, key]) => f.keypoints[key]);
      if (!hasAnyLandmark) noPoseCount++;
    }
    const durationS = seq.frames.length / seq.fps;

    // --- Foot-evidence-eligible frame count post-stripping ---
    let strippedEmptyCount = 0;
    for (const f of strippedFrames) if (Object.keys(f.landmarks).length === 0) strippedEmptyCount++;

    // --- First-frame-by-stage (Part D/I) ---
    function firstFrameWith(predicate) {
      for (let i = 0; i < seq.frames.length; i++) if (predicate(seq.frames[i])) return { index: i, sourceFrameIndex: seq.frames[i].sourceFrameIndex, tMs: seq.frames[i].tMs };
      return null;
    }
    const firstAnyLandmark = firstFrameWith((f) => MP.some(([, key]) => f.keypoints[key]));
    const firstUsableLocalization = firstFrameWith((f) => f.boxOrigin === "detected" || f.boxOrigin === "tracked" || f.boxOrigin === "reacquired" || (f.boxOrigin === "frozen_suspect" && f.independentLocalizationState === "independent_corroborated"));
    const firstLeftFootLandmark = firstFrameWith((f) => f.keypoints.left_ankle || f.keypoints.left_heel || f.keypoints.left_toe);
    const firstRightFootLandmark = firstFrameWith((f) => f.keypoints.right_ankle || f.keypoints.right_heel || f.keypoints.right_toe);
    const firstStrippedFootEvidenceIdx = strippedFrames.findIndex((f) => Object.keys(f.landmarks).length > 0);
    const firstStrippedFootEvidence = firstStrippedFootEvidenceIdx >= 0 ? { index: firstStrippedFootEvidenceIdx, sourceFrameIndex: strippedFrames[firstStrippedFootEvidenceIdx].sourceFrameIndex, time: strippedFrames[firstStrippedFootEvidenceIdx].time } : null;

    // --- Raw candidates + accepted contacts, BOTH sides, on stripped frames (the real science input) ---
    const leftInstr = __r3a_detectSideInstrumented(strippedFrames, "left", DEFAULT_STEP_CONFIG);
    const rightInstr = __r3a_detectSideInstrumented(strippedFrames, "right", DEFAULT_STEP_CONFIG);
    const firstAcceptedContact = [...leftInstr.accepted, ...rightInstr.accepted].sort((a, b) => a.time - b.time)[0] ?? null;
    const firstCandidate = [...leftInstr.candidates, ...rightInstr.candidates].sort((a, b) => a.time - b.time)[0] ?? null;

    // --- Final authoritative contacts (real detectStepMarks on stripped frames) ---
    const finalContacts = detectStepMarks(strippedFrames, DEFAULT_STEP_CONFIG);
    // Also on UNSTRIPPED frames, for comparison (what raw MediaPipe density alone would allow).
    const unstrippedContacts = detectStepMarks(overlayFrames, DEFAULT_STEP_CONFIG);

    results[label] = {
      fps: seq.fps,
      normalizedFps: normFps,
      frameCount: seq.frames.length,
      durationS,
      boxOriginCounts,
      independentCorroboratedCount,
      noPoseCount,
      strippedEmptyCount,
      framesPerSecond: { total: seq.fps, poseAvailablePerSec: ((seq.frames.length - noPoseCount) / durationS), scienceEligiblePerSec: ((seq.frames.length - strippedEmptyCount) / durationS) },
      firstFrameByStage: {
        firstAnyLandmark,
        firstUsableLocalization,
        firstLeftFootLandmark,
        firstRightFootLandmark,
        firstStrippedFootEvidence,
        firstCandidate: firstCandidate ? { side: firstCandidate.side, frame: firstCandidate.frame, time: firstCandidate.time, sourceFrameIndex: strippedFrames[firstCandidate.frame]?.sourceFrameIndex } : null,
        firstAcceptedContact: firstAcceptedContact ? { side: firstAcceptedContact.side, frame: firstAcceptedContact.frame, time: firstAcceptedContact.time, sourceFrameIndex: strippedFrames[firstAcceptedContact.frame]?.sourceFrameIndex } : null,
        firstAuthoritativeContact: finalContacts[0] ? { side: finalContacts[0].side, time: finalContacts[0].time, sourceFrameIndex: finalContacts[0].sourceFrameIndex } : null,
      },
      finalContacts: finalContacts.map((c) => ({ side: c.side, sourceFrameIndex: c.sourceFrameIndex, time: c.time, index: c.index })),
      unstrippedContactsCount: unstrippedContacts.length,
      finalContactsCount: finalContacts.length,
      rawCandidates: {
        left: leftInstr.candidates.map((c) => ({ frame: c.frame, sourceFrameIndex: strippedFrames[c.frame]?.sourceFrameIndex, time: c.time, prominence: c.prominence, vis: c.vis })),
        right: rightInstr.candidates.map((c) => ({ frame: c.frame, sourceFrameIndex: strippedFrames[c.frame]?.sourceFrameIndex, time: c.time, prominence: c.prominence, vis: c.vis })),
      },
    };
    console.log(`${label}: fps=${seq.fps} frames=${seq.frames.length} dur=${durationS.toFixed(3)}s finalContacts=${finalContacts.length} unstrippedContacts=${unstrippedContacts.length} firstAuthContact=${JSON.stringify(results[label].firstFrameByStage.firstAuthoritativeContact)}`);
  }

  writeFileSync(path.join(OUT_DIR, "pipeline-audit-raw.json"), JSON.stringify(results, null, 2));
  console.log(`\nWrote ${OUT_DIR}/pipeline-audit-raw.json`);
} finally {
  Module._resolveFilename = origResolve;
  rmSync(out, { recursive: true, force: true });
  rmSync(instrRoot, { recursive: true, force: true });
}
