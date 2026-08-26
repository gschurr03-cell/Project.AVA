// Phase R3A -- consolidates the raw forensic data (pipeline-audit-raw.json,
// missing-contact-traces-raw.json, real DB identities, real cross-benchmark
// startup pattern) into the full set of required tmp/phaseR3A/ deliverables.
// Read-only; writes only to tmp/phaseR3A/.
//
//   node scripts/phase-r3a-consolidate.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const OUT = path.join(root, "tmp/phaseR3A");
mkdirSync(OUT, { recursive: true });

const pipeline = JSON.parse(readFileSync(path.join(OUT, "pipeline-audit-raw.json"), "utf8"));
const missing = JSON.parse(readFileSync(path.join(OUT, "missing-contact-traces-raw.json"), "utf8"));

// --- benchmark-identities.json (Part A) ---
const identities = {
  gav: { sessionId: "e04a7983-7406-4a00-bb89-8ada7b10bf9f", analysisId: "3a148f45-02ff-492d-b9f1-790470b83c21", source: "FullSizeRender.mov", sourceFps: 60, frameCount: pipeline.gav.frameCount, durationS: pipeline.gav.durationS, calibration: "manual_confirmed, stationary, 20m", currentAuthoritativeContacts: pipeline.gav.finalContactsCount, provenance: "identities carried forward from Phase 7.3A's real database read (2026-08-07), re-verified against the Phase 9.4 fresh pose artifact (tmp/phase94/gav.pose.json) used throughout R1A-R2C this session" },
  vanni240: { sessionId: "31fe352b-f00f-4a80-b20a-17c2ab08ec5a", analysisId: "a7679326-e193-4489-bf50-735fe402ec60", source: "IMG_4557 2.mov", sourceFps: 239.981, frameCount: pipeline.vanni240.frameCount, durationS: pipeline.vanni240.durationS, calibration: "manual_confirmed, stationary, 20m", currentAuthoritativeContacts: pipeline.vanni240.finalContactsCount, provenance: "identities carried forward from Phase 9.1A's real database read (2026-08-10), re-verified against the Phase 9.4 fresh pose artifact" },
  vanni120: { sessionId: "160a86a2-c0db-4e7d-9fbe-82aedd6d3eff", analysisId: "6d9a6aba-d099-4a33-b8ea-2dd4962fe80c", source: "IMG_4556 2.mov", sourceFps: 120.005, frameCount: pipeline.vanni120.frameCount, durationS: pipeline.vanni120.durationS, calibration: "manual_confirmed, stationary, 20m", currentAuthoritativeContacts: pipeline.vanni120.finalContactsCount, provenance: "identities carried forward from Phase 7.3A's real database read, re-verified against the Phase 9.4 fresh pose artifact" },
  vanni60: { sessionId: "3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d", analysisId: "8f55936c-cf07-4c20-ba73-b662e8d24325", source: "IMG_4555 2.mov", sourceFps: 60, frameCount: pipeline.vanni60.frameCount, durationS: pipeline.vanni60.durationS, calibration: "manual_confirmed, stationary, 20m", currentAuthoritativeContacts: pipeline.vanni60.finalContactsCount, provenance: "identities carried forward from Phase 7.3A's real database read, re-verified against the Phase 9.4 fresh pose artifact" },
};
writeFileSync(path.join(OUT, "benchmark-identities.json"), JSON.stringify(identities, null, 2));

// --- fps-timebase-audit.json (Part H) ---
const timebase = {
  parameters: [
    { name: "minVisibility", value: 0.4, unit: "threshold (0-1)", timeOrFrames: "N/A (threshold, not temporal)", fpsIndependent: true },
    { name: "smoothingWindowFrames", value: 3, unit: "frames", timeOrFrames: "FRAMES", fpsIndependent: false,
      effectiveDurationMs: { "60fps": (3/60)*1000, "120fps": (3/120)*1000, "240fps": (3/240)*1000 },
      note: "Centered moving average (half=floor(3/2)=1 frame each side). At 240fps this smooths only +/-4.17ms of physical time; at 60fps it smooths +/-16.67ms -- a 4x difference in physical smoothing window purely from FPS. This can let more high-frequency noise through at high FPS (relatively less temporal averaging), a plausible contributor to the extra near-duplicate local maxima observed on Vanni 240 (frames 11, 76, 123 -- see missing-contact-traces)." },
    { name: "minSameSideSpacingMs", value: 250, unit: "milliseconds", timeOrFrames: "TIME", fpsIndependent: true, note: "Already correctly time-based -- confirmed by direct source read (src/lib/video/steps.ts): compares `time*1000 - lastMs`, both real seconds. Proven FPS-independent, not a defect." },
    { name: "minStepSpacingMs", value: 130, unit: "milliseconds", timeOrFrames: "TIME", fpsIndependent: true, note: "Same as above -- real-time comparison, proven FPS-independent." },
    { name: "minAmplitude", value: 0.01, unit: "normalized image-y range", timeOrFrames: "N/A (spatial threshold)", fpsIndependent: true },
    { name: "MIN_VALID_FRAMES", value: 3, unit: "frames (count of finite samples, not necessarily contiguous)", timeOrFrames: "FRAMES", fpsIndependent: false,
      effectiveDurationMs: { "60fps": (3/60)*1000, "120fps": (3/120)*1000, "240fps": (3/240)*1000 },
      note: "Gates whether detectSide()/detectStepMarks() runs at all for a given side/clip. Small in absolute duration at any FPS (12.5-50ms) -- not the dominant initialization bottleneck (that is the upstream box-tracker warmup, see initialization-history-audit.json)." },
  ],
  workerSideParametersObserved: [
    { name: "detector_cadence_frames", value: 8, unit: "frames", file: "src/lib/biomechanics/mediapipe/runtime/box_tracker.py", timeOrFrames: "FRAMES", fpsIndependent: false,
      effectiveDurationMs: { "60fps": (8/60)*1000, "120fps": (8/120)*1000, "240fps": (8/240)*1000 },
      note: "The full-frame detector (as opposed to lighter-weight tracking) only runs once every 8 frames. This is FRAME-COUNT based, not time-based -- its real-world cadence is 4x faster in wall-clock time at 240fps than at 60fps. This is a real, confirmed FPS-timebase asymmetry upstream of contact detection entirely, in the worker's own localization pipeline (not in scope to change this phase)." },
  ],
  conclusion: "Contact-detection's OWN spacing/de-duplication guards (minSameSideSpacingMs, minStepSpacingMs) are already correctly normalized to real time and are NOT the source of any FPS-specific behavior -- proven, not assumed. Two genuinely frame-count-based parameters exist (smoothingWindowFrames, MIN_VALID_FRAMES) but their absolute effect is small (a few to tens of ms) at any real FPS. The dominant, large-magnitude FPS-asymmetric behavior observed in this audit traces to the WORKER's box-tracker localization warmup (detector_cadence_frames and related identity/motion-confirmation thresholds), not to steps.ts's own contact algorithm.",
};
writeFileSync(path.join(OUT, "fps-timebase-audit.json"), JSON.stringify(timebase, null, 2));

// --- initialization-history-audit.json (Part I) ---
const init = {};
for (const label of Object.keys(pipeline)) {
  const p = pipeline[label];
  init[label] = {
    fps: p.fps,
    firstFrameByStage: p.firstFrameByStage,
    localizationWarmupMs: p.firstFrameByStage.firstUsableLocalization ? (p.firstFrameByStage.firstUsableLocalization.tMs) : null,
    theoreticalMinimumDetectorRequirement: "MIN_VALID_FRAMES=3 finite samples (a few to tens of ms at any real FPS) once eligible landmarks exist -- NOT the observed bottleneck.",
    observedBottleneck: "Upstream box-tracker localization state (boxOrigin) staying 'invalid' for multiple frames even where raw pose landmarks exist with high visibility -- see raw boxOrigin sequence in pose-density-by-fps.json and the visual confirmation in contact-sheets/vanni60-frames-0-45-startup.png.",
  };
}
writeFileSync(path.join(OUT, "initialization-history-audit.json"), JSON.stringify(init, null, 2));

// --- pose-density-by-fps.json (Part L) ---
const density = {};
for (const label of Object.keys(pipeline)) {
  const p = pipeline[label];
  density[label] = {
    fps: p.fps,
    frameCount: p.frameCount,
    durationS: p.durationS,
    boxOriginCounts: p.boxOriginCounts,
    independentCorroboratedCount: p.independentCorroboratedCount,
    noPoseFrames: p.noPoseCount,
    scienceEligibleFrames: p.frameCount - p.strippedEmptyCount,
    scienceIneligibleFrames: p.strippedEmptyCount,
    normalizedPerSecond: {
      sourceFramesPerSec: p.fps,
      poseAvailablePerSec: p.framesPerSecond.poseAvailablePerSec,
      scienceEligiblePerSec: p.framesPerSecond.scienceEligiblePerSec,
    },
  };
}
writeFileSync(path.join(OUT, "pose-density-by-fps.json"), JSON.stringify(density, null, 2));

// --- vanni240-missing-contact-traces.json + vanni60-startup-trace.json (Parts D/E) ---
writeFileSync(path.join(OUT, "vanni240-missing-contact-traces.json"), JSON.stringify(missing.vanni240, null, 2));
writeFileSync(path.join(OUT, "vanni60-startup-trace.json"), JSON.stringify({
  firstFrameByStage: pipeline.vanni60.firstFrameByStage,
  rawBoxOriginFrames0to40: "see tmp/phaseR3A/pose-density-by-fps.json boxOriginCounts + contact-sheets/vanni60-frames-0-45-startup.png for visual confirmation",
  interpretation: {
    stage1_sourceVideoVisibility: "Athlete is CLEARLY VISIBLE and already mid-stride at source frame 0 (t=0.000s) -- confirmed visually, contact-sheets/vanni60-frames-0-45-startup.png. This is NOT SOURCE_NOT_VISIBLE.",
    stage2_rawPoseEvidence: "Raw MediaPipe landmarks exist from frame 0, with high visibility scores at several frames well before frame 21 (e.g. frame 7 vis=0.964, frame 8 vis=0.995, frame 18 vis=0.978). This is NOT POSE_MISS.",
    stage3_localizationState: "boxOrigin is 'invalid' for ALL of frames 0-20 (21 consecutive frames, 350ms), flipping to 'detected' at frame 21 and 'tracked' by frame 27 -- this is the actual bottleneck: ATHLETE_NOT_LOCALIZED (the worker's box tracker has not yet trusted its own localization, independent of pose quality).",
    stage4_landmarkStripping: "stripUnstableLandmarks correctly removes frames 0-20 because boxOrigin='invalid' has no independent_corroborated exception (by design, matching Phase 4.2K policy) -- QUALITY_GATE behaves exactly as intended given the upstream 'invalid' classification; the defect (if any) is upstream of this gate, not in it.",
    stage5_candidateGeneration: "First raw local-maximum candidate at frame 30 (t=0.500s), 9 frames (150ms) after landmarks become eligible at frame 21 -- consistent with the natural shape of a foot trajectory reaching its lowest point, not evidence of an additional detector-side delay.",
    stage6_finalAcceptance: "Frame 30's candidate is correctly REPLACED by the deeper, closer touchdown at frame 37 (116.7ms later, within the 250ms same-side window) -- expected, correct temporal-filter behavior, not a bug.",
  },
  classification: "ATHLETE_NOT_LOCALIZED (upstream box-tracker localization warmup), NOT contact-detection algorithm, NOT MediaPipe pose failure, NOT landmark stripping policy defect, NOT contact-detector initialization history.",
  estimatedLostContactWindow: "0.000s-0.617s (37 frames / 617ms) -- given the athlete is already mid-stride at frame 0 and the first accepted contact is at 0.617s, at least one and plausibly two real early ground contacts are very likely lost in this window (not scientifically countable without further evidence -- see limitations).",
}, null, 2));

console.log("Wrote benchmark-identities.json, fps-timebase-audit.json, initialization-history-audit.json, pose-density-by-fps.json, vanni240-missing-contact-traces.json, vanni60-startup-trace.json");
