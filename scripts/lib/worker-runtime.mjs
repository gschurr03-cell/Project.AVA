import { accessSync, constants, mkdirSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const positiveInt = (name, fallback, min, max) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`${name} must be ${min}–${max}`);
  return value;
};

export function loadWorkerConfig(root) {
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing required worker environment: ${missing.join(", ")}`);
  const modelPath = path.resolve(
    process.env.MEDIAPIPE_POSE_MODEL ??
      path.join(root, "src/lib/biomechanics/mediapipe/runtime/models/pose_landmarker_heavy.task"),
  );
  const tempRoot = path.resolve(
    process.env.WORKER_TEMP_ROOT ?? path.join(os.tmpdir(), "ava-worker"),
  );
  const config = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    workerId: process.env.WORKER_ID ?? `${os.hostname()}-${process.pid}`,
    workerVersion: process.env.WORKER_VERSION ?? "ava-worker-1.0.0",
    modelPath,
    tempRoot,
    pollMs: positiveInt("WORKER_POLL_MS", 3000, 250, 60000),
    leaseSeconds: positiveInt("WORKER_LEASE_SECONDS", 180, 30, 900),
    heartbeatSeconds: positiveInt("WORKER_HEARTBEAT_SECONDS", 30, 5, 300),
    processingTimeoutSeconds: positiveInt("WORKER_PROCESSING_TIMEOUT_SECONDS", 900, 60, 7200),
    maxFileBytes: positiveInt("WORKER_MAX_FILE_BYTES", 536870912, 1, 2147483647),
    maxDurationSeconds: positiveInt("WORKER_MAX_DURATION_SECONDS", 60, 1, 600),
    maxSourceFrames: positiveInt("WORKER_MAX_SOURCE_FRAMES", 14400, 60, 1000000),
    healthPort: positiveInt("WORKER_HEALTH_PORT", 8080, 1, 65535),
    logLevel: process.env.WORKER_LOG_LEVEL ?? "info",
    videoBucket: process.env.VIDEO_BUCKET ?? "sprint-videos",
    poseBucket: process.env.POSE_ARTIFACTS_BUCKET ?? "pose-artifacts",
  };
  if (config.heartbeatSeconds * 2 >= config.leaseSeconds)
    throw new Error("Heartbeat interval must be less than half the lease duration.");
  accessSync(config.modelPath, constants.R_OK);
  mkdirSync(config.tempRoot, { recursive: true, mode: 0o700 });
  accessSync(config.tempRoot, constants.R_OK | constants.W_OK);
  process.env.MEDIAPIPE_POSE_MODEL = config.modelPath;
  return config;
}

export function verifyRuntime(config) {
  execFileSync(process.env.MEDIAPIPE_PYTHON ?? "python3", ["-c", "import cv2, mediapipe"], {
    stdio: "ignore",
    timeout: 30000,
  });
  return { model: config.modelPath, python: process.env.MEDIAPIPE_PYTHON ?? "python3" };
}

export function cleanupStaleTempDirs(config, maxAgeMs = 24 * 60 * 60 * 1000) {
  const now = Date.now();
  for (const entry of readdirSync(config.tempRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(/-(\d+)$/);
    if (match && now - Number(match[1]) > maxAgeMs)
      rmSync(path.join(config.tempRoot, entry.name), { recursive: true, force: true });
  }
}

export function jobTempDir(config, jobId) {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error("Invalid job id for temporary directory.");
  const dir = path.join(config.tempRoot, `${jobId}-${Date.now()}`);
  mkdirSync(dir, { recursive: false, mode: 0o700 });
  return dir;
}

export function removeJobTempDir(dir) {
  rmSync(dir, { recursive: true, force: true });
}

const SENSITIVE_LOG_KEY =
  /(authorization|cookie|url|token|secret|password|profile|api.?key|pain.?description|medical|coach.?comment|video.?path)/i;
const SENSITIVE_LOG_VALUE =
  /(bearer\s+[a-z0-9._-]+|eyJ[a-zA-Z0-9_-]{10,}\.|service_role)/i;
export function redactWorkerTelemetry(value, depth = 0) {
  if (depth > 6) return "[TRUNCATED]";
  if (typeof value === "string")
    return SENSITIVE_LOG_VALUE.test(value) ? "[REDACTED]" : value.slice(0, 1000);
  if (Array.isArray(value))
    return value.slice(0, 50).map((item) => redactWorkerTelemetry(item, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_LOG_KEY.test(key) ? "[REDACTED]" : redactWorkerTelemetry(item, depth + 1),
      ]),
    );
  return value;
}

export function structuredLog(level, message, fields = {}) {
  const safe = redactWorkerTelemetry(fields);
  process.stdout.write(
    `${JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...safe })}\n`,
  );
}

export function startHealthServer(config, state) {
  const server = createServer((req, res) => {
    const live = Date.now() - state.lastLoopAt < Math.max(30000, config.pollMs * 4);
    const ready = live && state.ready;
    if (req.url === "/live") {
      res.writeHead(live ? 200 : 503, { "content-type": "application/json" });
      res.end(JSON.stringify({ live, workerVersion: config.workerVersion }));
      return;
    }
    if (req.url === "/ready") {
      res.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
      res.end(JSON.stringify({ ready, checks: state.checks, workerVersion: config.workerVersion }));
      return;
    }
    if (req.url === "/metrics") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(state.metrics));
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(config.healthPort, "0.0.0.0");
  return server;
}
