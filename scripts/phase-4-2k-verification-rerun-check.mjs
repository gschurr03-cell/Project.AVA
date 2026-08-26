// Phase 4.2K -- quick, real check: does the independent-verification
// promotion actually change computeSprintMeasurements' real output? Runs the
// ACTUAL, unmodified production functions (buildOverlayFrames,
// computeSprintMeasurements) against a real pose artifact augmented with
// `independentLocalizationState` (scripts/phase-4-2k-independent-detection-
// diagnostic.py's sibling, verify_independent_localization run standalone).
// Does NOT pre-strip landmarks itself -- computeSprintMeasurements' own real
// gate (measurements.ts) does that, so this exercises the REAL, current
// production logic end to end.
//
//   node --env-file=.env.local scripts/phase-4-2k-verification-rerun-check.mjs <pose.json> <sessionId>

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const posePath = path.resolve(process.argv[2]);
const sessionId = process.argv[3];
const out = path.join(root, ".p42k-verify-tmp");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: s, error } = await db
  .from("sessions")
  .select("id, fps, fps_override, calibration_point_ax, calibration_point_ay, calibration_point_bx, calibration_point_by, calibration_known_distance_m, calibration_point_a_time_s, calibration_point_b_time_s")
  .eq("id", sessionId)
  .single();
if (error) { console.error(error); process.exit(1); }
const points = {
  ax: s.calibration_point_ax, ay: s.calibration_point_ay,
  bx: s.calibration_point_bx, by: s.calibration_point_by,
  distanceM: s.calibration_known_distance_m,
  aTimeS: s.calibration_point_a_time_s ?? 0, bTimeS: s.calibration_point_b_time_s ?? 0,
};

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
        path.join(root, "src/lib/intelligence/metricEvidence.ts"),
        path.join(root, "src/lib/intelligence/evidenceExplanations.ts"),
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
  const { evaluateMetricEvidence } = require(path.join(out, "lib/intelligence/metricEvidence.js"));
  const { buildSessionEvidenceSummary, explainMetricEvidence } = require(path.join(out, "lib/intelligence/evidenceExplanations.js"));

  const seq = JSON.parse(readFileSync(posePath, "utf8"));
  const MP = [[0,"nose"],[11,"left_shoulder"],[12,"right_shoulder"],[13,"left_elbow"],[14,"right_elbow"],[15,"left_wrist"],[16,"right_wrist"],[23,"left_hip"],[24,"right_hip"],[25,"left_knee"],[26,"right_knee"],[27,"left_ankle"],[28,"right_ankle"],[29,"left_heel"],[30,"right_heel"],[31,"left_toe"],[32,"right_toe"]];
  // No pre-stripping here -- pass EVERY frame's real landmarks through and
  // let computeSprintMeasurements' own real strip gate decide, exactly as
  // production does.
  const rawFrames = seq.frames.map((f) => {
    const landmarks = [];
    for (const [i, j] of MP) { const kp = f.keypoints[j]; if (kp) landmarks[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score }; }
    return {
      frame: f.index, sourceFrameIndex: f.sourceFrameIndex, time: f.tMs / 1000, landmarks,
      boxOrigin: f.boxOrigin, independentLocalizationState: f.independentLocalizationState,
    };
  });
  const baseFrames = buildOverlayFrames({ ...seq, frames: rawFrames });
  const rawFps = Number(s.fps) || seq.fps;
  const normFps = normalizeFps(rawFps);
  const W = seq.width, H = seq.height;
  const frames = applyFpsOverride(baseFrames, normFps);

  const m = computeSprintMeasurements(frames, points, W, H);
  const metricEvidence = evaluateMetricEvidence(m, undefined, {
    calibrationCameraType: "stationary",
    calibrationSource: "calibration_gates",
  });
  const explanationPayload = {
    sessionSummary: buildSessionEvidenceSummary(metricEvidence, "coach"),
    coach: metricEvidence.map((entry) => explainMetricEvidence(entry, "coach")),
    developer: metricEvidence.map((entry) => explainMetricEvidence(entry, "developer")),
  };
  console.log(JSON.stringify({
    posePath,
    validContacts: m.validContacts,
    combinedStepFrequencyHz: m.combinedStepFrequencyHz,
    reportedZoneTimeS: m.reportedZoneTimeS,
    groundContactLeftMs: m.groundContactLeftMs, groundContactRightMs: m.groundContactRightMs, groundContactCombinedMs: m.groundContactCombinedMs,
    flightLeftMs: m.flightLeftMs, flightRightMs: m.flightRightMs, flightCombinedMs: m.flightCombinedMs,
    averageStepLengthM: m.averageStepLengthM, reportedMaxVelocityMps: m.reportedMaxVelocityMps,
    metricEvidence: metricEvidence.map((entry) => ({
      metric: entry.metric, status: entry.status, value: entry.value,
      legacyReason: entry.reasonCode,
      canonicalReason: entry.provenance.scientific?.reason ?? null,
      contributingFrames: entry.provenance.scientific?.contributingFrames ?? [],
      legacyProvenanceIncomplete: entry.provenance.scientific?.legacyProvenanceIncomplete ?? true,
    })),
    explanationPayload,
    zoneSteps: (m.zoneSteps ?? []).map((z) => ({ index: z.index, side: z.side, timeS: Number(z.timeS.toFixed(4)) })),
  }, null, 2));
} finally {
  Module._resolveFilename = orig;
  rmSync(out, { recursive: true, force: true });
}
