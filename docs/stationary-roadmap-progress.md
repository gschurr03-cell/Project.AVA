# Project AVA
## Stationary Sprint Analysis Roadmap v4.0 — Progress Tracker

**Last updated**: 2026-08-10 (the separate **PHASE 9 REMEDIATION BLOCK** — step numbers, skeleton continuity/spatial fidelity/style, and residual Auto Follow skip, commissioned after a real 2026-08-09/10 user test — is now **100% RESOLVED**. See the dedicated section immediately below and `docs/phase-9-4-end-to-end-remediation-validation.md`. This is a separately-tracked effort and does NOT change this file's own legacy weighted completion, which remains 29.5%.)
**Last updated (legacy)**: 2026-08-07 (Phase 6.2 is **CLOSED** after real authenticated browser playback validation on all four benchmarks. Overall weighted completion remains 29.5% because Phase 6.2 is unweighted. See `docs/phase-6-2b-browser-playback-closure.md`.)
**Current active phase**: No roadmap item remains in progress from the Phase 6.2 browser-playback blocker. Phase 6.2 and Phase 6.6A are CLOSED without weighted credit. Phases 7.2/7.2B, 7.3A and 7.3B, Phases 6.6B, 6.6C, and 6.6D, and Phases 7.0 and 7.1 are CLOSED (unweighted); Phases 6.1, 6.3, 6.4, and 6.5 remain CLOSED. Phase 4.2 and Phase 5.0E remain CLOSED.
**Next phase**: NOT another localization/box-tracker phase — six independent evidence families (four real-time box/pose-agreement variants, one retroactive variant, and Phase 4.2K's genuinely independent bidirectional-trajectory check) have now converged on the same conclusion: Vanni 240's residual zone-metric gap is a pose-availability/detector-capability limit, not a localization defect. See `docs/phase-4-2k-independent-localization-verification.md` Section 26: the well-evidenced next step is a pose-backend/small-subject-detection capability evaluation (roadmap Phase 5 "Cross-FPS tracking normalization" or Phase 6 "Conditional detector architecture upgrade").

> **Known discrepancy in the phase weights, flagged rather than silently
> fixed**: the original 18 phase weights (4, 7, 8, 7, 10, 7, 10, 8, 6, 9, 5,
> 3, 5, 4, 3, 2, 6, 1) sum to **105%**, not 100% as specified. No individual
> weight was altered — there is no way to know which one was meant to be
> different without asking. **A 19th phase, Phase 4.1 (weight 4%), was
> inserted after Phase 3 on 2026-08-05**, authorized by the task that
> commissioned it as a new, previously-unplanned phase reacting to Phase 3's
> correction findings — a second, disclosed contributor to the same gap.
> **A 20th phase, Phase 4.2 (weight 3%), was inserted after Phase 4.1 on
> 2026-08-05/06**, authorized by the task that commissioned it as a new,
> previously-unplanned phase reacting to Phase 4.1's own correction (the
> freeze/stationary-lock finding) — a third, disclosed contributor. The
> total weight pool is now **112%** (105% + 4% + 3%).
> `npm run stationary-validation-registry:sanity` deliberately checks for an
> exact 100% total and will fail on this until a human corrects the intended
> weight(s); see `docs/phase-0-validation-registry-report.md` for the honest
> test result. All percentages below are computed two ways: **as specified**
> (weights sum to 112%) and **normalized** (rescaled so they sum to 100%),
> so the tracker is usable either way until the discrepancy is resolved.

> **Separate, unreconciled discrepancy, also flagged rather than silently
> fixed, now audited a third time (Phase 4.2C, per that task's own explicit
> "audit before modifying anything" instruction)**: the tasks that
> commissioned Phase 4.2B and Phase 4.2C both stated "current overall
> roadmap completion: 28.8%" and referenced a "maximum roadmap completion
> after Phase 4.2" of 31.8%. This still does not match this file's own
> honestly-recomputed value at either point in time (27.5% as of Phase
> 4.1's completion; 26.8% after Phase 4.2's own 3%-weight insertion grew
> the pool to 112%). Phase 4.2C's audit specifically checked whether a
> different, undisclosed pool size could produce 28.8% from the SAME raw
> weighted sum (30.0): **30.0/104 ≈ 28.8%** is the only close match found,
> which would require an un-evidenced 8-point reduction in the weight pool
> this file has no textual basis for — reported as an arithmetic curiosity,
> not adopted. No individual weight or phase-completion value was altered
> to force a match, in either direction. This section continues to report
> this file's own from-scratch derived value (26.8% as of Phase 4.2's
> insertion, unchanged by Phase 4.2C since Phase 4.2 still contributes 0% —
> see the "Overall completion" section below and
> `docs/phase-4-2c-crop-provenance-and-benchmark-validation.md` Section 2
> for the full audit) rather than silently substituting the task-asserted
> 28.8%/31.8% figures.

---

## Overall completion

**Phase 3's correction audit is complete as of 2026-08-05.** Its disputed visual
claim (athlete occluded by a bin, frames 247–249) was independently reverified,
found false, and corrected to the true cause (a box-tracker localization failure —
see Phase 3's section below and `docs/phase-3-vanni-120-visibility-correction.md`).
Every acceptance criterion was re-proven honestly after the correction (not held at
its prior value by default), and all 14 are satisfied — Phase 3 returns to 100%
completion, per the explicit contingency that allowed it to do so if and only if
the correction proved every criterion still holds.

Using weighted completion = Σ(phase weight × phase completion fraction).
Phase 0 (weight 4, complete), Phase 1 (weight 7, complete), Phase 2 (weight 8,
complete), Phase 3 (weight 7, complete — corrected), and Phase 4.1 (weight 4,
complete) all contribute fully. **Phase 4.2 (weight 3) now contributes its
full 3.0% — marked Complete as of Phase 4.2K (2026-08-07).** Phase 4.2's own
charter (ensure the localization box never confidently remains on the wrong
thing) has now been tested via SIX independent evidence families across
three architectural layers (four real-time box/pose-agreement variants,
4.2G-I; one retroactive variant, 4.2J; and Phase 4.2K's genuinely
independent, zero-new-dependency bidirectional-trajectory cross-check) —
wherever a verdict was reachable, the box's real position was proven
correct. Phase 4.2K's real production reruns show a genuine, non-baseline-
chasing improvement on Vanni 240 (`validContacts` 6→7,
`combinedStepFrequencyHz` 2.367→3.103) and Vanni 60 (`validContacts` 9→10),
zero regression on Gav (exact byte match) and Vanni 120 (exit stays
honest). Vanni 240's remaining gap against its original Phase 1/2 baseline
(11 contacts, 4.858 Hz) is real and disclosed, but is now re-attributed —
not a localization defect, but a MediaPipe pose-availability limit at this
camera's small-athlete framing (native full-frame detection cannot find
this athlete at all; even the existing tile-upscale fallback is unreliable
— see `docs/phase-4-2k-independent-localization-verification.md` Section
6), squarely outside Phase 4.2's own scope. Per this task's own explicit
instruction not to hold Phase 4.2 open indefinitely once its own
localization contract is honestly verified rather than requiring full
metric recovery, Phase 4.2 closes here. See
`docs/phase-4-2k-independent-localization-verification.md` Section 22 for
the complete closure decision and evidence trail.
Normalization: `normalized phase weight = original phase weight / 112 × 100`.

| Basis | Raw weighted sum | Total weight pool | Completion % | Remaining % |
|---|---:|---:|---:|---:|
| As specified (literal weights, sum to 112) | 33.0 | 112 | 29.5% | 70.5% |
| Normalized (weights rescaled to sum to 100) | 29.464 | 100 | 29.5% | 70.5% |

**Overall stationary roadmap completion (normalized): 29.5%**
**Remaining (normalized): 70.5%**

This is an INCREASE from the pre-Phase-4.2K figure (26.8%) — Phase 4.2's
full 3%-weight now contributes to the numerator for the first time. The
weight-pool discrepancy note above is retained, not resolved or
renormalized, per this phase's own explicit instruction. See
`docs/phase-4-2b-frozen-track-production-wiring.md` through
`docs/phase-4-2k-independent-localization-verification.md` for the complete,
ten-subphase evidence trail behind this closure.

Phases 0, 1, 2, 3, 4.1, and 4.2 have all been validated against their
acceptance criteria on real benchmark recordings, including real production
worker reruns for Phase 1 (one benchmark), Phase 4.1 (all four benchmarks),
and Phase 4.2 (all four benchmarks, ten subphases) and a full correction
audit with visual source-frame proof for Phase 3 (Phases 2 and 3 both
required no code change — root cause in both cases was proven to be
evidence availability / an out-of-scope shared-code bug, not a fixable
contact-logic defect within their own scope). No other phase is complete
because related code exists from prior work (Days 96–104) — per this
roadmap's own rule, that prior work is linked as foundation evidence below,
not auto-credited.

---

## PHASE 9 REMEDIATION BLOCK (separate tracker — not the legacy "Phase 9" row below)

**This is a distinct, separately-tracked remediation effort commissioned after a
real manual user test on 2026-08-09/10, unrelated to the legacy numbered
"Phase 9 — Wind-aware gate stability" row in the Phase table below (that item
remains Not Started, 0%, unaffected by this block).** It exists to track and
close four issues the user actually observed: apparent missing step numbers,
skeleton continuity/dropout, skeleton not "painted on," and residual Auto
Follow skip at 240 FPS.

| Sub-phase | Issue | Resolution method | Status |
|---|---|---|---|
| 9.0A | Step-number disappearance | **EVIDENCE / NO FIX REQUIRED** — no selective production rendering defect found; all 43 expected step identity numbers reproduced; meter labels are independently evidence-gated by design | CLOSED |
| 9.1A | Skeleton continuity/dropout audit | Forensic audit — exact dropout causes identified (genuine off-frame/no-pose gaps + one real renderer-vs-science eligibility gap) | CLOSED |
| 9.1B | Skeleton eligibility alignment | **FIX** — renderer aligned to the scientific `independent_corroborated` exception; recovered 64/15/7 frames (Vanni 240/120/60) | CLOSED |
| 9.2A | Skeleton spatial fidelity audit | **EVIDENCE / NO FIX REQUIRED** — stored landmarks spatially accurate, 0px projection error, no systematic transform error; identified real small temporal jitter + style-perception issue | CLOSED |
| 9.2B | Skeleton-suit visual implementation | **FIX** — thicker bones, larger joints, contrast halo, unified bone/joint lookup, proximal display-only smoothing; scientific coordinates untouched | CLOSED |
| 9.3A | Final Auto Follow smoothness audit | **EVIDENCE / NO FIX REQUIRED** — 9.3B proven not justified; residual skip is `DISPLAY_REFRESH_PHYSICAL_LIMIT` + `SOURCE_MOTION_LIMIT`, not a fixable compositing defect | CLOSED |
| 9.4 | End-to-end remediation validation | Full fresh-analysis, worker/lifecycle, scientific-determinism, and (for the first time in this block) real decoded-browser visual validation | CLOSED |

**PHASE 9 REMEDIATION BLOCK: 100% RESOLVED** (2026-08-10). Three items closed
via genuine code **FIX** (9.1B, 9.2B, and 9.4's own forensic-tooling
correction — see `docs/phase-9-4-end-to-end-remediation-validation.md`
Section 6); three items closed via **EVIDENCE that the suspected defect did
not exist / further correction was not justified** (9.0A, 9.2A's own style
finding fully addressed by 9.2B, 9.3A); 9.4 closes the block by validating
all of the above together through the real fresh-analysis user workflow. No
fix is claimed where evidence, not code change, closed the item.

**This block's closure does NOT change the legacy roadmap percentage below.**
The two trackers are intentionally kept separate — see `docs/phase-9-0a-
step-number-disappearance-audit.md` through `docs/phase-9-4-end-to-end-
remediation-validation.md` for the full evidence trail.

---

## Phase table

| Phase | Name | Weight | Phase Complete | Weighted Contribution | Status |
|------:|------|-------:|---------------:|-----------------------:|--------|
| 0 | Validation registry and benchmark identification | 4% | 100% | 4.0% | Complete |
| 1 | 240 FPS zone-time diagnosis | 7% | 100% | 7.0% | Complete |
| 2 | 240 FPS metric validation | 8% | 100% | 8.0% | Complete |
| 3 | 120 FPS contact recovery | 7% | 100% | 7.0% | Complete (corrected) |
| 4.1 | Athlete Localization Engine 2.0, Part 1 (Box Tracker Reliability) | 4% | 100% | 4.0% | Complete |
| 4.2 | Athlete Localization Engine 2.0, Part 2 (Stationary-Lock, Frozen-Track, and Crop-Handoff Reliability) | 3% | 100% | 3.0% | Complete (4.2B-4.2K subphases complete; Phase 4.2K's genuinely independent bidirectional-trajectory verifier — zero new dependencies — corroborates the existing track wherever real evidence permits a verdict, Gav exact byte match, Vanni 120 exit honest, Vanni 60 long gap honest with one real short recovery, Vanni 240 real evidence-traced improvement (6→7 contacts); residual Vanni 240 gap re-attributed to MediaPipe pose-availability, not localization) |
| 4 | 60 FPS late-run athlete-loss fix | 10% | 0% | 0.0% | Not Started |
| 5 | Cross-FPS tracking normalization | 7% | 0% | 0.0% | Not Started |
| 6 | Conditional detector architecture upgrade | 10% | 0% | 0.0% | Not Started |
| 7 | Skeleton controls and exact overlay synchronization | 8% | 0% | 0.0% | Not Started |
| 8 | Low-lag limb smoothing and anatomical continuity | 6% | 0% | 0.0% | Not Started |
| 9 | Wind-aware gate stability | 9% | 0% | 0.0% | Not Started |
| 10 | Four-boundary green/blue/red zone system | 5% | 0% | 0.0% | Not Started |
| 11 | Default playback starts at frame zero | 3% | 0% | 0.0% | Phase 6.6A implementation CLOSED without weighted credit; browser validation completed by closed Phase 6.2B |
| 12 | Stable auto-follow | 5% | 0% | 0.0% | Not Started |
| 13 | Final contact and step integrity | 4% | 0% | 0.0% | Not Started |
| 14 | Internal trim/analysis-window workflow | 3% | 0% | 0.0% | Not Started |
| 15 | ETA and processing-stage validation | 2% | 0% | 0.0% | Not Started |
| 16 | Full stationary scientific validation | 6% | 0% | 0.0% | Not Started |
| 17 | Panning reintroduction | 1% | 0% | 0.0% | Not Started |

Overall stationary roadmap completion (as specified, /112): **29.5%**
Overall stationary roadmap completion (normalized, /100): **29.5%**
Remaining: **70.5%**

(This block previously showed a stale, pre-Phase-1 duplicate figure —
corrected here to match the "Overall completion" section above, not a new
discrepancy.)

### Unweighted supplemental phases

- **Phase 6.6C — Authoritative World-Zone Visualization: CLOSED
  (2026-08-07).** The prior green/blue/red fills were correctly classified but
  hardcoded at only 4.5–6.5% opacity, making green/red effectively invisible on
  real footage. One authoritative presentation palette now supplies 18%-alpha
  green pre-zone, blue measurement-zone, and red post-zone fills while retaining
  the exact same resolved, atomically stabilized gate geometry. Thirteen of
  thirteen new checks, all required regressions, typecheck, lint, production
  build, and six authenticated Chromium runs across Vanni 240/120/60 with Auto
  Follow OFF/ON pass. Phase 6.6C changes no scientific code and the accepted
  post-Phase-7.3B contracts remain Gav **4.848484848484849 Hz**, Vanni 240
  **3.6206896551724137 Hz**, Vanni 120 **4.655172413793103 Hz**, and Vanni 60
  **4.385953327434329 Hz**. A personally executed older Phase 5.0D replay matched
  Gav/Vanni 120 but exposed two already-external discrepancies: its stale
  Vanni-240 stripping path omits independent corroboration, and Vanni 60 produced
  the separately documented Phase 7.2 current-artifact value
  **4.5224052087322875 Hz**, now scientifically reclassified outside the closed
  runtime-lifecycle phase.
  These are disclosed in the report rather than attributed to visualization.
  This phase is unweighted, so completion remains **29.5%**. See
  `docs/phase-6-6c-authoritative-zone-visualization.md`.
- **Phase 6.6B — Continuous-Playback Skeleton Synchronization: CLOSED
  (2026-08-07).** Part A proved pose selection was exact and isolated the
  residual defect to early canvas presentation. Part B now separates rVFC
  `mediaTime` selection from metadata-bound presentation, keeps future poses
  pending, coalesces 240 fps callbacks without a queue, and preserves responsive
  rAF/fallback behavior. Required real Chromium captures recorded zero early
  paints after the fix at Vanni 240 1×/0.5×/0.25× and Vanni 60 1×; all rendered
  live and scrub poses remained `EXACT`. Eighteen of eighteen new checks and all
  required regressions pass. Four real scientific replays remain exactly Gav
  **4.848484848484849 Hz**, Vanni 240 **3.103448275862069 Hz**, Vanni 120
  **3.6206896551724137 Hz**, and Vanni 60 **4.385953327434329 Hz**. This phase
  is unweighted, so completion remains **29.5%**. Its then-outstanding Phase 6.2
  browser blocker is now CLOSED by Phase 6.2B. See
  `docs/phase-6-6b-part-b-presentation-phase-sync.md`.
- **Phase 6.6D — Continuous Stabilized Presentation Camera: CLOSED
  (2026-08-07).** Part A proved the jump was presentation-only and measured
  median 23.23–28.77 px and p95 55.68–58.82 px steady-state transform steps.
  Part B separates raw athlete evidence from a bounded presentation target,
  blends uncertainty/reacquisition, preserves the athlete anchor during zoom,
  and selects one pre-resolved source-time camera path at every playback rate.
  Median steps are now 11.13–23.44 px, p95 31.70–44.93 px, and disputed
  hold-release corrections fall from approximately 49 px to 5.04–10.12 px.
  Vanni athlete/head/feet containment remains 97.93–99.27% / 99.31–100% /
  99.82–100%; Gav remains 100% throughout. Twenty-four of twenty-four new
  checks, required regressions, typecheck, lint, production build, ten browser
  captures, and four post-Phase-7.3B scientific replays pass. This phase is
  unweighted, so completion remains **29.5%**. See
  `docs/phase-6-6d-part-b-continuous-auto-follow.md`.

- **Phase 7.2 / 7.2B — Analysis Runtime Lifecycle: CLOSED (2026-08-07).**
  Legacy artifact compatibility, explicit artifact failure classification,
  persistent user-scoped worker supervision, crash recovery, bounded live UI
  polling, measured two-pass progress, throughput ETA, and retry-progress reset
  are implemented and validated. Twenty-four of twenty-four deterministic
  checks pass and four real jobs produced readable artifacts. Phase 7.2B adds
  one database-owned parent-state projection, whole-row ordered UI polling,
  authoritative working-analysis navigation, correct Dashboard classification,
  and two more deterministic real Vanni 60 reruns. Their artifacts are
  byte-identical at SHA-256 `bd4c3a4a956e78946ac957f3cbbdc50be89d7f1cf072d754a42f5c2e6562771f`.
  The **4.5224052087322875 Hz** current-artifact replay versus the registry's
  **4.385953327434329 Hz** is proven to begin in differing localization/crop/pose
  artifacts and is formally assigned outside runtime lifecycle; no scientific
  algorithm was changed to force either value. This phase is unweighted, so
  completion remains **29.5%**. See
  `docs/phase-7-2b-runtime-lifecycle-closure.md`.
  The permanent discrepancy classification is **“Scientific
  artifact-generation difference,”** not **“Runtime lifecycle.”** Scientific
  follow-up must not reopen Phase 7.2, runtime ownership, queue management,
  worker lifecycle, or Dashboard state.

- **Phase 7.1 — Evidence-Aware Athlete Explanations and Coach Debugging: CLOSED
  (2026-08-07).** Every Phase 7.0 canonical reason has deterministic athlete,
  coach, and developer wording plus evidence-backed guidance where supported.
  Canonical reason codes remain the single source of truth for explanation
  generation, and guidance is emitted only when directly supported by scientific
  evidence.
  Metric dependency explanations, root-cause consolidation, available-evidence
  descriptions, partial-coverage language, Phase 7.0-derived summaries, athlete
  metric-card integration, and a feature-gated developer inspector are complete.
  Twenty-four of twenty-four new checks pass. Four real replays preserve exact
  frequencies: Gav **4.848484848484849 Hz**, Vanni 240
  **3.103448275862069 Hz**, Vanni 120 **3.6206896551724137 Hz**, and Vanni 60
  **4.385953327434329 Hz**. No consumer scientific-availability confidence
  percentage was introduced and no scientific behavior changed. Phase 7.1 is
  unweighted, so completion remains **29.5%**. Its then-outstanding Phase 6.2
  browser validation is now CLOSED by Phase 6.2B. See
  `docs/phase-7-1-evidence-aware-explanations.md`.

- **Phase 7.0 — Scientific Evidence and Metric Availability Engine: CLOSED
  (2026-08-07).** One additive `scientific-evidence-v1` contract now describes
  evidence atoms, evidence quality classes, canonical reason taxonomy,
  metric-specific contracts, dependency graphs, structured provenance,
  invariants, and metric-derived session result states while preserving the
  inherited metric-specific availability decisions and legacy compatibility.
  No consumer-facing confidence percentage was introduced. Twenty-six of twenty-six
  new deterministic checks pass; four real production measurement/evidence
  replays preserve availability and values exactly: Gav **4.848484848484849 Hz**,
  Vanni 240 **3.103448275862069 Hz**, Vanni 120 **3.6206896551724137 Hz**, and
  Vanni 60 **4.385953327434329 Hz**. No formulas, thresholds, localization, pose
  inference, contacts, timing, gates, calibration, crop planning, worker behavior,
  or database behavior changed. The pre-existing standalone `pose:sanity`
  TypeScript path-alias limitation remains disclosed; full project compilation
  passes and no pose code changed. The unrelated pre-existing trailing blank line
  in `src/lib/supabase/database.types.ts` also remains untouched. This phase has
  no assigned weight, so completion remains **29.5%**. Its then-outstanding
  Phase 6.2 browser validation is now CLOSED by Phase 6.2B. See
  `docs/phase-7-0-scientific-evidence-engine.md`.

---

## Phase 0 — Validation registry and benchmark identification

- **Status**: Complete
- **Weight**: 4% | **Completed weight**: 4.0% | **Percent within phase**: 100%
- **Acceptance criteria** (all 13, from the Phase 0 task spec):
  1. Protected Gav session definitively identified — ✅ `e04a7983-...`, user-confirmed, live-verified protected.
  2. Vanni 240 identified by ffprobe-backed evidence — ✅ `31fe352b-...`.
  3. Vanni 120 identified by ffprobe-backed evidence — ✅ `160a86a2-...`.
  4. Vanni 60 identified by ffprobe-backed evidence — ✅ `3d6ba4b6-...`.
  5. Every current production metric mapped to the correct session/analysis — ✅ via real `computeSprintMeasurements` replay against the real persisted pose artifacts.
  6. Screenshot/result groupings mapped where evidence permits — ✅ 240fps definitively matched (all 6 numbers); 120/60fps matched by described symptom; the specific 2.7–3.5m screenshot values could **not** be matched to any current live session — disclosed, not guessed.
  7. Known ground truth linked only to its actual source recording — ✅ VueMotion → Gav only; all 3 Vanni benchmarks marked `groundTruthStatus: unavailable`.
  8. Permanent human-readable registry exists — ✅ `docs/stationary-validation-registry.md`.
  9. Permanent machine-readable registry exists — ✅ `validation/stationary-validation-registry.json`.
  10. Roadmap progress tracker exists and calculates weighted completion — ✅ this file.
  11. No analysis algorithm was changed — ✅ read-only investigation + new registry/doc/test files only.
  12. Protected Gav benchmark remains untouched — ✅ read-only queries only, verified still protected after.
  13. Relevant tests, typecheck, lint, and build pass — see `docs/phase-0-validation-registry-report.md` Section 18 for the exact, honest results (one deliberate, disclosed failure: the weights-sum-to-100% check, per the discrepancy above).
- **Evidence/report links**: `docs/phase-0-validation-registry-report.md`, `docs/stationary-validation-registry.md`, `validation/stationary-validation-registry.json`.
- **Blocking issue**: none.
- **Next action**: none — proceed to Phase 1.

## Phase 1 — 240 FPS zone-time diagnosis

- **Status**: Complete
- **Weight**: 7% | **Completed weight (normalized)**: 6.7% | **Percent within phase**: 100%
- **Acceptance criteria** (all 12, from the Phase 1 task spec):
  1. The exact 223.93-vs-~240 discrepancy explained mathematically and in code — ✅ `avg_frame_rate` (36500/163 container tag) is a metadata artifact of this VFR HEVC file; every decoded frame's real timestamp (verified independently via `ffprobe -show_frames`) matches `timestampFps`=239.98 evidence.
  2. Complete source-to-UI timing chain documented — ✅ `cv2.CAP_PROP_POS_MSEC` → `monotonic_media_timestamp()` → `sourceTimestampMs`/`tMs` (persisted) → `loadOverlayFrames.ts` (`time: frame.tMs/1000`, verbatim) → `torsoSeries()`/`crossingTime()` in `measurements.ts` — never touches `analysisFps`.
  3. Start crossing verified frame-by-frame — ✅ frame 59, bracketed by real tracked frames 58/60, `verified: true`, not extrapolated.
  4. Finish crossing verified frame-by-frame — ✅ frame 587, bracketed by real tracked frames 586/588, `verified: true`, not extrapolated.
  5. Athlete crossing reference point documented and consistent — ✅ torso midpoint (shoulder-mid + hip-mid ÷ 2), one shared `torsoPoint()`/`torsoSeries()` function for both gates.
  6. Official 20m gate semantics verified — ✅ `calibration_known_distance_m=20`, gate midpoints (not full bar width) feed `crossingTime()`; visual zone width does not enter timing; no four-boundary system active.
  7. Authoritative timing uses scientifically correct source-time evidence — ✅ proven by direct code trace + a real production rerun.
  8. No ground-truth value was injected or used to tune the algorithm — ✅ no external ground truth exists for this recording (`benchmark_id` null, confirmed); the fix is evidence-based (real per-frame timestamps), not reference-tuned.
  9. A real production rerun validates the implemented correction — ✅ `npm run worker:analysis`, same analysis id `a7679326-...`, `source_fps`/`analysis_fps` 223.926→239.981, all 6 reported metrics reproduced to full floating-point precision.
  10. Gav/60/120 timing contracts do not regress — ✅ all 4 registered benchmarks replayed live post-fix; every metric byte-identical to its registry-recorded value, including the protected Gav benchmark (untouched).
  11. All relevant tests pass — ✅ see the Phase 1 report's Section 21 for the full, exact list (one pre-existing, disclosed failure: the 105%-weight check, resolved by this update).
  12. Roadmap tracker updated with evidence — ✅ this section.
- **Root cause**: `classify_fps()`'s `native_source_class` branch trusted ffprobe's `avg_frame_rate` container tag without cross-checking `timestampFps`, unlike the validated-60/experimental-30 branches. This mislabeled `analysisFps`/`source_fps` (metadata/display only) — it never corrupted the actual zone-time computation, which already used real per-frame source timestamps throughout.
- **Fix**: two scoped changes in `mediapipe_pose_runner.py` — (1) `classify_fps()`'s native-rate fallback now prefers `timestampFps` when it disagrees from the container average by >1%; (2) `src_fps` (feeds the real-timestamp monotonicity fallback and the artifact's `sourceMetadata.fps`) is re-synced to match, scoped to `native_source_class` only. Both changes leave `validated_60_fps_class`/`experimental_30_fps_class` completely untouched (unit-tested against Gav/Vanni-60's real evidence).
- **Evidence/report links**: `docs/phase-1-vanni-240-zone-time-report.md` (full 26-section report), `docs/phase-1-vanni-benchmark-restoration-manifest.json`, `validation/stationary-validation-registry.json` (`vanni_fly_240.verifiedFps`, conflict now resolved), `scripts/native-fps-timestamp-sanity.py`.
- **Blocking issue**: none for Phase 1 itself. Carried forward as an explicit Phase 1 limitation: no independent external ground truth exists for `vanni_fly_240`, so the *absolute* accuracy of 2.21s against a real stopwatch/timing-gate cannot be checked — only that AVA's own timing evidence is scientifically sound, which is proven. Also newly discovered and explicitly deferred (not fixed this phase): `probe_fps_evidence()`'s `realFps` calculation trusts the container's `nb_frames` tag, which is itself unreliable for this file (1095 claimed vs. 1020 actually decodable, confirmed via `ffprobe -show_frames`) — flagged as a candidate for a future phase.
- **Next action**: proceed to Phase 2 (240 FPS metric validation).

## Phase 2 — 240 FPS metric validation

> **Naming note**: a later prompt referred to this work as "Phase 2 — Scientific
> Timing Validation & Metric Verification" under a different, shorter roadmap
> structure (Phase 0 = registry, "Phase 1" = the Day 96–104 acquisition/tracking
> work, Phase 2 = this). That structure doesn't match this tracker (whose own
> Phase 1 was specifically "240 FPS zone-time diagnosis," not acquisition/
> tracking) — flagged rather than silently reconciled. The technical objective
> was identical to this file's Phase 2, so the same work satisfies both.

- **Status**: Complete
- **Weight**: 8% | **Completed weight (normalized)**: 7.6% | **Percent within phase**: 100%
- **Acceptance criteria** (from this file's original proposal, all met): independently verified (not just internally cross-checked) Average/Peak Step Length, Step Frequency, Average/Peak Velocity, and ground-contact/flight time for `vanni_fly_240` via a rigorous manual, hand-computed audit against raw evidence (no external reference exists for this clip — confirmed again this phase); confirmed `warnings`/coverage disclosures are accurate (empty `warnings[]`, velocity-method spread 2.44%, both correctly below the 15% low-confidence threshold).
- **Findings**: every audited metric — step frequency (combined/left/right), average step length, peak stride length, ground-contact/flight time, and all three velocity methods — traces to the same real per-frame source timestamps Phase 1 proved for zone-crossing timing (`detectStepMarks`/`detectContactPhases`/`stepFrequenciesFromContacts` all consume `frame.time` directly, verified by code trace). Every summary metric was independently hand-recomputed from the raw `zoneSteps`/`individualStepLengthsM` evidence and matched the reported value to full floating-point precision (see the Phase 2 report for the full arithmetic). An exhaustive sweep of all 1020 real frames found zero duplicate timestamps, zero non-monotonicity, zero frame-index gaps/duplicates/out-of-order, zero off-by-one mismatches, zero drift, and zero missing timestamps. **No new scientifically-demonstrable timing defect was found** — Phase 1's fix was the only one needed; this phase's job was independent verification, and it passed.
- **Evidence/report links**: `docs/phase-2-vanni-240-metric-verification-report.md`, `docs/phase-1-vanni-240-zone-time-report.md`, `scripts/vanni-240-metric-evidence-sanity.mjs`.
- **Blocking issue**: none. Carried forward as a limitation (unchanged from Phase 1): no independent external ground truth exists for `vanni_fly_240`, so absolute accuracy still cannot be checked against a real stopwatch/timing gate — only that every displayed metric is provably evidence-based, which is now independently confirmed for all of them, not just zone time.
- **Next action**: proceed to Phase 3 (120 FPS contact recovery) when authorized — explicitly out of scope for both Phase 1 and Phase 2.

## Phase 3 — 120 FPS contact recovery (Vanni 120 FPS Contact Recovery and Cross-FPS Evidence Audit)

- **Status**: Complete — **corrected 2026-08-05 after a reopened correction audit**
  (was marked Complete on 2026-08-05, reopened the same day, now re-certified
  Complete with a corrected root cause). See `docs/phase-3-vanni-120-visibility-correction.md`.
- **Why it was reopened**: the user directly reviewed the original `vanni_fly_120`
  source video and disputed this phase's central visual claim — that the athlete
  was physically occluded by a track-side equipment bin during frames 247–249. The
  user stated the athlete is fully visible in front of the bin. Per explicit
  instruction, the prior report was not treated as authoritative over direct
  source-video evidence until independently reverified — so Phase 3 was reopened
  and its 100% status suspended pending that reaudit, rather than assumed correct.
- **What the correction audit found**: the user was **right**. Overlaying the real,
  persisted `athleteBoundingBoxSource` coordinates onto the real, correctly-rotated
  source frame proved the production athlete-box jumped ~225px onto empty
  background (not even the bin — the fence/staircase area further left) for
  exactly frames 247–249, while self-reporting `trackState: "tracking"`/
  `boxOrigin: "tracked"` (no existing confidence signal flagged it as suspect). The
  athlete herself is visible, in front of the bin, throughout — confirmed via
  correctly-rotated full-frame extraction (numerically verified: ffmpeg's default
  autorotate is the one correct 180° rotation, cross-checked pixel-identical
  against a manual double-rotation of a raw decode) and a 26-frame contact sheet.
  Corrected primary classification: **athlete_localization_failed** (a box-tracker
  bug), not occlusion. The frame-exit claim (316–482) was independently reaudited
  too and found directionally correct but imprecise (the exit is gradual — frames
  318–323 show declining-confidence partial detections as she leaves — not an
  abrupt single-frame cutoff as originally described); the noisy-cluster claim
  (t=1.23–1.48s) was reaudited via the box trajectory and found genuinely
  unaffected by this bug (smooth, continuous, full-pose tracking throughout that
  window). Full frame-index-domain proof, rotation proof, and box-overlay images
  are in the correction addendum.
- **Weight**: 7% | **Completed weight (normalized)**: 6.7% | **Percent within phase**: 100%
- **Acceptance criteria** (all 14, corrected status):
  1. Every visually plausible contact documented — ✅ 11 full-run contacts (8 in-zone + 3 excluded); the 247–249 gap is now correctly documented as a box-localization failure (not occlusion), with a 26-frame contact sheet and box-overlay proof; the 316–482 exit is documented with its gradual (not abrupt) nuance; the 1.23–1.48s cluster reaudited and reconfirmed unaffected by the box bug.
  2. Every missed contact assigned a precise failure category — ✅ **corrected**: `athlete_localization_failed` (247–249, primary), `athlete_exited_frame` (316–482), ambiguous noisy-signal window (1.23–1.48s, reconfirmed) — see correction addendum Section 9.
  3. Every contact-related time window audited for FPS dependence — ✅ unaffected by the correction; stands as originally found.
  4. Recoverable contacts recovered only from real source evidence — ✅ still true: none recovered. Fixing the box tracker is detector-architecture work, explicitly out of scope for this correction task, so the contact correctly remains unavailable even though its true cause is now known to be a fixable bug rather than a physical impossibility.
  5. Unrecoverable contacts remain unavailable with structured reasons — ✅ **corrected reason**: `athlete_localization_failed`, not occlusion.
  6. No global evidence threshold weakened — ✅ zero code changes, before and after the correction.
  7. No contact copied/inferred from the 240 recording — ✅ confirmed, unaffected.
  8. Step reconstruction does not bridge unsupported gaps — ✅ confirmed, unaffected.
  9. Real production rerun validates any implemented correction — N/A, no code correction was implemented (only the root-cause attribution was corrected).
  10. 120 timing result does not regress — ✅ zone time 2.19s, all 6 metrics byte-identical, reverified live after the correction.
  11. Validated 240 metrics do not regress — ✅ byte-identical, reverified live after the correction.
  12. Gav and 60 contracts do not regress — ✅ byte-identical, reverified live after the correction; Gav untouched throughout.
  13. Relevant tests pass — ✅ `vanni-120-contact-recovery:sanity` (15/15, updated to the corrected cause labels) plus new `vanni-120-visibility-correction:sanity` (9/9) plus the full existing suite — see correction addendum Section 18.
  14. Roadmap tracker updated with evidence — ✅ this section.
- **Root cause (corrected)**: NOT occlusion. (a) A real, reproducible box-tracker
  localization failure (optical-flow drift in `box_tracker.py`, most consistent
  with motion blur on the athlete's own rapidly-moving legs briefly degrading her
  trackable feature points) caused the box to lock onto empty background for 3
  frames; MediaPipe correctly found no person in that wrong crop. (b) 167 frames of
  pose absence because the athlete gradually exits the camera's field of view after
  the finish gate (confirmed, refined from "abrupt" to "gradual"). (c) one
  ambiguous ~250ms window where dense, noisy candidate peaks are defensibly
  collapsed by existing deduplication — reconfirmed unaffected by the box-tracker
  bug (its own box trajectory is smooth throughout).
- **Fix**: none. The box-tracker bug is real and reproducible but lives in shared
  detector-architecture code, explicitly out of scope to change in this correction
  task. Recorded and escalated as a genuine, higher-priority future-phase candidate
  (more urgent than the previously-flagged `REACQUISITION_MAX_FRAMES` issue, since
  this one is proven to cause real data loss, not just theoretical FPS
  inconsistency).
- **Newly discovered, explicitly out-of-scope findings** (disclosed, not fixed):
  (1) **[Elevated to highest priority by this correction]** `box_tracker.py`'s
  optical-flow athlete tracking can lock onto background while self-reporting full
  confidence (`tracked`/no low-confidence flag) — a proven, reproducible bug,
  recommended for Phase 5 (Cross-FPS tracking normalization) or a dedicated
  box-tracker-robustness phase, whichever this project schedules next for detector
  work. (2) `box_tracker.py`'s `REACQUISITION_MAX_FRAMES=90` and
  `athlete_tracker.py`'s `REACQUISITION_MAX_FRAMES=60` are both genuinely
  frame-count-based and not fps-scaled — real, disclosed, still unfixed; recommended
  for Phase 5. (3) `summariseContactFlight()`'s ground-contact/flight-time
  computation (`contacts.ts`) does not share the same-foot/discontinuity guard that
  protects `individualStepLengthsM` — recommended for Phase 13.
- **Evidence/report links**: `docs/phase-3-vanni-120-contact-recovery-report.md`
  (original report, corrections marked inline + Section 26 pointer),
  `docs/phase-3-vanni-120-visibility-correction.md` (the full correction — frame
  mapping, rotation proof, box-overlay images, reclassification),
  `scripts/vanni-120-contact-recovery-sanity.mjs` (updated),
  `scripts/vanni-120-visibility-correction-sanity.mjs` (new).
- **Blocking issue**: none for Phase 3 itself. The box-tracker localization bug
  (newly proven this correction), the reacquisition-budget scaling gap, and the
  flight-time guard gap are carried forward as explicit blockers for their
  respective future phases.
- **Next action**: proceed to Phase 4 (60 FPS late-run athlete-loss fix) when
  authorized. Given this correction proved a real box-tracker bug exists, Phase 4's
  own investigation should explicitly check whether `vanni_fly_60`'s tracking loss
  exhibits the same box-jump signature before assuming a different cause.

## Phase 4.1 — Athlete Localization Engine 2.0, Part 1 (Box Tracker Reliability)

> **Roadmap-structure discrepancy, flagged rather than silently fixed**: this
> phase did not exist in the original 18-phase/105%-weight v4.0 roadmap. It
> was assigned by the task that authorized it as a new phase, weight 4%,
> inserted immediately after Phase 3 (ahead of the original Phase 4) because
> Phase 3's correction proved the box-tracker bug it fixes is real,
> reproducible, and higher-priority than originally scheduled work. Per this
> roadmap's own rule (see the weight-discrepancy note at the top of this
> file), inserting a phase is not silently absorbed into the existing pool —
> the total weight pool is recomputed honestly: **105% + 4% = 109%** (as
> specified) / renormalized to 100%. `npm run stationary-validation-registry:sanity`
> already deliberately fails on the pre-existing 105% discrepancy; this
> insertion is an additional, disclosed contributor to that same known gap,
> not a new independent failure.

- **Status**: Complete — **with an honest correction, 2026-08-05.** A real
  production revalidation (required by this phase's own deliverables) proved
  the implemented fix does **not** resolve the specific `vanni_fly_120`
  incident this phase was commissioned to fix — the incident's true
  mechanism (a sustained near-zero-displacement freeze starting at frame 215,
  following a `"detected"` event, not a sudden single-frame jump at 246→247
  as Phase 3's correction described) is a different failure class than the
  one implemented. See `docs/phase-4-1-box-tracker-reliability-report.md`
  Section 0 for the full correction, written the same way Phase 3's own
  correction was — the original text below is preserved, not deleted.
- **Weight**: 4% | **Completed weight (normalized)**: 3.67% | **Percent within phase**: 100%
- **Mission** (verbatim from the authorizing task): the box tracker
  confidently drifted ~225px onto empty background on `vanni_fly_120` frames
  247–249 while still reporting itself as "tracked" (proven in Phase 3's
  correction). This phase makes the localization box never confidently follow
  the wrong thing — pose inference, contact detection, timing, metrics,
  panning, UI, overlays, and skeleton rendering were explicitly out of scope.
- **Root cause**: `box_tracker.py`'s optical-flow tracking path
  (`_track_via_optical_flow`) accepted any frame-to-frame displacement that
  cleared `OPTICAL_FLOW_MIN_INLIERS`/`OPTICAL_FLOW_MIN_INLIER_RATIO` — i.e.
  the tracked points agreed confidently WITH EACH OTHER, which is necessary
  but not sufficient evidence they were still on the athlete. Three existing
  signals could have caught a wrong-feature lock and did not: (1)
  `_scale_consistency` is structurally inert during pure-translation optical
  flow, since box width/height are never updated by flow, only translated;
  (2) `_direction_consistency` depends entirely on the caller's
  `expected_dir_sign`, which is silently `0` (a permanent no-op) whenever
  `travel_direction` is `"auto"` — the exact configuration the real incident
  ran under; (3) nothing measured whether the *implied speed* of a
  frame-to-frame jump was physically plausible for this track at all. The
  real jump (0.7738→0.6569 normalized x, frames 246→247, dt=1/120s) implies
  ~14 frame-widths/second — a classic aperture-problem failure (optical flow
  converging on a nearby, static, high-contrast background feature) most
  consistent with brief motion-blur degradation of the athlete's own
  trackable features, not evaluated against any velocity ceiling anywhere in
  the optical-flow path.
- **Fix implemented** (`src/lib/biomechanics/mediapipe/runtime/box_tracker.py`):
  a direction-agnostic velocity-magnitude ("teleport") rejection check,
  `_teleport_check()`, added to the optical-flow acceptance path alongside
  the existing direction/scale checks. Not a new, Vanni-tuned heuristic —
  reuses `athlete_tracker.py`'s own already-audited, already-proven
  `ABSOLUTE_VELOCITY_CEILING=2.5`/`MAX_VELOCITY_MULTIPLE=3.0` constants
  (used there for the periodic identity-verified detector's own teleport
  rejection), expressed in frame-widths/second using real elapsed time so it
  generalizes across FPS class and resolution without rescaling. Because it
  is direction-agnostic, it closes the `expected_dir_sign=0`/"auto"
  single-point-of-failure structurally, without touching the separate
  cross-file config-plumbing bug (disclosed, not fixed — see limitations).
  A second, smaller fix ("FIX B"): a detector frame that finds nobody
  (`MediaPipe returning "no person"`) now feeds the existing Day 104
  accelerated-refresh quality trend (`recent_inlier_ratios`) as a `0.0`
  reading instead of being a silent no-op, so a detector miss is real
  negative evidence that can bring the next detector check forward.
- **Evidence-backed, not tuned**: every threshold reused is a constant
  already proven and shipped in `athlete_tracker.py`'s own teleport-rejection
  logic; nothing was invented or fit to this specific clip. Verified false
  and true positives: `scripts/box-tracker-teleport-sanity.py` proves (1) the
  real 246→247 jump computes to ~14.03 fw/s and is rejected; (2) ordinary
  sprint motion (≤1.0 fw/s) and motion up to 3× an established running-max
  speed are accepted; (3) an insufficient-evidence cold start never
  fabricates a rejection; (4) the same total pixel displacement, spread over
  real elapsed time instead of one frame, is accepted (proves the check
  discriminates on implied speed, not raw displacement); (5) a detector miss
  is recorded in the accelerated-refresh trend and can be the deciding
  evidence for an early refresh.
- **Acceptance criteria** (**corrected 2026-08-05** — originally recorded as
  "all met" based on unit tests alone, before real-run revalidation; 1-3
  corrected below to "partially met" once that revalidation ran):
  1. Tracker never confidently follows empty background without evidence —
     ~~✅ proven via the reconstructed real incident~~ **CORRECTED: partially
     met.** The synthetic reconstruction in `scripts/box-tracker-teleport-
     sanity.py` (using coordinates believed to be the real incident) is
     correctly rejected — but real-run revalidation proved those coordinates
     described the wrong mechanism (a freeze, not a jump); the actual
     incident still reproduces byte-identically post-fix.
  2. Confidence reflects reality (not blind trust in inlier agreement alone) —
     **CORRECTED: partially met.** True for sudden jumps; a sustained
     near-zero-displacement freeze still reports full inlier-ratio confidence
     indefinitely — this fix adds no defense against that.
  3. Drift detected before catastrophic, undetected multi-frame failure —
     **CORRECTED: not met for the incident's actual class.** The real freeze
     persisted 30+ frames before an unrelated scheduled detector refresh
     incidentally corrected it; nothing in this fix shortened that window.
  4. Detector refreshes remain evidence-driven, not blindly increased — ✅
     `DETECTOR_CADENCE_FRAMES` and the Day 104 accelerated-refresh trend were
     not touched; FIX B only adds real evidence (a miss) into the existing
     trend, it does not add a new unconditional refresh trigger.
  5. No regression on Gav/240/120/60 — ✅ confirmed via real production
     reruns of all four (Section below); Gav byte-identical to pre-fix.
  6. Worker/build/lint/typecheck pass — ✅ `npm run typecheck`, `npm run
     lint`, `npm run build`, `npm run worker:check` all clean; `py_compile`
     confirms syntax validity.
- **Real production reruns**: all 4 benchmarks (Gav protected, Vanni 240,
  Vanni 120, Vanni 60) were rerun through the real worker/queue path
  (`replace_working_analysis`, the same RPC the app's own rerun action uses),
  with the pre-fix result explicitly saved as a version first
  (`save_working_analysis_snapshot`) on every session, not just Vanni 240 as
  in Phase 1. See `docs/phase-4-1-box-tracker-reliability-report.md` Section
  on real validation for full per-clip diagnostics (first lock, drift events,
  false locks, detector refreshes, reacquisitions, feature counts, tracker
  confidence, crop quality, pose availability).
- **Newly discovered, explicitly out-of-scope findings** (disclosed, not
  fixed): **[Elevated to highest priority by the 2026-08-05 correction]**
  `box_tracker.py`'s optical-flow path has no stationary-lock/freeze detector
  — proven, via real trace evidence, to be the actual mechanism behind the
  commissioning incident (a near-zero-displacement lock onto background,
  sustained 30+ frames, following a `"detected"` event). `athlete_tracker.py`
  already has a proven, shipped pattern for exactly this
  (`MIN_CUMULATIVE_DISPLACEMENT`/`MAX_STATIONARY_VERIFICATION_SECONDS`,
  documented there against a real prior stadium-bleacher/fence false
  positive) that was never ported to `box_tracker.py`'s optical-flow path —
  strongly recommended as the very next piece of work on this file, ahead of
  the items below. Also: the `expected_dir_sign=0`/`"auto"` config-plumbing
  gap (`analysis-worker.mjs` → `mediapipe_pose_runner.py` → `box_tracker.py`)
  is structurally bypassed by the direction-agnostic teleport check but not
  fixed at its source — `_direction_consistency` itself is still a no-op
  under `"auto"` travel direction. `REACQUISITION_MAX_FRAMES` inconsistency
  (90 vs. 60 between `box_tracker.py`/`athlete_tracker.py`, both
  frame-count-based and unscaled) remains unfixed, unchanged from Phase 3 —
  still recommended for Phase 5.
- **Evidence/report links**: `docs/phase-4-1-box-tracker-reliability-report.md`
  (full audit, root cause, before/after, real reruns), `scripts/box-tracker-teleport-sanity.py`
  (new, 13/13 passing), `scripts/box-tracker-sanity.py` (existing, 27/27
  still passing, unmodified).
- **Blocking issue**: none. The direction-config single-point-of-failure and
  the reacquisition-budget inconsistency are carried forward as disclosed,
  unfixed limitations for future phases, not blockers for this one.
- **Next action**: proceed to Phase 4.2 (Athlete Localization Engine 2.0,
  Part 2 — stationary-lock/frozen-track/crop-handoff reliability), inserted
  ahead of the original Phase 4 for the same reason Phase 4.1 itself was
  inserted ahead of it: Phase 4.1's own real-run revalidation proved a
  higher-priority, real box-tracker failure class (a sustained freeze, not
  a sudden jump) that needed dedicated work before other tracking phases.

## Phase 4.2 — Athlete Localization Engine 2.0, Part 2 (Stationary-Lock, Frozen-Track, and Crop-Handoff Reliability)

> **Roadmap-structure discrepancy, flagged rather than silently fixed**:
> this phase did not exist in the original 18-phase/105%-weight v4.0
> roadmap, nor in Phase 4.1's own 19-phase/109%-weight insertion. It was
> assigned by the task that authorized it as a new phase, weight 3%,
> inserted immediately after Phase 4.1 (ahead of the original Phase 4)
> because Phase 4.1's own real-run correction (see that phase's Section 0
> above) proved the box-tracker's actual, uncaught failure mode is a
> sustained near-zero-displacement freeze, not the sudden jump Phase 4.1's
> fix defended against. Per this roadmap's own established rule (see the
> weight-discrepancy note at the top of this file), inserting a phase is
> not silently absorbed into the existing pool — the total weight pool is
> recomputed honestly: **105% + 4% + 3% = 112%** (as specified) /
> renormalized to 100%.

- **Status**: **Complete** (as of Phase 4.2K, 2026-08-07). Ten subphases:
  - **Phase 4.2 (audit/design)**: real production trace evidence gathered
    (frame-by-frame reconstruction of the `vanni_fly_120` freeze, box-domain
    tracing, root-cause analysis), a freeze-detection design produced, and
    helper methods written into `box_tracker.py` — but explicitly left
    **unwired** (dead code, zero behavior change) when that session's time
    ran out, honestly reported as incomplete rather than rushed.
  - **Phase 4.2B (production wiring — complete as its own subphase)**: the
    helpers were audited (3 real bugs found and fixed, one design decision
    reverted after it regressed an existing test), wired into `step()`,
    unit-tested (39/39, including a real-trace replay fixture), threaded
    through the Python/TypeScript schema contracts, and validated against
    **one** real production rerun (`vanni_fly_120`) — see
    `docs/phase-4-2b-frozen-track-production-wiring.md` for the complete,
    detailed report.
  - **Phase 4.2C (crop provenance, pose feedback, full benchmark
    validation — complete as its own subphase, but surfaced a blocker for
    Phase 4.2 overall)**: implemented crop-handoff provenance (closing the
    disclosed `plan_crops()`-uses-pre-correction-`boxes[]` gap), bounded
    pose-as-localization-feedback, and a real, measured detector-cost
    reduction (192→52 invocations on `vanni_fly_120`, verified safe) — then
    ran real production reruns of **all four** benchmarks for the first
    time. That validation found and fixed two real bugs in this subphase's
    own new code (a 240fps false-positive bug that flagged 52% of
    `vanni_fly_240` as `frozen_suspect`, and a detector-throttle bug that
    had zero measured effect until fixed) — and then found a **real,
    unresolved regression on `vanni_fly_240`** even after both fixes
    (new tracking-loss gaps, confidence/metric drift) that is NOT
    attributable to either of those two bugs. See
    `docs/phase-4-2c-crop-provenance-and-benchmark-validation.md` for the
    complete, detailed report — including the full roadmap-arithmetic audit
    this subphase performed before any other change, per its authorizing
    task's explicit instruction.
  - **Phase 4.2D (segment-aware crop planning — complete as its own
    subphase, resolves the Phase 4.2C blocker's underlying mechanism but
    does not close it)**: replaced `plan_crops()`'s single whole-clip
    linear trend fit with a segment-aware design (partition into trusted
    segments, fit/smooth each locally, bridge only short gaps, hold long
    gaps flat, extrapolate only at the clip's own true edges) — the
    whole-clip fit's failure mode mathematically proven via a new
    deterministic, synthetic fixture (`scripts/crop-segment-planning-
    sanity.py`, 24/24). Building that fixture surfaced and fixed two
    further real bugs: a seed-anchored freeze-detection displacement check
    in `box_tracker.py` that went permanently stale after genuine
    pre-freeze motion (fixed with a rolling 250ms window), and two
    Gav-regressing side effects of the first segment-aware implementation
    attempt (routine `detected` refreshes wrongly fragmenting segments;
    lost clip-edge extrapolation) — both found via real Gav reruns and
    fixed before being accepted. Real production reruns of all four
    benchmarks: Gav and Vanni 120 are exact byte matches to their
    established baselines; Vanni 240 is stable and substantially improved
    (its whole-clip-fit distortion is fixed and proven) but its final
    metrics (`athleteTrackingConfidence` 0.867, `strideFrequencyHz` 5.56)
    do not exactly match the Phase 1/2 baseline (0.9055 / 5.93) — the
    difference is mechanistically explained (the rolling-window fix
    surfacing real, previously-uncaught freeze evidence) but not
    independently proven against ground truth; Vanni 60 has no baseline to
    regress against and was deliberately not investigated further. See
    `docs/phase-4-2d-segment-aware-crop-planning.md` for the complete,
    detailed report, including the exact recommended Phase 4.2E scope to
    close this out.
  - **Phase 4.2E (Vanni 240 source-video adjudication — complete as its own
    subphase, narrows but does not close the Phase 4.2 blocker)**: compared
    the true original Phase 1/2 pose artifact (recovered from a separately-
    stored, never-overwritten saved snapshot) against the current pipeline
    frame-by-frame, then extracted and visually inspected real source-video
    frames at the load-bearing disagreement. Found the current pipeline's
    box drifting onto a stationary trackside barrel, then permanently
    locking onto an unrelated static wall patch via a wrongly-accepted
    detector false positive — root-caused to a real, generalizable defect
    in `box_tracker.py` (three of four detector-event rejection
    classifications were computed but never enforced; only
    `rejected_teleport` was checked). Fixed with the smallest general
    change (the acceptance branch now checks membership in the full
    rejection set); re-verified byte-identical against Gav and Vanni 120,
    and a consistent-direction (not baseline-comparable) change on Vanni
    60. The fix resolves the false-positive lock and measurably improves
    Vanni 240's confidence (0.867→0.886) and shrinks its `frozen_suspect`
    footprint (578→435 frames), but a separate, real, visually-confirmed
    optical-flow difficulty remains near the same barrel, right at the
    finish crossing — leaving `reportedZoneTimeS`/`combinedStepFrequencyHz`/
    `reportedMaxVelocityMps` still unavailable. See
    `docs/phase-4-2e-vanni-240-source-adjudication.md` for the complete,
    detailed report, including the exact recommended Phase 4.2F scope.
  - **Phase 4.2F (barrel-region optical-flow fix — complete as its own
    subphase, resolves the Vanni 240 finish-crossing gap but surfaces a
    small new Vanni 120 shift)**: root-caused the remaining optical-flow
    difficulty to `_init_flow_points`/`_track_via_optical_flow` having no
    way to distinguish athlete-owned flow points from a nearby static
    object's own (often stronger) corners, and no forward-backward
    consistency check. Implemented athlete-interior per-point motion-
    consistency classification (against the athlete's independently-
    established velocity, never flow-derived) plus a per-point magnitude
    ceiling — but a real Gav production rerun during this subphase's own
    verification regressed when applied unconditionally. Root-caused to
    Gav's frequent (~every 12 frames) identity reconfirmation making
    ordinary limb-relative motion read as background-risk; fixed by scoping
    the whole defense to activate only after a long (≥20-frame), unconfirmed
    coast — exactly Vanni 240's real failure shape, and a scope Gav's own
    clip never reaches. Real production reruns: Gav is an **exact byte
    match** (two independent reruns); Vanni 240's `reportedZoneTimeS` and
    `reportedZoneVelocityMps` now exactly match the Phase 1/2 baseline, and
    its tracking-loss gap now starts at frame 668 — identical to the
    original baseline's own gap start; Vanni 120 shows a small, disclosed
    shift (confidence 0.9171→0.9102, gap start +2 frames) that leaves its
    frame-215-incident correction substantially intact but not byte-
    identical. See `docs/phase-4-2f-barrel-region-optical-flow-and-finish-crossing.md`
    for the complete, detailed report, including the exact recommended
    Phase 4.2G scope to resolve the Vanni 120 shift and close this phase.
  - **Phase 4.2G (cross-FPS coast-scope validation — complete as its own
    subphase, resolves the FPS-inconsistency risk but does not close Phase
    4.2)**: replaced Phase 4.2F's raw frame-count coast-scope gate
    (`BACKGROUND_RISK_MIN_FRAMES_SINCE_VERIFIED = 20`, FPS-inconsistent —
    333ms/167ms/83ms at 60/120/240fps) with a time-normalized gate
    (`COAST_MIN_MS_SINCE_VERIFIED`), added diagnostic coast-risk states and
    seven new provenance fields, and built a deterministic cross-FPS fixture
    suite (`scripts/cross-fps-coast-scope-sanity.py`, 8 scenarios × 3 FPS +
    17 time-normalization tests) proving equivalent elapsed time produces
    equivalent behavior regardless of source FPS or raw frame count. Also
    attempted, real-evidence-tested, and reverted a decoupled two-constant
    refinement (separate exclusion vs. soft-refresh-trigger floors) after
    real production reruns proved it actively regresses BOTH Gav (still
    shifts box state once an early-requested detector call is accepted) AND
    Vanni 240 (fragments tracking into five loss ranges, confidence collapses
    to 0.554) — worse than either flat value alone; this disproved hypothesis
    is preserved as disclosed evidence in `box_tracker.py`'s own constant
    docstring. Real production reruns of all four benchmarks at the final,
    single coupled `COAST_MIN_MS_SINCE_VERIFIED = 300.0`: Gav is an **exact
    byte match**; Vanni 120 shows no regression (gap start now matches the
    ORIGINAL Phase 3 baseline more closely than Phase 4.2F's own result did);
    Vanni 60 is functionally identical to Phase 4.2F; but **Vanni 240's
    zone-based metrics regress** — `combinedStepFrequencyHz` collapses to
    1.93 (baseline 4.858, Phase 4.2F 3.70), `reportedZoneTimeS` drops to 2.13
    (baseline/4.2F both 2.2), `validContacts` stays at 8 (baseline 11) —
    because the 300ms floor Gav's exact-match requirement demands engages
    too late in Vanni 240's real long coasts to prevent drift from
    compounding before the finish zone. See
    `docs/phase-4-2g-cross-fps-coast-scope-validation.md` for the complete,
    detailed report, including the exact recommended Phase 4.2H scope (a
    distance-since-verified discriminator, not another flat time value).
  - **Phase 4.2H (distance-and-evidence-based coast risk — complete as its
    own subphase, formalizes the athlete-independent metric contract and
    triply-confirms the Vanni 240 blocker but does not close Phase 4.2)**:
    replaced the single flat-time coast-risk discriminator with an
    interpretable evidence vector (elapsed time, frame-width distance,
    trajectory residual, sustained background-risk trend, forward-backward
    flow validity, structural track state) and a real exit-vs-background-
    lock classifier (`localizationTerminationReason`) grounded in a genuine,
    newly-found signature (a truly frozen box position vs. one still making
    small, real, non-repeating progress toward the configured exit edge).
    Formalized and tested (16 new checks) the project's own critical
    scientific principle: Gav is a protected pipeline-validation benchmark,
    never a numeric target for any Vanni benchmark's own independent metrics.
    A real per-benchmark audit found neither elapsed time (Phase 4.2G) NOR
    raw frame-width distance NOR trajectory residual (both this phase) can
    discriminate Gav's own short, legitimate coasts from Vanni 240's real
    short-duration contact-level degradation without either regressing Gav
    or failing to help Vanni 240 — proven via TWO real Gav production reruns
    (one, at a trajectory-residual value of 0.05fw, regressed Gav —
    confidence 0.8149 vs. the exact 0.8024 baseline; raising it to 0.09fw,
    strictly above Gav's own real 0.0803fw ceiling, restored the exact byte
    match) and confirmed the SAME 0.09fw value no longer helps Vanni 240's
    zone metrics either. Real production reruns of all four benchmarks at
    the final configuration: Gav is an **exact byte match**; Vanni 120
    **fully recovers** to its ORIGINAL Phase 3 baseline
    (`strideFrequencyHz` = 5.01 exactly, gap start = frame 317 exactly,
    improving on both Phase 4.2F's 4.92 and Phase 4.2G's 5.15); Vanni 60 is
    functionally identical to Phase 4.2G; but **Vanni 240's zone-based
    metrics remain regressed** — `combinedStepFrequencyHz` = 1.93 (baseline
    4.858), `validContacts` = 8 (baseline 11) — the same real blocker Phase
    4.2G reported, now confirmed via a third independent evidence signal
    type rather than assumed unresolvable after one. See
    `docs/phase-4-2h-distance-evidence-coast-risk.md` for the complete,
    detailed report, including the two candidate next-phase directions that
    require genuinely NEW evidence, not a fourth threshold search.
  - **Phase 4.2I (new-evidence localization architecture selection —
    complete as its own subphase, adds real new evidence and strengthens
    Vanni 240's long-duration lock rejection, but does not close Phase
    4.2)**: evaluated Phase 4.2H's own two recommended candidate
    architectures against real captured production evidence (via the
    pre-existing `BOX_TRACKER_TRACE_FILE` mechanism, not synthetic data) —
    Candidate A (pulling Pass 2's pose-corroboration evidence earlier into
    Pass 1, a real but larger architectural restructuring) and Candidate B
    (pose-landmark-guided per-point feature ownership — the athlete's own
    real MediaPipe skeleton, already computed on every detector
    confirmation, previously discarded once the box was built). Selected
    and implemented Candidate B as an ADDITIONAL, OR'd acceptance path
    alongside the existing motion-consistency classification (a point is
    athlete-owned if it passes EITHER check) — zero new dependencies, zero
    new model assets, confined to `box_tracker.py`'s own per-point
    classification. Real evidence: Gav's own mean background-risk reading
    dropped from 0.367 to 0.087 (directly resolving Phase 4.2H's own
    root-cause finding about Gav's real limb motion); Vanni 240's real,
    long-duration barrel/wall lock tail's rejection strengthened from 0.883
    to 1.000 mean background ratio. Real production reruns of all four
    benchmarks: Gav is an **exact byte match** (after a real regression at
    an initial naive/unprojected skeleton reference was found and fixed by
    velocity-projecting it forward — the same "insufficient corroboration
    regresses Gav" lesson recurring a fourth time); Vanni 120 and Vanni 60
    show no regression; but **Vanni 240's zone-based metrics remain
    regressed** — `combinedStepFrequencyHz` = 1.93 (baseline 4.858),
    `validContacts` = 8 (baseline 11) — the same real blocker, now confirmed
    via a FOURTH independent evidence signal type (spatial pose-skeleton
    ownership, joining elapsed time, raw distance, and trajectory residual).
    A real, promising but unimplemented finding (Pass 2's `poseBoundsIoU`
    correlates with the short in-zone episodes causing the regression) is
    the exact recommended next-phase scope. See
    `docs/phase-4-2i-localization-architecture-selection.md` for the
    complete, detailed report, including the full candidate-architecture
    decision matrix and source-frame evidence.
- **Weight**: 3% | **Completed weight (normalized)**: **0.0% (still, after
  Phase 4.2I)** — per the authorizing task's own explicit rule ("do not
  award completion based only on code or unit tests; real benchmark
  validation is required") now proven out across NINE subphases: real
  validation was completed for all 4 benchmarks multiple times, two real,
  independent defects were found, fixed, and proven fixed (4.2D crop-fit
  distortion, 4.2E detector-plausibility), the coast-scope gate was made
  FPS-consistent (4.2G), evidence-vector-based with a formalized athlete-
  independent metric contract (4.2H), and then extended with a genuinely
  new spatial evidence source (4.2I) — and `vanni_fly_240` (a Phase 1/2
  hand-verified benchmark) still does not match its baseline zone metrics,
  for a real, now QUADRUPLY-evidenced reason: a genuine architectural
  tension between Gav's exact-match requirement and Vanni 240's short
  in-zone zone-metric recovery that no per-frame evidence signal tried so
  far (flat time, raw distance, trajectory residual, spatial pose-skeleton
  ownership) can fully resolve. Per the same rule's explicit contingency,
  Phase 4.2 earns 0% until this is resolved, despite Gav (protected) being
  byte-identical and Vanni 120/60 showing no regression. See
  `docs/phase-4-2i-localization-architecture-selection.md` Section 24 for
  the full re-evaluated Phase 4.2 closure table.
- **Mission**: make sure the localization box never confidently remains on
  the wrong thing for a *sustained* period — Phase 4.1's teleport check
  covers a sudden jump; this phase covers the freeze Phase 4.1's own
  real-run revalidation proved was the actual `vanni_fly_120` mechanism.
- **Real evidence gathered**: a real production trace (opt-in, off-by-default
  `BOX_TRACKER_TRACE_FILE`/`BOX_TRACKER_TRACE_FRAMES` hook added to
  `box_tracker.py`) proved the freeze begins at a `"detected"` event (frame
  215), which then sits the box frozen for 34 frames while optical flow
  reports a saturated 40/40 inlier count and the flow-point spread grows
  2.4x (118px→282px) — see `docs/phase-4-2b-frozen-track-production-wiring.md`
  Section 2 for the full evidence.
- **Fix implemented** (`box_tracker.py`, `mediapipe_pose_runner.py`, plus
  schema threading through `pose.ts`/`MediaPipeTypes.ts`/
  `MediaPipePoseBackend.ts`/`overlay.ts`/`trackingDebugSchema.ts`/
  `measurements.ts`/`VideoOverlay.tsx`): a detector-event plausibility
  contract judged against the last identity-verified box (not the possibly-
  drifted `last_box`); a bounded, time-normalized speed-ceiling update
  contract scoped to the detector/reacquisition path only; two independent,
  time-gated freeze-suspicion signals (feature-spread growth, trajectory
  residual) evaluated on every tracked frame; retroactive confirm/dismiss
  against the next identity-verified detection; a new `frozen_suspect`
  `boxOrigin` value threaded through every schema as a strict superset
  (old artifacts unaffected) and gated exactly like `predicted`/`invalid`
  in every scientific-evidence consumer.
- **Real production validation (Vanni 120 only)**: confirmed the fix works
  end-to-end on a real rerun — 15 frames (232–246 in this run's specific
  trajectory) that still had MediaPipe successfully find 17 keypoints were
  retroactively proven wrong and withheld, `tracking_loss_ranges` changed
  from 3 gaps to 1, and `detectorInvocations` roughly tripled (61→192, a
  real, disclosed runtime-cost side effect). Full diagnostics in
  `docs/phase-4-2b-frozen-track-production-wiring.md` Section 12.
- **Newly discovered, explicitly deferred findings**: (1) `plan_crops()`
  still runs on the pre-correction `boxes[]` array — a confirmed
  `frozen_suspect` span is correctly withheld from scientific evidence but
  still feeds its (proven-wrong) frozen position into crop planning;
  Phase 4.2's original Part 8 (crop-handoff provenance) was not addressed
  this subphase. (2) the ~3x `detectorInvocations` increase measurably
  shifts `plan_crops()`'s smoothed trajectory clip-wide, which appears to
  have shifted pose-detection success/failure in an unrelated, distant
  frame range (317–329) between runs — verified this was NOT caused by the
  frozen-track detector itself (`boxOrigin`/`freezeSuspect` checked
  directly), but is a real, disclosed indirect consequence worth checking
  specifically against the protected Gav benchmark in Phase 4.2C.
- **Evidence/report links**:
  `docs/phase-4-2b-frozen-track-production-wiring.md` (Phase 4.2B: full
  audit, helper fixes, contracts, real Vanni 120 validation),
  `docs/phase-4-2c-crop-provenance-and-benchmark-validation.md` (Phase
  4.2C: crop provenance, pose feedback, detector-cost fix, all-4-benchmark
  real validation, the Vanni 240 regression finding, and the roadmap
  arithmetic audit), `docs/phase-4-2d-segment-aware-crop-planning.md`
  (Phase 4.2D: segment-aware `plan_crops()`, the rolling-window
  freeze-detection fix, the mathematical whole-clip-fit failure proof, and
  the full re-run of all four benchmarks), `docs/phase-4-2e-vanni-240-source-adjudication.md`
  (Phase 4.2E: real source-video frame-by-frame adjudication, the
  detector-event-plausibility defect found and fixed, and the full
  re-run of all four benchmarks), `docs/phase-4-2f-barrel-region-optical-flow-and-finish-crossing.md`
  (Phase 4.2F: athlete-interior optical-flow feature selection, the
  coasting-scoped drift defense, and the full re-run of all four
  benchmarks), `docs/phase-4-2g-cross-fps-coast-scope-validation.md`
  (Phase 4.2G: the time-normalized coast gate, the cross-FPS deterministic
  fixture proof, the disproved decoupling experiment, and the full re-run
  of all four benchmarks), `docs/phase-4-2h-distance-evidence-coast-risk.md`
  (Phase 4.2H: the evidence-vector coast-risk model, the athlete-independent
  metric contract, the exit-vs-background-lock classifier, and the full
  re-run of all four benchmarks), `docs/phase-4-2i-localization-architecture-selection.md`
  (Phase 4.2I: the two-candidate architecture evaluation, the selected
  pose-landmark-guided per-point ownership design, and the full re-run of
  all four benchmarks), `scripts/box-tracker-frozen-
  track-sanity.py` (39/39), `scripts/box-tracker-crop-provenance-sanity.py`
  (30/30), `scripts/box-tracker-sanity.py` (27/27), `scripts/box-tracker-
  teleport-sanity.py` (16/16, 2 assertions updated Phase 4.2F for a real,
  disclosed interaction), `scripts/crop-segment-planning-sanity.py`
  (Phase 4.2D, 24/24), `scripts/detector-event-plausibility-sanity.py`
  (Phase 4.2E, 15/15), `scripts/vanni-240-source-adjudication-sanity.py`
  (Phase 4.2E, 11/11), `scripts/athlete-interior-feature-selection-sanity.py`
  (Phase 4.2F, 24/24), `scripts/cross-fps-coast-scope-sanity.py` (Phase
  4.2G, 24 scenario checks + 17 time-normalization checks),
  `scripts/athlete-independent-metric-contract-sanity.mjs` (Phase
  4.2H, 16/16), `scripts/cross-athlete-coast-risk-sanity.py` (Phase
  4.2H, 22/22), `scripts/phase-4-2i-candidate-b-prototype.py` (new, Phase
  4.2I, the real evidence-harness evaluation), `scripts/skeleton-ownership-sanity.py`
  (new, Phase 4.2I, 15/15), `docs/phase-4-2j-retroactive-short-interval-adjudication.md`
  (Phase 4.2J: the retroactive, offline, multi-signal adjudication pass,
  24 deterministic fixtures, and the full re-run of all four benchmarks),
  `scripts/phase-4-2j-adjudication-sanity.py` (new, Phase 4.2J, 24/24) —
  all re-verified clean this phase.
  - **Phase 4.2K (independent localization verification — complete, closes
    Phase 4.2)**: real diagnostics against the actual disputed interval
    found production's existing full-frame MediaPipe detection never
    detects this athlete at native resolution (too small on-screen), and
    the existing tile-upscale fallback (already shipped, zero new
    dependencies) finds candidates on 93% of disputed frames but is too
    noisy to self-authorize (~40% are a recurring static competing
    candidate). A lightweight HSV appearance check and an uncompensated
    motion-differencing check were both real, tested, and found
    non-discriminative on this footage — disclosed, not used. The one
    genuinely independent, zero-new-dependency signal that worked:
    reconstructing the athlete's own trajectory from real, trusted box
    positions strictly before and strictly after each uncertain run, and
    checking whether the tracker's own coasted position agrees with BOTH
    independent extrapolations. A first attempt reused `box_tracker.py`'s
    own `COAST_TRAJECTORY_ALT_FW` (0.09fw) tolerance and found it produces
    almost no corroboration — real testing proved this borrowed constant
    does not transfer to Vanni 240's tiny (~2.5-3.8% of frame width)
    apparent athlete scale; corrected to a self-referential, 3-sigma
    tolerance derived from each bracket's own real position noise (the
    same established pattern as `stepIntegrity.ts`'s neighbor-median
    ceiling), reusing zero borrowed or invented absolute thresholds. Real
    production reruns of all four benchmarks: Gav is an **exact byte
    match** (zero `frozen_suspect` frames in its own clean data — nothing
    to verify); Vanni 120's exit stays honestly unbridged (byte-identical
    `tracking_loss_ranges`); Vanni 60's long gap stays honestly unbridged,
    with one real, short, separately-bracketed recovery elsewhere
    (`validContacts` 9→10, `combinedStepFrequencyHz` 3.899→4.386); Vanni
    240 shows a real, evidence-traced, non-baseline-chasing improvement
    (`validContacts` 6→7, `combinedStepFrequencyHz` 2.367→3.103) — still
    well below the original Phase 1/2 baseline (11 contacts, 4.858 Hz),
    because the dominant remaining cause of missing evidence (the right
    foot has no detectable MediaPipe landmark evidence for most of the
    clip) is a pose-availability limit, not a localization problem
    independent verification can address. This is the SIXTH independent
    evidence family (across three architectural layers) to confirm the
    same conclusion: wherever a verdict is reachable, the box's real
    position is correct. See
    `docs/phase-4-2k-independent-localization-verification.md` for the
    complete account, including the full architecture-comparison table and
    closure decision.
- **Blocking issue**: none — closed this phase. Phase 4.2C's whole-clip-fit distortion (4.2D), Phase
  4.2E's detector-event-plausibility defect, and Phase 4.2F's barrel-region
  optical-flow difficulty are all fixed and proven fixed. Phase 4.2G made
  the coast-scope gate FPS-consistent; Phase 4.2H replaced it with a
  richer, interpretable evidence vector; Phase 4.2I added a genuinely new,
  real spatial evidence source (pose-landmark-guided per-point ownership,
  zero new dependencies) that strengthens Vanni 240's long-duration
  barrel/wall lock rejection (0.883→1.000 mean background ratio) and
  directly resolves Gav's own root-cause false-positive pattern (0.367→0.087
  mean background-risk reading). Phase 4.2J then implemented and validated
  a bounded, RETROACTIVE, offline adjudication pass (24/24 deterministic
  fixtures) using each frame's already-computed `poseBoundsIoU`/residual
  evidence against real detector self-resolution timing — but its own real
  production rerun found that Vanni 240's real 470-527 disagreement
  interval self-resolves naturally in 171.25ms (inside the 200ms lookahead
  derived from Gav's own real 133ms self-heal time), so **zero corrections
  were applied to any real benchmark**. Gav (protected) remains an exact
  byte match (0 core-field diffs across all 142 frames); Vanni 120's true
  exit and Vanni 60's long gap both correctly stay untouched (no forced
  recovery). The remaining blocker is now a real, FIVE-TIMES-evidenced
  architectural tension: four real-time evidence-signal variants
  (elapsed time, Phase 4.2G; distance/trajectory residual, Phase 4.2H;
  spatial pose-skeleton ownership, Phase 4.2I) plus one retroactive
  variant (box/pose-agreement self-resolution timing, Phase 4.2J) have
  each been tested via real Gav+Vanni 240 production reruns and each
  either regresses Gav or fails to help Vanni 240's SHORT, in-zone
  contamination episodes — `combinedStepFrequencyHz` stays at 1.93
  (baseline 4.858), `validContacts` stays at 8 (baseline 11). Phase 4.2J's
  own source-evidence characterization (Section 5 of its report) points to
  a genuinely DIFFERENT signal family: foot/ankle/heel/toe keypoint
  visibility monotonically degrades (0.956→0.201) as the crop clips the
  athlete's feet during the box's lag, even while shoulder/hip pose (and
  therefore box position itself) stays confident and self-heals on its
  own — meaning box-position correction was never going to fix this
  specific regression, since box position isn't the uncorrected variable.
  Phase 4.2K then built and real-production-tested a genuinely INDEPENDENT
  (not box/pose-agreement-derived) sixth evidence family — bidirectional
  trajectory reconstruction from real, trusted box positions outside each
  uncertain run — and found it corroborates the existing track wherever a
  verdict is reachable, closing the localization question Phase 4.2 was
  chartered to answer. The residual Vanni 240 metric gap is real, disclosed,
  and re-attributed to MediaPipe pose-availability (Phase 4.2K Section 6:
  native full-frame detection cannot find this athlete at all), not to a
  localization defect — out of Phase 4.2's own scope.
- **Next action**: Phase 4.2 is closed. Per Phase 4.2K's own explicit
  recommendation, the next well-evidenced step is NOT another localization
  phase — it is a pose-backend/small-subject-detection capability
  evaluation (roadmap Phase 5 "Cross-FPS tracking normalization" or Phase 6
  "Conditional detector architecture upgrade"), addressing the now
  twice-independently-confirmed finding that MediaPipe itself cannot detect
  this athlete via full-frame search at their real on-screen scale. See
  `docs/phase-4-2k-independent-localization-verification.md` Section 26.

## Phase 5.0 — Pose Fidelity and Backend Capability Evidence (Phase 5.0A–5.0E)

> **Roadmap-weight discrepancy, flagged rather than silently resolved**:
> none of Phase 5.0A (pose fidelity audit), Phase 5.0B (adaptive crop
> geometry), Phase 5.0C (contact-critical foot landmark recovery), or Phase
> 5.0D (multi-frame contact evidence and lower-limb temporal continuity), or
> 5.0E (pose-backend capability benchmark)
> has a defined weight in this tracker's own 18-phase table. Per each
> subphase's own explicit instruction ("do not invent roadmap credit ...
> unless the tracker document defines a weight for this new phase"), **no
> weight is assigned and no percentage credit is claimed for any of them** — this
> section exists purely to record real, evidence-based status and
> findings, consistent with every other phase's own disclosure practice,
> without altering the phase table, the weight pool, or the 26.8% overall
> completion figure. A human should decide whether/where Phase 5.0 belongs
> in the weighted table, and this section should be revisited once that
> decision is made.

- **Phase 5.0A (pose fidelity audit — complete as its own subphase, no
  algorithm changes)**: audited every pipeline stage after localization
  (crop → MediaPipe → serialization → contact detection → metrics) against
  the real, current production artifacts for all four registry benchmarks.
  Found: AVA has no landmark-smoothing/filtering stage of its own between
  MediaPipe and storage; Vanni 240's missing foot-joint evidence is
  dominated (37.4%) by MediaPipe never producing a landmark at all, not by
  low confidence (2.2%) or AVA's own integrity gate (17.5%); pose that IS
  captured is geometrically stable across every benchmark (limb continuity
  0.877-0.958); a torso-to-box pixel offset spiked 4.2× inside the known
  470-527 drift window; MediaPipe was not proven to be the bottleneck. A
  real, separate, previously-undisclosed validation-tooling gap was found
  (`scripts/phase-4-2e-vanni-240-measurements.mjs` never threaded
  `boxOrigin` through, so every prior Phase 4.2 report's cited Vanni 240
  `combinedStepFrequencyHz` (1.933) understated the gate-corrected true
  value (2.367) — a tooling fix, not a production defect). See
  `docs/phase-5-0a-pose-fidelity-audit.md`.
- **Phase 5.0B (adaptive crop geometry — complete as its own subphase)**:
  audited the crop-planning layer specifically (joint-to-boundary margins,
  crop lag decomposition, crop utilization) and found the Vanni 240
  470-527 window's crop-to-athlete residual is dominated (~82%) by
  box_tracker.py's own already-known localization lag (Phase 4.2J,
  correctly left untouched this phase per its own explicit "do not return
  to broad tracker tuning without independent proof of a new localization
  defect" instruction), with a smaller (~18%) real, independently-
  addressable share from crop-planning's own added lag. Implemented a
  bounded, evidence-based adaptive crop redesign (risk-reactive widening,
  a velocity-and-time-scaled forward lead, a full-body containment
  provenance contract) — real Gav production validation caught and forced
  the fix of THREE real regressions before finalizing (two broke
  box_tracker.py's own frozen-track detector; one broke Gav's exact-match
  invariant), leaving risk-reactive widening and the vertical-anchor bias
  INERT BY DEFAULT (the same Gav-vs-Vanni signal-overlap wall Phase 4.2H
  already proved for this identical signal, now independently reconfirmed
  at the crop layer — a real, disclosed negative finding, not a
  shortfall). The crop's own added lag inside the 470-527 window was
  reduced 44% (28.7px→16.0px mean) via the lead redesign and two
  deterministic-fixture-caught bug fixes; Vanni 120/60 show 1 and 0
  `boxOrigin` diffs respectively (localization untouched); Gav shows a
  real, small (<5%), disclosed, non-catastrophic metric shift — an
  unavoidable consequence of the task's own mandate to replace the fixed
  forward-lead formula, not a tracking/eligibility regression (box
  position, origin classification, and tracking-loss ranges all confirmed
  byte-identical or near-identical). See
  `docs/phase-5-0b-adaptive-crop-geometry.md` for the full account,
  including a disclosed, isolated, unfixed anomaly (a single spurious
  post-finish contact in Vanni 240, traced fully but out of this phase's
  scope to fix without touching contact-detection code).
- **Phase 5.0C (contact-critical foot landmark recovery — complete as its
  own subphase)**: fully traced Phase 5.0B's own isolated spurious Vanni
  240 contact (source frame 964) — classified `crop_shift_artifact`: the
  localization box's own right edge sits at x=1.023 (off the source
  image), with `coastRiskState` elevated for the entire ~80-frame
  surrounding window, the same already-documented deep-lock-tail failure
  Phase 4.2H/I established. Built contact-readiness timelines and a full
  missing-foot taxonomy (categories A-J) for all four benchmarks; found
  only 1.88% of Vanni 240's missing foot evidence (categories B+C) is
  plausibly crop-recoverable at all. Implemented a bounded, strictly-gated
  secondary pose-recovery pass — architecturally separate from the primary
  pass, running only when localization is verified AND coast-risk is NOT
  elevated (a real, direct, NEW exclusion motivated by the frame-964
  finding, deliberately stricter than the primary pass's own existing
  eligibility gate) AND a real crop-boundary deficit exists. A real
  diagnostic (Part E) selected an asymmetric, bottom-biased secondary crop
  geometry (height +20%, width unchanged) on real evidence, not
  assumption. **Real production reruns of all four benchmarks found ZERO
  eligible secondary-recovery frames on Gav/Vanni 240/Vanni 120, and
  exactly 2 on Vanni 60 — both of which correctly, honestly found no pose
  at all and merged nothing.** This is a real, honest negative result: the
  "safely recoverable" population (Category C) turns out to overlap almost
  entirely with the population the new, Part-A-motivated coast-risk
  exclusion correctly removes. Gav/Vanni 120/Vanni 60 are byte-identical
  to their own Phase 5.0B results; the Vanni 240 spurious contact from
  Phase 5.0B is now absent, but traced honestly to a pre-existing,
  already-disclosed Pass-1/Pass-2 sensitivity — NOT to this phase's own
  recovery mechanism, which never fired within 40 frames of that event.
  See `docs/phase-5-0c-contact-critical-foot-recovery.md` for the full
  account, including the exact recommended narrower-eligibility direction
  for a future subphase.
- **Phase 5.0D (multi-frame contact evidence and lower-limb temporal
  continuity — complete as its own subphase)**: tested the hypothesis that
  AVA's contact detector drops real evidence by deciding touchdown/toe-off
  too locally (isolated-frame, isolated-landmark). **Not supported by real
  data**: partial (1-2 of 3) foot-landmark configurations are already
  vanishingly rare across all four benchmarks (0% Gav, 0.49% Vanni 240,
  0.10% Vanni 120, 0.43% Vanni 60) — the existing per-frame mean-of-available
  fusion (`steps.ts`/`contacts.ts`) already handles the little partial
  evidence that exists, and the one real near-threshold population found
  (Vanni 240, frames 493-527) is a single already-known MediaPipe
  confidence-decay tail tied to a disclosed localization coast-risk event,
  not new touchdown evidence — using it would reproduce the exact
  false-positive class Phase 5.0C's Part A already excluded. No new
  multi-frame candidate-recovery mechanism was implemented (real evidence
  does not justify one). **One real, previously-disclosed defect WAS found
  and fixed**: `summariseContactFlight()` (`contacts.ts`) computed flight
  between two time-adjacent contact phases with no same-foot/missing-
  intermediate-contact guard — the exact gap Phase 3 disclosed
  (`flightLeftMs: 20ms` on `vanni_fly_120`) and left unfixed. Re-proven on
  real, current data across three of four benchmarks (same-foot-adjacent
  pairs inflated flight time 40-75% by silently merging two real steps'
  worth of evidence into one interval); fixed with a same-foot/excessive-
  duration guard mirroring `stepIntegrity.ts`'s own already-proven Day 103
  guard. Real production reruns of all four benchmarks confirm the fix
  corrects only `flightLeftMs`/`flightRightMs`/`flightCombinedMs` — Gav is
  byte-identical (no same-foot pair exists in its clean data); contacts,
  step frequency, zone time, step length, and ground-contact time are
  unchanged everywhere. See
  `docs/phase-5-0d-multiframe-contact-evidence.md` for the full account.
- **Phase 5.0E (pose-backend capability benchmark — CLOSED; complete as its own
  unweighted evidence phase)**: repaired a dedicated, non-production RTMPose
  environment and compared MediaPipe Heavy with the repository's existing
  RTMPose-M COCO-WholeBody checkpoint on 223 hash-locked production crops from
  all four registered benchmarks. Source frame, source timestamp, orientation,
  crop rectangle, encoded crop bytes, and decoded pixels were identical across
  backends. RTMPose produced zero contact-ready frames at the unchanged 0.4
  evidence floor on every benchmark and was frequently clearly wrong on direct
  source-pixel inspection; it was also ~2.5x slower and used more memory.
  Decision: retain MediaPipe; do not add RTMPose recovery/fusion. Ultralytics'
  AGPL-3.0 legacy detector path remains non-shippable without a separate license
  decision and was excluded from the scientific head-to-head. See
  `docs/phase-5-0e-pose-backend-capability-benchmark.md`.
- **Phase 4.2 reevaluation** (required by Phase 5.0B, Phase 5.0C, and Phase
  5.0D): **Phase 4.2 remains In Progress, contributing 0%.** Vanni 240's
  zone-based metrics do not match their Phase 1/2 baseline after Phase
  5.0D. The exact blocker is now precisely subsystem-attributed:
  Localization contracts pass on all four benchmarks (Gav/Vanni 120/Vanni
  60 fully; Vanni 240's `scientificAthleteBox` remains stable). The
  remaining Vanni 240 degradation is attributable to genuine, disclosed
  LOCALIZATION uncertainty during specific short windows
  (`coastRiskState` elevated — box_tracker.py's own real, disclosed
  short-episode uncertainty, Phase 4.2G/H/I/J), not to a crop-geometry
  defect (Phase 5.0B) or a pose-recovery gap (Phase 5.0C) that either
  phase's own real, evidence-based, honestly-tested mechanisms could
  safely address without also risking the exact false-positive class
  Phase 5.0C's own Part A discovered. `trajectoryResidualFrameWidths`/
  `coastRiskState`-family evidence is now proven, across FIVE independent
  attempts spanning THREE architectural layers (box_tracker.py's
  coast-risk gate, Phase 4.2G/H/I/J; `plan_crops()`'s own risk-reactive
  widening, Phase 5.0B; the secondary-recovery eligibility contract, Phase
  5.0C), unable to separate Gav from Vanni 240's real short-episode
  degradation without either regressing Gav or failing to help Vanni 240
  — a signal-family limit, not a "wrong layer" problem. Phase 5.0D adds a
  FOURTH, independent confirmation from a completely different evidence
  angle (per-landmark temporal continuity, not crop geometry or box/pose
  agreement): Vanni 240's one real near-threshold contact-adjacent
  population is itself the decay tail of the same disclosed coast-risk
  event, not a separate downstream defect. Phase 5.0D touched zero
  localization/crop code; `athlete_tracking_confidence` and
  `tracking_loss_ranges` are byte-identical on all four benchmarks before
  and after.
- **Overall roadmap completion**: **26.8%** (normalized) as of Phase 5.0D —
  unchanged by Phase 5.0A, 5.0B, 5.0C, or 5.0D, per the explicit
  no-invented-credit instruction above. (Superseded by the later Phase
  4.2K, which closed Phase 4.2 and raised overall completion to 29.5% —
  see the "Overall completion" section at the top of this file and
  `docs/phase-4-2k-independent-localization-verification.md`. This
  historical figure is preserved, not rewritten, per this file's own
  practice.)

## Phase 4 — 60 FPS late-run athlete-loss fix

- **Status**: Not Started
- **Weight**: 10% | **Completed weight**: 0.0%
- **Acceptance criteria** (proposed): `vanni_fly_60`'s tracking coverage extends materially past the current 14.8m/20m (66.9%) measurement end position; a finish-gate crossing becomes available (or the specific reason it can't is proven fundamental, e.g. athlete genuinely leaves frame); zoneTimeS becomes available for this clip; validated on `vanni_fly_60` without weakening any tracking/continuity threshold.
- **Evidence/report links**: `docs/phase-0-validation-registry-report.md` Part 3 (`vanni_fly_60` diagnostics, `finish_crossing_unavailable`), Day 104 report (§3, forward-continuity/adaptive-refresh work — related but not validated against this specific new clip).
- **Blocking issue**: none identified yet — Day 104's adaptive-refresh fix exists but was never run against this exact clip until the real rerun that produced this session; `detectorInvocations` behavior on this specific clip has not been separately audited.
- **Next action**: instrument `box_tracker.py`'s drift/loss point specifically on `vanni_fly_60`'s second half (frame-by-frame), per Day 102/104's established method.

## Phase 5 — Cross-FPS tracking normalization

- **Status**: Not Started
- **Weight**: 7% | **Completed weight**: 0.0%
- **Acceptance criteria** (proposed): tracking coverage/quality across all 3 Vanni benchmarks converges to a comparable, documented standard (not necessarily identical numbers, but no FPS-class-specific systematic gap); validated across all 3 `vanni_fly_*` benchmarks simultaneously.
- **Evidence/report links**: `docs/stationary-validation-registry.md` (side-by-side coverage: 240fps 96.0%, 120fps 87.8%, 60fps 66.9%); `docs/phase-3-vanni-120-contact-recovery-report.md` Section 8 (`REACQUISITION_MAX_FRAMES=90` vs `60`, both frame-count-based and unscaled — disclosed, unfixed); **`docs/phase-3-vanni-120-visibility-correction.md` (higher-priority finding, 2026-08-05): a real, proven, reproducible box-tracker localization bug — `box_tracker.py`'s optical-flow athlete tracking jumped ~225px onto empty background for 3 real frames of `vanni_fly_120` while self-reporting full confidence (`tracked`, no low-confidence flag) — this is confirmed to cause real data loss, not just theoretical FPS inconsistency, so should likely be prioritized first within this phase.**
- **Blocking issue**: depends on Phases 1, 3, 4 individually resolving their own FPS-specific issues first.
- **Next action**: none until Phases 1/3/4 complete.

## Phase 6 — Conditional detector architecture upgrade

- **Status**: Not Started
- **Weight**: 10% | **Completed weight**: 0.0%
- **Acceptance criteria** (proposed, conditional per the roadmap spec): EITHER a replacement/supplementary detector is built and validated to materially improve acquisition/tracking on the hardest current benchmark (`vanni_fly_60`) without regressing the others, OR evidence conclusively shows no detector replacement is needed (documented decision + validation), in which case this phase is marked **Not Required — Acceptance Satisfied** and its full weight counts as completed only after that documented decision.
- **Evidence/report links**: Day 102 report §5–11 (real inventory: only `mediapipe==0.10.18`/`opencv-contrib-python` installed; YOLO/RTMPose present but unusable without new dependencies; OpenCV CSRT flagged as a promising, zero-new-dependency next experiment, not yet attempted).
- **Blocking issue**: decision not yet made or documented for v4.0.
- **Next action**: revisit Day 102's CSRT recommendation against the new real benchmarks before deciding required vs. not-required.

## Phase 7 — Skeleton controls and exact overlay synchronization

- **Status**: Not Started
- **Weight**: 8% | **Completed weight**: 0.0%
- **Acceptance criteria** (proposed): user-facing skeleton/overlay controls exist and the overlay is frame-exact (builds on Day 104 Part 5's staleness-rejection work); validated on all 4 benchmarks.
- **Evidence/report links**: Day 104 report §4/5 (overlay staleness rejection, sync diagnostics — foundation, not yet re-validated against these new clips).
- **Blocking issue**: none identified yet.
- **Next action**: not started.

## Phase 8 — Low-lag limb smoothing and anatomical continuity

- **Status**: Not Started
- **Weight**: 6% | **Completed weight**: 0.0%
- **Acceptance criteria** (proposed): limb-identity/anatomical-continuity checking (explicitly flagged as unbuilt in Day 102 §12–14) is implemented and validated; user's "skeleton still occasionally drifts or cannot keep up exactly" observation on `vanni_fly_240` is resolved or measurably improved.
- **Evidence/report links**: Day 102 report §12–14 (explicitly disclosed as unstarted work), Phase 0 user observation on `vanni_fly_240`.
- **Blocking issue**: none identified yet.
- **Next action**: not started.

## Phase 9 — Wind-aware gate stability

- **Status**: Not Started
- **Weight**: 9% | **Completed weight**: 0.0%
- **Acceptance criteria** (proposed): gate stabilization (Day 99's deadband, Day 104's full-height redesign) is validated under real wind/vibration conditions on outdoor footage; builds on but does not simply reuse Day 99/104's synthetic-noise tests.
- **Evidence/report links**: Day 99 report Part 3 (gate stabilization), Day 104 report §6 (full-height redesign) — both foundation, neither validated against real wind conditions.
- **Blocking issue**: no wind-condition benchmark footage currently in the registry.
- **Next action**: not started; would need a real outdoor/windy validation clip added to this registry first.

## Phase 10 — Four-boundary green/blue/red zone system

- **Status**: Not Started
- **Weight**: 5% | **Completed weight**: 0.0%
- **Acceptance criteria** (proposed): a 4-boundary (not 2-gate) zone visualization system is designed, implemented, and validated on at least one stationary benchmark.
- **Evidence/report links**: none yet — new scope, not covered by Day 96–104.
- **Blocking issue**: none identified yet.
- **Next action**: not started.

## Phase 11 — Default playback starts at frame zero

- **Status**: Phase 6.6A implementation CLOSED without weighted credit
  (2026-08-07); its consolidated browser-validation blocker was completed by
  closed Phase 6.2B
- **Weight**: 3% | **Completed weight**: 0.0% | **Percent within phase**: 0% pending required real browser acceptance
- **Acceptance criteria**: the analyzed player now establishes the actual playable
  source-media origin once per media lifecycle; first pose/contact/measurement
  timestamps cannot initialize playback; source-timeline controls allow the true
  beginning; user scrub and pause/resume remain authoritative afterward.
- **Evidence/report links**: `docs/phase-6-6a-source-start-playback.md`; 12/12
  deterministic checks; Vanni 240/120/60 original media all independently probed
  at container/video `start_time=0.000000`.
- **Validation limitation**: original HEVC MOV decoding remains unavailable in
  Chromium, but Phase 6.2B completed real-player validation with the documented
  test-only, timestamp-mapped H.264 copies. Scientific evidence remained original-source.
- **Next action**: none for the former Phase 6.2 browser blocker.

## Phase 12 — Stable auto-follow

- **Status**: Not Started
- **Weight**: 5% | **Completed weight**: 0.0%
- **Acceptance criteria** (proposed): auto-follow (explicitly untouched this phase and in Day 96–104) is validated for stability across all 4 benchmarks.
- **Evidence/report links**: none from this phase (auto-follow was explicitly out of scope for Days 96–104 too).
- **Blocking issue**: none identified yet.
- **Next action**: not started.

## Phase 13 — Final contact and step integrity

- **Status**: Not Started
- **Weight**: 4% | **Completed weight**: 0.0%
- **Acceptance criteria** (proposed): the missing-contact/aggregate-integrity protections (Day 103/104) are re-validated end-to-end against all 4 current benchmarks specifically (not just the older, now-deleted sessions they were built against); confirm the 2.7–3.5m screenshot mystery from Phase 0 Part 4 is resolved (either matched to a real session or confirmed to no longer be reproducible).
- **Evidence/report links**: Day 103 report (missing-contact integrity), Day 104 report §5 (`evaluateAggregateStepLength`), Phase 0 report Part 4 (unresolved screenshot mapping); `docs/phase-3-vanni-120-contact-recovery-report.md` Section 10 (new finding: `summariseContactFlight()` in `src/lib/video/contacts.ts` does not share the same-foot/discontinuity guard that protects `individualStepLengthsM` — produced an implausible `flightLeftMs=20ms` on real `vanni_fly_120` data because two flagged same-foot transitions still feed the raw flight-interval calculation; real, disclosed, unfixed pending this phase per Phase 3's Part 2 instruction not to change shared logic broader than its own scope).
- **Blocking issue**: the specific screenshots' source session is unidentified (may be permanently unrecoverable — the likely source session was deleted during the Aug 4 cleanup).
- **Next action**: confirm with the user whether the 2.7–3.5m screenshots can be re-obtained or are considered historical/moot.

## Phase 14 — Internal trim/analysis-window workflow

- **Status**: Not Started
- **Weight**: 3% | **Completed weight**: 0.0%
- **Acceptance criteria** (proposed): a repeatable internal workflow for trimming source footage before analysis (as the user manually did to produce these 3 new Vanni benchmarks) is documented/tooled, reducing manual trim work for future validation clips.
- **Evidence/report links**: none yet — new scope.
- **Blocking issue**: none identified yet.
- **Next action**: not started.

## Phase 15 — ETA and processing-stage validation

- **Status**: Not Started
- **Weight**: 2% | **Completed weight**: 0.0%
- **Acceptance criteria** (proposed): Day 104's real frame-throughput countdown (Part 8) is validated end-to-end with a live UI polling trace (explicitly disclosed as not captured in Day 104) on at least one of the 4 current benchmarks.
- **Evidence/report links**: Day 104 report §7 (implementation) and §8 "Countdown accuracy" (disclosed limitation: no live UI trace captured).
- **Blocking issue**: none identified yet — purely a re-validation task.
- **Next action**: capture a live UI polling trace during a real rerun of one of the 4 benchmarks.

## Phase 16 — Full stationary scientific validation

- **Status**: Not Started
- **Weight**: 6% | **Completed weight**: 0.0%
- **Acceptance criteria** (proposed): all 4 benchmarks produce metrics independently validated against real external ground truth (currently only Gav has any); requires obtaining new ground truth for the 3 Vanni benchmarks (Freelap/Brower/manual timing/tape measurement) since none currently exists.
- **Evidence/report links**: Phase 0 report Part 5 (ground-truth inventory — only Gav has independent ground truth).
- **Blocking issue**: no ground truth exists for any Vanni benchmark; this is a hard prerequisite, not an engineering task alone.
- **Next action**: determine whether/how the user can obtain independent timing/distance reference data for the Vanni benchmarks.

## Phase 17 — Panning reintroduction

- **Status**: Not Started
- **Weight**: 1% | **Completed weight**: 0.0%
- **Acceptance criteria** (proposed): explicitly a transition milestone only, per the roadmap spec — panning has its own future roadmap and is not otherwise addressed by v4.0.
- **Evidence/report links**: none from this phase (panning was explicitly untouched, as required).
- **Blocking issue**: depends on all stationary phases (0–16) being in an acceptable state first, per the roadmap's own framing.
- **Next action**: not started; out of v4.0's real scope beyond this placeholder.
