import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".coach-report-sanity-tmp");
const require = createRequire(import.meta.url);
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return originalResolve.call(this, request.startsWith("@/") ? path.join(out, request.slice(2)) : request, ...rest);
};
let ok = true;
const check = (label, condition) => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) ok = false;
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(path.join(out, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022",
      skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node",
      baseUrl: root, paths: { "@/*": ["src/*"] },
    },
    files: [
      path.join(root, "src/lib/analysis/resultContract.ts"),
      path.join(root, "src/lib/observations/index.ts"),
      path.join(root, "src/lib/intelligence/interpretations/index.ts"),
      path.join(root, "src/lib/intelligence/interpretations/fixtures.ts"),
      path.join(root, "src/lib/intelligence/recommendationEngine/index.ts"),
      path.join(root, "src/lib/intelligence/priorityEngine/index.ts"),
      path.join(root, "src/lib/intelligence/reports/index.ts"),
    ],
  }));
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
  const { INTERPRETATION_GOLDEN_FIXTURES } = require(path.join(out, "lib/intelligence/interpretations/fixtures.js"));
  const { generateInterpretations } = require(path.join(out, "lib/intelligence/interpretations/evaluate.js"));
  const { generateRecommendations } = require(path.join(out, "lib/intelligence/recommendationEngine/evaluate.js"));
  const { generatePriorities } = require(path.join(out, "lib/intelligence/priorityEngine/evaluate.js"));
  const { composeCoachReport } = require(path.join(out, "lib/intelligence/reports/compose.js"));
  const { resolveCoachReport } = require(path.join(out, "lib/intelligence/reports/persistence.js"));
  const { assertSafeReportLanguage } = require(path.join(out, "lib/intelligence/reports/languageSafety.js"));

  const analysisId = "22222222-2222-4222-8222-222222222222";
  const now = "2026-07-17T12:00:00.000Z";
  const fixture = JSON.parse(
    JSON.stringify(INTERPRETATION_GOLDEN_FIXTURES.panning_broad_technique)
      .replaceAll("synthetic-interpretation-fixture", analysisId),
  );
  fixture.context.generatedAt = now;
  const interpretations = generateInterpretations(fixture);
  const recContext = {
    analysisId, generatedAt: now, phase: fixture.context.phase, event: null,
    sessionPurpose: "fly", cameraMode: "static", fpsTier: "validated_60",
    calibrationAvailable: false, savedVersion: false,
    athlete: {
      athleteId: "11111111-1111-4111-8111-111111111111", trainingAge: "unknown",
      competitionLevel: "unknown", primaryEvent: null, goals: [], reportedPain: null,
      activeLimitation: null, contextVersion: "ava-athlete-recommendation-context-v1",
    },
  };
  const recommendations = generateRecommendations(
    { interpretations, context: recContext }, undefined,
    { allowExperimental: true, allowAdvancedDrills: false, allowProfessionalReview: false },
  );
  const priorities = generatePriorities({
    observations: fixture.observations, interpretations, recommendations,
    context: {
      analysisId, generatedAt: now, athleteGoals: [], primaryEvent: null,
      phase: fixture.context.phase, coachRelevantAreas: [], persistenceSignals: [],
      baselineSignals: [], contextVersion: "ava-priority-context-v1",
    },
  });
  const confidence = { score: 0.7, label: "moderate", rationale: "Synthetic fixture confidence." };
  const result = {
    schemaVersion: "ava-explainability-v1", analysisId,
    athleteId: "11111111-1111-4111-8111-111111111111",
    sessionId: "33333333-3333-4333-8333-333333333333",
    provenance: {
      originalSourceFps: 60, sourceFpsClassification: "validated_60_fps_class",
      sourceFpsMetadata: { averageFps: 59.94, nominalFps: 60, realFps: 59.94, timestampFps: 59.94, variableFrameRate: false },
      analysisFps: 60, timingPolicyVersion: "CONSERVATIVE_TIMING_POLICY_V1",
      sourceFrameCount: 600, analyzedFrameCount: 600, originalVideoWidth: 1920,
      originalVideoHeight: 1080, sourceDurationSeconds: 10, sourceCodec: "h264",
      videoPath: "athlete/video.mov", poseModelName: "mediapipe", poseModelVersion: "pose-v1",
      analysisPipelineVersion: "ava-sprint-60-v1", metricSchemaVersion: "ava-metrics-v1",
      explainabilitySchemaVersion: "ava-explainability-v1", calibrationMode: "none",
      calibrationSnapshot: {}, cameraMode: "static", cameraMotionConfidence: 0.8,
      recordingQualityScore: 80, recordingQualityClassification: "good",
      globalAnalysisConfidence: confidence, analysisWarnings: [], createdAt: now, completedAt: now,
    },
    inputSnapshot: {
      capturedAt: now,
      athlete: {
        id: "11111111-1111-4111-8111-111111111111", sex: null, dateOfBirth: null,
        heightCm: null, weightKg: null, legLengthCm: null, trochanterHeightM: null,
        personalBests: {}, goals: {},
      },
      session: {
        analysisType: "fly", distanceM: null, benchmarkId: null,
        recordingMode: "uploaded_video", timingZone: {}, timingSetup: {},
        calibrationInputs: {}, requestedOptions: {},
      },
    },
    recordingAssessment: {},
    measurements: [
      {
        metricId: "topSpeedMps", name: "Top speed", phase: null, side: null,
        repetitionRange: null, result: {
          value: 9.1, unit: "m/s", status: "available", confidence: 0.7,
          confidenceLabel: "moderate", reasonCode: null, warning: null,
          source: "metric-engine", version: "v1",
        }, benchmarkComparison: null, evidenceReferences: [], warnings: [],
      },
      {
        metricId: "groundContactTimeMs", name: "Ground contact time", phase: null, side: null,
        repetitionRange: null, result: {
          value: null, unit: "ms", status: "withheld", confidence: null,
          confidenceLabel: "insufficient", reasonCode: "timing_not_supported", warning: null,
          source: "metric-engine", version: "v1",
        }, benchmarkComparison: null, evidenceReferences: [], warnings: [],
      },
    ],
    limitations: [], recommendations: [], retestPlans: [],
    warnings: ["Ground contact timing was withheld."], overallConfidence: confidence,
  };
  const input = {
    result, observations: fixture.observations, interpretations, recommendations,
    priorities, audience: "athlete", athleteName: "Fixture Athlete", sessionName: "Fixture Session",
  };
  const athlete = composeCoachReport(input);
  const coach = composeCoachReport({ ...input, audience: "coach" });
  check("report consumes every source engine version", Object.values(athlete.sourceVersions).every(Boolean));
  check("report priorities equal Priority Engine output", JSON.stringify(athlete.topPriorities.map(x => x.priorityId)) === JSON.stringify(priorities.topPriorities.map(x => x.priorityId)));
  check("priority links resolve to existing recommendations", athlete.topPriorities.every(x => [...recommendations.recommendations, ...recommendations.monitoringRecommendations].some(r => r.id === x.recommendationId)));
  check("athlete and coach views preserve conclusions", JSON.stringify(athlete.topPriorities.map(x => x.recommendationId)) === JSON.stringify(coach.topPriorities.map(x => x.recommendationId)));
  check("withheld metrics remain null", athlete.metricHighlights.find(x => x.metricId === "groundContactTimeMs")?.value === null);
  check("limitations and unavailable evidence are explicit", athlete.limitations.length > 0 && athlete.unavailable.length > 0);
  check("report generation is deterministic", JSON.stringify(composeCoachReport(input)) === JSON.stringify(athlete));
  check("working reports regenerate", resolveCoachReport({ analysisKind: "working", compositionInput: input }).behavior === "regenerated");
  check("saved reports fail closed without snapshot", resolveCoachReport({ analysisKind: "saved" }).behavior === "snapshot_required");
  check("saved immutable snapshots load without regeneration", resolveCoachReport({ analysisKind: "saved", storedSnapshot: athlete }).behavior === "loaded_snapshot");
  let unsafeRejected = false;
  try { assertSafeReportLanguage({ summary: "This proves the cause." }); } catch { unsafeRejected = true; }
  check("unsafe certainty language is rejected", unsafeRejected);
  let mixedRejected = false;
  try { composeCoachReport({ ...input, interpretations: { ...interpretations, analysisId: "other" } }); } catch { mixedRejected = true; }
  check("cross-analysis source composition is rejected", mixedRejected);
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (!ok) process.exit(1);
console.log("\\nCoach Report sanity checks passed.");
