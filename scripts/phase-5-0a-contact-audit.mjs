// Phase 5.0A (Part 5) — real contact audit: runs the ACTUAL, unmodified
// production functions (buildFullRunEvents -> detectStepMarks +
// detectContactPhases, then computeSprintMeasurements for zone restriction)
// against each benchmark's real, current pose artifact, and reports full
// evidence per contact: side, time, frame, prominence/confidence, zone
// membership, and — for missed contacts — the real reason a candidate local
// maximum was suppressed (NaN gap from stripped/low-visibility landmarks,
// same-side spacing suppression, or global de-duplication).
//
//   node --env-file=.env.local scripts/phase-5-0a-contact-audit.mjs <label> <pose.json> <sessionId>

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
const artifactPath = process.argv[5] ? path.resolve(process.argv[5]) : null;
const out = path.join(root, `.p50a-contact-tmp-${label}`);

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
        path.join(root, "src/lib/video/events.ts"),
        path.join(root, "src/lib/video/steps.ts"),
        path.join(root, "src/lib/video/contacts.ts"),
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
  const { detectStepMarks, traceStepDetection, DEFAULT_STEP_CONFIG } = require(path.join(out, "lib/video/steps.js"));
  const { smoothSeries, findLocalMaxima } = require(path.join(out, "lib/biomechanics/events/FootContactDetector.js"));

  const seq = JSON.parse(readFileSync(posePath, "utf8"));
  const MP = [[0,"nose"],[11,"left_shoulder"],[12,"right_shoulder"],[13,"left_elbow"],[14,"right_elbow"],[15,"left_wrist"],[16,"right_wrist"],[23,"left_hip"],[24,"right_hip"],[25,"left_knee"],[26,"right_knee"],[27,"left_ankle"],[28,"right_ankle"],[29,"left_heel"],[30,"right_heel"],[31,"left_toe"],[32,"right_toe"]];
  const STRIP = new Set(["predicted", "invalid", "frozen_suspect"]);
  const rawFrames = seq.frames.map((f) => {
    const landmarks = [];
    if (!STRIP.has(f.boxOrigin)) {
      for (const [i, j] of MP) { const kp = f.keypoints[j]; if (kp) landmarks[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score }; }
    }
    return { frame: f.index, sourceFrameIndex: f.sourceFrameIndex, time: f.tMs / 1000, landmarks, boxOrigin: f.boxOrigin };
  });
  const baseFrames = buildOverlayFrames({ ...seq, frames: rawFrames });

  const rawFps = Number(s.fps) || seq.fps;
  const normFps = normalizeFps(rawFps);
  const W = seq.width, H = seq.height;
  const frames = applyFpsOverride(baseFrames, normFps);

  // STAGE 1 evidence: the full-run event stream (no zone knowledge).
  const fullRun = buildFullRunEvents(frames);

  // STAGE 2: real zone measurement (production function, unmodified).
  const m = computeSprintMeasurements(frames, points, W, H);

  // Real candidate-peak evidence PER SIDE, to identify exactly which raw local
  // maxima were kept vs suppressed (same-side spacing) vs never-existed
  // (NaN gap from stripped/low-visibility landmarks) — using the SAME
  // smoothSeries/findLocalMaxima helpers the real detector calls, applied to
  // the SAME foot-y series it builds internally (re-derived here read-only,
  // not a reimplementation of the acceptance logic itself).
  const SIDE_JOINTS = { left: ["leftAnkle", "leftHeel", "leftFootIndex"], right: ["rightAnkle", "rightHeel", "rightFootIndex"] };
  function footSample(frame, joints, minVis) {
    let sx = 0, sy = 0, sv = 0, n = 0;
    for (const j of joints) {
      const p = frame.landmarks[j];
      if (p && (p.visibility ?? 1) >= minVis) { sx += p.x; sy += p.y; sv += p.visibility ?? 1; n += 1; }
    }
    return n > 0 ? { x: sx / n, y: sy / n, vis: sv / n } : null;
  }
  const candidatePeaks = {};
  for (const side of ["left", "right"]) {
    const joints = SIDE_JOINTS[side];
    const samples = frames.map((f) => footSample(f, joints, DEFAULT_STEP_CONFIG.minVisibility));
    const ys = samples.map((s) => (s ? s.y : NaN));
    const smoothed = smoothSeries(ys, DEFAULT_STEP_CONFIG.smoothingWindowFrames);
    const peaks = findLocalMaxima(smoothed);
    const nanFrames = ys.map((v, i) => (!Number.isFinite(v) ? i : null)).filter((v) => v != null);
    candidatePeaks[side] = { totalCandidatePeaks: peaks.length, peakFrameIndices: peaks.map((i) => frames[i]?.sourceFrameIndex ?? i), nanFrameCount: nanFrames.length, nanFrameRanges: rangeify(nanFrames) };
  }
  function rangeify(sorted) {
    const ranges = [];
    let start = null, prev = null;
    for (const v of sorted) {
      if (start === null) { start = v; prev = v; continue; }
      if (v === prev + 1) { prev = v; continue; }
      ranges.push([start, prev]); start = v; prev = v;
    }
    if (start !== null) ranges.push([start, prev]);
    return ranges;
  }

  // Final accepted marks (post de-dup) with full per-mark evidence.
  const finalMarks = detectStepMarks(frames);
  const detectionTrace = traceStepDetection(frames);
  const footEvidence = (frame, names) => {
    const points = names.map((name) => {
      const point = frame.landmarks[name];
      return point ? { name, x: point.x, y: point.y, visibility: point.visibility ?? null } : { name, x: null, y: null, visibility: null };
    });
    const usable = points.filter((point) => point.visibility != null && point.visibility >= DEFAULT_STEP_CONFIG.minVisibility);
    return {
      available: usable.length > 0,
      points,
      meanX: usable.length ? usable.reduce((sum, point) => sum + point.x, 0) / usable.length : null,
      meanY: usable.length ? usable.reduce((sum, point) => sum + point.y, 0) / usable.length : null,
    };
  };
  const frameEvidence = frames.map((frame, index) => {
    const source = seq.frames[index];
    const left = footEvidence(frame, SIDE_JOINTS.left);
    const right = footEvidence(frame, SIDE_JOINTS.right);
    const prior = index > 0 ? frames[index - 1] : null;
    const priorLeft = prior ? footEvidence(prior, SIDE_JOINTS.left) : null;
    const priorRight = prior ? footEvidence(prior, SIDE_JOINTS.right) : null;
    const deltaS = prior ? frame.time - prior.time : null;
    const velocity = (current, previous) => current != null && previous != null && deltaS && deltaS > 0 ? (current - previous) / deltaS : null;
    return {
      sourceFrameIndex: frame.sourceFrameIndex ?? index,
      timestampS: frame.time,
      boxOrigin: source.boxOrigin ?? null,
      trackState: source.trackState ?? null,
      localizationVerified: source.localizationVerified ?? null,
      athleteBox: source.scientificAthleteBox ?? source.athleteBoundingBoxSource ?? null,
      roi: source.cropRect ?? null,
      leftFoot: { ...left, verticalVelocity: velocity(left.meanY, priorLeft?.meanY), horizontalVelocity: velocity(left.meanX, priorLeft?.meanX) },
      rightFoot: { ...right, verticalVelocity: velocity(right.meanY, priorRight?.meanY), horizontalVelocity: velocity(right.meanX, priorRight?.meanX) },
    };
  });

  const acceptedContacts = finalMarks.map((mk) => ({
    side: mk.side, sourceFrameIndex: mk.sourceFrameIndex, time: mk.time,
    inZone: m.zoneSteps.some((zs) => Math.abs(zs.timeS - mk.time) < 1e-9),
  }));

  const audit = {
    label, sessionId, posePath, frameCount: seq.frames.length, normFps,
    fullRunTotalContacts: fullRun.totalContacts, fullRunLeft: fullRun.leftContacts, fullRunRight: fullRun.rightContacts,
    fullRunFirstContactTimeS: fullRun.firstContactTimeS, fullRunLastContactTimeS: fullRun.lastContactTimeS,
    zoneEntryTimeS: m.zoneEntryTimeS, zoneExitTimeS: m.zoneExitTimeS, reportedZoneTimeS: m.reportedZoneTimeS,
    totalContacts: m.totalContacts, validContacts: m.validContacts,
    validLeftContacts: m.validLeftContacts, validRightContacts: m.validRightContacts,
    combinedStepFrequencyHz: m.combinedStepFrequencyHz,
    candidatePeaks,
    detectionTrace,
    frameEvidence,
    acceptedContacts,
    zoneSteps: m.zoneSteps.map((st) => ({ index: st.index, side: st.side, timeS: st.timeS })),
  };
  const serialized = JSON.stringify(audit, null, 2);
  if (artifactPath) writeFileSync(artifactPath, serialized);
  console.log(serialized);
} finally {
  Module._resolveFilename = orig;
  rmSync(out, { recursive: true, force: true });
}
