// Deterministic unit tests for the Limiting Factors engine.
//   node scripts/limiting-factors-sanity.mjs
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".lf-tmp");
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
execFileSync("npx", ["tsc",
  "src/lib/limitingFactors/engine.ts","src/lib/limitingFactors/types.ts","src/lib/limitingFactors/thresholds.ts","src/lib/limitingFactors/scoring.ts","src/lib/limitingFactors/recommendations.ts",
  "--outDir", out, "--rootDir","src/lib/limitingFactors","--module","commonjs","--target","es2022","--skipLibCheck"], { cwd: root, stdio: ["ignore","ignore","inherit"] });
const { buildLimitingFactors } = require(path.join(out, "engine.js"));

let ok = true;
const chk = (l, c) => { console.log(`${c ? "PASS" : "FAIL"}  ${l}`); if (!c) ok = false; };
const input = (over = {}) => ({
  sessionId: "s", sessionDate: null, analysisType: "fly", zoneDistanceM: 20,
  calibrationConfirmed: true, spatialAvailable: true, measurementConfidence: "high",
  athlete: { heightCm: 180, legLengthCm: 98, trochanterHeightM: 0.98, weightKg: 80 },
  metrics: {
    avgStepLengthM: 2.1, peakStepLengthM: 2.2, stepFrequencyHz: 4.8, avgVelocityMps: 10.1, peakVelocityMps: 10.6, validStepCount: 9,
    leftStepLengthM: 2.1, rightStepLengthM: 2.1, leftStepSampleCount: 4, rightStepSampleCount: 4,
    leftStepFrequencyHz: 4.8, rightStepFrequencyHz: 4.8, ...(over.metrics || {}),
  },
  ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== "metrics")),
});
const byType = (r, t) => r.limiters.find((l) => l.type === t);

// (1) Step-length asymmetry — left longer.
let r = buildLimitingFactors(input({ metrics: { leftStepLengthM: 2.20, rightStepLengthM: 2.02, leftStepSampleCount: 4, rightStepSampleCount: 4 } }));
let sl = byType(r, "step_length_asymmetry");
chk("step-length asymmetry detected when left>right", !!sl && sl.status === "detected" && sl.deviation.direction === "left_higher");
chk("asymmetry % computed (~8.5%)", sl && Math.abs(sl.deviation.percentage - 8.5) < 0.6);
chk("title names the reduced (right) side", sl && /right-side/i.test(sl.title));

// (2) Right longer → direction flips.
r = buildLimitingFactors(input({ metrics: { leftStepLengthM: 2.0, rightStepLengthM: 2.2, leftStepSampleCount: 4, rightStepSampleCount: 4 } }));
chk("direction flips to right_higher", byType(r, "step_length_asymmetry")?.deviation.direction === "right_higher");

// (3) Balanced → not shown as a limiter card.
r = buildLimitingFactors(input({ metrics: { leftStepLengthM: 2.10, rightStepLengthM: 2.11, leftStepFrequencyHz: 4.8, rightStepFrequencyHz: 4.81 } }));
chk("balanced sides produce no ranked limiter", r.limiters.length === 0 && r.meaningfulCount === 0);

// (4) Insufficient side samples → insufficient (not a card).
r = buildLimitingFactors(input({ metrics: { leftStepLengthM: 2.3, rightStepLengthM: 2.0, leftStepSampleCount: 1, rightStepSampleCount: 4 } }));
chk("insufficient side samples → no step-length card", !byType(r, "step_length_asymmetry"));

// (5) Step-frequency asymmetry — left higher.
r = buildLimitingFactors(input({ metrics: { leftStepFrequencyHz: 5.2, rightStepFrequencyHz: 4.5, leftStepSampleCount: 4, rightStepSampleCount: 4 } }));
chk("frequency asymmetry detected (left higher)", byType(r, "step_frequency_asymmetry")?.deviation.direction === "left_higher");

// (6) Frequency source unavailable → no card, but architecture returns cleanly.
r = buildLimitingFactors(input({ metrics: { leftStepFrequencyHz: null, rightStepFrequencyHz: null } }));
chk("null side frequency → no frequency card, no crash", !byType(r, "step_frequency_asymmetry") && r.status === "ok");

// (7) Ranking — higher-impact (length 12%) ranks above lower (freq 5%).
r = buildLimitingFactors(input({ metrics: {
  leftStepLengthM: 2.30, rightStepLengthM: 2.03, leftStepFrequencyHz: 4.9, rightStepFrequencyHz: 4.66, leftStepSampleCount: 5, rightStepSampleCount: 5 } }));
chk("higher-impact limiter ranks #1", r.limiters[0]?.rank === 1 && r.limiters[0]?.impact.score >= (r.limiters[1]?.impact.score ?? 0));
chk("ranks are 1..n contiguous", r.limiters.every((l, i) => l.rank === i + 1));

// (8) Confidence is conservative: overall never exceeds min(measurement, reasoning).
sl = byType(buildLimitingFactors(input({ metrics: { leftStepLengthM: 2.25, rightStepLengthM: 2.0, leftStepSampleCount: 5, rightStepSampleCount: 5 } })), "step_length_asymmetry");
chk("overall confidence ≤ min(measurement,reasoning)", sl && sl.confidence.overall <= Math.min(sl.confidence.measurement, sl.confidence.reasoning) + 1e-9);

// (9) Low measurement confidence lowers overall.
const hi = byType(buildLimitingFactors(input({ measurementConfidence: "high", metrics: { leftStepLengthM: 2.25, rightStepLengthM: 2.0, leftStepSampleCount: 5, rightStepSampleCount: 5 } })), "step_length_asymmetry");
const lo = byType(buildLimitingFactors(input({ measurementConfidence: "low", metrics: { leftStepLengthM: 2.25, rightStepLengthM: 2.0, leftStepSampleCount: 5, rightStepSampleCount: 5 } })), "step_length_asymmetry");
chk("low measurement confidence reduces overall confidence", lo.confidence.overall < hi.confidence.overall);

// (10) Guards.
chk("calibration missing → calibration_missing status, no limiters", (() => { const x = buildLimitingFactors(input({ calibrationConfirmed: false })); return x.status === "calibration_missing" && x.limiters.length === 0; })());
chk("too few valid steps → insufficient_data", buildLimitingFactors(input({ metrics: { validStepCount: 2 } })).status === "insufficient_data");
chk("no spatial → insufficient_data", buildLimitingFactors(input({ spatialAvailable: false })).status === "insufficient_data");

// (11) Expectation models reported unavailable (scientific honesty — no invented thresholds).
r = buildLimitingFactors(input());
chk("individualized expectation models listed as unavailable", r.unavailableModels.some((n) => /individualized step-length expectation/i.test(n)));
chk("no expectation limiter appears as a ranked card", !r.limiters.some((l) => /expectation|velocity_limitation/.test(l.type)));

// (12) Determinism — identical inputs → identical output.
const a = JSON.stringify(buildLimitingFactors(input({ metrics: { leftStepLengthM: 2.2, rightStepLengthM: 2.0, leftStepSampleCount: 5, rightStepSampleCount: 5 } })));
const b = JSON.stringify(buildLimitingFactors(input({ metrics: { leftStepLengthM: 2.2, rightStepLengthM: 2.0, leftStepSampleCount: 5, rightStepSampleCount: 5 } })));
chk("engine is deterministic (identical inputs → identical output)", a === b);

rmSync(out, { recursive: true, force: true });
console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
process.exit(ok ? 0 : 1);
