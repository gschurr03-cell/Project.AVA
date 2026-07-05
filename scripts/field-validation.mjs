// Field validation (Day 77) — grade AVA against a real-world timing-gate + tape-grid
// trial. VALIDATION/REPORTING ONLY — recomputes AVA's measured numbers from the pose
// artifact + calibration (the same path as benchmark-breakdown; no analysis math is
// touched) and compares them to ground truth you enter.
//
//   node scripts/field-validation.mjs --truth trial.json [--pose <artifact.json>] [--session <id>] [--fps raw|norm]
//   node scripts/field-validation.mjs --gate-time 1.93 --steps 9 [--distance 20] [--gate Freelap]
//
// Ground-truth JSON (all fields optional; --truth file merged with any inline flags):
//   {
//     "label": "Athlete A — trial 1",
//     "zoneDistanceM": 20,
//     "gateTimeS": 1.93,
//     "gateSystem": "Freelap",
//     "manualStepCount": 9,
//     "manualStepLengthsM": [2.08, 2.09, 2.15, 2.10, 2.16, 2.11, 2.16, 2.25, 2.18]
//   }
// See docs/field-validation-protocol.md for the on-field capture protocol.

import { execFileSync, execSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".fieldval-tmp");

// --- args ---
const argv = process.argv.slice(2);
let posePath = path.join(root, "artifacts/pose-sequences/calab.pose.json");
let sessionId = null;
let whichFps = "norm";
let truthPath = null;
const inlineTruth = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--pose") posePath = path.resolve(argv[++i]);
  else if (a === "--session") sessionId = argv[++i];
  else if (a === "--fps") whichFps = argv[++i];
  else if (a === "--truth") truthPath = path.resolve(argv[++i]);
  else if (a === "--gate-time") inlineTruth.gateTimeS = Number(argv[++i]);
  else if (a === "--steps") inlineTruth.manualStepCount = Number(argv[++i]);
  else if (a === "--distance") inlineTruth.zoneDistanceM = Number(argv[++i]);
  else if (a === "--gate") inlineTruth.gateSystem = argv[++i];
  else if (a === "--label") inlineTruth.label = argv[++i];
}
if (!existsSync(posePath)) {
  console.error(`error: pose artifact not found: ${posePath}`);
  process.exit(1);
}
let truth = { ...inlineTruth };
if (truthPath) {
  if (!existsSync(truthPath)) {
    console.error(`error: truth file not found: ${truthPath}`);
    process.exit(1);
  }
  truth = { ...JSON.parse(readFileSync(truthPath, "utf8")), ...inlineTruth };
}
if (Object.keys(truth).length === 0) {
  console.error("error: no ground truth given. Pass --truth <file.json> or inline flags (--gate-time, --steps, ...).");
  process.exit(1);
}

// --- fetch calibration from the local DB ---
function psql(sql) {
  const cmd = `docker exec supabase_db_project-ava psql -U postgres -d postgres -tA -F '|' -c "${sql.replace(/"/g, '\\"')}"`;
  return execSync(cmd, { encoding: "utf8" }).trim();
}
const where = sessionId ? `s.id='${sessionId}'` : "s.benchmark_id is not null";
const row = psql(
  `select s.id, s.fps, s.calibration_point_ax, s.calibration_point_ay, s.calibration_point_bx, s.calibration_point_by, s.calibration_known_distance_m, coalesce(s.calibration_point_a_time_s::text,'0'), coalesce(s.calibration_point_b_time_s::text,'0') from public.sessions s where ${where} limit 1`,
).split("\n")[0];
if (!row) {
  console.error("error: no matching session found in the DB (need calibration).");
  process.exit(1);
}
const [sid, fpsRaw, ax, ay, bx, by, distM, aT, bT] = row.split("|");
const points = {
  ax: Number(ax), ay: Number(ay), bx: Number(bx), by: Number(by),
  distanceM: Number(distM), aTimeS: Number(aT), bTimeS: Number(bT),
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const orig = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return orig.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};

const f = (v, d = 3) => (v == null ? "—" : v.toFixed(d));
const sgn = (v, d = 3) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(d)}`);

try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, strict: false, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] } },
      files: [
        path.join(root, "src/lib/video/overlay.ts"),
        path.join(root, "src/lib/video/fps.ts"),
        path.join(root, "src/lib/benchmark/measurements.ts"),
        path.join(root, "src/lib/validation/fieldValidation.ts"),
      ],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { buildOverlayFrames } = require(path.join(out, "lib/video/overlay.js"));
  const { applyFpsOverride, normalizeFps } = require(path.join(out, "lib/video/fps.js"));
  const { computeSprintMeasurements } = require(path.join(out, "lib/benchmark/measurements.js"));
  const { buildFieldValidation } = require(path.join(out, "lib/validation/fieldValidation.js"));

  const seq = JSON.parse(readFileSync(posePath, "utf8"));
  const MP = [[0,"nose"],[11,"left_shoulder"],[12,"right_shoulder"],[13,"left_elbow"],[14,"right_elbow"],[15,"left_wrist"],[16,"right_wrist"],[23,"left_hip"],[24,"right_hip"],[25,"left_knee"],[26,"right_knee"],[27,"left_ankle"],[28,"right_ankle"],[29,"left_heel"],[30,"right_heel"],[31,"left_toe"],[32,"right_toe"]];
  const rawFrames = seq.frames.map((fr) => {
    const landmarks = [];
    for (const [i, j] of MP) { const kp = fr.keypoints[j]; if (kp) landmarks[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score }; }
    return { frame: fr.index, time: fr.tMs / 1000, landmarks };
  });
  const baseFrames = buildOverlayFrames({ ...seq, frames: rawFrames });
  const rawFps = Number(fpsRaw) || seq.fps;
  const normFps = normalizeFps(rawFps);
  const fps = whichFps === "raw" ? rawFps : normFps;
  const m = computeSprintMeasurements(applyFpsOverride(baseFrames, fps), points, seq.width, seq.height);

  const observed = {
    zoneTimeS: m.zoneTimeS,
    zoneDistanceM: m.zone?.distanceM ?? null,
    zoneVelocityMps: m.zoneVelocityMps,
    validContacts: m.validContacts,
    combinedStepFrequencyHz: m.combinedStepFrequencyHz,
    avgIndividualStepLengthM: m.avgIndividualStepLengthM,
    stepLengthsM: m.zoneSteps.map((s) => s.stepLengthM).filter((v) => v != null),
  };

  const report = buildFieldValidation(observed, truth);

  console.log("=".repeat(84));
  console.log(`Field validation — ${report.label}   (session ${sid})`);
  console.log(`pose: ${path.relative(root, posePath)}   FPS: ${whichFps === "raw" ? rawFps.toFixed(3) + " raw" : normFps + " normalized"}`);
  console.log(`ground truth: ${JSON.stringify(truth)}`);
  console.log("=".repeat(84));

  console.log("\n  metric                             AVA        truth      error      %err");
  console.log("  " + "-".repeat(74));
  for (const r of report.rows) {
    const errUnit = r.unit === "count" ? sgn(r.errorAbs, 0) : sgn(r.errorAbs, r.unit === "m" ? 3 : r.unit === "s" ? 3 : 2);
    console.log(
      `  ${r.metric.padEnd(34)} ${f(r.ava, r.unit === "count" ? 0 : 2).padStart(8)}  ${f(r.truth, r.unit === "count" ? 0 : 2).padStart(8)}  ${errUnit.padStart(8)}  ${(r.errorPct == null ? "—" : sgn(r.errorPct, 1) + "%").padStart(7)}`,
    );
    if (r.note) console.log(`     ↳ ${r.note}`);
  }
  console.log(`\n  (context) AVA displayed combined frequency: ${f(report.displayedFrequencyHz, 2)} Hz — contact-span based, not scored above.`);

  if (report.steps.length > 0) {
    console.log("\n  per-step length (AVA vs tape grid):");
    console.log("    #   AVA(m)  truth(m)  err(cm)   %err");
    console.log("    " + "-".repeat(40));
    for (const s of report.steps) {
      console.log(
        `   ${String(s.index).padStart(2)}   ${f(s.ava, 3).padStart(6)}  ${f(s.truth, 3).padStart(7)}  ${sgn(s.errorCm, 1).padStart(7)}  ${(s.errorPct == null ? "—" : sgn(s.errorPct, 1) + "%").padStart(6)}`,
      );
    }
    console.log(`\n  step summary: paired ${report.summary.pairedSteps}   mean |error| ${f(report.summary.meanAbsStepErrorCm, 1)} cm   max |error| ${f(report.summary.maxAbsStepErrorCm, 1)} cm`);
  }

  if (report.gaps.length > 0) {
    console.log("\n  not validated (missing ground truth):");
    for (const g of report.gaps) console.log(`   • ${g}`);
  }

  console.log("\n  (validation/reporting only — no analysis math changed)");
} finally {
  rmSync(out, { recursive: true, force: true });
}
