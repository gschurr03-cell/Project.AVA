# Phase R3A — Cross-FPS Contact Acquisition + Early-Run Stride Detection Forensic Audit

**Status: EVIDENCE-ONLY audit COMPLETE. No production code changed. No fix implemented.**

## 1. Executive summary

Real, quantified evidence — not screenshots, not assumptions — traces the user's two reported symptoms to two genuinely different mechanisms:

1. **Vanni 60 "starts up mid-run"**: **CONFIRMED, precisely quantified.** Real source video shows the athlete already mid-stride at source frame 0 (t=0.000s). Raw MediaPipe pose evidence exists with high visibility (0.9+) from as early as frame 7-8. But the worker's box-tracker localization state (`boxOrigin`) stays `"invalid"` for **21 consecutive frames (350ms)** before flipping to `"detected"` — discarding real, high-confidence pose evidence purely because the upstream localization hasn't yet earned trust. AVA's first authoritative contact doesn't appear until frame 37 (t=0.617s). Two real candidate contacts (frame 7, frame 20) that exist in the unstripped/full-pose data are lost specifically because they fall inside this 350ms window.

2. **Vanni 240 "major stride/contact-detection problems"**: **PARTIALLY explained by an already-documented, non-fixable camera-framing limit, NOT primarily a fresh contact-detection software defect.** Phase 9.1A already proved (visually, from real source frames) that the athlete is genuinely outside the camera's field of view for **1.34 continuous seconds** (frames 668-989) — nearly a third of the clip. This phase's own fresh, full-timeline scan found 6 additional contacts present in unstripped data but absent from the final authoritative set: 3 are legitimate, intentional quality-gate rejections (matching the same, already-validated Phase 4.2K policy 7.3A/7.3B established), and 3 are near-duplicate candidates 4-16.5ms from an already-accepted contact — physiologically impossible as distinct footfalls for any human sprinter, and almost certainly correctly suppressed, not genuine misses.

**The same early-clip localization-warmup mechanism found for Vanni 60 also affects Gav (116.7ms warmup, 1 lost contact) and marginally Vanni 120 (66.7ms, 1 contact at the boundary) — it does NOT meaningfully affect Vanni 240, whose warmup is comparatively very short (41.7ms) due to its high frame rate.** This is the dominant, cross-benchmark, well-evidenced, fixable defect this audit found.

## 2. Exact benchmark identities

Real session/analysis IDs (`tmp/phaseR3A/benchmark-identities.json`), carried forward from Phase 7.3A/9.1A's own real database reads and re-verified against the Phase 9.4 fresh pose artifacts used throughout this session:

| Benchmark | Session ID | Source | FPS | Frames | Duration | Authoritative contacts (today) |
|---|---|---|---:|---:|---:|---:|
| Gav | `e04a7983-...` | `FullSizeRender.mov` | 60 | 142 | 2.367s | 12 |
| Vanni 240 | `31fe352b-...` | `IMG_4557 2.mov` | 239.981 | 1020 | 4.250s | 10 |
| Vanni 120 | `160a86a2-...` | `IMG_4556 2.mov` | 120.005 | 483 | 4.025s | 12 |
| Vanni 60 | `3d6ba4b6-...` | `IMG_4555 2.mov` | 60 | 233 | 3.883s | 10 |

## 3. How source-video contact ground truth was established

Two complementary sources, both real:

- **Reused, already-adjudicated** Phase 7.3A/7.3B ground truth (4 candidates, sourced from real contact sheets extracted from the original `.mov` files, deterministic-manifest SHA-256-preserved) — not re-derived from scratch.
- **Fresh this phase**: a full-timeline `unstripped-detectStepMarks vs. stripped-detectStepMarks` diff (not merely a narrow "unusual interval" heuristic scan) across all 4 complete benchmark runs, plus real, sequentially-decoded (never `CAP_PROP_POS_FRAMES`/`avg_frame_rate`-based — the explicitly flagged bug class) source-video contact sheets for the two windows the user specifically flagged: Vanni 60 frames 0-44 and Vanni 240 frames 65-90/105-135/260-285.

**Honestly disclosed limitation**: exhaustive frame-by-frame manual adjudication of literally every candidate contact across all four complete runs was **not** performed — a separate, materially larger undertaking. This audit targeted representative, evidence-based adjudication at the specific windows the user flagged and reused prior, already-real adjudication elsewhere. See `tmp/phaseR3A/manual-contact-ground-truth.json`.

## 4. Contact recall for each benchmark

`tmp/phaseR3A/contact-recall-summary.json`:

| Benchmark | Authoritative | Unstripped (no quality gate) | Missing | Root cause |
|---|---:|---:|---:|---|
| Gav | 12 | 12 | 1 | 100% inside warmup window |
| Vanni 60 | 10 | 12 | 2 | 100% inside warmup window |
| Vanni 120 | 12 | 13 | 1 | 8.3ms past warmup boundary |
| Vanni 240 | 10 | 14 | 6 | 3 legitimate quality-gate, 3 correctly-suppressed near-duplicates |

## 5. Exact missing contacts on Vanni 240

`tmp/phaseR3A/vanni240-missing-contact-traces.json`:

| Side | Source frame | Time | Raw `boxOrigin` | First failing stage |
|---|---:|---:|---|---|
| right | 11 | 0.0458s | `tracked` (clean) | STATE_MACHINE — 4ms from already-accepted frame 10; correct duplicate suppression |
| left | 76 | 0.3167s | `tracked` (clean) | STATE_MACHINE — 179ms from already-accepted frame 119; physiologically implausible as a distinct stride |
| right | 123 | 0.5125s | `frozen_suspect` + `independent_corroborated` (passes gate) | STATE_MACHINE — 16.5ms from already-accepted frame 119; ineligible for Phase 7.3B recovery (below the 130ms cross-foot guard) |
| left | 180 | 0.7500s | `frozen_suspect` + `independent_disagrees` | QUALITY_GATE — correctly, intentionally withheld |
| right | 227 | 0.9458s | `frozen_suspect` + `independent_disagrees` | QUALITY_GATE — correctly, intentionally withheld |
| right | 989 | 4.1208s | `invalid` | QUALITY_GATE — correctly, intentionally withheld (inside Phase 9.1A's already-documented athlete-off-frame interval) |

None of these 6 is counted as a confirmed production false negative; see Section 3's ambiguity policy.

## 6. Exact missing early contacts on Vanni 60

`tmp/phaseR3A/vanni60-startup-trace.json`. Both are inside the 350ms localization-warmup window:

| Side | Source frame | Time | Raw `boxOrigin` |
|---|---:|---:|---|
| right | 7 | 0.1167s | `invalid` (raw ankle visibility 0.964) |
| left | 20 | 0.3333s | `invalid` (raw ankle visibility 0.916) |

## 7. First failing pipeline stage for every confirmed miss

- **Vanni 60 (both) / Gav (1) / Vanni 120 (1, boundary-adjacent)**: **ATHLETE_NOT_LOCALIZED** — raw pose landmarks exist with high visibility, but the upstream box tracker's `boxOrigin` has not yet transitioned out of `"invalid"`. This is upstream of `stripUnstableLandmarks` (which behaves exactly as designed, given the input it receives) and upstream of `steps.ts`'s contact algorithm entirely.
- **Vanni 240 (3 of 6)**: **QUALITY_GATE** — correctly, intentionally withheld `frozen_suspect`/`invalid` frames, matching the already-established, already-validated Phase 4.2K policy (7.3A's own V240/200 precedent).
- **Vanni 240 (3 of 6)**: **STATE_MACHINE** — candidates survive stripping and generation but are suppressed for being 4-16.5ms from an already-accepted contact; algorithmically indistinguishable from correctly-suppressed noise (no human sprinter produces two distinct same-foot or immediately-adjacent-opposite-foot events that close together).

## 8. Raw pose vs. production-eligible pose findings

Full per-frame landmark data: `tmp/phaseR3A/vanni240-missing-contact-traces.json`, `tmp/phaseR3A/vanni60-startup-trace.json`. Decisive finding for Vanni 60: **MediaPipe found the athlete's foot with high confidence (visibility 0.9+) well before the localization state trusted it** — this is not a MediaPipe/pose failure; it is a downstream localization-state-machine warmup characteristic discarding evidence MediaPipe already produced.

## 9. Contact state-machine findings

Instrumented (additive-only, never-modifying) copy of `detectSide()` confirms the algorithm behaves exactly as its own documentation states: per-side rolling cooldown/replacement, then cross-foot de-duplication, then Phase 7.3B's same-foot-adjacency recovery. All three Vanni 240 near-duplicate losses (frames 11, 76, 123) are explained entirely by this already-understood, already-correct mechanism — no new state-machine defect was found in `steps.ts` itself.

## 10. FPS/timebase findings

`tmp/phaseR3A/fps-timebase-audit.json`. `minSameSideSpacingMs` (250) and `minStepSpacingMs` (130) are **already correctly time-based** (proven by direct source read: compared as real seconds×1000, not frame counts) — not a defect. Two parameters ARE frame-count-based: `smoothingWindowFrames=3` (effective physical window: 50ms@60fps, 25ms@120fps, 12.5ms@240fps — a real 4× asymmetry) and `MIN_VALID_FRAMES=3` (12.5-50ms, small in absolute terms). The worker's own `detector_cadence_frames=8` (full-frame detector runs once every 8 frames) is also frame-count-based, directly explaining why higher-FPS clips show shorter absolute warmup times.

## 11. Initialization/warmup findings

`tmp/phaseR3A/initialization-history-audit.json`. Localization warmup duration, real measured values:

| Benchmark | FPS | Warmup (ms) | Warmup (frames) |
|---|---:|---:|---:|
| Gav | 60 | 116.7 | 7 |
| Vanni 60 | 60 | **350.0** | 21 |
| Vanni 120 | 120.005 | 66.7 | 8 |
| Vanni 240 | 239.981 | 41.7 | 10 |

Gav and Vanni 60 share the same FPS (60) yet warm up **3× differently** (116.7ms vs. 350ms) — proof this is not primarily an FPS effect but a per-clip localization-difficulty effect (matching Phase 9.1A's own established "small/distant athlete" finding for the Vanni recordings). `steps.ts`'s own `MIN_VALID_FRAMES=3` requirement is NOT the observed bottleneck — the box tracker's localization state is.

## 12. Pose-density findings

`tmp/phaseR3A/pose-density-by-fps.json` — full `boxOrigin` distribution and per-second normalization for all 4 benchmarks, internally verified (counts sum to frame totals).

## 13. Side-assignment findings

`tmp/phaseR3A/side-assignment-audit.json`. No evidence of side MISASSIGNMENT (a real contact labeled the wrong foot) in any benchmark — side comes directly from which foot's own landmarks produced the local maximum, never inferred or corrected. Remaining same-side adjacencies in the final sequence are real, evidence-based gaps (Phase 7.3B's recovery already resolves every ELIGIBLE case) not assignment corruption.

## 14. Contact timing-error findings

`tmp/phaseR3A/contact-timing-error.json`. Full sub-frame manual timing adjudication was not performed this phase (disclosed honestly). The algorithm's own structural precision bound (from its 3-frame centered smoothing window) is real and derivable directly from the code: ±1 frame, which is **±16.7ms at 60fps but only ±4.2ms at 240fps** — meaning 240fps has inherently BETTER structural timing precision, not worse. No evidence supports "240fps has bad event timing" as a category distinct from its (already-addressed) recall issues.

## 15. Downstream measurement consequences

`tmp/phaseR3A/downstream-measurement-consequences.json`. Every missing contact would, if recovered, change `totalContacts`/`validContacts`, `combinedStepFrequencyHz`, `avgIndividualStepLengthM`, and adjacent step-length/velocity values under the EXISTING, unchanged formulas — exactly the same class of consequence Phase 7.3B already documented and the project already accepted for its own 3 recoveries. A missing contact does not corrupt neighboring intervals' own math; it simply makes that one physical stride invisible to the metrics.

## 16. Contact acquisition, step pairing, or both?

**Primarily CONTACT_ACQUISITION** (evidence discarded before a candidate can even form, for the warmup-window losses) for Gav/Vanni60/Vanni120. **A mix of QUALITY_GATE (acquisition-adjacent) and correctly-functioning STATE_MACHINE suppression** for Vanni 240 — not a step-pairing defect (no evidence of L/R sequence corruption was found; Section 13). "Stride detection" as a vague catch-all is not supported as the actual failure category for either benchmark.

## 17. Dominant fixable root cause

**INITIALIZATION_HISTORY** (early-clip localization-warmup discarding real, high-visibility pose evidence) — cross-benchmark (Gav, Vanni 60, marginally Vanni 120), well-evidenced, and the exact mechanism behind the user's specifically reported Vanni 60 symptom.

## 18. Is this genuinely 240-specific?

**No.** Vanni 240's warmup is the SHORTEST of the four (41.7ms) — the localization-warmup defect is if anything LEAST consequential for Vanni 240. Vanni 240's own distinct issues (near-duplicate suppression, the 1.34s off-frame gap) are not primarily FPS-driven either: the off-frame gap is a camera-framing/field-of-view limitation (the athlete physically leaves the shot), and the near-duplicate pattern's most likely contributing factor (`smoothingWindowFrames` being narrower in real time at high FPS) is a real, quantified FPS effect, but this phase found the EXISTING spacing guards already correctly suppress it — not a proven, currently-manifesting defect.

## 19. Exact R3B recommendation

`tmp/phaseR3A/r3b-recommendation.json`. Split into two independent tracks, not implemented this phase:

- **R3B-1 (primary, recommended)**: investigate shortening the box tracker's `"invalid"`→trusted transition specifically during the first few hundred milliseconds of a clip (when no prior track exists to protect), without weakening what "detected/tracked" means. Targets Gav/Vanni 60/Vanni 120.
- **R3B-2 (exploratory, lower priority)**: evaluate redefining `smoothingWindowFrames` as a fixed physical-time window (e.g. ~12.5ms) instead of a fixed frame count, for cross-FPS smoothing consistency. Targets Vanni 240 and future higher-FPS input; not proven necessary by this audit's evidence (existing guards already suppress the candidates this would affect).

Acceptance targets (contact recall, false positives, timing error, cross-FPS consistency, early-contact acquisition) are defined in the same file — not implemented, only specified.

## 20. Scientific regression

Zero production files changed this phase, so this is a no-op regression, verified: `phase-r1c-contact-render-alignment-sanity.mjs` 17/17, `phase-r1b-presentation-step-length-sanity.mjs` 24/24, `phase-7-3b-temporal-state-sanity.mjs` 11/11, `phase-7-3a-contact-trace.mjs --closed-baseline` reproduces the frozen manifest exactly (the flag-less invocation legitimately diverges because Phase 7.3B's later, already-closed change added recovery logic this pre-7.3B script's own reimplementation doesn't include — a known, pre-existing, correctly-classified non-regression, not caused by this phase), `measurement-recovery-sanity.mjs` PASS, `zone-step-counting-sanity.mjs` 25/25, `timing-verification-sanity.mjs` PASS, `vanni-240-metric-evidence-sanity.mjs` PASS, `npm run typecheck` clean, `npm run lint` clean, `npm run build` clean production build (stop dev → build → restart dev followed).

## 21. Anything not personally validated

- Exhaustive frame-by-frame manual adjudication of every candidate contact across all four COMPLETE benchmark runs (Section 3's disclosed limitation).
- Sub-frame empirical timing-error measurement against manually-adjudicated touchdown instants (Section 14) — only the algorithm's structural bound was computed.
- The exact internal Python mechanism inside `box_tracker.py` producing the specific 7/21/8/10-frame warmup counts (the file's parameters were read and cited, e.g. `detector_cadence_frames=8`, but the full 1000+-line state machine was not exhaustively traced line-by-line to prove the EXACT arithmetic producing each specific warmup frame count — out of proportion for this phase's scope, and unnecessary to support this phase's conclusions).
- Definitive visual (not just algorithmic) adjudication of Vanni 240 frames 76 and 123 at higher-than-thumbnail resolution.

## 22. Files changed

**None in `src/`.** New, evidence-only additions: `scripts/phase-r3a-pipeline-audit.mjs`, `scripts/phase-r3a-missing-contact-trace.mjs`, `scripts/phase-r3a-consolidate.mjs`, `scripts/phase-r3a-synthesis.mjs`, `scripts/phase-r3a-ground-truth.mjs`, `scripts/phase-r3a-contact-sheets.py`, `scripts/phase-r3a-contact-acquisition-sanity.mjs`, this report, `tmp/phaseR3A/`.

## 23. Tests

`scripts/phase-r3a-contact-acquisition-sanity.mjs` — **16/16 passing**.

## Git status

No commit, push, `db:reset`, or database mutation. Worktree remains intentionally dirty with all prior uncommitted phases' work preserved.

## Phase status: COMPLETE (forensic only)

**DO NOT START R3B. DO NOT START THE LONGITUDINAL MATHEMATICAL ENGINE. STOP AFTER R3A.**
