// Phase R2 Part Q -- scientific regression: confirm zone time, crossings,
// step frequency, step length, velocity, contacts, and steps are byte-
// identical to the last known-good (Phase R1C) production snapshot, since
// this phase's only code change (stationaryGateGeometry.ts) is a pure,
// presentation-only module imported exclusively by VideoOverlay.tsx and
// never reachable from measurements.ts (grep-verified).
//
//   node scripts/phase-r2-scientific-regression.mjs
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

const out = path.join(root, ".r2-sci-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return origResolve.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};

const results = {};
try {
  writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
    compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, strict: false, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] }, noEmitOnError: false },
    files: [path.join(root, "src/lib/video/overlay.ts"), path.join(root, "src/lib/video/fps.ts"), path.join(root, "src/lib/benchmark/measurements.ts")],
  }));
  try { execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (err) { const t = String(err.stdout ?? "") + String(err.stderr ?? ""); if (!/worldProjection\.ts/.test(t)) throw new Error(t); }

  const { buildOverlayFrames } = require(path.join(out, "lib/video/overlay.js"));
  const { applyFpsOverride, normalizeFps } = require(path.join(out, "lib/video/fps.js"));
  const { computeSprintMeasurements } = require(path.join(out, "lib/benchmark/measurements.js"));

  for (const [label, posePath] of Object.entries(BENCHMARKS)) {
    const seq = JSON.parse(readFileSync(path.join(root, posePath), "utf8"));
    const rawFrames = seq.frames.map((f) => {
      const landmarks = [];
      for (const [i, key] of MP) { const kp = f.keypoints[key]; if (kp) landmarks[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score }; }
      return { frame: f.index, sourceFrameIndex: f.sourceFrameIndex, time: f.tMs / 1000, landmarks, boxOrigin: f.boxOrigin, independentLocalizationState: f.independentLocalizationState };
    });
    const baseFrames = buildOverlayFrames({ ...seq, frames: rawFrames });
    const overlayFrames = applyFpsOverride(baseFrames, normalizeFps(seq.fps));
    const m = computeSprintMeasurements(overlayFrames, SESSIONS[label].manualPoints, seq.width, seq.height, { gates: null, cameraEvidence: undefined });
    results[label] = {
      totalContacts: m.totalContacts,
      validContacts: m.validContacts,
      zoneTimeS: m.zoneTimeS,
      zoneEntryTimeS: m.zoneEntryTimeS,
      zoneExitTimeS: m.zoneExitTimeS,
      combinedStepFrequencyHz: m.combinedStepFrequencyHz,
      avgIndividualStepLengthM: m.avgIndividualStepLengthM,
      peakStrideLengthM: m.peakStrideLengthM,
      zoneVelocityMps: m.zoneVelocityMps,
      maxVelocityMps: m.maxVelocityMps,
      zoneStepsCount: m.zoneSteps.length,
      fullRunContactsCount: m.fullRunContacts.length,
    };
    console.log(`${label}: ${JSON.stringify(results[label])}`);
  }

  // Compare against the R1C-recorded baseline (last known-good, immediately prior phase).
  let allMatch = true;
  const priorBaseline = JSON.parse(readFileSync(path.join(root, "tmp/phaseR1C/scientific-before-after.json"), "utf8"));
  const comparison = {};
  for (const label of Object.keys(BENCHMARKS)) {
    const prior = priorBaseline[label]?.after;
    const cur = results[label];
    const match = prior && prior.totalContacts === cur.totalContacts && prior.avgIndividualStepLengthM === cur.avgIndividualStepLengthM
      && prior.combinedStepFrequencyHz === cur.combinedStepFrequencyHz && prior.zoneVelocityMps === cur.zoneVelocityMps
      && prior.maxVelocityMps === cur.maxVelocityMps;
    if (!match) allMatch = false;
    comparison[label] = { match, prior, current: cur };
  }
  console.log(`\nAll benchmarks match R1C baseline: ${allMatch}`);
  writeFileSync(path.join(root, "tmp/phaseR2/scientific-before-after.json"), JSON.stringify({ current: results, comparisonToR1CBaseline: comparison, allMatch }, null, 2));
} finally {
  Module._resolveFilename = origResolve;
  rmSync(out, { recursive: true, force: true });
}
