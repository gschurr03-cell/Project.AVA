// Analysis experimental/validation CONTRACT sanity.
//
// Verifies that every analyses-row the app builds satisfies the database constraint
// `analyses_experimental_contract_valid` (migration 0023) BEFORE insert, via the single
// source of truth src/lib/analysis/analysisContract.ts. Covers a new analysis, a rerun,
// and an experimental analysis — and reproduces the rerun regression as a fails-before/
// passes-after pair: the old rerun reset (which left a stale experimental
// compatibility_group) VIOLATES the constraint; the fixed reset (full validated contract)
// SATISFIES it.
//
//   node scripts/analysis-contract-sanity.mjs

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, ".analysis-contract-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

let ok = true;
const check = (label, fn) => {
  try { fn(); console.log(`PASS  ${label}`); }
  catch (err) { ok = false; console.log(`FAIL  ${label}\n      ${err.message}`); }
};

writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
  compilerOptions: {
    outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022",
    moduleResolution: "node", esModuleInterop: true, skipLibCheck: true, strict: true,
  },
  files: [path.join(root, "src/lib/analysis/analysisContract.ts")],
}));

try {
  execFileSync(path.join(root, "node_modules/.bin/tsc"), ["-p", path.join(out, "tsconfig.json")], { stdio: "pipe" });
  const require = createRequire(import.meta.url);
  const contract = require(path.join(out, "lib/analysis/analysisContract.js"));
  const {
    validatedAnalysisContract, experimentalAnalysisContract,
    analysisContractSatisfiesConstraint, assertAnalysisContract,
    VALIDATED_COMPATIBILITY_GROUP,
  } = contract;

  // An INDEPENDENT re-statement of the SQL CHECK, so the test does not merely echo the
  // module under test. Mirrors analyses_experimental_contract_valid verbatim.
  const dbConstraint = (f) =>
    (f.experimental === false && f.experiment_version == null && f.compatibility_group === "validated-60-v1")
    || (f.experimental === true && f.experiment_version != null && f.validation_status === "experimental" && f.compatibility_group !== "validated-60-v1");

  // ---- New analysis --------------------------------------------------------------
  check("new analysis: validated contract satisfies the DB constraint", () => {
    const c = validatedAnalysisContract();
    assert.deepEqual(c, { experimental: false, experiment_version: null, validation_status: "validated", compatibility_group: "validated-60-v1" });
    assert.equal(dbConstraint(c), true);
    assert.equal(analysisContractSatisfiesConstraint(c), true);
    assertAnalysisContract(c); // does not throw
  });

  // ---- Experimental analysis -----------------------------------------------------
  check("experimental analysis: experimental-30 contract satisfies the DB constraint", () => {
    const c = experimentalAnalysisContract("ava-sprint-30-experimental-v1", "experimental-30-v1");
    assert.deepEqual(c, { experimental: true, experiment_version: "ava-sprint-30-experimental-v1", validation_status: "experimental", compatibility_group: "experimental-30-v1" });
    assert.equal(dbConstraint(c), true);
    assert.equal(analysisContractSatisfiesConstraint(c), true);
  });

  // ---- Rerun: the exact regression, fails-before / passes-after ------------------
  // A rerun starts from the CURRENT working row, which may have been completed as an
  // experimental-30 analysis. The OLD rerun reset only cleared experimental/
  // experiment_version/validation_status; it left compatibility_group untouched.
  const priorExperimentalRow = experimentalAnalysisContract("ava-sprint-30-experimental-v1", "experimental-30-v1");
  check("rerun (OLD reset): leaving compatibility_group stale VIOLATES the constraint (the bug)", () => {
    const buggyRerun = {
      ...priorExperimentalRow,
      experimental: false, experiment_version: null, validation_status: "validated",
      // compatibility_group intentionally NOT reset — still 'experimental-30-v1'
    };
    assert.equal(dbConstraint(buggyRerun), false, "old rerun row must be rejected by the DB");
    assert.equal(analysisContractSatisfiesConstraint(buggyRerun), false);
    assert.throws(() => assertAnalysisContract(buggyRerun), /analyses_experimental_contract_valid violated/);
  });
  check("rerun (FIXED reset): full validated contract SATISFIES the constraint", () => {
    const fixedRerun = { ...priorExperimentalRow, ...validatedAnalysisContract() };
    assert.equal(fixedRerun.compatibility_group, "validated-60-v1", "rerun must reset compatibility_group");
    assert.equal(dbConstraint(fixedRerun), true);
    assert.equal(analysisContractSatisfiesConstraint(fixedRerun), true);
    assertAnalysisContract(fixedRerun);
  });
  check("rerun of an already-validated working row stays valid", () => {
    const rerun = { ...validatedAnalysisContract(), ...validatedAnalysisContract() };
    assert.equal(dbConstraint(rerun), true);
  });

  // ---- Guardrails: the helper refuses impossible experimental contracts ----------
  check("experimentalAnalysisContract rejects an empty experiment_version", () => {
    assert.throws(() => experimentalAnalysisContract("", "experimental-30-v1"), /experiment_version must be non-empty/);
  });
  check("experimentalAnalysisContract rejects the validated compatibility group", () => {
    assert.throws(() => experimentalAnalysisContract("ava-sprint-30-experimental-v1", VALIDATED_COMPATIBILITY_GROUP), /must differ from/);
  });

  // ---- The module mirror agrees with the independent DB predicate on every combo --
  check("contract mirror equals the DB predicate across representative combinations", () => {
    const combos = [
      { experimental: false, experiment_version: null, validation_status: "validated", compatibility_group: "validated-60-v1" },
      { experimental: false, experiment_version: null, validation_status: "validated", compatibility_group: "experimental-30-v1" }, // the bug
      { experimental: false, experiment_version: "x", validation_status: "validated", compatibility_group: "validated-60-v1" },
      { experimental: true, experiment_version: "v", validation_status: "experimental", compatibility_group: "experimental-30-v1" },
      { experimental: true, experiment_version: null, validation_status: "experimental", compatibility_group: "experimental-30-v1" },
      { experimental: true, experiment_version: "v", validation_status: "validated", compatibility_group: "experimental-30-v1" },
      { experimental: true, experiment_version: "v", validation_status: "experimental", compatibility_group: "validated-60-v1" },
    ];
    for (const c of combos) {
      assert.equal(analysisContractSatisfiesConstraint(c), dbConstraint(c), `mismatch for ${JSON.stringify(c)}`);
    }
  });

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
