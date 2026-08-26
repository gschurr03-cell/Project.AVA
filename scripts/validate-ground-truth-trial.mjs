// Phase R4C — ground-truth validation runner (Parts T/U/V/W). VALIDATION/
// REPORTING ONLY: recomputes AVA's numbers from a pose artifact + saved
// calibration gates (the same path R4A/R4B's own scripts use — no analysis
// math is touched) in BOTH LEGACY_2D and CANONICAL_LONGITUDINAL, then grades
// each independently against a ground-truth trial fixture. Never writes to
// the DB, never changes which model production uses.
//
//   node scripts/validate-ground-truth-trial.mjs --trial <trial.json> --pose <artifact.json> --gates <calibration-gates.json> [--out <dir>]
//
// See docs/ava-ground-truth-field-testing-protocol.md for how to produce a
// real trial fixture, and src/lib/validation/groundTruthTrial.ts for its
// schema. `validation/ground-truth/*.synthetic.json` are clearly-labeled
// SYNTHETIC fixtures that only prove this runner works — see Part X; they
// are never scientific validation evidence.
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MP_INDEX_TO_JOINT = [
  [0, "nose"], [11, "left_shoulder"], [12, "right_shoulder"],
  [13, "left_elbow"], [14, "right_elbow"], [15, "left_wrist"], [16, "right_wrist"],
  [23, "left_hip"], [24, "right_hip"], [25, "left_knee"], [26, "right_knee"],
  [27, "left_ankle"], [28, "right_ankle"], [29, "left_heel"], [30, "right_heel"],
  [31, "left_toe"], [32, "right_toe"],
];

export function parseArgs(argv) {
  const args = { trial: null, pose: null, gates: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--trial") args.trial = argv[++i];
    else if (a === "--pose") args.pose = argv[++i];
    else if (a === "--gates") args.gates = argv[++i];
    else if (a === "--out") args.out = argv[++i];
  }
  return args;
}

/** Same contact identity scheme used throughout `measurements.ts` (`contactId(mark)`). */
export function contactIdOf(mark) {
  return `contact-${mark.sourceFrameIndex}-${mark.side}-${mark.index}`;
}

/** Builds the AVA-side interval map keyed "fromContactId->toContactId" from AVA's own ordered zoneSteps sequence. */
export function buildIntervalMap(zoneSteps) {
  const map = new Map();
  for (let i = 1; i < zoneSteps.length; i++) {
    map.set(`${zoneSteps[i - 1].contactId}->${zoneSteps[i].contactId}`, zoneSteps[i].stepLengthM ?? null);
  }
  return map;
}

export async function compileAndRun(posePath, gatesPath) {
  const out = path.join(root, `.r4c-tmp-compile-${process.pid}`);
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
        compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, strict: false, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] }, noEmitOnError: false },
        files: [
          path.join(root, "src/lib/video/overlay.ts"),
          path.join(root, "src/lib/video/fps.ts"),
          path.join(root, "src/lib/video/steps.ts"),
          path.join(root, "src/lib/benchmark/measurements.ts"),
          path.join(root, "src/lib/benchmark/measurementModel.ts"),
          path.join(root, "src/lib/calibration/gates.ts"),
          path.join(root, "src/lib/video/zoneStepAnalysis.ts"),
          path.join(root, "src/lib/video/worldProjection.ts"),
          path.join(root, "src/lib/calibration/zoneAnchors.ts"),
          path.join(root, "src/lib/validation/groundTruthTrial.ts"),
          path.join(root, "src/lib/validation/groundTruthMatching.ts"),
          path.join(root, "src/lib/validation/groundTruthMetrics.ts"),
        ],
      }),
    );
    try {
      execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      const t = String(err.stdout ?? "") + String(err.stderr ?? "");
      if (!/worldProjection\.ts|zoneAnchors\.ts/.test(t)) throw new Error(t);
    }

    const { buildOverlayFrames } = require(path.join(out, "lib/video/overlay.js"));
    const { applyFpsOverride, normalizeFps } = require(path.join(out, "lib/video/fps.js"));
    const { computeSprintMeasurements } = require(path.join(out, "lib/benchmark/measurements.js"));
    const { gatesToManualPoints } = require(path.join(out, "lib/calibration/gates.js"));
    const { MEASUREMENT_MODEL_CANONICAL_LONGITUDINAL } = require(path.join(out, "lib/benchmark/measurementModel.js"));
    const { groundTruthTrialSchema } = require(path.join(out, "lib/validation/groundTruthTrial.js"));
    const { matchContacts, contactDetectionStats } = require(path.join(out, "lib/validation/groundTruthMatching.js"));
    const { alignStepLengthErrors, computeGroundTruthStepLengths, computePositionErrors, computeGroundTruthFrequencyHz, compareStepFrequency, compareTiming, compareAverageVelocity, comparePeakVelocity, summarizeErrors, classifyAgainstUncertainty } = require(path.join(out, "lib/validation/groundTruthMetrics.js"));

    const seq = JSON.parse(readFileSync(posePath, "utf8"));
    const rawFrames = seq.frames.map((f) => {
      const landmarks = [];
      for (const [i, key] of MP_INDEX_TO_JOINT) {
        const kp = f.keypoints?.[key];
        if (kp) landmarks[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score };
      }
      return { frame: f.index, sourceFrameIndex: f.sourceFrameIndex ?? f.index, time: f.tMs / 1000, landmarks, boxOrigin: f.boxOrigin, trackState: f.trackState, identityContinuityScore: f.identityContinuityScore };
    });
    const baseFrames = buildOverlayFrames({ fps: seq.fps, width: seq.width, height: seq.height, backend: "mediapipe", frames: rawFrames });
    const overlayFrames = applyFpsOverride(baseFrames, normalizeFps(seq.fps));
    const gates = JSON.parse(readFileSync(gatesPath, "utf8"));
    const manualPoints = gatesToManualPoints(gates);

    const legacy = computeSprintMeasurements(overlayFrames, manualPoints, seq.width, seq.height, { gates, cameraEvidence: undefined });
    const canonical = computeSprintMeasurements(overlayFrames, manualPoints, seq.width, seq.height, { gates, cameraEvidence: undefined, measurementModelVersion: MEASUREMENT_MODEL_CANONICAL_LONGITUDINAL });

    return {
      legacy, canonical,
      lib: { matchContacts, contactDetectionStats, alignStepLengthErrors, computeGroundTruthStepLengths, computePositionErrors, computeGroundTruthFrequencyHz, compareStepFrequency, compareTiming, compareAverageVelocity, comparePeakVelocity, summarizeErrors, classifyAgainstUncertainty, groundTruthTrialSchema },
    };
  } finally {
    Module._resolveFilename = origResolve;
    rmSync(out, { recursive: true, force: true });
  }
}

/** Grades one model (legacy or canonical result object) against a validated ground-truth trial. Pure. */
export function gradeModel(modelName, result, trial, lib) {
  const avaContacts = result.fullRunContacts.map((m) => ({ contactId: contactIdOf(m), side: m.side, timeS: m.time }));
  const matches = lib.matchContacts(
    trial.contacts.map((c) => ({ contactNumber: c.contactNumber, side: c.side, timestampS: c.timestampS })),
    avaContacts,
  );
  const detection = lib.contactDetectionStats(matches);

  const gtSteps = lib.computeGroundTruthStepLengths(trial.contacts.map((c) => ({ contactNumber: c.contactNumber, sGroundTruthM: c.sGroundTruthM })));
  const intervalMap = buildIntervalMap(result.zoneSteps);
  const stepLengthRows = lib.alignStepLengthErrors(gtSteps, matches, intervalMap);
  const comparableSteps = stepLengthRows.filter((r) => r.comparable);
  const stepLengthSummaryCm = lib.summarizeErrors(comparableSteps.map((r) => r.errorCm));

  let positionRows = [];
  let positionSummaryCm = lib.summarizeErrors([]);
  if (modelName === "CANONICAL_LONGITUDINAL" && result.zoneStepSummary) {
    const sAvaByContactId = new Map(result.zoneStepSummary.contacts.map((c) => [c.id, c.longitudinalM]));
    positionRows = lib.computePositionErrors(trial.contacts.map((c) => ({ contactNumber: c.contactNumber, sGroundTruthM: c.sGroundTruthM })), matches, sAvaByContactId);
    positionSummaryCm = lib.summarizeErrors(positionRows.map((r) => r.errorCm));
  }

  const gtFrequencyHz = lib.computeGroundTruthFrequencyHz(trial.contacts.map((c) => ({ timestampS: c.timestampS })));
  const frequencyComparison = lib.compareStepFrequency(gtFrequencyHz, result.combinedStepFrequencyHz);

  const timingComparison = trial.timing
    ? lib.compareTiming(trial.timing, { entryTimeS: result.zoneEntryTimeS, exitTimeS: result.zoneExitTimeS, zoneTimeS: result.zoneTimeS })
    : [];

  const avgVelocityComparison = trial.timing ? lib.compareAverageVelocity(trial.zoneLengthMeters, trial.timing.zoneTimeS, result.zoneVelocityMps) : { gtValue: null, avaValue: result.zoneVelocityMps, errorAbs: null, errorPercent: null };

  const peakVelocityComparison = lib.comparePeakVelocity(trial.peakVelocity, result.maxVelocityMps);

  const uncertaintyByGtNumber = new Map(trial.contacts.map((c) => [c.contactNumber, c.uncertaintyM]));
  const positionUncertaintyClassification = positionRows.map((r) => ({
    gtContactNumber: r.gtContactNumber,
    errorCm: r.errorCm,
    classification: lib.classifyAgainstUncertainty(r.errorM, uncertaintyByGtNumber.get(r.gtContactNumber) ?? null),
  }));

  return {
    model: modelName,
    measurementModelVersion: result.measurementModelVersion,
    contactDetection: detection,
    matches,
    stepLength: { rows: stepLengthRows, summaryCm: stepLengthSummaryCm },
    position: { rows: positionRows, summaryCm: positionSummaryCm, available: modelName === "CANONICAL_LONGITUDINAL", unavailableReason: modelName === "LEGACY_2D" ? "LEGACY_2D has no native per-contact longitudinal coordinate — only pairwise 2D step distance" : undefined },
    stepFrequency: { gtHz: gtFrequencyHz, avaDisplayedHz: result.combinedStepFrequencyHz, comparison: frequencyComparison },
    timing: timingComparison,
    averageVelocity: avgVelocityComparison,
    peakVelocity: peakVelocityComparison,
    positionUncertaintyClassification,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.trial || !args.pose || !args.gates) {
    console.error("usage: node scripts/validate-ground-truth-trial.mjs --trial <trial.json> --pose <artifact.json> --gates <calibration-gates.json> [--out <dir>]");
    process.exit(1);
  }
  const trialPath = path.resolve(args.trial);
  const posePath = path.resolve(args.pose);
  const gatesPath = path.resolve(args.gates);
  for (const p of [trialPath, posePath, gatesPath]) {
    if (!existsSync(p)) { console.error(`error: not found: ${p}`); process.exit(1); }
  }

  const { legacy, canonical, lib } = await compileAndRun(posePath, gatesPath);
  const rawTrial = JSON.parse(readFileSync(trialPath, "utf8"));
  const trial = lib.groundTruthTrialSchema.parse(rawTrial);

  const legacyGrade = gradeModel("LEGACY_2D", legacy, trial, lib);
  const canonicalGrade = gradeModel("CANONICAL_LONGITUDINAL", canonical, trial, lib);

  console.log("=".repeat(90));
  console.log(`Ground-truth validation — trial "${trial.trialId}" (${trial.athlete ?? "unknown athlete"})`);
  console.log(`zoneLengthMeters=${trial.zoneLengthMeters}  fps=${trial.fps ?? "?"}  contacts=${trial.contacts.length}`);
  console.log("=".repeat(90));

  for (const grade of [legacyGrade, canonicalGrade]) {
    console.log(`\n-- ${grade.model} --`);
    console.log(`contact detection: TP=${grade.contactDetection.truePositives} FP=${grade.contactDetection.falsePositives} FN=${grade.contactDetection.falseNegatives} AMBIGUOUS=${grade.contactDetection.ambiguous}  P=${fmt(grade.contactDetection.precision)} R=${fmt(grade.contactDetection.recall)} F1=${fmt(grade.contactDetection.f1)}`);
    if (grade.stepLength.rows.length) {
      console.log("  STEP | GT(m)   | MODEL(m) | ERROR(cm) | %ERR");
      for (const r of grade.stepLength.rows) {
        console.log(`  ${String(r.fromContactNumber).padStart(2)}->${String(r.toContactNumber).padEnd(2)} | ${f3(r.gtStepLengthM)} | ${f3(r.modelStepLengthM)} | ${fsgn(r.errorCm)} | ${r.percentError == null ? "—" : r.percentError.toFixed(1) + "%"}${r.comparable ? "" : `  (${r.reason})`}`);
      }
      console.log(`  step-length |error| cm: mean=${fmt(grade.stepLength.summaryCm.mae)} median=${fmt(grade.stepLength.summaryCm.medianAbsError)} p95=${fmt(grade.stepLength.summaryCm.p95AbsError)} max=${fmt(grade.stepLength.summaryCm.maxAbsError)} n=${grade.stepLength.summaryCm.n}`);
    }
    if (grade.position.available) {
      console.log(`  position |error| cm: mean=${fmt(grade.position.summaryCm.mae)} median=${fmt(grade.position.summaryCm.medianAbsError)} max=${fmt(grade.position.summaryCm.maxAbsError)} n=${grade.position.summaryCm.n}`);
    } else {
      console.log(`  position error: unavailable — ${grade.position.unavailableReason}`);
    }
    console.log(`  step frequency: GT=${fmt(grade.stepFrequency.gtHz)}Hz AVA(displayed)=${fmt(grade.stepFrequency.avaDisplayedHz)}Hz err=${fmt(grade.stepFrequency.comparison.errorAbs)}Hz`);
    for (const t of grade.timing) console.log(`  ${t.metric}: GT=${fmt(t.gtS, 3)}s AVA=${fmt(t.avaS, 3)}s err=${fmt(t.errorMs, 1)}ms`);
    console.log(`  average velocity: GT=${fmt(grade.averageVelocity.gtValue)} AVA=${fmt(grade.averageVelocity.avaValue)} err=${fmt(grade.averageVelocity.errorAbs)}m/s`);
    console.log(`  peak velocity: available=${grade.peakVelocity.available} (${grade.peakVelocity.reason})`);
  }

  const outDir = args.out ? path.resolve(args.out) : path.join(root, "tmp/phaseR4C");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, `validation-result-${trial.trialId}.json`), JSON.stringify({ trialId: trial.trialId, legacy: legacyGrade, canonical: canonicalGrade }, null, 2));
  console.log(`\nWrote ${path.join(outDir, `validation-result-${trial.trialId}.json`)}`);
}

function fmt(v, d = 3) { return v == null ? "—" : Number(v).toFixed(d); }
function fsgn(v, d = 1) { return v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(d)}`; }
function f3(v) { return v == null ? "  —  " : v.toFixed(3); }

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
