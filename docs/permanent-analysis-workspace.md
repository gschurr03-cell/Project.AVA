# Permanent analysis workspace

Audit date: 2026-07-16  
Status: implemented and locally validated

## Root-cause audit

| Component | Exists | Readiness | Finding and decision |
| --- | --- | --- | --- |
| Original video storage | Yes | Good | `sessions.video_path` remains athlete-scoped in the private `sprint-videos` bucket. Workers do not overwrite it. Preserve unchanged. |
| Signed video access | Yes | Good with UI failure gap | The session page creates a fresh one-hour signed URL on every server render, so refresh/browser restart is supported. Signed-URL errors are currently collapsed to a generic absent-video state. |
| Completed-session video | Partial | Blocking integration defect | Before completion the page renders `VideoPlayer`. After completion it replaces that branch with overlay-only UI. If overlay frames are unavailable, it renders a pose placeholder even when the signed source URL exists. The source never disappeared from storage; the render branch hid it. |
| Pose artifact | Yes | Good | Production workers upload a private immutable pose artifact and persist `analyses.keypoints_path`. Keep per-analysis paths. |
| Overlay loading | Yes | Blocking integration defect | Loading is gated by successful parsing of the metrics JSON (`hasReadableResult`). Experimental results intentionally null excluded timing fields, so metrics parsing may fail while the pose artifact is valid. Artifact availability must depend on analysis/keypoint identity, not metric readability. |
| Overlay transport | Yes | Good foundation | Play/pause, scrubber, frame stepping, keyboard shortcuts, speed, timestamp, frame number, and pose synchronization exist. Add explicit source/analysis FPS readout. |
| Overlay layers | Partial | Good foundation | Skeleton, arms, COM, velocity, angles, contacts/steps, calibration gates, follow, and opacity exist. Persisted crop/camera evidence is available in the pose artifact but has no complete diagnostic renderer. Do not fake it; keep future-ready controls explicit. |
| Calibration UI | Yes | Unsafe version semantics | Session-level zone, point, and gate actions mutate the current editable session, while completed analysis snapshots remain immutable. Derived UI can therefore show current calibration beside old analytical results. Saving a completed-session calibration must queue a new analysis version. |
| Timing workspace | Partial | Partial | Known-distance zone and timing gate bars exist. Direction/body-reference/split models are not a complete persisted editor. Reuse existing timing inputs and add a versioned workspace snapshot; do not implement new timing math. |
| Rerun | Yes | Partial | `queueAnalysis` already creates a new analysis row and never requires re-upload, but UI always selects the latest row and does not name or expose versions. Preserve queue behavior and formalize version identity. |
| Analysis history | Exists in DB | Missing session UX | Every rerun is already a separate analysis row with input/provenance snapshots and artifact paths. The page queries only the latest analysis, so older reports are inaccessible. Add immutable version numbers, parent linkage, and selection by analysis ID. |
| Cache behavior | Partial | Acceptable foundation | Server render downloads one selected pose artifact. Browser caches video range requests; signed URLs refresh per page request. Selecting a version is the cache-invalidation key. Avoid loading artifacts for every history row. |
| Recommendations/metrics | Yes | Keep | Existing panels consume the selected analysis. No biomechanics or timing algorithms need changes. |

## Permanent workspace architecture

The session is the durable media/workspace owner. The original private video path belongs to
the session and is rendered regardless of analysis state. Analyses are immutable versions
that reference the same source video and own their own input snapshot, pose artifact, result,
pipeline/tier provenance, and workspace configuration.

The page resolves one selected analysis version from a session-scoped list. Only that
version's artifact is downloaded. Changing versions changes the URL selection key and reloads
the corresponding overlay/results without touching the original media.

Saving calibration/timing edits updates the session's editable draft and queues a new analysis
row whose immutable input snapshot captures those values. Previous analyses and artifacts are
never mutated. Version numbering is assigned transactionally in the database.

## Implementation plan

1. Decouple original-video rendering from completion and decouple overlay loading from metrics.
2. Query all lightweight analysis-version metadata, select one by session-owned analysis ID,
   and render permanent version history/navigation.
3. Add ordered version numbers, parent linkage, and a workspace snapshot additively.
4. Make completed-session calibration/timing saves queue a new immutable version without
   requiring another upload.
5. Surface source FPS and selected analysis FPS in the existing transport and keep current
   AVA premium controls/layers.
6. Add deterministic regression coverage for source persistence, overlay independence,
   version selection, immutable snapshots, rerun creation, and migration guarantees.

## Completed implementation

- The original protected video is rendered in a permanent source panel for every session
  state. Completion, result-schema parsing, and pose-artifact availability no longer hide it.
- Overlay loading is keyed only by a completed analysis and its immutable
  `keypoints_path`. A malformed or intentionally limited experimental metrics payload no
  longer suppresses a valid pose artifact.
- The session page fetches lightweight history metadata first, then loads only the selected
  version's full result and pose artifact. A bounded five-minute server cache uses the
  artifact path as its version-safe key.
- Existing synchronized transport now reports source and analysis FPS alongside play/pause,
  timeline drag, frame stepping, timestamp, frame number, speed, and opacity/layer controls.
- Migrations 0024–0026 add transactionally assigned per-session version numbers, parent
  linkage, versioned workspace configuration, and editable timing-workspace draft fields.
  Legacy rows are deterministically numbered and linked.
- Calibration points, gate calibration, known-distance zones, timing profile changes,
  recalculation, and calibration removal now queue a new immutable analysis row. They reuse
  `sessions.video_path`; no upload or source-media mutation occurs.
- Version navigation selects a session-owned analysis through the URL and restores that
  version's calibration/timing snapshot, metrics, recommendations, provenance, and overlay.

## Validation evidence

- `npm run workspace:sanity`: passed.
- `npm run workspace:integration`: passed against the protected real session. Its original
  `.mov` remained signable and range-readable after five analysis versions; version 5's
  private artifact remained downloadable and produced 197 overlay frames.
- `npm run typecheck`: passed.
- `npm run lint`: passed with the pre-existing `VideoOverlay` exhaustive-deps warning and
  the existing Next.js lint-command deprecation notice.
- `npm run build`: passed. The existing Supabase Edge Runtime warning remains.

## Deferred, future-ready review tools

Camera/crop/panning diagnostic renderers, two-version side-by-side comparison, screenshot
export, and rendered overlay-video export remain explicit review-tool stubs. The immutable
artifact/version selection boundary supports them without changing the source-media or
analysis model. No biomechanics, timing validation, validated 60 FPS behavior, or
experimental 30 FPS behavior changed in this pass.
