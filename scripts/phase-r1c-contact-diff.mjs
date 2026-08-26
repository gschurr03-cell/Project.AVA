// Phase R1C Parts A/B -- full authoritative-vs-render contact-set diff for
// all 4 benchmarks, using the REAL production functions (measurements.ts's
// internal scientific stripping+buildFullRunEvents call vs. page.tsx's own
// unstripped detectStepMarks call), before any code change.
//
//   node scripts/phase-r1c-contact-diff.mjs [pre|post] [outfile]
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(root, "tmp/phaseR1C");
mkdirSync(OUT_DIR, { recursive: true });
const label = process.argv[2] ?? "pre";
const outFile = process.argv[3] ?? `${label}-fix-contact-diff.json`;

const BENCHMARKS = {
  gav: "tmp/phase94/gav.pose.json",
  vanni60: "tmp/phase94/vanni60.pose.json",
  vanni120: "tmp/phase94/vanni120.pose.json",
  vanni240: "tmp/phase94/vanni240.pose.json",
};

const out = path.join(root, ".r1c-diff-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return origResolve.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};

const results = {};

try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, strict: false, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] }, noEmitOnError: false },
      files: [path.join(root, "src/lib/video/overlay.ts"), path.join(root, "src/lib/video/fps.ts"), path.join(root, "src/lib/video/steps.ts"), path.join(root, "src/lib/benchmark/measurements.ts")],
    }),
  );
  try { execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (err) { const t = String(err.stdout ?? "") + String(err.stderr ?? ""); if (!/worldProjection\.ts/.test(t)) throw new Error(t); }

  const { buildOverlayFrames } = require(path.join(out, "lib/video/overlay.js"));
  const { applyFpsOverride, normalizeFps } = require(path.join(out, "lib/video/fps.js"));
  const { detectStepMarks } = require(path.join(out, "lib/video/steps.js"));
  const { computeSprintMeasurements } = require(path.join(out, "lib/benchmark/measurements.js"));
  const MP = [[0,"nose"],[11,"left_shoulder"],[12,"right_shoulder"],[13,"left_elbow"],[14,"right_elbow"],[15,"left_wrist"],[16,"right_wrist"],[23,"left_hip"],[24,"right_hip"],[25,"left_knee"],[26,"right_knee"],[27,"left_ankle"],[28,"right_ankle"],[29,"left_heel"],[30,"right_heel"],[31,"left_toe"],[32,"right_toe"]];

  // Fixed, real session calibration (matching prior phases' own resolved values).
  const SESSIONS = {
    gav: { manualPoints: { ax: 0.15161721103162656, ay: 0, bx: 0.8780767601656627, by: 0, distanceM: 20, aTimeS: 0, bTimeS: 0 } },
    vanni60: { manualPoints: { ax: 0.08142732928796757, ay: 0, bx: 0.946234230546805, by: 0, distanceM: 20, aTimeS: 0, bTimeS: 0 } },
    vanni120: { manualPoints: { ax: 0.10577478682035367, ay: 0, bx: 0.9168633383365116, by: 0, distanceM: 20, aTimeS: 0, bTimeS: 0 } },
    vanni240: { manualPoints: { ax: 0.13677243885987378, ay: 0, bx: 0.8819358989140236, by: 0, distanceM: 20, aTimeS: 0, bTimeS: 0 } },
  };

  for (const [benchLabel, posePath] of Object.entries(BENCHMARKS)) {
    const seq = JSON.parse(readFileSync(path.join(root, posePath), "utf8"));
    const rawFrames = seq.frames.map((f) => {
      const landmarks = [];
      for (const [i, key] of MP) { const kp = f.keypoints[key]; if (kp) landmarks[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score }; }
      return { frame: f.index, sourceFrameIndex: f.sourceFrameIndex, time: f.tMs / 1000, landmarks, boxOrigin: f.boxOrigin, independentLocalizationState: f.independentLocalizationState };
    });
    const baseFrames = buildOverlayFrames({ ...seq, frames: rawFrames });
    const normFps = normalizeFps(seq.fps);
    const overlayFrames = applyFpsOverride(baseFrames, normFps);

    const m = computeSprintMeasurements(overlayFrames, SESSIONS[benchLabel].manualPoints, seq.width, seq.height, { gates: null, cameraEvidence: undefined });

    // RENDER path -- mirrors page.tsx's CURRENT construction exactly:
    // `measurements ? measurements.fullRunContacts : detectStepMarks(overlayFrames)`.
    // Pre-fix (no `fullRunContacts` field yet): falls back to the OLD
    // independent unstripped detectStepMarks call. Post-fix: consumes the
    // authoritative field directly, matching this script's own `label` arg.
    const renderContacts = (label === "post" && m.fullRunContacts) ? m.fullRunContacts : detectStepMarks(overlayFrames);

    // SCIENTIFIC path -- computeSprintMeasurements's internal buildFullRunEvents on STRIPPED frames.
    // We recover the full-run contact list either via the new `fullRunContacts` field (post-fix)
    // or, if absent (pre-fix), by independently replicating the exact same stripping + detectStepMarks
    // call this script's own verified copy of measurements.ts performs internally (verbatim, read-only).
    let scientificContacts;
    if (m.fullRunContacts) {
      scientificContacts = m.fullRunContacts;
    } else {
      const strippedFrames = seq.frames.map((f, idx) => {
        const stripped = f.boxOrigin === "predicted" || f.boxOrigin === "invalid" || f.boxOrigin === "frozen_suspect";
        const corroborated = f.boxOrigin === "frozen_suspect" && f.independentLocalizationState === "independent_corroborated";
        const landmarks = [];
        if (!(stripped && !corroborated)) {
          for (const [i, key] of MP) { const kp = f.keypoints[key]; if (kp) landmarks[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score }; }
        }
        return { frame: f.index, sourceFrameIndex: f.sourceFrameIndex, time: f.tMs / 1000, landmarks, boxOrigin: f.boxOrigin, independentLocalizationState: f.independentLocalizationState };
      });
      const strippedOverlayFrames = applyFpsOverride(buildOverlayFrames({ ...seq, frames: strippedFrames }), normFps);
      scientificContacts = detectStepMarks(strippedOverlayFrames);
    }

    const idOf = (c) => `contact-${c.sourceFrameIndex}-${c.side}`;
    const sciIds = new Set(scientificContacts.map(idOf));
    const renIds = new Set(renderContacts.map(idOf));
    const authoritativeOnly = [...sciIds].filter((id) => !renIds.has(id));
    const renderOnly = [...renIds].filter((id) => !sciIds.has(id));
    const both = [...sciIds].filter((id) => renIds.has(id));

    results[benchLabel] = {
      scientificContactCount: scientificContacts.length,
      renderContactCount: renderContacts.length,
      scientificIdentities: [...sciIds],
      renderIdentities: [...renIds],
      AUTHORITATIVE_ONLY: authoritativeOnly,
      RENDER_ONLY: renderOnly,
      BOTH: both,
      hasFrame119Left: sciIds.has("contact-119-left") && benchLabel === "vanni240" ? { inScientific: sciIds.has("contact-119-left"), inRender: renIds.has("contact-119-left") } : undefined,
    };
    console.log(`${benchLabel}: scientific=${scientificContacts.length} render=${renderContacts.length} authOnly=${authoritativeOnly.length} renderOnly=${renderOnly.length} both=${both.length}`);
    if (authoritativeOnly.length) console.log(`  AUTHORITATIVE_ONLY: ${JSON.stringify(authoritativeOnly)}`);
    if (renderOnly.length) console.log(`  RENDER_ONLY: ${JSON.stringify(renderOnly)}`);
  }

  writeFileSync(path.join(OUT_DIR, outFile), JSON.stringify(results, null, 2));
  console.log(`\nWrote ${OUT_DIR}/${outFile}`);
} finally {
  Module._resolveFilename = origResolve;
  rmSync(out, { recursive: true, force: true });
}
