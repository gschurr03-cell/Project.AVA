// Runtime sanity for benchmark validation.
//
//   node scripts/validation-sanity.mjs
//
// Loads the benchmark dataset, compares synthetic AVA metrics against Video A,
// and (if the real analysis artifact exists) runs analyzeSprint on it and
// compares against Video A too — printing a clear comparison table.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".validation-sanity-tmp");
const artifact = path.join(root, "artifacts/pose-sequences/test.pose.json");

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

function printTable(result) {
  console.log(`\nBenchmark ${result.benchmarkId} — ${result.benchmarkName}`);
  console.log(`  ${"Metric".padEnd(20)}${"Benchmark".padEnd(12)}${"AVA".padEnd(11)}${"AbsErr".padEnd(10)}${"%Err".padEnd(8)}Status`);
  for (const c of result.comparisons) {
    const ava = c.avaValue == null ? "—" : String(c.avaValue);
    const abs = c.absError == null ? "—" : String(c.absError);
    const pct = c.percentError == null ? "—" : `${c.percentError}%`;
    console.log(`  ${c.label.padEnd(20)}${`${c.benchmarkValue} ${c.unit}`.padEnd(12)}${ava.padEnd(11)}${abs.padEnd(10)}${pct.padEnd(8)}${c.status}`);
  }
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  execFileSync(
    "npx",
    ["tsc", "src/lib/biomechanics/validation/index.ts", "src/lib/biomechanics/analysis/index.ts", "--outDir", out, "--module", "commonjs", "--target", "es2022", "--skipLibCheck", "--esModuleInterop", "--strict"],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );
  const { BENCHMARK_VIDEOS, getBenchmark, compareMetrics } = require(path.join(out, "validation/index.js"));
  const { analyzeSprint } = require(path.join(out, "analysis/index.js"));

  // (1) Dataset loads with Videos A/B/C.
  check(`dataset has 3 benchmarks (${BENCHMARK_VIDEOS.map((v) => v.id).join("/")})`,
    BENCHMARK_VIDEOS.length === 3 && ["A", "B", "C"].every((id) => getBenchmark(id)));

  const videoA = getBenchmark("A");

  // (2) Synthetic AVA metrics closely matching Video A → mostly "ok".
  const synthAva = { stepFrequencyHz: 4.86, avgGroundContactMs: 80, avgFlightTimeMs: 125, speedMps: 0, stepLengthM: 0 };
  const synthResult = compareMetrics(synthAva, videoA);
  const byLabel = (r, label) => r.comparisons.find((c) => c.label === label);
  check(`synthetic vs A: step freq OK, GC OK, flight OK`,
    byLabel(synthResult, "Avg step frequency").status === "ok" &&
      byLabel(synthResult, "Ground contact").status === "ok" &&
      byLabel(synthResult, "Flight time").status === "ok");
  check(`uncalibrated speed/length reported as "missing" (not huge error)`,
    byLabel(synthResult, "Avg speed").status === "missing" &&
      byLabel(synthResult, "Peak speed").status === "missing" &&
      byLabel(synthResult, "Avg step length").status === "missing");
  printTable(synthResult);

  // (3) Off values classify as "off".
  const offResult = compareMetrics({ stepFrequencyHz: 3.0 }, videoA); // 3.0 vs 4.86 ≈ 38%
  check(`step freq 3.0 vs 4.86 → "off"`, byLabel(offResult, "Avg step frequency").status === "off");

  // (4) Real artifact vs Video A (optional).
  if (existsSync(artifact)) {
    const seq = JSON.parse(readFileSync(artifact, "utf8"));
    const m = analyzeSprint(seq).metrics;
    const realAva = {
      stepFrequencyHz: m.stepFrequencyHz,
      strideFrequencyHz: m.strideFrequencyHz,
      avgGroundContactMs: m.avgGroundContactMs,
      avgFlightTimeMs: m.avgFlightTimeMs,
      speedMps: 0, // uncalibrated
      stepLengthM: 0, // uncalibrated
    };
    const realResult = compareMetrics(realAva, videoA);
    check(`real artifact comparison produced typed result`, realResult.source === "benchmark_comparison");
    printTable(realResult);
  } else {
    console.log("\nreal artifact: (not present — skipping comparison)");
  }

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
