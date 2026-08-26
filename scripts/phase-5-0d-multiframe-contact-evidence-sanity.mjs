// Phase 5.0D (Part L) — 25 deterministic tests for multi-frame contact evidence
// and lower-limb temporal continuity.
//
// Parts A-D of this phase found, against REAL production pose artifacts
// (docs/phase-5-0d-multiframe-contact-evidence.md Sections 4-7), that:
//   - partial (1-2 of 3) foot-landmark configurations are already vanishingly
//     rare (~1% of frames) because footSample() already fuses whatever subset
//     of ankle/heel/toe clears the visibility floor — the existing detector
//     does NOT require all three landmarks on one frame;
//   - the one population of near-threshold landmarks found (34-36 frames) is
//     dominated by a single, already-known MediaPipe confidence-decay tail
//     tied to a disclosed localization coast-risk event, not new touchdown
//     evidence;
//   - the ONE real, reproducible defect is `summariseContactFlight()`'s
//     missing same-foot/large-gap guard (disclosed Phase 3, now fixed).
// So most of these tests verify that the EXISTING architecture already has
// the required property (an honest "no new mechanism needed" outcome,
// consistent with this whole project's evidence-first pattern), and a
// smaller number specifically regression-test the Part J fix.
//
//   node scripts/phase-5-0d-multiframe-contact-evidence-sanity.mjs

import { execFileSync } from "node:child_process";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".p50d-mfce-sanity-tmp");

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  const mapped = request.startsWith("@/") ? path.join(out, request.slice(2)) : request;
  return originalResolve.call(this, mapped, ...rest);
};

let ok = true;
let n = 0;
const check = (label, cond) => {
  n += 1;
  console.log(`${cond ? "PASS" : "FAIL"} ${String(n).padStart(2, "0")}  ${label}`);
  if (!cond) ok = false;
};
const approx = (a, b, tol = 1e-6) => a != null && Number.isFinite(a) && Math.abs(a - b) <= tol;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
try {
  const tsconfigPath = path.join(out, "tsconfig.json");
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        outDir: out, rootDir: path.join(root, "src"), module: "commonjs", target: "es2022",
        skipLibCheck: true, esModuleInterop: true, strict: true, moduleResolution: "node",
        baseUrl: root, paths: { "@/*": ["src/*"] },
      },
      files: [
        path.join(root, "src/lib/video/overlay.ts"),
        path.join(root, "src/lib/video/steps.ts"),
        path.join(root, "src/lib/video/contacts.ts"),
        path.join(root, "src/lib/video/events.ts"),
        path.join(root, "src/lib/video/stepIntegrity.ts"),
        path.join(root, "src/lib/biomechanics/events/FootContactDetector.ts"),
      ],
    }),
  );
  execFileSync("npx", ["tsc", "-p", tsconfigPath], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });

  const { detectStepMarks } = require(path.join(out, "lib/video/steps.js"));
  const { detectContactPhases, summariseContactFlight } = require(path.join(out, "lib/video/contacts.js"));
  const { buildFullRunEvents } = require(path.join(out, "lib/video/events.js"));
  const { evaluateStepInterval } = require(path.join(out, "lib/video/stepIntegrity.js"));

  const fps = 60;
  const dt = 1 / fps;
  const kp = (y, vis = 0.9) => (y == null ? undefined : { x: 0.5, y, visibility: vis });

  // A clean, physically plausible foot-y bump (image-y grows downward: higher
  // y = lower/more-planted foot). Used as the base "one real contact" shape.
  const bump = [0.50, 0.52, 0.54, 0.565, 0.58, 0.59, 0.60, 0.60, 0.60, 0.585, 0.56, 0.54, 0.52, 0.50];

  function framesFromBump(values, side, jointSubset) {
    const joints = side === "left"
      ? { ankle: "leftAnkle", heel: "leftHeel", toe: "leftFootIndex" }
      : { ankle: "rightAnkle", heel: "rightHeel", toe: "rightFootIndex" };
    return values.map((y, i) => {
      const landmarks = {};
      if (y != null) {
        if (jointSubset.includes("ankle")) landmarks[joints.ankle] = kp(y);
        if (jointSubset.includes("heel")) landmarks[joints.heel] = kp(y);
        if (jointSubset.includes("toe")) landmarks[joints.toe] = kp(y);
      }
      return { frame: i, sourceFrameIndex: i, time: i * dt, landmarks, angles: {}, centerOfMass: null, velocity: null, footContact: { left: false, right: false } };
    });
  }

  // ---- 1-4: landmark-subset sufficiency (Part D) ----
  {
    const frames = framesFromBump(bump, "left", ["ankle", "heel", "toe"]);
    const marks = detectStepMarks(frames);
    check("1. complete three-landmark contact is detected", marks.length === 1 && marks[0].side === "left");
  }
  {
    const frames = framesFromBump(bump, "left", ["ankle", "heel"]);
    const marks = detectStepMarks(frames);
    check("2. ankle+heel partial evidence still yields a contact", marks.length === 1);
  }
  {
    const frames = framesFromBump(bump, "left", ["ankle", "toe"]);
    const marks = detectStepMarks(frames);
    check("3. ankle+toe partial evidence still yields a contact", marks.length === 1);
  }
  {
    const frames = framesFromBump(bump, "left", ["heel", "toe"]);
    const marks = detectStepMarks(frames);
    check("4. heel+toe partial evidence still yields a contact", marks.length === 1);
  }

  // ---- 5: ankle-only, no real amplitude (noise floor) -> insufficient ----
  {
    const flat = bump.map(() => 0.500 + (Math.random() - 0.5) * 0.001); // < minAmplitude (0.01)
    const frames = framesFromBump(flat, "left", ["ankle"]);
    const marks = detectStepMarks(frames);
    check("5. ankle-only evidence below the amplitude floor yields no contact", marks.length === 0);
  }

  // ---- 6-7: one joint missing on the SAME frames the others carry the peak ----
  {
    const values = bump.slice();
    const frames = framesFromBump(values, "left", ["ankle", "heel", "toe"]);
    // Drop the toe landmark for a couple of frames right at the peak, leaving ankle+heel.
    for (const i of [6, 7, 8]) delete frames[i].landmarks.leftFootIndex;
    const marks = detectStepMarks(frames);
    const baseline = detectStepMarks(framesFromBump(values, "left", ["ankle", "heel", "toe"]));
    check(
      "6. missing toe at the peak, coherent ankle+heel trajectory still finds the contact",
      marks.length === 1 && Math.abs(marks[0].time - baseline[0].time) < 2 * dt,
    );
  }
  {
    const values = bump.slice();
    const frames = framesFromBump(values, "left", ["ankle", "heel", "toe"]);
    for (const i of [6, 7, 8]) delete frames[i].landmarks.leftHeel;
    const marks = detectStepMarks(frames);
    check("7. missing heel at the peak, coherent ankle+toe trajectory still finds the contact", marks.length === 1);
  }

  // ---- 8: a real, multi-frame ALL-landmarks-missing gap spanning the true peak ----
  {
    const values = bump.map((y, i) => (i >= 5 && i <= 9 ? null : y)); // erase the whole plateau + shoulders
    const frames = framesFromBump(values, "left", ["ankle", "heel", "toe"]);
    const marks = detectStepMarks(frames);
    check("8. a long all-landmarks-missing gap spanning the true peak yields no fabricated contact", marks.length === 0);
  }

  // ---- 9: stripped/invalid localization frame carries no landmarks -> no contact from it ----
  {
    const frames = framesFromBump(bump, "left", ["ankle", "heel", "toe"]);
    // Simulate measurements.ts's boxOrigin strip gate already having run: the
    // frame at the peak is stripped to {} exactly as "predicted"/"invalid"/
    // "frozen_suspect" origins are handled upstream.
    frames[6].landmarks = {};
    frames[7].landmarks = {};
    frames[8].landmarks = {};
    const marks = detectStepMarks(frames);
    check("9. a stripped-localization frame at the peak yields no contact from that frame", marks.length === 0);
  }

  // ---- 10: contact existence can be true while GCT/flight remain unavailable ----
  {
    // A peak with only 2 frames of real amplitude either side (measurePhase
    // needs a workable band; construct a mark whose amplitude computation
    // fails by feeding detectContactPhases a mark whose frame is NOT present
    // in the tracked series at all, e.g. one just past a stripped run).
    const frames = framesFromBump(bump, "left", ["ankle", "heel", "toe"]);
    const marks = detectStepMarks(frames);
    const fakeMark = { side: "left", frame: 999, time: 999 * dt, x: 0.5, y: 0.6, index: 2, distanceFromPrev: null, distanceMetersFromPrev: null };
    const phases = detectContactPhases(frames, [...marks, fakeMark]);
    check(
      "10. contact existence (StepMark) does not require a measurable ContactPhase",
      marks.length === 1 && phases.length === 1, // the out-of-range mark has NO phase; the real one does
    );
  }

  // ---- 11-12: sub-frame touchdown/toe-off bracketing uses real source times ----
  {
    const frames = framesFromBump(bump, "left", ["ankle", "heel", "toe"]);
    const marks = detectStepMarks(frames);
    const phases = detectContactPhases(frames, marks);
    const ph = phases[0];
    check(
      "11. touchdown/toe-off are sub-frame-interpolated around the peak",
      ph.touchdownTimeS > 0 && ph.touchdownTimeS < marks[0].time && ph.toeOffTimeS > marks[0].time,
    );
    // Non-uniform frame times (simulating variable-timestamp source video):
    // touchdown/toe-off must track the SUPPLIED times, not index/fps.
    const skewedFrames = frames.map((f, i) => ({ ...f, time: f.time + (i > 6 ? 0.05 : 0) }));
    const skewedMarks = detectStepMarks(skewedFrames);
    const skewedPhases = detectContactPhases(skewedFrames, skewedMarks);
    check(
      "12. bracketing follows real (non-uniform) source timestamps, not frame index/fps",
      skewedPhases.length === 1 && skewedPhases[0].toeOffTimeS > phases[0].toeOffTimeS + 0.04,
    );
  }

  // ---- 13: no bracket available at a tracked-window boundary -> no fabricated extension ----
  {
    // Foot is already at its lowest point on the very first tracked frame and
    // rises after — boundaryAwareMaxima marks a contact at onset (Day 71), but
    // there is no frame BEFORE it to bracket touchdown from.
    const values = [0.60, 0.58, 0.56, 0.54, 0.52, 0.50];
    const frames = framesFromBump(values, "left", ["ankle", "heel", "toe"]);
    const marks = detectStepMarks(frames);
    check("13a. a real onset contact (no left bracket) is still recorded as existing", marks.length === 1 && marks[0].frame === 0);
    const phases = detectContactPhases(frames, marks);
    const ph = phases[0];
    check(
      "13b. its touchdown is not fabricated past the tracked window's own first frame",
      ph.touchdownTimeS >= frames[0].time,
    );
  }

  // ---- 14-17: summariseContactFlight same-foot / large-gap guard (Part J fix) ----
  const P = (side, td, toe) => ({ side, frame: 0, contactTimeS: (td + toe) / 2, touchdownTimeS: td, toeOffTimeS: toe, contactMs: (toe - td) * 1000, contactFrames: 4 });
  {
    // Reproduces the real, disclosed shape: two same-foot phases adjacent in
    // the supplied list (an opposite-foot contact went undetected between them).
    const seq = [P("right", 1.1952, 1.2404), P("right", 1.6084, 1.6525)]; // real vanni_fly_120 frames 148/197
    const s = summariseContactFlight(seq);
    check("14. a same-foot adjacent pair contributes no fabricated flight interval", s.flightRightMs == null);
  }
  {
    // The literal disclosed Phase 3 shape: a same-foot pair yielding an
    // implausibly short ~20ms flight if left unguarded.
    const seq = [P("left", 0.000, 0.090), P("left", 0.110, 0.200)];
    const s = summariseContactFlight(seq);
    check("15. the disclosed ~20ms same-foot fixture produces no flight value at all", s.flightLeftMs == null);
  }
  {
    // Opposite feet but an excessive gap (> 2x max plausible step duration):
    // still withheld, even though sides alternate correctly.
    const seq = [P("left", 0.00, 0.08), P("right", 2.00, 2.08)];
    const s = summariseContactFlight(seq);
    check("16. an excessively long opposite-foot gap is withheld, not reported as one flight", s.flightLeftMs == null);
  }
  {
    // Genuine, plausible opposite-foot flight: unaffected by the new guard.
    const seq = [P("left", 0.00, 0.08), P("right", 0.20, 0.28), P("left", 0.40, 0.48)];
    const s = summariseContactFlight(seq);
    check(
      "17. genuine opposite-foot flights are still computed exactly as before",
      approx(s.flightLeftMs, 120) && approx(s.flightRightMs, 120),
    );
  }

  // ---- 18: duplicate/noisy near-simultaneous candidates are deduplicated ----
  {
    const values = [0.50, 0.55, 0.599, 0.60, 0.599, 0.55, 0.50]; // one true contact with a tiny double-peak wobble
    const frames = framesFromBump(values, "left", ["ankle", "heel", "toe"]);
    const marks = detectStepMarks(frames);
    check("18. a noisy near-duplicate candidate collapses to one contact", marks.length === 1);
  }

  // ---- 19: FPS-invariance of the same-foot guard ----
  {
    for (const testFps of [60, 120, 240]) {
      const d = 1 / testFps;
      const seq = [
        { side: "right", frame: 0, contactTimeS: 10 * d, touchdownTimeS: 10 * d, toeOffTimeS: 15 * d, contactMs: 5000 * d, contactFrames: 5 },
        { side: "right", frame: 0, contactTimeS: 60 * d, touchdownTimeS: 60 * d, toeOffTimeS: 65 * d, contactMs: 5000 * d, contactFrames: 5 },
      ];
      const s = summariseContactFlight(seq);
      check(`19. same-foot guard rejects at ${testFps}fps-equivalent timing too`, s.flightRightMs == null);
    }
  }

  // ---- 20: source timestamps remain authoritative on the contact mark itself ----
  {
    const frames = framesFromBump(bump, "left", ["ankle", "heel", "toe"]).map((f, i) => ({ ...f, time: 1000 + i * dt }));
    const marks = detectStepMarks(frames);
    check("20. the contact mark's time is exactly the supplied frame time, never recomputed from index/fps", marks.length === 1 && approx(marks[0].time, frames[marks[0].frame].time, 1e-9));
  }

  // ---- 21: cadence expectation alone cannot fabricate a contact ----
  {
    // A perfectly regular ~180ms cadence pattern with one interior window
    // wiped clean of all landmark evidence: no contact may appear there even
    // though the surrounding rhythm "predicts" one should exist.
    const period = 12; // frames
    const values = [];
    for (let i = 0; i < 48; i++) {
      const phase = i % period;
      values.push(phase < 5 ? 0.50 + phase * 0.02 : 0.50 + (period - phase) * 0.02);
    }
    for (let i = 24; i < 36; i++) values[i] = null; // erase one whole expected-contact window
    const frames = framesFromBump(values, "right", ["ankle", "heel", "toe"]);
    const marks = detectStepMarks(frames);
    const inGap = marks.some((m) => m.frame >= 24 && m.frame < 36);
    check("21. no contact is fabricated inside a real evidence gap merely because cadence predicts one", !inGap);
  }

  // ---- 22: a clean, fully-alternating sequence is byte-identical under the fix ----
  {
    const seq = [P("left", 0.00, 0.09), P("right", 0.20, 0.28), P("left", 0.40, 0.49), P("right", 0.60, 0.68)];
    const s = summariseContactFlight(seq);
    check(
      "22. a clean alternating sequence (Gav-shaped) is unaffected by the Part J guard",
      approx(s.flightLeftMs, 110) && approx(s.flightRightMs, 120) && s.leftContacts === 2 && s.rightContacts === 2,
    );
  }

  // ---- 23: buildFullRunEvents end-to-end still honors the fix (no crash, consistent shape) ----
  {
    const frames = framesFromBump(bump, "left", ["ankle", "heel", "toe"]);
    const events = buildFullRunEvents(frames);
    check("23. buildFullRunEvents composes detectStepMarks+detectContactPhases without alteration", events.totalContacts === 1 && events.contactPhases.length === 1);
  }

  // ---- 24: stepIntegrity's own same-foot/gap guard (step LENGTH) is untouched ----
  {
    const r = evaluateStepInterval({ fromSide: "right", toSide: "right", durationS: 0.3, distanceM: 1.0 });
    check("24. stepIntegrity.ts's independent step-length guard still flags same-foot intervals", !r.valid && r.reasons.includes("foot_sequence_discontinuity"));
  }

  // ---- 25: the flight formula itself is unchanged (still touchdown[i+1] - toeoff[i]) ----
  {
    const seq = [P("left", 0.123, 0.234), P("right", 0.345, 0.456)];
    const s = summariseContactFlight(seq);
    check("25. flight formula is still exactly next-touchdown minus this-toe-off", approx(s.flightLeftMs, (0.345 - 0.234) * 1000));
  }

  console.log(ok ? `\nALL ${n} PASSED` : `\nFAILURES PRESENT (${n} total)`);
} finally {
  rmSync(out, { recursive: true, force: true });
  Module._resolveFilename = originalResolve;
}

process.exit(ok ? 0 : 1);
