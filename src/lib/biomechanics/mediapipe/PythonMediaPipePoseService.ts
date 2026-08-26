import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { AnalysisProgressSnapshot, PoseEstimateOptions, VideoRef } from "../pose-backend";
import type { MediaPipePoseService } from "./MediaPipePoseBackend";
import { mediaPipeResultSchema, type MediaPipePoseResult } from "./MediaPipeTypes";

const INSTALL_HINT =
  "MediaPipe runtime unavailable. Install Python dependencies: mediapipe opencv-python";

// Day 104 (Part 8): the exact stable prefix `mediapipe_pose_runner.py`'s
// `emit_progress()` writes to stderr — parsed live as the subprocess's
// stderr stream arrives (`child.stderr.on("data", ...)` fires incrementally,
// not just once at exit), never waiting for the process to finish.
const PROGRESS_LINE_PREFIX = "AVA_PROGRESS ";

function parseProgressLine(line: string): AnalysisProgressSnapshot | null {
  if (!line.startsWith(PROGRESS_LINE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(line.slice(PROGRESS_LINE_PREFIX.length));
    if (
      (parsed.stage === "pass1" || parsed.stage === "pass2")
      && typeof parsed.framesCompleted === "number"
      && typeof parsed.totalFrames === "number"
      && typeof parsed.capturedAtMs === "number"
    ) {
      return parsed as AnalysisProgressSnapshot;
    }
  } catch {
    // A malformed/partial line (e.g. split across two stderr chunks) is
    // silently skipped — progress is best-effort telemetry, never a
    // correctness signal, so a dropped snapshot is never worth failing the
    // whole run over.
  }
  return null;
}

const DEFAULT_RUNNER = "src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py";
const DEFAULT_TIMEOUT_MS = 120_000;

export interface PythonMediaPipeOptions {
  /** Python executable (default: env `MEDIAPIPE_PYTHON` or `python3`). */
  python?: string;
  /** Absolute path to the runner script (default: cwd-relative). */
  runnerPath?: string;
  /** Hard timeout for a single inference run. */
  timeoutMs?: number;
}

/**
 * Real {@link MediaPipePoseService} that shells out to the Python MediaPipe
 * runner, parses its JSON stdout, and validates it against
 * {@link mediaPipeResultSchema}. The TypeScript build never depends on Python —
 * this only spawns a process at runtime, and any failure (missing deps, missing
 * python, bad video, invalid output) is turned into a clean, actionable error.
 */
export class PythonMediaPipePoseService implements MediaPipePoseService {
  private readonly python: string;
  private readonly runnerPath: string;
  private readonly timeoutMs: number;

  constructor(opts: PythonMediaPipeOptions = {}) {
    this.python = opts.python ?? process.env.MEDIAPIPE_PYTHON ?? "python3";
    this.runnerPath =
      opts.runnerPath ?? process.env.MEDIAPIPE_RUNNER ?? path.join(process.cwd(), DEFAULT_RUNNER);
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async run(video: VideoRef, opts: PoseEstimateOptions = {}): Promise<MediaPipePoseResult> {
    const input = video.signedUrl;
    if (!input) {
      throw new Error("PythonMediaPipePoseService requires video.signedUrl");
    }

    const args = [this.runnerPath, "--input", input];
    if (opts.fps != null) args.push("--fps", String(opts.fps));
    if (opts.maxFrames != null) args.push("--max-frames", String(opts.maxFrames));
    if (opts.travelDirection) args.push("--travel-direction", opts.travelDirection);
    if (opts.entryGate) {
      args.push("--entry-gate-x", String(opts.entryGate.x), "--entry-gate-y", String(opts.entryGate.y));
    }

    // Phase 2 (Part 11): accepted manual repairs are handed to the runner via
    // a temp file (not argv — point-pair JSON can exceed comfortable arg-
    // length limits) so it can rebuild the repaired global camera path.
    let repairsDir: string | null = null;
    if (opts.manualRepairs?.length) {
      repairsDir = mkdtempSync(path.join(tmpdir(), "ava-world-lock-repairs-"));
      const repairsFile = path.join(repairsDir, "repairs.json");
      writeFileSync(repairsFile, JSON.stringify(opts.manualRepairs));
      args.push("--repairs-file", repairsFile);
    }

    let stdout: string;
    try {
      stdout = await this.spawnRunner(args, opts.timeoutMs ?? this.timeoutMs, opts.onProgress);
    } finally {
      if (repairsDir) rmSync(repairsDir, { recursive: true, force: true });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      throw new Error("MediaPipe runner did not emit valid JSON");
    }
    return mediaPipeResultSchema.parse(parsed);
  }

  private spawnRunner(
    args: string[],
    timeoutMs: number,
    onProgress?: (snapshot: AnalysisProgressSnapshot) => void,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // Arg array + no shell → no injection from the (signed) URL.
      const child = spawn(this.python, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      // Day 104 (Part 8): a chunk boundary can split one stderr line in two —
      // buffer the trailing partial line across chunks rather than parsing
      // chunk-by-chunk directly.
      let stderrLineBuffer = "";

      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`MediaPipe runner timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk: Buffer | string) => {
        const text = chunk.toString();
        stderr += text;
        if (!onProgress) return;
        stderrLineBuffer += text;
        const lines = stderrLineBuffer.split("\n");
        stderrLineBuffer = lines.pop() ?? "";
        for (const line of lines) {
          const snapshot = parseProgressLine(line);
          if (snapshot) onProgress(snapshot);
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        // e.g. the python executable itself is missing.
        reject(new Error(`${INSTALL_HINT} (could not start "${this.python}": ${err.message})`));
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          // Day 96 audit (Part 9): surface the runner's structured stage-
          // duration line into the worker's own log stream on every run, not
          // just failures — this is the evidence a runtime profile claim
          // needs to be checked against, not just narrated.
          const durationsLine = stderr.split("\n").find((line) => line.startsWith("stage_durations "));
          if (durationsLine) {
            process.stderr.write(`[mediapipe_pose_runner] ${durationsLine}\n`);
          }
          resolve(stdout);
          return;
        }
        // The runner already prints the actionable install hint on import
        // failure; surface the tail of stderr so the real cause is visible.
        const detail = stderr.trim().split("\n").slice(-3).join(" ").slice(0, 400) || `exit ${code}`;
        reject(new Error(`MediaPipe runner failed (exit ${code}): ${detail}`));
      });
    });
  }
}
