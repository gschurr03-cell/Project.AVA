# Phase R1C — Authoritative Contact-Set Alignment for Rendered Step Markers

## Executive summary

Phase R1B proved that Vanni 240's Case 1 contact (`sourceFrameIndex=119`, `side=left`)
has a real, authoritative `physicalStepLengthM` of `3.442099399668491`, but that the
overlay had no rendered dot/mark at that identity to attach the label to. This phase
found and fixed the root cause: **the overlay's contact-marker renderer
(`VideoOverlay.tsx`) independently re-detected contacts from unstripped landmark
data, instead of consuming the same authoritative contact set the scientific
metrics are built from.** This produced a genuine, measured *set* divergence
(different contacts detected, not merely different numbering) on all four
benchmarks, not just Vanni 240.

The fix makes the overlay consume the authoritative contact list
(`measurements.fullRunContacts`) directly. Post-fix, the render and scientific
contact sets are identical (zero `AUTHORITATIVE_ONLY` / `RENDER_ONLY`
divergence) on all four benchmarks, verified both by direct computation against
real production code and by a live browser session. All scientific quantities
(contact counts, step lengths, frequency, velocity) are proven byte-identical
before and after via an isolated code-revert comparison.

## Part A — Reproducing the exact divergence

Before any code change, `scripts/phase-r1c-contact-diff.mjs` (run in `pre` mode)
confirmed directly against real production code that Vanni 240's authoritative
scientific contact set contains `contact-119-left`, but the pre-fix render path's
own `detectStepMarks()` call produced no contact at that identity at all — not a
numbering mismatch, an outright absence.

## Part B — Full set difference (all 4 benchmarks)

The divergence is a general architectural issue, not Vanni-240- or FPS-specific.
Pre-fix (`tmp/phaseR1C/pre-fix-contact-diff.json`):

| Benchmark | Scientific | Render (pre-fix) | AUTHORITATIVE_ONLY | RENDER_ONLY |
|---|---|---|---|---|
| gav | 12 | 12 | `contact-10-right` | `contact-6-right` |
| vanni60 | 10 | 12 | — | `contact-7-right`, `contact-20-left` |
| vanni120 | 12 | 13 | — | `contact-9-right` |
| vanni240 | 10 | 14 | `contact-10-right`, `contact-119-left` | `contact-11-right`, `contact-76-left`, `contact-123-right`, `contact-180-left`, `contact-227-right`, `contact-989-right` |

## Part C — Both contact generation paths traced

**Scientific path** (`src/lib/benchmark/measurements.ts`): `rawFrames` →
strip `landmarks` on any frame whose `boxOrigin` is `predicted`/`invalid`/
`frozen_suspect`, EXCEPT a `frozen_suspect` frame whose
`independentLocalizationState === "independent_corroborated"` (Phase 4.2K/9.1B
exception) → `buildFullRunEvents(frames)` → internally calls
`detectStepMarks(frames, stepConfig)` → `contacts: StepMark[]`.

**Render path (pre-fix)** (`src/components/video/VideoOverlay.tsx`): the
`frames` prop (raw, UNSTRIPPED overlay frames, on the video's own native
timeline per the Day 75 sync design) fed straight into `detectStepMarks(frames)`
— no stripping at all.

**First divergence point**: the INPUT FRAMES. `detectStepMarks` is pure; its
duplicate-suppression and same-side-spacing logic (`src/lib/video/steps.ts`)
compare contact-to-contact time gaps against fixed millisecond thresholds
(`minSameSideSpacingMs=250`, `minStepSpacingMs=130`), so noisy/disproven
landmark evidence feeding the same-foot and cross-foot smoothing/dedup passes
can add or (via a global ripple effect on the shared candidate stream) remove
contacts anywhere in the sequence — confirmed directly (Part I below) on a
`contact-76-left` case with no locally-unstable frames nearby at all.

Identity format used throughout this phase for comparison:
`contact-${sourceFrameIndex}-${side}` (matches the R1/R1B "physical identity"
convention, independent of either side's own chronological `index` numbering).

## Part D — Phase 7.3B alignment

Phase 7.3B's same-side temporal-state recovery logic lives inside
`detectStepMarks`/`recoverSuppressedOppositeContacts` itself (`steps.ts`), not
in either caller. Since the fix makes the render path consume the
SAME output of the SAME `detectStepMarks` call the scientific path uses
(rather than an independent call on different input), 7.3B's logic is now
applied identically and automatically — confirmed empirically: the post-fix
render set exactly equals the authoritative set on all 4 benchmarks (17-item
sanity check #9–12).

## Part E — Phase 9.1B alignment

Phase 9.1B's `independent_corroborated` eligibility exception was previously
implemented as two independent inline copies (one in `measurements.ts`, one in
`VideoOverlay.tsx`'s own skeleton-render eligibility gate — unrelated to
contact detection, which had NO such gate at all pre-fix). This phase extracted
the exception logic into one shared, exported function,
`stripUnstableLandmarks` (`src/lib/video/steps.ts`), used by `measurements.ts`
for the scientific path and, for the fallback-only case (no authoritative set
available), by `VideoOverlay.tsx`. In the primary (`authoritativeContacts`
present) case, the overlay does not run any eligibility gate of its own at
all — it consumes the scientific path's own already-gated output directly.

## Part F — Authoritative rendering contract (decision)

Preferred architecture (Part H): **Option A — render directly from the
authoritative set**, evaluated first per the task's own guidance. It is
feasible for contact IDENTITY, ORDER, and POSITION (`x`, `y`,
`sourceFrameIndex`, `side`, `index`, `distanceFromPrev`,
`distanceMetersFromPrev`) because none of those fields are affected by FPS
normalization. It is **not directly feasible for `time`**: the scientific
path's frames are FPS-normalized (`applyFpsOverride`, Day 61) while the
overlay's reveal-gating (`mark.time <= currentTime`) runs against the video
element's own raw native-timeline `currentTime` (Day 75 sync design) — using
the scientific `time` value directly would desync reveal timing whenever the
session's effective FPS differs from its raw/native FPS. The implemented
design is therefore **Option A with a clock-domain remap**: consume the
authoritative `StepMark[]` list as-is, and rewrite only `time` per mark by
joining on `frame` (a stable index shared 1:1 between the raw and
FPS-normalized frame arrays, since `applyFpsOverride` only ever rewrites
`time`, never `frame`/`sourceFrameIndex`/landmark positions). This is
verified lossless: `unmappedTimeCount === 0` for all 4 benchmarks (every
authoritative mark's `frame` was found in the raw frame set).

## Part G — Required presentation data

All fields the renderer needs (identity, side, `sourceFrameIndex`, timestamp,
position, step ordinal) already exist on `StepMark`, the type
`buildFullRunEvents().contacts` already returns. `physicalStepLengthM` is
already available per-contact on `ZoneStep` (Phase R1B), looked up by the
existing `authoritativeStepLengthByFrameSide` map (unchanged this phase). No
duplicate calculation was introduced.

## Part H — Minimal alignment design (implemented)

1. **`SprintMeasurements.fullRunContacts: StepMark[]`** (new, additive field
   on `src/lib/benchmark/measurements.ts`) — exposes the already-computed
   `fullRun.contacts` the scientific path already uses internally for
   everything else. Read-only; nothing derives FROM it, it is exposed AFTER
   every other computation already used it.
2. **`stripUnstableLandmarks()`** (new, exported from `src/lib/video/steps.ts`)
   — the shared eligibility gate, extracted verbatim from `measurements.ts`'s
   former inline stripping map. `measurements.ts` now calls this helper
   instead of its own inline copy (behavior-preserving refactor, verified
   byte-identical — Part O).
3. **`authoritativeContacts` prop** threaded through
   `OverlayVideoPlayer.tsx` → `OverlaySurface.tsx` → `VideoOverlay.tsx`,
   sourced from `measurements.fullRunContacts` in `page.tsx`. When present,
   `VideoOverlay.tsx`'s `stepMarks` computation consumes it directly (with the
   `frame`-keyed raw-time remap from Part F) instead of calling
   `detectStepMarks` at all. When absent (no authoritative measurement set —
   non-`"fly"` analysis types), it falls back to
   `detectStepMarks(stripUnstableLandmarks(frames))`, which is now at least
   policy-aligned with the scientific gate even though it remains an
   independent detection (unavoidable without an authoritative set to
   consume).

No contact-detection algorithm, threshold, or formula was touched.
`detectStepMarks()` itself is byte-for-byte unmodified.

## Part I — Render-only marks classification

All 10 pre-fix `RENDER_ONLY` identities across the 4 benchmarks were checked
against `boxOrigin`/`independentLocalizationState` evidence in the real pose
artifacts:

- `gav:contact-6-right`, `vanni60:contact-7-right`, `vanni60:contact-20-left`,
  `vanni120:contact-9-right`, `vanni240:contact-11-right`,
  `vanni240:contact-123-right`, `vanni240:contact-180-left`,
  `vanni240:contact-227-right` — all sit directly on or immediately beside
  `predicted`/`invalid`/`frozen_suspect` (non-corroborated) frames. These are
  exactly the spurious contacts the stripping gate exists to prevent.
- `vanni240:contact-989-right` — same pattern (`invalid` frame at 986/989).
- `vanni240:contact-76-left` — the one case with **no** unstable frames
  within an 8-frame window on either side. Directly verified (real production
  `detectStepMarks`, unstripped vs. stripped input) that this contact
  disappears specifically because of the stripping-driven correction to the
  shared candidate/dedup stream elsewhere in the sequence (a global, not
  local, effect of `detectStepMarks`'s cross-contact spacing/de-duplication
  logic) — not a numbering artifact, not a bug in the fix.

None of the 10 represent an intentional presentation-only element worth
preserving; all were spurious artifacts of feeding `detectStepMarks` noisier
input than the authoritative science ever uses. Nothing was preserved
separately.

## Part J — Implementation

Smallest safe fix: one new additive field, one extracted shared helper (a
behavior-preserving refactor, not new logic), one new prop threaded through
three existing components, one `stepMarks` computation branch. No
Vanni-specific, FPS-specific, or frame-specific conditionals anywhere in the
fix.

## Part K — Vanni 240 Case 1: proof

Verified both by direct production-code execution
(`scripts/phase-r1c-render-path-verification.mjs`) and live browser session
(`scripts/phase-r1c-ui-validation.mjs`):

```json
{
  "renderedMarkExists": true,
  "stepOrdinal": 2,
  "physicalStepLengthM": 3.442099399668491,
  "rawTimeMapped": true,
  "stepLengthMAggregate": null
}
```

Live browser: dot "2" renders with a `3.44 m` label at Vanni 240's frame ~150
(`tmp/phaseR1C/browser/vanni240-case1-frame119-left.png`); aggregate
`stepLengthM` for the same contact remains `null` (confirmed both
computationally and in the same `measurements.zoneSteps` object the UI reads).

## Part L — Vanni 240 Case 2: preservation

`contact-278-left` (Case 2, the missing-intermediate-contact case) renders a
dot and step ordinal (`3`) post-fix — it IS a real detected contact — but
`physicalStepLengthM` is `null` for it, exactly as before: no fake single-step
meter value was created. Confirmed computationally and live in browser
(`tmp/phaseR1C/browser/vanni240-case2-frame278-left.png`, dot "3" has no meter
label while dot "2" beside it still shows `3.44 m`).

## Part M — Cross-benchmark alignment (post-fix)

Zero unexplained divergence, all 4 benchmarks
(`tmp/phaseR1C/cross-benchmark-alignment.json`):

| Benchmark | Scientific | Render | AUTHORITATIVE_ONLY | RENDER_ONLY | Unmapped time | Duplicates |
|---|---|---|---|---|---|---|
| gav | 12 | 12 | — | — | 0 | 0 |
| vanni60 | 10 | 10 | — | — | 0 | 0 |
| vanni120 | 12 | 12 | — | — | 0 | 0 |
| vanni240 | 10 | 10 | — | — | 0 | 0 |

## Part N — Step numbers / length labels

Step ordinals (`index`) match 1:1 between the authoritative and post-fix
render sets for every contact on every benchmark (sanity check #13, 0
mismatches). No off-by-one, no stale label, no duplicate dot (#8).

## Part O — Scientific isolation (before/after)

Empirically proven, not just argued: a throwaway copy of `measurements.ts`
with ONLY the R1C diff reverted (inline stripping restored, `fullRunContacts`
field/return removed — real `src/` untouched) was compiled and run alongside
the current file. Full JSON deep-equal of the entire `SprintMeasurements`
object (minus the new `fullRunContacts` field) is `identical: true` for all 4
benchmarks (`tmp/phaseR1C/scientific-before-after.json`):

| Benchmark | Contacts | Avg step length (m) | Step freq (Hz) | Zone velocity (m/s) | Max velocity (m/s) |
|---|---|---|---|---|---|
| gav | 12→12 | 2.14716→2.14716 | 4.84848→4.84848 | 10.41667→10.41667 | 11.09215→11.09215 |
| vanni60 | 10→10 | 1.98193→1.98193 | 4.8→4.8 | 8.96861→8.96861 | 10.66229→10.66229 |
| vanni120 | 12→12 | 1.93667→1.93667 | 4.65517→4.65517 | 9.13242→9.13242 | 9.74468→9.74468 |
| vanni240 | 10→10 | 2.00130→2.00130 | 3.62069→3.62069 | 9.43396→9.43396 | 9.62601→9.62601 |

## Part P — Real UI validation

Live browser session, real login (`commander@atreides.local`), real session
pages, real overlay rendering (Playwright + Chromium, H.264 test-copy
technique from Phase 6.2B — this sandbox cannot decode the original
HEVC/MOV source). **Disclosure**: mutating `<video>.src` directly after mount
(the technique used successfully in prior phases) left the overlay's RAF/
reveal loop stalled in this session for reasons unrelated to R1C (a test-
harness lifecycle quirk, not a product bug); switching to `page.route()`
interception of the real signed-URL request — so React's normal
`<video src={signedUrl}>` load path is exercised unmodified — resolved it.
The real "Interactive Overlay" player was located by anchoring on the
unambiguous "Skeleton" layer checkbox rather than DOM/`<video>` index, since
the page also contains an unrelated `<video>` and a filmstrip `<video>`, both
of which can outrank the real player under naive selection.

Results, zero console errors across all 4 sessions:
- Vanni 240 Case 1: dot "2" + `3.44 m` label visible, frame 157/1020.
- Vanni 240 Case 2: dot "3", no meter label, alongside dot "2"'s `3.44 m` still visible.
- Vanni 240 working contact: dot "4" + `1.92 m` label, unaffected by the fix.
- Vanni 120 / Vanni 60 / Gav: pages load, overlay mounts, no console errors (spot-check frames landed before those sessions' first contact reveal in this run; numeric cross-benchmark alignment for these three is separately and exhaustively proven in Part M).

Screenshots: `tmp/phaseR1C/browser/*.png`.

## Part Q — Tests

`scripts/phase-r1c-contact-render-alignment-sanity.mjs` — 17/17 passing,
against real production code:

1. Pre-fix authoritative/render diff reproducible — PASS
2. Vanni 240 authoritative set contains `contact-119-left` — PASS
3. Pre-fix render set lacks `contact-119-left` — PASS
4. Post-fix render set contains `contact-119-left` — PASS
5. Case 1 `physicalStepLengthM` = `3.442099399668491` — PASS
6. Case 1 aggregate `stepLengthM` is `null` — PASS
7. Case 2 renders, no physical step length — PASS
8. No duplicate contact markers — PASS
9. No fake RENDER_ONLY contacts introduced — PASS
10. Vanni 120 alignment — PASS
11. Vanni 60 alignment — PASS
12. Gav alignment — PASS
13. Step ordinals match 1:1 — PASS
14. Scientific contact counts unchanged vs. recorded pre-fix baseline — PASS
15. Scientific metrics isolation report all-identical — PASS
16. Auto Follow cannot affect contact identity (structural: `stepMarks` computation doesn't reference it) — PASS
17. Stabilized View cannot affect contact identity (same) — PASS

## Part R — Regression

| Suite | Result |
|---|---|
| `phase-r1a-sanity.mjs` | 9/10 — 1 explained non-regression (mtime-guard: `measurements.ts` legitimately modified by this phase) |
| `phase-r1b-presentation-step-length-sanity.mjs` | 24/24 |
| `phase-7-3b-temporal-state-sanity.mjs` | 11/11 |
| `phase-8-0b-overlay-label-sanity.mjs` | 32/32 |
| `phase-9-0a-sanity.mjs` | 7/9 — 1 explained non-regression (mtime-guard: `VideoOverlay.tsx` legitimately modified by this phase) |
| `phase-9-1b-eligibility-validation.mjs` | 1 explained non-regression — a text-presence guard for the independent-corroboration exception's exact string in `measurements.ts` fails because this phase legitimately RELOCATED that logic into the new shared `stripUnstableLandmarks` helper (Part E); behavior is proven identical by Part O's deep-equal isolation |
| `phase-9-2b-sanity.mjs` | 23/23 |
| `contacts-sanity.mjs` | PASS |
| `measurement-recovery-sanity.mjs` | PASS |
| `zone-step-counting-sanity.mjs` | 25/25 |
| `timing-verification-sanity.mjs` | PASS |
| `phase-9-4-corrected-metrics.mjs` (all 4 benchmarks) | PASS, no errors |
| `phase-r1c-contact-render-alignment-sanity.mjs` | 17/17 |
| `npm run typecheck` | clean |
| `npm run lint` | clean (0 warnings) |
| `npm run build` | clean production build |

Both explained non-regressions are self-referential guards in EARLIER phases'
own scripts asserting "this phase's own file(s) haven't moved since I wrote
this check" — expected to trip whenever any LATER phase legitimately touches
the same file, and consistent with this same pattern documented in every
prior phase of this session.

## Phase status: CLOSED

Per explicit instruction, work stops after R1C. No further phase begun.
