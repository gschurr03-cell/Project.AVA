# Phase R2C — Exact Presentation Width for Start/Finish Gate Bands

**Status: implementation complete. User acceptance: PENDING.**

## 1. Executive summary

Phase R2B proved the current green/red gate bands (`clamp(flySpan×0.12, 24,
140)px`) were 6–7× wider than the workspace's own 16px gate drag-handle and
recommended Option B: one fixed, explicit presentation-width constant tied to
the gate UI itself. This phase implements exactly that: a single named
constant, `GATE_BAND_PRESENTATION_WIDTH_PX = 16`, replacing the flySpan-based
heuristic. Verified live in a real browser session on all four benchmarks:
the bands are now tight, precisely centered on each gate line, and visually
read as "the gate" rather than "a chunk of the fly zone." Zero scientific
change — verified byte-identical across all measured quantities on all four
benchmarks.

## 2. Prior architecture inherited

R2's `stationaryThreeZoneRects()` bounded-band geometry (centering, direction
handling, full-height fill, the outer/inner-edge clamp for short fly spans)
— all unchanged. R2B's audit findings and Option B recommendation. R1C's
authoritative-contact rendering. Phase 6.2/6.3/6.6C's stabilized world gate
scene and theme palette — unchanged.

## 3. Prior findings independently verified

R2B's measured 16px workspace handle diameter — re-confirmed by direct
source read of `TimingWorkspace.tsx` (`className="h-4 w-4 rounded-full"`)
before use.

## 4. Findings corrected/disproved

None — this phase implements R2B's own recommendation as documented.

## 5. Exact presentation-width contract

```
GATE_BAND_PRESENTATION_WIDTH_PX = 16   (CSS pixels)
```

- **Basis**: the workspace gate editor's own drag-handle diameter (`h-4 w-4`
  = 16×16 CSS px) — the single closest existing "how big does this gate
  control look" evidence in the codebase (R2B Part M).
- **Not derived from**: fly span, zone length (m), or any benchmark-specific
  geometry — a single constant, identical for every session.
- **Coordinate space**: CSS pixels. `VideoOverlay.tsx` applies
  `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` once per frame before any draw
  call, so this constant is DPR-stable by construction — no extra scaling
  math needed or added.
- **Applies identically** to both start (green) and finish (red) bands.
- **Centering**: the band is centered on the gate's already-authoritative,
  already-stabilized midpoint (`startG.mid.x` / `finishG.mid.x`) — half-width
  8px each side.
- **Clamp**: if the fly span itself is narrower than the full band width,
  half-width shrinks to `flySpan/2` (never negative) so the bands meet
  edge-to-edge with zero fly width instead of inverting — same safety
  behavior R2 already had, just against a different (now-fixed) target
  width.

Full contract: `tmp/phaseR2C/presentation-width-contract.json`.

## 6. Code changed

- **`src/lib/video/stationaryGateGeometry.ts`** — replaced
  `GATE_BAND_FRACTION_OF_FLY_SPAN`/`GATE_BAND_MIN_WIDTH_PX`/
  `GATE_BAND_MAX_WIDTH_PX` and the flySpan-based `stationaryGateBandWidth()`
  with the new `GATE_BAND_PRESENTATION_WIDTH_PX` constant and a zero-argument
  `stationaryGateBandWidth()`. `stationaryThreeZoneRects()`'s call site
  updated to match (one-line change: `stationaryGateBandWidth() / 2` instead
  of `stationaryGateBandWidth(startMidX, finishMidX) / 2`). No other file
  needed changes — `VideoOverlay.tsx`'s call site is unchanged (same
  function name, same return shape).
- **`scripts/phase-r0-r2-sanity.mjs`** — updated one stale assertion (check
  #11) that pinned R2's old 48px band values; now asserts the new 16px
  values.

No scientific file touched (unchanged from R2/R2B: `stationaryGateGeometry.ts`
is imported exclusively by `VideoOverlay.tsx`, unreachable from
`measurements.ts`).

## 7. Tests added

`scripts/phase-r2c-gate-band-width-sanity.mjs` — **14/14 passing**: width
no longer depends on flySpan (1), start/finish share the same contract (2),
correct centering on each midpoint (3–4), exact blue-region fit with no
gap/overlap (5), no fill outside the bands (6), full-height (7), both travel
directions (8–9), DPR invariance verified against compiled (comment-free)
source (10), resize stability (11), Auto Follow/Stabilized View structural
independence (12–13), science unchanged against a real production rerun
(14).

## 8. Real browser/benchmark runs

`scripts/phase-r2c-ui-validation.mjs` — real, authenticated Playwright/
Chromium session (same route-interception H.264 technique established in
R1C/R2). Zero console errors across all captures.
`scripts/phase-r2c-scientific-regression.mjs` — real `computeSprintMeasurements`
rerun, all 4 benchmarks, diffed against the R2 baseline.

## 9. Vanni 240 result

Close-up crops of the actual rendered canvas
(`tmp/phaseR2C/screenshots/vanni240-start-band-crop.png`,
`-finish-band-crop.png`, generated from `vanni240-raw-autofollow-off.png`)
show a tight, precisely-centered green/red band hugging each gate line —
visibly a "gate marker," not a wide colored region. Compared to R2's prior
~98px (8.9% of frame width) band, the new band is 16px (1.5% of frame
width) — a 6× reduction, matching R2B's own quantified gap between the old
band and the workspace's true visual gate size. Confirmed stable under real
Auto Follow zoom (`vanni240-autofollow-on.png`, step markers "1"/"2 · 3.44m"
from R1C still correctly attached), Stabilized View toggle, forward/backward
scrub, and 1100px resize — zero console errors in every capture. Full
before/after: `tmp/phaseR2C/vanni240-before-after.json`.

## 10. Cross-benchmark result

Vanni 120, Vanni 60, and Gav
(`tmp/phaseR2C/screenshots/{vanni120,vanni60,gav}-zone-layout.png`) all show
the same tight 16px bands, correct step-marker meter labels, correct
skeleton, zero console errors. Same fixed constant, no benchmark-specific
value anywhere. Full detail: `tmp/phaseR2C/cross-benchmark-layout.json`.

## 11. Scientific before/after

All 4 benchmarks byte-identical to the R2 baseline
(`tmp/phaseR2C/scientific-before-after.json`, `allMatch: true`): contacts,
`zoneTimeS`/`zoneEntryTimeS`/`zoneExitTimeS`, `combinedStepFrequencyHz`,
`avgIndividualStepLengthM`, `peakStrideLengthM`, `zoneVelocityMps`,
`maxVelocityMps` all unchanged — expected by construction, since the only
file changed is unreachable from `measurements.ts`.

## 12. Anything not personally validated

- Real wind/outdoor conditions, the four-boundary scientific gate model —
  unrelated, separately tracked, not touched here (consistent with R2B).
- Other browsers/GPUs/color profiles beyond the installed Chromium.
- Fullscreen enter/exit specifically was not captured as a separate
  screenshot this phase (resize to 1100px was); the geometry function's
  purity (same inputs → same outputs, no fullscreen-specific state) makes
  this low-risk, but it was not visually captured.

## 13. Phase status: implementation COMPLETE

## 14. User acceptance status: **PENDING**

Manual acceptance steps:

1. Open the Vanni 240 session, confirm Gates and Zones layers are on.
2. Confirm the green band is now a **tight** strip right at the start gate
   line — not a wide swath.
3. Confirm the red band is the same tight width at the finish gate line.
4. Confirm the light-blue fly region fills everything between the two bands
   with no gap and no double-darkened overlap.
5. Confirm no color exists outside the two bands.
6. Toggle Auto Follow and Stabilized View: confirm the bands stay aligned
   and visually consistent in width.
7. Repeat on Vanni 120, Vanni 60, and Gav.

## 15. Current remediation-roadmap status

R1A/R1B/R1C/R2/R2B: CLOSED/complete (unchanged). R2C (this phase):
implementation complete, user acceptance PENDING.

## 16. Legacy roadmap completion

Unweighted presentation work — no roadmap percentage claimed or changed.

## Git status

No commit, push, `db:reset`, or database mutation. Worktree remains
intentionally dirty with all prior uncommitted phases' work preserved.

**STOP AFTER R2C.**
