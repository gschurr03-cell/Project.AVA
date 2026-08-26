// Phase 8.0A -- forensic-only step-length reconstruction. Calls the REAL,
// unmodified production functions (buildOverlayFrames, computeSprintMeasurements,
// detectStepMarks, applyRealWorldStepDistances, sourcePointToCanonicalWorld,
// buildCalibrationReport/resolveScale, computePeakStrideLengthM) against a real,
// current, authoritative pose artifact and real session calibration row -- using
// the EXACT same input-derivation logic as src/app/sessions/[id]/page.tsx and
// src/components/video/VideoOverlay.tsx. Read-only: no production file is
// modified by this script; it only compiles the real sources into a throwaway
// tmp dir and requires them.
//
//   node --env-file=.env.local scripts/phase-8-0a-step-length-audit.mjs <label> <pose.json> <sessionId>

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
const out = path.join(root, `.p80a-tmp-${label}`);

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
  const { buildFullRunEvents } = require(path.join(out, "lib/video/events.js"));
  const { detectStepMarks, applyRealWorldStepDistances } = require(path.join(out, "lib/video/steps.js"));
  const { sourcePointToCanonicalWorld } = require(path.join(out, "lib/video/worldProjection.js"));
  const { resolveScale } = require(path.join(out, "lib/calibration/index.js"));

  const seq = JSON.parse(readFileSync(posePath, "utf8"));
  const MP = [[0,"nose"],[11,"left_shoulder"],[12,"right_shoulder"],[13,"left_elbow"],[14,"right_elbow"],[15,"left_wrist"],[16,"right_wrist"],[23,"left_hip"],[24,"right_hip"],[25,"left_knee"],[26,"right_knee"],[27,"left_ankle"],[28,"right_ankle"],[29,"left_heel"],[30,"right_heel"],[31,"left_toe"],[32,"right_toe"]];
  const STRIP = new Set(["predicted", "invalid", "frozen_suspect"]);
  const rawFrames = seq.frames.map((f) => {
    const landmarks = [];
    if (!STRIP.has(f.boxOrigin)) {
      for (const [i, j] of MP) { const kp = f.keypoints[j]; if (kp) landmarks[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score }; }
    }
    return {
      frame: f.index, sourceFrameIndex: f.sourceFrameIndex, time: f.tMs / 1000, landmarks,
      boxOrigin: f.boxOrigin,
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

  // --- Path 1: measurements.ts (server-side "Average/Peak Step Length") ---
  // Exactly mirrors page.tsx: cameraEvidence is gated behind cameraType==="panning".
  const cameraPansMeaningfully = calibrationCameraType === "panning" && Boolean(seq.cameraEvidence);
  const anchorOptions = { gates: calibrationGates, cameraEvidence: cameraPansMeaningfully ? seq.cameraEvidence : undefined };
  const m = computeSprintMeasurements(overlayFrames, manualPoints, W, H, anchorOptions);
  const recomputedPeak = computePeakStrideLengthM(m.individualStepLengthsM);

  // --- Path 2: VideoOverlay.tsx (client-side, on-screen marker labels) ---
  // stepScale = calibration/index.ts's own resolveScale (NOT measurements.ts's
  // internal usableScale) -- exactly what page.tsx computes for the `stepScale` prop.
  const calScale = resolveScale({
    manualPoints, frames: overlayFrames, frameWidth: W, frameHeight: H,
    legLengthCm: s.athletes?.leg_length_cm ?? null,
  });
  const stepScale = calScale ? { metersPerPixel: calScale.metersPerPixel, frameWidth: W, frameHeight: H } : null;
  const rawStepMarks = applyRealWorldStepDistances(detectStepMarks(overlayFrames), stepScale);
  // Raw (ungated) camera evidence, exactly as page.tsx passes `overlayMeta?.cameraEvidence`
  // to <VideoOverlay> regardless of cameraType classification.
  const rawCameraEvidence = seq.cameraEvidence ?? null;
  const overlayWorldSteps = rawStepMarks.map((mark) => ({
    ...mark,
    world: rawCameraEvidence && W && H
      ? sourcePointToCanonicalWorld(mark, mark.sourceFrameIndex, rawCameraEvidence, W, H)
      : null,
  }));
  const overlayCanonicalSteps = overlayWorldSteps.map((mark, index) => {
    const previous = overlayWorldSteps[index - 1];
    if (!stepScale || !mark.world?.projectable || !previous?.world?.projectable) return mark;
    const dx = (mark.world.x - previous.world.x) * stepScale.frameWidth;
    const dy = (mark.world.y - previous.world.y) * stepScale.frameHeight;
    return { ...mark, distanceMetersFromPrev: Math.hypot(dx, dy) * stepScale.metersPerPixel, usedCanonicalWorld: true };
  });

  // --- Full-run contact dossier (source x/y/frame/time for every contact) ---
  const fullRun = buildFullRunEvents(overlayFrames);

  console.log(JSON.stringify({
    label, sessionId, posePath, frameCount: seq.frames.length, normFps, width: W, height: H,
    calibrationCameraType, cameraPansMeaningfully,
    hasArtifactCameraEvidence: Boolean(seq.cameraEvidence),
    manualPoints, calibrationGates: calibrationGates ? { distanceM: calibrationGates.distanceM, cameraType: calibrationGates.cameraType, startGate: calibrationGates.startGate, finishGate: calibrationGates.finishGate } : null,
    zone: m.zone,
    scaleFromMeasurements: m.metersPerPixel,
    scaleFromCalibrationIndex: calScale?.metersPerPixel ?? null,
    scaleMethod: calScale?.method ?? null,
    validContacts: m.validContacts,
    combinedStepFrequencyHz: m.combinedStepFrequencyHz,
    reportedZoneTimeS: m.reportedZoneTimeS,
    // EXACT authoritative source (src/lib/intelligence/metricEvidence.ts:347):
    // m.zoneStepSummary?.summaries.averageStepLengthM ?? m.avgIndividualStepLengthM ?? m.avgZoneStepLengthM
    averageStepLengthM: m.zoneStepSummary?.summaries?.averageStepLengthM ?? m.avgIndividualStepLengthM ?? m.avgZoneStepLengthM ?? null,
    avgIndividualStepLengthM: m.avgIndividualStepLengthM ?? null,
    avgZoneStepLengthM_naiveFallback: m.avgZoneStepLengthM ?? null,
    peakStepLengthM: m.peakStrideLengthM ?? null,
    recomputedPeakStepLengthM: recomputedPeak,
    individualStepLengthsM: m.individualStepLengthsM,
    zoneSteps: (m.zoneSteps ?? []).map((z) => ({
      index: z.index, side: z.side, fromSide: z.fromSide, timeS: Number(z.timeS.toFixed(6)),
      worldX: z.worldX, stepLengthM: z.stepLengthM, classification: z.classification ?? null,
    })),
    fullRunContacts: fullRun.contacts.map((c) => ({
      side: c.side, frame: c.frame, sourceFrameIndex: c.sourceFrameIndex,
      time: Number(c.time.toFixed(6)), x: c.x, y: c.y, index: c.index,
    })),
    overlayRawSteps: rawStepMarks.map((mk) => ({
      side: mk.side, sourceFrameIndex: mk.sourceFrameIndex, time: Number(mk.time.toFixed(6)),
      x: mk.x, y: mk.y, index: mk.index, distanceMetersFromPrev: mk.distanceMetersFromPrev,
    })),
    overlayCanonicalSteps: overlayCanonicalSteps.map((mk) => ({
      side: mk.side, sourceFrameIndex: mk.sourceFrameIndex, time: Number(mk.time.toFixed(6)),
      index: mk.index, distanceMetersFromPrev: mk.distanceMetersFromPrev,
      usedCanonicalWorld: Boolean(mk.usedCanonicalWorld),
      worldProjectable: mk.world?.projectable ?? null,
    })),
  }, null, 2));
} finally {
  Module._resolveFilename = orig;
  rmSync(out, { recursive: true, force: true });
}
