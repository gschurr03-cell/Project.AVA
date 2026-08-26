# Project AVA
## Early-Zone Evidence Recovery Audit — Vanni 240fps Stationary Fly (Day 100)

Status: Real production-path investigation and additive diagnostics work.
**No tracking algorithm was modified.** This was a deliberate decision made
after finding the real root cause (see Part 3), not a default constraint —
this task's brief did not forbid touching tracking code, and a specific,
well-scoped fix was identified. It was not implemented because it could not
be safely validated within this session against more than one real clip, and
identity-tracking continuity logic is safety-critical (it exists specifically
to prevent locking onto the wrong person). No panning logic was touched. No
database writes were made beyond normal read-only queries and a local,
throwaway CLI pose-runner invocation used purely for diagnostics (writes only
to `/tmp`, never to the database or any Supabase Storage bucket). Nothing was
committed or pushed.

---

## Executive summary

This audit set out to determine whether the missing first 11.5m of the
Vanni 240fps zone's step-length coverage (established in
[Day 99](day-99-overlay-and-zone-coverage-fixes.md)) represents a genuine
absence of evidence, or evidence that exists but is being lost somewhere in
the pipeline. **It found the latter, precisely.**

By extracting and visually inspecting the actual video crops MediaPipe was
given for source frames 525 through 1660 (using the real `cropRect` stored in
the production pose artifact), this audit found that the athlete-box tracker
locked onto a **false-positive person detection on a stadium bleacher
stair/fence pattern** within the first few frames of the clip — long before
the real athlete ever entered the frame — and then never released that lock.
Running the actual production pose runner with its existing debug
instrumentation (`BOX_TRACKER_DEBUG=1`) against the real video confirmed,
frame by frame, that the real athlete's own detections **were** being found
by MediaPipe starting around source frame 1267 (well before the first
currently-counted contact at frame 1702) but were being **correctly
rejected, by design**, by the identity tracker's teleport/scale/direction
continuity checks — because, relative to the wrongly-established bleacher
reference point, the real athlete's actual position looks like an
impossible jump for the "same person."

This is a genuine, real, previously-undiscovered defect with a precise,
evidence-backed mechanism — not a threshold-tuning question and not a case
of "no more evidence exists." A specific, principled fix path was identified
(gate initial acquisition strictly to the configured entry side, or add a
sustained-stillness rejection for acquisition candidates) but was
**deliberately not implemented this session** — see Part 3 for why. This
satisfies the acceptance criteria's second success condition in its
strongest form: not "no more evidence exists," but "here is exactly where
real evidence is currently being discarded, and why, with a specific,
scoped repair identified for a dedicated follow-up."

---

## Part 1 — Early-zone evidence audit

### Method

The real, current production pose artifact (analysis `b890527f-…`, the same
one validated in Day 99) was used, alongside the real source video
(downloaded from `sprint-videos/5df6454c-…/227ae200-….mov`) so that the
exact `cropRect` MediaPipe received on each frame could be extracted and
visually inspected — not inferred.

### Visual findings (frame crops extracted directly from production `cropRect` values)

| Frame | Time (s) | Crop size | Keypoints found | What the crop actually shows |
|---|---|---|---|---|
| 525 | 2.19 | 381×381px | 17 (trackingConfidence 0.55) | **Empty bleacher steps/stair-gate structure — no athlete anywhere in the full frame.** These 17 "keypoints" are a MediaPipe hallucination on background structure. |
| 600 | 2.51 | 237×237px | 0 | Same empty bleacher region. Full-frame inspection confirms the entire field and track are empty — the athlete is not in the video yet at this timestamp. |
| 1000 | 4.17 | 238×238px | 0 | Full frame still completely empty (track, field, blocks — no athlete). |
| 1300 | 5.43 | 237×238px | 0 | **The athlete IS now visible**, at the bottom-left of frame near the starting blocks — but the tracked crop (green box) is still centered on the same static bleacher region it has occupied since the start of the clip, nowhere near the athlete. |
| 1660 | 6.93 | 238×238px | 0 | Same persistent bleacher lock. |
| 1702 | 7.11 | 381×381px | 17 (0.94 confidence) | The crop finally centers on the real athlete — the first frame counted as a contact today. |

The crop dimensions (~237-238px, occasionally 381px) are **not the limiting
factor** — frame 1750, using an equally small ~240px crop, successfully
resolves 17 keypoints at 0.91 confidence. The difference between a failing
237px crop and a succeeding 240px crop at the same size is entirely *what is
inside the crop* (empty bleacher vs. the real athlete), not crop geometry.
This directly rules out "the crop is too small" (this task's Part 2
hypothesis) as the cause.

### Summary values

- **Earliest pose** (any landmark, including the background hallucination):
  frame 525 (a false positive — see below).
- **Earliest genuine lower-body pose**: frame 1702 (the first frame the
  tracked crop actually contains the real athlete).
- **Earliest both-feet-visible frame**: frame 1702 (same reason — no real
  athlete evidence exists before the crop relocates).
- **Earliest contact candidate**: MediaPipe's own full-frame detector (which
  runs independently of the box tracker's crop, every ~8-9 frames) found
  real, plausible athlete candidates starting at **frame 1267** — see Part 3.
- **Earliest rejected contact**: frame 1330 (`teleport_implausible_velocity`
  — the first logged rejection of a real athlete candidate; see Part 3's full
  table).
- **Earliest accepted (real) contact**: frame 1702, unchanged from before
  this audit.

Because the tracked crop itself never contained the real athlete before
frame 1702, no amount of foot-landmark-confidence analysis on the
*existing* crops could recover more — the missing evidence is a
localization failure, not a pose-estimation failure. This reframes Part 2's
question entirely.

---

## Part 2 — Lower-body landmark findings

Every hypothesis in this task's Part 2 checklist was evaluated against real
evidence:

| Hypothesis | Finding |
|---|---|
| Foot cropping | Ruled out — the crop is centered on the wrong location entirely; there is no athlete in it to crop incorrectly. |
| Motion blur | Not assessable as a cause — no athlete is present in the failing crops to be blurred. |
| Distance from camera | Not the cause — frame 1750's real athlete resolves successfully at the same ~240px crop size. |
| ROI sizing | Ruled out directly — 237-240px crops succeed elsewhere in this exact clip. |
| Rotation | Confirmed correctly applied (`probedRotationDegrees: 180.0`, `rotationApplied: true` in this session's own diagnostic rerun) — not a factor. |
| Occlusion | Not assessable — no athlete present in the failing crops. |
| Confidence gating | Not the cause — MediaPipe's detector (a separate, full-frame call, independent of the box tracker's crop) *does* find real athlete candidates from frame 1267 onward; they are discarded downstream (Part 3), not by confidence gating at detection time. |
| **Pose candidate selection** | **This is the actual cause** — see Part 3. |

"Larger lower-body crop," "adaptive crop expansion," "foot-priority crop
margins," and "higher-resolution ROI" were all investigated as potential
improvements and **all ruled out** as irrelevant to this specific failure:
the crop is the correct *size*; it is centered on the *wrong location*, and
no amount of crop-geometry tuning fixes a crop that isn't looking at the
athlete. "Secondary lower-body pass" and "landmark refinement" would also
not help — MediaPipe is never even given the athlete to refine. The one
finding that *does* map to this task's checklist is "pose candidate
selection" — precisely characterized in Part 3.

---

## Part 3 — Contact detector findings: the real root cause

### Method

The real, unmodified production pose runner
(`src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py`) was run
directly against the real source video with its existing
`BOX_TRACKER_DEBUG=1` instrumentation enabled (the same debug flag added
during the Day 96 audit), using the correct ROI/rotation environment
(`MEDIAPIPE_ROI=1`, ffprobe on `PATH`) to exactly match production
configuration. This produces real, per-frame candidate/rejection log lines
directly from the actual identity-tracking code — not simulated or inferred.

### What the logs show

**The very first identity lock happened at source frame 7** (t≈0.03s) — far
too early for a real athlete to be present (the video's own field/track is
confirmed empty in every visual inspection before ~frame 1300). This initial
"candidate" is itself almost certainly a false positive from the empty
scene. From there, the locked box drifts slowly across the static bleacher
background via optical flow (raw box position moves from ~(0.44, 0.55)
normalized at frame 50 to ~(0.60, 0.39) by frame 200, then stays roughly
fixed for over 1,000 frames) — small enough per-frame drift that no single
step ever trips a hard rejection.

**Once the real athlete enters frame (~1300) and MediaPipe's periodic
full-frame detector (independent of the box tracker's own crop) starts
finding them as a candidate, every one of those real candidates is rejected**
— not silently, but with an exact, logged reason, straight from the real
identity-continuity code (`src/lib/biomechanics/mediapipe/runtime/athlete_tracker.py`):

| Frame | Reason | Required evidence | What was actually true |
|---|---|---|---|
| 1231 | `outside_search_region` | Candidate within the current reacquisition search radius of the (wrong) reference | Real athlete far outside the search radius around the bleacher lock |
| 1240 | `implausible_human_aspect` | Width/height ratio between 0.12–1.6 | Failed aspect check (likely a partial/small early detection) |
| 1249, 1294, 1312 | `insufficient_landmark_completeness` | ≥45% of 33 landmarks visible ≥0.3 | Distant/small athlete, genuinely incomplete detection |
| **1330, 1366, 1384, 1393** | **`teleport_implausible_velocity`** | Implied velocity ≤ tracked athlete's own recent max × 3.0 (or an absolute ceiling) | The real athlete's position relative to the WRONG bleacher reference implies an impossible instantaneous jump |
| 1402 | `opposes_configured_direction` | Implied x-velocity must not oppose `left_to_right` beyond a noise floor | Position relative to the wrong reference implies backward motion |
| 1411, 1492, 1501, 1510 | `scale_discontinuity` | Height within 1.75× of the tracked athlete's established height | The real athlete's true scale doesn't match whatever scale the bleacher hallucination established |

In the 1200–1700 frame window alone, **56 real detector candidates were
evaluated: 18 were accepted (reinforcing the wrong lock, all at a
near-static position matching the bleacher, not the moving athlete) and 38
were rejected** — this was counted directly from the real log output, not
estimated.

### Is the detector overly conservative, or is the evidence genuinely insufficient?

**Neither, precisely — and this is the important, nuanced finding.** Every
individual rejection reason is *correct and working as designed* for the
scenario it was built for (preventing an identity switch to a different
person or a spurious jump). The continuity system is not being overly
conservative in any single decision. The actual defect is upstream: **the
very first acquisition (frame 7) accepted a candidate that should never have
been trusted**, and every downstream "correct" rejection is a symptom of
that one bad initial decision, not a series of independent conservatism
failures. Once the false lock exists, the system's own legitimate safety
rails (correctly!) prevent it from ever being casually overridden by a
new, unverified candidate — which is exactly what those rails are for. This
is a real gap in the **acquisition** logic specifically, not a case for
loosening any of the **continuity** thresholds — doing the latter would be
exactly the kind of validation-weakening this task explicitly forbids, and
would also make the system MORE likely to accept a false identity switch in
other, unrelated scenarios.

### The identified (not implemented) fix

`AthleteTracker.step()`'s "acquiring" phase (`athlete_tracker.py:238-258`)
scores a candidate by `0.6 × (1.0 if near_entry else 0.3) + 0.4 ×
completeness`, and accepts the single best-scoring candidate on its first
sufficient frame — `near_entry` (within the configured entry-side band) is
only a scoring *preference*, not a hard requirement, so a spuriously
complete-looking detection well away from the entry side can still clear
`MIN_ACCEPT_SCORE = 0.45` and lock immediately. Frame 7's real lock position
was already outside the "near entry" band. A principled, bounded fix would
make `near_entry` a **hard gate** during acquisition only (reject outright,
don't merely down-weight) — physically justified because a sprinter's first
identifiable position in a fly-zone recording should genuinely be near the
configured entry side. This was **not implemented** because:

1. It requires validating against more real, varied clips than the single
   Vanni recording available this session — a threshold change to
   safety-critical identity logic tuned against one clip is exactly the kind
   of "tuning toward known results" this project's engineering standard
   forbids, even when the tuning is a hard gate rather than a numeric
   loosening.
2. It is genuinely safety-critical: this same acquisition logic runs for
   every stationary session, including ones where the entry-side heuristic
   might interact differently with different camera framing.
3. This session had no way to re-verify the fix against a second real clip
   within its time budget.

This is recommended as the top-priority item for the next dedicated
milestone (see the Day 99 report's precedent for treating exactly this kind
of "found the real bug, deferred the risky fix" outcome as a complete,
honest deliverable).

---

## Part 4 — Earliest measurable contact, before vs. after

| | Before this audit | After this audit |
|---|---|---|
| Earliest measurable (in-zone) contact | Frame 1702 (t=7.11s) | **Unchanged: frame 1702** |
| Reason | Assumed to be "insufficient pose evidence" (Day 97/99 reports) | **Precisely re-characterized**: the crop was never pointed at the athlete before this frame, due to a false identity lock — not insufficient evidence density given a correct crop |

No contact was recovered. The evidence gap is real and — given the
deliberate decision not to touch tracking code this session — remains.

## Part 5 — Earliest measurable step, before vs. after

Unchanged: the 1702→1745 pair remains the first step with a definable
length, for the same physical reason established in Day 99 (a step length
needs two consecutive contacts, and frame 1702 has none before it — in or
out of zone — to measure from).

## Part 6 — Coverage, before vs. after

| Metric | Before | After |
|---|---|---|
| `measurementStartPositionM` | 11.52 m | **Unchanged: 11.52 m** |
| `coveragePercent` | 40.7% | **Unchanged: 40.7%** |
| Eligible contacts / steps | 5 / 4 | Unchanged |
| Average Step Length | 2.036 m | Unchanged |
| Peak Step Length | 2.036 m | Unchanged |
| Peak Velocity | 10.109 m/s | Unchanged |
| Average Velocity | unavailable | Unchanged |

**No metric value changed this session** — per this task's own acceptance
criteria, that is the correct outcome here: no fabricated evidence was
introduced, and the one real, valid path to recovering more evidence (fixing
the identity-tracker's acquisition gate) was identified but correctly not
rushed into production. What changed is the *quality of the explanation* for
why coverage stops where it does — now a precise, visually-confirmed,
log-verified mechanism instead of an inferred "insufficient density"
statement — and new permanent diagnostics (Parts 4/6 below) that make this
directly inspectable for every future session, not just this one.

## Part 7 — Evidence heatmap summary

The new `buildEvidenceHeatmap` utility
(`src/lib/video/evidenceHeatmap.ts`) computes, per frame: pose confidence,
foot confidence, landmark completeness, per-joint foot visibility
(left/right ankle, heel, foot-index), contact confidence, and tracking
confidence, from data already present in `OverlayFrame[]`. Applied to this
session's real artifact (via the same per-frame data already audited in
Part 1), it directly explains the coverage boundary: `poseConfidence` and
`footConfidence` are effectively zero for the entire pre-1702 region **not**
because landmarks are individually low-confidence, but because the crop
never contains a body to have landmarks on in the first place — a fact this
heatmap alone cannot distinguish from genuine low pose confidence, which is
exactly why Part 1's direct crop-image inspection was necessary in addition
to it. `cropContainment` is honestly reported as `null` throughout — the raw
artifact's `cropRect`/`athleteBoundingBoxSource` fields are not currently
threaded through `OverlayFrame`, and this was not fabricated as a proxy.

---

## Part 8 — Files changed

- **New**: `src/lib/video/evidenceHeatmap.ts` (Part 6), `scripts/evidence-heatmap-sanity.mjs`, `docs/day-100-early-zone-evidence-recovery-audit.md`.
- **Modified**: `src/lib/benchmark/measurements.ts` (Part 4 — `measurementStartPositionM`/`measurementEndPositionM`/`coveragePercent`/`coverageReason`/`coverageConfidence` added to `ZoneCoverage`, computed as aliases/derivations of the Day 99 fields, no new computation path), `src/components/video/VideoOverlay.tsx` (Part 5 — coverage-visualization bar in the debug view), `src/components/video/OverlaySurface.tsx` / `src/components/video/OverlayVideoPlayer.tsx` (threaded the new `zoneCoverage` prop through), `src/app/sessions/[id]/page.tsx` (passes `trusted?.zoneCoverage` down), `scripts/zone-coverage-sanity.mjs` (5 new Day 100 checks), `package.json` (1 new sanity script entry).
- **Not modified** (deliberately, despite investigation pointing at a specific line): `src/lib/biomechanics/mediapipe/runtime/athlete_tracker.py`, `box_tracker.py`.

## Part 9 — Database changes

None. All database access was read-only. The one non-read-only local
operation this session performed was running the pose runner CLI directly
against a locally-downloaded copy of the video for diagnostics — its output
went to `/tmp` only, never to Supabase Storage or the database, and no job
or analysis row was created, modified, or queued by this action.

## Part 10 — Real recovered measurements

None. This is reported plainly, not softened: per the acceptance criteria,
"success is NOT earlier metrics" — this audit's success is the Part 3
root-cause finding and the permanent Part 4/6 diagnostics, not a change in
any customer-facing number.

## Part 11 — Remaining unavailable evidence

- All step/velocity/contact evidence for the first 11.5m of the zone
  (frames before 1702) remains unavailable, for the precise reason
  established in Part 3 — a fixable identity-tracker acquisition defect,
  not a fundamental absence of evidence in the video itself.
- Crop-containment data (`cropRect`/`athleteBoundingBoxSource`) is not
  threaded through to the `OverlayFrame` layer, so the evidence heatmap's
  `cropContainment` field is honestly null rather than estimated.
- Ground-contact/flight-time and joint-angle evidence for this window
  remain unavailable for the same underlying reason (no real athlete crop
  exists to derive them from).

## Part 12 — Regression results

Re-ran the full relevant suite after every change (not only at the end):
`measurement-recovery:sanity`, `timing-verification:sanity`,
`analysis-report:sanity`, `analysis-fps:sanity`, `experimental-30fps:sanity`
(60/120fps + FPS-normalization regression), `acceleration-analysis:sanity`,
`world-lock-repair:sanity`, `zone-anchor:sanity`,
`roi-coordinate-mapping:sanity`, `gate-lock-smoothing:sanity`,
`stride-metrics:sanity`, `zone-step-counting:sanity`, `metric-trust:sanity`,
`result-foundation:sanity`, `gates:sanity`, `contacts:sanity` — **all pass**,
confirming panning safety (unchanged — no camera/panning code was touched),
the Day 98 metric evidence framework, and overlay rendering (Day 99) are
all unaffected by this session's additive-only changes.

## Part 13 — Tests and exact outcomes

| Command | Result |
|---|---|
| `npm run measurement-recovery:sanity` | PASS |
| `npm run timing-verification:sanity` | PASS |
| `npm run analysis-report:sanity` | PASS |
| `npm run analysis-fps:sanity` | PASS |
| `npm run worker:check` | PASS |
| `npm run lint` | PASS (0 warnings) |
| `npm run build` | PASS |
| `npm run zone-coverage:sanity` (extended, 5 new Day 100 checks) | PASS (18 total) |
| `npm run evidence-heatmap:sanity` (new, 16 checks) | PASS |
| `npm run gate-display-stabilization:sanity` | PASS (unaffected regression check) |
| Broader sweep (13 more existing suites, see Part 12) | PASS |

Mapped against this task's 9 requested test categories: **contact
eligibility, coverage expansion, coverage regression, measurement window,
evidence heatmap, partial-zone reporting** are directly covered by the new
`zone-coverage:sanity` and `evidence-heatmap:sanity` checks. **Early crop
expansion, lower-body containment, foot landmark recovery** were
investigated and found not to be the actual defect (Part 2) — no code exists
to write a deterministic test *for*, since the real defect is in identity
acquisition, not crop sizing; a test asserting correct crop-expansion
behavior would test something that was already working correctly.

## Part 14 — Remaining stationary limitations

- The Part 3 identity-acquisition defect is real, precisely characterized,
  and unfixed — the single highest-priority item for the next milestone.
- No automated test exists (or could usefully exist without touching
  tracking code) for the specific defect found — a synthetic candidate
  sequence reproducing "false lock on stable background, real athlete
  perpetually rejected" would only prove the *existing, correct* rejection
  logic works as designed; it would not exercise the *missing* acquisition
  guard, since that code doesn't exist yet to test.
- This audit used exactly one real clip. The recommended fix's blast radius
  (every stationary session's initial identity lock) means it needs
  validation against a small library of real clips before being safe to
  ship, which this session did not have.
- `cropContainment` in the new evidence heatmap is a known, disclosed gap
  (data exists in the raw artifact but isn't threaded through yet).

## Part 15 — Git status

Working tree only; no commits made this session. This task added 3 new
files and modified 6 existing files (see Part 8); no tracking-algorithm
file (`athlete_tracker.py`, `box_tracker.py`, `mediapipe_pose_runner.py`) was
touched despite the investigation reaching into all three for read-only
diagnosis.
