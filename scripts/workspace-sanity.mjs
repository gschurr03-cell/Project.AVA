import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const page = readFileSync(path.join(root, "src/app/sessions/[id]/page.tsx"), "utf8");
const actions = readFileSync(path.join(root, "src/app/sessions/actions.ts"), "utf8");
const loader = readFileSync(path.join(root, "src/lib/video/loadOverlayFrames.ts"), "utf8");
const migration = readFileSync(path.join(root, "supabase/migrations/0024_permanent_analysis_workspace.sql"), "utf8");

assert.ok(page.indexOf('title="Original Uploaded Video"') < page.indexOf('title="Interactive Overlay"'));
assert.match(page, /analysis\?\.status === "complete" && analysis\.keypoints_path/);
assert.doesNotMatch(page, /hasReadableResult/);
assert.match(page, /Analysis V\{version\.version_number\}/);
assert.match(page, /selectedAnalysisId/);
assert.match(page, /analysisVersionRows/);
assert.match(page, /\.eq\("id", selectedVersion\.id\)/);
assert.match(page, /sourceFps=\{detectedFps\}/);
assert.match(page, /analysisFps=\{analysis\?\.analysis_fps/);
assert.match(actions, /Save & create new analysis version|queueAnalysis/);
for (const action of ["updateSessionCalibration", "saveManualCalibration", "saveGateCalibration", "recomputeFromZone", "removeCalibration"]) {
  const start = actions.indexOf(`function ${action}`);
  assert.ok(start >= 0, `${action} exists`);
  assert.match(actions.slice(start, start + 5000), /await queueAnalysis\(formData\)/, `${action} queues a version`);
}
assert.match(loader, /overlayCache/);
assert.match(migration, /version_number/);
assert.match(migration, /parent_analysis_id/);
assert.match(migration, /workspace_config/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /analyses_session_version_unique/);
console.log("workspace sanity: passed");
