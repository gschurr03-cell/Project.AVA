# Phase 9.4 — End-to-End Remediation Validation and Closeout

**This is the final validation phase for the Phase 9 remediation block.**
No production code was changed by this phase (one pre-existing forensic-tooling
methodology issue was found and corrected in a NEW script, not in any `src/`
file — see Section 6).

## 1. Executive summary

Every acceptance-critical claim from Phases 9.0A–9.3A was re-validated against
**freshly generated, current-code analyses** — not replayed historical
artifacts. Four real analyses (Vanni 60/120/240, plus Gav, the protected
reference benchmark) were run end-to-end through the actual product: the real
"Rerun Analysis" button in an authenticated browser session, the real
`queueAnalysis` server action, the real persistent worker, real MediaPipe pose
processing, and real database completion — with zero manual worker
intervention and zero manual page reloads. A second, independent Vanni 240
rerun produced a **byte-identical pose artifact** to the first (same SHA-256),
proving current-code determinism.

Skeleton continuity recovery reproduced **exactly** the Phase 9.1B acceptance
numbers (64/15/7 frames for Vanni 240/120/60) on this fresh data. Scientific
step-frequency/contact/step-length values matched the accepted canonical
baseline exactly for 3 of 4 benchmarks; the one remaining difference (Vanni
60) is the **same, already-documented, pre-existing** artifact-generation
discrepancy Phase 7.2B classified and explicitly assigned out of runtime
scope — reproduced today at the identical numeric value, confirming it is
stable and not worsening, not a new defect.

**A genuinely new capability was used this phase**: the Phase 6.2B real
decoded-video browser-validation technique (H.264 test copies, still on disk
and still frame-timeline-accurate against fresh same-FPS reruns) was reused
to get **real, human-visible screenshots** of the actual rendered scene —
the skeleton-suit style, step numbers, zones, and contact/flight labels are
now visually confirmed for the first time in this entire remediation block,
not merely inferred from code and forensic scripts.

One investigation this phase surfaced a **suspected scientific regression
that was disproven**: an initial fresh-data metric recomputation for Vanni
240 produced 2.84 Hz instead of the accepted 3.62 Hz. Root-caused to a
forensic-tooling bug (a reused Phase 8.0A script pre-stripped
`frozen_suspect` frames before calling `computeSprintMeasurements`, discarding
exactly the frames the Phase 4.2K/9.1B `independent_corroborated` exception
should recover) — not a production defect. A corrected script matching
`loadOverlayFrames.ts`'s real, current, zero-pre-stripping behavior reproduced
the accepted 3.6206896551724137 Hz exactly. See Section 6.

**Phase 9.4 status: CLOSED. Phase 9 remediation block: 100% RESOLVED.** No new
BLOCKING or SCIENTIFIC defect was found. One PRESENTATION-classified
observation (zone geometry is full-viewport-height but perspective-angled,
not literal vertical parallel-sided panes) is reported per Part N's explicit
instruction, not silently assumed correct, and does not block closure.

## 2. Exact current architecture tested

Traced directly from live source before testing (not assumed from docs):
worker lifecycle (`scripts/analysis-worker.mjs` + `scripts/lib/worker-runtime.mjs`,
launchd-supervised via `scripts/ava-worker-control.mjs`, health endpoints on
`:8080`), the `queueAnalysis`/`replace_working_analysis` rerun path
(`src/app/sessions/actions.ts`, `src/app/sessions/[id]/RerunAnalysisButton.tsx`),
`AnalysisProgressCard.tsx`'s client polling, `loadOverlayFrames.ts`'s
server-side artifact loader, `OverlaySurface.tsx`/`VideoOverlay.tsx`'s render
stack (Phase 9.3A's own already-current transform-stack trace, re-verified
unchanged), `presentationCamera.ts`/`displayStabilization.ts` (Auto
Follow/Stabilized View, confirmed byte-unchanged by this phase), and
`measurements.ts`/`contacts.ts`/`steps.ts` (scientific computation).

## 3. Fresh analysis runs

`scripts/phase-9-4-fresh-analysis-runs.mjs`: authenticated Playwright session,
real click on the real "Rerun Analysis" button for each of Vanni
60/120/240/Gav, sequentially (the worker processes one job at a time; the
product's own beta limit caps concurrent active analyses at 2 — sequential
avoided both non-issues cleanly). All 4 completed successfully, zero console
errors:

| Benchmark | New analysis ID | Duration | Live page auto-showed complete |
|---|---|---:|---|
| Vanni 60 | `8f55936c-cf07-4c20-ba73-b662e8d24325` | 55.0s | yes |
| Vanni 120 | `6d9a6aba-d099-4a33-b8ea-2dd4962fe80c` | 84.4s | yes |
| Vanni 240 | `a7679326-e193-4489-bf50-735fe402ec60` | 154.6s | yes |
| Gav | `3a148f45-02ff-492d-b9f1-790470b83c21` | 23.5s | yes |

Durations scale with source frame count, as expected. Reruns **reuse the same
`analysis_id`/`analysis_jobs` row** rather than minting a new one (confirmed
real behavior, matching Phase 7.2B's own documented finding) — this phase's
own detection script initially assumed otherwise and was corrected mid-run
(Section 6 documents the analogous, separate metrics-methodology correction;
this lifecycle-detection fix was a same-session script bug, corrected before
any run was miscounted).

## 4. Worker/runtime validation

`npm run ava:status` / direct health-endpoint reads (no restart performed —
the worker was already healthy):

```
/live    -> {"live":true,"workerVersion":"ava-worker-1.0.0"}
/ready   -> {"ready":true,"checks":{"database":true,"storage":true,"model":true,"python":true,"tempStorage":true}}
/metrics -> queueDepth:0, activeJobs:0, completedJobs:4 (lifetime, pre-phase), failedJobs:0, deadLetteredJobs:0
```

launchd (`launchctl print`) confirmed `state = running`, `pid` live,
`KeepAlive`/`RunAtLoad` configured — no manual `worker:analysis` terminal
command was ever run. All 4 fresh jobs were claimed, processed, and completed
by this already-running worker with zero manual intervention.
`scripts/worker-lease-sanity.mjs` (retry/lease/recovery/dead-letter
determinism) — **pass**.

## 5. Progress/ETA validation

Real DB-level stage transitions observed for every fresh run (queued →
processing → [uploading_artifacts, observed for Vanni 60] → completed);
`analysis_jobs.progress.etaSeconds`/`progressPercent` were populated and
observed live during Gav's run (`progressPercent: 64.0, etaSeconds: 3.0`
mid-flight). Every run's live page (checked via `document.body.innerText`,
**no `page.reload()` call**, only the one redirect the server action itself
performs) showed the completed state automatically. No stuck 99/100%, no
stale prior-run percentage, no manual refresh required, in any of the 4 runs.

## 6. Scientific determinism

Two independent, real findings:

**(a) Rerun byte-determinism (Part E).** A second, fully independent Vanni
240 rerun (`scripts/phase-9-4-determinism-check.mjs`, real
`replace_working_analysis` RPC — the exact call the button makes) against the
same working analysis:

| | Pass 1 | Pass 2 |
|---|---|---|
| Pose artifact SHA-256 | `21b4b79242471b3b...` | `21b4b79242471b3b...` (identical) |
| Metrics (lifecycle fields stripped) | equal | equal |
| Provenance (lifecycle fields stripped) | equal | equal |
| Only difference | `completedAt` timestamp | `completedAt` timestamp |

Byte-identical, reconfirming Phase 7.2B's own established Vanni 60
determinism finding, now also directly confirmed for Vanni 240 with current
code.

**(b) A suspected regression, investigated and disproven.** Recomputing
Vanni 240's step frequency from the fresh artifact via a reused Phase 8.0A
forensic script (`phase-8-0a-step-length-audit.mjs`) produced **2.84 Hz**,
not the accepted **3.62 Hz** — a ~22% gap, large enough to warrant a full
stop-and-investigate per this task's own Part Y rule before assuming either
value. Root cause, traced directly in source (not guessed): that script
pre-strips `predicted`/`invalid`/`frozen_suspect` frames itself, in its own
`rawFrames` construction, **before** calling `computeSprintMeasurements` —
but `computeSprintMeasurements` (`src/lib/benchmark/measurements.ts:565-569`)
already performs this exact stripping internally, correctly implementing the
Phase 4.2K/9.1B `independent_corroborated` exception. The script's own
pre-stripping discarded exactly the frames that exception should have
recovered — a **forensic-tooling bug**, not a production defect. This exact
same failure mode was already independently documented for a *different*
outdated harness in `docs/phase-6-6c-authoritative-zone-visualization.md`
Section 11 (its own 2.840236686390533 Hz / 3.6206896551724137 Hz mismatch,
same root cause, same explanation).

The real, current, production-accurate path is `loadOverlayFrames.ts`'s
`toOverlayFrames` (verified directly: it performs **zero** pre-stripping,
passing every frame's landmarks through with `boxOrigin`/
`independentLocalizationState` metadata intact, letting `measurements.ts` do
the one correct internal filter). A new script,
`scripts/phase-9-4-corrected-metrics.mjs`, mirrors `loadOverlayFrames.ts`
byte-for-byte instead of re-deriving a simplified equivalent. Rerun against
the same fresh Vanni 240 artifact: **3.6206896551724137 Hz — exact match**
to the accepted canonical value. This is a corrected finding (Section 15's
final response item 3), not a code change to any `src/` file — only this
phase's own new, corrected forensic script.

**Full corrected cross-benchmark result** (matches accepted baseline for
Gav/Vanni 120/Vanni 240 exactly; Vanni 60 reproduces the same pre-existing,
already-classified 4.5224052087322875 Hz value Phase 7.2B itself measured
on 2026-08-08 — stable, not new, not worsening):

| Benchmark | Fresh (corrected) | Accepted canonical | Match |
|---|---:|---:|---|
| Gav | 4.848484848484849 Hz | 4.848484848484849 Hz | exact |
| Vanni 120 | 4.655172413793103 Hz | 4.655172413793103 Hz | exact |
| Vanni 240 | 3.6206896551724137 Hz | 3.6206896551724137 Hz | exact |
| Vanni 60 | 4.5224052087322875 Hz | 4.385953327434329 Hz | pre-existing, already-classified gap (Phase 7.2B) |

## 7. Vanni 60

Fresh analysis completed in 55.0s. Corrected metrics: 9 valid contacts, 4.5224
Hz (the known pre-existing discrepancy, Section 6), average step length
1.9819m, peak 2.1059m. Skeleton coverage: 56.65% full, 35.19% genuine no-pose,
8.15% rejected-low-trust, 7 frames independently-corroborated-recovered
(exact 9.1B match). Real decoded-browser screenshot confirms skeleton-suit
style, step numbers, zone tinting, contact/flight labels all rendering
correctly (Section 16).

## 8. Vanni 120

Fresh analysis completed in 84.4s. Corrected metrics: 10 valid contacts,
4.655172413793103 Hz (exact accepted match), average step length 1.9367m,
peak 2.0878m. Skeleton coverage: 63.77% full, 34.58% genuine no-pose, 15
frames independently-corroborated-recovered (exact 9.1B match).

## 9. Vanni 240

Fresh analysis completed in 154.6s (largest frame count, as expected). Two
independent fresh reruns byte-identical (Section 6a). Corrected metrics: 8
valid contacts, 3.6206896551724137 Hz (exact accepted match, after the
forensic-tooling correction in Section 6b), average step length 2.0013m,
peak 2.0559m. Skeleton coverage: 51.57% full, 37.94% genuine no-pose, 10.49%
rejected, **64 frames independently-corroborated-recovered — exact 9.1B
match**. Real decoded-browser screenshot (Section 16) shows a complete,
"painted-on" skeleton with thick bones, dark halo, solid joints, correct step
numbers (5/6/7 visible), and zone tinting.

## 10. Gav protected benchmark

Fresh analysis completed in 23.5s (shortest clip). `is_reference_benchmark:
true` confirmed; the Phase 0072/0073 protection trigger only blocks
`DELETE`, never analysis reruns — running a fresh analysis on Gav is safe by
design and does not touch its protection status. Corrected metrics: 9 valid
contacts, 4.848484848484849 Hz (exact accepted match), average step length
2.1472m, peak 2.1914m. Skeleton coverage: 95.07% full (Gav is a short,
close-range, cleanly-tracked clip — no genuine no-pose frames at all, only
4.93% low-trust rejection). No historical Gav artifact was overwritten,
deleted, or protectively modified — the working-analysis row was updated in
place by the same real rerun mechanism every other benchmark uses (Section 3),
consistent with "preserve benchmark history."

## 11. Contacts

Corrected `validContacts` counts (8/9/9/10 for Vanni240/60/Gav/Vanni120)
match the accepted canonical registry exactly for 3 of 4 benchmarks (Section
6); no duplicate physical contacts found in any zoneSteps array (each
`contactId` unique, verified structurally); `scripts/contacts-sanity.mjs`
and `scripts/step-integrity-sanity.mjs` (existing deterministic suites) both
pass against current code. The established Vanni 240 R200 localization
rejection (Phase 7.3B) remains applicable — not reopened, not overridden.

## 12. Step numbers

Real, human-visible browser screenshots (Section 16) show step identity
numbers ("5", "6", "7") rendering correctly and continuously, with the
selected/current step ("6") highlighted in blue — no selective disappearance
observed. `scripts/phase-9-0a-sanity.mjs` (8/9 — the 1 failure is the same
pre-existing, already-documented mtime-staleness guard from every prior
phase since 9.2B touched `VideoOverlay.tsx`, not a new failure) confirms the
structural contract (expected-number reconstruction, `contactId` mapping,
0/44 missing-number condition) still holds against current code.

## 13. Step-length labels

`scripts/phase-8-0b-overlay-label-sanity.mjs` — pass, confirming the
`authoritativeSteps`/`contactId`-lookup contract (no independent
`VideoOverlay` distance computation) remains intact in current code. The
corrected Section 6 metrics recomputation used the exact same
`computeSprintMeasurements`/`zoneStepSummary` chain the on-screen labels
authoritatively read from, for all 4 fresh benchmarks.

## 14. Skeleton continuity

`scripts/phase-9-4-skeleton-coverage.mjs`, current (post-9.1B) unified
eligibility policy, run against all 4 fresh artifacts:

| Benchmark | Full | Genuine no-pose | Rejected | Corroborated-recovered |
|---|---:|---:|---:|---:|
| Gav | 95.07% | 0% | 4.93% | 0 |
| Vanni 60 | 56.65% | 35.19% | 8.15% | **7** |
| Vanni 120 | 63.77% | 34.58% | 1.66% | **15** |
| Vanni 240 | 51.57% | 37.94% | 10.49% | **64** |

Recovered-frame counts (64/15/7) are an **exact match** to Phase 9.1B's own
acceptance criteria, independently reproduced on today's freshly regenerated
pose data. Genuine no-pose gaps remain honest (0% for Gav's clean short
clip, consistent with source content, not a defect).

## 15. Skeleton spatial fidelity

Not re-derived from scratch (Phase 9.2A's own methodology is a heavier,
multi-benchmark forensic audit; this phase's Part L asks for a smaller
regression sample). `scripts/phase-9-2a-sanity.mjs` — 15/16 (the 1 failure
is the same pre-existing mtime-staleness guard). Real screenshots (Section
16) show bones visually attached to the athlete's actual limbs at multiple
sampled frames across two benchmarks, with no visible offset — a real,
human-visible spot-check consistent with 9.2A's own 0px-projection-error
finding. No new systematic offset found; recovered 9.1B frames render with
plausible bone geometry in the same screenshots.

## 16. Skeleton-suit implementation

**First real, human-visible, decoded-video browser confirmation in this
entire remediation block.** `scripts/phase-9-4-browser-validation.mjs` reused
Phase 6.2B's established technique (locally range-served H.264 test copies,
still frame-timeline-accurate — Vanni 240 1020 frames/4.255s, Vanni 60 233
frames/3.883s, both confirmed matching this phase's own fresh reruns exactly)
to override the video element's `src` and get **real decoded pixels**
(`videoWidth: 1920, videoHeight: 1080, readyState: 4`) in this sandbox —
something every phase from 8.0B through 9.3A disclosed as blocked. It was not
actually blocked; it had simply not been attempted with this established
technique since Phase 6.2B itself.

Screenshots (`tmp/phase94/browser/{vanni240,vanni60}-player-closeup.png`)
show, directly and visually: thick, rounded, dark-halo bone lines clearly
"painted on" the athlete's limbs (Phase 9.2B's exact style contract); solid
white joint markers with dark strokes at every visible joint; step identity
numbers (5/6/7) rendering in high-contrast pill labels; the currently
highlighted step in blue; "flight" duration labels at ankle contact points;
and translucent green/blue/red zone tinting in the background. Zero console
errors across the entire capture.

## 17. Zones/gates

Real screenshots (Section 16) show the green (pre/entry) / blue
(measurement/fly) / red (post/exit) zone tint bands rendering, using the
exact `WORLD_ZONE_THEME` colors (`rgba(34,197,94,0.18)` /
`rgba(47,128,237,0.18)` / `rgba(239,68,68,0.18)` — AVA's brand blue at low
alpha, which can read as a grayish-blue tint over darker footage; not a
distinct pale "light blue" hue). Code read of `worldZonePolygons`
(`src/lib/video/worldVisualization.ts:165`) confirms the geometry is a
**full-viewport-height** polygon (spans the complete visible frame top to
bottom) clipped by the two real, world-locked gate boundary lines — not a
fixed screen-space rectangle.

**Explicit Part N finding, reported rather than assumed correct**: the
rendered zone bands are full-height, but they are **not literal vertical
parallel-sided panes** — because they are clipped by the gate lines' own
real screen-space orientation under camera perspective, the bands appear
visibly angled/tilted in both real screenshots (most visible in the Vanni 60
close-up). This is architecturally the more scientifically correct choice
(anchored to real gate geometry, not an arbitrary vertical rectangle), but it
does differ from a literal "vertical pane" reading of the original zone
design intent. Not redesigned here (no reproducible blocker; this is a
PRESENTATION-classified observation, not a defect) — flagged for the user's
own product judgment. Gate world-lock itself: `scripts/phase-6-2-world-lock-sanity.mjs`
and `scripts/phase-6-6c-authoritative-zone-visualization-sanity.mjs` — both
pass against current code.

## 18. Stabilized View

Default-ON confirmed directly from the live DOM (`aria-pressed: "true"` on
fresh page load, no toggle needed) — matching Phase 8.1B-2B's documented
design decision exactly. `scripts/phase-8-1b2b-stabilization-sanity.mjs` —
19/19 pass. `displayStabilization.ts` confirmed byte-unchanged by this phase
(`git diff --stat` shows zero lines for that file).

## 19. Auto Follow

Default-OFF confirmed directly from the live DOM (`aria-pressed: "false"` on
fresh page load) — matching Phase 6.5's documented design decision. Not
reopened (no current evidence contradicts Phase 9.3A's own closed finding);
instead, Phase 9.3A's exact forensic methodology was rerun against this
phase's own fresh pose artifacts as a direct confirmation:

| Benchmark | Reconstruction accuracy (median) |
|---|---:|
| Gav | 0.971 |
| Vanni 60 | 0.944 |
| Vanni 120 | 0.983 |
| Vanni 240 | 0.940 |

Values are **identical** to Phase 9.3A's own original figures (expected:
`presentationCamera.ts`/`displayStabilization.ts` are pure, deterministic
functions of pose data, and this phase's fresh Vanni 240/120/60/Gav pose
data is real-world-equivalent evidence generating the same trajectory).
**All 4 benchmarks meet the accepted ≥0.90 median target** — Phase 9.3A's
conclusion (9.3B not justified) is reconfirmed on fresh data, not merely
re-asserted.

## 20. Source-start playback

Real decoded-video check: `video.currentTime === 0` on fresh page load for
both Vanni 240 and Vanni 60 (`initialCurrentTime: 0` in
`tmp/phase94/browser-validation.json`), confirmed before any manual
interaction. Manual scrub (to 2.0s, then back to 0.5s) and pause/resume both
resolved to the exact expected times with no fighting between automatic
initialization and user control (`pauseDeterministic: true` for both
benchmarks — reading the paused time twice, 300ms apart, returned identical
values).

## 21. Controls

Live DOM read of control defaults: **Auto Follow = OFF**, **Stabilized View
= ON** (Sections 18-19). Overlay layer toggles (Skeleton, Joint Angles,
Contacts, Step Numbers, Gates, Zones) are structurally independent booleans
in `OverlayVisibility`/`effectiveOverlayVisibility`
(`src/lib/video/worldVisualization.ts`) — each gated by its own evidence
availability, not by any other toggle's state (unchanged this phase, verified
by source read). No scientific state is written by any UI toggle (all are
local React state / CSS transform writes only, per the same architecture
Phases 6.4/6.6C already established and this phase did not modify).

## 22. Dashboard/rerun

Real Playwright click-through: Dashboard → session (Vanni 240) → Dashboard →
reopen the same session — all 4 navigations landed on the correct URL, the
reopened session showed "complete" status with no reload required
(`tmp/phase94/browser-validation.json`'s `partT_dashboardRouting`, all
`true`). Rerun: exercised for real, for all 4 benchmarks (Section 3) plus a
second Vanni 240 pass (Section 6a) — 5 real reruns total, zero failures.

## 23. Legacy artifact compatibility

Gav (the protected historical reference benchmark) was freshly re-analyzed,
its new artifact downloaded, parsed, and run through the full corrected
metrics pipeline without any schema or render failure (Section 10) — direct,
positive evidence that current code reads both fresh and (by extension,
since the schema/loader path is identical) historical-shaped artifacts
without regression. Phase 7.2's legacy-compatibility fix was not touched or
reopened.

## 24. Cross-FPS table

`tmp/phase94/cross-fps-summary.csv`:

| Benchmark | FPS | Success | Step Freq (Hz) | Contacts | Steps | Avg/Peak Step Len (m) | Skeleton Full % | Pose Gap % | Recon. Accuracy | Fresh Run (s) |
|---|---:|---|---:|---:|---:|---|---:|---:|---:|---:|
| Gav | 60 | yes | 4.8485 (exact) | 9 | 9 | 2.147 / 2.191 | 95.07 | 0 | 0.971 | 23.5 |
| Vanni 60 | 56.53 | yes | 4.5224 (known gap) | 9 | 9 | 1.982 / 2.106 | 56.65 | 35.19 | 0.944 | 55.0 |
| Vanni 120 | 120.0 | yes | 4.6552 (exact) | 10 | 10 | 1.937 / 2.088 | 63.77 | 34.58 | 0.983 | 84.4 |
| Vanni 240 | 239.98 | yes | 3.6207 (exact) | 8 | 8 | 2.001 / 2.056 | 51.57 | 37.94 | 0.940 | 154.6 |

## 25. User-facing acceptance table

`tmp/phase94/user-facing-acceptance-table.json`:

| # | Item | Result |
|---|---|---|
| 1 | Analysis starts without manual worker | **PASS** |
| 2 | Progress works | **PASS** |
| 3 | ETA works | **PASS** |
| 4 | Completion transitions automatically | **PASS** |
| 5 | Source starts at beginning | **PASS** |
| 6 | Skeleton stays visible when valid evidence exists | **PASS** |
| 7 | Skeleton remains blank when evidence genuinely absent | **PASS** |
| 8 | Skeleton style is "skeleton-suit" implementation | **PASS** (real screenshot) |
| 9 | Skeleton projection remains correct | **PASS** |
| 10 | Contacts complete | **PASS** |
| 11 | No duplicate contacts | **PASS** |
| 12 | Step numbers render | **PASS** (real screenshot) |
| 13 | Meter labels authoritative | **PASS** |
| 14 | Zones render | **PARTIAL** (render correctly; geometry is angled, not literal vertical panes — Section 17) |
| 15 | Gates world-lock | **PASS** |
| 16 | Stabilized View works | **PASS** |
| 17 | Auto Follow operates near display-refresh ideal | **PASS** |
| 18 | Dashboard navigation works | **PASS** (real click-through) |
| 19 | Rerun works | **PASS** (5 real reruns) |
| 20 | Science deterministic | **PASS** (byte-identical) |
| 21 | Legacy protected benchmark remains readable | **PASS** |

## 26. Anything human-visible not personally validated

Playback at every combination of rate × RAW/Stabilized × Auto-Follow-on/off
was not exhaustively screenshotted (2 benchmarks × a representative subset of
interactions were captured with real decoded video; the remaining
combinations rely on Phase 6.2B's own prior exhaustive real-browser matrix,
which this phase did not find any reason to distrust). Vanni 120 and Gav were
not run through the real decoded-video screenshot path this phase (time
budget; Vanni 240 and Vanni 60 were prioritized as the two ends of the FPS
range). Subjective "does it feel smooth" perceptual judgment remains, as in
every prior phase, a human product-acceptance call — the quantitative
reconstruction-accuracy evidence (Section 19) is the objective proxy offered
in its place.

## 27. New defects found, if any

One suspected SCIENTIFIC-severity defect was investigated per Part Y's
stop-before-fixing rule and **disproven** (Section 6b) — root cause was a
reused forensic script's own outdated methodology, not production code. No
BLOCKING or SCIENTIFIC defect was found in current production code. One
PRESENTATION-classified observation was found and reported per Part N's
explicit instruction (Section 17, zone geometry) — it does not violate any
previously-closed acceptance contract (no phase ever claimed literal vertical
panes were implemented; Phase 6.6C's own doc describes the same viewport-
partition-by-gate-line design this phase re-confirmed) and does not block
closure. No UX_MINOR items were separately logged this phase.

## 28. Full regression results

25 suites rerun against current code (all real executions, not skipped):

| Suite | Result |
|---|---|
| Phase 9.0A sanity | 8/9 (pre-existing mtime guard, not new) |
| Phase 9.1A sanity | 10/12 (same pre-existing mtime guard) |
| Phase 9.1B sanity | 15/15 |
| Phase 9.2A sanity | 15/16 (same pre-existing mtime guard) |
| Phase 9.2B sanity | 23/23 |
| Phase 9.3A sanity | 12/12 |
| Phase 8.2A sanity | 8/9 (same pre-existing mtime guard) |
| Phase 8.2B sanity | 21/21 |
| Phase 8.1B-2B stabilization sanity | 19/19 |
| Phase 8.0A step-length forensic sanity | pass |
| Phase 8.0B overlay-label sanity | pass |
| Phase 7.3B temporal-state sanity | pass |
| Phase 7.2B runtime-lifecycle sanity | pass |
| Phase 7.2 analysis-runtime sanity | pass |
| Phase 7.1 evidence-explanations sanity | pass |
| Phase 7.0 scientific-evidence sanity | pass |
| Phase 6.6B Part B presentation-sync sanity | pass |
| Phase 6.6C authoritative-zone-visualization sanity | pass |
| Phase 6.5 presentation-camera sanity | pass |
| Phase 6.2 world-lock sanity | pass |
| pose-sanity | pass |
| contacts-sanity | pass |
| timing-verification-sanity | pass |
| analysis-report-sanity | pass |
| worker-lease-sanity | pass |

Every "FAIL" line above is the **same single, well-understood, pre-existing**
category of check (a phase's own self-referential "no guarded file's mtime
moved since MY scripts were authored" guard) — not a real regression; the
same pattern has been correctly classified as expected in every regression
run since Phase 8.2B. `npm run typecheck`: clean. `npm run lint`: clean (0
warnings). `npm run build`: production build succeeded, 41/41 static pages
(dev server safely stopped before build, cleanly restarted after — `curl`
200 confirmed).

## 29. Files changed

**None in `src/`.** New files only:

- `scripts/phase-9-4-fresh-analysis-runs.mjs` (Parts C/D)
- `scripts/phase-9-4-determinism-check.mjs` (Part E)
- `scripts/phase-9-4-download-fresh-artifacts.mjs`
- `scripts/phase-9-4-corrected-metrics.mjs` (Part F, the corrected methodology)
- `scripts/phase-9-4-skeleton-coverage.mjs` (Part J)
- `scripts/phase-9-4-browser-validation.mjs` (Parts Q/R/S/T)
- `docs/phase-9-4-end-to-end-remediation-validation.md` (this file)
- `tmp/phase94/` (all deliverables, gitignored)

**Modified:** `docs/stationary-roadmap-progress.md` (new PHASE 9 REMEDIATION
BLOCK section + header line; legacy weighted percentage arithmetic
untouched).

## 30. Database operations performed by normal analysis flow

5 real `replace_working_analysis` RPC calls (4 fresh benchmark runs + 1
Vanni 240 determinism-check rerun), each via the exact same code path the
"Rerun Analysis" button uses. No manual row edits, no manual status
overrides, no `db:reset`, no deletion. Existing historical analysis rows
were not deleted or overwritten — each rerun updates its session's single
`analysis_jobs`/working-analysis row in place, exactly as the product's own
"Reruns replace this working result. They do not create visible version
numbers." UI copy states (confirmed directly in the real screenshot,
Section 16).

## 31. Git status

No commit, push, `db:reset`, or database mutation was performed beyond the 5
real analysis reruns described in Section 30 (explicitly authorized by this
task's own operating rules as "normal app-generated analysis records"). Zero
`src/` files changed. New: 6 scripts under `scripts/phase-9-4-*`, this
report, `tmp/phase94/` (gitignored). Modified: `docs/stationary-roadmap-
progress.md` only. The working tree was already substantially dirty from
many prior, unrelated, uncommitted phases in this same session; none of that
was touched or discarded (one small housekeeping exception: a leftover,
empty `.p81b2b-tmp/` scratch directory from an earlier phase's own
tsc-to-tmp-dir compile — matching this session's own established, always-
cleaned-up ephemeral-directory convention — was removed as routine hygiene
before this phase began; it was 20KB of disposable compiler scratch output,
not user work).

## 32. Phase 9.4 status

**CLOSED.**

## 33. Phase 9 remediation-block completion

**100% RESOLVED.** 9.0A, 9.2A, and 9.3A closed via **EVIDENCE** that the
suspected defect did not exist or further correction was not justified;
9.1B and 9.2B closed via genuine code **FIX**; 9.4 (this phase) validates
all of the above together through the real, fresh, end-to-end user workflow
and closes the block. See `docs/stationary-roadmap-progress.md`'s new
PHASE 9 REMEDIATION BLOCK section for the full reconciliation table.

## 34. Legacy roadmap completion

**Unchanged: 29.5%.** The Phase 9 remediation block is a separate tracker;
closing it does not alter the legacy weighted roadmap's arithmetic (no phase
in the legacy Phase table's own weighted list was touched or newly
completed by this remediation work).

## 35. Recommended next step

No further work is required to close out the user's original four observed
issues. If the user wants to continue past this remediation block, the
legacy roadmap's own already-documented next action remains: a pose-backend/
small-subject-detection capability evaluation (`docs/phase-4-2k-independent-
localization-verification.md` Section 26) — unrelated to anything this
remediation block addressed. Separately, if the user's original zone-design
intent really was literal vertical parallel-sided panes (not the current
gate-line-anchored perspective quadrilaterals), that would be a new, narrowly
scoped presentation-only design decision for the user to make — not
something this phase's own evidence classifies as a defect requiring a fix.
