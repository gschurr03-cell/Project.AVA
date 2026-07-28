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
    planAnalysisFrameIndices,
    UNSUPPORTED_FPS_MESSAGE,
    VALIDATED_ANALYSIS_FPS,
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
    classifySourceFps({ detectedFps: 58, nominalFps: 60 }),
    "unsupported_source_fps",
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
    classifySourceFps({ detectedFps: 50, averageFps: 50, nominalFps: 50, realFps: 50, timestampFps: 50 }),
    "unsupported_source_fps",
    "true 50 FPS has no production promotion without validation",
  );
  assert.equal(
    classifySourceFps({ detectedFps: Number.NaN, averageFps: 0, nominalFps: 60, timestampFps: 0 }),
    "unsupported_source_fps",
    "malformed fields fail closed",
  );
  for (const fps of [55, 50, 24]) {
    assert.equal(classifySourceFps({ detectedFps: fps }), "unsupported_source_fps");
    assert.throws(() => planAnalysisFrameIndices(fps, 120), new RegExp(UNSUPPORTED_FPS_MESSAGE));
  }
  for (const fps of [30, 29.97]) {
    assert.equal(classifySourceFps({ detectedFps: fps }), "experimental_30_fps_class");
    assert.throws(() => planAnalysisFrameIndices(fps, 120), new RegExp(UNSUPPORTED_FPS_MESSAGE));
  }
  assert.equal(classifySourceFps({ detectedFps: 120 }), "high_speed_source_normalized_to_60");
  assert.equal(classifySourceFps({ detectedFps: 240 }), "high_speed_source_normalized_to_60");
  assert.deepEqual(planAnalysisFrameIndices(60, 6), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(planAnalysisFrameIndices(59.94, 6), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(planAnalysisFrameIndices(120, 12), [0, 2, 4, 6, 8, 10]);
  assert.deepEqual(planAnalysisFrameIndices(240, 24), [0, 4, 8, 12, 16, 20]);
  assert.equal(new Set(planAnalysisFrameIndices(120, 12)).size, 6, "sampling never duplicates frames");
  console.log("analysis-fps sanity: passed");
} finally {
  rmSync(out, { recursive: true, force: true });
}
