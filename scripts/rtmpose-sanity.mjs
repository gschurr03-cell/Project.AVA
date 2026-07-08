import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let ok = true;
const check = (label, value) => {
  console.log(`${value ? "PASS" : "FAIL"}  ${label}`);
  if (!value) ok = false;
};
const root = process.cwd();
const out = mkdtempSync(path.join(tmpdir(), "ava-rtmpose-"));
const runner = path.join(root, "src/lib/biomechanics/rtmpose/runtime/rtmpose_pose_runner.py");
execFileSync("python3", ["-c", "import ast,sys; ast.parse(open(sys.argv[1]).read())", runner]);
check("RTMPose Python runner parses", true);
execFileSync("npx", ["tsc", "src/lib/biomechanics/rtmpose/index.ts", "--outDir", out,
  "--module", "commonjs", "--target", "es2022", "--skipLibCheck", "--esModuleInterop", "--strict"],
  { cwd: root, stdio: "inherit" });
check("RTMPose TypeScript backend compiles", true);
const source = readFileSync(runner, "utf8");
check("pipeline uses YOLO person tracking", /YOLO\(.+\)[\s\S]+\.track\(/.test(source));
check("dynamic crop maps x back to original frame", /\(x1 \+ px\) \/ width/.test(source));
check("timestamps derive from source frame index", /source_index \* 1000\.0 \/ source_fps/.test(source));
const overlay = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
check("overlay exposes primary/comparison backend debug", /primary.*comparison/.test(overlay));
check("overlay exposes frame and tracking confidence", /tracking confidence/.test(overlay) && /frame \$\{frame\.frame\}/.test(overlay));
rmSync(out, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
