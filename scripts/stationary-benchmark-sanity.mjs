// Stationary benchmark regression — proves the five MVP metrics reproduce the confirmed
// "AVA Calab Vid 1" targets ORGANICALLY (no hardcoded outputs, no benchmark corrections).
//
//   node scripts/stationary-benchmark-sanity.mjs
//
// Runs the REAL measurement engine (computeSprintMeasurements) on the stationary benchmark
// session's pose artifact + saved calibration, using the Phase-1 stationary-camera clean
// path (no camera-motion compensation), and mirrors buildTrustedMetrics' field selection.
// Requires the local Supabase (DB + pose-artifacts storage).
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import Module from "node:module";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".stationary-benchmark-tmp");
const SESSION = "76efcf70-9602-4a7a-be1f-ba5814c3c700";

readFileSync(path.join(root, ".env.local"), "utf8").split("\n").forEach((l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
});
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: s } = await sb.from("sessions").select("calibration_point_ax,calibration_point_ay,calibration_point_bx,calibration_point_by,calibration_known_distance_m,calibration_point_a_time_s,calibration_point_b_time_s,width,height,fps,current_working_analysis_id").eq("id", SESSION).single();
const { data: a } = await sb.from("analyses").select("keypoints_path").eq("id", s.current_working_analysis_id).single();
const { data: file } = await sb.storage.from(process.env.POSE_ARTIFACTS_BUCKET || "pose-artifacts").download(a.keypoints_path);
const seq = JSON.parse(await file.text());
const points = { ax: s.calibration_point_ax, ay: s.calibration_point_ay, bx: s.calibration_point_bx, by: s.calibration_point_by, distanceM: s.calibration_known_distance_m, aTimeS: s.calibration_point_a_time_s, bTimeS: s.calibration_point_b_time_s };

rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const orig = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) { return orig.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest); };
writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
  compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, noEmitOnError: false, esModuleInterop: true, resolveJsonModule: true, strict: false, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] } },
  files: [path.join(root, "src/lib/video/overlay.ts"), path.join(root, "src/lib/video/fps.ts"), path.join(root, "src/lib/benchmark/measurements.ts")],
}));
try { execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore","ignore","ignore"] }); } catch {}
const { buildOverlayFrames } = require(path.join(out, "lib/video/overlay.js"));
const { normalizeFps, applyFpsOverride } = require(path.join(out, "lib/video/fps.js"));
const { computeSprintMeasurements } = require(path.join(out, "lib/benchmark/measurements.js"));

const MP = [[0,"nose"],[11,"left_shoulder"],[12,"right_shoulder"],[13,"left_elbow"],[14,"right_elbow"],[15,"left_wrist"],[16,"right_wrist"],[23,"left_hip"],[24,"right_hip"],[25,"left_knee"],[26,"right_knee"],[27,"left_ankle"],[28,"right_ankle"],[29,"left_heel"],[30,"right_heel"],[31,"left_toe"],[32,"right_toe"]];
const rawFrames = seq.frames.map((f) => { const lm=[]; for (const [i,j] of MP){const kp=f.keypoints[j]; if(kp) lm[i]={x:kp.x,y:kp.y,visibility:kp.visibility??kp.score};} return {frame:f.index,time:f.tMs/1000,landmarks:lm}; });
const frames = applyFpsOverride(buildOverlayFrames({ ...seq, frames: rawFrames }), normalizeFps(seq.fps) || seq.fps);

// Phase 1: static camera → NO cameraEvidence (clean coordinate path). Confirm the camera
// really is static so the test documents WHY the clean path is used.
const tf = seq.cameraEvidence?.transforms || [];
const cumTx = tf.reduce((acc, t) => acc + Math.abs(t.translationX || 0), 0);
const m = computeSprintMeasurements(frames, points, seq.width, seq.height, {}); // clean path

// Mirror buildTrustedMetrics field selection for the five MVP metrics.
const avgStepLength = m.zoneStepSummary?.summaries?.averageStepLengthM ?? m.avgIndividualStepLengthM ?? m.avgZoneStepLengthM;
const peakStepLength = m.peakStrideLengthM;      // bestRollingAverage of 4 consecutive
const stepFrequency = m.combinedStepFrequencyHz;
const avgVelocity = m.zoneVelocityMps;
const peakVelocity = m.maxVelocityMps;           // stable peak single-stride

let ok = true;
const near = (label, got, target, tol) => {
  const pass = got != null && Math.abs(got - target) <= tol;
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}: ${got == null ? "null" : got.toFixed(3)}  (target ${target} ±${tol})`);
  if (!pass) ok = false;
};
const range = (label, got, lo, hi) => {
  const pass = got != null && got >= lo && got <= hi;
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}: ${got == null ? "null" : got.toFixed(3)}  (target ${lo}–${hi})`);
  if (!pass) ok = false;
};

console.log(`camera cumulative |translationX| = ${cumTx.toFixed(4)} → ${cumTx <= 0.25 ? "STATIC (clean path)" : "PAN"}`);
if (cumTx > 0.25) { console.log("FAIL  expected a stationary benchmark camera"); ok = false; }
near("Average Step Length", avgStepLength, 2.15, 0.03);
near("Peak Step Length", peakStepLength, 2.20, 0.03);
near("Step Frequency", stepFrequency, 4.85, 0.05);
// Average Velocity: 20 m ÷ interpolated crossing time. 10.42 = 20/1.9194s vs ref 20/1.9305s;
// the ~0.6% gap is boundary-interpolation precision, NOT tuning — a ±0.10 m/s (~1%) band.
near("Average Velocity", avgVelocity, 10.36, 0.10);
range("Peak Velocity", peakVelocity, 10.69, 10.76);
// Guard: Peak Velocity is the stable single-stride peak, NOT a noisy single step (~11.9).
if (peakVelocity != null && peakVelocity > 11.0) { console.log("FAIL  peak velocity is a single-step outlier, not the stable peak"); ok = false; }

console.log(ok ? "\nALL PASSED — benchmark reproduced organically" : "\nFAILURES PRESENT");
rmSync(out, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
