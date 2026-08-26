// Phase 9.4 Part F -- CORRECTED authoritative-metric recomputation.
//
// Investigation finding (not a defect in production): the previously-reused
// forensic script (scripts/phase-8-0a-step-length-audit.mjs) pre-strips
// "predicted"/"invalid"/"frozen_suspect" frames itself, BEFORE calling
// `computeSprintMeasurements` -- but `computeSprintMeasurements` (src/lib/
// benchmark/measurements.ts:565-569) ALREADY does this stripping internally,
// correctly including the Phase 4.2K/9.1B `independent_corroborated`
// exception. Pre-stripping in the SCRIPT throws away exactly those
// corroborated frames before `measurements.ts` ever gets a chance to
// recover them -- a forensic-tooling bug (already independently documented
// in docs/phase-6-6c-authoritative-zone-visualization.md Section 11 for a
// DIFFERENT older harness with the identical symptom), not a production
// regression. The REAL production loader (src/lib/video/loadOverlayFrames.ts)
// never pre-strips at all -- it passes every frame's landmarks through
// verbatim with boxOrigin/independentLocalizationState metadata intact and
// lets `measurements.ts` do the one, correct, internal filtering pass.
//
// This script mirrors `loadOverlayFrames.ts#toOverlayFrames` EXACTLY (same
// MediaPipe-index mapping, zero pre-stripping) instead of re-deriving a
// simplified equivalent, so its output matches what the real results page
// actually computes and displays.
//
//   node --env-file=.env.local scripts/phase-9-4-corrected-metrics.mjs <label> <pose.json> <sessionId>

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const label = process.argv[2];
const posePath = path.resolve(process.argv[3]);
const sessionId = process.argv[4];
const out = path.join(root, `.p94-corrected-tmp-${label}`);

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: s, error } = await db
  .from("sessions")
  .select(
    "id, fps, fps_override, calibration_point_ax, calibration_point_ay, calibration_point_bx, calibration_point_by, " +
    "calibration_known_distance_m, calibration_point_a_time_s, calibration_point_b_time_s, calibration_gates, distance_m, " +
    "athletes(leg_length_cm)",
  )
  .eq("id", sessionId)
  .single();
if (error) { console.error(error); process.exit(1); }

const manualPoints = {
  ax: s.calibration_point_ax, ay: s.calibration_point_ay,
  bx: s.calibration_point_bx, by: s.calibration_point_by,
  distanceM: s.calibration_known_distance_m,
  aTimeS: s.calibration_point_a_time_s ?? 0, bTimeS: s.calibration_point_b_time_s ?? 0,
};
const calibrationGates = s.calibration_gates ?? null;
const calibrationCameraType = calibrationGates?.cameraType ?? "stationary";

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const orig = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return orig.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};
try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, strict: false, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] }, noEmitOnError: false },
      files: [
        path.join(root, "src/lib/video/overlay.ts"),
        path.join(root, "src/lib/video/fps.ts"),
        path.join(root, "src/lib/benchmark/measurements.ts"),
        path.join(root, "src/lib/benchmark/strideMetrics.ts"),
        path.join(root, "src/lib/video/events.ts"),
        path.join(root, "src/lib/video/steps.ts"),
        path.join(root, "src/lib/video/contacts.ts"),
        path.join(root, "src/lib/video/stepIntegrity.ts"),
        path.join(root, "src/lib/video/zoneStepAnalysis.ts"),
        path.join(root, "src/lib/video/worldProjection.ts"),
        path.join(root, "src/lib/video/camera.ts"),
        path.join(root, "src/lib/calibration/index.ts"),
        path.join(root, "src/lib/calibration/zoneAnchors.ts"),
        path.join(root, "src/lib/biomechanics/events/FootContactDetector.ts"),
      ],
    }),
  );
  try {
    execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const outText = String(err.stdout ?? "") + String(err.stderr ?? "");
    if (!/worldProjection\.ts/.test(outText)) throw err;
  }

  const { buildOverlayFrames } = require(path.join(out, "lib/video/overlay.js"));
  const { applyFpsOverride, normalizeFps } = require(path.join(out, "lib/video/fps.js"));
  const { computeSprintMeasurements } = require(path.join(out, "lib/benchmark/measurements.js"));
  const { computePeakStrideLengthM } = require(path.join(out, "lib/benchmark/strideMetrics.js"));

  const seq = JSON.parse(readFileSync(posePath, "utf8"));
  // Byte-for-byte mirror of loadOverlayFrames.ts#toOverlayFrames: NO
  // pre-stripping of predicted/invalid/frozen_suspect -- every frame's
  // landmarks pass through verbatim with boxOrigin/independentLocalizationState
  // metadata intact, exactly like the real production loader.
  const MP = [[0,"nose"],[11,"left_shoulder"],[12,"right_shoulder"],[13,"left_elbow"],[14,"right_elbow"],[15,"left_wrist"],[16,"right_wrist"],[23,"left_hip"],[24,"right_hip"],[25,"left_knee"],[26,"right_knee"],[27,"left_ankle"],[28,"right_ankle"],[29,"left_heel"],[30,"right_heel"],[31,"left_toe"],[32,"right_toe"]];
  const rawFrames = seq.frames.map((f) => {
    const landmarks = [];
    for (const [i, j] of MP) { const kp = f.keypoints[j]; if (kp) landmarks[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score }; }
    return {
      frame: f.index, sourceFrameIndex: f.sourceFrameIndex, time: f.tMs / 1000, landmarks,
      boxOrigin: f.boxOrigin, trackState: f.trackState,
      independentLocalizationState: f.independentLocalizationState,
    };
  });
  const baseFrames = buildOverlayFrames({ ...seq, frames: rawFrames });
  const rawFps = Number(s.fps) || seq.fps;
  const normFps = normalizeFps(rawFps);
  const W = seq.width, H = seq.height;
  const overlayFrames = s.fps_override && Number.isFinite(Number(s.fps_override))
    ? applyFpsOverride(baseFrames, normalizeFps(Number(s.fps_override)))
    : applyFpsOverride(baseFrames, normFps);

  const cameraPansMeaningfully = calibrationCameraType === "panning" && Boolean(seq.cameraEvidence);
  const anchorOptions = { gates: calibrationGates, cameraEvidence: cameraPansMeaningfully ? seq.cameraEvidence : undefined };
  const m = computeSprintMeasurements(overlayFrames, manualPoints, W, H, anchorOptions);
  const recomputedPeak = computePeakStrideLengthM(m.individualStepLengthsM);

  const result = {
    label, sessionId, posePath, frameCount: seq.frames.length, normFps, width: W, height: H,
    calibrationCameraType, cameraPansMeaningfully,
    zone: m.zone,
    validContacts: m.validContacts,
    combinedStepFrequencyHz: m.combinedStepFrequencyHz,
    leftStepFrequencyHz: m.leftStepFrequencyHz ?? null,
    rightStepFrequencyHz: m.rightStepFrequencyHz ?? null,
    reportedZoneTimeS: m.reportedZoneTimeS,
    averageStepLengthM: m.zoneStepSummary?.summaries?.averageStepLengthM ?? m.avgIndividualStepLengthM ?? m.avgZoneStepLengthM ?? null,
    avgIndividualStepLengthM: m.avgIndividualStepLengthM ?? null,
    peakStepLengthM: m.peakStrideLengthM ?? null,
    recomputedPeakStepLengthM: recomputedPeak,
    maxVelocityMps: m.maxVelocityMps ?? null,
    individualStepLengthsM: m.individualStepLengthsM,
    zoneSteps: (m.zoneSteps ?? []).map((z) => ({ index: z.index, side: z.side, fromSide: z.fromSide, timeS: Number(z.timeS.toFixed(6)), worldX: z.worldX, stepLengthM: z.stepLengthM, contactId: z.contactId ?? null, classification: z.classification ?? null })),
    warnings: m.warnings ?? [],
  };
  console.log(JSON.stringify(result, null, 2));
} finally {
  Module._resolveFilename = orig;
  rmSync(out, { recursive: true, force: true });
}
