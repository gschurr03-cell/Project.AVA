// Phase R2B Part L/M -- quantifies exactly why the current R2 presentation
// band width doesn't visually match the workspace's own gate depiction.
// Read-only forensic script; does not change any production file.
//
//   node scripts/phase-r2b-band-width-audit.mjs
import { readFileSync, writeFileSync } from "node:fs";

const midpoints = JSON.parse(readFileSync("tmp/phaseR2B/benchmark-midpoints.json", "utf8"));

// Matches the real "Interactive Overlay" panel video width observed in
// live browser captures (Phase R1C/R2 diagnostics + this phase's own
// screenshots): the displayed canvas is ~1092 CSS px wide at the default
// (non-fullscreen, Auto Follow off) viewport this project's own validation
// scripts use.
const REFERENCE_DISPLAY_WIDTH_PX = 1092;

// Verbatim copy of stationaryGateGeometry.ts's current constants (Phase R2).
const GATE_BAND_FRACTION_OF_FLY_SPAN = 0.12;
const GATE_BAND_MIN_WIDTH_PX = 24;
const GATE_BAND_MAX_WIDTH_PX = 140;
function stationaryGateBandWidth(startMidX, finishMidX) {
  const flySpan = Math.abs(finishMidX - startMidX);
  return Math.min(GATE_BAND_MAX_WIDTH_PX, Math.max(GATE_BAND_MIN_WIDTH_PX, flySpan * GATE_BAND_FRACTION_OF_FLY_SPAN));
}

// Workspace gate visual depiction (TimingWorkspace.tsx, verbatim source
// values read directly from the component, lines 680/691-697):
const WORKSPACE_GATE_VISUAL = {
  barStrokeWidthViewBoxUnits: 4, // <line strokeWidth="4" vectorEffect="non-scaling-stroke">
  barStrokeWidthNote: "SVG line stroke thickness (perpendicular to the bar's own direction, i.e. how THICK the drawn line looks) -- NOT a longitudinal (along-travel) measurement. `vectorEffect=\"non-scaling-stroke\"` means it renders at a CONSTANT ~4 CSS px regardless of zoom.",
  dragHandleDiameterCssPx: 16, // className="h-4 w-4 rounded-full" = 16x16px, scaled by 1/view.scale
  dragHandleNote: "UI drag-affordance circle, positioned EXACTLY at c1/c2 (zero along-travel offset from the bar's own endpoints) -- an interaction target, not a physical/scientific gate dimension.",
  searchWindowPaddingPct: { x: 0.05, y: 0.07 },
  searchWindowNote: "Dashed diagnostic rectangle for the gate-editing 'search window' overlay -- screen-space percentage padding around the gate's bounding box, unrelated to gate physical size; a debug aid, not gate geometry.",
  conclusion: "NO along-travel (longitudinal) visual width exists anywhere in the workspace gate depiction. The bar is a zero-thickness line (a few px of RENDER stroke only); the handles sit exactly on the bar's own two endpoints. This corroborates the Part A/gate-model finding: the gate is a line, not a region, at every layer from calibration data through workspace UI.",
};

const results = {};
for (const [label, m] of Object.entries(midpoints)) {
  const flySpanNormalized = Math.abs(m.finishMidpointNormalized.x - m.startMidpointNormalized.x);
  const flySpanRefPx = flySpanNormalized * REFERENCE_DISPLAY_WIDTH_PX;
  const bandWidthPx = stationaryGateBandWidth(m.startMidpointNormalized.x * REFERENCE_DISPLAY_WIDTH_PX, m.finishMidpointNormalized.x * REFERENCE_DISPLAY_WIDTH_PX);
  const bandPctOfDisplayWidth = (bandWidthPx / REFERENCE_DISPLAY_WIDTH_PX) * 100;
  const ratioToWorkspaceHandle = bandWidthPx / WORKSPACE_GATE_VISUAL.dragHandleDiameterCssPx;
  const ratioToWorkspaceBarStroke = bandWidthPx / WORKSPACE_GATE_VISUAL.barStrokeWidthViewBoxUnits;
  results[label] = {
    referenceDisplayWidthPx: REFERENCE_DISPLAY_WIDTH_PX,
    flySpanNormalized,
    flySpanRefPx,
    currentR2BandWidthPx: bandWidthPx,
    currentR2BandPctOfDisplayWidth: bandPctOfDisplayWidth,
    workspaceDragHandleDiameterPx: WORKSPACE_GATE_VISUAL.dragHandleDiameterCssPx,
    workspaceBarStrokeWidthPx: WORKSPACE_GATE_VISUAL.barStrokeWidthViewBoxUnits,
    r2BandIsXTimesWiderThanWorkspaceHandle: ratioToWorkspaceHandle,
    r2BandIsXTimesWiderThanWorkspaceBarStroke: ratioToWorkspaceBarStroke,
  };
  console.log(`${label}: R2 band=${bandWidthPx.toFixed(1)}px (${bandPctOfDisplayWidth.toFixed(1)}% of frame) vs workspace handle=16px (${ratioToWorkspaceHandle.toFixed(1)}x wider) vs bar stroke=4px (${ratioToWorkspaceBarStroke.toFixed(1)}x wider)`);
}

writeFileSync("tmp/phaseR2B/current-band-width-audit.json", JSON.stringify({ referenceDisplayWidthPx: REFERENCE_DISPLAY_WIDTH_PX, perBenchmark: results }, null, 2));
writeFileSync("tmp/phaseR2B/workspace-gate-visual-bounds.json", JSON.stringify(WORKSPACE_GATE_VISUAL, null, 2));
console.log("\nWrote tmp/phaseR2B/current-band-width-audit.json, workspace-gate-visual-bounds.json");
