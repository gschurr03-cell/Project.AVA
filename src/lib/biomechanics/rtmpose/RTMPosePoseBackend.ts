import { spawn } from "node:child_process";
import path from "node:path";

import { poseSequenceSchema, type PoseSequence } from "../pose";
import type { PoseBackend, PoseEstimateOptions, VideoRef } from "../pose-backend";

const RUNNER = "src/lib/biomechanics/rtmpose/runtime/rtmpose_pose_runner.py";
const INSTALL_HINT =
  "RTMPose runtime unavailable. Install requirements-rtmpose.txt and configure RTMPOSE_CONFIG/RTMPOSE_CHECKPOINT.";

export type PythonRTMPoseOptions = {
  python?: string;
  runnerPath?: string;
  timeoutMs?: number;
};

/** Experimental YOLO → tracked crop → RTMPose backend. */
export class RTMPosePoseBackend implements PoseBackend {
  readonly name = "rtmpose";
  readonly modelVersion = "rtmpose-yolo-v1";
  private readonly python: string;
  private readonly runnerPath: string;
  private readonly timeoutMs: number;

  constructor(options: PythonRTMPoseOptions = {}) {
    this.python = options.python ?? process.env.RTMPOSE_PYTHON ?? "python3";
    this.runnerPath =
      options.runnerPath ?? process.env.RTMPOSE_RUNNER ?? path.join(process.cwd(), RUNNER);
    this.timeoutMs = options.timeoutMs ?? 300_000;
  }

  async estimate(video: VideoRef, opts: PoseEstimateOptions = {}): Promise<PoseSequence> {
    if (!video.signedUrl) throw new Error("RTMPosePoseBackend requires video.signedUrl");
    const args = [this.runnerPath, "--input", video.signedUrl];
    if (opts.fps != null) args.push("--fps", String(opts.fps));
    if (opts.maxFrames != null) args.push("--max-frames", String(opts.maxFrames));
    const stdout = await this.run(args);
    try {
      return poseSequenceSchema.parse(JSON.parse(stdout)) as PoseSequence;
    } catch (error) {
      throw new Error(`RTMPose runner returned an invalid canonical pose sequence: ${String(error)}`);
    }
  }

  private run(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.python, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`RTMPose runner timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(new Error(`${INSTALL_HINT} (${error.message})`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) return resolve(stdout);
        const detail = stderr.trim().split("\n").slice(-5).join(" ").slice(0, 700);
        reject(new Error(`${INSTALL_HINT} Runner exit ${code}: ${detail}`));
      });
    });
  }
}
