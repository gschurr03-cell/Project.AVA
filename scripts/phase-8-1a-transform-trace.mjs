// Phase 8.1A -- forensic-only end-of-clip world-lock transform trace. Calls
// the REAL, unmodified production functions (framePointToGlobal,
// globalPointToFrame, applyForward, computeSprintMeasurements,
// buildFullRunEvents) against a real, current, authoritative pose artifact
// (which carries the real worker-computed `cameraPath` global keyframe
// artifact) and the real session's manual_confirmed calibration gates, to
// reconstruct EXACTLY what VideoOverlay.tsx's `canonicalGeom()` computes for
// the gate source-frame position at EVERY source frame across the WHOLE clip
// (not just the zone) -- the world-lock chain a "manual_confirmed" gate
// actually uses (confirmed via selectRenderableGateGeometry -> canonicalGeom
// -> cameraPathIndex branch, since all 4 benchmarks carry a real `cameraPath`
// artifact).
//
// Also reprojects five FIXED, arbitrary background-anchor points (the four
// corners + center of the frame, in normalized source coordinates), anchored
// at the SAME setup/reference frame as the gates, through the identical
// global chain -- this directly tests the Phase 8.1A "world-lock invariant"
// (Part J): a fixed world point's reprojected screen position should not
// move unless the source camera itself moved.
//
// Read-only: no production file is modified; it only compiles the real
// sources into a throwaway tmp dir and requires them.
//
//   node --env-file=.env.local scripts/phase-8-1a-transform-trace.mjs <label> <pose.json> <sessionId>

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
const out = path.join(root, `.p81a-tmp-${label}`);

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
        path.join(root, "src/lib/video/cameraPath.ts"),
        path.join(root, "src/lib/video/presentationCamera.ts"),
        path.join(root, "src/lib/video/follow.ts"),
        path.join(root, "src/lib/calibration/index.ts"),
        path.join(root, "src/lib/calibration/zoneAnchors.ts"),
        path.join(root, "src/lib/calibration/authority.ts"),
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
  const { buildFullRunEvents } = require(path.join(out, "lib/video/events.js"));
  const { indexCameraFramePaths, framePointToGlobal, globalPointToFrame } = require(path.join(out, "lib/video/cameraPath.js"));
  const { selectRenderableGateGeometry } = require(path.join(out, "lib/calibration/authority.js"));
  const { buildPresentationCameraPath } = require(path.join(out, "lib/video/presentationCamera.js"));

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

  // --- Authoritative timing/zone context (read-only; unchanged science) ---
  const cameraPansMeaningfully = calibrationCameraType === "panning" && Boolean(seq.cameraEvidence);
  const anchorOptions = { gates: calibrationGates, cameraEvidence: cameraPansMeaningfully ? seq.cameraEvidence : undefined };
  const m = computeSprintMeasurements(overlayFrames, manualPoints, W, H, anchorOptions);
  const fullRun = buildFullRunEvents(overlayFrames);

  // Real, unmodified last-real-pose-evidence frame (independent of measurement
  // zone) -- any frame whose landmarks object is non-empty and whose boxOrigin
  // was not stripped above.
  let lastPoseFrame = null;
  for (const f of overlayFrames) {
    if (Object.values(f.landmarks).some(Boolean)) lastPoseFrame = f;
  }
  const lastContact = fullRun.contacts.length ? fullRun.contacts[fullRun.contacts.length - 1] : null;

  // --- Gate world-lock reprojection: EXACTLY VideoOverlay.tsx's canonicalGeom()
  // cameraPathIndex branch (the active path for all 4 "manual_confirmed" benchmarks). ---
  const gateDirective = selectRenderableGateGeometry(calibrationGates);
  if (gateDirective.mode !== "canonical_raw") {
    console.error(JSON.stringify({ label, error: "unexpected gate mode", mode: gateDirective.mode }));
    process.exit(1);
  }
  const cameraPathIndex = indexCameraFramePaths(seq.cameraPath);
  const setupFrameFor = (canonical) => canonical.setupFrameIndex ?? 0;

  const anchoredPoints = {
    startC1: { point: gateDirective.start.c1, setupFrame: setupFrameFor(gateDirective.start) },
    startC2: { point: gateDirective.start.c2, setupFrame: setupFrameFor(gateDirective.start) },
    finishC1: { point: gateDirective.finish.c1, setupFrame: setupFrameFor(gateDirective.finish) },
    finishC2: { point: gateDirective.finish.c2, setupFrame: setupFrameFor(gateDirective.finish) },
    // Five fixed background anchors, arbitrary normalized source points, all
    // anchored at the SAME setup frame as the start gate -- these have no
    // relationship to the athlete or gates; they exist only to test whether
    // the WHOLE scene is coherently world-locked (Part J invariant).
    bgTopLeft: { point: { x: 0.05, y: 0.05 }, setupFrame: setupFrameFor(gateDirective.start) },
    bgTopRight: { point: { x: 0.95, y: 0.05 }, setupFrame: setupFrameFor(gateDirective.start) },
    bgBottomLeft: { point: { x: 0.05, y: 0.95 }, setupFrame: setupFrameFor(gateDirective.start) },
    bgBottomRight: { point: { x: 0.95, y: 0.95 }, setupFrame: setupFrameFor(gateDirective.start) },
    bgCenter: { point: { x: 0.5, y: 0.5 }, setupFrame: setupFrameFor(gateDirective.start) },
  };
  const globalPoints = {};
  for (const [key, { point, setupFrame }] of Object.entries(anchoredPoints)) {
    const g = framePointToGlobal(cameraPathIndex, setupFrame, point, W, H);
    globalPoints[key] = { global: g.point, available: g.available, setupFrame };
  }

  const totalFrames = seq.cameraPath.totalFrames;
  const trace = [];
  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    const framePath = seq.cameraPath.framePaths.find((f) => f.frameIndex === frameIndex) ?? null;
    const row = {
      frameIndex,
      framePathState: framePath?.state ?? "missing",
      framePathConfidence: framePath?.confidence ?? null,
      framePathResidualPx: framePath?.residualPx ?? null,
      framePathFeatureCount: framePath?.featureCount ?? null,
      framePathInlierRatio: framePath?.inlierRatio ?? null,
    };
    for (const [key, gp] of Object.entries(globalPoints)) {
      const proj = globalPointToFrame(cameraPathIndex, frameIndex, gp.global, W, H);
      row[key] = proj.available ? { x: proj.point.x, y: proj.point.y } : null;
      row[`${key}_state`] = proj.state;
    }
    trace.push(row);
  }

  // --- Presentation camera path (Auto Follow ON dynamics; Part F informational) ---
  const cameraPath = buildPresentationCameraPath(overlayFrames);
  const presentationStateTrace = overlayFrames.map((f, i) => ({
    frameIndex: f.sourceFrameIndex ?? f.frame,
    timeS: f.time,
    presentationState: cameraPath[i]?.presentationState ?? null,
    cx: cameraPath[i]?.cx ?? null,
    cy: cameraPath[i]?.cy ?? null,
    scale: cameraPath[i]?.scale ?? null,
    provenance: cameraPath[i]?.provenance ?? null,
    fallbackReason: cameraPath[i]?.fallbackReason ?? null,
  }));

  console.log(JSON.stringify({
    label, sessionId, totalFrames, W, H, normFps,
    calibrationCameraType,
    gateSetupFrame: { start: setupFrameFor(gateDirective.start), finish: setupFrameFor(gateDirective.finish) },
    lastPoseFrame: lastPoseFrame ? { sourceFrameIndex: lastPoseFrame.sourceFrameIndex ?? lastPoseFrame.frame, timeS: lastPoseFrame.time } : null,
    lastContact: lastContact ? { sourceFrameIndex: lastContact.sourceFrameIndex, side: lastContact.side, timeS: lastContact.time } : null,
    zone: m.zone,
    reportedZoneTimeS: m.reportedZoneTimeS,
    zoneEntryTimeS: m.zoneEntryTimeS ?? null,
    zoneExitTimeS: m.zoneExitTimeS ?? null,
    startCrossingFrame: m.timingProvenance?.startCrossingFrame ?? null,
    finishCrossingFrame: m.timingProvenance?.finishCrossingFrame ?? null,
    timingStatus: m.timingProvenance?.timingStatus ?? null,
    trace,
    presentationStateTrace,
  }));
} finally {
  Module._resolveFilename = orig;
  rmSync(out, { recursive: true, force: true });
}
