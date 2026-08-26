// Phase R1C Part K/L/M/N -- verifies the ACTUAL render path used by
// VideoOverlay.tsx (authoritativeContacts consumed directly + raw-timeline
// time remap), not just measurements.ts's own fullRunContacts field, using
// the real production functions for all 4 benchmarks.
//
//   node scripts/phase-r1c-render-path-verification.mjs
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

const BENCHMARKS = {
  gav: "tmp/phase94/gav.pose.json",
  vanni60: "tmp/phase94/vanni60.pose.json",
  vanni120: "tmp/phase94/vanni120.pose.json",
  vanni240: "tmp/phase94/vanni240.pose.json",
};

const out = path.join(root, ".r1c-render-tmp");
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
  const { applyRealWorldStepDistances } = require(path.join(out, "lib/video/steps.js"));
  const { computeSprintMeasurements } = require(path.join(out, "lib/benchmark/measurements.js"));
  const MP = [[0,"nose"],[11,"left_shoulder"],[12,"right_shoulder"],[13,"left_elbow"],[14,"right_elbow"],[15,"left_wrist"],[16,"right_wrist"],[23,"left_hip"],[24,"right_hip"],[25,"left_knee"],[26,"right_knee"],[27,"left_ankle"],[28,"right_ankle"],[29,"left_heel"],[30,"right_heel"],[31,"left_toe"],[32,"right_toe"]];

  const SESSIONS = {
    gav: { manualPoints: { ax: 0.15161721103162656, ay: 0, bx: 0.8780767601656627, by: 0, distanceM: 20, aTimeS: 0, bTimeS: 0 } },
    vanni60: { manualPoints: { ax: 0.08142732928796757, ay: 0, bx: 0.946234230546805, by: 0, distanceM: 20, aTimeS: 0, bTimeS: 0 } },
    vanni120: { manualPoints: { ax: 0.10577478682035367, ay: 0, bx: 0.9168633383365116, by: 0, distanceM: 20, aTimeS: 0, bTimeS: 0 } },
    vanni240: { manualPoints: { ax: 0.13677243885987378, ay: 0, bx: 0.8819358989140236, by: 0, distanceM: 20, aTimeS: 0, bTimeS: 0 } },
  };

  for (const [benchLabel, posePath] of Object.entries(BENCHMARKS)) {
    const seq = JSON.parse(readFileSync(path.join(root, posePath), "utf8"));
    const rawFrames0 = seq.frames.map((f) => {
      const landmarks = [];
      for (const [i, key] of MP) { const kp = f.keypoints[key]; if (kp) landmarks[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score }; }
      return { frame: f.index, sourceFrameIndex: f.sourceFrameIndex, time: f.tMs / 1000, landmarks, boxOrigin: f.boxOrigin, independentLocalizationState: f.independentLocalizationState };
    });

    // rawOverlayFrames -- page.tsx's `frames` prop to OverlayVideoPlayer: the
    // video's OWN raw timeline, NO fps override applied.
    const rawOverlayFrames = buildOverlayFrames({ ...seq, frames: rawFrames0 });

    // overlayFrames -- page.tsx's fps-normalized frames, fed to computeSprintMeasurements.
    const normFps = normalizeFps(seq.fps);
    const overlayFrames = applyFpsOverride(rawOverlayFrames, normFps);

    const m = computeSprintMeasurements(overlayFrames, SESSIONS[benchLabel].manualPoints, seq.width, seq.height, { gates: null, cameraEvidence: undefined });

    // Exact VideoOverlay.tsx Phase R1C logic under test.
    const rawTimeByFrame = new Map(rawOverlayFrames.map((f) => [f.frame, f.time]));
    let unmapped = 0;
    const stepMarks = applyRealWorldStepDistances(
      m.fullRunContacts.map((mark) => {
        const t = rawTimeByFrame.get(mark.frame);
        if (t === undefined) unmapped++;
        return { ...mark, time: t ?? mark.time };
      }),
      null,
    );

    const idOf = (c) => `contact-${c.sourceFrameIndex}-${c.side}`;
    const sciIds = new Set(m.fullRunContacts.map(idOf));
    const renderIds = new Set(stepMarks.map(idOf));
    const authOnly = [...sciIds].filter((id) => !renderIds.has(id));
    const renderOnly = [...renderIds].filter((id) => !sciIds.has(id));

    // Physical step-length label lookup (mirrors VideoOverlay.tsx's authoritativeStepLengthByFrameSide).
    const labelByFrameSide = new Map(
      m.zoneSteps.filter((s) => s.physicalStepLengthM != null).flatMap((s) => {
        const match = /^contact-(\d+)-(left|right)-\d+$/.exec(s.contactId);
        return match ? [[`${match[1]}-${match[2]}`, s.physicalStepLengthM]] : [];
      }),
    );

    const frame119Left = stepMarks.find((mk) => mk.sourceFrameIndex === 119 && mk.side === "left");
    const case1 = benchLabel === "vanni240" ? {
      renderedMarkExists: !!frame119Left,
      stepOrdinal: frame119Left?.index ?? null,
      physicalStepLengthM: labelByFrameSide.get("119-left") ?? null,
      rawTimeMapped: frame119Left ? rawTimeByFrame.get(frame119Left.frame) !== undefined : null,
      stepLengthMAggregate: m.zoneSteps.find((s) => /^contact-119-left-\d+$/.test(s.contactId))?.stepLengthM ?? null,
    } : undefined;
    const frame278Left = stepMarks.find((mk) => mk.sourceFrameIndex === 278 && mk.side === "left");
    const case2 = benchLabel === "vanni240" ? {
      renderedMarkExists: !!frame278Left,
      stepOrdinal: frame278Left?.index ?? null,
      physicalStepLengthM: labelByFrameSide.get("278-left") ?? null,
    } : undefined;

    // Duplicate-mark check.
    const dupCheck = new Set();
    let duplicates = 0;
    for (const mk of stepMarks) { const key = idOf(mk); if (dupCheck.has(key)) duplicates++; dupCheck.add(key); }

    results[benchLabel] = {
      scientificCount: m.fullRunContacts.length,
      renderCount: stepMarks.length,
      AUTHORITATIVE_ONLY: authOnly,
      RENDER_ONLY: renderOnly,
      unmappedTimeCount: unmapped,
      duplicateMarks: duplicates,
      case1,
      case2,
      zoneStepsCount: m.zoneSteps.length,
      averageStepLengthM: m.averageStepLengthM ?? null,
    };
    console.log(`${benchLabel}: sci=${m.fullRunContacts.length} render=${stepMarks.length} authOnly=${authOnly.length} renderOnly=${renderOnly.length} unmapped=${unmapped} dup=${duplicates}` + (case1 ? ` case1=${JSON.stringify(case1)} case2=${JSON.stringify(case2)}` : ""));
  }

  writeFileSync(path.join(OUT_DIR, "render-path-verification.json"), JSON.stringify(results, null, 2));
  console.log(`\nWrote ${OUT_DIR}/render-path-verification.json`);
} finally {
  Module._resolveFilename = origResolve;
  rmSync(out, { recursive: true, force: true });
}
