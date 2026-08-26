import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const OUT = path.join(root, "tmp/phaseR3A");
mkdirSync(OUT, { recursive: true });

writeFileSync(path.join(OUT, "manual-contact-ground-truth.json"), JSON.stringify({
  methodology: "Real source-video frames decoded via SEQUENTIAL cap.read() (never CAP_PROP_POS_FRAMES/avg_frame_rate-based seeking -- explicitly avoiding the flagged prior bug class), from the same established, orientation-corrected source files Phase 7.3A/9.1A used (tmp/phase50e/sources/vanni_fly_240.mov, vanni_fly_60.mov). Full frame-by-frame manual adjudication of every candidate contact across all four COMPLETE benchmark runs was NOT performed this phase (a separate, materially larger undertaking) -- this phase instead performed REPRESENTATIVE, evidence-based adjudication targeted at: (a) the two windows the user specifically flagged (Vanni 60 startup, Vanni 240 mid-run), and (b) reuse of the already-real, already-source-adjudicated Phase 7.3A/7.3B ground truth (4 candidates, sourced from real contact sheets, SHA-256-preserved) for the remaining Vanni 240/120 candidates outside this phase's own fresh scan.",
  reusedFromPhase73A73B: {
    source: "docs/phase-7-3a-missed-contact-forensic-audit.md, docs/phase-7-3b-same-side-temporal-state-fix.md",
    entries: [
      { benchmark: "vanni240", side: "right", sourceFrameIndex: 200, timeS: 0.835, confidence: "HIGH", athleteVisible: "yes", currentlyDetected: false, adjudication: "Real contact confirmed via Phase 7.3A source contact sheets; correctly withheld today by the localization quality gate (frozen_suspect + independent_disagrees) -- intentional, not a defect." },
      { benchmark: "vanni240", side: "right", sourceFrameIndex: 443, timeS: 1.849583, confidence: "HIGH", athleteVisible: "yes", currentlyDetected: true, adjudication: "Real contact confirmed via Phase 7.3A source contact sheets; recovered by Phase 7.3B's same-side temporal-state fix; currently detected correctly." },
      { benchmark: "vanni120", side: "left", sourceFrameIndex: 178, timeS: 1.484167, confidence: "HIGH", athleteVisible: "yes", currentlyDetected: true, adjudication: "Real contact confirmed via Phase 7.3A source contact sheets; recovered by Phase 7.3B; currently detected correctly." },
      { benchmark: "vanni120", side: "left", sourceFrameIndex: 227, timeS: 1.8925, confidence: "HIGH", athleteVisible: "yes", currentlyDetected: true, adjudication: "Real contact confirmed via Phase 7.3A source contact sheets; recovered by Phase 7.3B; currently detected correctly." },
    ],
  },
  freshThisPhase: {
    vanni60Startup: {
      sourceFile: "tmp/phase50e/sources/vanni_fly_60.mov",
      contactSheet: "tmp/phaseR3A/contact-sheets/vanni60-frames-0-45-startup.png",
      frames0to44Reviewed: true,
      adjudication: "Athlete is CLEARLY, unambiguously visible and already in an active sprinting motion (mid-stride lean, legs in a running gait) at source frame 0 (t=0.000s) -- the earliest frame of the clip. This is decisive visual evidence that the source recording begins AFTER the sprint start, with the athlete already running. Confidence: HIGH that real ground-contact events occur within the first ~600ms of this clip, before AVA's first authoritative contact (frame 37, t=0.617s). Exact touchdown-frame-level adjudication (precisely which frames are true touchdowns vs. mid-air) was not resolved to sub-frame precision at the extracted thumbnail resolution -- flagged as AMBIGUOUS at the individual-frame level, HIGH at the level of 'real contacts exist in this window that AVA currently misses entirely'.",
      confidence: "HIGH (window-level: real missed contacts exist) / AMBIGUOUS (frame-level: exact touchdown frame not resolved at thumbnail resolution)",
    },
    vanni240Frame76: {
      sourceFile: "tmp/phase50e/sources/vanni_fly_240.mov",
      contactSheet: "tmp/phaseR3A/contact-sheets/vanni240-frames-65-90-around-76.png",
      confidence: "AMBIGUOUS",
      adjudication: "Athlete visible throughout; thumbnail resolution insufficient to definitively confirm/deny a distinct footfall at frame 76 versus a secondary smoothing artifact of the same physical event that produces the already-accepted frame-119 left contact. Algorithmic evidence (179ms same-side gap, physiologically implausible as a distinct full-stride interval for any human sprinter) strongly favors 'not a genuine distinct contact', but this is not visually forced to certainty at this resolution. Not counted as a confirmed production false negative.",
    },
    vanni240Frame123: {
      sourceFile: "tmp/phase50e/sources/vanni_fly_240.mov",
      contactSheet: "tmp/phaseR3A/contact-sheets/vanni240-frames-105-135-around-119-123.png",
      confidence: "AMBIGUOUS",
      adjudication: "Same limitation as frame 76. Algorithmic evidence (16.5ms gap from the already-accepted frame-119 left contact) strongly favors 'not a genuine distinct contact' (no human foot produces a second, different foot's strike 16.5ms after another strike). Not counted as a confirmed production false negative.",
    },
  },
  doNotForceAnswerPolicy: "Per this task's explicit instruction, genuinely ambiguous visual events (frame 76, frame 123 at the resolution available) are NOT called production false negatives. Only the Vanni 60 startup window and the Phase 7.3A/7.3B-established HIGH-confidence entries are counted toward the contact-recall HIGH/MEDIUM denominator in contact-recall-summary.json's qualitative findings.",
}, null, 2));
console.log("Wrote manual-contact-ground-truth.json");
