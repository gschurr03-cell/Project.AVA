// Phase R1C Part O -- proves the R1C code changes to measurements.ts (adding
// `fullRunContacts` + extracting the stripping logic into the shared
// `stripUnstableLandmarks` helper) did NOT alter any existing scientific
// value. Builds a throwaway "pre-R1C" copy of measurements.ts by reverting
// just the R1C diff (never touches the real src file), compiles BOTH the
// real current file and the reverted copy, and diffs every scientific field
// (everything except the new `fullRunContacts`) across all 4 benchmarks.
//
//   node scripts/phase-r1c-scientific-isolation.mjs
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync, cpSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(root, "tmp/phaseR1C");
mkdirSync(OUT_DIR, { recursive: true });

const BENCHMARKS = {
  gav: "tmp/phase94/gav.pose.json",
  vanni60: "tmp/phase94/vanni60.pose.json",
  vanni120: "tmp/phase94/vanni120.pose.json",
  vanni240: "tmp/phase94/vanni240.pose.json",
};
const SESSIONS = {
  gav: { manualPoints: { ax: 0.15161721103162656, ay: 0, bx: 0.8780767601656627, by: 0, distanceM: 20, aTimeS: 0, bTimeS: 0 } },
  vanni60: { manualPoints: { ax: 0.08142732928796757, ay: 0, bx: 0.946234230546805, by: 0, distanceM: 20, aTimeS: 0, bTimeS: 0 } },
  vanni120: { manualPoints: { ax: 0.10577478682035367, ay: 0, bx: 0.9168633383365116, by: 0, distanceM: 20, aTimeS: 0, bTimeS: 0 } },
  vanni240: { manualPoints: { ax: 0.13677243885987378, ay: 0, bx: 0.8819358989140236, by: 0, distanceM: 20, aTimeS: 0, bTimeS: 0 } },
};
const MP = [[0,"nose"],[11,"left_shoulder"],[12,"right_shoulder"],[13,"left_elbow"],[14,"right_elbow"],[15,"left_wrist"],[16,"right_wrist"],[23,"left_hip"],[24,"right_hip"],[25,"left_knee"],[26,"right_knee"],[27,"left_ankle"],[28,"right_ankle"],[29,"left_heel"],[30,"right_heel"],[31,"left_toe"],[32,"right_toe"]];

function buildFrames(seq) {
  return seq.frames.map((f) => {
    const landmarks = [];
    for (const [i, key] of MP) { const kp = f.keypoints[key]; if (kp) landmarks[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score }; }
    return { frame: f.index, sourceFrameIndex: f.sourceFrameIndex, time: f.tMs / 1000, landmarks, boxOrigin: f.boxOrigin, independentLocalizationState: f.independentLocalizationState };
  });
}

function compileAndRun(label, srcRoot) {
  const out = path.join(root, `.r1c-iso-${label}-tmp`);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (r, ...rest) {
    return origResolve.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
  };
  try {
    writeFileSync(
      path.join(out, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { outDir: out, rootDir: path.join(srcRoot, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, strict: false, moduleResolution: "node", baseUrl: srcRoot, paths: { "@/*": ["src/*"] }, noEmitOnError: false },
        files: [path.join(srcRoot, "src/lib/video/overlay.ts"), path.join(srcRoot, "src/lib/video/fps.ts"), path.join(srcRoot, "src/lib/video/steps.ts"), path.join(srcRoot, "src/lib/benchmark/measurements.ts")],
      }),
    );
    try { execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (err) { const t = String(err.stdout ?? "") + String(err.stderr ?? ""); if (!/worldProjection\.ts/.test(t)) throw new Error(t); }

    const { buildOverlayFrames } = require(path.join(out, "lib/video/overlay.js"));
    const { applyFpsOverride, normalizeFps } = require(path.join(out, "lib/video/fps.js"));
    const { computeSprintMeasurements } = require(path.join(out, "lib/benchmark/measurements.js"));

    const results = {};
    for (const [benchLabel, posePath] of Object.entries(BENCHMARKS)) {
      const seq = JSON.parse(readFileSync(path.join(root, posePath), "utf8"));
      const rawFrames = buildFrames(seq);
      const baseFrames = buildOverlayFrames({ ...seq, frames: rawFrames });
      const normFps = normalizeFps(seq.fps);
      const overlayFrames = applyFpsOverride(baseFrames, normFps);
      const m = computeSprintMeasurements(overlayFrames, SESSIONS[benchLabel].manualPoints, seq.width, seq.height, { gates: null, cameraEvidence: undefined });
      const { fullRunContacts, ...rest } = m;
      results[benchLabel] = rest;
    }
    return results;
  } finally {
    Module._resolveFilename = origResolve;
    rmSync(out, { recursive: true, force: true });
  }
}

// 1. AFTER (current, real src -- unmodified by this script).
const after = compileAndRun("post", root);

// 2. BEFORE -- a throwaway copy of src/ with JUST the R1C measurements.ts
// diff reverted (inline stripping restored, fullRunContacts field/return
// line removed). The real src/ directory is never touched.
const preRoot = path.join(root, ".r1c-iso-preroot");
rmSync(preRoot, { recursive: true, force: true });
mkdirSync(path.join(preRoot, "src/lib/benchmark"), { recursive: true });
mkdirSync(path.join(preRoot, "src/lib/video"), { recursive: true });
cpSync(path.join(root, "src"), path.join(preRoot, "src"), { recursive: true });

let measurementsSrc = readFileSync(path.join(root, "src/lib/benchmark/measurements.ts"), "utf8");
measurementsSrc = measurementsSrc.replace(
  `import { type StepMark, type StepSide, type StepDistanceScale, stripUnstableLandmarks } from "@/lib/video/steps";`,
  `import { type StepMark, type StepSide, type StepDistanceScale } from "@/lib/video/steps";`,
);
measurementsSrc = measurementsSrc.replace(
  /  \/\*\* Phase R1C — the SAME authoritative[\s\S]*?\n  fullRunContacts: StepMark\[\];\n\n/,
  "",
);
measurementsSrc = measurementsSrc.replace(
  /  \/\/ Phase R1C: this stripping pass is now the shared `stripUnstableLandmarks`[\s\S]*?const frames = stripUnstableLandmarks\(rawFrames\);/,
  `  const frames = rawFrames.map((f) => {
    const stripped = f.boxOrigin === "predicted" || f.boxOrigin === "invalid" || f.boxOrigin === "frozen_suspect";
    const independentlyCorroborated =
      f.boxOrigin === "frozen_suspect" && f.independentLocalizationState === "independent_corroborated";
    return stripped && !independentlyCorroborated ? { ...f, landmarks: {} } : f;
  });`,
);
measurementsSrc = measurementsSrc.replace(/\n {4}fullRunContacts: fullRun\.contacts,/, "");
if (measurementsSrc.includes("stripUnstableLandmarks") || measurementsSrc.includes("fullRunContacts")) {
  throw new Error("Revert incomplete -- pre-R1C copy still references R1C-only symbols");
}
writeFileSync(path.join(preRoot, "src/lib/benchmark/measurements.ts"), measurementsSrc);

const before = compileAndRun("pre", preRoot);
rmSync(preRoot, { recursive: true, force: true });

// Diff every field (fullRunContacts already excluded) via JSON deep-equal per benchmark.
const report = {};
let anyDiff = false;
for (const bench of Object.keys(BENCHMARKS)) {
  const b = JSON.stringify(before[bench]);
  const a = JSON.stringify(after[bench]);
  const identical = b === a;
  if (!identical) anyDiff = true;
  report[bench] = {
    identical,
    before: {
      totalContacts: before[bench].totalContacts,
      validContacts: before[bench].validContacts,
      zoneStepsCount: before[bench].zoneSteps.length,
      avgIndividualStepLengthM: before[bench].avgIndividualStepLengthM,
      peakStrideLengthM: before[bench].peakStrideLengthM,
      combinedStepFrequencyHz: before[bench].combinedStepFrequencyHz,
      zoneVelocityMps: before[bench].zoneVelocityMps,
      maxVelocityMps: before[bench].maxVelocityMps,
    },
    after: {
      totalContacts: after[bench].totalContacts,
      validContacts: after[bench].validContacts,
      zoneStepsCount: after[bench].zoneSteps.length,
      avgIndividualStepLengthM: after[bench].avgIndividualStepLengthM,
      peakStrideLengthM: after[bench].peakStrideLengthM,
      combinedStepFrequencyHz: after[bench].combinedStepFrequencyHz,
      zoneVelocityMps: after[bench].zoneVelocityMps,
      maxVelocityMps: after[bench].maxVelocityMps,
    },
  };
  console.log(`${bench}: identical=${identical} contacts=${before[bench].totalContacts}->${after[bench].totalContacts} avgStepLen=${before[bench].avgIndividualStepLengthM}->${after[bench].avgIndividualStepLengthM} freq=${before[bench].combinedStepFrequencyHz}->${after[bench].combinedStepFrequencyHz} zoneVel=${before[bench].zoneVelocityMps}->${after[bench].zoneVelocityMps} maxVel=${before[bench].maxVelocityMps}->${after[bench].maxVelocityMps}`);
}

writeFileSync(path.join(OUT_DIR, "scientific-before-after.json"), JSON.stringify(report, null, 2));
console.log(`\nAll benchmarks scientifically identical before/after: ${!anyDiff}`);
console.log(`Wrote ${OUT_DIR}/scientific-before-after.json`);
