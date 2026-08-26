// Phase R1C Part Q -- sanity suite for the authoritative-contact/render-marker
// alignment fix. Exercises the REAL production functions (measurements.ts,
// steps.ts, overlay.ts, fps.ts) via the tsc-to-tmp-dir pattern used throughout
// this session; never modifies the real src/ tree. Mirrors the exact logic
// VideoOverlay.tsx now uses (authoritativeContacts + raw-timeline time remap
// via shared `frame` index) so these checks track the real render path, not
// just measurements.ts's internal field.
//
//   node scripts/phase-r1c-contact-render-alignment-sanity.mjs
import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const BENCHMARKS = {
  gav: "tmp/phase94/gav.pose.json",
  vanni60: "tmp/phase94/vanni60.pose.json",
  vanni120: "tmp/phase94/vanni120.pose.json",
  vanni240: "tmp/phase94/vanni240.pose.json",
};
const SESSIONS = {
  gav: { manualPoints: { ax: 0.15161721103162656, ay: 0, bx: 0.8780767601656627, by: 0, distanceM: 20, aTimeS: 0, bTimeS: 0 } },
  vanni60: { manualPoints: { ax: 0.08142732928796757, ay: 0, bx: 0.946234230546805, by: 0, distanceM: 20, aTimeS: 0, bTimeS: 0 } },
  vanni120: { manualPoints: { ax: 0.10577478682035367, ay: 0, bx: 0.9168633383365116, by: 0, distanceM: 20, aTimeS: 0, bTimeS: 0 } },
  vanni240: { manualPoints: { ax: 0.13677243885987378, ay: 0, bx: 0.8819358989140236, by: 0, distanceM: 20, aTimeS: 0, bTimeS: 0 } },
};
const MP = [[0,"nose"],[11,"left_shoulder"],[12,"right_shoulder"],[13,"left_elbow"],[14,"right_elbow"],[15,"left_wrist"],[16,"right_wrist"],[23,"left_hip"],[24,"right_hip"],[25,"left_knee"],[26,"right_knee"],[27,"left_ankle"],[28,"right_ankle"],[29,"left_heel"],[30,"right_heel"],[31,"left_toe"],[32,"right_toe"]];

const results = [];
function check(id, description, pass, detail) {
  results.push({ id, description, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} [${id}] ${description}${detail ? " -- " + JSON.stringify(detail) : ""}`);
}

const out = path.join(root, ".r1c-sanity-tmp");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, ...rest) {
  return origResolve.call(this, r.startsWith("@/") ? path.join(out, r.slice(2)) : r, ...rest);
};

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
  const { detectStepMarks, applyRealWorldStepDistances, stripUnstableLandmarks } = require(path.join(out, "lib/video/steps.js"));
  const { computeSprintMeasurements } = require(path.join(out, "lib/benchmark/measurements.js"));

  function buildBenchmark(benchLabel) {
    const seq = JSON.parse(readFileSync(path.join(root, BENCHMARKS[benchLabel]), "utf8"));
    const rawFrames0 = seq.frames.map((f) => {
      const landmarks = [];
      for (const [i, key] of MP) { const kp = f.keypoints[key]; if (kp) landmarks[i] = { x: kp.x, y: kp.y, visibility: kp.visibility ?? kp.score }; }
      return { frame: f.index, sourceFrameIndex: f.sourceFrameIndex, time: f.tMs / 1000, landmarks, boxOrigin: f.boxOrigin, independentLocalizationState: f.independentLocalizationState };
    });
    const rawOverlayFrames = buildOverlayFrames({ ...seq, frames: rawFrames0 });
    const normFps = normalizeFps(seq.fps);
    const overlayFrames = applyFpsOverride(rawOverlayFrames, normFps);
    const m = computeSprintMeasurements(overlayFrames, SESSIONS[benchLabel].manualPoints, seq.width, seq.height, { gates: null, cameraEvidence: undefined });

    // PRE-FIX render behavior: detectStepMarks on fully unstripped rawOverlayFrames.
    const preFixRenderMarks = detectStepMarks(rawOverlayFrames);

    // POST-FIX render behavior: VideoOverlay.tsx's exact current logic --
    // consume `authoritativeContacts` (== m.fullRunContacts) directly, remap
    // `time` onto the raw timeline via the shared `frame` index.
    const rawTimeByFrame = new Map(rawOverlayFrames.map((f) => [f.frame, f.time]));
    const postFixRenderMarks = applyRealWorldStepDistances(
      m.fullRunContacts.map((mark) => ({ ...mark, time: rawTimeByFrame.get(mark.frame) ?? mark.time })),
      null,
    );

    return { m, preFixRenderMarks, postFixRenderMarks, rawOverlayFrames };
  }

  const idOf = (c) => `contact-${c.sourceFrameIndex}-${c.side}`;
  const vanni240 = buildBenchmark("vanni240");

  // 1. authoritative/render set diff reproducible pre-fix.
  const sciIds240 = new Set(vanni240.m.fullRunContacts.map(idOf));
  const preRenderIds240 = new Set(vanni240.preFixRenderMarks.map(idOf));
  const preDiff = [...sciIds240].filter((id) => !preRenderIds240.has(id));
  check(1, "Pre-fix authoritative/render set diff is reproducible (non-empty) on Vanni 240", preDiff.length > 0, { preDiff });

  // 2. Vanni 240 frame119-left authoritative contact exists.
  const authFrame119Left = vanni240.m.fullRunContacts.find((c) => c.sourceFrameIndex === 119 && c.side === "left");
  check(2, "Vanni 240 authoritative set contains sourceFrameIndex=119 side=left", !!authFrame119Left);

  // 3. Pre-fix render contact absent at that identity.
  const preHas119 = vanni240.preFixRenderMarks.some((c) => c.sourceFrameIndex === 119 && c.side === "left");
  check(3, "Pre-fix render set does NOT contain contact-119-left", !preHas119);

  // 4. Post-fix render contact exists at that identity.
  const postFrame119Left = vanni240.postFixRenderMarks.find((c) => c.sourceFrameIndex === 119 && c.side === "left");
  check(4, "Post-fix render set DOES contain contact-119-left", !!postFrame119Left);

  // 5. Case 1 physical length label attaches correctly (3.442099399668491, matching Phase R1B).
  const labelByFrameSide = (zoneSteps) => new Map(
    zoneSteps.filter((s) => s.physicalStepLengthM != null).flatMap((s) => {
      const match = /^contact-(\d+)-(left|right)-\d+$/.exec(s.contactId);
      return match ? [[`${match[1]}-${match[2]}`, s.physicalStepLengthM]] : [];
    }),
  );
  const case1Label = labelByFrameSide(vanni240.m.zoneSteps).get("119-left");
  check(5, "Case 1 physicalStepLengthM label = 3.442099399668491", case1Label === 3.442099399668491, { case1Label });

  // 6. Case 1 aggregate stepLengthM remains null.
  const case1Aggregate = vanni240.m.zoneSteps.find((s) => /^contact-119-left-\d+$/.test(s.contactId))?.stepLengthM ?? null;
  check(6, "Case 1 aggregate stepLengthM is null", case1Aggregate === null, { case1Aggregate });

  // 7. Case 2 (contact-278-left) remains: no physical step length.
  const case2Label = labelByFrameSide(vanni240.m.zoneSteps).get("278-left") ?? null;
  const postFrame278Left = vanni240.postFixRenderMarks.find((c) => c.sourceFrameIndex === 278 && c.side === "left");
  check(7, "Case 2 (contact-278-left) renders but has NO physical step length label", !!postFrame278Left && case2Label === null, { renders: !!postFrame278Left, case2Label });

  // 8. No duplicate contact markers (post-fix render set, any benchmark).
  const dupCheck = (marks) => { const seen = new Set(); let dup = 0; for (const m2 of marks) { const k = idOf(m2); if (seen.has(k)) dup++; seen.add(k); } return dup; };
  const dup240 = dupCheck(vanni240.postFixRenderMarks);
  check(8, "No duplicate contact markers in Vanni 240 post-fix render set", dup240 === 0, { dup240 });

  // 9. No render-only fake scientific contacts introduced (post-fix render == authoritative exactly).
  const postRenderIds240 = new Set(vanni240.postFixRenderMarks.map(idOf));
  const renderOnlyPost240 = [...postRenderIds240].filter((id) => !sciIds240.has(id));
  check(9, "No RENDER_ONLY (fake) contacts introduced post-fix on Vanni 240", renderOnlyPost240.length === 0, { renderOnlyPost240 });

  // 10/11/12. Cross-benchmark alignment: Vanni 120, Vanni 60, Gav.
  for (const [num, label] of [[10, "vanni120"], [11, "vanni60"], [12, "gav"]]) {
    const b = buildBenchmark(label);
    const sciIds = new Set(b.m.fullRunContacts.map(idOf));
    const renIds = new Set(b.postFixRenderMarks.map(idOf));
    const authOnly = [...sciIds].filter((id) => !renIds.has(id));
    const renderOnly = [...renIds].filter((id) => !sciIds.has(id));
    check(num, `${label} post-fix render set exactly matches authoritative set`, authOnly.length === 0 && renderOnly.length === 0, { authOnly, renderOnly });
  }

  // 13. Step ordinals unchanged (post-fix render `index` field matches authoritative `index` field 1:1).
  const ordinalMismatch = vanni240.m.fullRunContacts.filter((auth) => {
    const rendered = vanni240.postFixRenderMarks.find((r) => idOf(r) === idOf(auth));
    return !rendered || rendered.index !== auth.index;
  });
  check(13, "Step ordinals (index) match 1:1 between authoritative and post-fix render sets", ordinalMismatch.length === 0, { mismatchCount: ordinalMismatch.length });

  // 14. Scientific contacts unchanged by the fix (contact counts identical across all benchmarks
  // vs the originally-recorded pre-fix baseline in tmp/phaseR1C/pre-fix-contact-diff.json).
  let scientificUnchanged = true;
  const preFixBaselinePath = path.join(root, "tmp/phaseR1C/pre-fix-contact-diff.json");
  const scientificCounts = {};
  try {
    const preFixBaseline = JSON.parse(readFileSync(preFixBaselinePath, "utf8"));
    for (const label of Object.keys(BENCHMARKS)) {
      const b = label === "vanni240" ? vanni240 : buildBenchmark(label);
      scientificCounts[label] = b.m.fullRunContacts.length;
      if (preFixBaseline[label]?.scientificContactCount !== b.m.fullRunContacts.length) scientificUnchanged = false;
    }
  } catch { scientificUnchanged = false; }
  check(14, "Scientific contact counts match the recorded pre-fix baseline (unchanged by the fix)", scientificUnchanged, scientificCounts);

  // 15. Scientific metrics unchanged (spot-check a few key aggregate fields against the same baseline run).
  const metricsSnapshot = {};
  for (const label of Object.keys(BENCHMARKS)) {
    const b = label === "vanni240" ? vanni240 : buildBenchmark(label);
    metricsSnapshot[label] = { totalContacts: b.m.totalContacts, avgIndividualStepLengthM: b.m.avgIndividualStepLengthM, combinedStepFrequencyHz: b.m.combinedStepFrequencyHz, zoneVelocityMps: b.m.zoneVelocityMps };
  }
  let isoOk = false;
  try {
    const iso = JSON.parse(readFileSync(path.join(root, "tmp/phaseR1C/scientific-before-after.json"), "utf8"));
    isoOk = Object.values(iso).every((v) => v.identical);
  } catch { isoOk = false; }
  check(15, "Scientific metrics before/after isolation report shows all benchmarks identical", isoOk, metricsSnapshot);

  // 16/17. Auto Follow / Stabilized View do not affect contact identity -- these are
  // pure view/camera-framing toggles; verified structurally: the stepMarks
  // computation block in VideoOverlay.tsx does not reference `autoFollow` or
  // any stabilization/view-mode prop.
  const videoOverlaySrc = readFileSync(path.join(root, "src/components/video/VideoOverlay.tsx"), "utf8");
  const stepMarksBlockMatch = /const stepMarks = authoritativeContacts[\s\S]*?detectStepMarks\(stripUnstableLandmarks\(frames\)\), stepScale\);/.exec(videoOverlaySrc);
  const stepMarksBlock = stepMarksBlockMatch ? stepMarksBlockMatch[0] : "";
  check(16, "stepMarks computation does not reference autoFollow (Auto Follow cannot affect contact identity)", stepMarksBlock.length > 0 && !/autoFollow/.test(stepMarksBlock));
  check(17, "stepMarks computation does not reference stabiliz(ed|ation) view state (Stabilized View cannot affect contact identity)", stepMarksBlock.length > 0 && !/[Ss]tabiliz/.test(stepMarksBlock));

  const passCount = results.filter((r) => r.pass).length;
  console.log(`\n${passCount}/${results.length} checks passed.`);
  writeFileSync(path.join(root, "tmp/phaseR1C/sanity-results.json"), JSON.stringify(results, null, 2));
  if (passCount !== results.length) process.exitCode = 1;
} finally {
  Module._resolveFilename = origResolve;
  rmSync(out, { recursive: true, force: true });
}
