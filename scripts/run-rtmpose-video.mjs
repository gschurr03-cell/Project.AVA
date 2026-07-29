import { spawn } from "node:child_process";
import path from "node:path";

const input = process.argv[2];
if (!input) {
  console.error("usage: npm run rtmpose:video -- <video> [--max-frames N] [--fps N]");
  process.exit(2);
}
const runner = path.join(process.cwd(), "src/lib/biomechanics/rtmpose/runtime/rtmpose_pose_runner.py");
const args = [runner, "--input", input];
for (let i = 3; i < process.argv.length; i++) {
  if (process.argv[i] === "--maxFrames") args.push("--max-frames", process.argv[++i]);
  else args.push(process.argv[i]);
}
const child = spawn(process.env.RTMPOSE_PYTHON ?? "python3", args, { stdio: "inherit" });
child.on("close", (code) => process.exit(code ?? 1));
