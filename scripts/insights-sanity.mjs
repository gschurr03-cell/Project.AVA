// Runtime sanity for Day 76 — coaching insights engine (coaching/insights.ts).
//
//   node scripts/insights-sanity.mjs
//
// Compiles src/lib/coaching/insights.ts and asserts:
//   • every insight carries the full chain (observation→explanation→consequence→
//     corrective→drills→priority→confidence);
//   • a low combined cadence → a HIGH-priority "Step frequency (combined)" insight;
//   • an L/R frequency gap at ≤60 fps → a DIRECTIONAL (low-confidence) balance insight;
//   • a small velocity spread → a "sustained top-end" (low priority) note;
//   • step-length module fires only when leg length is known;
//   • insights are ordered high→low priority; nothing generic (all cite measured values).

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".insights-sanity-tmp");
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
      files: [path.join(root, "src/lib/coaching/insights.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { buildCoachingInsights } = require(path.join(out, "lib/coaching/insights.js"));

  // Full chain present on every insight.
  const base = {
    combinedStepFrequencyHz: 4.0, // low → cadence insight
    leftStepFrequencyHz: 5.14,
    rightStepFrequencyHz: 4.46, // asymmetric → balance insight
    leftStepLengthM: 2.16,
    rightStepLengthM: 2.15,
    maxVelocityMps: 10.9,
    zoneVelocityMps: 10.4, // ~4.8% spread → sustained
    avgIndividualStepLengthM: 2.16,
    avgZoneStepLengthM: 2.22,
  };
  const all = buildCoachingInsights({ measurements: base, timingReliable: false });
  const fields = ["id", "metric", "observation", "explanation", "consequence", "correctiveFocus", "drills", "priority", "confidence", "confidenceNote"];
  check("every insight has the full observation→priority chain", all.length > 0 && all.every((x) => fields.every((f) => x[f] != null) && x.drills.length > 0 && x.observation.length > 10));

  const byId = (id) => all.find((x) => x.id === id);
  check("low cadence → HIGH-priority combined-frequency insight", byId("cadence-low")?.priority === "high" && /frequency/i.test(byId("cadence-low").metric));
  check("cadence observation cites the measured value (4.0)", /4\.0/.test(byId("cadence-low")?.observation ?? ""));

  const freqBal = byId("balance-stepFrequency");
  check("L/R frequency gap → balance insight, weaker side coached", freqBal && /right/i.test(freqBal.correctiveFocus));
  check("frequency balance at ≤60 fps is directional (low confidence)", freqBal?.confidence === "low" && /120.?240 fps/.test(freqBal.confidenceNote));

  check("velocity spread ~5% → sustained top-end (low priority)", byId("velocity-sustained")?.priority === "low");

  // Priority ordering high→low.
  const rank = { high: 0, medium: 1, low: 2 };
  check("insights ordered high→low priority", all.every((x, i) => i === 0 || rank[all[i - 1].priority] <= rank[x.priority]));

  // Step-length module needs leg length.
  check("no step-length insight without leg length", !all.some((x) => x.id === "step-length-short"));
  const shortStep = buildCoachingInsights({ measurements: { ...base, avgIndividualStepLengthM: 1.9 }, legLengthCm: 95 });
  check("short step vs leg length → step-length insight", shortStep.some((x) => x.id === "step-length-short"));

  // Balanced + healthy → no balance/cadence insight (only the velocity note).
  const healthy = { combinedStepFrequencyHz: 4.85, leftStepFrequencyHz: 4.9, rightStepFrequencyHz: 4.8, leftStepLengthM: 2.15, rightStepLengthM: 2.16, maxVelocityMps: 10.77, zoneVelocityMps: 10.41, avgIndividualStepLengthM: 2.16, avgZoneStepLengthM: 2.22 };
  const h = buildCoachingInsights({ measurements: healthy, timingReliable: false });
  check("healthy metrics → no cadence/balance limiter", !h.some((x) => x.id === "cadence-low" || x.id.startsWith("balance-")));

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
