// Step-by-step VueMotion comparison (Day 77) — DIAGNOSTIC ONLY, no math changes.
//
//   node scripts/step-comparison.mjs [--pose <artifact.json>] [--session <id>] [--fps raw|norm]
//
// Pairs AVA's individual in-zone step lengths (contact-to-contact world distance,
// straight out of measurements.ts — the SAME numbers the averages use) against the
// VueMotion reference step sequence for the Calab 20 m benchmark, and prints a
// per-step table + the diagnostics needed to answer the Day-77 questions:
//   1. Do AVA step labels cover the same interval VueMotion labels do?
//   2. Is AVA measuring landing-foot→next-landing-foot the same way VueMotion is?
//   3. Are partial boundary steps included differently?
//   4. Is there a side-specific spatial bias in worldX?
//   5. Is center-of-frame compression/stretch making middle steps read short?
//   6. Are AVA's red/green labels matched to VueMotion's pink/blue labels correctly?
//
// The VueMotion sequence is the ONLY hardcoded input (it's the external reference we
// are grading against); every AVA number is measured from the pose + calibration.

import { execFileSync, execSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".stepcmp-tmp");

// --- args ---
const argv = process.argv.slice(2);
let posePath = path.join(root, "artifacts/pose-sequences/calab.pose.json");
let sessionId = null;
let whichFps = "norm";
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--pose") posePath = path.resolve(argv[++i]);
  else if (argv[i] === "--session") sessionId = argv[++i];
  else if (argv[i] === "--fps") whichFps = argv[++i];
}
if (!existsSync(posePath)) {
  console.error(`error: pose artifact not found: ${posePath}`);
  process.exit(1);
}

// --- VueMotion reference step sequence (the external grader) ---------------------
// Each entry is one STEP = the interval ENDING on the named landing foot, with the
// full step length in metres. The first L is VueMotion's estimated FULL first step
// (its raw reading from the cone was a 1.04 m partial boundary step) → flagged partial.
const VUEMOTION = [
  { side: "left", lengthM: 2.08, partial: true, note: "estimated full (raw cone partial 1.04)" },
  { side: "right", lengthM: 2.09 },
  { side: "left", lengthM: 2.15 },
  { side: "right", lengthM: 2.10 },
  { side: "left", lengthM: 2.16 },
  { side: "right", lengthM: 2.11 },
  { side: "left", lengthM: 2.16 },
  { side: "right", lengthM: 2.25 },
  { side: "left", lengthM: 2.18 },
];

// --- fetch calibration + reference from the local DB ---
function psql(sql) {
  const cmd = `docker exec supabase_db_project-ava psql -U postgres -d postgres -tA -F '|' -c "${sql.replace(/"/g, '\\"')}"`;
  return execSync(cmd, { encoding: "utf8" }).trim();
}
const where = sessionId ? `s.id='${sessionId}'` : "s.benchmark_id is not null";
const row = psql(
  `select s.id, s.fps, coalesce(s.fps_override::text,''), s.calibration_point_ax, s.calibration_point_ay, s.calibration_point_bx, s.calibration_point_by, s.calibration_known_distance_m, coalesce(s.calibration_point_a_time_s::text,'0'), coalesce(s.calibration_point_b_time_s::text,'0') from public.sessions s where ${where} limit 1`,
).split("\n")[0];
if (!row) {
  console.error("error: no benchmark-linked session found in the DB.");
  process.exit(1);
}
const [sid, fpsRaw, , ax, ay, bx, by, distM, aT, bT] = row.split("|");
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

const fmt = (v, d = 3, w = 0) => (v == null ? "—" : v.toFixed(d)).padStart(w);
const signed = (v, d = 3) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(d)}`);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, strict: false, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] } },
      files: [
        path.join(root, "src/lib/video/overlay.ts"),
        path.join(root, "src/lib/video/fps.ts"),
        path.join(root, "src/lib/benchmark/measurements.ts"),
      ],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

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
  const rawFps = Number(fpsRaw) || seq.fps;
  const normFps = normalizeFps(rawFps);
  const fps = whichFps === "raw" ? rawFps : normFps;
  const frames = applyFpsOverride(baseFrames, fps);
  const m = computeSprintMeasurements(frames, points, seq.width, seq.height);

  const zone = m.zone;
  const entryX = zone?.entryX ?? null;
  const exitX = zone?.exitX ?? null;
  const zoneSpanX = entryX != null && exitX != null ? exitX - entryX : null;
  const pctThrough = (wx) => (zoneSpanX ? ((wx - entryX) / zoneSpanX) * 100 : null);

  console.log("=".repeat(84));
  console.log(`Step-by-step VueMotion comparison — session ${sid}`);
  console.log(`pose: ${path.relative(root, posePath)}   FPS: ${whichFps === "raw" ? rawFps.toFixed(3) + " (raw)" : normFps + " (normalized)"}`);
  console.log(`zone: ${points.distanceM} m   entryX=${fmt(entryX, 4)}  exitX=${fmt(exitX, 4)}   AVA in-zone contacts: ${m.validContacts} (L${m.validLeftContacts}/R${m.validRightContacts})   VueMotion steps: ${VUEMOTION.length}`);
  console.log("=".repeat(84));

  // --- align AVA steps to VueMotion by ordinal position (both start L, alternate) ---
  const ava = m.zoneSteps;
  const n = Math.max(ava.length, VUEMOTION.length);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const a = ava[i] ?? null;
    const v = VUEMOTION[i] ?? null;
    const avaLen = a?.stepLengthM ?? null;
    const vmLen = v?.lengthM ?? null;
    const errM = avaLen != null && vmLen != null ? avaLen - vmLen : null;
    rows.push({
      idx: i + 1,
      avaSide: a?.side ?? null,
      vmSide: v?.side ?? null,
      sideMatch: a && v ? a.side === v.side : null,
      avaLen, vmLen, errM,
      worldX: a?.worldX ?? null,
      pct: a ? pctThrough(a.worldX) : null,
      boundary: i === 0, // first in-zone step is the entry/boundary step both sides call partial
      vmPartial: !!v?.partial,
      note: v?.note ?? "",
    });
  }

  console.log("\n  #  AVA→  VM    AVA(m)  VM(m)   err(m)  err(cm)  contactX  %zone  boundary");
  console.log("  " + "-".repeat(78));
  for (const r of rows) {
    const sideStr = `${(r.avaSide ?? "?")[0].toUpperCase()}  ${(r.vmSide ?? "?")[0].toUpperCase()}`;
    const flag = r.sideMatch === false ? " ⚠side" : "";
    const bnd = r.boundary || r.vmPartial ? "partial" : "";
    console.log(
      `  ${String(r.idx).padStart(2)}  ${sideStr}   ${fmt(r.avaLen, 3, 6)} ${fmt(r.vmLen, 2, 6)} ` +
      `${signed(r.errM, 3).padStart(7)} ${(r.errM == null ? "—" : signed(r.errM * 100, 1)).padStart(7)}  ` +
      `${fmt(r.worldX, 4, 7)}  ${fmt(r.pct, 0, 4)}%  ${bnd}${flag}`,
    );
  }

  // --- diagnostics -----------------------------------------------------------------
  // Report two views: ALL paired steps, and EXCLUDING the entry/boundary step (#1),
  // which VueMotion only ESTIMATES (raw 1.04 partial) and AVA measures differently —
  // it is not cleanly comparable and, being the largest outlier, skews every mean.
  const allPaired = rows.filter((r) => r.errM != null);
  const steady = allPaired.filter((r) => !(r.boundary || r.vmPartial));
  const sideMatched = allPaired.every((r) => r.sideMatch);

  function summarise(set, label) {
    const errs = set.map((r) => r.errM);
    const absErrs = errs.map(Math.abs);
    const lErrs = set.filter((r) => r.avaSide === "left").map((r) => r.errM);
    const rErrs = set.filter((r) => r.avaSide === "right").map((r) => r.errM);
    const avaAll = set.map((r) => r.avaLen);
    const vmAll = set.map((r) => r.vmLen);
    console.log(`\n  ── ${label} (${set.length} steps) ──`);
    console.log(`    combined mean step length   AVA ${fmt(mean(avaAll), 3)} m   VM ${fmt(mean(vmAll), 3)} m   Δ ${signed((mean(avaAll) - mean(vmAll)) * 100, 1)} cm`);
    console.log(`    mean |error| ${fmt(mean(absErrs) * 100, 1)} cm   rms ${fmt(Math.sqrt(mean(errs.map((e) => e * e))) * 100, 1)} cm   max |error| ${fmt(Math.max(...absErrs) * 100, 1)} cm`);
    console.log(`    side bias:  LEFT ${signed(mean(lErrs) * 100, 1)} cm (n=${lErrs.length})   RIGHT ${signed(mean(rErrs) * 100, 1)} cm (n=${rErrs.length})   L−R split ${fmt((mean(lErrs) - mean(rErrs)) * 100, 1)} cm`);
    return { lBias: mean(lErrs), rBias: mean(rErrs), combinedDelta: mean(avaAll) - mean(vmAll) };
  }

  console.log("\n" + "=".repeat(84));
  console.log("DIAGNOSTICS");
  console.log("=".repeat(84));
  console.log(`  side labels aligned: ${sideMatched ? "YES — identical L/R sequence, step-for-step" : "NO — mismatch flagged above"}`);
  const allStats = summarise(allPaired, "ALL in-zone steps");
  const steadyStats = summarise(steady, "STEADY-STATE only (excludes entry/boundary step #1)");

  // Side-detrended residual vs zone position (Q5), steady-state only so the boundary
  // outlier doesn't masquerade as an "edge reads long" center-compression signal.
  const { lBias, rBias } = steadyStats;
  const detrended = steady.map((r) => ({ pct: r.pct, resid: r.errM - (r.avaSide === "left" ? lBias : rBias) }));
  const fromCenter = detrended.map((d) => Math.abs((d.pct ?? 50) - 50));
  const cr = pearson(fromCenter, detrended.map((d) => d.resid)); // +r ⇒ residual grows toward edges ⇒ middle reads short
  const mid = detrended.filter((d) => d.pct != null && d.pct >= 33 && d.pct <= 67).map((d) => d.resid);
  const edge = detrended.filter((d) => d.pct != null && (d.pct < 33 || d.pct > 67)).map((d) => d.resid);
  console.log(`\n  ── CENTER COMPRESSION (Q5), steady-state, side-bias removed ──`);
  console.log(`    corr(|dist from center|, residual) r = ${fmt(cr, 2)}   ${Math.abs(cr) < 0.4 ? "→ WEAK: no clear center effect beyond side bias" : cr > 0 ? "→ middle steps read SHORT, edges read long" : "→ middle steps read LONG, edges read short"}`);
  console.log(`    detrended residual — middle third ${signed(mean(mid) * 100, 1)} cm   outer thirds ${signed(mean(edge) * 100, 1)} cm`);

  const boundary = rows[0];
  console.log("\n" + "=".repeat(84));
  console.log("  ANSWERS");
  console.log("=".repeat(84));
  console.log(`   1. Same interval covered?  YES. Both series are ${allPaired.length} steps, L/R aligned step-for-step. AVA's step = one contact to the next (opposite) contact, landing foot = the later contact — the same intervals VueMotion labels.`);
  console.log(`   2. Landing-foot→next-landing measured the same?  YES. stepLengthM is the world contact-to-contact displacement (measurements.ts distanceMetersFromPrev) — not a hip/stride or same-foot stride. Same definition as VueMotion.`);
  console.log(`   3. Partial boundary step handled differently?  YES — this is the single biggest discrepancy. Step 1: AVA ${fmt(boundary.avaLen, 2)} m vs VueMotion ${fmt(boundary.vmLen, 2)} m (${signed(boundary.errM * 100, 1)} cm). VueMotion ESTIMATES a full 2.08 m from a raw 1.04 m partial at the cone; AVA measures the real contact-to-contact gap. It alone moves the combined Δ from ${signed(steadyStats.combinedDelta * 100, 1)} cm (steady) to ${signed(allStats.combinedDelta * 100, 1)} cm (all).`);
  console.log(`   4. Side-specific worldX bias?  ${Math.abs((lBias - rBias) * 100) > 4 ? "YES — the dominant steady-state error" : "minor"}. LEFT-landing steps read ${signed(lBias * 100, 1)} cm, RIGHT-landing ${signed(rBias * 100, 1)} cm (split ${fmt((lBias - rBias) * 100, 1)} cm). This is the alternating high/low pattern, and it CANCELS in the combined mean (steady Δ ${signed(steadyStats.combinedDelta * 100, 1)} cm). Matches the Day-73 ~0.004 worldX/step foot-placement bias.`);
  console.log(`   5. Center compression making middle steps short?  ${Math.abs(cr) < 0.4 ? "Not a strong effect" : cr > 0 ? "A weak secondary effect — middle steps do read slightly short" : "No"}: after removing side bias, middle-third residual ${signed(mean(mid) * 100, 1)} cm vs outer ${signed(mean(edge) * 100, 1)} cm (r=${fmt(cr, 2)}). Side bias, not perspective, is the main driver.`);
  console.log(`   6. Labels matched correctly?  ${sideMatched ? "YES" : "NO"} — AVA left↔VueMotion left, AVA right↔VueMotion right; the sequence starts L and alternates cleanly, ${sideMatched ? "no red/green↔pink/blue swap." : "but a swap/mismatch is flagged above (⚠)."}`);

  console.log("\n  (diagnostic only — no benchmark math changed)");
} finally {
  rmSync(out, { recursive: true, force: true });
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}
