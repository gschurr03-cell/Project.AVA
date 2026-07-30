import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync("src/app/sessions/[id]/timing/TimingWorkspace.tsx", "utf8");
const route = readFileSync("src/app/sessions/[id]/timing/page.tsx", "utf8");
const action = readFileSync("src/app/sessions/actions.ts", "utf8");
const migration = readFileSync("supabase/migrations/0034_timing_workspace.sql", "utf8");

for (const region of ["Zone type", "Inspector", "Timeline", "Crossing review"]) {
  assert(client.includes(region), `workspace is missing ${region}`);
}
for (const control of ["startBefore", "startAfter", "finishBefore", "finishAfter"]) {
  assert(client.includes(control), `workspace is missing ${control}`);
}
assert(client.includes("Confirm manual"));
assert(client.includes("manual_physical_line"));
assert(client.includes("Save Gates & Run Analysis"));
assert(client.includes("Saving calibration…"));
assert(client.includes("isTimingWorkspaceCalibrationComplete"));
assert(client.includes("action={saveGateCalibration}"));
assert(client.includes('state.cameraType==="panning"'),
  "only explicit panning mode may apply camera-estimator transforms");
assert(client.includes("projectSourcePointToDisplay"),
  "calibration overlays must use the shared source-to-display projection");
assert(client.includes("unprojectDisplayPointToSource"),
  "calibration pointer editing must invert the shared display projection");
assert(client.includes("<Label>Camera type</Label>"));
assert(client.includes("AVA locks gates to the track."));
assert(client.includes("onLoadedMetadata"));
assert(client.includes("videoWidth") && client.includes("videoHeight"),
  "intrinsic media dimensions must initialize the workspace after metadata loads");
assert(client.includes("panningTrackingCanBeConfirmed"));
assert(route.includes("current_working_analysis_id"));
assert(route.includes("loadOverlayFrames"));
assert(action.includes("Persist reversible Timing Workspace UI/draft state"));
assert(!action.slice(action.indexOf("export async function saveTimingWorkspace"), action.indexOf("function blankToNull")).includes("queueAnalysis"));
const gateSave = action.slice(
  action.indexOf("export async function saveGateCalibration"),
  action.indexOf("export type SaveGateStatus"),
);
assert(gateSave.includes("timing_workspace: workspace"));
assert(gateSave.indexOf(".update({") < gateSave.indexOf("await queueAnalysis(formData)"));
assert.equal((gateSave.match(/await queueAnalysis\(formData\)/g) ?? []).length, 1,
  "one calibration save must enqueue exactly one analysis");
assert(gateSave.includes("calibration_gates: parsed.data"));
assert(gateSave.includes("calibration_known_distance_m: points.distanceM"));
assert(gateSave.includes("cameraType: workspace?.cameraType"));
assert(gateSave.includes("width: sourceFrameWidth") && gateSave.includes("height: sourceFrameHeight"));

// Missing/invalid intrinsic dimensions must produce a distinct message, not the
// generic "Invalid calibration gates" schema-validation failure, and must be
// checked BEFORE that general schema parse so the distinct message actually wins.
const dimensionErrorMessage = "Source video dimensions are unavailable. Wait for the video to finish loading and try again.";
assert(gateSave.includes(dimensionErrorMessage),
  "missing intrinsic dimensions must return a distinct, actionable server error");
assert(
  gateSave.indexOf(dimensionErrorMessage) < gateSave.indexOf("calibrationGatesSchema.safeParse(gates)"),
  "the intrinsic-dimension check must run before the general calibration-gates schema validation",
);
assert(
  gateSave.indexOf("!Number.isFinite(sourceFrameWidth)") < gateSave.indexOf(".update({"),
  "the intrinsic-dimension check must run before the session row is written",
);

assert(migration.includes("never authoritative timing calculations"));

// --- Regression: the manual gate editor must never display "Static camera" while
// cameraType is "panning" (the exact real-browser bug: missing evidence silently
// relabeled a panning session as stationary/static and rendered gates screen-fixed).
assert(!client.includes("Static camera"),
  "camera mode and tracking quality must never combine into a 'Static camera' label");
assert(client.includes("cameraModeLabel(state.cameraType)"),
  "the displayed camera-mode label must read the authoritative cameraType explicitly, never a separately-defaulted value");
assert(client.includes("trackingStateLabel(trackingState)"),
  "tracking quality must be its own label, never folded into the camera-mode label");
assert(client.includes("hasCameraEvidence=Boolean(cameraEvidence?.transforms.length)"),
  "camera mode (isPanningMode) and evidence availability (hasCameraEvidence) must be tracked as separate booleans");
assert(client.includes("isPanningMode=state.cameraType===\"panning\""),
  "isPanningMode must derive from cameraType alone, not from recording mode, pose mode, or evidence availability");

// Panning + missing evidence must never silently fall back to raw/static rendering.
assert(client.includes('return currentSourceFrame===anchorRef.current[name]?line:null;'),
  "panning mode without usable evidence must show the gate only at its exact reference frame, or hide it — never the raw/static projection");

// Edit blocking: a drag may not start unless the current frame can be safely projected;
// a blocked attempt must show a distinct message and must never call setDrag (so no
// dispatch, so canonical gate coordinates are never touched).
assert(client.includes("canSafelyProjectGate"),
  "gate editing must be gated on a real safety check, not just the locked flag");
assert(client.includes("Camera tracking unavailable for gate editing"));
const pointerDownBlock = client.slice(client.indexOf("onPointerDown={e=>{\n                e.stopPropagation();suppressStageClick.current=true;"));
const blockedIdx = pointerDownBlock.indexOf("setEditBlockedMessage(\"Camera tracking unavailable for gate editing\")");
const setDragIdx = pointerDownBlock.indexOf("setDrag({gate:name,end})");
assert(blockedIdx > -1 && setDragIdx > -1 && blockedIdx < setDragIdx,
  "the edit-blocked message must be set (and return early) BEFORE setDrag can ever start an edit");

// Shared geometry: the gate line and its endpoint handles/hit-region must come from
// the exact same projectGate(...) call — no parallel/independent computation for one
// visual element vs another.
const projectGateCalls = client.match(/projectGate\(state\.gates\[name\],name\)/g) ?? [];
assert.equal(projectGateCalls.length, 2,
  "the gate line/plane (SVG) and its endpoint handles (hit region) must both read from the same projectGate(...) call");

// Locking blocks EDITING only — it must never change what gets rendered (a locked
// panning gate still follows the live camera transform).
const reprojectGateBody = client.slice(client.indexOf("const reprojectGate=useCallback("), client.indexOf("const pointerToCanonical=useCallback("));
assert(!reprojectGateBody.includes("locked"),
  "gate projection/rendering must not depend on the locked flag — only editing does");

// Keyframes are navigation bookmarks only; they must never feed the projection path.
for (const fnStart of ["const reprojectGate=useCallback(", "const pointerToCanonical=useCallback(", "const projectGate=useCallback(", "const compensateToReference=("]) {
  const start = client.indexOf(fnStart);
  assert(start > -1, `expected to find ${fnStart}`);
  const body = client.slice(start, client.indexOf("\n", client.indexOf("},[", start)) + 1);
  assert(!body.includes("keyframes"),
    `${fnStart} must not read state.keyframes — keyframes cannot override the canonical/projected gate position`);
}

// Dev-only runtime trace for this exact editor, using the required stable prefix.
assert(client.includes("[manual-gate-world-lock]"));
const debugBlockStart = client.indexOf("[manual-gate-world-lock]");
const debugEffectStart = client.lastIndexOf("useEffect(()=>{", debugBlockStart);
const debugEffectGuard = client.slice(debugEffectStart, debugBlockStart);
assert(debugEffectGuard.includes('process.env.NODE_ENV==="production"'),
  "the manual-gate-world-lock trace must be gated out of production");

console.log("timing workspace sanity: passed");
