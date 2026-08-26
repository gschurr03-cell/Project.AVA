// Phase R1B -- full cross-benchmark manifest of the new physicalStepLengthM/
// physicalStepLengthState fields, calling the REAL, current (post-R1B)
// production computeSprintMeasurements. Read-only.
//
//   node --env-file=.env.local scripts/phase-r1b-manifest.mjs
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(root, "tmp/phaseR1B");
mkdirSync(OUT_DIR, { recursive: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const BENCHMARKS = {
  gav: { sessionId: "e04a7983-7406-4a00-bb89-8ada7b10bf9f", posePath: "tmp/phase94/gav.pose.json" },
  vanni60: { sessionId: "3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d", posePath: "tmp/phase94/vanni60.pose.json" },
  vanni120: { sessionId: "160a86a2-c0db-4e7d-9fbe-82aedd6d3eff", posePath: "tmp/phase94/vanni120.pose.json" },
  vanni240: { sessionId: "31fe352b-f00f-4a80-b20a-17c2ab08ec5a", posePath: "tmp/phase94/vanni240.pose.json" },
};

const out = path.join(root, ".r1b-manifest-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return origResolve.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};

const manifest = {};
const crossBenchmarkSummary = {};

try {
  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, strict: false, moduleResolution: "node", baseUrl: root, paths: { "@/*": ["src/*"] }, noEmitOnError: false },
      files: [path.join(root, "src/lib/video/overlay.ts"), path.join(root, "src/lib/video/fps.ts"), path.join(root, "src/lib/benchmark/measurements.ts")],
    }),
  );
  try { execFileSync("npx", ["tsc", "-p", path.join(out, "tsconfig.json")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (err) { const t = String(err.stdout ?? "") + String(err.stderr ?? ""); if (!/worldProjection\.ts/.test(t)) throw new Error(t); }

  const { buildOverlayFrames } = require(path.join(out, "lib/video/overlay.js"));
  const { applyFpsOverride, normalizeFps } = require(path.join(out, "lib/video/fps.js"));
  const { computeSprintMeasurements } = require(path.join(out, "lib/benchmark/measurements.js"));
  const MP = [[0,"nose"],[11,"left_shoulder"],[12,"right_shoulder"],[13,"left_elbow"],[14,"right_elbow"],[15,"left_wrist"],[16,"right_wrist"],[23,"left_hip"],[24,"right_hip"],[25,"left_knee"],[26,"right_knee"],[27,"left_ankle"],[28,"right_ankle"],[29,"left_heel"],[30,"right_heel"],[31,"left_toe"],[32,"right_toe"]];

  for (const [label, cfg] of Object.entries(BENCHMARKS)) {
    const { data: s, error } = await db.from("sessions").select(
      "id, fps, fps_override, calibration_point_ax, calibration_point_ay, calibration_point_bx, calibration_point_by, calibration_known_distance_m, calibration_point_a_time_s, calibration_point_b_time_s, calibration_gates",
    ).eq("id", cfg.sessionId).single();
    if (error) throw new Error(`${label}: ${error.message}`);
    const manualPoints = { ax: s.calibration_point_ax, ay: s.calibration_point_ay, bx: s.calibration_point_bx, by: s.calibration_point_by, distanceM: s.calibration_known_distance_m, aTimeS: s.calibration_point_a_time_s ?? 0, bTimeS: s.calibration_point_b_time_s ?? 0 };

    const seq = JSON.parse(readFileSync(path.join(root, cfg.posePath), "utf8"));
    const rawFrames = seq.frames.map((f) => {
      const landmarks = [];
      for (const [i, key] of MP) { const kp = f.keypoints[key]; if (kp) landmarks[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score }; }
      return { frame: f.index, sourceFrameIndex: f.sourceFrameIndex, time: f.tMs / 1000, landmarks, boxOrigin: f.boxOrigin, independentLocalizationState: f.independentLocalizationState };
    });
    const baseFrames = buildOverlayFrames({ ...seq, frames: rawFrames });
    const rawFps = Number(s.fps) || seq.fps;
    const normFps = normalizeFps(rawFps);
    const W = seq.width, H = seq.height;
    const overlayFrames = s.fps_override && Number.isFinite(Number(s.fps_override)) ? applyFpsOverride(baseFrames, normalizeFps(Number(s.fps_override))) : applyFpsOverride(baseFrames, normFps);
    const m = computeSprintMeasurements(overlayFrames, manualPoints, W, H, { gates: s.calibration_gates ?? null, cameraEvidence: undefined });

    const rows = (m.zoneSteps ?? []).map((z) => ({
      contactId: z.contactId, stepOrdinal: z.index, side: z.side, fromSide: z.fromSide, timeS: +z.timeS.toFixed(6),
      stepLengthM: z.stepLengthM, physicalStepLengthM: z.physicalStepLengthM, physicalStepLengthState: z.physicalStepLengthState,
      renderedLabelYesNo: z.physicalStepLengthM != null ? "YES" : "NO",
      renderedValue: z.physicalStepLengthM,
    }));
    manifest[label] = rows;

    crossBenchmarkSummary[label] = {
      totalContactMarks: m.totalContacts,
      totalStepNumbers: rows.length,
      totalPhysicalStepLengths: rows.filter((r) => r.physicalStepLengthM != null).length,
      totalAggregateEligible: rows.filter((r) => r.stepLengthM != null).length,
      totalPresentationOnly: rows.filter((r) => r.physicalStepLengthState === "presentation_only").length,
      totalNoValidLength: rows.filter((r) => r.physicalStepLengthM == null).length,
      allAcceptedValuesMatchPhysical: rows.filter((r) => r.stepLengthM != null).every((r) => r.stepLengthM === r.physicalStepLengthM),
    };
    console.log(`${label}: ${JSON.stringify(crossBenchmarkSummary[label])}`);
    for (const r of rows) console.log(`  ${r.contactId} ord=${r.stepOrdinal} stepLengthM=${r.stepLengthM} physicalStepLengthM=${r.physicalStepLengthM} state=${r.physicalStepLengthState} render=${r.renderedLabelYesNo}`);
  }

  writeFileSync(path.join(OUT_DIR, "step-length-manifest.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(path.join(OUT_DIR, "cross-benchmark-summary.json"), JSON.stringify(crossBenchmarkSummary, null, 2));
  writeFileSync(path.join(OUT_DIR, "vanni-240-case1.json"), JSON.stringify(manifest.vanni240.find((r) => r.contactId === "contact-119-left-2"), null, 2));
  writeFileSync(path.join(OUT_DIR, "vanni-240-case2.json"), JSON.stringify(manifest.vanni240.find((r) => r.contactId === "contact-278-left-3"), null, 2));
  console.log(`\nWrote ${OUT_DIR}/{step-length-manifest,cross-benchmark-summary,vanni-240-case1,vanni-240-case2}.json`);
} finally {
  Module._resolveFilename = origResolve;
  rmSync(out, { recursive: true, force: true });
}
