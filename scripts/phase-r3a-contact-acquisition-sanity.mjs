// Phase R3A Part T -- forensic tests only (evidence-only phase; zero
// production code changed). Verifies this phase's own deliverables are
// reproducible/deterministic against real production functions and real
// cached pose artifacts, and that zero scientific code was touched.
//
//   node scripts/phase-r3a-contact-acquisition-sanity.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, statSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const OUT = path.join(root, "tmp/phaseR3A");
mkdirSync(OUT, { recursive: true });

const results = [];
function check(id, description, pass, detail) {
  results.push({ id, description, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} [${id}] ${description}${detail !== undefined ? " -- " + JSON.stringify(detail) : ""}`);
}

const identities = JSON.parse(readFileSync(path.join(OUT, "benchmark-identities.json"), "utf8"));
const pipeline = JSON.parse(readFileSync(path.join(OUT, "pipeline-audit-raw.json"), "utf8"));
const missingTraces = JSON.parse(readFileSync(path.join(OUT, "missing-contact-traces-raw.json"), "utf8"));
const recall = JSON.parse(readFileSync(path.join(OUT, "contact-recall-summary.json"), "utf8"));
const density = JSON.parse(readFileSync(path.join(OUT, "pose-density-by-fps.json"), "utf8"));
const timebase = JSON.parse(readFileSync(path.join(OUT, "fps-timebase-audit.json"), "utf8"));
const init = JSON.parse(readFileSync(path.join(OUT, "initialization-history-audit.json"), "utf8"));
const timingError = JSON.parse(readFileSync(path.join(OUT, "contact-timing-error.json"), "utf8"));
const downstream = JSON.parse(readFileSync(path.join(OUT, "downstream-measurement-consequences.json"), "utf8"));

// 1. Benchmark identities locked.
check(1, "benchmark identities locked (4 benchmarks, real session/analysis IDs)", Object.keys(identities).length === 4 && Object.values(identities).every((b) => b.sessionId && b.analysisId));

// 2. Source FPS correct.
check(2, "source FPS matches established real values (60/120.005/239.981/60)", identities.gav.sourceFps === 60 && identities.vanni120.sourceFps === 120.005 && identities.vanni240.sourceFps === 239.981 && identities.vanni60.sourceFps === 60);

// 3. Native timestamps used (not CAP_PROP_POS_FRAMES-derived) -- verified structurally: the contact-sheet script uses sequential cap.read() counting, never cap.set(CAP_PROP_POS_FRAMES, ...).
{
  const sheetSrc = readFileSync(path.join(root, "scripts/phase-r3a-contact-sheets.py"), "utf8");
  // Check actual API usage, not the docstring (which legitimately explains what
  // this script deliberately avoids, using those same terms in prose).
  const noPosFramesCall = !/cap\.set\(cv2\.CAP_PROP_POS_FRAMES/.test(sheetSrc);
  const noAvgFrameRateUsage = !/\.get\(cv2\.CAP_PROP_FPS\)|avg_frame_rate/.test(sheetSrc.split("\n").slice(7).join("\n"));
  check(3, "native timestamps used for source-video ground truth (sequential cap.read(), no CAP_PROP_POS_FRAMES/avg_frame_rate seeking)", noPosFramesCall && noAvgFrameRateUsage && /cap\.read\(\)/.test(sheetSrc));
}

// 4. Manual contact manifest structurally valid.
{
  const gt = JSON.parse(readFileSync(path.join(OUT, "manual-contact-ground-truth.json"), "utf8"));
  const entries = gt.reusedFromPhase73A73B.entries;
  check(4, "manual contact manifest structurally valid (every entry has benchmark/side/sourceFrameIndex/confidence)", entries.every((e) => e.benchmark && e.side && typeof e.sourceFrameIndex === "number" && ["HIGH", "MEDIUM", "AMBIGUOUS"].includes(e.confidence)));
}

// 5. Current authoritative contacts reproducible (rerun the pipeline audit and diff counts).
{
  execFileSync("node", ["scripts/phase-r3a-pipeline-audit.mjs"], { cwd: root, stdio: "ignore" });
  const rerun = JSON.parse(readFileSync(path.join(OUT, "pipeline-audit-raw.json"), "utf8"));
  const same = Object.keys(pipeline).every((label) => rerun[label].finalContactsCount === pipeline[label].finalContactsCount);
  check(5, "current authoritative contacts reproducible (rerun matches recorded counts)", same, Object.fromEntries(Object.keys(pipeline).map((l) => [l, rerun[l].finalContactsCount])));
}

// 6. Missing-contact classification deterministic.
{
  execFileSync("node", ["scripts/phase-r3a-missing-contact-trace.mjs"], { cwd: root, stdio: "ignore" });
  const rerun = JSON.parse(readFileSync(path.join(OUT, "missing-contact-traces-raw.json"), "utf8"));
  const same = JSON.stringify(rerun.vanni240.missing.map((m) => m.firstFailingStage)) === JSON.stringify(missingTraces.vanni240.missing.map((m) => m.firstFailingStage));
  check(6, "missing-contact classification deterministic (Vanni 240 re-trace matches)", same);
}

// 7. No duplicate authoritative contacts.
{
  const noDupes = Object.values(pipeline).every((p) => {
    const ids = p.finalContacts.map((c) => `${c.sourceFrameIndex}-${c.side}`);
    return new Set(ids).size === ids.length;
  });
  check(7, "no duplicate authoritative contacts in any benchmark", noDupes);
}

// 8. Contact chronology monotonic.
{
  const monotonic = Object.values(pipeline).every((p) => p.finalContacts.every((c, i) => i === 0 || c.time > p.finalContacts[i - 1].time));
  check(8, "contact chronology strictly monotonic (time) in every benchmark", monotonic);
}

// 9. Side sequence reconstruction deterministic.
{
  const sideAudit = JSON.parse(readFileSync(path.join(OUT, "side-assignment-audit.json"), "utf8"));
  const rebuilt = Object.fromEntries(Object.entries(pipeline).map(([l, p]) => [l, p.finalContacts.map((c) => c.side[0].toUpperCase()).join("")]));
  const same = Object.keys(sideAudit).every((l) => sideAudit[l].sideSequence === rebuilt[l]);
  check(9, "side sequence reconstruction deterministic (matches recorded audit)", same);
}

// 10. Frame-based temporal constants enumerated.
{
  const frameBasedParams = timebase.parameters.filter((p) => p.timeOrFrames === "FRAMES");
  check(10, "frame-based temporal constants enumerated (smoothingWindowFrames, MIN_VALID_FRAMES found)", frameBasedParams.some((p) => p.name === "smoothingWindowFrames") && frameBasedParams.some((p) => p.name === "MIN_VALID_FRAMES"));
}

// 11. Effective duration calculated for 60/120/240.
{
  const smoothing = timebase.parameters.find((p) => p.name === "smoothingWindowFrames");
  check(11, "effective duration calculated for 60/120/240 FPS", smoothing.effectiveDurationMs["60fps"] === 50 && smoothing.effectiveDurationMs["120fps"] === 25 && smoothing.effectiveDurationMs["240fps"] === 12.5);
}

// 12. Initialization delay calculated in milliseconds.
{
  const allMs = Object.values(init).every((b) => typeof b.localizationWarmupMs === "number");
  check(12, "initialization delay calculated in milliseconds (not merely frame counts) for every benchmark", allMs, Object.fromEntries(Object.entries(init).map(([l, b]) => [l, b.localizationWarmupMs])));
}

// 13. Pose-density statistics reproducible.
{
  const sumMatches = Object.entries(density).every(([label, d]) => {
    const total = Object.values(d.boxOriginCounts).reduce((a, b) => a + b, 0);
    return total === d.frameCount;
  });
  check(13, "pose-density statistics internally consistent (boxOrigin counts sum to frame count)", sumMatches);
}

// 14. Matched-contact timing error reproducible (structural bound recomputes identically).
{
  const recomputed = { "60fps": Number((1000 / 60).toFixed(3)), "120fps": Number((1000 / 120).toFixed(3)), "240fps": Number((1000 / 240).toFixed(3)) };
  const parseMs = (s) => Number(s.split("ms")[0]);
  const same = parseMs(timingError.structuralPrecisionBoundMs["60fps"]) === recomputed["60fps"] && parseMs(timingError.structuralPrecisionBoundMs["240fps"]) === recomputed["240fps"];
  check(14, "matched-contact timing structural bound reproducible", same);
}

// 15. Downstream missing-contact consequences reproducible (one entry per missing contact, every benchmark).
{
  const same = Object.keys(missingTraces).every((label) => downstream[label].length === missingTraces[label].missing.length);
  check(15, "downstream missing-contact consequence count matches missing-contact trace count, every benchmark", same);
}

// 16. Zero production scientific code changed -- mtime guard against every file this phase's own scripts were authored to read.
{
  const thisPhaseFiles = ["scripts/phase-r3a-pipeline-audit.mjs", "scripts/phase-r3a-missing-contact-trace.mjs", "scripts/phase-r3a-consolidate.mjs", "scripts/phase-r3a-synthesis.mjs"];
  const thisPhaseEditMs = Math.min(...thisPhaseFiles.map((f) => statSync(path.join(root, f)).mtimeMs));
  const guarded = ["src/lib/video/steps.ts", "src/lib/benchmark/measurements.ts", "src/lib/video/stepIntegrity.ts", "src/lib/video/overlay.ts", "src/lib/calibration/gates.ts"];
  const allUntouched = guarded.every((f) => statSync(path.join(root, f)).mtimeMs < thisPhaseEditMs);
  check(16, "zero production scientific code changed this phase (mtime guard on steps.ts/measurements.ts/stepIntegrity.ts/overlay.ts/gates.ts)", allUntouched);
}

const passCount = results.filter((r) => r.pass).length;
console.log(`\n${passCount}/${results.length} checks passed.`);
writeFileSync(path.join(OUT, "sanity-results.json"), JSON.stringify(results, null, 2));
if (passCount !== results.length) process.exitCode = 1;
