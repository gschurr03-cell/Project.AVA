import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const out = mkdtempSync(path.join(tmpdir(), "ava-overlay-"));
const require = createRequire(import.meta.url);
let ok = true;
const check = (label, value) => {
  console.log(`${value ? "PASS" : "FAIL"}  ${label}`);
  if (!value) ok = false;
};

try {
  execFileSync("npx", ["tsc", "src/lib/video/overlayAlignment.ts", "--outDir", out,
    "--rootDir", "src", "--module", "commonjs", "--target", "es2022",
    "--skipLibCheck", "--esModuleInterop", "--strict"], { cwd: root, stdio: "inherit" });
  const alignment = require(path.join(out, "lib/video/overlayAlignment.js"));
  const frame = {
    frame: 0, time: 1, angles: {}, centerOfMass: null, velocity: null,
    footContact: { left: false, right: false },
    landmarks: { leftHip: { x: .4, y: .5 }, rightHip: { x: .5, y: .5 } },
  };
  const none = alignment.trochanterDisplayCorrection([frame], null);
  check("no marker is an exact identity correction", none.dx === 0 && none.dy === 0);
  const correction = alignment.trochanterDisplayCorrection([frame], { x: .47, y: .49, timeS: 1 });
  check("marker aligns against detected hip midpoint", Math.abs(correction.dx - .02) < 1e-9 && Math.abs(correction.dy + .01) < 1e-9);
  const original = frame.landmarks.leftHip;
  const rendered = alignment.applyDisplayCorrection(original, correction);
  check("correction returns a new display point", rendered !== original && original.x === .4);
  check("large corrections are safely clamped", alignment.trochanterDisplayCorrection([frame], { x: 1, y: 1, timeS: 1 }).dx === .04);
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
