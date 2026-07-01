import { spawn } from "node:child_process";
import path from "node:path";

import type { PoseEstimateOptions, VideoRef } from "../pose-backend";
import type { MediaPipePoseService } from "./MediaPipePoseBackend";
import { mediaPipeResultSchema, type MediaPipePoseResult } from "./MediaPipeTypes";

const INSTALL_HINT =
  "MediaPipe runtime unavailable. Install Python dependencies: mediapipe opencv-python";

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

    const stdout = await this.spawnRunner(args);

    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      throw new Error("MediaPipe runner did not emit valid JSON");
    }
    return mediaPipeResultSchema.parse(parsed);
  }

  private spawnRunner(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      // Arg array + no shell → no injection from the (signed) URL.
      const child = spawn(this.python, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";

      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`MediaPipe runner timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));

      child.on("error", (err) => {
        clearTimeout(timer);
        // e.g. the python executable itself is missing.
        reject(new Error(`${INSTALL_HINT} (could not start "${this.python}": ${err.message})`));
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
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
