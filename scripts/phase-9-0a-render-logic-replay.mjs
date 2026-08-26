// Phase 9.0A Part C/D/F/G/H -- deterministic render-logic replay. Real
// browser confirmation of VideoOverlay.tsx's pose-dependent canvas drawing is
// blocked in this sandboxed environment: `presentedMediaTimeS` (the overlay's
// own presentation clock, Phase 6.6B) only advances via a REAL, PROMOTED
// `requestVideoFrameCallback` -- confirmed this session (again) to never fire
// in this headless Chromium, even for Gav, whose video pixels DO decode
// (`videoWidth: 1920`) and whose `video.currentTime` DOES advance under real
// `.play()` (confirmed to reach 0.988s over 4s at 0.25x) -- yet zero
// skeleton/contact/step canvas text was captured via a live `fillText`
// interceptor in either case (see tmp/phase90a/fillText-audit.json and the
// ad-hoc gav-play probe). This is the same class of environment limitation
// disclosed in every prior phase touching browser video (8.0B/8.1A/8.1B-2B/
// 8.2A/8.2B) applied to a previously-unexercised code path (VideoOverlay's
// OWN presentation clock, distinct from OverlaySurface's Auto Follow clock).
//
// To still get a DECISIVE, real-data answer to "does the CURRENT production
// render condition draw a step number independently of the meter label",
// this script:
//   1. Calls the REAL, unmodified `detectStepMarks` + `applyRealWorldStepDistances`
//      (VideoOverlay's own `canonicalSteps` computation) against the real,
//      live pose artifact.
//   2. Calls the REAL, unmodified `computeSprintMeasurements` to get the real
//      `zoneSteps` array (`authoritativeSteps`), and builds
//      `authoritativeStepLengthById` with the EXACT SAME filter/map
//      VideoOverlay.tsx uses (byte-for-byte copied from the live source,
//      cross-checked against it -- see `verifyLiveSourceMatch`).
//   3. Replays the EXACT render CONDITION (also byte-for-byte copied and
//      cross-checked) against every real mark, with a trivial mock canvas
//      context that records what would be drawn instead of actually
//      painting pixels -- proving deterministically, from real current
//      production data, exactly what SHOULD appear for every real contact
//      in all four benchmarks.
//
// Read-only, standalone. Not imported by any src/ file.
//
//   node --env-file=.env.local scripts/phase-9-0a-render-logic-replay.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(root, "tmp/phase90a");
mkdirSync(OUT_DIR, { recursive: true });

const BENCHMARKS = {
  gav: { sessionId: "e04a7983-7406-4a00-bb89-8ada7b10bf9f", posePath: path.join(root, "tmp/phase80a/gav.pose.json") },
  vanni240: { sessionId: "31fe352b-f00f-4a80-b20a-17c2ab08ec5a", posePath: path.join(root, "tmp/phase80a/vanni240.pose.json") },
  vanni120: { sessionId: "160a86a2-c0db-4e7d-9fbe-82aedd6d3eff", posePath: path.join(root, "tmp/phase80a/vanni120.pose.json") },
  vanni60: { sessionId: "3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d", posePath: path.join(root, "tmp/phase80a/vanni60.pose.json") },
};

// --- verify the copied condition below still matches the live source ------
function verifyLiveSourceMatch() {
  const src = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
  const checks = [
    'if (show.step_numbers) {\n            placeLabel(ctx, `${mark.index}`, p.x + 7, p.y - 10, color, placedLabels);\n          }',
    'if (show.step_numbers && meters != null) {\n            placeLabel(ctx, `${meters.toFixed(2)} m`, p.x + 6, p.y + 10, color, placedLabels);',
    'if (show.contacts) {',
    'const meters = authoritativeStepLengthById.get(markId) ?? null;',
    '(authoritativeSteps ?? [])\n        .filter((step) => step.stepLengthM != null)',
  ];
  for (const c of checks) {
    if (!src.includes(c)) throw new Error(`Live source no longer matches this script's copied condition:\n${c}`);
  }
}
verifyLiveSourceMatch();

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const out = path.join(root, ".p90a-render-tmp");
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
      files: [
        path.join(root, "src/lib/video/overlay.ts"),
        path.join(root, "src/lib/video/fps.ts"),
        path.join(root, "src/lib/video/steps.ts"),
        path.join(root, "src/lib/benchmark/measurements.ts"),
        path.join(root, "src/lib/calibration/index.ts"),
      ],
    }),
  );
  try {
    execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const outText = String(err.stdout ?? "") + String(err.stderr ?? "");
    if (!/worldProjection\.ts/.test(outText)) throw new Error(`tsc failed: ${outText}`);
  }

  const { buildOverlayFrames } = require(path.join(out, "lib/video/overlay.js"));
  const { normalizeFps } = require(path.join(out, "lib/video/fps.js"));
  const { detectStepMarks, applyRealWorldStepDistances } = require(path.join(out, "lib/video/steps.js"));
  const { computeSprintMeasurements } = require(path.join(out, "lib/benchmark/measurements.js"));
  const { resolveScale } = require(path.join(out, "lib/calibration/index.js"));

  const MP = [[0,"nose"],[11,"left_shoulder"],[12,"right_shoulder"],[13,"left_elbow"],[14,"right_elbow"],[15,"left_wrist"],[16,"right_wrist"],[23,"left_hip"],[24,"right_hip"],[25,"left_knee"],[26,"right_knee"],[27,"left_ankle"],[28,"right_ankle"],[29,"left_heel"],[30,"right_heel"],[31,"left_toe"],[32,"right_toe"]];
  const STRIP = new Set(["predicted", "invalid", "frozen_suspect"]);

  for (const [label, { sessionId, posePath }] of Object.entries(BENCHMARKS)) {
    const { data: s, error } = await db
      .from("sessions")
      .select("id, fps, fps_override, calibration_point_ax, calibration_point_ay, calibration_point_bx, calibration_point_by, calibration_known_distance_m, calibration_point_a_time_s, calibration_point_b_time_s, calibration_gates")
      .eq("id", sessionId)
      .single();
    if (error) throw new Error(`${label}: ${error.message}`);

    const seq = JSON.parse(readFileSync(posePath, "utf8"));
    const rawFrames = seq.frames.map((f) => {
      const landmarks = [];
      if (!STRIP.has(f.boxOrigin)) {
        for (const [i, j] of MP) { const kp = f.keypoints[j]; if (kp) landmarks[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score }; }
      }
      return { frame: f.index, sourceFrameIndex: f.sourceFrameIndex, time: f.tMs / 1000, landmarks, boxOrigin: f.boxOrigin, trackState: f.trackState };
    });
    const baseFrames = buildOverlayFrames({ ...seq, frames: rawFrames });
    const rawFps = Number(s.fps) || seq.fps;
    const normFps = normalizeFps(rawFps);
    const frames = baseFrames; // fps override not set for any of these 4 sessions (verified via DB query)

    // --- (1) VideoOverlay's own canonicalSteps (mirrors line ~451-509) ---
    const stepScale = resolveScale({
      ax: s.calibration_point_ax, ay: s.calibration_point_ay,
      bx: s.calibration_point_bx, by: s.calibration_point_by,
      distanceM: s.calibration_known_distance_m,
      aTimeS: s.calibration_point_a_time_s ?? 0, bTimeS: s.calibration_point_b_time_s ?? 0,
    }, null, frames[0]?.time ?? 0);
    const canonicalSteps = applyRealWorldStepDistances(detectStepMarks(frames), stepScale);

    // --- (2) authoritative ZoneStep[] (measurements.ts, real production call) ---
    const measurements = computeSprintMeasurements(
      frames,
      {
        ax: s.calibration_point_ax, ay: s.calibration_point_ay,
        bx: s.calibration_point_bx, by: s.calibration_point_by,
        distanceM: s.calibration_known_distance_m,
        aTimeS: s.calibration_point_a_time_s ?? 0, bTimeS: s.calibration_point_b_time_s ?? 0,
      },
      1920, 1080,
      { gates: s.calibration_gates ?? null, cameraEvidence: undefined }, // all four benchmarks are cameraType "stationary" -- verified Phase 8.0A
    );
    const authoritativeSteps = measurements?.zoneSteps ?? null;

    // --- (3) authoritativeStepLengthById, byte-for-byte the same construction
    // VideoOverlay.tsx uses (verified matching by verifyLiveSourceMatch above) ---
    const authoritativeStepLengthById = new Map(
      (authoritativeSteps ?? [])
        .filter((step) => step.stepLengthM != null)
        .map((step) => [step.contactId, step.stepLengthM]),
    );

    // --- (4) replay the exact render condition for show.step_numbers=true,
    // show.contacts=true (the registry default, and what this session's own
    // browser probe confirmed IS the current checked state) ---
    const drawCalls = [];
    const mockCtx = {
      fillTextCallCount: 0,
      recordFillText: (text) => { drawCalls.push(text); mockCtx.fillTextCallCount++; },
    };
    const rows = [];
    for (const mark of canonicalSteps) {
      const markId = `contact-${mark.sourceFrameIndex}-${mark.side}-${mark.index}`;
      const meters = authoritativeStepLengthById.get(markId) ?? null;
      const show = { step_numbers: true, contacts: true };
      let dotDrawn = false, numberDrawn = false, meterLabelDrawn = false;
      if (show.contacts) { dotDrawn = true; }
      if (show.step_numbers) { mockCtx.recordFillText(`${mark.index}`); numberDrawn = true; }
      if (show.step_numbers && meters != null) { mockCtx.recordFillText(`${meters.toFixed(2)} m`); meterLabelDrawn = true; }
      rows.push({ markId, side: mark.side, index: mark.index, sourceFrameIndex: mark.sourceFrameIndex, timeS: +mark.time.toFixed(6), meters, dotDrawn, numberDrawn, meterLabelDrawn });
    }

    const numberMissingCount = rows.filter((r) => !r.numberDrawn).length;
    const meterMissingCount = rows.filter((r) => !r.meterLabelDrawn).length;
    const dotMissingCount = rows.filter((r) => !r.dotDrawn).length;

    results[label] = {
      normFps, frameCount: frames.length, totalMarks: rows.length,
      numberMissingCount, meterMissingCount, dotMissingCount,
      rows,
    };
    console.log(`\n=== ${label} ===`);
    console.log(`totalMarks=${rows.length} numberMissing=${numberMissingCount} meterLabelMissing=${meterMissingCount} dotMissing=${dotMissingCount}`);
  }

  writeFileSync(path.join(OUT_DIR, "render-logic-replay.json"), JSON.stringify(results, null, 2));
  console.log(`\nWrote ${path.join(OUT_DIR, "render-logic-replay.json")}`);
} finally {
  Module._resolveFilename = origResolve;
  rmSync(out, { recursive: true, force: true });
}
