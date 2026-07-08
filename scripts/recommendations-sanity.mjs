// Runtime sanity for Coaching Recommendations V2 (intelligence/recommendations.ts).
//
//   node scripts/recommendations-sanity.mjs
//
// Asserts the engine turns trusted 20 m fly metrics into grounded coaching guidance:
//   1. Low stride length → a stride-length recommendation.
//   2. Low frequency → a frequency recommendation.
//   3. Low velocity → a speed recommendation.
//   4. Bad calibration prioritises the recording-quality recommendation.
//   5. 60 fps contact-time issues never become trusted recommendations.
//   6. Missing data produces no fabricated recommendation (and no fake 0s).
//   7. Trochanter ratio evidence appears only when trochanter height exists.
//   8. Recommendations sort by displayPriority (severity, most severe first).
// (9. Existing fly benchmark math unchanged → npm run benchmark:sanity.)

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".recommendations-sanity-tmp");
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
      files: [path.join(root, "src/lib/intelligence/recommendations.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { buildRecommendations } = require(path.join(out, "lib/intelligence/recommendations.js"));

  // Baselines: elite trusted metrics + a clean recording → no training limiter fires.
  const elite = {
    topSpeedMps: 11.8, avgVelocityMps: 11.2, avgStrideLengthM: 2.5, strideLengthM: 2.6,
    strideRetentionPct: 96, frequencyHz: 5.0, stepLengthConfidence: "high",
    peakStrideLengthM: 2.6, zoneDistanceM: 20, zoneTimeS: 1.8,
  };
  const goodQuality = { calibrationPresent: true, trackingCoverage: 0.95, poseConfidence: 0.85, score: 92 };
  const balanced = { velocitySpreadPct: 5, leftStepLengthM: 2.5, rightStepLengthM: 2.5, leftStepFrequencyHz: 2.5, rightStepFrequencyHz: 2.5, diagnostics: { trackingCoverage: 0.95 } };

  const build = (over = {}) =>
    buildRecommendations({
      trusted: over.trusted !== undefined ? over.trusted : elite,
      measurements: over.measurements !== undefined ? over.measurements : balanced,
      activeFps: over.activeFps !== undefined ? over.activeFps : 60,
      trochanterHeightM: over.trochanterHeightM,
      quality: over.quality !== undefined ? over.quality : goodQuality,
    });
  const cat = (rep, c) => rep.recommendations.find((r) => r.category === c);
  const noZeroValues = (rep) =>
    [...rep.recommendations, ...rep.experimental].every((r) =>
      r.metricEvidence.every((e) => e.value !== "0" && !/^0(\.0+)?\s/.test(e.value)),
    );

  // ---- 1. Low stride length → stride-length recommendation ----
  const r1 = build({ trusted: { ...elite, strideLengthM: 2.12, avgStrideLengthM: 2.1, peakStrideLengthM: 2.12 } });
  const stride = cat(r1, "stride_length");
  check("low stride length → a stride_length recommendation", !!stride);
  check("stride recommendation is trusted at 60fps with good recording", stride?.trusted === true);
  check("stride recommendation cites the measured stride value (2.12 m)", stride?.metricEvidence.some((e) => /2\.12 m/.test(e.value)));
  check("low stride (13% below elite) → high severity", stride?.severity === "high");

  // ---- 2. Low frequency → frequency recommendation ----
  const r2 = build({ trusted: { ...elite, frequencyHz: 4.2 } });
  check("low frequency → a frequency recommendation", !!cat(r2, "frequency"));
  check("frequency recommendation is trusted", cat(r2, "frequency")?.trusted === true);
  check("frequency recommendation is not the 'just move legs faster' cliché", /rhythm|ground return/i.test(cat(r2, "frequency")?.whyItMatters ?? ""));

  // ---- 3. Low velocity → speed recommendation ----
  const r3 = build({ trusted: { ...elite, topSpeedMps: 10.5, avgVelocityMps: 10.0 } });
  check("low velocity → a speed recommendation", !!cat(r3, "speed"));
  check("speed recommendation uses supported peak + average velocity evidence", cat(r3, "speed")?.metricEvidence.length >= 1 && cat(r3, "speed").metricEvidence.some((e) => /velocity/i.test(e.label)));

  // ---- 4. Bad calibration prioritises recording-quality recommendation ----
  const r4 = build({
    trusted: { ...elite, strideLengthM: 2.12, avgStrideLengthM: 2.1, peakStrideLengthM: 2.12 },
    quality: { calibrationPresent: false, trackingCoverage: 0.9, poseConfidence: 0.8, score: 45 },
  });
  check("bad calibration → first recommendation is calibration", r4.recommendations[0]?.category === "calibration");
  check("calibration recommendation has displayPriority 0", r4.recommendations[0]?.displayPriority === 0);
  check("under bad calibration, training advice is de-trusted", cat(r4, "stride_length")?.trusted === false);

  // ---- 5. 60fps contact-time issues never become trusted recommendations ----
  const r5 = build();
  check("60fps → an experimental (coming soon) timing item exists", r5.experimental.length === 1 && r5.experimental[0].category === "experimental");
  check("experimental timing item is NOT trusted", r5.experimental[0].trusted === false);
  check("no trusted recommendation is in the experimental category", r5.recommendations.every((r) => r.category !== "experimental"));
  check("no trusted recommendation coaches from ground contact / flight / stiffness", r5.recommendations.every((r) => !/ground contact|flight time|stiffness/i.test(r.whyItMatters + r.coachingCue)));
  check("experimental item shows 'Needs 120fps+', never a fake number", /Needs 120fps\+/.test(r5.experimental[0].metricEvidence[0].value));
  // At 120fps+ the experimental timing bin is empty.
  const r5b = build({ activeFps: 120 });
  check("120fps → no experimental coming-soon timing bin", r5b.experimental.length === 0);

  // ---- 6. Missing data produces no fabricated recommendation ----
  const rNull = build({ trusted: null, measurements: null, quality: null });
  check("no trusted metrics → available false, empty lists (no fabrication)", rNull.available === false && rNull.recommendations.length === 0 && rNull.experimental.length === 0);
  const rNoFreq = build({ trusted: { ...elite, frequencyHz: null } });
  check("null frequency → no frequency recommendation", !cat(rNoFreq, "frequency"));
  const rZeroFreq = build({ trusted: { ...elite, frequencyHz: 0 } });
  check("frequency 0 (not measured) → no frequency recommendation, no fake 0", !cat(rZeroFreq, "frequency") && noZeroValues(rZeroFreq));
  check("all recommendations across cases render real values, never a fake 0", [r1, r2, r3, r4].every(noZeroValues));

  // ---- 7. Trochanter ratio appears only when trochanter height exists ----
  const lowStride = { ...elite, strideLengthM: 2.12, avgStrideLengthM: 2.1, peakStrideLengthM: 2.12 };
  const rNoTro = build({ trusted: lowStride });
  const rTro = build({ trusted: lowStride, trochanterHeightM: 0.95 });
  check("no trochanter height → stride evidence has no trochanter ratio", !cat(rNoTro, "stride_length").metricEvidence.some((e) => /trochanter/i.test(e.label)));
  check("trochanter height present → stride evidence includes a trochanter ratio", cat(rTro, "stride_length").metricEvidence.some((e) => /trochanter/i.test(e.label)));

  // ---- 8. Recommendations sort by displayPriority / severity ----
  const rSort = build({
    trusted: { ...elite, strideLengthM: 2.05, avgStrideLengthM: 2.05, peakStrideLengthM: 2.05, frequencyHz: 4.55, topSpeedMps: 11.3, avgVelocityMps: 10.8 },
  });
  const sevRank = { high: 3, moderate: 2, low: 1 };
  const monotonicPriority = rSort.recommendations.every((r, i) => i === 0 || r.displayPriority > rSort.recommendations[i - 1].displayPriority);
  const nonIncreasingSeverity = rSort.recommendations.every((r, i) => i === 0 || sevRank[r.severity] <= sevRank[rSort.recommendations[i - 1].severity]);
  check("multiple limiters present to sort", rSort.recommendations.length >= 2);
  check("recommendations have strictly increasing displayPriority", monotonicPriority);
  check("recommendations ordered most-severe first", nonIncreasingSeverity);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
