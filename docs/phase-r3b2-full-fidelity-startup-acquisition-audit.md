# Phase R3B-2 — Full-Fidelity Startup Acquisition + Time-Normalized Early-Evidence Audit

**Status: EVIDENCE-ONLY audit COMPLETE. Zero production code changed.**

## 1. Executive summary

The core question — does the ~51.5% completeness ceiling R3B-1 observed
reflect real MediaPipe capability or a stored-artifact limitation? — is
answered decisively: **it is a stored-artifact limitation.** Real, isolated
MediaPipe inference (using the exact tiled-fallback method
`mediapipe_pose_runner.py` itself already uses for small/distant athletes)
against the original source video reaches completeness values of 0.45–1.0,
with the top 10% of real detected frames reaching **100%** — far above the
17/33=51.5% ceiling the stored artifacts impose (they only ever persist 17
of MediaPipe's 33 raw landmarks).

However, replaying this real, full-fidelity evidence through the actual
`AthleteTracker` state machine (both with and without R3B-1's fix) reveals a
**second, previously-undiscovered nuance**: real tiled detection is
*intermittent* (the athlete is not found on literally every frame, even
across a short 500–600ms window), which breaks the "sustained ≥96%
completeness across every consecutive hit" requirement for three of four
benchmarks. R3B-1's fix fires dramatically for Vanni 240 (275ms→12.5ms, a
real, contiguous run of 100%-complete frames existed there) but not for
Gav/Vanni60/Vanni120 in this replay. The most robust discriminator found is
**bilateral torso completeness** (both shoulders + both hips), present in
81.7% of all real detected frames — far more reliable than full 33-point
completeness (63.6% median) — while remaining a strong anti-background
signal (harder to hallucinate a coherent 4-point bilateral structure than
scattered points; the real Day 100 incident never demonstrated it).

## 2. Prior architecture inherited

R3A's warmup measurements; R3B-1's exact identity gate
(`ready_to_promote()`/`MIN_CUMULATIVE_DISPLACEMENT`) and its safe, additive
`ready_via_strong_pose()` fix (0.96 completeness / 0.75 score, unchanged
this phase).

## 3. Prior findings independently verified

R3B-1's own honest limitation (stored artifacts cap completeness at 51.5%,
so the fix is dormant against them) — verified structurally, then
**independently confirmed empirically** via real inference this phase.

## 4. Findings corrected/disproved

R3B-1 did not claim the 51.5% ceiling was a TRUE capability limit — it
correctly flagged this as unconfirmed. This phase resolves that open
question in favor of "storage artifact," not "true limit," and additionally
discovers the intermittency nuance R3B-1 could not have found without real
inference.

## 5. Where the ~51.5% completeness ceiling originates

`mediapipe_pose_runner.py`'s `TRACKER_LANDMARK_NAMES` maps only 13–17
biomechanically-relevant point indices; `candidate_from_landmarks()`'s
`completeness = present / len(landmark_points)` denominator is the FULL raw
MediaPipe output length (33) in real production, but this project's stored
JSON pose artifacts (`tmp/phase94/*.pose.json`) only ever persist those
13–17 named points — any replay reconstructed from stored data alone can
never exceed 17/33=0.515, regardless of what MediaPipe actually saw.
Confirmed directly by real, isolated MediaPipe inference this phase.

## 6. Full-fidelity Vanni60 startup evidence

`tmp/phaseR3B2/full-worker-startup-traces/vanni60.json`. Frame 7: **not
detected** by the tiled search at that exact frame (methodology note:
detection intermittency is real, not merely a stored-artifact effect).
Frame 20: also not detected directly, but frame 21 (350ms — exactly where
R3A's `boxOrigin` flips to `"detected"` in the real pipeline) shows raw
completeness **0.970**, torso complete. Nearby frames reach 0.6–1.0
repeatedly (frames 6, 27, 30, 32, 33 all ≥0.9). Real evidence clearly
EXISTS in this window at high quality — it is simply not perfectly
contiguous frame-to-frame.

## 7. Full-fidelity Gav startup evidence

`tmp/phaseR3B2/full-worker-startup-traces/gav.json`. First 2 frames
undetected, then frame 3 (50ms) onward reaches 0.45–0.97 with torso complete
essentially every time a detection occurs, but with similar intermittent
gaps (frame 19 undetected, etc.).

## 8. Vanni120 result

Similar pattern: frequent detections (68/72 = 94% of frames), completeness
ranging 0.06–1.0, torso complete on the large majority. More contiguous
than Vanni60/Gav, but still not perfectly gap-free within the earliest
several frames.

## 9. Vanni240 control

**No new noisy early acquisition** — confirmed. Vanni 240's own
counterfactual replay shows a real, LEGITIMATE improvement (275ms→12.5ms)
because its very first ~10 frames (0–41.7ms) had a genuinely CONTIGUOUS run
of 97–100% completeness — not noise, not a false positive; the athlete is
simply large/close/clear at this camera's earliest frames. `steps.ts` was
not touched this phase, so no downstream contact-set change is possible
regardless.

## 10. Whether 0.96 completeness is realistic

**Reachable but not the best choice.** p90/p95/max of all 240 real detected
frames across all 4 benchmarks = 1.0 — the threshold is not physically
unreachable. But because MediaPipe detection is intermittent even for a
genuinely-present, trackable athlete, requiring it to be *sustained across
every one of `MIN_VERIFICATION_HITS` consecutive hits* is fragile in
practice — three of four benchmarks show the fix not firing in this
phase's real replay, purely due to gaps between otherwise-strong detections.

## 11. Best true-athlete vs. false-candidate discriminator

**Bilateral torso completeness** (both shoulders + both hips present at
sufficient visibility): present in 81.7% of all real detected frames vs.
63.6% median full-body completeness — a meaningfully more available signal
— while remaining strongly discriminating against background clutter (the
real Day 100 incident's own best frame never demonstrated a complete
bilateral torso structure at trustworthy confidence). Full detail:
`tmp/phaseR3B2/true-vs-false-evidence-separation.json`.

## 12. Detector cadence timebase result

`detector_cadence_frames=8` = 133.3ms@60fps / 66.7ms@120fps / 33.3ms@240fps.
**Does not affect startup latency** — confirmed (again) structurally:
`wants_detector_frame()` returns `True` every frame while
`track_state == "acquiring"`, bypassing the cadence throttle entirely during
exactly the window this audit investigates.

## 13. Smoothing-window timebase result

`smoothingWindowFrames=3` = 50ms@60fps / 25ms@120fps / 12.5ms@240fps.
**Does not affect startup identity at all** — it lives in `steps.ts`
(contact detection), an entirely separate module from the identity-
acquisition layer (`athlete_tracker.py`) this phase audits. Remains R3A's
original deferred exploratory scope, unrelated to this phase's findings.

## 14. Whether earlier identity actually restores contacts

Not independently re-verified this phase via a fresh contact-detector rerun
(steps.ts was not touched, and no new analysis artifact was written,
per this phase's explicit scope). Structurally: earlier trusted identity
means more real pose frames become eligible input to the unchanged
`detectStepMarks()`, which can only surface contacts that already have real
underlying foot-landmark evidence — it cannot fabricate one. For Vanni 240,
where identity now locks at 12.5ms (frame 3) instead of 275ms (frame 66),
substantially more of the run's early real pose evidence becomes eligible;
whether this recovers any specific NEW contact was not independently proven
this phase (would require a full fresh worker+contact rerun, explicitly out
of scope).

## 15. Exact next implementation recommendation

**CASE B + CASE D (multi-factor).** Recommend a narrowly-scoped future
phase (tentatively R3B-3) to evaluate replacing/supplementing the current
full-33-point `EARLY_ACQUISITION_MIN_COMPLETENESS` path with a
torso-specific sustained-presence contract (bilateral shoulders+hips,
across the same `MIN_VERIFICATION_HITS`), which this phase's real evidence
suggests is both safer and more achievable. **Not implemented this phase**
— audit and replay only; `athlete_tracker.py` is byte-identical to R3B-1's
own committed state. Detector cadence and smoothing-window redesigns remain
explicitly out of scope (neither is the startup bottleneck).

## 16. Tests

`scripts/phase-r3b2-full-fidelity-audit-sanity.py` — **13/13 passing**.

## 17. Scientific regression

Zero production files changed this phase. `scripts/phase-r3b1-startup-localization-sanity.py`
(20/20), `box-tracker-sanity.py`, `cross-athlete-coast-risk-sanity.py`, and
all other R3B-1-verified Python suites re-run clean.

## 18. Phase status: COMPLETE (audit only)

## 19. Current remediation-roadmap status

R3A closed; R3B-1 implementation complete (safe, dormant against stored
data); R3B-2 audit complete, recommending a scoped R3B-3 (not started).

## 20. Legacy roadmap completion

Unweighted forensic work — no percentage claimed.

## Anything not personally validated

A full fresh worker + contact-detector rerun writing a new analysis
artifact (would create real production data, explicitly avoided). The
exact per-frame reason tiled detection misses some frames (network
confidence internals) was not further decomposed — treated as an observed,
real characteristic, not reverse-engineered further.

## Files changed

None in `src/`. New: `scripts/phase-r3b2-raw-inference-trace.py`,
`scripts/phase-r3b2-full-fidelity-replay.py`,
`scripts/phase-r3b2-full-fidelity-audit-sanity.py`, this report,
`tmp/phaseR3B2/`.

## Git status

No commit, push, `db:reset`, or database mutation. Worktree remains
intentionally dirty with all prior uncommitted phases' work preserved.

**STOP AFTER R3B-2 AUDIT.**
