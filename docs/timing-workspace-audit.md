# Timing Workspace audit

Audit date: 2026-07-16

## Findings before implementation

| Area | Existing foundation | Decision |
| --- | --- | --- |
| Video transport | Synchronized overlay player, seek, frame step, speeds, shortcuts | Reuse concepts; build a workspace-specific low-rerender transport surface |
| Pose overlay | Source-timestamped overlay frames and confidence | Reuse immutable artifact data; do not alter pose or timing calculations |
| Gate geometry | Normalized endpoints, camera propagation, independent boundaries | Treat as input/output only; workspace edits draft geometry without changing math |
| Tracking | Camera evidence and local locked/limited/lost contracts | Visualize available evidence; never manufacture missing live tracker output |
| Timing modes | Versioned marked/landmark/manual/technique schema | Use as the workspace setup source of truth |
| Manual timing | Bracket/interpolation contract exists | Add draggable visual handles without changing interpolation calculations |
| Keyframes | Minimal local-tracking keyframes exist | Add reversible draft keyframe editing in workspace persistence |
| Persistence | Session timing setup and immutable analysis snapshots | Add separate UI-layout/draft JSON; keep working-analysis lifecycle untouched |
| Readiness | Centralized timing trust rules | Present a pre-calculation checklist; do not calculate timing |

## Implementation plan

1. Add a versioned, UI-only workspace state contract and session persistence.
2. Create `/sessions/[id]/timing` with left setup controls, central synchronized video,
   right inspector, and bottom multitrack timeline.
3. Implement reversible gate endpoint editing, draft keyframes, manual crossing handles,
   overlay toggles, diagnostics, and readiness preview.
4. Memoize frame/diagnostic derivation and isolate playback time from persisted editor state.
5. Add extension interfaces for tape detection, gate suggestions, crossing validation, and
   hardware timing without implementing those future services.

## Completed implementation

- Added a dedicated `/sessions/[id]/timing` editing route and a clear entry point from the
  working-analysis panel.
- Added the four-region professional editor layout: configuration sidebar, synchronized
  source video, gate inspector, and multitrack timeline.
- Reused immutable source-timestamped pose and camera evidence. No MediaPipe, gate
  propagation, crossing, or timing calculations were changed.
- Added reversible draft gate placement, endpoint dragging, gate keyframes, overlay
  controls, playback speeds, frame stepping, timeline zoom, confidence heatmap, camera
  diagnostics, and manual before/after crossing brackets with interpolation controls.
- Added a readiness preview that explicitly performs no timing calculation.
- Added versioned UI-only persistence in `sessions.timing_workspace`, protected by existing
  session RLS. This state is intentionally not an authoritative analysis input.
- Added typed future extension boundaries for line detection, gate suggestions, crossing
  validation, and hardware timing. The current UI labels detection as unavailable instead
  of simulating it.
- Added deterministic static sanity coverage ensuring workspace saves cannot queue an
  analysis and all four manual crossing brackets remain represented.

## Remaining limitations

- Automatic white-line/tape detection and tracked predicted/corrected gate geometry need
  a real detector output contract before they can be shown truthfully.
- Draft workspace gates do not yet publish into authoritative calibration inputs; that
  must be a separate, reviewed action with the existing timing validation contract.
- Video letterboxing uses normalized source coordinates and should receive real-device
  visual regression coverage before App Store release.
