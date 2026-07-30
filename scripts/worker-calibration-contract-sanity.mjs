// Regression sanity for the WORKER calibration contract (Part 1 §1). Proves the
// worker explicitly reads/validates the calibration a run was queued with, uses the
// exact confirmed coordinates, records revision/source provenance, rejects malformed
// payloads, and stays backward compatible with legacy input.
//
//   node scripts/worker-calibration-contract-sanity.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".worker-contract-tmp");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return originalResolve.call(this, request.startsWith("@/") ? path.join(out, request.slice(2)) : request, ...rest);
};

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022",
        skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node",
        baseUrl: root, paths: { "@/*": ["src/*"] },
      },
      files: [
        path.join(root, "src/lib/calibration/workerContract.ts"),
        path.join(root, "src/lib/calibration/authority.ts"),
        path.join(root, "src/lib/calibration/lifecycle.ts"),
        path.join(root, "src/lib/calibration/gates.ts"),
      ],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const wc = require(path.join(out, "lib/calibration/workerContract.js"));
  const lc = require(path.join(out, "lib/calibration/lifecycle.js"));
  const authMod = require(path.join(out, "lib/calibration/authority.js"));
  const { parseWorkerCalibration, workerResultProvenance, workerCalibrationLogLine, WorkerCalibrationError } = wc;
  const { classifyResultStatus } = lc;

  const bar = (x, t) => ({ c1: { x, y: 0.4111111111 }, c2: { x: x + 0.02, y: 0.6222222222 }, timeS: t });
  const base = () => ({ startGate: bar(0.201234567890123, 1.5), finishGate: bar(0.701234567890123, 3.25), distanceM: 20 });
  const manualFields = authMod.manualConfirmedAuthorityFields(5, new Date("2026-07-21T00:00:00.000Z"));
  const trackingSummary = {
    methodVersion: "ava-background-world-lock-v1", transformCount: 100,
    reliableTransformCount: 95, reliabilityRatio: .95, meanFeatureCount: 240,
    meanInlierRatio: .9, p95ReprojectionErrorPx: .8, lastReliableFrame: 100,
    longestLostRunFrames: 2, reviewed: false,
  };
  const manual = { ...base(), ...manualFields, revision: 5, cameraType: "panning",
    referenceFrameIndex: 12, cameraTrackingSummary: trackingSummary };
  const auto = { ...base(), calibrationSource: "auto", revision: 2 };
  const legacy = base(); // no authority fields

  // 1. Worker parses manual-confirmed calibration.
  const cm = parseWorkerCalibration(manual);
  check("1. parses manual-confirmed (source + revision)", cm.source === "manual_confirmed" && cm.revision === 5);

  // 2. Worker parses auto calibration.
  check("2. parses auto calibration", parseWorkerCalibration(auto).source === "auto");

  // 3. Worker rejects invalid revision/source data (malformed → controlled error).
  let threw = false;
  try { parseWorkerCalibration({ startGate: { c1: { x: 2, y: 0 } }, distanceM: -1 }); }
  catch (e) { threw = e instanceof WorkerCalibrationError; }
  check("3. rejects malformed calibration with WorkerCalibrationError", threw);
  check("3b. null calibration → null (uncalibrated run, not an error)", parseWorkerCalibration(null) === null);

  // 4. Worker uses the EXACT confirmed coordinates (full precision, no rounding).
  check("4. exact confirmed coordinates preserved",
    cm.startGate.c1.x === 0.201234567890123 && cm.finishGate.c2.x === 0.721234567890123);

  // 5. Worker result provenance includes the exact revision + source used.
  const prov = workerResultProvenance(cm);
  check("5. result provenance records revision 5 + manual_confirmed + schema",
    prov.calibrationRevision === 5 && prov.calibrationSource === "manual_confirmed" &&
    prov.authoritySchemaVersion === "ava-calibration-authority-v1" &&
    prov.cameraType === "panning" && prov.referenceFrameIndex === 12 &&
    prov.cameraTrackingSummary?.methodVersion === "ava-background-world-lock-v1");

  // 6. Manual-confirmed is authoritative over auto detection.
  check("6. manual-confirmed flagged authoritative (auto cannot replace it)", cm.manualAuthoritative === true);
  check("6b. auto is NOT flagged authoritative", parseWorkerCalibration(auto).manualAuthoritative === false);

  // 7. Legacy input without revision remains backward compatible.
  const cl = parseWorkerCalibration(legacy);
  check("7. legacy (no authority fields) parses; revision defaults to 0, source auto",
    cl !== null && cl.revision === 0 && cl.source === "auto" && cl.cameraType === "stationary");

  // 8. A result generated from revision N is classified against revision N correctly.
  check("8. result@rev5 vs current rev5 → current; vs rev6 → superseded",
    classifyResultStatus({ hasResult: true, resultCalibrationRevision: prov.calibrationRevision, currentCalibrationRevision: 5 }) === "current" &&
    classifyResultStatus({ hasResult: true, resultCalibrationRevision: prov.calibrationRevision, currentCalibrationRevision: 6 }) === "superseded");

  // Structured log line carries NO secrets (only authority + geometry summary).
  const line = workerCalibrationLogLine(cm);
  check("log line is secrets-free (no url/token/key fields)",
    !Object.keys(line).some((k) => /url|token|key|secret|path/i.test(k)) &&
    line.calibrationRevision === 5 && line.calibrationSource === "manual_confirmed");

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
