import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const policy = JSON.parse(
  readFileSync("config/production-surface-policy.json", "utf8"),
);
const featuresSource = readFileSync("src/lib/config/features.ts", "utf8");

assert.equal(
  policy.schemaVersion,
  "ava-production-surface-policy-v1",
  "Production surface policy must be versioned.",
);
assert.ok(
  policy.unsafeBooleanFeatures.length > 0,
  "Production surface policy must enumerate unsafe features.",
);
assert.ok(
  featuresSource.includes("assertProductionSurfacePolicy(parsedFeatures)"),
  "The canonical feature loader must enforce the production policy.",
);

for (const key of policy.unsafeBooleanFeatures) {
  assert.match(
    featuresSource,
    new RegExp(`\\b${key}:`),
    `Unknown unsafe feature key: ${key}`,
  );
}

for (const [key, required] of Object.entries(policy.requiredModes)) {
  assert.match(
    featuresSource,
    new RegExp(`\\b${key}:`),
    `Unknown required mode key: ${key}`,
  );
  assert.equal(typeof required, "string");
}

console.log(
  `release surfaces sanity: passed (${policy.unsafeBooleanFeatures.length} unsafe booleans, ${Object.keys(policy.requiredModes).length} required modes)`,
);
