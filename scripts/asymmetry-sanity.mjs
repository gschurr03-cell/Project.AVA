// Runtime sanity for Day 75 — left/right balance analysis (asymmetry.ts).
//
//   node scripts/asymmetry-sanity.mjs
//
// Compiles src/lib/intelligence/asymmetry.ts and asserts:
//   • balanced sides → no insight (within ASYMMETRY_MIN_PCT);
//   • a shorter side → a step-length insight naming the weaker side, marked reliable;
//   • a frequency gap → an insight whose reliability follows timingReliable (≤60 fps
//     is "directional", ≥120 fps is trustworthy) — honest coaching, never a hard call;
//   • insights are ordered most-pronounced first; fixes are side-aware.

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".asym-sanity-tmp");
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
      compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] } },
      files: [path.join(root, "src/lib/intelligence/asymmetry.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { analyzeAsymmetry, ASYMMETRY_MIN_PCT } = require(path.join(out, "lib/intelligence/asymmetry.js"));

  // Balanced → nothing.
  const balanced = { leftStepLengthM: 2.15, rightStepLengthM: 2.16, leftStepFrequencyHz: 4.85, rightStepFrequencyHz: 4.84 };
  check("balanced sides → no insight", analyzeAsymmetry(balanced).length === 0);
  check("threshold is ~4%", ASYMMETRY_MIN_PCT >= 3 && ASYMMETRY_MIN_PCT <= 6);

  // Right step shorter → step-length insight, right weaker, reliable.
  const shortRight = { leftStepLengthM: 2.22, rightStepLengthM: 2.07, leftStepFrequencyHz: 4.85, rightStepFrequencyHz: 4.83 };
  const r = analyzeAsymmetry(shortRight);
  const sl = r.find((x) => x.key === "stepLength");
  check("shorter right step → step-length insight, weaker side = right", sl && sl.weakerSide === "right");
  check("step-length insight is reliable (spatial)", sl && sl.reliable === true);
  check("step-length diff ≈ 6.8%", sl && Math.abs(sl.differencePct - 6.8) < 0.3);
  check("fixes are side-aware (mention 'right')", sl && sl.fixes.every((f) => /right/i.test(f)));

  // Frequency gap at ≤60 fps → directional (not reliable) with an honest caveat.
  const freqGap = { leftStepFrequencyHz: 5.14, rightStepFrequencyHz: 4.46, leftStepLengthM: 2.15, rightStepLengthM: 2.16 };
  const low = analyzeAsymmetry(freqGap, { timingReliable: false }).find((x) => x.key === "stepFrequency");
  check("freq gap → frequency insight, weaker = right", low && low.weakerSide === "right");
  check("frequency at 60 fps is NOT reliable (directional)", low && low.reliable === false);
  check("60 fps caveat mentions 120–240 fps", low && /120.?240 fps/.test(low.confidenceNote));
  const high = analyzeAsymmetry(freqGap, { timingReliable: true }).find((x) => x.key === "stepFrequency");
  check("frequency at ≥120 fps IS reliable", high && high.reliable === true);

  // Both asymmetric → ordered most-pronounced first.
  const both = { leftStepLengthM: 2.30, rightStepLengthM: 2.10, leftStepFrequencyHz: 5.14, rightStepFrequencyHz: 4.90 };
  const ordered = analyzeAsymmetry(both);
  check("multiple insights ordered by difference desc", ordered.length === 2 && ordered[0].differencePct >= ordered[1].differencePct);

  // Missing data → nothing.
  check("missing per-side data → no insight", analyzeAsymmetry({ leftStepLengthM: null, rightStepLengthM: null }).length === 0);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
