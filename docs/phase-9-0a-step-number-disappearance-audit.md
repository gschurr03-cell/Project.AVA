# Phase 9.0A — Step-Number Disappearance Forensic Audit

Evidence-only forensic audit. No production code was changed. This phase
opens the new remediation block (9.0–9.4); Phase 9.0A itself earns no
remediation-block completion — only Phase 9.0B (a future, separate task)
can close 9.0.

## 1. Executive summary

The user reported that on the Vanni clips, the step **mark** (contact dot)
remains visible while the step **number** disappears. This audit's leading
suspect, per the commissioning task itself, was Phase 8.0B's authoritative
step-length migration accidentally coupling the step-number draw to the
meter-label lookup.

**That hypothesis is disproven by direct code inspection and by a real,
deterministic, data-driven replay of the exact current production render
condition against all four current benchmarks.** `VideoOverlay.tsx`'s step
number (`mark.index`) is drawn unconditionally whenever `show.step_numbers`
is true — it has zero dependency on `authoritativeStepLengthById`/`meters`.
Replaying the real condition against real, current production data for Gav,
Vanni 240, Vanni 120, and Vanni 60 (43 real contacts total) found **zero**
missing step numbers under the registry's default toggle state, while
finding **11** legitimately, intentionally missing meter labels — exactly
matching Phase 8.0A/8.0B's own documented, evidence-gated design (first/last
contact of the run, and same-foot-integrity-rejected intervals, correctly
show no metre value).

The best-evidenced explanation for the user's report is that the **meter
label** (not the step-identity number) is what they observed missing on
some marks — a real, intentional, already-proven-correct Phase 8.0B
behavior, not a defect — compounded by Phase 6.4's own design decision to
bundle the step-identity number and the meter label under a single "Step
Numbers" toggle (documented in that phase's own report: *"`step_numbers`
owns sequence numbers and calibrated distance labels"*). If that single
toggle were unchecked in the user's session (session-local state, not
persisted, and not observable retroactively by this audit), both the number
and the meter label would disappear together while the dot (a separate
"Contacts" toggle) remained — matching the user's report if they were
focused only on the number and did not separately remark on the meter
label. This audit cannot confirm or rule out that specific session
condition, and says so plainly rather than guessing.

A separate, real finding surfaced during instrumentation (not the reported
defect, but relevant to the new roadmap's Phase 9.1 "Skeleton
continuity/dropout"): `VideoOverlay.tsx` runs its **own**, independent
presentation clock (`presentedMediaTimeS`, Phase 6.6B), distinct from
`OverlaySurface.tsx`'s Auto Follow clock (already characterized in Phase
8.2A). In this sandboxed environment it can remain frozen near zero even
when `video.currentTime` is genuinely advancing and video pixels ARE
decoding (confirmed on Gav specifically) — suppressing **all** pose-dependent
rendering (skeleton, contacts, numbers, and meter labels together), not
selectively. This is disclosed as a candidate root cause for Phase 9.1, not
claimed as the cause of this phase's reported symptom (which is asymmetric
between dot and number; a frozen clock is not).

## 2. Remediation roadmap status

New remediation block, starts at **0%**:

| Phase | Name | Weight |
|---|---|---:|
| 9.0 | Step-number regression | 15% |
| 9.1 | Skeleton continuity/dropout | 25% |
| 9.2 | Skeleton spatial "painted-on" fidelity | 30% |
| 9.3 | Residual 240 FPS Auto Follow skip | 20% |
| 9.4 | End-to-end validation | 10% |

Phase 9.0A is forensic-only and earns **0%** — per the commissioning task's
own explicit instruction, credit is only available once the defect is
understood *and* a follow-up fix is validated (Phase 9.0B, not begun). The
legacy weighted roadmap (`docs/stationary-roadmap-progress.md`) remains
separate and unchanged at **29.5%** normalized completion.

## 3. Exact current benchmark identities

Resolved live from the database (not from titles), 2026-08-10:

| Benchmark | Session | `current_working_analysis_id` | Source FPS | Pose artifact |
|---|---|---|---:|---|
| Gav | `e04a7983-7406-4a00-bb89-8ada7b10bf9f` | `3a148f45-02ff-492d-b9f1-790470b83c21` | 59.159 | `.../3a148f45-....pose.json` |
| Vanni 240 | `31fe352b-f00f-4a80-b20a-17c2ab08ec5a` | `a7679326-e193-4489-bf50-735fe402ec60` | 239.981 | `.../a7679326-....pose.json` |
| Vanni 120 | `160a86a2-c0db-4e7d-9fbe-82aedd6d3eff` | `6d9a6aba-d099-4a33-b8ea-2dd4962fe80c` | 120.005 | `.../6d9a6aba-....pose.json` |
| Vanni 60 | `3d6ba4b6-a3b4-450a-b9f0-ef36a1311b8d` | `8f55936c-cf07-4c20-ba73-b662e8d24325` | 56.530 | `.../8f55936c-....pose.json` |

All four identities are byte-identical to Phase 8.0A/8.0B/7.3A/7.3B's own
recorded identities — no session/analysis identity has changed since those
phases closed. `fps_override` is unset for all four; `calibration_gates`
carries `cameraType: "stationary"` for all four (unchanged).

## 4. Expected numbering reconstruction (ground truth)

Reconstructed by calling the real, unmodified production functions
(`detectStepMarks`, `applyRealWorldStepDistances`, `computeSprintMeasurements`)
against the real, current pose artifacts and calibration rows
(`scripts/phase-9-0a-render-logic-replay.mjs`; full table in
`tmp/phase90a/render-logic-replay.json`):

| Benchmark | Total marks | Missing step number | Missing meter label | Missing dot |
|---|---:|---:|---:|---:|
| Gav | 12 | 0 | 3 | 0 |
| Vanni 240 | 9 | 0 | 4 | 0 |
| Vanni 120 | 12 | 0 | 2 | 0 |
| Vanni 60 | 10 | 0 | 2 | 0 |
| **Total** | **43** | **0** | **11** | **0** |

Every one of the 43 real contacts across all four benchmarks gets a
well-formed, sequential `contactId`/index (verified: no gaps, no
duplicates, no undefined values — `src/lib/video/steps.ts`'s
`index: i + 1` is assigned once, unconditionally, over the final
merged/recovered mark array). The 11 missing meter labels exactly reproduce
Phase 8.0A/8.0B's own documented pattern: the first and last contact of
each run (no interval exists to measure) plus same-foot,
integrity-rejected intervals — real, intentional, evidence-backed absences,
not a code defect.

## 5. Contact marker vs. step number vs. meter-label contract (current, verified)

Four separate visual objects, current status for every real contact
(43/43, all four benchmarks):

| Object | Status | Gating |
|---|---|---|
| **Contact marker** (dot) | PRESENT for all 43 | `show.contacts` only |
| **Step identity number** | PRESENT for all 43 | `show.step_numbers` only |
| **Step-length meter label** | PRESENT for 32/43, correctly ABSENT for 11/43 | `show.step_numbers && meters != null` |
| **Skeleton/foot-contact graphic** | Separate, unrelated code path (`show.skeleton`/live foot contact-vs-flight ring at line 931, gated by `show.contacts && showPose`) | independent of the historical step marks entirely |

The step-length meter label is the only one of the four objects with a
scientific-evidence gate (`authoritativeStepLengthById`, Phase 8.0B). The
contact marker and step number are both purely toggle-gated — present
whenever their respective control is on and the mark has been reached by
playback, with **no** dependency on calibration, zone membership, or
integrity evidence.

## 6. Phase 8.0B regression audit — disproven, not assumed

Phase 8.0B's own diff (verified against the exact current source, not
re-derived from memory) added exactly:

```ts
// measurements.ts: additive field
contactId: string;   // on ZoneStep

// VideoOverlay.tsx: new lookup map + one changed line
const authoritativeStepLengthById = new Map(
  (authoritativeSteps ?? [])
    .filter((step) => step.stepLengthM != null)
    .map((step) => [step.contactId, step.stepLengthM as number]),
);
...
const meters = authoritativeStepLengthById.get(markId) ?? null;
```

The **number** draw (`mark.index`) was **not** touched by Phase 8.0B — it
reads directly from `canonicalSteps`, VideoOverlay's own independent
`detectStepMarks` output, which has existed unchanged since long before
Phase 8.0B and has no `authoritativeSteps`/`contactId`-lookup dependency at
all. Current source, verified line-for-line:

```ts
if (show.step_numbers) {
  placeLabel(ctx, `${mark.index}`, p.x + 7, p.y - 10, color, placedLabels);
}
if (show.step_numbers && meters != null) {
  placeLabel(ctx, `${meters.toFixed(2)} m`, p.x + 6, p.y + 10, color, placedLabels);
}
```

The first `if` has no `meters` term. **`STEP_NUMBER_COUPLED_TO_METER_LABEL`
is disproven**, not merely unconfirmed — proven both by static reading and
by the real-data replay in Section 4 (0/43 numbers missing while 11/43
meter labels are correctly absent, meaning the two are demonstrably
independent in the live data, not just in theory).

What Phase 8.0B *did* change, confirmed real and correct: 4 contacts across
the 4 benchmarks that previously showed a wrong, false-positive meter value
now correctly show none; 3 contacts that previously showed nothing now
correctly show a real value (Section 7 of that phase's own report,
reproduced identically by this audit's fresh rerun of
`scripts/phase-8-0b-overlay-label-audit.mjs` against current live data).
Net effect: the **meter label**, not the number, changed visibility for a
small number of specific contacts — the plausible source of a
"there used to be a number there" perception if a viewer is comparing
before/after without distinguishing which of the two overlaid text objects
they mean.

## 7. Component data-flow trace

```
page.tsx: authoritativeSteps={measurements?.zoneSteps ?? null}
  → OverlayVideoPlayer (plain pass-through prop)
    → OverlaySurface (plain pass-through prop)
      → VideoOverlay: authoritativeStepLengthById built once per clip
```

Traced and confirmed at each boundary (static source read, all four files):
the prop is forwarded unchanged at every layer — no filtering, no
transformation, no conditional drop between `page.tsx` and `VideoOverlay`.
**This entire chain affects only the meter label.** The step number's data
source (`canonicalSteps`, from `detectStepMarks(frames)`) is computed
**inside** `VideoOverlay.tsx` itself from the `frames` prop directly — it
never touches the `authoritativeSteps` prop chain at all. A hypothetical
break anywhere in the `authoritativeSteps` plumbing (e.g., `measurements`
being null) could only ever suppress the meter label, never the step
number — confirmed structurally, not run against a synthetic null case
(out of scope: no evidence `measurements` is ever null for these four
benchmarks; Section 4's real reconstruction used the real, non-null
`computeSprintMeasurements` output throughout).

## 8. Render-condition audit (term-by-term)

For contact `contact-76-left-2` (Vanni 240, a representative contact with
a real, present meter label) under the registry default toggle state
(`show.contacts = true`, `show.step_numbers = true`):

| Term | Value | Result |
|---|---|---|
| `show.contacts` | `true` | dot drawn |
| `show.step_numbers` | `true` | number drawn |
| `meters` (`authoritativeStepLengthById.get(markId)`) | `1.814...` (non-null) | meter label drawn |

For `contact-278-left-3` (Vanni 240, a representative contact with a
correctly-absent meter label — a same-foot-bridging interval `stepIntegrity`
rejects):

| Term | Value | Result |
|---|---|---|
| `show.contacts` | `true` | dot drawn |
| `show.step_numbers` | `true` | number drawn |
| `meters` | `null` | meter label **not** drawn |

Both cases show the dot and the number; only the meter label differs. This
pattern holds for all 11 meter-label-absent contacts across all four
benchmarks (full per-contact table: `tmp/phase90a/render-logic-replay.json`).

## 9. Draw-order/clipping audit

`placeLabel` (the function that draws both the number and the meter label)
was read in full: on a collision with an already-placed label, it tries up
to 8 alternate vertical offsets and, even in the worst case, **still calls
`drawLabel`** — it never silently skips a draw. This structurally rules out
"drawn then invisibly discarded by collision avoidance" as a cause (Part J).
No `ctx.clearRect` call occurs between the dot draw and the number/label
draw within a single animation frame (verified: `ctx.clearRect` is called
once, at the top of `draw()`, before any per-mark drawing begins). No
canvas-clipping region (`ctx.clip()`) is active around the step-marks block
(none is invoked anywhere in `VideoOverlay.tsx`'s draw loop for this
section).

## 10. Transform interaction

The number's screen position (`p.x + 7, p.y - 10`) and the dot's position
(`p.x, p.y`) are both derived from the **same** `projectWorldStep(mark)`
call, computed once per mark before either is drawn (`if (!p) continue;`
skips the ENTIRE mark — dot, number, and label together — if projection
fails; it cannot skip only the number). Both therefore pass through the
identical Auto Follow / Stabilized View CSS transform stack (the shared
`followWrapperRef`/`stabilizationWrapperRef` wrappers established in Phase
6.5/8.1B-2B/8.2B) — there is no code path by which Auto Follow or
Stabilized View could move or clip the number differently from the dot,
since they share one coordinate before either is drawn and one shared
wrapper transform after. A real, pixel-level browser confirmation of this
was attempted but blocked by this session's established video-decode
environment limitation (Section 12); this section's conclusion rests on the
structural/code-level proof, not a live capture.

## 11. Control-state audit

The overlay registry (`src/lib/video/worldVisualization.ts`) defines
`step_numbers` and `contacts` as fully independent entries, both
`defaultVisible: true`, both `evidenceRequirement: "contacts"` (identical —
verified this rules out an evidence-gating asymmetry between them; if
evidence were the cause, both would be disabled together, not one alone).
Toggle state is session-local React `useState`, initialized fresh from the
registry defaults on every mount (`grep` confirms zero
`localStorage`/`sessionStorage` usage anywhere in the overlay control
stack) — a fresh page load cannot start with "Step Numbers" unchecked.

A live, authenticated browser check (`scripts/phase-9-0a-browser-fillText-audit.mjs`)
confirmed the **current, live, running app's** "Contact Events" and "Step
Numbers" checkboxes both read `checked: true` on a fresh session load for
all four benchmarks — the default state is intact today. Whether the
user's own specific testing session had "Step Numbers" unchecked (an active
click) cannot be determined retroactively by this audit; this is disclosed
as a real, unresolved possibility, not ruled in or out.

Per Phase 6.4's own documented design (`docs/phase-6-4-overlay-controls.md`
Section 10): *"`step_numbers` owns sequence numbers and calibrated
distance labels"* — i.e., the single "Step Numbers" toggle was **always**
designed to control both the index number and the meter label together, as
one bundled concept. This is not a Phase 8.0B or Phase 9.0A finding; it
predates both and is working exactly as designed.

## 12. Live/scrub behavior

A genuinely new, real, disclosed finding, surfaced by instrumentation, not
assumed: `VideoOverlay.tsx` maintains **its own** presentation clock
(`presentedMediaTimeS`), separate from `OverlaySurface.tsx`'s Auto Follow
clock (`presentedTimeRef`, Phase 6.6B/8.2A). Both prefer a real, *promoted*
`requestVideoFrameCallback` result over `video.currentTime` whenever the
API exists. In this sandboxed Chromium, that promotion never occurs
(confirmed again this phase — see Section 13) — so
`presentedMediaTimeS` can remain frozen near its initial (near-zero) value
even while `video.currentTime` visibly advances under real `.play()`
(confirmed: `video.currentTime` reached 0.988s over 4s of real playback on
Gav, whose pixels DO decode in this environment, `videoWidth: 1920`) — and
even then, **zero** skeleton/contact/step canvas text was captured. This
would suppress the dot, the number, and the meter label **together**, not
selectively — it does not match the user's asymmetric report and is not
claimed as this phase's root cause. It is flagged here because it is real,
reproducible, and squarely in scope for the new roadmap's **Phase 9.1
(Skeleton continuity/dropout)** — a strong, evidence-backed lead for that
future phase, not acted on here.

## 13. Cross-FPS pattern

No FPS dependence exists in the step-number-missing count: **0 missing at
every FPS** (Gav ~59fps, Vanni 60/120/240) and regardless of contact count
(9–12 per benchmark), zone eligibility, or whether a contact was originally
recovered by Phase 7.3B (`R443`/Vanni 240, `L178`/`L227`/Vanni 120 — all
three recovered contacts show their step number correctly; two of the
three also correctly show a meter label, `R443`'s is present, `L178`/`L227`
are both present too — verified directly in
`tmp/phase90a/render-logic-replay.json`). The defect the user described
does not correlate with any of the candidate factors this audit checked.

## 14. Exact root cause

| Candidate | Verdict | Evidence |
|---|---|---|
| `STEP_NUMBER_COUPLED_TO_METER_LABEL` | **DISPROVEN** | Section 6/8: code has no such coupling; real replay shows 0/43 numbers missing while 11/43 meter labels are correctly absent |
| `AUTHORITATIVE_STEP_LOOKUP_MISMATCH` | not applicable | the step number never reads `authoritativeSteps` at all |
| `CONTACT_ID_MISMATCH` | not applicable to the number (only the meter label uses `contactId` lookup, and it's verified correct — Section 6) |
| `ZONE_ELIGIBILITY_GATING` / `EVIDENCE_GATING` | **DISPROVEN** for an asymmetry | `contacts` and `step_numbers` share the identical `evidenceRequirement`, ruling out evidence-driven divergence between them (Section 11) |
| `OFF_BY_ONE_NUMBER_ASSOCIATION` | **DISPROVEN** | `index: i + 1` assigned once, unconditionally, sequentially (Section 4) |
| `CONTROL_STATE_REGRESSION` | **PLAUSIBLE, unresolved** | Session-local toggle state; default is verified correct today (Section 11), but the user's own specific session state cannot be checked retroactively |
| `DRAW_ORDER_OCCLUSION` | **DISPROVEN** | `placeLabel` never silently skips a draw (Section 9) |
| `CLIPPING_POSITION_ERROR` / `TRANSFORM_COMPOSITION_ERROR` | **no evidence found; structurally unlikely** | dot and number share one projected point and one transform stack (Section 10); real pixel-level confirmation blocked by environment (Section 12/15) |
| `PLAYBACK_STATE_RENDER_ERROR` | **real, but does not match the reported symptom** | VideoOverlay's own presentation clock can freeze in this environment (Section 12) — but this suppresses the dot too, contradicting the user's report |
| `OTHER` | **best-evidenced explanation** | most likely a perceptual/terminology overlap between the step-identity number and the meter label (both "a number" to a non-technical viewer), given Phase 8.0B's real, correct, and disclosed change to which contacts show a meter value — possibly compounded by the pre-existing (Phase 6.4, not new) bundling of both under one "Step Numbers" toggle |

**No code defect was found that selectively hides the step-identity number
while leaving the contact marker visible.** This is a real, evidence-backed
negative result, not an inconclusive one.

## 15. Correct product contract

Verified against production semantics, not forced to match the task's own
suggested template:

- **CONTACT MARKER**: visible whenever `show.contacts` is on and the mark
  has been reached by playback — no scientific/zone/integrity gate. ✅
  matches the task's suggested contract.
- **STEP NUMBER**: visible whenever `show.step_numbers` is on and the mark
  has been reached — currently **bundled** with the meter label under the
  same toggle (Phase 6.4 design), but **not** gated by meter-label
  availability itself. Partially matches the suggested contract: the number
  is correctly independent of the scientific meter value, but is not
  currently independently *toggleable* from the meter label.
- **STEP-LENGTH METER LABEL**: visible only when
  `authoritativeStepLengthById` has a non-null entry for that contact's
  `contactId` — exactly the task's suggested contract, and exactly Phase
  8.0B's intended, proven-correct design.

## 16. Exact Phase 9.0B recommendation (not implemented)

No code defect requires fixing in the number/meter coupling — it does not
exist. The one concrete, evidence-backed, low-risk improvement worth
considering for Phase 9.0B, if the product wants to eliminate the exact
class of confusion this audit surfaced (whether or not it explains this
specific report): **split the single "Step Numbers" registry entry into
two independent controls** — e.g. `step_identity` (the index number,
always shown when a contact is reached, matching current number behavior
exactly) and `step_lengths` (the meter label, gated exactly as today by
`authoritativeStepLengthById`) — implementing the task's own suggested
three-way contract precisely. With both defaulting ON, this changes **zero**
current default-state rendering; it only makes it impossible to
accidentally hide the step identity while intending to hide only the meter
value, or vice versa.

- **Exact file(s)**: `src/lib/video/worldVisualization.ts` (registry:
  replace the single `step_numbers` entry with two), `src/components/video/VideoOverlay.tsx`
  (replace `show.step_numbers` with `show.step_identity` at the number
  `placeLabel` call; keep `show.step_lengths && meters != null` at the
  meter-label call).
- **Exact condition/data path responsible**: none is broken; this is a UX
  precision improvement, not a bug fix.
- **What must remain untouched**: `detectStepMarks`, `applyRealWorldStepDistances`,
  `computeSprintMeasurements`, `authoritativeStepLengthById`'s construction,
  `contactId` matching, `stepIntegrity.ts`, zone/calibration logic — none of
  these need to change.
- **Deterministic tests** (for 9.0B, not written here): both new controls
  default true; unchecking `step_identity` hides only the number, leaving
  the meter label logic unaffected when `step_lengths` stays checked (and
  vice versa); real-data replay (reusable from this phase,
  `scripts/phase-9-0a-render-logic-replay.mjs`) still shows 0/43 missing
  numbers and 11/43 correctly-absent meter labels under the new controls'
  default state; scientific outputs unchanged.
- **Browser acceptance criteria**: real authenticated session, all four
  benchmarks, confirm both new checkboxes present, independently
  toggleable, and that unchecking one leaves the other's visuals intact.

## 17. Files changed

None in `src/`. New, uncommitted, forensic-only files:

- `scripts/phase-9-0a-render-logic-replay.mjs` — real production
  reconstruction (Sections 4/6/8/13).
- `scripts/phase-9-0a-browser-fillText-audit.mjs` — real browser canvas
  instrumentation (Section 11/12).
- `scripts/phase-9-0a-sanity.mjs` — 9/9 deterministic forensic checks
  (Section 18).
- `tmp/phase90a/` — real fetched/generated evidence (gitignored):
  `render-logic-replay.json` (expected numbering + actual render manifest +
  contactId mapping + render-condition trace, combined), `fillText-audit.json`
  (browser instrumentation results), `{gav,vanni240,vanni120,vanni60}-8-0b-audit.json`
  (fresh reruns of the existing Phase 8.0B audit script against current
  live data).
- `docs/phase-9-0a-step-number-disappearance-audit.md` — this report.

## 18. Tests added

`scripts/phase-9-0a-sanity.mjs` — **9/9 PASS**:

1. Expected step-number reconstruction is deterministic across independent
   reruns.
2. `contactId` mapping is deterministic and well-formed for all 43 marks.
3. `authoritativeSteps` lookup is deterministic (null or finite, never
   undefined/NaN).
4. The missing-number condition is reproducible: **0/43** across all four
   benchmarks, directly disproving the coupling hypothesis with real data,
   not just static reading.
5. Draw-position calculation is deterministic (fixed literal offsets, no
   non-deterministic term).
6. RAW/Stabilized visibility audit: the step-marks render block has zero
   reference to stabilization state.
7. Auto Follow ON/OFF visibility audit: the step-marks render block has
   zero reference to Auto Follow state; `step_numbers`/`contacts` share an
   identical evidence requirement.
8. Instrumentation changes no production behavior (no writes to guarded
   files; mtime-verified untouched during this phase's own work window).
9. Scientific outputs unchanged (real production measurement pipeline
   rerun, `ALL PASSED`).

## 19. Real browser/benchmark runs

- Real, authenticated Playwright session (`scripts/phase-9-0a-browser-fillText-audit.mjs`):
  logged in as the permanent local dev account, opened all four benchmark
  sessions, confirmed "Contact Events"/"Step Numbers" checkbox state,
  installed a `CanvasRenderingContext2D.prototype.fillText` interceptor
  before app mount, probed each session. Zero console errors across the
  entire run.
- A second, ad-hoc real browser probe: Gav specifically, real `.play()` for
  4 real seconds at 0.25x, confirming `video.currentTime` genuinely
  advances (0.988s) and video pixels decode (`videoWidth: 1920`) — yet the
  overlay's own presentation clock still did not advance far enough to
  produce any pose-dependent canvas text (Section 12).
- Four real invocations of `scripts/phase-8-0b-overlay-label-audit.mjs`
  against current live data (fresh reruns, not cached), confirming Phase
  8.0B's own documented numbers are still exactly reproduced today.
- Four real invocations (via `phase-9-0a-render-logic-replay.mjs`) of the
  real, unmodified `detectStepMarks`, `applyRealWorldStepDistances`, and
  `computeSprintMeasurements` against real, current pose artifacts and
  calibration rows for all four benchmarks.
- Live DB queries (read-only) confirming all four benchmark identities are
  unchanged since Phase 8.0A/8.0B/7.3A/7.3B.

## 20. Scientific regression

**None.** `scripts/vanni-240-metric-evidence-sanity.mjs` (real production
contacts/step-frequency/step-length/velocity pipeline) reproduces itself
exactly: `ALL PASSED`. No file under `src/lib/video/steps.ts`,
`contacts.ts`, `stepIntegrity.ts`, `zoneStepAnalysis.ts`,
`src/lib/benchmark/measurements.ts`, or `src/lib/calibration/*` was
modified this phase (mtime-verified — every guarded file predates this
phase's earliest script). All required regression suites pass:
`phase-8-0a-step-length-forensic-sanity.mjs` (28/28), `phase-8-0b-overlay-label-sanity.mjs`
(32/32), `phase-7-3b-temporal-state-sanity.mjs` (11/11),
`phase-6-4-overlay-controls-sanity.mjs` (20/20), `phase-6-6b-part-b-presentation-sync-sanity.mjs`
(18/18), `phase-8-1b2b-stabilization-sanity.mjs` (19/19), `phase-8-2a-sanity.mjs`
(8/9 — the one non-pass is the same pre-explained, expected Phase-8.2B-caused
signal documented in that phase's own report, unrelated to this phase),
`phase-8-2b-sanity.mjs` (21/21), `npm run typecheck` (clean), `npm run lint`
(clean), `npm run build` (succeeded, 41/41 static pages; dev server safely
stopped before the build and cleanly restarted after, `curl` 200 confirmed).

## 21. Anything not personally validated

- Whether the user's own specific testing session had "Step Numbers"
  unchecked, or whether they were describing the meter label rather than
  the index number — this audit could not retroactively determine the
  user's exact session state or exact intent, and says so rather than
  guessing (Section 11/14).
- A real, pixel-level browser confirmation that the number and dot render
  at the expected relative screen position under Auto Follow/Stabilized
  View — blocked by this sandboxed environment's established video-decode
  limitation (Section 10/12), same constraint disclosed in every prior
  phase touching browser video this session (8.0B/8.1A/8.1B-2B/8.2A/8.2B).
  The structural/code-level proof (shared coordinate, shared transform
  stack) is the evidence relied on instead.
- The exact mechanism/frequency of `VideoOverlay.tsx`'s own presentation
  clock freeze (Section 12) in a real, non-sandboxed browser — flagged as a
  strong lead for Phase 9.1, not investigated further here (out of this
  phase's scope).

## 22. Git status

No commit, push, `db:reset`, or database mutation was performed. New,
untracked files only: `scripts/phase-9-0a-*.mjs` (3 files),
`docs/phase-9-0a-step-number-disappearance-audit.md`, and `tmp/phase90a/`
(gitignored). No file under `src/` was modified by this phase — verified by
`git status` (only pre-existing, unrelated modifications from prior,
already-closed phases remain) and by mtime (every file this phase's own
sanity suite guards predates this phase's earliest script).
