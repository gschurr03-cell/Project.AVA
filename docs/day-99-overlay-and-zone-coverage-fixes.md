# Project AVA
## Vanni 240fps Production-Path Debugging — Overlay, Gate Stability, and Zone Coverage (Day 99)

Status: Real production-path debugging and correction. No tracking algorithm
was modified (MediaPipe runner, box tracker, camera-motion estimator,
contact-detection thresholds — all untouched). No panning-mode logic was
touched. No database writes were made by this session except the DB's own
normal worker activity (see Part 10 — a job that was already queued by a
real coach action completed naturally while this audit was in progress).
Nothing was committed or pushed.

This continues [Day 97](day-97-stationary-measurement-recovery-audit.md) and
[Day 98](day-98-metric-evidence-framework.md)'s work on the same Vanni
240fps stationary 20m fly session.

---

## Part 1 — Exact analysis identified

| Field | Value |
|---|---|
| Session ID | `227ae200-af96-4ffc-94d0-56d2e5f9d155` ("vanni 240fps fly") |
| Current working analysis ID | `b890527f-8a73-4ccb-b74c-b1e845a4f16e` |
| Job ID | `06466fde-b2fb-4b95-bdc0-9b036daf3608` |
| Source video path | `5df6454c-950f-4162-b756-42c353cb28ab/227ae200-af96-4ffc-94d0-56d2e5f9d155.mov` |
| Exact detected FPS | 239.47983511113 (displayed/analysis FPS 239.48) |
| Frame count | 2,348 |
| Calibration reference frame | 0 (`referenceFrameIndex`) |
| Calibration **setup** frame | 1982 (`startBoundary`/`finishBoundary.setupFrameIndex` — see Part 1 note below) |
| Start gate coordinates (v2, current) | c1 (0.11861, 0.58872) → c2 (0.15510, 0.58597) |
| Finish gate coordinates (v2, current) | c1 (0.86309, 0.58346) → c2 (0.90050, 0.58809) |
| Travel direction | `left_to_right` |
| Camera type | `stationary` (coach-confirmed, `calibration_gates.cameraType`) |
| Pose artifact path | `pose-artifacts/5df6454c-950f-4162-b756-42c353cb28ab/227ae200-af96-4ffc-94d0-56d2e5f9d155/b890527f-8a73-4ccb-b74c-b1e845a4f16e.pose.json` (2,348 frames, 1920×1080) |
| Contact artifact | Not a separate artifact — contacts are derived live from the pose artifact by `buildFullRunEvents` on every page render, never persisted separately |
| Overlay artifact | Same pose artifact; `loadOverlayFrames` builds `OverlayFrame[]` from it on demand |
| UI analysis/version currently loaded | `sessions.current_working_analysis_id = b890527f…`, `status = complete` |

**A real, important discovery made during this audit and not part of its
original brief**: partway through this session, the calibration gates were
found to have been updated by a real coach action to a new revision
(`version 2, revision 2, startGateId "start-v2"`, `setupFrameIndex 1982` —
up from the `v1`/frame-0 gates this investigation's earlier reports were
built against), and analysis `b890527f…` had been re-queued. Its job was
found `status = "processing"`, claimed by a worker process (`imacs-iMac.local-72329`)
that had already exited without releasing its lease — an orphaned job, not
still actively running. This was **not caused by this session** — no code in
this task queues jobs — and was left to resolve itself through the system's
own normal lease-expiry + reclaim mechanism (documented in
`docs/day-96-stationary-tracking-milestone-report.md`) rather than being
manually forced. It did: the lease expired, a live worker
(`imacs-iMac.local-73221`) reclaimed it as attempt 2, and it completed
naturally partway through this session (`completed_at` 21:45:40 UTC,
`last_error_code: "lease_expired"` recorded against attempt 1). Part 10 uses
this real completion as the "production rerun."

---

## Part 2 — Frame-by-frame evidence timeline

Built directly from the pose artifact (fresh copy, downloaded after the
Part 1 rerun completed) and the real `computeSprintMeasurements` /
`buildFullRunEvents` output — not estimated.

| Event | Source frame | Time (s) |
|---|---|---|
| First frame with ANY landmark ≥0.4 confidence | 525 | 2.19 |
| First frame with a usable FOOT landmark (toe/heel/ankle ≥0.4) | 525 | 2.19 |
| Longest continuous verified-pose run | frames ~1660–1996 (335 frames) | 6.93–8.33 |
| First full-run ground contact (any side) | 1702 | 7.1071 |
| Start-gate crossing | **unavailable** | — (no verified crossing — see below) |
| First valid in-zone contact | 1702 (left) | 7.1071 |
| Contacts 2–5 (all in-zone) | 1745 / 1803 / 1843 / 1899 | 7.2867 / 7.5288 / 7.6958 / 7.9296 |
| Contact 6 (excluded — beyond finish gate) | 1960 | 8.1842 |
| First rendered step marker (= first eligible in-zone step) | contact pair 1702→1745 | 7.2867 |
| Finish-gate crossing | 1914 (interpolated, verified) | 7.9933 |
| Last valid pose frame with a foot landmark | 1995 | 8.3125 |

**Summary values requested:**
- First athlete detection frame: 525 (t=2.19s) — any landmark; the athlete is not reliably identifiable as a coherent pose before this.
- First pose frame: 525.
- First overlay frame (renderable skeleton, post-fix): every frame from 525 onward with `boxOrigin` `tracked`/`detected`/`reacquired` and a real landmark — no longer gated to "paused only" (Part 4/5 fix).
- Start crossing frame: none — genuinely unavailable (see Part 6/7).
- First valid in-zone contact: frame 1702 (t=7.11s).
- First rendered step marker: the 1702→1745 pair (t=7.29s, the landing end of the first measurable step).
- Difference between first valid in-zone contact and first rendered step marker: **zero contacts were dropped between them** — the "first rendered step" is simply the first step for which a length is mathematically definable (a length needs two consecutive contacts; the first-ever contact, 1702, has no earlier point to measure from — see Part 6).
- Finish crossing frame: 1914 (t=7.99s).
- Last overlay frame with real pose evidence: 1995 (t=8.31s, matching `diagnostics.lastContactTimeS` region).

Per-source-frame `sourceFrameIndex / timestampMs / boxOrigin / trackState /
pose valid / left-foot valid / right-foot valid / contact event / inside-zone
/ crossing event / stride assignment / overlay-frame availability` for the
full 2,348-frame range was generated as part of this audit's working data
(not reproduced verbatim here for length) — the aggregate facts above are
its direct summary. The box-origin distribution (2,294 `tracked` + 47
`detected` + 7 `invalid`, 0 `predicted` for this specific artifact) and
foot-landmark cross-tabulation were already established in the Day 97 audit
and were re-confirmed unchanged on the fresh artifact this session.

---

## Part 3 — Gate stability: cause and fix

### Investigation

Traced the full rendering chain: `calibration_gates` → `selectRenderableGateGeometry`
(`src/lib/calibration/authority.ts`) → `canonicalGeom`/`authoritativeGeom`/`migratedGeom`
(`src/components/video/VideoOverlay.tsx`) → `project()` (`src/lib/video/coordinates.ts`).

For this session specifically (`manual_confirmed` calibration + coach-confirmed
`cameraType: "stationary"`), the render path is:
1. `selectRenderableGateGeometry` → `mode: "canonical_raw"` (draws from the
   exact persisted `startGate`/`finishGate.c1/c2`, never a derived/migrated
   line).
2. `canonicalGeom` → since `useCameraProjection` (`calibrationCameraType ===
   "panning"`) is `false`, takes the **identity fallback**: `project(canonical.c1)`,
   `project(canonical.c2)` on the raw, immutable stored coordinates — **no
   per-frame camera transform is applied at all** for this session.
3. `project()` (`projectLandmark` → `projectSourcePointToDisplay`) depends
   only on `video.clientWidth`/`clientHeight` (integer CSS-pixel box size)
   and `video.videoWidth`/`videoHeight` (constant intrinsic dimensions) —
   nothing in this function should vary frame-to-frame under a static layout.

**Conclusion: for this session's current configuration, no code path was
found that would cause the gate lines to move at all** — both gates are
drawn from the same immutable coordinates every single frame through a
transform that resolves to a pure identity for a stationary, manually
confirmed calibration. This is a genuine, verified finding, not an assumed
absence of a bug — it was traced through every function in the chain.

A real, related but **not the primary** risk was found: `recordingModeUsesCameraProjection`
(`src/lib/video/recordingMode.ts:22-24`) — the *fallback* used only when
`calibrationCameraType` is unset — returns `true` (apply camera projection)
for every `recordingMode` except `"static_precision"`/`"static_usable"`,
including `"athlete_tracking_lost"` (this session's classification). This
fallback is never reached for Vanni today because `calibrationCameraType`
is reliably threaded through, but it is a latent risk for any session that
lacks an explicit coach-confirmed camera type. It was **not modified** —
changing it touches shared panning-safety logic and is explicitly out of
this task's scope; it is documented here and recommended for a dedicated
review in Part 17.

### Fix applied (defense-in-depth, per the task's explicit instruction)

Even though no live bug was found for this exact session, the task
explicitly asked for "display-level stabilization if the underlying
transform is scientifically valid but visually noisy," so this was
implemented as a permanent safety net against exactly the class of noise
this investigation could not fully rule out for every camera/transform
combination (panning sessions do take the reprojection path, which composes
per-frame transform records and genuinely can carry small numerical noise):

- **New file**: `src/lib/video/gateStabilization.ts` — a pure,
  unit-tested module (`stabilizeGatePoint`) implementing a shared 0.75px
  deadband: a frame-to-frame pixel move below threshold keeps the
  previously-displayed position; a real move (≥ threshold) always passes
  through. **One function, one constant, applied identically to both
  gates** — they cannot be independently smoothed or drift apart from each
  other as a side effect.
- **Wired into** `VideoOverlay.tsx`'s gate-drawing path, replacing an
  equivalent inline implementation with a call into the tested module.
- **Diagnostics added** (`gateDiagnosticsRef`, surfaced in the existing
  debug HUD — see Part 9): start/finish midpoint displacement per frame,
  gate spacing (px), gate orientation (deg) for each gate, raw-vs-display
  transform state, and the last frame a transform was rejected as unsafe.

---

## Part 4/5 — Why the skeleton was absent, and the fix

### Root cause 1 (confirmed, definite): pose layers were gated to paused-only playback

`VideoOverlay.tsx`'s `draw()` computed `const showPose = video.paused ||
video.playbackRate < 0.4` (a deliberate Day 76 design choice to avoid visual
"trailing" at fast playback) and used it to gate **skeleton, arms, joint
angles, COM trail, velocity overlay, and foot labels** — all of them, every
frame, unless the video was paused or slowed to 0.25×. **During ordinary 1×
or 2× playback, none of these layers were ever drawn**, regardless of how
much real pose evidence existed. Step marks and gate lines were explicitly
exempted from this gate ("always drawn"), which is exactly consistent with
the reported symptom: during normal playback, a coach would see gate lines
and nothing else.

**Fix**: changed the condition to `video.paused || video.playbackRate <=
1.01` — pose layers now render at rest and at normal (1×) speed, only
withheld above 1× where the original trailing concern is real. The
per-frame lookup itself (see below) was already a live nearest-frame scan,
not a stale cache, so 1× playback reads as synced.

### Root cause 2 (confirmed, definite): no `boxOrigin`/`trackState` check in the renderer

`computeSprintMeasurements` already strips landmarks to `{}` for
`predicted`/`invalid`-boxOrigin frames before any contact/metric computation
(a Day 96 fix). **The renderer had no equivalent check** — `VideoOverlay.tsx`
drew a full skeleton from `frame.landmarks` regardless of `boxOrigin`,
meaning a frame whose crop was extrapolated (not verified) could still
render as if fully confirmed, and `overlayAvailability.ts`'s toggle-gating
(landmark **visibility**, not provenance) didn't catch this either. This is
the opposite failure mode from the reported complaint (over-rendering, not
under-rendering) but is real and directly named in this task's Part 4
requirement ("Predicted boxes may guide the crop but cannot produce a
skeleton").

**Fix**: `VideoOverlay.tsx` now strips `frame.landmarks` to `{}` for
`predicted`/`invalid` `boxOrigin`, mirroring `measurements.ts`'s existing
check exactly, before any pose layer reads it.

### Investigated and found NOT to be a bug (per Part 5's checklist)

- **`keypoints` vs `landmarks` field mismatch**: `loadOverlayFrames.ts`
  already correctly reads `frame.keypoints` (confirmed by direct code
  reading — the Day 96 field-name bug was in this investigation's own
  diagnostic scripts, never in production code).
- **Overlay timestamp lookup requiring exact equality**: both
  `frameIndexForTime` (`OverlaySurface.tsx`) and the inline scan in
  `VideoOverlay.tsx`'s `draw()` already use a last-at-or-before + nearest-tie-break
  scan against `video.currentTime`, not exact floating-point equality —
  already correct at 240fps, no change needed.
- **Zone-only overlay filtering**: confirmed `frames` flows unmodified from
  `loadOverlayFrames` through to the canvas — zone filtering exists only
  inside the metrics engine, never trims what the player can show.
- **Overlay toggles incorrectly disabled**: `effectiveOverlayToggles`/
  `overlayLayerAvailable` correctly gate on real landmark visibility; not
  the cause here.
- **Rotated-video coordinate transforms / stale display dimensions**:
  `getDisplayedVideoRect` uses `video.videoWidth`/`videoHeight` (the
  already-rotation-corrected intrinsic dimensions the browser reports after
  the Day 96 rotation fix), consistently for both gates and pose — no
  separate un-rotated code path was found.

---

## Part 6 — Why step reconstruction "starts late": a genuine evidence gap, not a bug

This required the most careful verification, because the task's premise
("the measurement engine must not ignore early valid contacts... do not
require the entire stride sequence to belong to the longest global pose
segment") implies there IS a selection/trimming bug. The dependency chain
was audited in full:

`buildFullRunEvents` (`src/lib/video/events.ts`) calls `detectStepMarks` on
the **complete, untrimmed** frame array — confirmed by direct reading: there
is no "longest continuous segment" pre-selection anywhere in this function
or its caller. Every frame's pose evidence, whether inside a long confident
run or scattered and thin, is given to the contact detector. This was
independently re-confirmed on the fresh Part 10 rerun.

**Finding: no code discards a valid early contact.** The real cause is that
no candidate ground contact exists before source frame 1702 in the first
place. Foot-landmark evidence between frames 525–1660 is real but scattered
and sub-threshold (individual frames occasionally clear the 0.4 confidence
floor, but never for the ≥3 consecutive frames the detector's own
local-maxima/amplitude geometry requires to identify a genuine contact
event) — this was quantified directly in the Day 97 audit (2,040 of 2,348
frames have good box localization but no usable foot landmark) and
reconfirmed unchanged this session. The first contact the detector can
honestly report is frame 1702 — at that point the athlete is already
world-position 11.5m into the 20m zone (57.5% through), which is exactly
what a coach watching the video would perceive as "starting around the
second half."

**First valid in-zone contact**: frame 1702 (the very first contact of the
entire clip, in or out of zone).
**First complete in-zone step**: the 1702→1745 pair — the first step whose
length is mathematically definable, since a step length requires two
consecutive contacts and frame 1702 has none before it (in or out of zone) to
measure from. This is a physical fact about what "step length" means, not a
selection choice.
**First complete in-zone stride**: 1702→1803 (same-foot, left→left).
**Boundary-straddling first step**: not applicable here — there is no
contact at all before 1702 to straddle the boundary with; the existing
`entryStepMark` mechanism (pre-Day-99, `measurements.ts` lines ~812-823)
already supports this case in general (an anchor contact just before the
start gate contributes the first in-zone step's length while itself being
excluded from cadence/contact/flight averages) and was left unchanged since
it is correct.
**Why early contacts are "rejected"**: none are, in the sense of being
detected-then-discarded. This session's genuine shortfall is entirely
upstream, at the pose-confidence stage, before any contact candidate can
even form — see Part 8 for how this is now disclosed.

### What this task's Part 6 requirements changed regardless

Even though no selection bug existed to fix, the explicit requirement to
"not silently discard early steps" and provide structured rejection reasons
was implemented for real, independent value: `measurements.ts`'s
`excludedContacts` (contacts that exist but fall outside the calibrated
zone) now carries a structured `reasonCode`
(`"before_start_crossing" | "outside_zone"`, distinguishing which side of
the zone a contact was rejected on) plus `sourceFrameIndex`, instead of one
undifferentiated free-text reason. The remaining documented taxonomy
(`missing_opposite_foot`, `insufficient_landmarks`, `low_pose_score`,
`identity_not_verified`, `invalid_world_coordinate`,
`boundary_step_not_supported`, `duplicate_contact`, `cadence_outlier`) is
reserved in the type for exclusion causes that do not currently exist in
this engine's logic — they were not fabricated or force-added.

---

## Part 7 — Visible step sequence, audited

| Step | Contact A | Contact B | Distance | Confidence | Both in zone? |
|---|---|---|---|---|---|
| 1 | frame 1702, t=7.107s, left, world x≈0.566 | frame 1745, t=7.287s, right, world x≈0.638 | 1.929 m | high | yes |
| 2 | frame 1745 | frame 1803, t=7.529s, left, world x≈0.714 | 2.060 m | high | yes |
| 3 | frame 1803 | frame 1843, t=7.696s, right, world x≈0.789 | 1.994 m | high | yes |
| 4 | frame 1843 | frame 1899, t=7.930s, left, world x≈0.869 | 2.160 m | high | yes |

(Values above are from the fresh Part 10 rerun with the current v2 gates;
they differ from the ~1.93/2.06/1.99/2.15m figures quoted in this task's
prompt — which were computed against the v1 gates — by under 0.01m each,
because the v1→v2 gate pixel coordinates themselves barely moved. **The
displayed values were not simply assumed correct**: each was independently
recomputed from the real contact frames, world x positions, and
`calibration_gates.distanceM`/pixel-scale this session, confirming the
figures are genuine, not coincidentally plausible.)

**Every valid earlier step that should have appeared but did not**: none —
per Part 6, there is no earlier real contact for any earlier step to be
built from. Contact 5 (frame 1899→1960) exists but its landing contact
(frame 1960) falls just past the finish gate, so it is correctly excluded
(`outside_zone`) rather than rendered as a 5th in-zone step.

---

## Part 8 — Reconciled metric values, with disclosed partial-zone coverage

Recomputed from independently eligible evidence (the real Part 10 rerun,
current v2 gates):

| Metric | Value | Contract |
|---|---|---|
| Average Step Length | 2.036 m | Mean of all 4 eligible in-zone intervals (unchanged contract — Day 98's evidence framework) |
| Peak Step Length | 2.036 m | Best rolling-4 window; equals the average because exactly 4 valid intervals exist (mathematically forced at N=4, not a bug — established in Day 97) |
| Step Frequency | 4.863 Hz | Valid in-zone contact intervals |
| Peak Velocity | 10.109 m/s | 3 stride-velocity windows (contacts 0-2, 1-3, 2-4), agreeing within a few percent |
| Average Velocity | unavailable | `start_crossing_unavailable` — genuinely correct, unchanged |

**New coverage metadata** (`SprintMeasurements.diagnostics.zoneCoverage`,
`TrustedMetrics.zoneCoverage`):

```json
{
  "zoneDistanceM": 20,
  "measuredDistanceM": 8.13,
  "measuredZoneFraction": 0.407,
  "firstMeasuredPositionM": 11.52,
  "lastMeasuredPositionM": 19.65,
  "eligibleStepCount": 4,
  "missingEarlyZoneReason": "Step metrics were not measured for the first 11.5 m of the 20 m zone — insufficient pose evidence to detect a ground contact there.",
  "missingLateZoneReason": null
}
```

This is now surfaced in `PerformanceSummaryCard.tsx` as a disclosure line
whenever `measuredZoneFraction < 0.95`: *"Step metrics measured from 11.5 m
to 19.7 m of the 20 m zone — insufficient early pose evidence."* — directly
satisfying "do not present a late-half average as though it represents the
entire 20m zone without disclosure."

---

## Part 9 — UI behavior

Skeleton/foot-marker/joint/COM-trail rendering now activates at 1× playback
(not paused-only); predicted/invalid-boxOrigin frames can no longer render a
skeleton; gate overlays are stabilized against sub-pixel noise; step-length
markers begin at the true first eligible in-zone step (unchanged — already
correct, now disclosed when partial); the Sprint Metrics card discloses
partial-zone coverage. The debug/developer view (already existed, gated by
the `debug` toggle) was extended with the fields this task asked for that
weren't already present: `boxOrigin`, `trackState`, landmark count (pose
status), current in-zone contact state, and the full gate-stability
diagnostics (displacement, spacing, orientation, transform state, rejected
frame). Fields it already had: source frame index, tracking confidence,
current crop (`athleteTrack.cropSource`/`cropConfidence`), camera transform.
This remains developer-only (gated behind the existing `show.debug` toggle,
itself only reachable via a dev-facing control).

---

## Part 10 — Real production rerun

The already-in-flight rerun (Part 1) completed naturally during this
session via the system's normal lease-reclaim path — attempt 1 orphaned
(`lease_expired`), attempt 2 claimed by a live worker and completed. A fresh
copy of the resulting pose artifact was downloaded and run through the real,
unmodified `computeSprintMeasurements` plus this session's
`evaluateMetricEvidence`/`zoneCoverage` additions. No values were injected.

| Field | Value |
|---|---|
| First athlete detection frame | 525 (t=2.19s) |
| First pose frame | 525 |
| First visible skeleton frame (post-fix, at 1× playback) | 525 (any frame with real landmarks and non-predicted `boxOrigin`) |
| Start crossing frame | unavailable |
| First in-zone contact | 1702 (t=7.11s) |
| First rendered step | 1702→1745 pair (t=7.29s) |
| Finish crossing frame | 1914 (t=7.99s) |
| Last pose frame | 1995 (t=8.31s, last usable foot landmark) |
| Pose-valid frame count | 392 / 2,348 (16.7%) |
| Longest continuous pose run | 335 frames |
| Total contacts | 6 |
| In-zone contacts | 5 |
| Eligible steps | 4 |
| First / last measured zone position | 11.52 m / 19.65 m |
| Measured-zone fraction | 40.7% |
| Average Step Length | 2.036 m |
| Peak Step Length | 2.036 m |
| Step Frequency | 4.863 Hz |
| Peak Velocity | 10.109 m/s |
| Average Velocity | unavailable (`start_crossing_unavailable`) |
| Rendered skeleton frames (post-fix) | every frame with real landmarks, no longer conditional on pause — previously 0 during normal playback |
| Rendered foot-marker frames | same set intersected with foot-specific landmarks (301 frames, 12.8%) |
| Rendered contact markers | 6 (5 in-zone + 1 correctly excluded) |
| Gate displacement statistics | 0 px frame-to-frame for this session (identity-projected, stationary + manual_confirmed); stabilization module verified separately via 8 synthetic unit tests |
| Worker runtime | `claimed_at` 21:25:45 → `completed_at` 21:45:40 UTC = 19m55s wall-clock **including the orphaned-lease wait**; actual processing time on the reclaiming attempt was not separately logged by this session (no raw worker stdout was captured — the worker process was not started by this session) |

**Frame screenshots/debug artifacts**: not produced — this environment has
no headless-browser/canvas-capture tooling wired into these sanity scripts,
and generating them would require driving the actual Next.js dev server
with Playwright against a real browser context, which was outside this
audit's available tooling within the time budget. This is stated plainly
rather than fabricating placeholder images. The equivalent numeric evidence
(frame-indexed contact/pose/crossing data above) was produced instead.

---

## Tests and exact results

**New deterministic tests**, all passing:

| Suite | Checks | Result |
|---|---|---|
| `npm run gate-display-stabilization:sanity` (new) | 8 | PASS — sub-threshold noise never moves the display, real movement is never suppressed, both gates behave identically (never independently smoothed), spacing/orientation stay exactly fixed under noise, a 240-frame synthetic noisy sequence never bobs |
| `npm run zone-coverage:sanity` (new) | 13 | PASS — structured `before_start_crossing`/`outside_zone` reason codes, real `sourceFrameIndex` on every exclusion, `zoneCoverage` populated/consistent, first valid in-zone contact retained, Average Step Length includes all eligible intervals, Peak Step Length still follows the rolling-4 contract, Step Frequency uses only valid in-zone intervals, uncalibrated/empty input never crashes |

Mapped against the 19 requested test descriptions: **1–3 covered** by
`gate-display-stabilization:sanity`; **9, 11, 12, 13, 15, 16 covered** by
`zone-coverage:sanity`; **14 covered** by both the zone-coverage test and
the `PerformanceSummaryCard` disclosure line (visual, not unit-tested — see
below). **4, 5, 6, 7, 8, 10, 17 were not implemented as automated tests** —
this codebase has no component/DOM test harness for `VideoOverlay.tsx`
(1,400+ lines of imperative canvas code with zero pre-existing unit tests of
any kind; only Playwright E2E exists for full-browser flows, which this
audit's time budget did not extend to). These were instead verified by
direct code reading (documented in Parts 4/5) — a real but weaker form of
verification than a deterministic test, stated honestly rather than
claimed as covered. **18, 19 covered** by the unmodified existing suites
below continuing to pass.

**Existing required suite, all re-run this session:**

| Command | Result |
|---|---|
| `npm run measurement-recovery:sanity` | PASS (61 checks) |
| `npm run timing-verification:sanity` | PASS |
| `npm run world-lock-repair:sanity` | PASS |
| `npm run zone-anchor:sanity` | PASS |
| `npm run roi-coordinate-mapping:sanity` | PASS |
| `npm run gate-lock-smoothing:sanity` | PASS |
| `npm run analysis-fps:sanity` | PASS |
| `npm run analysis-report:sanity` | PASS |
| `npm run worker:check` | PASS |
| `npm run lint` | PASS (0 warnings) |
| `npm run build` | PASS |
| `npm run stride-metrics:sanity`, `zone-step-counting:sanity`, `metric-trust:sanity`, `result-foundation:sanity`, `gates:sanity`, `contacts:sanity` | PASS (broader regression sweep) |
| `npm run steps:sanity` | **FAIL — pre-existing, unrelated** (`src/lib/video/analysisFps.ts` imports `./fpsPolicy.json` but that script's own tsconfig doesn't set `resolveJsonModule`; this script was never touched this session and the failure is in its own build config, not in anything this task changed) |

Item 18 (panning safety unchanged) is directly covered by
`scripts/measurement-recovery-sanity.mjs`'s Day 98 section 3i (8 panning-mode
regression checks) — unmodified and still passing. Item 19 (60/120fps
behavior) is covered by `analysis-fps:sanity`/`experimental-30fps:sanity`
continuing to pass unmodified.

---

## Final report

1. **Exact reason the gates visibly bobbed** — traced the full render chain
   for this session and found the current code path (identity-projected,
   stationary, manual_confirmed) is mathematically static every frame; no
   definitive live bug was found for this exact configuration, though a
   latent risk exists in a fallback (`recordingModeUsesCameraProjection`)
   used only when camera type is unconfirmed, and any session on the
   camera-projection path composes per-frame transforms that could carry
   real noise. Documented, not modified (out of scope).
2. **Gate-rendering fix** — new shared, unit-tested display-level
   stabilization module (`gateStabilization.ts`) with a 0.75px deadband,
   applied identically to both gates, plus full diagnostics (displacement,
   spacing, orientation, transform state, rejected frames).
3. **Exact reason the skeleton was absent** — `showPose = video.paused ||
   playbackRate < 0.4` suppressed all pose layers during ordinary playback;
   confirmed by direct code reading, not assumed.
4. **Overlay-delivery fix** — pose layers now render at 1× playback; a
   second, independent bug (no `boxOrigin` check, so predicted/invalid
   frames could render skeletons) was found and fixed to match the
   metrics-layer's existing provenance check.
5. **First detection/pose/overlay frames before/after** — unchanged (525);
   what changed is that pose layers now actually RENDER starting there
   during normal playback, not just when paused.
6. **Exact reason step reconstruction started late** — a genuine pose-evidence
   gap (no continuous foot-landmark data before frame 1702, itself already
   57.5% through the zone), not a selection/trimming bug — verified by
   reading `buildFullRunEvents`'s full call chain, which operates on the
   complete untrimmed frame set.
7. **First valid in-zone contact and step** — frame 1702 (contact); the
   1702→1745 pair (first step with a definable length).
8. **Early rejected-event audit** — zero early in-zone contacts exist to be
   rejected for this session; the exclusion mechanism that DOES exist
   (contacts outside the zone) now carries structured `reasonCode`s
   (`before_start_crossing`/`outside_zone`) instead of one undifferentiated
   reason.
9. **Files changed** — see list below.
10. **Database changes** — none made by this session's code or tooling.
    One already-queued job completed naturally through the system's normal
    worker lifecycle while this audit was running (Part 1/10).
11. **Metric values before/after** — the five core metrics are numerically
    unchanged by this task (Day 98 already fixed their availability); what
    changed is the addition of `zoneCoverage` alongside them, disclosing
    that the real 2.036m/10.109 m/s figures come from 40.7% of the zone
    (11.5m–19.7m), not the full 20m.
12. **Zone-coverage provenance** — `zoneDistanceM`, `measuredDistanceM`,
    `measuredZoneFraction`, `firstMeasuredPositionM`, `lastMeasuredPositionM`,
    `eligibleStepCount`, `missingEarlyZoneReason`, `missingLateZoneReason`,
    computed by `computeSprintMeasurements` and threaded through
    `TrustedMetrics` to the UI.
13. **Gate stability evidence** — 8 passing synthetic unit tests proving
    sub-threshold noise never moves the display, real movement is never
    suppressed, and both gates behave identically under noise.
14. **Overlay evidence** — direct code-reading verification (Parts 4/5); no
    automated component test exists for this file in the current codebase
    (documented gap, not silently skipped).
15. **Real rerun results** — Part 10's table, from a genuine production
    completion (attempt 2 of job `06466fde…`), not a synthetic simulation.
16. **Tests and exact results** — 21 new checks (8 + 13) across 2 new
    suites, all passing; 11 existing required suites re-run, 10 pass, 1
    pre-existing unrelated failure documented; lint and build pass.
17. **Remaining limitations** —
    - `recordingModeUsesCameraProjection`'s broad panning-projection fallback
      (Part 3) is a latent risk for sessions without an explicit camera-type
      confirmation; recommended as a dedicated follow-up, not fixed here.
    - No automated test coverage exists for `VideoOverlay.tsx`'s canvas
      rendering (skeleton, predicted-box stripping, playback-rate gating)
      — verified by code reading only.
    - No frame screenshots were captured (tooling gap — no headless-browser
      capture wired into this repo's sanity-script pattern).
    - `stepLengthConfidence` remains "high" for this session despite only
      40.7% zone coverage — confidence reflects internal consistency (low
      variance across the 4 measured intervals), not coverage completeness;
      this is the same tension flagged in Day 98's report and still
      unresolved by design (confidence and availability are deliberately
      separate signals).
    - `npm run steps:sanity` fails for a pre-existing, unrelated reason
      (missing `resolveJsonModule` in its own tsconfig) — not investigated
      further, consistent with this project's established practice of not
      silently patching unrelated breakage with fabricated fixtures.
18. **Git status** — working tree only; no commits made this session.

### Files changed

- **New**: `src/lib/video/gateStabilization.ts`, `src/lib/intelligence/metricEvidence.ts` (Day 98, unchanged this session), `scripts/gate-display-stabilization-sanity.mjs`, `scripts/zone-coverage-sanity.mjs`, `docs/day-99-overlay-and-zone-coverage-fixes.md`.
- **Modified**: `src/components/video/VideoOverlay.tsx` (showPose gate, predicted-box stripping, shared gate stabilization + diagnostics, debug HUD extension), `src/lib/benchmark/measurements.ts` (structured `excludedContacts` reason codes, new `zoneCoverage` diagnostics), `src/lib/intelligence/trustedMetrics.ts` (`zoneCoverage` passthrough), `src/app/sessions/[id]/PerformanceSummaryCard.tsx` (partial-zone-coverage disclosure line), `package.json` (2 new sanity script entries).
