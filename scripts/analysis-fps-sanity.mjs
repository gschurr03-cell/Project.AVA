import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = process.cwd();
const out = path.join(root, ".analysis-fps-sanity-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

try {
  execFileSync(
    "npx",
    [
      "tsc",
      "src/lib/video/analysisFps.ts",
      "src/lib/video/metricEligibility.ts",
      "--outDir",
      out,
      "--module",
      "commonjs",
      "--target",
      "es2022",
      "--skipLibCheck",
      "--resolveJsonModule",
      "--esModuleInterop",
      "--moduleResolution",
      "node",
    ],
    { cwd: root },
  );
  const {
    classifySourceFps,
    classifySourceFpsTier,
    classifyFpsBand,
    planAnalysisFrameIndices,
    UNSUPPORTED_FPS_MESSAGE,
    VALIDATED_ANALYSIS_FPS,
    MINIMUM_60_FPS_CLASS,
    MIN_SUPPORTED_FPS,
    MAX_SUPPORTED_FPS,
  } = require(
    path.join(out, "analysisFps.js"),
  );
  assert.equal(VALIDATED_ANALYSIS_FPS, 60);
  for (const fps of [59.94, 59.97, 59.99, 60]) {
    assert.equal(classifySourceFps({ detectedFps: fps }), "validated_60_fps_class");
  }
  assert.equal(
    classifySourceFps({
      detectedFps: 58.98,
      averageFps: 58.98,
      nominalFps: 60,
      realFps: 59.95,
      timestampFps: 59.94,
      variableFrameRate: true,
    }),
    "validated_60_fps_class",
  );
  assert.equal(
    classifySourceFps({ detectedFps: 58, nominalFps: 60, timestampFps: 59.94 }),
    "validated_60_fps_class",
  );
  assert.equal(
    classifySourceFps({ detectedFps: 30, averageFps: 30, nominalFps: 30, realFps: 30, timestampFps: 30, variableFrameRate: false }),
    "experimental_30_fps_class",
    "the exact panning-fixture cadence is true 30 FPS",
  );
  assert.equal(
    classifySourceFps({ detectedFps: 30, averageFps: 30, nominalFps: 60, realFps: 30, timestampFps: 30, variableFrameRate: true }),
    "experimental_30_fps_class",
    "nominal metadata alone cannot hide duplicate/dropped 30 Hz timestamps",
  );
  assert.equal(
    classifySourceFps({ detectedFps: Number.NaN, averageFps: 0, nominalFps: 60, timestampFps: 0 }),
    "unsupported_source_fps",
    "malformed fields fail closed",
  );
  assert.equal(classifySourceFps({ detectedFps: 305 }), "unsupported_source_fps", "above the 300 FPS ceiling is unsupported");
  assert.equal(classifySourceFps({ detectedFps: 20 }), "unsupported_source_fps", "below the ~24 FPS floor is unsupported");

  // --- General native-source policy (follow-up: every 24-300 FPS rate gets a
  // safe analysis path; only the two precise named windows are special-cased). ---
  //
  // A rate near 60 with no corroborating evidence (58, uncorroborated) used to
  // be rejected outright. It's now accepted as a general native source instead
  // — just not promoted into the precise validated-60 identity without proof.
  assert.equal(classifySourceFps({ detectedFps: 58, nominalFps: 60 }), "native_source_class");

  // Required coverage: 45, 75, 90, 144, 165 — none of these are standard camera
  // rates, none should be forced into 30/60/another unrelated identity, and
  // each must keep its own exact timing.
  for (const fps of [45, 75, 90, 144, 165]) {
    const decision = classifySourceFpsTier({ detectedFps: fps });
    assert.equal(decision.classification, "native_source_class", `${fps} FPS must classify as a general native source`);
    assert.notEqual(decision.analysisFps, 30, `${fps} FPS must not be forced into a 30 FPS identity`);
    assert.notEqual(decision.analysisFps, 60, `${fps} FPS must not be forced into a 60 FPS identity`);
    assert.ok(Math.abs(decision.analysisFps - fps) < 0.001, `${fps} FPS keeps its own exact rate as analysisFps, got ${decision.analysisFps}`);
  }
  // Below 60: general analysis path exists, but not acceleration-timing eligible.
  for (const fps of [24, 25, 45, 50, 55]) {
    assert.ok(fps < MINIMUM_60_FPS_CLASS, `sanity: ${fps} is below the validated-60 threshold`);
    assert.notEqual(classifySourceFps({ detectedFps: fps }), "unsupported_source_fps", `${fps} FPS must have a safe analysis path`);
  }
  // 60 and above (including odd native rates): acceleration-timing eligible.
  for (const fps of [59.94, 60, 75, 90, 120, 144, 165, 200, 240, 300]) {
    assert.ok(fps >= MINIMUM_60_FPS_CLASS, `sanity: ${fps} clears the validated-60 threshold`);
  }

  // A real 120/240 FPS source must retain its own native identity — it must
  // NEVER be reported or timed as if it were 60 FPS (the original bug this
  // audit fixed).
  for (const fps of [119.88, 120, 200, 239.76, 240, 300]) {
    const decision = classifySourceFpsTier({ detectedFps: fps });
    assert.equal(decision.classification, "native_source_class", `${fps} must classify as a general native source`);
    assert.notEqual(decision.classification, "high_speed_source_normalized_to_60", `${fps} must not use the legacy forced-60 classification`);
    assert.notEqual(decision.analysisFps, 60, `${fps} FPS is never labeled or timed as 60 FPS`);
    assert.ok(Math.abs(decision.analysisFps - fps) < 0.001, `${fps} keeps its own exact rate as analysisFps, got ${decision.analysisFps}`);
  }

  // The legacy values stay valid to READ (historical rows), just never produced.
  assert.equal(MIN_SUPPORTED_FPS, 23.9);
  assert.equal(MAX_SUPPORTED_FPS, 300.5);

  // fpsBand: pure metadata/eligibility concept, independent of analysis-tier support.
  assert.equal(classifyFpsBand(23.976), "low");
  assert.equal(classifyFpsBand(24), "low");
  assert.equal(classifyFpsBand(29.97), "low");
  assert.equal(classifyFpsBand(45), "low");
  assert.equal(classifyFpsBand(49.9), "low");
  assert.equal(classifyFpsBand(50), "standard");
  assert.equal(classifyFpsBand(59.94), "standard");
  assert.equal(classifyFpsBand(75), "standard");
  assert.equal(classifyFpsBand(90), "standard");
  assert.equal(classifyFpsBand(99.9), "standard");
  assert.equal(classifyFpsBand(100), "high");
  assert.equal(classifyFpsBand(119.88), "high");
  assert.equal(classifyFpsBand(144), "high");
  assert.equal(classifyFpsBand(165), "high");
  assert.equal(classifyFpsBand(199.9), "high");
  assert.equal(classifyFpsBand(200), "ultra_high");
  assert.equal(classifyFpsBand(239.76), "ultra_high");
  assert.equal(classifyFpsBand(300), "ultra_high");
  assert.equal(classifyFpsBand(23), "unsupported", "below the accepted floor");
  assert.equal(classifyFpsBand(301), "unsupported", "above the accepted ceiling");
  assert.equal(classifyFpsBand(null), "unsupported");
  assert.equal(classifyFpsBand(Number.NaN), "unsupported");

  // planAnalysisFrameIndices: full native rate by default (no target given) —
  // every real source frame is kept, at 45, 60, 90, 120, 144, 165, or 240 FPS
  // alike. Never silently resampled.
  assert.deepEqual(planAnalysisFrameIndices(60, 6), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(planAnalysisFrameIndices(59.94, 6), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(planAnalysisFrameIndices(45, 9), Array.from({ length: 9 }, (_, i) => i), "45 FPS keeps every frame by default");
  assert.deepEqual(planAnalysisFrameIndices(90, 9), Array.from({ length: 9 }, (_, i) => i), "90 FPS keeps every frame by default");
  assert.deepEqual(planAnalysisFrameIndices(144, 12), Array.from({ length: 12 }, (_, i) => i), "144 FPS keeps every frame by default");
  assert.deepEqual(planAnalysisFrameIndices(120, 12), Array.from({ length: 12 }, (_, i) => i), "native high-speed keeps every frame by default");
  assert.deepEqual(planAnalysisFrameIndices(240, 24), Array.from({ length: 24 }, (_, i) => i), "240 FPS native keeps every frame too");
  // An explicit lower target still downsamples on request (opt-in, not default).
  assert.deepEqual(planAnalysisFrameIndices(120, 12, 60), [0, 2, 4, 6, 8, 10]);
  assert.deepEqual(planAnalysisFrameIndices(240, 24, 60), [0, 4, 8, 12, 16, 20]);
  assert.equal(new Set(planAnalysisFrameIndices(120, 12, 60)).size, 6, "sampling never duplicates frames");
  assert.throws(() => planAnalysisFrameIndices(120, 12, 400), /Analysis FPS must be between/, "cannot request above the supported ceiling");
  assert.throws(() => planAnalysisFrameIndices(24, 12, 400), /Analysis FPS must be between/, "a low-band native source cannot request above the supported ceiling either");

  // Metric eligibility is a distinct axis from file acceptance and from
  // classification labels: it's purely a function of the exact detected rate.
  const {
    videoReviewEligibility,
    accelerationContactEligibility,
  } = require(path.join(out, "metricEligibility.js"));
  assert.equal(videoReviewEligibility(30).available, true, "30 FPS files are never globally rejected");
  assert.equal(videoReviewEligibility(24).available, true, "24 FPS files are accepted for review");
  assert.equal(videoReviewEligibility(45).available, true, "45 FPS files are accepted for review");
  assert.equal(videoReviewEligibility(15).available, false, "far below the supported floor is not reviewable");
  assert.equal(accelerationContactEligibility(30).available, false, "30 FPS cannot support precise contact timing");
  assert.equal(accelerationContactEligibility(45).available, false, "45 FPS cannot support precise contact timing");
  assert.ok(accelerationContactEligibility(30).explanation, "an unavailable metric must explain why, not fabricate a value");
  assert.equal(accelerationContactEligibility(60).available, true);
  assert.equal(accelerationContactEligibility(59.94).available, true);
  for (const fps of [75, 90, 120, 144, 165, 200, 240, 300]) {
    assert.equal(accelerationContactEligibility(fps).available, true, `${fps} FPS native sources are contact-eligible purely on their real rate`);
  }
  assert.equal(
    videoReviewEligibility(30).available && !accelerationContactEligibility(30).available,
    true,
    "file acceptance and acceleration metric eligibility are genuinely independent axes",
  );

  console.log("analysis-fps sanity: passed");
} finally {
  rmSync(out, { recursive: true, force: true });
}
