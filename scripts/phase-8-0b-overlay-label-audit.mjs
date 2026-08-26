// Phase 8.0B -- forensic-only overlay-label audit. Calls the REAL, unmodified
// production functions (buildOverlayFrames, computeSprintMeasurements,
// detectStepMarks, applyRealWorldStepDistances, sourcePointToCanonicalWorld,
// sourceLineToCanonicalWorld, analyzeZoneSteps) against a real, current,
// authoritative pose artifact and real session calibration row, to build a
// before/after comparison of the on-screen step-length LABEL VALUE:
//
//   OLD_OVERLAY  -- VideoOverlay.tsx's PRE-Phase-8.0B computation: its own
//                   ungated `zoneMetrics` (analyzeZoneSteps fed by
//                   sourcePointToCanonicalWorld/sourceLineToCanonicalWorld,
//                   NOT gated by cameraPansMeaningfully). This is exactly the
//                   code this script reproduces from the pre-fix source (kept
//                   here, read-only, for comparison -- VideoOverlay.tsx itself
//                   no longer uses this value for its label).
//   AUTHORITATIVE -- measurements.ts's real m.zoneSteps[].stepLengthM (the
//                    same source the Average/Peak Step Length cards read).
//   NEW_OVERLAY   -- what VideoOverlay.tsx now renders post-fix: a lookup of
//                    AUTHORITATIVE by ZoneStep.contactId. Reproduced here by
//                    the same lookup, not a separate implementation, so
//                    NEW_OVERLAY === AUTHORITATIVE is true by construction;
//                    included explicitly so the comparison table is complete.
//
// Read-only: no production file is modified by this script; it only compiles
// the real sources into a throwaway tmp dir and requires them.
//
//   node --env-file=.env.local scripts/phase-8-0b-overlay-label-audit.mjs <label> <pose.json> <sessionId>

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
const out = path.join(root, `.p80b-tmp-${label}`);

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
  const { detectStepMarks, applyRealWorldStepDistances } = require(path.join(out, "lib/video/steps.js"));
  const { sourcePointToCanonicalWorld, sourceLineToCanonicalWorld } = require(path.join(out, "lib/video/worldProjection.js"));
  const { analyzeZoneSteps } = require(path.join(out, "lib/video/zoneStepAnalysis.js"));
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

  // --- AUTHORITATIVE: measurements.ts, exactly as page.tsx computes it ---
  const cameraPansMeaningfully = calibrationCameraType === "panning" && Boolean(seq.cameraEvidence);
  const anchorOptions = { gates: calibrationGates, cameraEvidence: cameraPansMeaningfully ? seq.cameraEvidence : undefined };
  const m = computeSprintMeasurements(overlayFrames, manualPoints, W, H, anchorOptions);

  // --- OLD_OVERLAY: VideoOverlay.tsx's PRE-fix computation, reproduced from
  // the real functions it called (cameraEvidence UNGATED, matching the exact
  // prop wiring page.tsx used at <VideoOverlay cameraEvidence={overlayMeta?.cameraEvidence}>). ---
  const calScale = resolveScale({
    manualPoints, frames: overlayFrames, frameWidth: W, frameHeight: H,
    legLengthCm: s.athletes?.leg_length_cm ?? null,
  });
  const stepScale = calScale ? { metersPerPixel: calScale.metersPerPixel, frameWidth: W, frameHeight: H } : null;
  const rawCameraEvidence = seq.cameraEvidence ?? null; // ungated, as page.tsx passed it
  const stepMarks = applyRealWorldStepDistances(detectStepMarks(overlayFrames), stepScale);
  const worldSteps = stepMarks.map((mark) => ({
    ...mark,
    world: rawCameraEvidence && W && H
      ? sourcePointToCanonicalWorld(mark, mark.sourceFrameIndex, rawCameraEvidence, W, H)
      : null,
  }));
  const canonicalSteps = worldSteps.map((mark, index) => {
    const previous = worldSteps[index - 1];
    if (!stepScale || !mark.world?.projectable || !previous?.world?.projectable) return mark;
    const dx = (mark.world.x - previous.world.x) * stepScale.frameWidth;
    const dy = (mark.world.y - previous.world.y) * stepScale.frameHeight;
    return { ...mark, distanceMetersFromPrev: Math.hypot(dx, dy) * stepScale.metersPerPixel };
  });
  let oldZoneMetrics = null;
  if (calibrationGates?.startBoundary && calibrationGates?.finishBoundary && rawCameraEvidence && W && H && canonicalSteps.every((mk) => mk.world)) {
    const canonicalMidpoint = (boundary, identity) => {
      const line = sourceLineToCanonicalWorld(
        boundary.sourceFrameLine.c1, boundary.sourceFrameLine.c2, boundary.setupFrameIndex,
        identity, rawCameraEvidence, W, H,
      );
      return { x: (line.c1.x + line.c2.x) / 2, y: (line.c1.y + line.c2.y) / 2 };
    };
    oldZoneMetrics = analyzeZoneSteps({
      start: canonicalMidpoint(calibrationGates.startBoundary, "start"),
      finish: canonicalMidpoint(calibrationGates.finishBoundary, "finish"),
      distanceM: calibrationGates.distanceM,
      contacts: canonicalSteps.map((mark) => ({
        id: `contact-${mark.sourceFrameIndex}-${mark.side}-${mark.index}`,
        side: mark.side, timeS: mark.time, sourceFrameIndex: mark.sourceFrameIndex,
        x: mark.world.x, y: mark.world.y, confidence: mark.world.projectionConfidence,
      })),
    });
  }
  const oldIntervalByEndpoint = new Map((oldZoneMetrics?.intervals ?? []).map((iv) => [iv.toContactId, iv]));

  // --- NEW_OVERLAY: the post-fix lookup (authoritative m.zoneSteps by contactId) ---
  const authoritativeById = new Map((m.zoneSteps ?? []).filter((z) => z.stepLengthM != null).map((z) => [z.contactId, z.stepLengthM]));

  // Every marker VideoOverlay.tsx draws: one per detected step mark (same
  // detectStepMarks(frames)+applyRealWorldStepDistances(...) call VideoOverlay.tsx
  // itself makes for markers -- `stepMarks`, already built above).
  const rows = stepMarks.map((mk) => {
    const markId = `contact-${mk.sourceFrameIndex}-${mk.side}-${mk.index}`;
    return {
      benchmark: label,
      contactId: markId,
      side: mk.side,
      sourceFrameIndex: mk.sourceFrameIndex,
      timeS: Number(mk.time.toFixed(6)),
      oldOverlayLabelM: oldIntervalByEndpoint.get(markId)?.longitudinalLengthM ?? null,
      oldOverlayRawDistanceMetersFromPrev: mk.distanceMetersFromPrev ?? null, // debug-only "rel" path context
      authoritativeStepLengthM: authoritativeById.get(markId) ?? null,
      newOverlayLabelM: authoritativeById.get(markId) ?? null, // lookup by construction === authoritative
    };
  });

  console.log(JSON.stringify({
    label, sessionId,
    calibrationCameraType, cameraPansMeaningfully,
    hasStartBoundary: Boolean(calibrationGates?.startBoundary),
    hasArtifactCameraEvidence: Boolean(seq.cameraEvidence),
    oldZoneMetricsActive: Boolean(oldZoneMetrics),
    averageStepLengthM_authoritative: m.zoneStepSummary?.summaries?.averageStepLengthM ?? m.avgIndividualStepLengthM ?? m.avgZoneStepLengthM ?? null,
    individualStepLengthsM_authoritative: m.individualStepLengthsM,
    rows,
  }, null, 2));
} finally {
  Module._resolveFilename = orig;
  rmSync(out, { recursive: true, force: true });
}
