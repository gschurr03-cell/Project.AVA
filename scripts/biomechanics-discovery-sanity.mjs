import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".discovery-sanity-tmp");
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
    files: [path.join(root, "src/lib/research/discovery/index.ts")],
  }));
  execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
  const {
    runDiscovery, discoverClusters, generateMovementFingerprints,
    serializeDiscoverySnapshot, parseDiscoverySnapshot, eliteReferenceCohortSchema,
  } = require(path.join(out, "lib/research/discovery/index.js"));
  const now = "2026-07-17T12:00:00.000Z";
  const samples = Array.from({ length: 12 }, (_, index) => {
    const groupOffset = index < 6 ? -1 : 1;
    const speed = index === 11 ? 14 : 7.5 + index * 0.2;
    return {
      analysisId: `analysis-${String(index).padStart(2, "0")}`,
      athleteId: `athlete-${index % 3}`, sessionId: `session-${index}`,
      capturedAt: now, compatibilityKey: "validated-60-compatible-v1", experimental: false,
      metrics: [
        { key: "velocity", value: speed, unit: "m/s", confidence: "high", phase: "maximum_velocity" },
        { key: "cadence", value: 2.5 + speed * 0.2, unit: "Hz", confidence: "moderate", phase: "maximum_velocity" },
        { key: "stride_length", value: 1.8 + groupOffset * 0.25 + index * 0.01, unit: "m", confidence: "high", phase: "maximum_velocity" },
      ],
    };
  });
  const result = runDiscovery(samples, now);
  check("correlation engine finds a supported exploratory relationship", result.discoveries.some((item) => item.discoveryType === "correlation"));
  check("cluster engine returns exploratory movement groups", result.discoveries.some((item) => item.discoveryType === "cluster"));
  check("outlier engine flags an uncommon compatible value", result.discoveries.some((item) => item.discoveryType === "outlier"));
  check("movement fingerprints require repeated athlete sessions", result.fingerprints.length === 3 && result.fingerprints.every((item) => item.sampleSize === 4));
  check("fingerprints include repeatability and consistency", result.fingerprints.every((item) => item.typicalMetrics.every((metric) => metric.repeatability >= 0) && item.consistencyScore != null));
  check("every discovery is experimental and validation-required", result.discoveries.every((item) => item.experimental && item.requiresValidation));
  check("every discovery preserves samples, evidence, metrics, athletes and sessions", result.discoveries.every((item) => item.sampleSize > 0 && item.evidence.length && item.metricsUsed.length && item.athletesIncluded.length && item.sessionsIncluded.length));
  check("engine is deterministic", JSON.stringify(runDiscovery(samples, now)) === JSON.stringify(result));
  check("input ordering does not change cluster membership", JSON.stringify(discoverClusters(samples, now)) === JSON.stringify(discoverClusters([...samples].reverse(), now)));
  check("insufficient samples emit no population discoveries", runDiscovery(samples.slice(0, 4), now).discoveries.length === 0);
  const incompatible = runDiscovery([...samples, { ...samples[0], analysisId: "foreign", compatibilityKey: "other" }], now);
  check("incompatible cohorts never mix", incompatible.sampleSize === samples.length && incompatible.warnings.some((item) => /incompatible/i.test(item)));
  const snapshot = serializeDiscoverySnapshot(result);
  check("versioned persistence snapshot round-trips", JSON.stringify(parseDiscoverySnapshot(snapshot)) === JSON.stringify(result));
  let corruptRejected = false;
  try { parseDiscoverySnapshot('{"snapshotVersion":"old","result":{}}'); } catch { corruptRejected = true; }
  check("invalid persisted snapshots fail closed", corruptRejected);
  check("empty input returns an explicit safe state", runDiscovery([], now).warnings.length > 0);
  check("elite cohort interface requires provenance and license", eliteReferenceCohortSchema.safeParse({
    cohortId: "elite-1", label: "Future cohort", source: "licensed source",
    consentAndLicenseReference: "agreement-1", metricSchemaVersion: "v1",
    compatibilityKey: "v1", athleteCount: 10, validated: false,
  }).success);
  check("no discovery generates advice", !JSON.stringify(result).match(/recommendation|prescription|training plan/i));
  check("standalone fingerprint generator is deterministic", JSON.stringify(generateMovementFingerprints(samples)) === JSON.stringify(result.fingerprints));
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (!ok) process.exit(1);
console.log("\\nBiomechanics Discovery Engine sanity checks passed.");

