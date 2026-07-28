import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".observation-sanity-tmp");
const require = createRequire(import.meta.url);
let ok = true;
const check = (label, condition) => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) ok = false;
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        outDir: out,
        rootDir: path.join(root, "src"),
        module: "commonjs",
        target: "es2022",
        skipLibCheck: true,
        esModuleInterop: true,
        strict: true,
        moduleResolution: "node",
      },
      files: [
        path.join(root, "src/lib/observations/contracts.ts"),
        path.join(root, "src/lib/observations/types.ts"),
        path.join(root, "src/lib/observations/rules.ts"),
        path.join(root, "src/lib/observations/generator.ts"),
      ],
    }),
  );
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], {
    cwd: root,
    stdio: ["ignore", "inherit", "inherit"],
  });
  const { generateObservationResult } = require(
    path.join(out, "lib/observations/generator.js"),
  );

  const metric = (key, value, options = {}) => ({
    key,
    metric: key,
    value,
    unit: options.unit ?? "",
    confidence: options.confidence ?? "High",
    source: options.source ?? "test:metric-v1",
    availability: options.availability ?? "available",
    frameRange: null,
    phase: null,
    directness: options.directness ?? "direct",
    experimental: options.experimental ?? false,
    reasonCode: options.reasonCode ?? null,
    warning: options.warning ?? null,
  });
  const base = (overrides = {}) => ({
    analysisId: "analysis-test",
    status: "complete",
    completedAt: "2026-07-17T12:00:00.000Z",
    experimental: false,
    analysisFps: 60,
    sourceFps: 59.94,
    recordingMode: "static_precision",
    recordingQuality: {
      score: 94,
      rating: "excellent",
      confidence: "High",
      source: "test:quality-v1",
    },
    calibrationAvailable: true,
    timingClassification: "trusted",
    timingConfidence: "Moderate",
    timingConfidenceSource: "test:timing-v1",
    metrics: [
      metric("top_speed", 10.8, { unit: "m/s" }),
      metric("cadence", 4.7, { unit: "Hz" }),
    ],
    comparisons: [],
    limitations: [],
    ...overrides,
  });

  const positive = generateObservationResult(base());
  check(
    "positive: available velocity fires",
    positive.observations.some((item) => item.title === "Velocity available"),
  );
  check(
    "positive: available cadence fires",
    positive.observations.some((item) => item.title === "Cadence available"),
  );

  const negative = generateObservationResult(
    base({ recordingQuality: { ...base().recordingQuality, rating: "good" } }),
  );
  check(
    "negative: high-quality rule does not fire for non-excellent classification",
    !negative.observations.some((item) => item.title === "High recording quality"),
  );

  const unavailable = generateObservationResult(
    base({
      metrics: [
        metric("cadence", null, {
          availability: "withheld",
          confidence: "Unavailable",
          reasonCode: "foot_events_unreliable",
        }),
      ],
    }),
  );
  check(
    "unavailable metric: produces an explicit unavailable observation",
    unavailable.observations.some(
      (item) => item.title === "Cadence unavailable" && item.availability === "withheld",
    ),
  );

  const low = generateObservationResult(
    base({ metrics: [metric("cadence", 4.4, { unit: "Hz", confidence: "Low" })] }),
  );
  check(
    "low confidence: remains limited and preserves Low confidence",
    low.observations.some(
      (item) => item.ruleId === "cadence.availability.v1" && item.status === "limited" && item.confidence === "Low",
    ),
  );

  const experimental = generateObservationResult(
    base({
      experimental: true,
      analysisFps: 30,
      timingClassification: "experimental",
      timingConfidence: "Low",
      metrics: [metric("cadence", 4.4, { unit: "Hz", confidence: "Low", experimental: true })],
    }),
  );
  check(
    "experimental data: is labeled experimental",
    experimental.observations.some((item) => item.experimental && item.status === "experimental"),
  );

  const ruleOutput = (title, confidence, directness, dedupeKey, conflictKey) => ({
    title,
    summary: `${title} summary`,
    status: "supported",
    confidence,
    severity: "Informational",
    evidence: [
      {
        metric: "test_metric",
        value: 1,
        unit: "",
        confidence,
        source: `test:${title}`,
        availability: "available",
        frameRange: null,
        phase: null,
        directness,
      },
    ],
    limitations: [],
    phase: null,
    side: null,
    availability: "available",
    experimental: false,
    dedupeKey,
    conflictKey,
  });
  const customRule = (ruleId, output) => ({
    ruleId,
    category: "DataQuality",
    requiredMetrics: ["test_metric"],
    enabled: true,
    version: "1",
    evaluate: () => output,
  });

  const duplicate = generateObservationResult(base(), [
    customRule("test.duplicate.high", ruleOutput("Duplicate high", "High", "direct", "same", null)),
    customRule("test.duplicate.low", ruleOutput("Duplicate low", "Low", "derived", "same", null)),
  ]);
  check("duplicate suppression: emits one observation", duplicate.observations.length === 1);
  check(
    "duplicate suppression: trace records merge",
    duplicate.trace.some((item) => item.mergedInto === "test.duplicate.high"),
  );

  const conflict = generateObservationResult(base(), [
    customRule("test.conflict.low", ruleOutput("Low claim", "Low", "derived", "low", "claim")),
    customRule("test.conflict.high", ruleOutput("High claim", "High", "direct", "high", "claim")),
  ]);
  check(
    "conflict: higher-confidence direct evidence wins",
    conflict.observations.length === 1 && conflict.observations[0].ruleId === "test.conflict.high",
  );
  check(
    "conflict: trace records suppressed rule",
    conflict.trace.some((item) => item.suppressedBy === "test.conflict.high"),
  );

  const asymmetry = generateObservationResult(
    base({
      comparisons: [
        {
          key: "stride_length_asymmetry",
          classification: "different",
          leftValue: 2.1,
          rightValue: 2.25,
          differencePct: 6.7,
          referenceValue: null,
          unit: "m",
          confidence: "High",
          source: "test:asymmetry-v1",
          availability: "available",
          phase: "max_velocity",
          frameRange: { startFrame: 20, endFrame: 80 },
          experimental: false,
        },
      ],
    }),
  );
  const asymmetryObservation = asymmetry.observations.find(
    (item) => item.ruleId === "asymmetry.stride_length_asymmetry.v1",
  );
  check(
    "asymmetry: reports the measured difference without a cause",
    asymmetryObservation?.summary.includes("6.7%") &&
      !/weak|muscle|should|drill/i.test(asymmetryObservation.summary),
  );
  check(
    "determinism: repeated input produces byte-equivalent output",
    JSON.stringify(generateObservationResult(base())) === JSON.stringify(positive),
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (!ok) process.exit(1);
console.log("\nObservation Engine sanity checks passed.");
