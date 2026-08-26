// Phase 8.2A Part L -- synchronized target/camera/final-scene signal export
// with annotated events. Reads the already-generated fine-trace,
// display-samples, and deep-analysis artifacts (no new production calls;
// pure data-shaping over existing evidence) and produces, per benchmark, a
// single synchronized timeline of:
//   rawTarget (athlete-anchor-derived target, pre-smoothing)
//   -> presentationCamera output (cx/cy/scale, fine, per real source frame)
//   -> display-sampled output (60Hz, what a real 60Hz screen would show)
// annotated with: deadband Y-holds (Part H), presentationState transitions,
// and top-decile display-tick jump events (Part K classification).
//
// Scope note: `displayStabilization.ts`'s "Stabilized View" wrapper corrects
// a DIFFERENT signal (the world-lock `frameToGlobalMatrix`, a few px of real
// camera micro-shake/drift -- see docs/phase-8-1b2b-display-only-stabilized-review.md)
// composed OUTSIDE the Auto Follow wrapper. It does not read or affect the
// athlete-tracking cx/cy/scale target chain exported here, and its own
// smoothness contribution was already independently measured in Phase
// 8.1B-2B (60-82% peak drift reduction, no jerk introduced). It is therefore
// out of scope for localizing THIS investigation's cx/cy/scale skippiness
// and is not re-derived here.
//
// Read-only, standalone.
//
//   node scripts/phase-8-2a-part-l-synchronized-export.mjs

import { readFileSync, writeFileSync } from "node:fs";

const OUT = "tmp/phase82a";
const BENCHMARKS = ["vanni60", "vanni120", "vanni240"];
const REPRESENTATIVE_PLAYER_WIDTH_PX = 1280;

function trimAcquisitionTransient(rows) {
  const idx = rows.findIndex((r) => r.presentationState === "following" || r.presentationState === "anticipating");
  return idx > 0 ? rows.slice(idx) : rows;
}

const summaryAll = {};

for (const label of BENCHMARKS) {
  const fineData = JSON.parse(readFileSync(`${OUT}/${label}-fine-trace.json`, "utf8"));
  const dispData = JSON.parse(readFileSync(`${OUT}/${label}-display-samples.json`, "utf8"));
  const deep = JSON.parse(readFileSync(`${OUT}/deep-analysis.json`, "utf8"))[label];

  const fineFull = fineData.fineTrace;
  const fine = trimAcquisitionTransient(fineFull);
  const disp60Full = dispData.displaySamples.rate_1.hz60;
  const disp60 = trimAcquisitionTransient(disp60Full);

  // State-transition annotations (fine timeline): index where
  // presentationState differs from the previous fine sample.
  const stateTransitions = [];
  for (let i = 1; i < fine.length; i++) {
    if (fine[i].presentationState !== fine[i - 1].presentationState) {
      stateTransitions.push({ fineIndex: i, timeS: +fine[i].timeS.toFixed(4), from: fine[i - 1].presentationState, to: fine[i].presentationState });
    }
  }

  // Deadband Y-hold annotations, reused verbatim from Part H's own
  // detection (top 5 longest, already computed and stored).
  const holdAnnotations = deep.partH_deadbandHolds.top5LongestHolds.map((h) => ({
    ...h,
    startTimeS: +fine[h.startIndex]?.timeS.toFixed(4),
    endTimeS: +fine[h.endIndex]?.timeS.toFixed(4),
  }));

  // Top-decile DISPLAY-tick jump events, reused verbatim from Part K's
  // classification (already computed: pan/zoom/both + magnitude).
  const largeJumpAnnotations = deep.partK_zoomTranslationCoupling.sampleEvents;

  // Build the synchronized row set at DISPLAY-SAMPLED (60Hz) granularity --
  // the human-relevant timeline (what actually gets shown) -- carrying the
  // raw target, presentation-camera output, and a `jerkFlag` derived from
  // whether this row lands inside a top-decile jump event.
  const largeJumpDispIndices = new Set(largeJumpAnnotations.map((e) => e.dispIndex));
  const rows = disp60.map((r, i) => ({
    dispIndex: i,
    timeS: +(r.timeS ?? r.presentedTime).toFixed(4),
    fineIndex: r.index,
    rawTargetX: +r.rawTargetCenterSourceX.toFixed(6),
    rawTargetY: +r.rawTargetCenterSourceY.toFixed(6),
    smoothedTargetX: +r.targetCenterSourceX.toFixed(6),
    smoothedTargetY: +r.targetCenterSourceY.toFixed(6),
    cameraCx: +r.cx.toFixed(6),
    cameraCy: +r.cy.toFixed(6),
    cameraScale: +r.scale.toFixed(6),
    presentationState: r.presentationState,
    largeDisplayJump: largeJumpDispIndices.has(i),
  }));

  // Localization verdict: for every annotated large display-tick jump,
  // determine whether it coincides with (a) a state transition, (b) a
  // deadband hold's release boundary, or (c) neither (pure multi-fine-frame
  // coalescing of an already-smoothly-moving target -- the dominant case
  // established by Part H/I/J/K).
  const stateTransitionFineIndices = new Set(stateTransitions.map((t) => t.fineIndex));
  const holdReleaseFineIndices = new Set(deep.partH_deadbandHolds.top5LongestHolds.map((h) => h.endIndex + 1));
  const localization = largeJumpAnnotations.map((e) => {
    const row = disp60[e.dispIndex];
    const fineSpanStart = disp60[e.dispIndex - 1]?.index ?? row.index;
    const fineSpanEnd = row.index;
    let coincidesWithStateTransition = false, coincidesWithHoldRelease = false;
    for (let fi = fineSpanStart + 1; fi <= fineSpanEnd; fi++) {
      if (stateTransitionFineIndices.has(fi)) coincidesWithStateTransition = true;
      if (holdReleaseFineIndices.has(fi)) coincidesWithHoldRelease = true;
    }
    return {
      dispIndex: e.dispIndex, deltaPx: e.deltaPx, dominant: e.dominant,
      fineSpanStart, fineSpanEnd, fineFrameSpan: fineSpanEnd - fineSpanStart,
      coincidesWithStateTransition, coincidesWithHoldRelease,
      cause: coincidesWithStateTransition ? "state_transition" : coincidesWithHoldRelease ? "deadband_release" : "ordinary_multi_frame_coalescing",
    };
  });
  const causeCounts = localization.reduce((acc, e) => { acc[e.cause] = (acc[e.cause] ?? 0) + 1; return acc; }, {});

  writeFileSync(`${OUT}/${label}-synchronized-timeline.json`, JSON.stringify({ label, rows, stateTransitions, holdAnnotations, largeJumpAnnotations, localization }, null, 2));

  summaryAll[label] = {
    rowCount: rows.length,
    stateTransitionCount: stateTransitions.length,
    holdEventCount: deep.partH_deadbandHolds.totalHoldEvents,
    largeJumpEventCount: largeJumpAnnotations.length,
    localizationCauseCounts: causeCounts,
  };
  console.log(`\n=== ${label} ===`);
  console.log("stateTransitionCount:", stateTransitions.length);
  console.log("largeJump localization cause counts:", JSON.stringify(causeCounts));
}

writeFileSync(`${OUT}/part-l-summary.json`, JSON.stringify(summaryAll, null, 2));
console.log(`\nWrote ${OUT}/part-l-summary.json and per-benchmark ${OUT}/<label>-synchronized-timeline.json`);
