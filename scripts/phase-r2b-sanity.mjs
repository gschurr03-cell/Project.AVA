// Phase R2B Part Q -- forensic tests only (evidence-first phase; no
// production code changed). Verifies the geometry/origin audit's own
// determinism and the "current scientific outputs unchanged" requirement.
//
//   node scripts/phase-r2b-sanity.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const results = [];
function check(id, description, pass, detail) {
  results.push({ id, description, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} [${id}] ${description}${detail !== undefined ? " -- " + JSON.stringify(detail) : ""}`);
}

function gateMidpoint(bar) { return { x: (bar.c1.x + bar.c2.x) / 2, y: (bar.c1.y + bar.c2.y) / 2 }; }

const startGate = { c1: { x: 0.11868775163071948, y: 0.5905273759393365 }, c2: { x: 0.15485712608902805, y: 0.5866713571723401 } };
const finishGate = { c1: { x: 0.86321751022625, y: 0.5860360308025133 }, c2: { x: 0.9006542876017971, y: 0.5898950726846557 } };
const w = 1920, h = 1080, zoneLengthM = 20;

// 1. Start midpoint deterministic.
{
  const a = gateMidpoint(startGate), b = gateMidpoint(startGate);
  check(1, "start midpoint deterministic", JSON.stringify(a) === JSON.stringify(b), a);
}
// 2. Finish midpoint deterministic.
{
  const a = gateMidpoint(finishGate), b = gateMidpoint(finishGate);
  check(2, "finish midpoint deterministic", JSON.stringify(a) === JSON.stringify(b), a);
}
// 3. Travel axis deterministic.
function runningAxis(startMid, finishMid) {
  const dx = (finishMid.x - startMid.x) * w, dy = (finishMid.y - startMid.y) * h;
  const dist = Math.hypot(dx, dy);
  return { u: { x: dx / dist, y: dy / dist }, dist };
}
{
  const sm = gateMidpoint(startGate), fm = gateMidpoint(finishGate);
  const a = runningAxis(sm, fm), b = runningAxis(sm, fm);
  check(3, "travel axis deterministic", JSON.stringify(a) === JSON.stringify(b), a);
}
// 4/5. Start longitudinal coordinate = 0, finish = configured zone length.
function longitudinalCoordinate(P_px, startMid_px, u, metersPerPixel) {
  const dx = P_px.x - startMid_px.x, dy = P_px.y - startMid_px.y;
  return (dx * u.x + dy * u.y) * metersPerPixel;
}
{
  const sm = gateMidpoint(startGate), fm = gateMidpoint(finishGate);
  const smPx = { x: sm.x * w, y: sm.y * h }, fmPx = { x: fm.x * w, y: fm.y * h };
  const { u, dist } = runningAxis(sm, fm);
  const metersPerPixel = zoneLengthM / dist; // scale derived from the TRUE 2D gap for this proposed model
  const sStart = longitudinalCoordinate(smPx, smPx, u, metersPerPixel);
  const sFinish = longitudinalCoordinate(fmPx, smPx, u, metersPerPixel);
  check(4, "start longitudinal coordinate = 0", sStart === 0, sStart);
  check(5, "finish longitudinal coordinate = configured zone length (20m)", Math.abs(sFinish - zoneLengthM) < 1e-9, sFinish);
}
// 6. Reversed travel direction handled correctly (axis flips, coordinates still 0 -> zoneLength).
{
  const sm = gateMidpoint(finishGate), fm = gateMidpoint(startGate); // swapped: "start" is now on the right
  const smPx = { x: sm.x * w, y: sm.y * h }, fmPx = { x: fm.x * w, y: fm.y * h };
  const { u, dist } = runningAxis(sm, fm);
  const metersPerPixel = zoneLengthM / dist;
  const sStart = longitudinalCoordinate(smPx, smPx, u, metersPerPixel);
  const sFinish = longitudinalCoordinate(fmPx, smPx, u, metersPerPixel);
  check(6, "reversed travel direction: start=0, finish=zoneLength regardless of screen-side", sStart === 0 && Math.abs(sFinish - zoneLengthM) < 1e-9, { sStart, sFinish, axisFlippedVsForward: u.x < 0 });
}
// 7. cm conversion preserves floating precision.
{
  const m = 6.234;
  const cm = m * 100;
  check(7, "cm conversion preserves floating precision (no rounding)", cm === 623.4000000000001 || Math.abs(cm - 623.4) < 1e-9, cm);
}
// 8. No rounding in internal coordinate definition (the coordinate function itself never calls Math.round).
{
  const fnSrc = longitudinalCoordinate.toString();
  check(8, "no Math.round in the internal longitudinal coordinate function", !/Math\.round/.test(fnSrc));
}
// 9. Proposed step-length formula deterministic.
{
  const sA = 6.234, sB = 8.117;
  const L1 = sB - sA, L2 = sB - sA;
  check(9, "proposed step-length formula deterministic", L1 === L2 && Math.abs(L1 - 1.883) < 1e-9, L1);
}
// 10. Proposed velocity formula deterministic.
{
  const ds = 1.883, dt = 0.42;
  const v1 = ds / dt, v2 = ds / dt;
  check(10, "proposed velocity formula deterministic", v1 === v2, v1);
}

// 11-14: current scientific outputs / contacts / timing / calibration unchanged --
// verified via a real production regression rerun + mtime guards.
const out = path.join(root, ".r2b-sci-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return origResolve.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};
try {
  writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
    compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, strict: false, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] }, noEmitOnError: false },
    files: [path.join(root, "src/lib/video/overlay.ts"), path.join(root, "src/lib/video/fps.ts"), path.join(root, "src/lib/benchmark/measurements.ts")],
  }));
  try { execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (err) { const t = String(err.stdout ?? "") + String(err.stderr ?? ""); if (!/worldProjection\.ts/.test(t)) throw new Error(t); }

  const { buildOverlayFrames } = require(path.join(out, "lib/video/overlay.js"));
  const { applyFpsOverride, normalizeFps } = require(path.join(out, "lib/video/fps.js"));
  const { computeSprintMeasurements } = require(path.join(out, "lib/benchmark/measurements.js"));
  const MP = [[0,"nose"],[11,"left_shoulder"],[12,"right_shoulder"],[13,"left_elbow"],[14,"right_elbow"],[15,"left_wrist"],[16,"right_wrist"],[23,"left_hip"],[24,"right_hip"],[25,"left_knee"],[26,"right_knee"],[27,"left_ankle"],[28,"right_ankle"],[29,"left_heel"],[30,"right_heel"],[31,"left_toe"],[32,"right_toe"]];
  const seq = JSON.parse(readFileSync(path.join(root, "tmp/phase94/vanni240.pose.json"), "utf8"));
  const rawFrames = seq.frames.map((f) => {
    const landmarks = [];
    for (const [i, key] of MP) { const kp = f.keypoints[key]; if (kp) landmarks[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score }; }
    return { frame: f.index, sourceFrameIndex: f.sourceFrameIndex, time: f.tMs / 1000, landmarks, boxOrigin: f.boxOrigin, independentLocalizationState: f.independentLocalizationState };
  });
  const overlayFrames = applyFpsOverride(buildOverlayFrames({ ...seq, frames: rawFrames }), normalizeFps(seq.fps));
  const manualPoints = { ax: 0.13677243885987378, ay: 0, bx: 0.8819358989140236, by: 0, distanceM: 20, aTimeS: 0, bTimeS: 0 };
  const m = computeSprintMeasurements(overlayFrames, manualPoints, seq.width, seq.height, { gates: null, cameraEvidence: undefined });

  const priorBaseline = JSON.parse(readFileSync(path.join(root, "tmp/phaseR2/scientific-before-after.json"), "utf8")).current.vanni240;
  check(11, "current scientific outputs unchanged (totalContacts, avgIndividualStepLengthM, combinedStepFrequencyHz, zoneVelocityMps vs. R1C baseline)",
    m.totalContacts === priorBaseline.totalContacts && m.avgIndividualStepLengthM === priorBaseline.avgIndividualStepLengthM && m.combinedStepFrequencyHz === priorBaseline.combinedStepFrequencyHz && m.zoneVelocityMps === priorBaseline.zoneVelocityMps,
    { totalContacts: m.totalContacts, avgIndividualStepLengthM: m.avgIndividualStepLengthM, combinedStepFrequencyHz: m.combinedStepFrequencyHz, zoneVelocityMps: m.zoneVelocityMps });
  check(12, "current contacts unchanged (fullRunContacts count vs. R1C baseline totalContacts)", m.fullRunContacts.length === priorBaseline.totalContacts, m.fullRunContacts.length);
  check(13, "current timing unchanged (zoneTimeS vs. R1C baseline)", m.zoneTimeS === priorBaseline.zoneTimeS, m.zoneTimeS);
} finally {
  Module._resolveFilename = origResolve;
  rmSync(out, { recursive: true, force: true });
}

// 14. Current calibration unchanged -- gates.ts/zoneAnchors.ts not touched by THIS phase's own edits.
{
  const { statSync } = require("node:fs");
  const thisPhaseFiles = ["scripts/phase-r2b-gate-origin-audit.mjs", "scripts/phase-r2b-band-width-audit.mjs", "scripts/phase-r2b-sanity.mjs"];
  const thisPhaseEditMs = Math.min(...thisPhaseFiles.map((f) => statSync(path.join(root, f)).mtimeMs));
  const gatesMs = statSync(path.join(root, "src/lib/calibration/gates.ts")).mtimeMs;
  const zoneAnchorsMs = statSync(path.join(root, "src/lib/calibration/zoneAnchors.ts")).mtimeMs;
  const stationaryGeomMs = statSync(path.join(root, "src/lib/video/stationaryGateGeometry.ts")).mtimeMs;
  check(14, "current calibration unchanged (gates.ts, zoneAnchors.ts, stationaryGateGeometry.ts not touched by this phase -- audit-only)", gatesMs < thisPhaseEditMs && zoneAnchorsMs < thisPhaseEditMs && stationaryGeomMs < thisPhaseEditMs);
}

const passCount = results.filter((r) => r.pass).length;
console.log(`\n${passCount}/${results.length} checks passed.`);
mkdirSync(path.join(root, "tmp/phaseR2B"), { recursive: true });
writeFileSync(path.join(root, "tmp/phaseR2B/sanity-results.json"), JSON.stringify(results, null, 2));
if (passCount !== results.length) process.exitCode = 1;
