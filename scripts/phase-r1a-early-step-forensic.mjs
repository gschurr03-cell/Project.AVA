// Phase R1A -- forensic-only trace of why early (0-10m) individual step-length
// meter values are absent while later (10-20m) ones render correctly.
//
// Calls the REAL, unmodified `computeSprintMeasurements` (measurements.ts is
// copied verbatim into a throwaway tmp dir -- src/lib/benchmark/measurements.ts
// itself is NEVER edited) with one small, purely-additive instrumentation
// patch applied only to the COPY: the return statement is extended to also
// expose `diagnosticMarks` (the full-run WorldMark array, including the
// always-computed, zone-agnostic `distanceMetersFromPrev`) and
// `diagnosticLegacyIntervals` (the exact `evaluateStepInterval` input/output
// per gapMark, including REJECTION REASONS) -- values the function already
// computes internally but does not expose in its public return type. No
// formula, condition, or threshold is changed; only two already-computed
// local variables are added to the returned object literal.
//
//   node --env-file=.env.local scripts/phase-r1a-early-step-forensic.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync, cpSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(root, "tmp/phaseR1A");
mkdirSync(OUT_DIR, { recursive: true });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const BENCHMARKS = {
  gav: { sessionId: "e04a7983-7406-4a00-bb89-8ada7b10bf9f", posePath: "tmp/phase94/gav.pose.json" },
  vanni60: { sessionId: "3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d", posePath: "tmp/phase94/vanni60.pose.json" },
  vanni120: { sessionId: "160a86a2-c0db-4e7d-9fbe-82aedd6d3eff", posePath: "tmp/phase94/vanni120.pose.json" },
  vanni240: { sessionId: "31fe352b-f00f-4a80-b20a-17c2ab08ec5a", posePath: "tmp/phase94/vanni240.pose.json" },
};

const out = path.join(root, ".r1a-forensic-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return origResolve.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};

const results = {};

try {
  // --- verify the live source still matches what this script's patch targets ---
  const liveSrc = readFileSync(path.join(root, "src/lib/benchmark/measurements.ts"), "utf8");
  const anchor = "  return {\n    timingPolicyVersion: CONSERVATIVE_TIMING_POLICY_V1,";
  if (!liveSrc.includes(anchor)) throw new Error("measurements.ts's return statement no longer matches this script's patch anchor -- re-audit before trusting this script");
  if (!liveSrc.includes("const legacyIntervalByMark = new Map(legacyIntervals.map((entry) => [entry.mark, entry]));")) {
    throw new Error("measurements.ts's legacyIntervalByMark construction no longer matches this script's assumption");
  }

  // Copy the ENTIRE src/ tree once (measurements.ts has many sibling
  // dependencies), then patch ONLY the one, small, additive return-statement
  // line in the COPY.
  cpSync(path.join(root, "src"), path.join(out, "src"), { recursive: true });
  const copiedPath = path.join(out, "src/lib/benchmark/measurements.ts");
  const copiedSrc = readFileSync(copiedPath, "utf8");
  const patched = copiedSrc.replace(
    anchor,
    "  return {\n    diagnosticMarks: marks,\n    diagnosticLegacyIntervals: legacyIntervals,\n    diagnosticGapMarks: gapMarks,\n    diagnosticZoneBounds: { minX: gateAX, maxX: gateBX },\n    timingPolicyVersion: CONSERVATIVE_TIMING_POLICY_V1,",
  );
  if (patched === copiedSrc) throw new Error("patch did not apply");
  writeFileSync(copiedPath, patched);

  writeFileSync(
    path.join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { outDir: out, rootDir: path.join(out, "src"), module: "commonjs", target: "es2022", skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, strict: false, moduleResolution: "node", baseUrl: out, paths: { "@/*": ["src/*"] }, noEmitOnError: false },
      files: [
        path.join(out, "src/lib/video/overlay.ts"),
        path.join(out, "src/lib/video/fps.ts"),
        path.join(out, "src/lib/benchmark/measurements.ts"),
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
  const { applyFpsOverride, normalizeFps } = require(path.join(out, "lib/video/fps.js"));
  const { computeSprintMeasurements } = require(path.join(out, "lib/benchmark/measurements.js"));

  const MP = [[0,"nose"],[11,"left_shoulder"],[12,"right_shoulder"],[13,"left_elbow"],[14,"right_elbow"],[15,"left_wrist"],[16,"right_wrist"],[23,"left_hip"],[24,"right_hip"],[25,"left_knee"],[26,"right_knee"],[27,"left_ankle"],[28,"right_ankle"],[29,"left_heel"],[30,"right_heel"],[31,"left_toe"],[32,"right_toe"]];

  for (const [label, cfg] of Object.entries(BENCHMARKS)) {
    const { data: s, error } = await db.from("sessions").select(
      "id, fps, fps_override, calibration_point_ax, calibration_point_ay, calibration_point_bx, calibration_point_by, calibration_known_distance_m, calibration_point_a_time_s, calibration_point_b_time_s, calibration_gates, athletes(leg_length_cm)",
    ).eq("id", cfg.sessionId).single();
    if (error) throw new Error(`${label}: ${error.message}`);
    const manualPoints = {
      ax: s.calibration_point_ax, ay: s.calibration_point_ay,
      bx: s.calibration_point_bx, by: s.calibration_point_by,
      distanceM: s.calibration_known_distance_m,
      aTimeS: s.calibration_point_a_time_s ?? 0, bTimeS: s.calibration_point_b_time_s ?? 0,
    };
    const calibrationGates = s.calibration_gates ?? null;

    const seq = JSON.parse(readFileSync(path.join(root, cfg.posePath), "utf8"));
    // loadOverlayFrames.ts's real behavior: zero pre-stripping.
    const rawFrames = seq.frames.map((f) => {
      const landmarks = [];
      for (const [i, key] of MP) { const kp = f.keypoints[key]; if (kp) landmarks[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score }; }
      return { frame: f.index, sourceFrameIndex: f.sourceFrameIndex, time: f.tMs / 1000, landmarks, boxOrigin: f.boxOrigin, independentLocalizationState: f.independentLocalizationState };
    });
    const baseFrames = buildOverlayFrames({ ...seq, frames: rawFrames });
    const rawFps = Number(s.fps) || seq.fps;
    const normFps = normalizeFps(rawFps);
    const W = seq.width, H = seq.height;
    const overlayFrames = s.fps_override && Number.isFinite(Number(s.fps_override))
      ? applyFpsOverride(baseFrames, normalizeFps(Number(s.fps_override)))
      : applyFpsOverride(baseFrames, normFps);

    const anchorOptions = { gates: calibrationGates, cameraEvidence: undefined };
    const m = computeSprintMeasurements(overlayFrames, manualPoints, W, H, anchorOptions);

    const zoneMinX = m.diagnosticZoneBounds ? Math.min(m.diagnosticZoneBounds.minX, m.diagnosticZoneBounds.maxX) : null;
    const zoneMaxX = m.diagnosticZoneBounds ? Math.max(m.diagnosticZoneBounds.minX, m.diagnosticZoneBounds.maxX) : null;
    const zoneDistanceM = m.zone?.distanceM ?? null;
    const metersPerWorldX = zoneMinX != null && zoneMaxX != null && zoneDistanceM ? zoneDistanceM / (zoneMaxX - zoneMinX) : null;

    const legacyByMarkIdx = new Map();
    (m.diagnosticLegacyIntervals ?? []).forEach((entry, i) => legacyByMarkIdx.set(i, entry));

    const stepPositionMap = (m.diagnosticGapMarks ?? []).map((mark, i) => {
      const zoneStep = m.zoneSteps?.[i];
      const distFromZoneStartM = metersPerWorldX != null ? (mark.wx - zoneMinX) * metersPerWorldX : null;
      const legacy = legacyByMarkIdx.get(i);
      const inZoneByX = zoneMinX != null && zoneMaxX != null ? mark.wx >= zoneMinX - 1e-6 && mark.wx <= zoneMaxX + 1e-6 : null;
      return {
        stepOrdinal: zoneStep?.index ?? i + 1,
        contactId: zoneStep?.contactId ?? `contact-${mark.sourceFrameIndex}-${mark.side}-?`,
        side: mark.side,
        sourceFrameIndex: mark.sourceFrameIndex,
        timeS: +mark.time.toFixed(6),
        worldX: mark.wx,
        distFromZoneStartM: distFromZoneStartM != null ? +distFromZoneStartM.toFixed(3) : null,
        in0to10m: distFromZoneStartM != null ? distFromZoneStartM >= 0 && distFromZoneStartM < 10 : null,
        in10to20m: distFromZoneStartM != null ? distFromZoneStartM >= 10 && distFromZoneStartM <= 20 : null,
        inZoneByWorldX: inZoneByX,
        distanceMetersFromPrevPhysical: mark.distanceMetersFromPrev != null ? +mark.distanceMetersFromPrev.toFixed(4) : null,
        legacyCandidateFound: !!legacy && legacy.distanceM != null,
        legacyDurationS: legacy?.mark ? null : null,
        legacyValid: legacy?.valid ?? null,
        legacyRejectReasons: legacy?.reasons ?? [],
        authoritativeStepLengthM: zoneStep?.stepLengthM ?? null,
        meterLabelWouldRender: zoneStep?.stepLengthM != null,
      };
    });

    // Duration for each legacy candidate (for reporting): recompute from
    // global marks array (matches measurements.ts's own `durationS: m.time - prev.time`).
    const globalMarks = m.diagnosticMarks ?? [];
    for (let i = 0; i < stepPositionMap.length; i++) {
      const gapMark = m.diagnosticGapMarks[i];
      const globalIdx = globalMarks.findIndex((gm) => gm === gapMark);
      const prev = globalIdx > 0 ? globalMarks[globalIdx - 1] : null;
      stepPositionMap[i].legacyDurationS = prev ? +(gapMark.time - prev.time).toFixed(4) : null;
      stepPositionMap[i].previousContactExists = !!prev;
      stepPositionMap[i].previousContactSide = prev?.side ?? null;
      stepPositionMap[i].previousContactSourceFrameIndex = prev?.sourceFrameIndex ?? null;
      stepPositionMap[i].previousContactInZoneByWorldX = prev && zoneMinX != null ? (prev.wx >= zoneMinX - 1e-6 && prev.wx <= zoneMaxX + 1e-6) : null;
    }

    results[label] = {
      sessionId: cfg.sessionId, analysisId: m.diagnosticMarks ? "computed" : null,
      frameCount: seq.frames.length, normFps,
      zone: m.zone, zoneMinX, zoneMaxX, zoneDistanceM, metersPerWorldX,
      totalContacts: m.totalContacts, validContacts: m.validContacts,
      zoneStepSummaryPresent: !!m.zoneStepSummary,
      stepPositionMap,
    };
    console.log(`\n=== ${label} ===`);
    console.log(`  totalContacts=${m.totalContacts} validContacts=${m.validContacts} zoneStepSummaryPresent=${!!m.zoneStepSummary}`);
    console.log(`  gapMarks=${stepPositionMap.length}, meterLabelWouldRender: ${stepPositionMap.filter(s=>s.meterLabelWouldRender).length}/${stepPositionMap.length}`);
    for (const row of stepPositionMap) {
      console.log(`  step ${row.stepOrdinal} (${row.contactId}) dist=${row.distFromZoneStartM}m 0-10=${row.in0to10m} 10-20=${row.in10to20m} prevExists=${row.previousContactExists} prevInZone=${row.previousContactInZoneByWorldX} dur=${row.legacyDurationS}s legacyValid=${row.legacyValid} reasons=${JSON.stringify(row.legacyRejectReasons)} meters=${row.authoritativeStepLengthM} render=${row.meterLabelWouldRender}`);
    }
  }

  writeFileSync(path.join(OUT_DIR, "step-position-map.json"), JSON.stringify(results, null, 2));
  console.log(`\nWrote ${OUT_DIR}/step-position-map.json`);
} finally {
  Module._resolveFilename = origResolve;
  rmSync(out, { recursive: true, force: true });
}
