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
      files: [
        path.join(root, "src/lib/intelligence/recommendations.ts"),
        path.join(root, "src/lib/intelligence/progress.ts"),
      ],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { buildRecommendations } = require(path.join(out, "lib/intelligence/recommendations.js"));
  const { buildProgress, snapshotFromAnalysisMetrics, NEEDS_MORE_SESSIONS_MESSAGE } = require(path.join(out, "lib/intelligence/progress.js"));

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

  // ---- Evidence Frames V1: timed video moments backing each recommendation ----
  const zoneSteps = [
    { index: 1, side: "left", timeS: 0.10, worldX: 0.10, stepLengthM: 2.33, fromSide: "right" },
    { index: 2, side: "right", timeS: 0.30, worldX: 0.22, stepLengthM: 2.04, fromSide: "left" },
    { index: 3, side: "left", timeS: 0.48, worldX: 0.36, stepLengthM: 2.34, fromSide: "right" },
    { index: 4, side: "right", timeS: 0.74, worldX: 0.52, stepLengthM: 2.02, fromSide: "left" },
    { index: 5, side: "left", timeS: 0.92, worldX: 0.66, stepLengthM: 2.35, fromSide: "right" },
  ];
  // Right side runs shorter (~13%) → asymmetry(right); low stride + low velocity too.
  const evMeas = {
    velocitySpreadPct: 6, leftStepLengthM: 2.34, rightStepLengthM: 2.03,
    leftStepFrequencyHz: 2.5, rightStepFrequencyHz: 2.5,
    diagnostics: { trackingCoverage: 0.95 }, zoneSteps,
  };
  const evTrusted = { ...elite, strideLengthM: 2.12, avgStrideLengthM: 2.1, peakStrideLengthM: 2.12, topSpeedMps: 10.5, avgVelocityMps: 10.0, frequencyHz: 4.9 };
  const rEv = build({ trusted: evTrusted, measurements: evMeas, activeFps: 60 });
  const allMoments = rEv.recommendations.flatMap((r) => r.evidenceMoments);

  // 1. Legacy per-side aggregates are not silently treated as authoritative.
  const asym = cat(rEv, "asymmetry");
  check("legacy asymmetry aggregates do not produce a recommendation", !asym);

  // 2. Stride recommendation gets stride evidence (shortest stride, with a timestamp).
  const evStride = cat(rEv, "stride_length");
  check("stride rec gets stride evidence", !!evStride && evStride.evidenceMoments.some((m) => m.relatedMetric === "strideLength"));
  check("stride evidence includes the shortest-stride moment with a real timeS", !!evStride && evStride.evidenceMoments.some((m) => /shortest/i.test(m.label) && Number.isFinite(m.timeS)));

  // 3. Speed recommendation gets velocity evidence (peak velocity moment).
  const evSpeed = cat(rEv, "speed");
  check("speed rec gets velocity evidence (peak velocity moment)", !!evSpeed && evSpeed.evidenceMoments.some((m) => m.relatedMetric === "velocity" && /peak/i.test(m.label)));

  // 4. Missing evidence → empty moments (no broken buttons), not fabricated.
  const rNoSteps = build({ trusted: evTrusted, measurements: { ...evMeas, zoneSteps: [] }, activeFps: 60 });
  check("no zone steps → stride rec has zero evidence moments (UI shows 'unavailable')", cat(rNoSteps, "stride_length")?.evidenceMoments.length === 0);
  const rNoMeas = build({ trusted: evTrusted, measurements: null, activeFps: 60 });
  check("no measurements → speed rec has zero evidence moments", cat(rNoMeas, "speed")?.evidenceMoments.length === 0);

  // 5. 60fps evidence never uses contact time / flight / stiffness.
  check("60fps evidence never references contact/flight/stiffness", allMoments.every((m) => !/contact|flight|stiff|toe.?off|foot.?strike/i.test(m.relatedMetric)));
  check("60fps evidence relatedMetric is a trusted spatial/cadence metric", allMoments.every((m) => ["strideLength", "stepLength", "stepFrequency", "velocity", "velocityConsistency"].includes(m.relatedMetric)));
  check("every evidence moment carries a real timestamp + reason", allMoments.every((m) => Number.isFinite(m.timeS) && typeof m.reason === "string" && m.reason.length > 0));

  // 6. Recommendations still sort correctly with evidence attached.
  check("recommendations still sort by ascending displayPriority (evidence added)", rEv.recommendations.every((r, i) => i === 0 || r.displayPriority > rEv.recommendations[i - 1].displayPriority));

  // ---- Progress Tracking V1 — latest vs previous fly session ----
  const am = (over) => ({
    topSpeedMps: 0, avgStrideLengthM: 0, strideFrequencyHz: 0,
    groundContactTimeMs: 90, flightTimeMs: 120, peakKneeFlexionDeg: 130, avgTrunkLeanDeg: 8, ...over,
  });
  // Previous (older) then latest (newer): stride 2.10 → 2.28 (improved), freq 4.5 → 4.4 (declined).
  const prevSnap = snapshotFromAnalysisMetrics("s-prev", "2026-06-01T10:00:00Z", am({ avgStrideLengthM: 2.10, strideFrequencyHz: 4.5, topSpeedMps: 10.4 }));
  const latestSnap = snapshotFromAnalysisMetrics("s-latest", "2026-07-01T10:00:00Z", am({ avgStrideLengthM: 2.28, strideFrequencyHz: 4.4, topSpeedMps: 10.6 }));

  // 1. Progress compares latest vs previous (most recent two).
  const prog = buildProgress([prevSnap, latestSnap], { latestLimiterCategory: "stride_length" });
  check("progress available with two sessions", prog.available === true);
  check("progress compares latest vs previous by date", prog.latestSessionId === "s-latest" && prog.previousSessionId === "s-prev");
  const strideChange = prog.metrics.find((m) => m.key === "strideLengthM");
  check("stride change computed latest−previous (+0.18 m)", strideChange && Math.abs(strideChange.delta - 0.18) < 1e-6 && strideChange.direction === "improved");
  check("percent change reported", strideChange && Math.abs(strideChange.percentChange - 8.6) < 0.2);

  // 2. Stride limiter prioritises stride-length change first.
  check("stride limiter → stride length highlighted and first", prog.metrics[0].key === "strideLengthM" && prog.metrics[0].highlighted === true);

  // 3. Frequency limiter prioritises frequency change first.
  const progFreq = buildProgress([prevSnap, latestSnap], { latestLimiterCategory: "frequency" });
  check("frequency limiter → frequency highlighted and first", progFreq.metrics[0].key === "frequencyHz" && progFreq.metrics[0].highlighted === true);
  const freqChange = progFreq.metrics.find((m) => m.key === "frequencyHz");
  check("frequency decline detected (4.5 → 4.4)", freqChange && freqChange.direction === "declined");

  // 4. Missing previous session → fallback message.
  const progOne = buildProgress([latestSnap], { latestLimiterCategory: "stride_length" });
  check("single session → available false with fallback message", progOne.available === false && progOne.message === NEEDS_MORE_SESSIONS_MESSAGE);

  // 5. 60fps-limited metrics excluded from progress entirely.
  const trackedKeys = new Set(prog.metrics.map((m) => m.key));
  check("progress never tracks ground contact / flight time", !["groundContactTimeMs", "flightTimeMs", "contactFlightRatio", "stiffness"].some((k) => trackedKeys.has(k)));
  check("snapshot carries no contact/flight fields", latestSnap.metrics.groundContactTimeMs === undefined && latestSnap.metrics.flightTimeMs === undefined);

  // Previous recommendation improved: previous session's inferred limiter was stride
  // (2.10 well below 2.45) → stride improved to 2.28 → improved true.
  check("previous recommendation's target (stride) is reported as improved", prog.previousRecommendationImproved === true);

  // No fake zeros: an uncalibrated (0) metric is dropped, never compared as 0.
  const zeroPrev = snapshotFromAnalysisMetrics("z1", "2026-06-01T10:00:00Z", am({ avgStrideLengthM: 0, strideFrequencyHz: 4.5 }));
  const zeroLatest = snapshotFromAnalysisMetrics("z2", "2026-07-01T10:00:00Z", am({ avgStrideLengthM: 0, strideFrequencyHz: 4.7 }));
  const progZero = buildProgress([zeroPrev, zeroLatest]);
  check("uncalibrated (0) stride is not tracked as a real reading", !progZero.metrics.some((m) => m.key === "strideLengthM"));

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
