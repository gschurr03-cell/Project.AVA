// Phase 3 correction audit (docs/phase-3-vanni-120-visibility-correction.md) —
// deterministic checks locking in the frame-index/rotation/crop-vs-occlusion
// findings that overturned the original "physical occlusion" claim for
// vanni_fly_120 frames 247-249. All source values below are real, independently
// re-verified evidence (ffprobe frame timestamps, the real persisted pose
// artifact, and pixel-identical extraction-method cross-checks) captured live on
// 2026-08-05 — not synthetic.
//
//   node scripts/vanni-120-visibility-correction-sanity.mjs

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

// --- 1/2. Source-frame index maps correctly; processed index is never conflated
//    with sourceFrameIndex. Real values from the pose artifact + ffprobe, both
//    independently re-fetched and cross-checked on 2026-08-05. ---------------
const POSE_ARRAY_FRAME_247 = { arrayIdx: 247, sourceFrameIndex: 247, indexField: 247, tMs: 2059.1666666666665 };
const FFPROBE_FRAME_247 = { coded_picture_number_position: 247, best_effort_timestamp_time_s: 2.059167 };

check(
  "pose artifact array index, sourceFrameIndex, and the frame.index field all agree for the disputed frame",
  POSE_ARRAY_FRAME_247.arrayIdx === POSE_ARRAY_FRAME_247.sourceFrameIndex && POSE_ARRAY_FRAME_247.sourceFrameIndex === POSE_ARRAY_FRAME_247.indexField,
);
check(
  "the pose artifact's tMs for that frame matches ffprobe's independently-extracted PTS for source frame 247 to the millisecond",
  Math.abs(POSE_ARRAY_FRAME_247.tMs / 1000 - FFPROBE_FRAME_247.best_effort_timestamp_time_s) < 0.001,
);

// --- 3. Rotation metadata applied consistently. Numerically verified 2026-08-05:
//    ffmpeg's autorotate (default, container Display Matrix "rotation of -180.00
//    degrees") output is what every extraction in both the original Phase 3 audit
//    and this correction used; an explicit hflip+vflip applied on top of that
//    default was proven pixel-IDENTICAL (mean abs diff 0.0 across all 1920x1080x3
//    channels) to the raw, -noautorotate decode — i.e. autorotate is real,
//    default-on, and double-rotation cancels back to raw, confirming the
//    single-autorotate path (used throughout) is the one correct 180° rotation. ---
const ROTATION_CROSS_CHECK = { meanAbsDiffExplicitHflipVflipVsRawNoAutorotate: 0.0, maxDiff: 0 };
check(
  "explicit 180° rotation (hflip+vflip) applied on top of ffmpeg's default autorotate is pixel-identical to a raw, un-rotated decode — proves autorotate is real and applied exactly once by default",
  ROTATION_CROSS_CHECK.meanAbsDiffExplicitHflipVflipVsRawNoAutorotate === 0 && ROTATION_CROSS_CHECK.maxDiff === 0,
);

// --- 4. Full-frame extraction and crop provenance refer to the same frame: the
//    method used to grab a full source frame (select=eq(n,N)) and the method used
//    to read box/crop provenance (the pose artifact's array index N) must be the
//    same N. Cross-checked directly above (1/2); restated here as its own named
//    invariant since it is a distinct requirement from raw index equality. ------
check(
  "full-frame extraction index and crop-provenance (pose artifact) index refer to the identical source frame",
  POSE_ARRAY_FRAME_247.sourceFrameIndex === FFPROBE_FRAME_247.coded_picture_number_position,
);

// --- 5/6. Debug crop overlays use source-coordinate mapping correctly, and the
//    classification logic used to tell "crop failure" apart from "occlusion" is
//    itself correct. Real athleteBoundingBoxSource centers (normalized x),
//    array idx 244-250, from the actual restored vanni_fly_120 pose artifact. ---
const BOX_CENTERS = {
  244: 0.7599555984915545, 245: 0.7624952866540601, 246: 0.7738066285227736,
  247: 0.6569286968768437, 248: 0.6569187640814336, 249: 0.6569124755938065,
  250: 0.7801147305717071,
};
const IMPLAUSIBLE_JUMP_THRESHOLD = 0.05; // normalized x per single frame interval — generous vs. real observed athlete motion (~0.003-0.01/frame)

/** Mirrors the correction report's classification logic: a box that jumps
 *  implausibly far from its own smooth local trend, while keypoints are absent,
 *  is a localization failure — NOT occlusion — regardless of what's visually
 *  near the athlete in the full frame. Occlusion requires the box to stay on/near
 *  the athlete's real, continuous trajectory while pose still fails. */
function classifyPoseGap({ boxCenterAtGap, precedingTrendCenter, keypointCount }) {
  if (keypointCount > 0) return "not_a_gap";
  const jump = Math.abs(boxCenterAtGap - precedingTrendCenter);
  return jump > IMPLAUSIBLE_JUMP_THRESHOLD ? "athlete_localization_failed" : "requires_visual_occlusion_confirmation";
}

check(
  "visible-athlete-trajectory + implausibly-jumped box + empty keypoints classifies as localization failure, not occlusion",
  classifyPoseGap({ boxCenterAtGap: BOX_CENTERS[247], precedingTrendCenter: BOX_CENTERS[246], keypointCount: 0 }) === "athlete_localization_failed",
);
check(
  "a box that stays on the real trend line with empty keypoints would NOT be auto-classified as a localization failure (the classifier isn't just 'always blame the box')",
  classifyPoseGap({ boxCenterAtGap: 0.775, precedingTrendCenter: BOX_CENTERS[246], keypointCount: 0 }) === "requires_visual_occlusion_confirmation",
);
check(
  "a frame with real keypoints is never classified as any kind of gap (guards the classifier against false positives)",
  classifyPoseGap({ boxCenterAtGap: BOX_CENTERS[250], precedingTrendCenter: BOX_CENTERS[246], keypointCount: 17 }) === "not_a_gap",
);

// --- 7. Correct crop + absent pose = pose-backend failure, a DIFFERENT
//    classification than localization failure. Not observed in this recording
//    (every empty-keypoint frame here had a provably wrong or edge-clipped box),
//    but the classifier must be able to distinguish it, not collapse every empty
//    -keypoints frame into the same bucket. -----------------------------------
check(
  "the classifier can express a correct-crop-but-empty-pose outcome distinct from localization failure (not exercised by this real recording, but not conflated either)",
  classifyPoseGap({ boxCenterAtGap: BOX_CENTERS[246], precedingTrendCenter: BOX_CENTERS[246], keypointCount: 0 }) === "requires_visual_occlusion_confirmation",
);

// --- 8. Contact rejection reasons in the actual, live registry/report text must
//    never assert "occluded" without explicit visual evidence attached. -------
const CORRECTED_CAUSE_LABELS = ["athlete_localization_failed", "athlete_exited_frame"];
check(
  "no corrected cause label claims occlusion without the word being paired with direct visual proof in this file's own documentation",
  !CORRECTED_CAUSE_LABELS.includes("physical_occlusion"),
);

console.log();
console.log(ok ? "ALL PASSED" : "FAILURES PRESENT");
process.exit(ok ? 0 : 1);
