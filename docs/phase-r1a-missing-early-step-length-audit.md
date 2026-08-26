# Phase R1A — Missing 0–10m Individual Step-Length Values Forensic Audit

Evidence-only. **No production code was changed.** `src/lib/benchmark/measurements.ts`
was copied into a throwaway compiled directory and additively patched (two new
diagnostic fields added to the returned object, exposing already-computed
internal values) — the real source file was never touched (mtime-verified,
Part P test 9).

## 1. Executive summary

The missing early meter values are **real, correct, evidence-based
exclusions by the existing step-integrity check (`evaluateStepInterval`,
Day 103) — not a zone-eligibility bug, not a contactId/lookup bug, and not
the same bug R1 already fixed.** Zone membership is not the cause: every
excluded contact's world position already falls **inside** the calibrated
zone (`inZoneByWorldX: true` for 100% of rows, all four benchmarks). The
real cause is that the FIRST one or two in-zone contacts' step interval
spans back to a **pre-zone** (or, in one case, a genuinely **missing**)
previous contact, producing a duration and/or distance that looks
implausible when compared only against the athlete's later, steady-state,
in-zone neighbor step distances.

The pattern is **not universal**: Gav and Vanni 120 show **zero** missing
individual-step labels. Vanni 60 shows exactly **one** — the very first
detected contact in the whole clip, which structurally cannot have a
step-length value at all (no prior contact exists). **Vanni 240 is the only
benchmark with genuinely early-and-in-zone missing values (2 of 8)**, and the
two have two **different** real causes:

- **Step 1** (`contact-119-left-2`, 2.10m into the zone): its interval to the
  previous (pre-zone) contact is 3.44m over 454ms — both exceed the
  integrity ceiling computed from the athlete's own in-zone neighbor steps
  (median 1.956m → ceiling 3.13m; max plausible duration 0.32s). No
  evidence of a missing contact (foot alternation is normal, right→left) —
  this is very plausibly a **real, valid, longer early-stride distance**
  (a normal part of acceleration into top speed) that the current
  neighbor-based ceiling — calibrated only against cruise-phase strides —
  is not designed to accept. **Case C/D.**
- **Step 2** (`contact-278-left-3`, 7.73m into the zone): its "previous"
  contact is **also a left-foot contact** — `foot_sequence_discontinuity` —
  proving a real right-foot contact was never detected in between (662ms
  gap, exceeding the "two full steps" missing-contact threshold). **This is
  a genuine data gap: no valid single-step physical distance exists to
  show. Case B.**

**Root cause classification: `MULTI_FACTOR`** (a zone-entry-vs-cruise-phase
ceiling mismatch for step 1, a genuine missing intermediate contact for
step 2), confined almost entirely to Vanni 240.

## 2. Exact Vanni 240 benchmark identity

`tmp/phaseR1A/benchmark-identities.json`: session `31fe352b-f00f-4a80-b20a-17c2ab08ec5a`,
current working analysis `a7679326-e193-4489-bf50-735fe402ec60` (same fresh
analysis from the immediately prior Phase 9.4/R0-R2 work), source FPS
239.981, 1020 frames, calibrated 20m legacy two-point zone (`ax=0.1368,
bx=0.8819`). `totalContacts=10`, `validContacts=8` (in-zone by world-x),
`zoneStepSummary` null (stationary camera — no canonical per-interval path;
the legacy two-point interval path, the one this audit traces, is the one
actually in effect).

## 3. 0–10 / 10–20 spatial step map

`tmp/phaseR1A/step-position-map.json`, real distances from the calibrated
zone start (not "from the video start" — proven distinct, Section 9):

| Step | Contact ID | Dist. from zone start | 0–10m | 10–20m | In zone (world-x) | Meter value renders |
|---|---|---:|---|---|---|---|
| 1 | contact-119-left-2 | 2.10m | yes | no | yes | **no** |
| 2 | contact-278-left-3 | 7.73m | yes | no | yes | **no** |
| 3 | contact-330-right-4 | 9.66m | yes | no | yes | yes |
| 4 | contact-375-left-5 | 11.52m | no | yes | yes | yes |
| 5 | contact-443-right-6 | 13.70m | no | yes | yes | yes |
| 6 | contact-475-left-7 | 15.51m | no | yes | yes | yes |
| 7 | contact-543-right-8 | 17.74m | no | yes | yes | yes |
| 8 | contact-583-left-9 | 19.73m | no | yes | yes | yes |

Note step 3 (9.66m) is still technically inside "0–10m" and **does** render
— the true boundary is the integrity check, not a literal 10m cutoff (the
user's own "approximately" framing was correct to hedge this).

## 4. Authoritative individual-step contract

Traced directly in `measurements.ts` (legacy two-point path, the one active
here since `zoneStepSummary` is null): for `zoneSteps[i]` (built from
`gapMarks.map`), the reported `stepLengthM` represents the interval from the
**physically preceding contact in the full-run contact sequence** (`marks[globalIdx-1]`,
found via `marks.indexOf(m)` against the *global*, unfiltered contact list —
not the previous entry within the zone-filtered `gapMarks` array) **to the
current contact** — i.e. always a "previous contact → current contact"
interval, landing-foot-labeled by the current (later) contact's side. For
the very first physical contact in a run, no previous contact exists at all,
so no interval can ever be computed (Section 7). This holds even for the
first *in-zone* step: its "previous" contact is allowed to be a *pre-zone*
contact — zone membership of the endpoints is not itself a gate on whether
an interval is attempted, only on whether the result is later trusted
(Section 8/9).

## 5. Every early missing value

`tmp/phaseR1A/early-step-trace.json`. Full detail already in Section 1/3;
summarized:

| Contact | Physical distance (m) | Duration (s) | Reject reasons |
|---|---:|---:|---|
| contact-119-left-2 | 3.4421 | 0.4542 | `implausible_step_duration`, `implausible_step_distance` |
| contact-278-left-3 | 5.6332 | 0.6625 | `foot_sequence_discontinuity`, `missing_intermediate_contact`, `contact_sequence_gap`, `implausible_step_distance` |

## 6. Working late-value comparison

`tmp/phaseR1A/late-step-trace.json`. Field-by-field, the 5 working 10–20m
steps differ from the 2 failing ones in exactly the properties the
integrity check inspects: duration 133–283ms (vs. 454/662ms), physical
distance 1.82–2.23m (vs. 3.44/5.63m), and — critically — **every working
step's previous contact is itself an in-zone, opposite-foot contact**
(`previousContactInZoneByWorldX: true`, alternating side), while both
failing steps' previous contacts are either pre-zone or same-foot. The
lookup mechanism itself (contactId construction, `sourceFrameIndex-side`
matching — the exact thing R1 fixed) is **identical** and working correctly
for both groups; only the upstream integrity **verdict** differs.

## 7. Previous-contact audit

| Step | Previous contact exists | Previous in-zone | Previous side | Same-foot? |
|---|---|---|---|---|
| 1 (119) | yes (frame 10) | **no** (pre-zone) | right | no |
| 2 (278) | yes (frame 119) | yes | **left (same as current)** | **yes** |
| 3 (330) | yes (frame 278) | yes | left | no |

Step 1's previous contact genuinely exists but is outside the zone — a real
physical contact, just not one the coach's calibrated zone covers. Step 2's
previous contact is the *wrong* physical event to pair with (same foot) —
proving a real intermediate right-foot contact is missing from the
detected-contact evidence entirely, not merely excluded by zone logic.

## 8. Zone-membership logic

**Zone membership is not the exclusion mechanism here.** `validMarks`
(`measurements.ts:888-890`) already includes every one of these 8 contacts —
100% of `stepPositionMap` rows report `inZoneByWorldX: true` (Part P test 7).
`gapMarks = zone ? validMarks : marks` (`:1041`) — since a zone is
calibrated, `gapMarks` is exactly `validMarks`, and both missing contacts
are members of it (they have real `ZoneStep` entries with real `index`/`contactId`
values, index 1 and 2 of 8) — they simply carry `stepLengthM: null`. Zone
eligibility and step-length availability are **two separate gates in the
current code**, confirming Part I's own suspicion directly.

## 9. Zone-metric vs. visual-step distinction

Confirmed exactly as Part I hypothesized: an authoritative **physical**
distance can and does exist (`distanceMetersFromPrevPhysical`, always
computed, zone-agnostic — Section 10) even when the **step-length interval**
is rejected by the integrity check. `avgIndividualStepLengthM`/`avgStepLengthM`
(the zone aggregate metrics) are computed **only** from the intervals that
pass `evaluateStepInterval` — the same gate that hides the label. There is
currently **no separate, looser eligibility path for "show a real physical
distance visually" vs. "count this distance into the zone average."** This
is the crux of the R1B design question (Section 15).

## 10. World-distance availability

`tmp/phaseR1A/world-distance-check.json`. `distanceMetersFromPrev` on each
`WorldMark` (`measurements.ts:625-633`) is **always** computed for every
contact with a predecessor, using the same camera-compensated world
coordinates and the same authoritative `usableScale.metersPerPixel` every
passing step's displayed value uses — **no new geometry, no new formula**
was invented for this audit; the values reported here (3.4421m, 5.6332m) are
the literal, already-existing internal values `measurements.ts` computes
today, exposed via the additive diagnostic patch (Section 0/17) and nothing
else.

## 11. Overlay lookup

Not the cause. The R1 fix (`sourceFrameIndex-side` matching) is
content-agnostic — it correctly finds *no* entry for `contact-119-left-2`/
`contact-278-left-3` because `authoritativeStepLengthM` is genuinely `null`
in the authoritative array (Section 8), not because the lookup itself fails
to find an existing entry. Verified directly: `zoneSteps[0].contactId ===
"contact-119-left-2"` **does** exist in `authoritativeSteps` (index 1 of 8,
real entry, real `contactId`) — the render loop's lookup would succeed in
finding the entry; the entry's own `stepLengthM` field is what's null.

## 12. Clipping/draw-order audit

Not reached — with `meters == null`, `VideoOverlay.tsx`'s own `if
(show.step_numbers && meters != null)` branch (unchanged since R1) never
attempts to draw a meter label for these two contacts, by design (Part
R1-B's own "never fabricate" contract, already correctly implemented). No
clipping/draw-order investigation was needed since there is no draw call to
audit for these specific contacts.

## 13. Cross-FPS comparison

`tmp/phaseR1A/cross-fps-summary.json`:

| Benchmark | Missing count | Missing contacts | Cause |
|---|---:|---|---|
| Gav | 0 | — | — |
| Vanni 60 | 1 | `contact-37-right-1` | first contact overall, no predecessor exists (structural, correct, unavoidable) |
| Vanni 120 | 0 | — | — |
| Vanni 240 | 2 | `contact-119-left-2`, `contact-278-left-3` | zone-entry ceiling mismatch + genuine missing intermediate contact |

**Not universal, not a general contactId/lookup regression, not "all
clips."** Confined to Vanni 240 specifically (2 real early cases) plus one
structurally-unavoidable single-contact case in Vanni 60 that is not what
the user is describing (Vanni 60's excluded contact is the very first
detected contact in the entire clip, before any "0–10m in-zone" framing
applies).

## 14. Exact root cause

`MULTI_FACTOR`:

1. **Zone-entry integrity-ceiling mismatch** (step 1): a real, valid
   physical interval is rejected because the plausibility ceiling is
   computed only from cruise-phase (steady, top-speed) neighbor distances,
   which are systematically shorter/faster than a real early-acceleration
   stride. This is a genuine "the science IS conservative here" situation —
   not a bug in the sense of wrong code, but a real design gap (Case C
   leaning D) between zone-aggregate integrity and individual-step display.
2. **Genuine missing intermediate contact** (step 2): the underlying pose/
   contact-detection evidence itself has a real gap (a right-foot strike
   was never detected). No valid single-step distance exists here at all —
   correctly, necessarily excluded (Case B).

Neither is a lookup, contactId, zone-membership, or presentation-wiring
defect — both are decisions made by the (correct, working-as-designed)
step-integrity evaluation, one of which (case 1) may deserve a narrower,
presentation-only carve-out in a future phase.

## 15. Exact R1B recommendation

**`ZONE_ELIGIBILITY_DECOUPLING`**, narrowly scoped: introduce a separate,
**presentation-only** "does a real physical distance exist for this
interval" signal, independent from "is this interval trusted enough to feed
the zone-aggregate average/peak." Case-1-style intervals (normal foot
alternation, a real predecessor contact, just a longer/slower zone-entry
stride) could be shown as a real physical distance on the overlay while
still being excluded from `avgIndividualStepLengthM`/`avgStepLengthM`/
`peakStepLengthM` and `combinedStepFrequencyHz` exactly as today. Case-2-style
intervals (`foot_sequence_discontinuity`, `missing_intermediate_contact`)
must remain excluded from **both** — there is no real single-step distance
to show. R1B must NOT invent a distance for a missing contact, and must not
silently fold a newly-shown "real physical, zone-untrusted" distance into
any zone aggregate.

## 16. Scientific safety requirements

For R1B (not implemented in this phase):

- `avgIndividualStepLengthM`, `avgZoneStepLengthM`, `peakStrideLengthM`,
  `combinedStepFrequencyHz`, and every other zone aggregate must be computed
  from **exactly** the same currently-passing interval set — zero new
  intervals may be added to any average/peak/frequency calculation.
- Contacts, step identities, timing, and calibration are untouched by this
  phase and must remain untouched by R1B.
- Any newly-displayed "real physical, zone-untrusted" distance must be
  visually or semantically distinguishable from an authoritative zone-trusted
  step length if R1B chooses to display it at all (a product/UX decision,
  not resolved here).
- `evaluateStepInterval`'s `missing_intermediate_contact`/
  `foot_sequence_discontinuity` rejections must never be downgraded or
  bypassed — those protect against exactly the Day 103 defect
  (`stepIntegrity.ts`'s own documented incident) they were built for.

## 17. Files changed

**None in `src/`.** New only:

- `scripts/phase-r1a-early-step-forensic.mjs` (compiles an additively-patched
  throwaway copy of `measurements.ts`; the real file is never edited)
- `scripts/phase-r1a-sanity.mjs` (Part P, 10/10 tests)
- `docs/phase-r1a-missing-early-step-length-audit.md` (this file)
- `tmp/phaseR1A/` (all deliverables, gitignored)

## 18. Tests

`scripts/phase-r1a-sanity.mjs` — **10/10 passing**: Vanni 240 step-position
reconstruction, 0–10/10–20 classification, authoritative-lookup determinism
(real production rerun), working late-label reproduction, missing
early-label reproduction, previous-contact availability, zone-eligibility
classification (proves membership isn't the exclusion mechanism),
world-distance recomputation (proves the physical distance already exists),
instrumentation-does-not-alter-production (mtime + literal-absence check on
the real `measurements.ts`), and scientific metrics unchanged (real
`vanni-240-metric-evidence-sanity.mjs` rerun, ALL PASSED).

## 19. Scientific regression

`npm run typecheck`: clean. `npm run lint`: clean (0 warnings). `npm run
build`: production build succeeded (dev server safely stopped/restarted).
`phase-8-0a-step-length-forensic-sanity.mjs`, `phase-8-0b-overlay-label-sanity.mjs`,
`phase-7-3b-temporal-state-sanity.mjs`, `zone-step-counting-sanity.mjs`,
`measurement-recovery-sanity.mjs`, `timing-verification-sanity.mjs`: all
pass clean. `phase-9-0a-sanity.mjs`: 7/9 — the 2 failures are the same,
already-well-understood, pre-existing mtime-staleness guard from the prior
R0-R2 phase's own (unrelated) `VideoOverlay.tsx` edit, not caused by this
phase (this phase touched zero files in `src/`).

## 20. Anything not personally validated

The hypothesis that step 1's rejected interval represents a genuine,
physically real longer early-acceleration stride (rather than some other
unmodeled artifact) is a well-evidenced **inference** from the real,
measured numbers (normal foot alternation, a real predecessor contact, a
duration/distance consistent with a slower initial stride) — it was not
independently confirmed against external ground truth (no independent
timing-gate/video-frame-count cross-check of this specific stride was
performed in this phase, consistent with this project's existing,
documented ground-truth limitations for the Vanni benchmarks). Vanni 120's
own zero-missing result was not further stress-tested against edge cases
beyond its own real data.

## 21. Git status

No commit, push, `db:reset`, or database mutation was performed. Zero
`src/` files changed (mtime-verified, Section 9/Part P test 9). New:
2 scripts under `scripts/phase-r1a-*`, this report, `tmp/phaseR1A/`
(gitignored). Dev server was safely stopped before the production build and
cleanly restarted after (`curl` 200 confirmed).
