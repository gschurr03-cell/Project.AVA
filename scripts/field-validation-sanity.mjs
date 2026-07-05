// Runtime sanity for Day 77 — field validation module (validation/fieldValidation.ts).
//
//   node scripts/field-validation-sanity.mjs
//
// Compiles the pure module and asserts the reporting math: velocity from gate time,
// contact-count error, apples-to-apples cadence (contacts ÷ gate time BOTH sides),
// per-step tape-grid errors, honest gaps when truth is missing, and that AVA's
// displayed combined frequency is surfaced as context (never scored).

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".fieldval-sanity-tmp");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return originalResolve.call(this, request.startsWith("@/") ? path.join(out, request.slice(2)) : request, ...rest);
};

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};
const near = (a, b, eps = 1e-6) => a != null && b != null && Math.abs(a - b) <= eps;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] } },
      files: [path.join(root, "src/lib/validation/fieldValidation.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { buildFieldValidation } = require(path.join(out, "lib/validation/fieldValidation.js"));

  const observed = {
    zoneTimeS: 1.92,
    zoneDistanceM: 20,
    zoneVelocityMps: 10.41,
    validContacts: 9,
    combinedStepFrequencyHz: 4.85,
    avgIndividualStepLengthM: 2.16,
    stepLengthsM: [2.22, 2.08, 2.23, 2.07, 2.16, 2.06, 2.19, 2.21, 2.25],
  };
  const truth = {
    label: "Test trial",
    zoneDistanceM: 20,
    gateTimeS: 1.93,
    gateSystem: "Freelap",
    manualStepCount: 9,
    manualStepLengthsM: [2.08, 2.09, 2.15, 2.10, 2.16, 2.11, 2.16, 2.25, 2.18],
  };
  const rep = buildFieldValidation(observed, truth);
  const rowOf = (m) => rep.rows.find((r) => r.metric.startsWith(m));

  check("zone-time error = ava − gate (−0.01 s)", near(rowOf("Zone time").errorAbs, 1.92 - 1.93, 1e-9));
  const vel = rowOf("Average velocity");
  check("gate velocity = distance ÷ gate time", near(vel.truth, 20 / 1.93, 1e-9) && near(vel.ava, 10.41));
  check("contact count exact match → 0 error", rowOf("In-zone contact").errorAbs === 0);

  const cad = rowOf("Cadence");
  check("cadence uses contacts ÷ gate time BOTH sides (equal → 0)", near(cad.ava, 9 / 1.93, 1e-9) && near(cad.truth, 9 / 1.93, 1e-9) && cad.errorAbs === 0);
  check("displayed combined frequency surfaced as context, not scored", rep.displayedFrequencyHz === 4.85 && !rep.rows.some((r) => r.metric.toLowerCase().includes("combined")));

  check("avg step length compared to tape-grid mean", near(rowOf("Average step length").truth, truth.manualStepLengthsM.reduce((a, b) => a + b, 0) / 9, 1e-9));
  check("per-step aligned by index (9 rows)", rep.steps.length === 9 && near(rep.steps[0].errorCm, (2.22 - 2.08) * 100, 1e-6));
  check("step summary mean/max |error| in cm", rep.summary.pairedSteps === 9 && rep.summary.maxAbsStepErrorCm >= rep.summary.meanAbsStepErrorCm);

  // Graceful degradation: only a gate time → velocity/time only, everything else a gap.
  const partial = buildFieldValidation(observed, { gateTimeS: 1.93 });
  check("partial truth → time+velocity rows only", partial.rows.length === 2 && partial.rows.some((r) => r.metric.startsWith("Zone time")));
  check("missing count + lengths reported as gaps", partial.gaps.some((g) => /step count/i.test(g)) && partial.gaps.some((g) => /tape-grid/i.test(g)));
  check("no ground truth at all → no rows, all gaps", buildFieldValidation(observed, {}).rows.length === 0);

  // Mismatched step counts are flagged, not silently dropped.
  const mism = buildFieldValidation(observed, { manualStepLengthsM: [2.08, 2.09, 2.15] });
  check("step-count mismatch flagged in gaps", mism.gaps.some((g) => /differs/i.test(g)) && mism.steps.length === 9);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
