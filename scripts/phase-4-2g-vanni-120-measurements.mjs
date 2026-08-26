// Phase 4.2E — real zone-based measurements (computeSprintMeasurements, the exact
// production function src/app/sessions/[id]/page.tsx calls at render time) computed
// against a given pose artifact for the vanni_fly_240 session, using the session's
// real, unchanged calibration. Adapted from scripts/benchmark-breakdown.mjs to work
// without a benchmark_id link (vanni_fly_240 has no external ground truth).
//
//   node --env-file=.env.local scripts/phase-4-2e-vanni-240-measurements.mjs <pose.json>

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
const label = process.argv[3] ?? path.basename(posePath);
const out = path.join(root, `.p42e-breakdown-tmp-${label}`);

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: s, error } = await db
  .from("sessions")
  .select("id, fps, fps_override, calibration_point_ax, calibration_point_ay, calibration_point_bx, calibration_point_by, calibration_known_distance_m, calibration_point_a_time_s, calibration_point_b_time_s")
  .eq("id", "160a86a2-c0db-4e7d-9fbe-82aedd6d3eff")
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
      ],
    }),
  );
  // noEmitOnError:false still emits despite a pre-existing, unrelated type error in
  // worldProjection.ts (transitively imported, type-only usage) — same known
  // condition documented in scripts/vanni-240-metric-evidence-sanity.mjs.
  try {
    execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const outText = String(err.stdout ?? "") + String(err.stderr ?? "");
    if (!/worldProjection\.ts/.test(outText)) throw err;
  }

  const { buildOverlayFrames } = require(path.join(out, "lib/video/overlay.js"));
  const { applyFpsOverride, normalizeFps } = require(path.join(out, "lib/video/fps.js"));
  const { computeSprintMeasurements } = require(path.join(out, "lib/benchmark/measurements.js"));

  const seq = JSON.parse(readFileSync(posePath, "utf8"));
  const MP = [[0,"nose"],[11,"left_shoulder"],[12,"right_shoulder"],[13,"left_elbow"],[14,"right_elbow"],[15,"left_wrist"],[16,"right_wrist"],[23,"left_hip"],[24,"right_hip"],[25,"left_knee"],[26,"right_knee"],[27,"left_ankle"],[28,"right_ankle"],[29,"left_heel"],[30,"right_heel"],[31,"left_toe"],[32,"right_toe"]];
  const rawFrames = seq.frames.map((f) => {
    const landmarks = [];
    for (const [i, j] of MP) { const kp = f.keypoints[j]; if (kp) landmarks[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score }; }
    return { frame: f.index, time: f.tMs / 1000, landmarks };
  });
  const baseFrames = buildOverlayFrames({ ...seq, frames: rawFrames });

  const rawFps = Number(s.fps) || seq.fps;
  const normFps = normalizeFps(rawFps);
  const W = seq.width, H = seq.height;
  const frames = applyFpsOverride(baseFrames, normFps);
  const m = computeSprintMeasurements(frames, points, W, H);

  const stepsWithLen = m.zoneSteps.filter((st) => st.stepLengthM != null);
  console.log(JSON.stringify({
    label,
    posePath,
    frameCount: seq.frames.length,
    normFps,
    zoneEntryTimeS: m.zoneEntryTimeS,
    zoneExitTimeS: m.zoneExitTimeS,
    reportedZoneTimeS: m.reportedZoneTimeS,
    totalContacts: m.totalContacts,
    leftContacts: m.leftContacts,
    rightContacts: m.rightContacts,
    validContacts: m.validContacts,
    validLeftContacts: m.validLeftContacts,
    validRightContacts: m.validRightContacts,
    zoneSteps: m.zoneSteps.map((st) => ({ index: st.index, side: st.side, timeS: st.timeS, worldX: st.worldX, stepLengthM: st.stepLengthM })),
    avgIndividualStepLengthM: m.avgIndividualStepLengthM,
    peakStrideLengthM: m.peakStrideLengthM,
    combinedStepFrequencyHz: m.combinedStepFrequencyHz,
    leftStepFrequencyHz: m.leftStepFrequencyHz,
    rightStepFrequencyHz: m.rightStepFrequencyHz,
    reportedZoneVelocityMps: m.reportedZoneVelocityMps,
    reportedMaxVelocityMps: m.reportedMaxVelocityMps,
    metersPerPixel: m.metersPerPixel,
  }, null, 2));
} finally {
  rmSync(out, { recursive: true, force: true });
}
