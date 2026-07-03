// Runtime sanity for the overlay step-mark detector.
//
//   node scripts/steps-sanity.mjs
//
// Compiles the steps module (which reuses the pure contact helpers from the
// biomechanics FootContactDetector) to a throwaway dir and asserts: contacts are
// found at the foot's low points, indices run 1..N across both feet, the first
// mark has no previous distance while the rest carry an uncalibrated normalized
// distance, detection is deterministic, and sparse/empty input degrades to [].

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".steps-sanity-tmp");

// tsc leaves the `@/*` alias untouched in emitted JS; map it back at require time.
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  const mapped = request.startsWith("@/") ? path.join(out, request.slice(2)) : request;
  return originalResolve.call(this, mapped, ...rest);
};

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

/**
 * Synthetic overlay frames: both feet oscillate vertically (antiphase) while the
 * whole body advances horizontally, so contacts land at the low points and each
 * successive contact is at a new x (non-zero step distance).
 */
function synthFrames({ frames = 90, fps = 30, cadence = 2, amp = 0.06, base = 0.85 } = {}) {
  const mk = (x, y) => ({ x, y, visibility: 0.9 });
  const foot = (side, x, y) => ({
    [`${side}Ankle`]: mk(x, y - 0.04),
    [`${side}Heel`]: mk(x - 0.01, y - 0.01),
    [`${side}FootIndex`]: mk(x + 0.02, y),
  });
  const out = [];
  for (let i = 0; i < frames; i++) {
    const t = i / fps;
    const advance = 0.2 + 0.6 * (i / (frames - 1)); // move left→right across frame
    const ly = base + amp * Math.sin(2 * Math.PI * cadence * t);
    const ry = base + amp * Math.sin(2 * Math.PI * cadence * t + Math.PI);
    out.push({
      frame: i,
      time: t,
      landmarks: { ...foot("left", advance - 0.03, ly), ...foot("right", advance + 0.03, ry) },
      angles: {},
      centerOfMass: null,
      velocity: null,
      footContact: { left: false, right: false },
    });
  }
  return out;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  const tsconfigPath = path.join(out, "tsconfig.json");
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        outDir: out,
        rootDir: path.join(root, "src"),
        module: "commonjs",
        target: "es2022",
        skipLibCheck: true,
        esModuleInterop: true,
        strict: true,
        moduleResolution: "node",
        baseUrl: root,
        paths: { "@/*": ["src/*"] },
      },
      files: [path.join(root, "src/lib/video/steps.ts")],
    }),
  );
  execFileSync("npx", ["tsc", "-p", tsconfigPath], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
  const { detectStepMarks } = require(path.join(out, "lib/video/steps.js"));

  // (1) Empty / too-sparse input → [].
  check("empty input → []", detectStepMarks([]).length === 0);
  check("single frame → []", detectStepMarks(synthFrames({ frames: 1 })).length === 0);

  // (2) Synthetic run → several contacts on both feet.
  const marks = detectStepMarks(synthFrames());
  check(`detects multiple contacts (${marks.length})`, marks.length >= 6);
  check(
    "both feet represented",
    marks.some((m) => m.side === "left") && marks.some((m) => m.side === "right"),
  );

  // (3) Indices run 1..N in chronological order.
  check(
    "indices are sequential 1..N",
    marks.every((m, i) => m.index === i + 1) &&
      marks.every((m, i) => i === 0 || m.time >= marks[i - 1].time),
  );

  // (4) First mark has no previous distance; the rest carry a positive
  //     uncalibrated normalized distance (0 < d < 1).
  check("first mark distanceFromPrev is null", marks[0].distanceFromPrev === null);
  check(
    "later marks have positive normalized distance",
    marks.slice(1).every((m) => typeof m.distanceFromPrev === "number" && m.distanceFromPrev > 0 && m.distanceFromPrev < 1),
  );

  // (5) Marks sit near the foot's low point (base + amp region), not mid-swing.
  check(
    "contacts land near the low point of the foot",
    marks.every((m) => m.y > 0.85 - 0.06 && m.y < 0.85 + 0.06),
  );

  // (6) Determinism.
  const again = detectStepMarks(synthFrames());
  check(
    "deterministic (same frames → same marks)",
    JSON.stringify(again) === JSON.stringify(marks),
  );

  // (7) Frames with no foot landmarks → [].
  const noFeet = synthFrames().map((f) => ({ ...f, landmarks: {} }));
  check("no foot landmarks → []", detectStepMarks(noFeet).length === 0);

  console.log(ok ? "\nALL PASSED" : "\nFAILURES PRESENT");
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
