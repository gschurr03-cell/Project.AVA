// Phase R3A Part E/F/G/K -- for every contact present in the UNSTRIPPED
// (full pose, no quality gating) detection but absent from the final
// authoritative (stripped) detection, trace the first failing stage:
// stripped-away landmarks (QUALITY_GATE) vs. survived-but-lost-to-temporal-
// filter (STATE_MACHINE), using the real production functions plus the
// same instrumented-copy technique as phase-r3a-pipeline-audit.mjs.
//
//   node scripts/phase-r3a-missing-contact-trace.mjs
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
  gav: "tmp/phase94/gav.pose.json",
  vanni60: "tmp/phase94/vanni60.pose.json",
  vanni120: "tmp/phase94/vanni120.pose.json",
  vanni240: "tmp/phase94/vanni240.pose.json",
};
const MP = [[0,"nose"],[11,"left_shoulder"],[12,"right_shoulder"],[13,"left_elbow"],[14,"right_elbow"],[15,"left_wrist"],[16,"right_wrist"],[23,"left_hip"],[24,"right_hip"],[25,"left_knee"],[26,"right_knee"],[27,"left_ankle"],[28,"right_ankle"],[29,"left_heel"],[30,"right_heel"],[31,"left_toe"],[32,"right_toe"]];

const instrRoot = path.join(root, ".r3a-instrumented-src2");
rmSync(instrRoot, { recursive: true, force: true });
mkdirSync(path.join(instrRoot, "src"), { recursive: true });
cpSync(path.join(root, "src"), path.join(instrRoot, "src"), { recursive: true });
const realStepsSrc = readFileSync(path.join(root, "src/lib/video/steps.ts"), "utf8");
if (!realStepsSrc.includes("const SIDE_FOOT_JOINTS")) throw new Error("steps.ts shape changed");
writeFileSync(path.join(instrRoot, "src/lib/video/steps.ts"), realStepsSrc + `
export function __r3a_detectSideInstrumented(frames, side, config = DEFAULT_STEP_CONFIG) {
  return detectSide(frames, side, config);
}
`);

const out = path.join(root, ".r3a-tmp2");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return origResolve.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};

const traces = {};
try {
  writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
    compilerOptions: { outDir: out, rootDir: path.join(instrRoot, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, strict: false, moduleResolution: "node", baseUrl: instrRoot, paths: { "@/*": ["src/*"] }, noEmitOnError: false },
    files: [path.join(instrRoot, "src/lib/video/overlay.ts"), path.join(instrRoot, "src/lib/video/fps.ts"), path.join(instrRoot, "src/lib/video/steps.ts")],
  }));
  try { execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (err) { const t = String(err.stdout ?? "") + String(err.stderr ?? ""); if (!/worldProjection\.ts/.test(t)) throw new Error(t); }

  const { buildOverlayFrames } = require(path.join(out, "lib/video/overlay.js"));
  const { applyFpsOverride, normalizeFps } = require(path.join(out, "lib/video/fps.js"));
  const { detectStepMarks, stripUnstableLandmarks, __r3a_detectSideInstrumented, DEFAULT_STEP_CONFIG } = require(path.join(out, "lib/video/steps.js"));

  for (const [label, posePath] of Object.entries(BENCHMARKS)) {
    const seq = JSON.parse(readFileSync(path.join(root, posePath), "utf8"));
    const rawFrames = seq.frames.map((f) => {
      const landmarks = [];
      for (const [i, key] of MP) { const kp = f.keypoints[key]; if (kp) landmarks[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score }; }
      return { frame: f.index, sourceFrameIndex: f.sourceFrameIndex, time: f.tMs / 1000, landmarks, boxOrigin: f.boxOrigin, independentLocalizationState: f.independentLocalizationState };
    });
    const baseFrames = buildOverlayFrames({ ...seq, frames: rawFrames });
    const overlayFrames = applyFpsOverride(baseFrames, normalizeFps(seq.fps));
    const strippedFrames = stripUnstableLandmarks(overlayFrames);

    const unstrippedFinal = detectStepMarks(overlayFrames, DEFAULT_STEP_CONFIG);
    const strippedFinal = detectStepMarks(strippedFrames, DEFAULT_STEP_CONFIG);

    const idOf = (c) => `${c.sourceFrameIndex}-${c.side}`;
    const strippedIds = new Set(strippedFinal.map(idOf));
    const missingFromFinal = unstrippedFinal.filter((c) => !strippedIds.has(idOf(c)));

    // Raw candidates on STRIPPED frames, both sides -- to check if a candidate
    // survived stripping near each missing contact's time.
    const leftCand = __r3a_detectSideInstrumented(strippedFrames, "left", DEFAULT_STEP_CONFIG).candidates;
    const rightCand = __r3a_detectSideInstrumented(strippedFrames, "right", DEFAULT_STEP_CONFIG).candidates;
    const allStrippedCandidates = [...leftCand, ...rightCand];

    const benchTraces = missingFromFinal.map((missing) => {
      const rawFrame = seq.frames.find((f) => f.sourceFrameIndex === missing.sourceFrameIndex);
      const strippedOverlayFrame = strippedFrames.find((f) => f.sourceFrameIndex === missing.sourceFrameIndex);
      const landmarksSurvivedStripping = strippedOverlayFrame && Object.keys(strippedOverlayFrame.landmarks).length > 0;
      // Was there a same-side candidate within +/-3 frames post-stripping (i.e. detectSide still SAW something nearby)?
      const nearbyStrippedCandidate = allStrippedCandidates.find((c) => c.side === missing.side && Math.abs(c.time - missing.time) < 0.05);
      const firstFailingStage = !landmarksSurvivedStripping
        ? "QUALITY_GATE (stripUnstableLandmarks removed this frame's landmarks before candidate generation)"
        : nearbyStrippedCandidate
          ? "STATE_MACHINE (candidate survived stripping and generation, but was rejected/suppressed by same-side or cross-foot filtering)"
          : "CANDIDATE_GENERATION (landmarks survived stripping, but no local-maximum candidate formed near this time -- likely smoothing/amplitude/visibility)";
      return {
        side: missing.side,
        sourceFrameIndex: missing.sourceFrameIndex,
        time: missing.time,
        rawBoxOrigin: rawFrame?.boxOrigin ?? null,
        rawIndependentLocalizationState: rawFrame?.independentLocalizationState ?? null,
        landmarksSurvivedStripping: !!landmarksSurvivedStripping,
        nearbyStrippedCandidateFound: !!nearbyStrippedCandidate,
        firstFailingStage,
        rawLandmarks: rawFrame ? Object.fromEntries(["left_ankle","right_ankle","left_heel","right_heel","left_toe","right_toe"].map((k) => [k, rawFrame.keypoints[k] ? { x: rawFrame.keypoints[k].x, y: rawFrame.keypoints[k].y, visibility: rawFrame.keypoints[k].visibility ?? rawFrame.keypoints[k].score } : null])) : null,
      };
    });

    traces[label] = {
      unstrippedFinalCount: unstrippedFinal.length,
      strippedFinalCount: strippedFinal.length,
      missingCount: missingFromFinal.length,
      missing: benchTraces,
    };
    console.log(`${label}: unstripped=${unstrippedFinal.length} stripped=${strippedFinal.length} missing=${missingFromFinal.length}`);
    for (const t of benchTraces) console.log(`  ${t.side}@sourceFrame${t.sourceFrameIndex} t=${t.time.toFixed(4)}s -- ${t.firstFailingStage}`);
  }

  writeFileSync(path.join(OUT_DIR, "missing-contact-traces-raw.json"), JSON.stringify(traces, null, 2));
  console.log(`\nWrote ${OUT_DIR}/missing-contact-traces-raw.json`);
} finally {
  Module._resolveFilename = origResolve;
  rmSync(out, { recursive: true, force: true });
  rmSync(instrRoot, { recursive: true, force: true });
}
