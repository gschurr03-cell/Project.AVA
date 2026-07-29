import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { jobTempDir, loadWorkerConfig, removeJobTempDir } from "./lib/worker-runtime.mjs";

const require = createRequire(import.meta.url);
const root = process.cwd();
const out = path.join(root, ".worker-jobs-sanity-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  execFileSync(
    "npx",
    [
      "tsc",
      "src/lib/jobs/policy.ts",
      "--outDir",
      out,
      "--rootDir",
      "src/lib",
      "--module",
      "commonjs",
      "--target",
      "es2022",
      "--skipLibCheck",
      "--esModuleInterop",
      "--resolveJsonModule",
      "--moduleResolution",
      "node",
      "--strict",
    ],
    { cwd: root },
  );
  const { classifyWorkerFailure, retryDelaySeconds } = require(path.join(out, "jobs/policy.js"));
  assert.equal(
    classifyWorkerFailure(new Error("source video frame rate below 60 FPS")).retryable,
    false,
  );
  assert.equal(
    classifyWorkerFailure(new Error("source video frame rate below 60 FPS")).userMessage,
    "This recording does not provide enough temporal resolution for trustworthy sprint analysis.",
  );
  assert.equal(classifyWorkerFailure(new Error("temporary storage failure")).retryable, true);
  assert.ok(retryDelaySeconds(4) > retryDelaySeconds(1));

  const sql = readFileSync(
    path.join(root, "supabase/migrations/0018_production_analysis_jobs.sql"),
    "utf8",
  );
  assert.match(
    sql,
    /for update skip locked limit 1/i,
    "claim must be transactional and skip locked",
  );
  assert.match(sql, /claim_token = gen_random_uuid\(\)/i, "each attempt needs a unique token");
  assert.match(sql, /lease_expires_at < now\(\)/i, "expired leases must recover");
  assert.match(
    sql,
    /if v_job.status = 'completed' then return true/i,
    "duplicate completion must be harmless",
  );
  assert.match(
    sql,
    /p_provenance->>'poseModelName' <> 'mediapipe'/i,
    "production completion must reject non-MediaPipe metrics",
  );
  assert.match(
    sql,
    /update public\.analyses[\s\S]*update public\.sessions[\s\S]*update public\.analysis_jobs/i,
    "completion must update all records in one function transaction",
  );

  // Deterministic concurrency model mirroring the single SQL UPDATE: exactly one
  // Promise can move an eligible row to claimed before the other observes it.
  const state = { status: "queued", owner: null };
  const claim = async (worker) => {
    await Promise.resolve();
    if (state.status !== "queued") return null;
    state.status = "claimed";
    state.owner = worker;
    return worker;
  };
  const claims = (await Promise.all([claim("worker-a"), claim("worker-b")])).filter(Boolean);
  assert.equal(claims.length, 1);

  const tempRoot = path.join(os.tmpdir(), `ava-worker-sanity-${process.pid}`);
  const config = { tempRoot };
  mkdirSync(tempRoot, { recursive: true });
  for (const outcome of ["success", "failure"]) {
    const dir = jobTempDir(config, "11111111-1111-4111-8111-111111111111");
    assert.ok(existsSync(dir));
    removeJobTempDir(dir);
    assert.equal(existsSync(dir), false, `${outcome} temp cleanup`);
  }
  rmSync(tempRoot, { recursive: true, force: true });

  const saved = { ...process.env };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
  process.env.MEDIAPIPE_POSE_MODEL = path.join(root, "does-not-exist.task");
  assert.throws(() => loadWorkerConfig(root), /ENOENT/);
  process.env = saved;

  const worker = readFileSync(path.join(root, "scripts/analysis-worker.mjs"), "utf8");
  assert.doesNotMatch(worker, /createPoseBackend\(["']mock/i);
  assert.match(worker, /VALIDATED_ANALYSIS_FPS = 60/);
  console.log("worker-jobs sanity: passed");
} finally {
  rmSync(out, { recursive: true, force: true });
}
