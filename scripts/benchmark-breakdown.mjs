// Benchmark breakdown (Day 73) — the full zone math for a benchmark-linked session,
// in one place, so we can see exactly how every headline metric is produced and
// compare AVA against the reference step-by-step.
//
//   node scripts/benchmark-breakdown.mjs [--pose <artifact.json>] [--session <id>]
//
// Reads the benchmark-linked session's calibration + reference from the local DB
// (via docker psql) and the pose artifact from artifacts/pose-sequences/, then prints:
//   • FPS raw + normalized (60/120/240 snap)
//   • calibrated gate world-x, metres-per-pixel, zone distance
//   • start/finish gate crossing times + zone time
//   • the full-run contact stream and the in-zone contacts
//   • per-step distances through the zone + per-side + combined averages
//   • headline AVA vs benchmark, percent error per metric
// Computed for BOTH the raw and normalized FPS so the timing effect is visible.
//
// No hardcoded benchmark outputs — everything is measured from the pose + calibration.

import { execFileSync, execSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".breakdown-tmp");

// --- args ---
const argv = process.argv.slice(2);
let posePath = path.join(root, "artifacts/pose-sequences/calab.pose.json");
let sessionId = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--pose") posePath = path.resolve(argv[++i]);
  else if (argv[i] === "--session") sessionId = argv[++i];
}
if (!existsSync(posePath)) {
  console.error(`error: pose artifact not found: ${posePath}`);
  process.exit(1);
}

// --- fetch calibration + reference from the local DB ---
function psql(sql) {
  const cmd = `docker exec supabase_db_project-ava psql -U postgres -d postgres -tA -F '|' -c "${sql.replace(/"/g, '\\"')}"`;
  return execSync(cmd, { encoding: "utf8" }).trim();
}
const where = sessionId ? `s.id='${sessionId}'` : "s.benchmark_id is not null";
const row = psql(
  `select s.id, s.fps, coalesce(s.fps_override::text,''), s.calibration_point_ax, s.calibration_point_ay, s.calibration_point_bx, s.calibration_point_by, s.calibration_known_distance_m, coalesce(s.calibration_point_a_time_s::text,'0'), coalesce(s.calibration_point_b_time_s::text,'0'), b.reference_metrics from public.sessions s join public.benchmarks b on b.id=s.benchmark_id where ${where} limit 1`,
).split("\n")[0];
if (!row) {
  console.error("error: no benchmark-linked session found in the DB.");
  process.exit(1);
}
const [sid, fpsRaw, fpsOverride, ax, ay, bx, by, distM, aT, bT, refJson] = row.split("|");
const points = {
  ax: Number(ax), ay: Number(ay), bx: Number(bx), by: Number(by),
  distanceM: Number(distM), aTimeS: Number(aT), bTimeS: Number(bT),
};
const reference = JSON.parse(refJson);

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
      compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, strict: false, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] } },
      files: [
        path.join(root, "src/lib/video/overlay.ts"),
        path.join(root, "src/lib/video/fps.ts"),
        path.join(root, "src/lib/benchmark/measurements.ts"),
        path.join(root, "src/lib/benchmark/index.ts"),
      ],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { buildOverlayFrames } = require(path.join(out, "lib/video/overlay.js"));
  const { applyFpsOverride, normalizeFps } = require(path.join(out, "lib/video/fps.js"));
  const { computeSprintMeasurements } = require(path.join(out, "lib/benchmark/measurements.js"));
  const { assembleAvaValues, compareToBenchmark, evaluateAccuracy } = require(path.join(out, "lib/benchmark/index.js"));

  const seq = JSON.parse(readFileSync(posePath, "utf8"));
  const MP = [[0,"nose"],[11,"left_shoulder"],[12,"right_shoulder"],[13,"left_elbow"],[14,"right_elbow"],[15,"left_wrist"],[16,"right_wrist"],[23,"left_hip"],[24,"right_hip"],[25,"left_knee"],[26,"right_knee"],[27,"left_ankle"],[28,"right_ankle"],[29,"left_heel"],[30,"right_heel"],[31,"left_toe"],[32,"right_toe"]];
  const rawFrames = seq.frames.map((f) => {
    const landmarks = [];
    for (const [i, j] of MP) { const kp = f.keypoints[j]; if (kp) landmarks[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score }; }
    return { frame: f.index, time: f.tMs / 1000, landmarks };
  });
  const baseFrames = buildOverlayFrames({ ...seq, frames: rawFrames });

  const rawFps = Number(fpsRaw) || seq.fps;
  const normFps = normalizeFps(rawFps);
  const W = seq.width, H = seq.height;

  console.log("=".repeat(72));
  console.log(`Benchmark breakdown — session ${sid}`);
  console.log(`pose: ${path.relative(root, posePath)}  (${W}x${H}, ${seq.frames.length} frames)`);
  console.log(`FPS raw: ${rawFps.toFixed(4)}   normalized: ${normFps}   override: ${fpsOverride || "—"}`);
  console.log(`gate A (start): x=${points.ax.toFixed(4)} @${points.aTimeS}s   gate B (finish): x=${points.bx.toFixed(4)} @${points.bTimeS}s   distance: ${points.distanceM} m`);
  console.log("=".repeat(72));

  const num = (v, d = 2) => (v == null ? "—" : v.toFixed(d));

  for (const [label, fps] of [["RAW FPS " + rawFps.toFixed(3), rawFps], ["NORMALIZED FPS " + normFps, normFps]]) {
    const frames = applyFpsOverride(baseFrames, fps);
    const m = computeSprintMeasurements(frames, points, W, H);
    console.log(`\n### ${label} ###`);
    console.log(`metres/pixel: ${m.metersPerPixel?.toExponential(4)}   zone dist: ${m.zone?.distanceM} m`);
    console.log(`start crossing: ${num(m.zoneEntryTimeS, 4)}s   finish crossing: ${num(m.zoneExitTimeS, 4)}s   zone time: ${num(m.zoneTimeS, 4)}s`);
    console.log(`contacts: full-run ${m.totalContacts} (L${m.leftContacts}/R${m.rightContacts})   in-zone ${m.validContacts} (L${m.validLeftContacts}/R${m.validRightContacts})`);
    console.log(`\n  in-zone steps (contact-to-contact):`);
    console.log(`   #  side  time     worldX   from→  stepLen(m)`);
    for (const s of m.zoneSteps) {
      console.log(`  ${String(s.index).padStart(2)}  ${s.side.padEnd(5)} ${s.timeS.toFixed(3)}  ${s.worldX.toFixed(4)}  ${(s.fromSide ? s.fromSide[0].toUpperCase() : "—")}→${s.side[0].toUpperCase()}   ${s.stepLengthM == null ? "—" : s.stepLengthM.toFixed(3)}`);
    }
    const stepsWithLen = m.zoneSteps.filter((s) => s.stepLengthM != null);
    const lefts = stepsWithLen.filter((s) => s.side === "left").map((s) => s.stepLengthM);
    const rights = stepsWithLen.filter((s) => s.side === "right").map((s) => s.stepLengthM);
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    console.log(`\n  step length — individual mean: ${num(m.avgIndividualStepLengthM, 3)} m   zone D÷N: ${num(m.avgZoneStepLengthM, 3)} m`);
    console.log(`  per-side (median): L ${num(m.leftStepLengthM, 3)}  R ${num(m.rightStepLengthM, 3)}   (per-side mean: L ${num(avg(lefts), 3)}  R ${num(avg(rights), 3)})`);
    console.log(`  frequency: combined ${num(m.combinedStepFrequencyHz)}  L ${num(m.leftStepFrequencyHz)}  R ${num(m.rightStepFrequencyHz)}   velocity: zone ${num(m.zoneVelocityMps)}  max ${num(m.maxVelocityMps)}`);

    const ava = assembleAvaValues(m, null, { activeFps: fps });
    console.log(`\n  AVA vs benchmark:`);
    for (const r of compareToBenchmark(ava, reference)) {
      if (r.benchmarkValue == null) continue;
      console.log(`    ${r.label.padEnd(26)} AVA ${num(r.avaValue).padStart(7)}  ref ${r.benchmarkValue.toFixed(2).padStart(6)}  err ${(r.percentError == null ? "—" : r.percentError + "%").padStart(7)}`);
    }
    const acc = evaluateAccuracy(ava, reference);
    const passed = acc.filter((a) => a.status === "pass").length;
    console.log(`  accuracy targets passed: ${passed}/${acc.length}`);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
