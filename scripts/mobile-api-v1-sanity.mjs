import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const api = read("src/lib/mobile/api.ts");
const migration = read("supabase/migrations/0053_mobile_vertical_slice.sql");
const routeFiles = [
  "src/app/api/mobile/v1/auth/login/route.ts",
  "src/app/api/mobile/v1/auth/refresh/route.ts",
  "src/app/api/mobile/v1/auth/logout/route.ts",
  "src/app/api/mobile/v1/athlete/route.ts",
  "src/app/api/mobile/v1/capabilities/route.ts",
  "src/app/api/mobile/v1/uploads/route.ts",
  "src/app/api/mobile/v1/uploads/[uploadId]/route.ts",
  "src/app/api/mobile/v1/uploads/[uploadId]/complete/route.ts",
  "src/app/api/mobile/v1/analyses/route.ts",
  "src/app/api/mobile/v1/analyses/[analysisId]/route.ts",
  "src/app/api/mobile/v1/analyses/[analysisId]/result/route.ts",
];
for (const file of routeFiles) assert.ok(fs.existsSync(path.join(root, file)), `${file} exists`);
assert.match(api, /authenticateMobile\(request/);
assert.match(api, /safeMobileResult/);
assert.match(api, /RESULT_NOT_ACTIVE/);
assert.match(api, /unavailableMetrics/);
assert.doesNotMatch(api, /console\.(?:log|info|error)\([^)]*(?:token|signedUrl)/i);
assert.match(migration, /athletes read their own athlete profile/);
assert.match(migration, /unique\(user_id,idempotency_key\)/);
assert.match(migration, /revoke insert, update, delete on public\.mobile_uploads/);
const upload = read(routeFiles[5]);
const uploadStatus = read(routeFiles[6]);
const completion = read(routeFiles[7]);
assert.match(completion, /storage\.from\("sprint-videos"\)\.list/);
assert.match(completion, /size !== Number\(upload\.expected_bytes\)/);
assert.match(completion, /actualBytes: upload\.actual_bytes/);
assert.match(uploadStatus, /expectedBytes: data\.expected_bytes/);
assert.doesNotMatch(uploadStatus, /contractVersion: "ava-mobile-upload-v1", \.\.\.data/);
assert.match(upload, /sameLogicalAttempt/);
assert.match(upload, /This upload attempt does not match the original video/);
assert.match(upload, /authorizeUpload\(service, String\(existing\.object_path\)\)/);
const analysis = read(routeFiles[8]);
assert.match(analysis, /mobile_analysis_requests/);
assert.match(analysis, /idempotency_key/);
const deletion = read(routeFiles[9]);
assert.match(deletion, /eq\("user_id", user\.id\)/);
assert.match(deletion, /mobile_deletion_audit/);
console.log("mobile API v1 sanity: passed");
