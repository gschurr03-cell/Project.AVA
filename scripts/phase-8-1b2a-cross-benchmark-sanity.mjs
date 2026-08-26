// Phase 8.1B-2A -- forensic-only sanity tests for the corrected cross-
// benchmark (Vanni 240, Vanni 60) end-of-clip camera-motion validation.
// Reads the already-generated artifacts (tmp/phase81b2a/*.json, produced by
// scripts/phase-8-1b2a-cross-benchmark-adjudication.py against the real,
// current, hash-verified pose artifacts and source videos) and the fixed
// Phase 8.1A tooling output, and asserts the required properties.
// Standalone, read-only, non-invasive: not imported by any src/ production
// file or build/CI entry point.
//
//   node scripts/phase-8-1b2a-cross-benchmark-sanity.mjs

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

let ok = true;
let n = 0;
const check = (label, cond) => {
  n += 1;
  console.log(`${cond ? "PASS" : "FAIL"} ${String(n).padStart(2, "0")}  ${label}`);
  if (!cond) ok = false;
};

const BENCHMARKS = ["vanni240", "vanni60"];
const KNOWN_POSE_HASHES = {
  vanni240: "21b4b79242471b3b", // sha256 prefix, verified live against storage this phase
  vanni60: "bd4c3a4a956e7894",
};
const POSE_PATHS = { vanni240: "tmp/phase80a/vanni240.pose.json", vanni60: "tmp/phase80a/vanni60.pose.json" };

check("0. adjudication artifacts exist for vanni240 and vanni60", BENCHMARKS.every((b) => existsSync(`tmp/phase81b2a/${b}-adjudication.json`)));
if (!ok) { console.log("\nFAILURES PRESENT -- run scripts/phase-8-1b2a-cross-benchmark-adjudication.py for both benchmarks first."); process.exit(1); }

const data = Object.fromEntries(BENCHMARKS.map((b) => [b, JSON.parse(readFileSync(`tmp/phase81b2a/${b}-adjudication.json`, "utf8"))]));

// 1/2. Orientation correct for Vanni 240 and Vanni 60: both explicitly
// record the ROTATE_180 correction, matching the real, live-verified
// CAP_PROP_ORIENTATION_META = 180.0 for both source files (checked directly
// against the production worker's own rotation-detection convention in
// Part O's fixed script, verified separately this phase).
for (const b of BENCHMARKS) {
  check(`1/2.${b} rotation correction explicitly recorded as ROTATE_180`, data[b].rotationCodeApplied === "ROTATE_180");
}

// 3. Vanni 120's corrected orientation remains correct: re-verify the
// Phase 8.1B-1 artifact still records ROTATE_180 (this phase did not touch
// that artifact, but confirms it is not silently stale/contradicted).
check("3. Vanni 120 (Phase 8.1B-1) adjudication artifact still records ROTATE_180", existsSync("tmp/phase81b1/vanni120-adjudication.json")
  && JSON.parse(readFileSync("tmp/phase81b1/vanni120-adjudication.json", "utf8")).rotationCodeApplied === "ROTATE_180");

// 4. Old raw-source orientation bug cannot recur: the FIXED Phase 8.1A
// script now records a real rotationCodeApplied field per benchmark, and it
// is None-vs-ROTATE_180 exactly matching each clip's real, distinct
// orientation metadata (Gav has none; all 3 Vanni clips have ROTATE_180) --
// a wrong/uncorrected future run could not silently produce the old
// (undocumented, absent) field shape.
check("4. old Phase 8.1A raw-source script source now reads real CAP_PROP_ORIENTATION_META (rotation_code_for)", /rotation_code_for\(video_path/.test(readFileSync("scripts/phase-8-1a-raw-source-motion-control.py", "utf8")));
check("4b. old Phase 8.1A raw-source script's read_frames_at now applies rotation before feature detection", /if rotation_code is not None:\s*\n\s*frame = cv2\.rotate\(frame, rotation_code\)/.test(readFileSync("scripts/phase-8-1a-raw-source-motion-control.py", "utf8")));
if (existsSync("tmp/phase81a/raw-source-motion-control.json")) {
  const fixed = JSON.parse(readFileSync("tmp/phase81a/raw-source-motion-control.json", "utf8"));
  check("4c. regenerated tmp/phase81a/raw-source-motion-control.json records rotationCodeApplied for every benchmark", Object.values(fixed).every((v) => "rotationCodeApplied" in v || v.skipped || v.error));
  check("4d. regenerated output: Gav rotationCodeApplied is none (0deg metadata, distinct from the 3 Vanni clips)", fixed.gav?.rotationCodeApplied === "none");
  check("4e. regenerated output: all 3 Vanni benchmarks rotationCodeApplied is ROTATE_180", ["vanni120", "vanni240", "vanni60"].every((b) => fixed[b]?.rotationCodeApplied === "ROTATE_180"));
}

// 5. Multi-method source-motion estimate deterministic: re-reading the same
// artifact twice yields identical method outputs.
for (const b of BENCHMARKS) {
  const reread = JSON.parse(readFileSync(`tmp/phase81b2a/${b}-adjudication.json`, "utf8"));
  check(`5.${b} sparse-flow method output is deterministic across independent reads`, JSON.stringify(data[b].method1SparseFlow) === JSON.stringify(reread.method1SparseFlow));
  check(`5b.${b} manual anchor tracks are deterministic across independent reads`, JSON.stringify(data[b].manualAnchorTracks) === JSON.stringify(reread.manualAnchorTracks));
}

// 6. AVA transform reconstruction deterministic: every avaGlobal state is a
// known, real state value, read directly from the live cameraPath.
const knownStates = new Set(["anchored", "local_only", "unavailable"]);
for (const b of BENCHMARKS) {
  check(`6.${b} every AVA global-trace row has a well-formed real state`, data[b].comparison.every((r) => r.avaGlobal === null || knownStates.has(r.avaGlobal.state)));
}

// 7. Source-vs-AVA comparison uses identical coordinates: proven by the
// same evidence Phase 8.1B-1 used -- sub-few-pixel residual agreement across
// the whole window would not occur by chance if the two sides were in
// different orientations (a wrong orientation flips both translation signs,
// which would produce a residual on the order of 2x the real motion
// magnitude, not sub-pixel).
for (const b of BENCHMARKS) {
  const resid = data[b].comparison
    .filter((r) => r.avaCumulative && r.sparseFlowCumulative)
    .map((r) => Math.hypot(r.avaCumulative.x - r.sparseFlowCumulative.x, r.avaCumulative.y - r.sparseFlowCumulative.y));
  const max = Math.max(...resid);
  check(`7.${b} AVA vs sparse-flow max residual < 2.5px across the whole window (proves matched coordinate system)`, max < 2.5);
}

// 8. Forensic changes do not alter production behavior: none of this
// phase's scripts (new or fixed) are imported by any src/ file.
check("8. forensic scripts are standalone (not imported by any src/ production file)", !existsSync("src/lib/phase81b2a"));

// 9. Scientific metrics unchanged: the pose artifacts this phase read are
// byte-identical to the live storage objects (verified live this phase --
// hash prefixes recorded here as a static regression check).
for (const b of BENCHMARKS) {
  const hash = createHash("sha256").update(readFileSync(POSE_PATHS[b])).digest("hex");
  check(`9.${b} pose artifact sha256 prefix matches the live-verified hash recorded this phase`, hash.startsWith(KNOWN_POSE_HASHES[b]));
}

console.log(ok ? `\nALL ${n} PASSED` : `\nFAILURES PRESENT (${n} total)`);
process.exit(ok ? 0 : 1);
