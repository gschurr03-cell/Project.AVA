// Regression sanity for the calibration LIFECYCLE (Part 1 completion): stale-result
// rejection, result-status classification, recompute idempotency, Reset-to-Auto
// transition, provenance, and legacy safety.
//
//   node scripts/calibration-lifecycle-sanity.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".calibration-lifecycle-tmp");
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
        path.join(root, "src/lib/calibration/lifecycle.ts"),
        path.join(root, "src/lib/calibration/authority.ts"),
        path.join(root, "src/lib/calibration/gates.ts"),
      ],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const lc = require(path.join(out, "lib/calibration/lifecycle.js"));
  const auth = require(path.join(out, "lib/calibration/authority.js"));
  const {
    classifyResultStatus, acceptResultForCurrentRevision, shouldEnqueueRecompute,
    resetToAutoAuthority, calibrationRevisionOf, buildResultProvenance,
    CALIBRATION_DEPENDENT_OUTPUTS, isCalibrationDependent,
  } = lc;
  const { calibrationAuthority } = auth;

  const bar = (x) => ({ c1: { x, y: 0.4 }, c2: { x: x + 0.02, y: 0.6 }, timeS: 1 });
  const gates = (over = {}) => ({ startGate: bar(0.2), finishGate: bar(0.7), distanceM: 20, ...over });
  const manualFields = auth.manualConfirmedAuthorityFields(5, new Date("2026-07-21T00:00:00.000Z"));
  const manual = gates({ ...manualFields, revision: 5 });

  // §4. Stale-result rejection: run@rev4 completes after confirm@rev5.
  check("20/§4. rev-4 result is SUPERSEDED against current rev-5 (never current)",
    classifyResultStatus({ hasResult: true, resultCalibrationRevision: 4, currentCalibrationRevision: 5 }) === "superseded");
  check("§4. a rev-4 result is not accepted as current for rev-5",
    acceptResultForCurrentRevision(4, 5) === false);
  check("21/§10. matching rev-5 result IS current + accepted",
    classifyResultStatus({ hasResult: true, resultCalibrationRevision: 5, currentCalibrationRevision: 5 }) === "current" &&
    acceptResultForCurrentRevision(5, 5) === true);
  check("§9. no result yet → pending",
    classifyResultStatus({ hasResult: false, resultCalibrationRevision: null, currentCalibrationRevision: 5 }) === "pending");
  check("§10. recompute in flight → pending",
    classifyResultStatus({ hasResult: true, resultCalibrationRevision: 4, currentCalibrationRevision: 5, recomputePending: true }) === "pending");

  // §12. Legacy result (no revision link) is not falsely current after a confirmation.
  check("23/§12. legacy result (rev null) vs confirmed rev-5 → superseded",
    classifyResultStatus({ hasResult: true, resultCalibrationRevision: null, currentCalibrationRevision: 5 }) === "superseded");
  check("§12. legacy result (rev null) vs un-revised (0) → current (nothing changed)",
    classifyResultStatus({ hasResult: true, resultCalibrationRevision: null, currentCalibrationRevision: 0 }) === "current");

  // §10. Recompute enqueue is idempotent.
  check("15/§10. enqueue when no job/result covers current revision",
    shouldEnqueueRecompute({ currentCalibrationRevision: 5, runningJobRevision: null, latestResultRevision: 4 }) === true);
  check("15b/§10. do NOT enqueue when a job for current revision is already running",
    shouldEnqueueRecompute({ currentCalibrationRevision: 5, runningJobRevision: 5, latestResultRevision: null }) === false);
  check("16/§10. do NOT enqueue when a current-revision result already exists (idempotent)",
    shouldEnqueueRecompute({ currentCalibrationRevision: 5, runningJobRevision: null, latestResultRevision: 5 }) === false);

  // §6. Reset-to-Auto transition: supersede manual, bump revision, keep provenance.
  const reset = resetToAutoAuthority(manual, new Date("2026-07-21T01:00:00.000Z"));
  check("12/§6. reset increments the revision (5 → 6)", reset.revision === 6);
  check("§6. reset flips authority to auto", calibrationAuthority(reset).source === "auto");
  check("§6/§11. reset records superseded manual provenance (from rev 5, manual_confirmed)",
    reset.supersededFromRevision === 5 && reset.supersededFromSource === "manual_confirmed");
  check("§6. reset clears the manual confirmation timestamp", reset.confirmedAt === undefined);
  check("§6. reset does not delete gate coordinates", reset.startGate.c1.x === manual.startGate.c1.x);

  // §11. Provenance is derivable for the current result.
  const prov = buildResultProvenance(manual, 5, { hasResult: true });
  check("§11. provenance carries revision + source + status current",
    prov.calibrationRevision === 5 && prov.calibrationSource === "manual_confirmed" && prov.status === "current");
  const provStale = buildResultProvenance(manual, 4, { hasResult: true });
  check("§11. provenance marks an older-revision result superseded", provStale.status === "superseded");

  // §9. The dependency boundary is explicit and covers the required outputs.
  check("§9. dependency boundary includes velocity + stride + recommendations + provenance",
    ["averageVelocity","strideLength","strideFrequency","coachingRecommendations","provenance","generatedAt"]
      .every((f) => isCalibrationDependent(f)) &&
    isCalibrationDependent("athleteName") === false &&
    CALIBRATION_DEPENDENT_OUTPUTS.length >= 15);

  // calibrationRevisionOf reads authority revision (or legacy version).
  check("calibrationRevisionOf: manual → 5; legacy version → that version; null → 0",
    calibrationRevisionOf(manual) === 5 &&
    calibrationRevisionOf(gates({ version: 3 })) === 3 &&
    calibrationRevisionOf(null) === 0);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
