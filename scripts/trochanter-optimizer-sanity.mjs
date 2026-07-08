// Runtime sanity for Day 80 — trochanter step-length optimizer
// (intelligence/trochanterOptimizer.ts).
//
//   node scripts/trochanter-optimizer-sanity.mjs
//
// Asserts the ratio math, band thresholds, next-target milestones, the review flag,
// and graceful handling of missing leg length.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".trochanter-sanity-tmp");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return originalResolve.call(this, request.startsWith("@/") ? path.join(out, request.slice(2)) : request, ...rest);
};

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};
const near = (a, b, eps = 0.01) => a != null && b != null && Math.abs(a - b) <= eps;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] } },
      files: [path.join(root, "src/lib/intelligence/trochanterOptimizer.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { evaluateTrochanterStepLength, getNextTrochanterTarget } = require(
    path.join(out, "lib/intelligence/trochanterOptimizer.js"),
  );

  // Official formula: stride length metres ÷ trochanter height metres.
  const exact244 = evaluateTrochanterStepLength({ stepLengthM: 2.39, trochanterHeightM: 0.98 });
  const exact222 = evaluateTrochanterStepLength({ stepLengthM: 2.18, trochanterHeightM: 0.98 });
  check("2.39m stride / 0.98m trochanter = 2.44x", near(exact244?.ratio, 2.44, 0.005));
  check("2.18m stride / 0.98m trochanter = 2.22x", near(exact222?.ratio, 2.22, 0.005));
  check("missing trochanter height returns unavailable", evaluateTrochanterStepLength({ stepLengthM: 2.39, trochanterHeightM: null }) === null);

  const e = evaluateTrochanterStepLength({ stepLengthM: 2.16, trochanterHeightM: 0.99 });
  check("trochanter height is consumed directly in metres", near(e.trochanterLengthM, 0.99));
  check("ratio ≈ 2.18×", near(e.ratio, 2.16 / 0.99, 0.005));
  check("band = elite-minimum (2.18× < 2.20×)", e.band === "elite-minimum" && e.label === "Elite minimum");
  check("next target = 2.30× (skips Solid)", near(e.nextTargetRatio, 2.3));
  check("next target step ≈ 2.28 m (2.30 × 0.99)", near(e.nextTargetStepLengthM, 2.3 * 0.99));
  check("olympic range ≈ 2.48–2.67 m", near(e.olympicRangeStepLengthM.min, 2.5 * 0.99) && near(e.olympicRangeStepLengthM.max, 2.7 * 0.99));
  check("not flagged for review", e.reviewFlag === false);

  // 2.30× → Rising star.
  const rs = evaluateTrochanterStepLength({ stepLengthM: 2.3, trochanterHeightM: 1.00 });
  check("2.30× → Rising star", rs.band === "rising-star" && rs.label === "Rising star");
  check("2.30× next target = 2.50×", near(rs.nextTargetRatio, 2.5));

  // 2.50× → Olympic caliber.
  const oly = evaluateTrochanterStepLength({ stepLengthM: 2.5, trochanterHeightM: 1.00 });
  check("2.50× → Olympic caliber", oly.band === "olympic" && oly.label === "Olympic caliber");
  check("2.50× next target = 2.70×", near(oly.nextTargetRatio, 2.7));

  // Boundary: below elite minimum (1.9×) → targets elite minimum 2.00×.
  const low = evaluateTrochanterStepLength({ stepLengthM: 1.9, trochanterHeightM: 1.00 });
  check("1.90× → Below elite minimum", low.band === "below-elite");
  check("below-elite next target = 2.00×", near(low.nextTargetRatio, 2.0));

  // > 2.70× → review flag true, no higher target.
  const hi = evaluateTrochanterStepLength({ stepLengthM: 2.8, trochanterHeightM: 1.00 });
  check("2.80× → review band + reviewFlag true", hi.band === "review" && hi.reviewFlag === true);
  check("review → no higher next target", hi.nextTargetRatio === null && hi.nextTargetStepLengthM === null);

  // getNextTrochanterTarget standalone.
  check("getNextTrochanterTarget(2.18) = 2.30 (Rising star)", getNextTrochanterTarget({ currentRatio: 2.18 }).nextTargetRatio === 2.3 && getNextTrochanterTarget({ currentRatio: 2.18 }).label === "Rising star");

  // Missing / invalid trochanter height → null (unavailable), never a bogus ratio.
  check("zero trochanter height → null", evaluateTrochanterStepLength({ stepLengthM: 2.16, trochanterHeightM: 0 }) === null);
  check("missing stride length → null", evaluateTrochanterStepLength({ stepLengthM: null, trochanterHeightM: 0.99 }) === null);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
