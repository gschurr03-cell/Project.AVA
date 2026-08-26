// Phase 5.0D (Parts B/C/D/E) — real, per-landmark contact evidence audit.
//
// Runs the ACTUAL, unmodified production contact pipeline (buildFullRunEvents
// -> detectStepMarks + detectContactPhases, then computeSprintMeasurements for
// zone restriction) against a benchmark's real, current pose artifact, exactly
// like scripts/phase-5-0a-contact-audit.mjs — then goes further: reconstructs
// each foot's INDEPENDENT per-landmark (ankle/heel/toe) trajectories (not the
// production mean-of-available fusion) so the touchdown window around every
// production contact (and every raw candidate peak, accepted or not) can be
// inspected landmark-by-landmark, with real source timestamps.
//
//   node --env-file=.env.local scripts/phase-5-0d-contact-evidence-audit.mjs <label> <pose.json> <sessionId>

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
const out = path.join(root, `.p50d-contact-tmp-${label}`);

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
  const { detectStepMarks, DEFAULT_STEP_CONFIG } = require(path.join(out, "lib/video/steps.js"));
  const { detectContactPhases } = require(path.join(out, "lib/video/contacts.js"));
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

  const fullRun = buildFullRunEvents(frames);
  const m = computeSprintMeasurements(frames, points, W, H);
  const finalMarks = detectStepMarks(frames);
  const finalPhases = detectContactPhases(frames, finalMarks);

  // ---- Real per-landmark (not fused) reconstruction, per foot ----
  const SIDE_JOINTS = { left: ["leftAnkle", "leftHeel", "leftFootIndex"], right: ["rightAnkle", "rightHeel", "rightFootIndex"] };
  const MIN_VIS = DEFAULT_STEP_CONFIG.minVisibility;

  function rawSeriesFor(joint) {
    return frames.map((f) => {
      const p = f.landmarks[joint];
      const present = !!p;
      const visible = !!p && (p.visibility ?? 1) >= MIN_VIS;
      return { y: visible ? p.y : NaN, present, visible, rawVisibility: p ? (p.visibility ?? 1) : null };
    });
  }

  function fusedSeriesFor(side) {
    const joints = SIDE_JOINTS[side];
    return frames.map((f) => {
      let sx = 0, sy = 0, sv = 0, n = 0;
      const which = [];
      for (const j of joints) {
        const p = f.landmarks[j];
        if (p && (p.visibility ?? 1) >= MIN_VIS) { sx += p.x; sy += p.y; sv += p.visibility ?? 1; n += 1; which.push(j); }
      }
      return n > 0 ? { y: sy / n, n, which } : { y: NaN, n: 0, which: [] };
    });
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

  const perSideLandmarks = {};
  for (const side of ["left", "right"]) {
    const joints = SIDE_JOINTS[side];
    const perJoint = {};
    for (const j of joints) perJoint[j] = rawSeriesFor(j);
    const fused = fusedSeriesFor(side);

    // classify each frame's landmark-availability configuration for this foot
    const configCounts = {};
    const configFrames = {};
    for (let i = 0; i < frames.length; i++) {
      const avail = joints.filter((j) => perJoint[j][i].visible);
      const key = avail.length === 0 ? "none"
        : avail.length === 3 ? "all_three"
        : avail.map((j) => j.replace(side, "").toLowerCase()).sort().join("+");
      configCounts[key] = (configCounts[key] ?? 0) + 1;
      (configFrames[key] ??= []).push(frames[i].sourceFrameIndex ?? i);
    }

    // fused-series NaN gap ranges (frames where the mean-of-available signal is unusable)
    const fusedNanFrames = fused.map((v, i) => (!Number.isFinite(v.y) ? (frames[i].sourceFrameIndex ?? i) : null)).filter((v) => v != null);

    perSideLandmarks[side] = {
      configCounts,
      configFrameSample: Object.fromEntries(Object.entries(configFrames).map(([k, v]) => [k, v.slice(0, 15)])),
      fusedNanFrameCount: fusedNanFrames.length,
      fusedNanFrameRanges: rangeify(fusedNanFrames),
    };
  }

  // ---- Per production contact: full evidence dossier ----
  function nearestFrameIdx(sourceFrameIndex) {
    return frames.findIndex((f) => (f.sourceFrameIndex ?? f.frame) === sourceFrameIndex);
  }

  const contactDossiers = finalMarks.map((mk) => {
    const idx = frames.findIndex((f) => f.frame === mk.frame);
    const phase = finalPhases.find((p) => p.frame === mk.frame && p.side === mk.side) ?? null;
    const joints = SIDE_JOINTS[mk.side];
    const windowRadius = 8;
    const windowEvidence = [];
    for (let i = Math.max(0, idx - windowRadius); i <= Math.min(frames.length - 1, idx + windowRadius); i++) {
      const f = frames[i];
      const perJoint = {};
      for (const j of joints) {
        const p = f.landmarks[j];
        perJoint[j.replace(mk.side, "").toLowerCase()] = p ? { y: p.y, visibility: p.visibility ?? 1, visible: (p.visibility ?? 1) >= MIN_VIS } : null;
      }
      windowEvidence.push({
        sourceFrameIndex: f.sourceFrameIndex ?? f.frame,
        tMs: f.time * 1000,
        boxOrigin: f.boxOrigin ?? null,
        ...perJoint,
      });
    }
    return {
      side: mk.side,
      sourceFrameIndex: mk.sourceFrameIndex,
      time: mk.time,
      inZone: m.zoneSteps?.some((zs) => Math.abs(zs.timeS - mk.time) < 1e-9) ?? false,
      hasContactPhase: !!phase,
      contactMs: phase?.contactMs ?? null,
      touchdownTimeS: phase?.touchdownTimeS ?? null,
      toeOffTimeS: phase?.toeOffTimeS ?? null,
      windowEvidence,
    };
  });

  // ---- summariseContactFlight discontinuity check: does the ordered
  // contactPhases list ever skip an intermediate StepMark that has NO phase,
  // i.e. is the "next phase" used for flight actually the IMMEDIATELY NEXT
  // contact, or a later one with a missing phase in between? ----
  const zoneMarks = m.zoneSteps ?? [];
  const flightDiscontinuities = [];
  const orderedPhases = [...finalPhases].sort((a, b) => a.contactTimeS - b.contactTimeS);
  const allMarksSorted = [...finalMarks].sort((a, b) => a.time - b.time);
  for (let i = 0; i < orderedPhases.length - 1; i++) {
    const cur = orderedPhases[i];
    const next = orderedPhases[i + 1];
    // marks strictly between cur and next in time, by the full mark list
    const between = allMarksSorted.filter((mk) => mk.time > cur.contactTimeS + 1e-9 && mk.time < next.contactTimeS - 1e-9);
    if (between.length > 0) {
      flightDiscontinuities.push({
        fromFrame: cur.frame, fromSide: cur.side, toFrame: next.frame, toSide: next.side,
        skippedMarks: between.map((b) => ({ frame: b.frame, side: b.side, time: b.time, sourceFrameIndex: b.sourceFrameIndex })),
        impliedFlightMs: (next.touchdownTimeS - cur.toeOffTimeS) * 1000,
      });
    }
  }

  console.log(JSON.stringify({
    label, sessionId, posePath, frameCount: seq.frames.length, normFps,
    fullRunTotalContacts: fullRun.totalContacts,
    validContacts: m.validContacts,
    combinedStepFrequencyHz: m.combinedStepFrequencyHz,
    reportedZoneTimeS: m.reportedZoneTimeS,
    zoneEntryTimeS: m.zoneEntryTimeS, zoneExitTimeS: m.zoneExitTimeS,
    crossingDetectionMethod: m.crossingDetectionMethod ?? null,
    perSideLandmarks,
    contactDossiers,
    flightDiscontinuities,
    reportedContactFlight: {
      groundContactLeftMs: m.groundContactLeftMs, groundContactRightMs: m.groundContactRightMs,
      groundContactCombinedMs: m.groundContactCombinedMs,
      flightLeftMs: m.flightLeftMs, flightRightMs: m.flightRightMs, flightCombinedMs: m.flightCombinedMs,
    },
  }, null, 2));
} finally {
  Module._resolveFilename = orig;
  rmSync(out, { recursive: true, force: true });
}
