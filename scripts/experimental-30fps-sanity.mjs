import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = process.cwd();
const out = path.join(root, ".experimental-30fps-sanity-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  execFileSync("npx", ["tsc", "src/lib/analysis/experimental30.ts", "src/lib/video/analysisFps.ts", "--outDir", out, "--rootDir", "src/lib", "--module", "commonjs", "--target", "es2022", "--skipLibCheck", "--esModuleInterop", "--resolveJsonModule", "--moduleResolution", "node", "--strict"], { cwd: root, stdio: "inherit" });
  const fps = require(path.join(out, "video/analysisFps.js"));
  const exp = require(path.join(out, "analysis/experimental30.js"));
  for (const value of [29.97, 30, 30.03]) assert.equal(fps.classifySourceFps({ detectedFps: value }), "experimental_30_fps_class");
  assert.equal(fps.classifySourceFps({ detectedFps: 28.8, averageFps: 28.8, nominalFps: 30, realFps: 29.98, timestampFps: 29.97, variableFrameRate: true }), "experimental_30_fps_class");
  assert.equal(fps.classifySourceFps({ detectedFps: 24, nominalFps: 24, timestampFps: 24 }), "unsupported_source_fps");
  assert.equal(fps.classifySourceFps({ detectedFps: 50, nominalFps: 50, timestampFps: 50 }), "unsupported_source_fps");
  assert.equal(fps.classifySourceFps({ detectedFps: 59.94 }), "validated_60_fps_class");
  assert.equal(fps.classifySourceFps({ detectedFps: 120 }), "high_speed_source_normalized_to_60");
  assert.equal(fps.classifySourceFps({ detectedFps: 240 }), "high_speed_source_normalized_to_60");
  const timestamps = Array.from({ length: 91 }, (_, index) => index / 30);
  const events = [0.4, 0.62, 0.84, 1.06, 1.28, 1.5].map((time, index) => ({
    type: "contact", side: index % 2 ? "right" : "left", sourceFrameIndex: Math.round(time * 30),
    timestampSeconds: time, bracketStartSeconds: time - 1 / 30, bracketEndSeconds: time + 1 / 30,
    interpolationFraction: null, confidence: 0.82, uncertaintySeconds: 1 / 60,
    modelVersion: exp.EXPERIMENTAL_30_EVENT_VERSION,
  }));
  const result = exp.buildExperimental30Result({ sourceFps: 30, rawTimestampsSeconds: timestamps, events, zone: null, calibrationConfidence: null });
  assert.equal(result.experimental, true);
  assert.equal(result.analysisFps, 30);
  assert.equal(result.syntheticFrameCount, 0);
  assert.deepEqual(result.rawTimestampsSeconds, timestamps);
  assert.equal(result.metrics.stepFrequency.status, "available");
  assert.equal(result.metrics.strideFrequency.status, "available");
  assert.equal(result.metrics.zoneTime.value, null);
  assert.equal(result.metrics.strideLength.value, null);
  assert.equal(result.downstream.pbPrediction, false);
  assert.equal(exp.analysesAreCompatible(result, { compatibilityGroup: "validated-60-v1" }), false);
  const calibrated = exp.buildExperimental30Result({ sourceFps: 30, rawTimestampsSeconds: timestamps, events, zone: { entryTimeSeconds: 0.25, exitTimeSeconds: 2.171, distanceMeters: 20, crossingConfidence: 0.8, panningSafe: true, calibrated: true }, completeStrideLengthsMeters: [2.1, 2.2, 2.15], calibrationConfidence: 0.75 });
  assert.ok(Math.abs(calibrated.metrics.zoneTime.rawValue - 1.921) < 1e-12);
  assert.equal(calibrated.metrics.zoneTime.value, 1.93);
  assert.equal(calibrated.metrics.zoneAverageVelocity.value, 20 / 1.93);
  assert.equal(calibrated.metrics.strideLength.status, "available");
  assert.throws(() => exp.buildExperimental30Result({ sourceFps: 30, rawTimestampsSeconds: [0, 0], events: [] }), /strictly increasing/);
  const page = readFileSync(path.join(root, "src/app/sessions/[id]/page.tsx"), "utf8");
  assert.match(page, /Experimental analysis/);
  assert.match(page, /kept separate from validated 60 FPS analyses/);
  const migration = readFileSync(path.join(root, "supabase/migrations/0023_experimental_30fps_foundation.sql"), "utf8");
  assert.match(migration, /complete_experimental_analysis_job/);
  assert.match(migration, /compatibility_group/);
  assert.match(migration, /experimental_result/);
  const worker = readFileSync(path.join(root, "scripts/analysis-worker.mjs"), "utf8");
  assert.match(worker, /timingSetup\?\.setupMode !== "technique_only"/);
  assert.match(worker, /timingEnabled && immutableSnapshot\.session\.calibrationInputs\?\.gates\s*\?\s*buildReal30Zone[\s\S]*:\s*null/);
  assert.doesNotMatch(worker, /start\?\.setupFrameIndex === 72/);
  assert.doesNotMatch(worker, /startCrossing\.beforeFrame !== 99/);
  assert.match(worker, /rawTimingMetrics:\s*\{\s*groundContactTimeMs:\s*null,\s*flightTimeMs:\s*null/);
  assert.match(worker, /validatorName:\s*validation\?\.validatorName/);
  console.log("experimental 30fps sanity: passed");
} finally {
  rmSync(out, { recursive: true, force: true });
}
