# Phase 8.0B — Authoritative Overlay Step-Length Labels

## 1. Executive summary

Phase 8.0A proved the authoritative Average/Peak Step Length pipeline
(`measurements.ts`'s legacy two-point-calibration path) is mathematically
correct and disclosed, as a separate finding, that `VideoOverlay.tsx` computes
its own step-length numbers through an independent code path.

This phase traced that independent path to its exact root cause, proved it
with real data from all four current benchmarks, and fixed it: the overlay no
longer computes a step-length value at all. `measurements.ts`'s
`computeSprintMeasurements` now exposes each `ZoneStep`'s stable contact
identity (`contactId`, additive field), `page.tsx` passes that authoritative
array down to the video player as a new `authoritativeSteps` prop, and
`VideoOverlay.tsx`'s on-screen label reads `stepLengthM` from it by
`contactId` lookup — the same array the "Average Step Length" / "Peak Step
Length" cards already read. The label renderer still owns *where* text is
drawn and *how* it's formatted; it no longer owns *what number* it shows.

Real-data comparison across all 43 detected step marks in the four current
benchmarks (Gav, Vanni 240/120/60) found the pre-fix overlay path was close to
authoritative on most matched contacts (small formula-driven drift, typically
<1%) but had **4 false-positive labels** (a plausible-looking metre value
shown for a contact the authoritative path rejects as unsupported) and **3
false-negative labels** (a real, valid authoritative step length silently
suppressed) — a real, provable, now-fixed defect. No scientific value
(contacts, calibration, world transforms, Average/Peak Step Length) changed.

## 2. Phase 8.0A inherited evidence

- The authoritative "Average Step Length" field-resolution chain
  (`metricEvidence.ts:347`): `m.zoneStepSummary?.summaries.averageStepLengthM
  ?? m.avgIndividualStepLengthM ?? m.avgZoneStepLengthM`. For all four current
  benchmarks `zoneStepSummary` is null (stationary cameras, `cameraPansMeaningfully`
  gate off), so the real value is `avgIndividualStepLengthM`.
- 31 real, currently-valid steps across the four benchmarks, individually
  reconstructed and proven byte-identical to production (`tmp/phase80a/step-audit-manifest.json`,
  `scripts/phase-8-0a-step-length-forensic-sanity.mjs`, 28/28 PASS).
- The disclosed Section 9 finding: `VideoOverlay.tsx` builds its own step
  marks via `detectStepMarks(frames)` + `applyRealWorldStepDistances(...)`,
  not zone-restricted, not passed through `stepIntegrity.ts`. On the real
  Vanni 240 artifact this raw, DEBUG-ONLY path produced `[..., 7.262, ...,
  4.221, ...]` for two same-foot-bridging intervals `stepIntegrity.ts`
  correctly excludes from the authoritative metric.
- Explicitly out of scope for 8.0A (carried into this phase): fixing that
  display path.

## 3. Existing overlay data path (pre-fix)

`VideoOverlay.tsx` drew the on-screen step-length label from **its own third
computation**, not `distanceMetersFromPrev` (the raw path disclosed in 8.0A,
which turned out to be dead code for the visible "m" label — see §4) and not
the authoritative `individualStepLengthsM`:

```
detectStepMarks(frames)
  → applyRealWorldStepDistances(marks, stepScale)        // raw "distanceMetersFromPrev" (unused for the "m" label — debug "rel" only)
  → sourcePointToCanonicalWorld(mark, ..., cameraEvidence, W, H)   // per-contact canonical world point, homography-based
  → canonicalMidpoint(gates.startBoundary/finishBoundary) → sourceLineToCanonicalWorld(...)
  → analyzeZoneSteps({ start, finish, distanceM, contacts })       // zoneStepAnalysis.ts, its own zone-membership + interval math
  → intervalByEndpoint.get(markId)?.longitudinalLengthM            // <- the value actually painted as "X.XX m"
```

Two gating differences from the authoritative path matter:

1. `cameraEvidence` reaches `<VideoOverlay>` **ungated**
   (`page.tsx:1297`, `cameraEvidence={overlayMeta?.cameraEvidence}`), while
   the measurement engine only receives it when `cameraPansMeaningfully`
   (`cameraType === "panning"`) is true (`page.tsx:438-439`). All four current
   benchmarks are `"stationary"`, so `zoneStepSummary` is always null in
   `measurements.ts` — but `VideoOverlay`'s own `zoneMetrics` (the
   `analyzeZoneSteps` call above) was **active** for all four, because it
   only requires `cameraEvidence` truthy, not panning-meaningful.
2. `analyzeZoneSteps` inside `VideoOverlay.tsx` runs its **own** zone
   classification (homography-projected canonical world coordinates, its own
   before/inside/after-zone boundary logic) — architecturally separate from
   `measurements.ts`'s `gapMarks = zone ? validMarks : marks` classification
   (simple world-x-bound membership using the linear scale). Two independent
   classifiers can disagree about which contacts are "in the zone" even when
   they mostly agree on the *distance* of matched contacts.

## 4. Root cause (Part A/C)

**First mathematically divergent operation**: `sourcePointToCanonicalWorld`
(homography/affine projection via `zoneAnchors.ts`, feeding `analyzeZoneSteps`'s
own axis-projection and zone-membership classification) vs. `measurements.ts`'s
legacy path (`mark.x + off(mark.time).x`, a simple per-axis camera-offset
correction, differenced and scaled by a single linear `metersPerPixel`
constant). Both are legitimate calibration models, but they are **different
computations** reading the same raw contact positions — for a near-static
camera they mostly agree numerically (median difference well under 1%) but
can disagree, sometimes sharply, about zone membership (in/out), because the
zone-boundary geometry is derived through two different projections.

**Reproduced from real artifact data** (`scripts/phase-8-0b-overlay-label-audit.mjs`,
run against the same live pose/session artifacts Phase 8.0A used):

- The dramatic 7.262 m / 4.221 m values from Phase 8.0A's Section 9 come from
  the **raw** `applyRealWorldStepDistances` path (`distanceMetersFromPrev`)
  — confirmed, again, in this phase's own real-artifact rerun (Vanni 240,
  contacts `contact-278-left-3` and `contact-583-left-8`). That raw field was
  **never actually read for the visible "X.XX m" label** in the current
  source (only for the debug-only, unitless `"≈X.XX rel"` indicator, gated
  behind the `camera_motion_debug` toggle) — a narrower conclusion than 8.0A's
  own honest "could see" framing, now settled directly against the real
  source file rather than inferred.
- The value that **was** shown for the normal "m" label — `zoneMetrics`'s
  `analyzeZoneSteps` output — is the real, separate root cause: close to
  authoritative on most matched contacts, but with real false positives and
  false negatives (§6).

## 5. Authoritative step model (Part D)

`ZoneStep` (`src/lib/benchmark/measurements.ts`) already carried every field
needed; this phase adds one additive identity field:

```ts
export interface ZoneStep {
  index: number;
  contactId: string;   // NEW (Phase 8.0B) — `contact-${sourceFrameIndex}-${side}-${index}`,
                        // identical to the id contactId() already computes and every
                        // other consumer (VideoOverlay's own marker-id construction,
                        // Phase 8.0A's manifest) already derives from the same StepMark.
  side: StepSide;
  timeS: number;
  worldX: number;
  stepLengthM: number | null;   // unchanged — the authoritative metre value, or null
                                 // when the interval is out-of-zone / integrity-rejected.
  fromSide: StepSide | null;
  longitudinalM?: number;
  lateralM?: number;
  classification?: ...;
  qualityFlags?: string[];
}
```

`contactId` is populated with the module's own `contactId(m)` helper — the
exact function that already builds `zoneStepSummary`'s contact ids — so no new
identity scheme was invented. `computeSprintMeasurements`'s math is otherwise
byte-for-byte unchanged (verified in §9).

## 6. Overlay consumer contract (Part E)

`page.tsx` passes `measurements?.zoneSteps ?? null` down through
`OverlayVideoPlayer` → `OverlaySurface` → `VideoOverlay` as a new
`authoritativeSteps` prop (plain pass-through at each layer, no new logic).

Inside `VideoOverlay.tsx`, once per clip:

```ts
const authoritativeStepLengthById = new Map(
  (authoritativeSteps ?? [])
    .filter((step) => step.stepLengthM != null)
    .map((step) => [step.contactId, step.stepLengthM as number]),
);
```

And the label line (previously `intervalByEndpoint.get(markId)?.longitudinalLengthM`):

```ts
const meters = authoritativeStepLengthById.get(markId) ?? null;
```

`markId` is unchanged — the same `contact-${sourceFrameIndex}-${side}-${index}`
string every marker in this file already builds for the dot/shape/color logic.
`zoneMetrics` (this file's own `analyzeZoneSteps` call) is **still computed**
and still drives contact-marker **color/shape classification**
(`classifiedById`, `isFinalEndpoint`) — that is real, disclosed, separate
presentation-styling logic, not a step-length calculation, and changing it was
out of this phase's scope (see §17). `intervalByEndpoint` (the only consumer
of `zoneMetrics.intervals[].longitudinalLengthM`) is removed — it has no
remaining reader.

No contact detection, timing, spatial position, calibration, world-transform,
`stepIntegrity`, or metric-formula file was touched.

## 7. Before/after benchmark comparison (Part B/J)

Real reconstruction via `scripts/phase-8-0b-overlay-label-audit.mjs` (compiles
and calls the real, unmodified `computeSprintMeasurements`,
`sourcePointToCanonicalWorld`, `sourceLineToCanonicalWorld`, `analyzeZoneSteps`,
`detectStepMarks`, `applyRealWorldStepDistances` against each benchmark's live
pose artifact + session calibration row) against all 43 step marks detected
across the four current benchmarks:

| Category | Count | Meaning |
|---|---:|---|
| Both null (agree) | 8 | First/last contact of the run — no interval exists either way |
| Match at display precision (<5 mm) | 21 | Old and authoritative agree to 2 decimals |
| Real value drift (5 mm – 20 mm, 0.3–0.9%) | 7 | Homography vs. linear-scale divergence (§4) |
| **False positive** (old showed a value; authoritative says unsupported) | **4** | Old overlay displayed a plausible-looking "m" label for a contact the scientific path rejects |
| **False negative** (old showed nothing; authoritative has a real value) | **3** | Old overlay silently suppressed a real, valid step length |

Full per-contact table (`tmp/phase80b/{gav,vanni240,vanni120,vanni60}-audit.json`):

**Gav** (12 contacts):

| contactId | old overlay | authoritative / new |
|---|---:|---:|
| contact-10-right-1 | — | — |
| contact-19-left-2 | — | **2.077** (false negative) |
| contact-31-right-3 | 2.081 | 2.083 |
| contact-44-left-4 | 2.144 | 2.148 |
| contact-56-right-5 | 2.147 | 2.153 |
| contact-70-left-6 | 2.088 | 2.098 |
| contact-83-right-7 | 2.198 | 2.212 |
| contact-93-left-8 | 2.068 | 2.081 |
| contact-106-right-9 | 2.225 | 2.245 |
| contact-118-left-10 | 2.209 | 2.228 |
| contact-131-right-11 | 2.291 | **—** (false positive) |
| contact-139-left-12 | — | — |

**Vanni 240** (9 contacts):

| contactId | old overlay | authoritative / new |
|---|---:|---:|
| contact-10-right-1 | — | — |
| contact-76-left-2 | — | **1.814** (false negative) |
| contact-278-left-3 | — | — (this is the raw-path 7.262 contact — never shown as "m" either way) |
| contact-330-right-4 | 1.922 | 1.921 |
| contact-375-left-5 | 1.862 | 1.863 |
| contact-443-right-6 | 2.179 | 2.181 |
| contact-475-left-7 | 1.809 | 1.816 |
| contact-583-left-8 | — | — (raw-path 4.221 contact — never shown as "m" either way) |
| contact-632-right-9 | 2.373 | **—** (false positive) |

**Vanni 120** (12 contacts):

| contactId | old overlay | authoritative / new |
|---|---:|---:|
| contact-27-left-1 | — | — |
| contact-51-right-2 | — | **1.706** (false negative) |
| contact-77-left-3 | 1.809 | 1.809 |
| contact-98-right-4 | 1.929 | 1.929 |
| contact-126-left-5 | 1.877 | 1.877 |
| contact-148-right-6 | 1.783 | 1.784 |
| contact-178-left-7 | 1.911 | 1.911 |
| contact-197-right-8 | 1.915 | 1.916 |
| contact-227-left-9 | 2.080 | 2.080 |
| contact-249-right-10 | 2.098 | 2.098 |
| contact-283-left-11 | 2.258 | 2.258 |
| contact-304-right-12 | 2.051 | **—** (false positive) |

**Vanni 60** (10 contacts):

| contactId | old overlay | authoritative / new |
|---|---:|---:|
| contact-37-right-1 | — | — |
| contact-47-left-2 | 1.834 | 1.833 |
| contact-62-right-3 | 1.865 | 1.866 |
| contact-73-left-4 | 1.936 | 1.936 |
| contact-83-right-5 | 1.796 | 1.797 |
| contact-99-left-6 | 2.133 | 2.134 |
| contact-109-right-7 | 1.863 | 1.864 |
| contact-128-left-8 | — | — |
| contact-137-right-9 | 2.231 | 2.232 |
| contact-152-left-10 | 2.086 | **—** (false positive) |

## 8. Known impossible-value examples (Part K)

The specific 7.262 m / 4.221 m values from Phase 8.0A (Vanni 240, contacts
`contact-278-left-3` and `contact-583-left-8`) were traced to their exact
source: `applyRealWorldStepDistances`'s raw, non-zone-restricted,
non-integrity-gated distance field. Both before and after this fix, that field
is **not** the source of the visible "m" label (only of the debug-only
`camera_motion_debug` "≈X.XX rel" indicator, which is explicitly unitless and
was not claiming to be a scientific measurement). The real, disclosed defect
in the actual visible label was the smaller-magnitude false-positive/negative
pattern in §7, now fixed.

## 9. Label association (Part H)

`mark.index` (the step-number label) and `markId` (the meters lookup key) are
read from the **same** `mark` object in the same loop iteration
(`VideoOverlay.tsx`'s per-mark render loop) — they cannot diverge or go
off-by-one relative to each other by construction. `markId`'s
`contact-${sourceFrameIndex}-${side}-${index}` format is identical to
`ZoneStep.contactId`'s construction (`measurements.ts`'s `contactId()`
helper), verified for all 43 detected marks in this phase's audit script
(`scripts/phase-8-0b-overlay-label-sanity.mjs`, check 3/4 per benchmark).

## 10. Evidence gating (Part I)

`authoritativeStepLengthById` is built by filtering `authoritativeSteps` to
`stepLengthM != null` — a contact absent from the zone, or present but
integrity-rejected (same-foot, implausible gap, etc.), simply has no entry, so
`meters` resolves to `null` and no "m" label is drawn (the contact **marker**
dot/shape still renders, driven by unrelated, unchanged marker-visibility
logic — only the scientific metre text is gated). Verified for all 43 marks:
zero post-fix rows show a label for an authoritative-`null` contact
(`scripts/phase-8-0b-overlay-label-sanity.mjs` check 12).

## 11. Auto Follow independence (Part G)

`authoritativeStepLengthById` is built once per clip from the
`authoritativeSteps` prop (static per session, server-computed) — it is not a
function of `autoFollow`, `followStateRef`, or any camera-path/presentation
state. Those inputs only affect `projectWorldStep(mark)` (screen **position**),
never `meters` (the **value**). Confirmed with real, live browser screenshots
(§13): the Gav benchmark's markers 6/7/8 read `2.10 m / 2.21 m / 2.08 m` with
Auto Follow off, and the identical `2.10 m / 2.21 m / 2.08 m` with Auto Follow
on (only their on-screen pixel position and zoom changed).

## 12. Resize/fullscreen/DPR independence (Part G)

Same argument as §11 — `authoritativeStepLengthById` has no dependency on
`canvas.width/height`, `devicePixelRatio`, or the displayed video rect; those
only feed `project()`/`projectWorldStep()` (position). A resize was captured
live (§13); the underlying value computation is unaffected by the resize path
(`geometryRef`/`canvas.width`/`canvas.height` recompute) since that code path
is entirely downstream of `meters`, never upstream of it.

## 13. Browser validation (Part Q)

Real, authenticated Playwright session (`scripts/phase-8-0b-browser-check.mjs`)
against the local dev server, permanent dev login
(`commander@atreides.local`), all four benchmark sessions.

- **Gav**, Auto Follow off: markers 2–8 read `2.08 / 2.08 / 2.15 / 2.15 /
  2.10 / 2.21 / 2.08 m`; marker 1 (first contact) shows no label. Exact match
  to the authoritative manifest (`2.077→2.08, 2.083→2.08, 2.148→2.15,
  2.153→2.15, 2.098→2.10, 2.212→2.21, 2.081→2.08`).
- **Gav**, Auto Follow on: markers 6/7/8 re-rendered at a different, zoomed
  screen position (`2.10 m`, `2.21 m`, `2.08 m`) — identical values, moved
  position, confirming §11 live.
- Vanni 240/120/60: the overlay layer toggles, gate lines, and playback
  controls rendered correctly; the underlying `<video>` element's decoded
  frame did not paint in every headless-Chromium capture for the larger
  240 fps clip (a capture-tooling timing issue, not an application defect —
  the canvas/gate/frame-counter state was correct throughout). The
  programmatic, exact-equality audit (§7, §9) is the primary evidence for
  those three benchmarks; Gav is the primary *visual* confirmation.
- Screenshots: `tmp/phase80b/screenshots/` (gitignored, not part of this
  change; available locally for manual review).

One environmental note: `npm run build` (Part P) and the already-running
local `next dev` server share the same `.next` build output directory;
running the production build corrupted the running dev server's asset
manifest (stylesheets 404'd). This was **not** a code defect — it was
recovered by clearing `.next` and restarting `npm run dev`, which was already
running before this session and is unrelated to this phase's code changes.

## 14. Files changed

- `src/lib/benchmark/measurements.ts` — additive `contactId: string` field on
  `ZoneStep`, populated via the existing `contactId()` helper. No other line
  in the metric-computation logic changed.
- `src/app/sessions/[id]/page.tsx` — one new prop:
  `authoritativeSteps={measurements?.zoneSteps ?? null}` passed to
  `<OverlayVideoPlayer>`.
- `src/components/video/OverlayVideoPlayer.tsx` — `authoritativeSteps` prop
  added and forwarded to `<OverlaySurface>` (plain pass-through).
- `src/components/video/OverlaySurface.tsx` — `authoritativeSteps` prop added
  and forwarded to `<VideoOverlay>` (plain pass-through).
- `src/components/video/VideoOverlay.tsx` — `authoritativeSteps` prop added;
  `authoritativeStepLengthById` lookup map built once per clip; the label
  line now reads `authoritativeStepLengthById.get(markId) ?? null` instead of
  `intervalByEndpoint.get(markId)?.longitudinalLengthM`; the now-unused
  `intervalByEndpoint` map removed. `zoneMetrics`/`classifiedById` (marker
  color/shape classification) and all contact-detection/world-projection code
  are unchanged.

New, standalone forensic/test scripts (not imported by any `src/` file, not
wired into any build/CI entry point):

- `scripts/phase-8-0b-overlay-label-audit.mjs`
- `scripts/phase-8-0b-overlay-label-sanity.mjs`
- `scripts/phase-8-0b-browser-check.mjs`

No `supabase/migrations/`, contact-detection, calibration, or world-transform
file was touched.

## 15. Tests

`scripts/phase-8-0b-overlay-label-sanity.mjs` — 32/32 PASS:

1. Per-benchmark: new overlay label exactly equals authoritative `stepLengthM`
   for every detected contact (43 rows total across 4 benchmarks).
2. Per-benchmark: every `contactId` well-formed and unique.
3. Per-benchmark: `contactId`'s frame/side/index triple matches its own row
   (no cross-wiring / off-by-one).
4. Per-benchmark: Average Step Length and the full `individualStepLengthsM`
   sequence exactly match the Phase 8.0A-recorded baseline (proves the
   additive `contactId` field changed zero scientific math).
5. Zero post-fix rows show a scientific label for an authoritative-unsupported
   contact (Part I).
6. Real defect proof: the pre-fix path had 4 false positives and 3 false
   negatives (documents the exact, real, now-fixed behavior change).
7. `VideoOverlay.tsx`'s label line reads the authoritative lookup directly and
   formats it with `.toFixed(2)` with no intermediate rounding (static source
   check).
8. `VideoOverlay.tsx`'s label line no longer reads the old
   `intervalByEndpoint` path (static source check — the overlay no longer
   independently computes a world step length for the label).
9. Forensic scripts are standalone, not imported by `src/`.

Plus the reused Phase 8.0A suite (`scripts/phase-8-0a-step-length-forensic-sanity.mjs`,
28/28 PASS, rerun in this phase) as the scientific-regression baseline.

## 16. Scientific regression

All rerun against the current, live artifacts — zero failures, zero value
changes:

| Suite | Result |
|---|---|
| Phase 8.0A forensic reconstruction | 28/28 PASS |
| Phase 8.0B overlay-label sanity (new) | 32/32 PASS |
| Phase 7.3B (`phase-7-3b-temporal-state:sanity`) | 11/11 PASS |
| Phase 7.0 (`phase-7-0-scientific-evidence:sanity`) | 26/26 PASS |
| Phase 7.1 (`phase-7-1-evidence-explanations:sanity`) | 24/24 PASS |
| Measurement recovery (`measurement-recovery:sanity`) | PASS |
| Zone step counting (`zone-step-counting:sanity`) | 25/25 PASS |
| Timing verification (`timing-verification:sanity`) | PASS |
| Phase 6.6B Part A (`phase-6-6b-part-a-instrumentation:sanity`) | 5/5 PASS |
| Phase 6.6B Part B (`phase-6-6b-part-b-presentation-sync:sanity`) | 18/18 PASS |
| Phase 6.6C (`phase-6-6c-authoritative-zone-visualization:sanity`) | 13/13 PASS |
| Phase 6.1 overlay fidelity (`phase-6-1-overlay-fidelity:sanity`) | 13/13 PASS |
| Auto Follow (`follow:sanity`) | PASS |
| Overlay alignment (`overlay-alignment:sanity`) | PASS |
| Zone anchor (`zone-anchor:sanity`) | PASS |
| World anchor (`world-anchor:sanity`) | PASS |
| Step integrity (`step-integrity:sanity`) | PASS |
| Stride metrics (`stride-metrics:sanity`) | PASS |
| Contacts (`contacts:sanity`) | PASS |
| Gates (`gates:sanity`) | PASS |
| Calibration (`calibration:sanity`) | PASS |
| `npm run typecheck` | clean |
| `npm run lint` | clean (0 warnings) |
| `npm run build` | succeeds |

## 17. Remaining limitations

- `zoneMetrics` (this file's own `analyzeZoneSteps` call) is still computed
  and still drives contact-marker **color/shape** classification
  (in-zone/boundary/etc.). It remains a second, real, independent
  classification of zone membership, separate from the authoritative one —
  disclosed here as a real, scoped-out concern (marker *styling*, not a
  step-length *value*), candidate for a future phase if marker-color accuracy
  ever needs to match the authoritative zone membership exactly.
- Cross-FPS (Part N) and continuous scrub/live-playback (Part M) independence
  are argued structurally from the code (the authoritative lookup has no
  dependency on playback rate, FPS, or scrub direction — only on which marks
  are already `reached`, unchanged pre-existing logic) rather than exhaustively
  browser-tested at every FPS/speed/scrub combination; the Gav live-browser
  capture and the 43-row programmatic audit are the primary evidence.
- Vanni 240/120/60 live-browser screenshots did not capture a painted video
  frame in every case (headless-Chromium video-decode timing, not an app
  defect — see §13); the programmatic audit is the authoritative evidence for
  those three benchmarks.
- The comparison player (`ComparisonPlayer.tsx`/dual-`OverlaySurface` view)
  was checked and confirmed to never receive `calibrationGates`/`cameraEvidence`
  today, so it never showed a calibrated "m" label before or after this
  change — out of scope, no action needed.

## 18. Phase status

CLOSED.

## 19. Roadmap status

No roadmap percentage claimed or updated by this phase (consistent with
Phase 8.0A; not requested by this task).

## 20. Git status

- `HEAD` unchanged; no commit made.
- No push, no `db:reset`, no database mutation.
- Files touched by this phase (in a working tree that already carried large,
  pre-existing, unrelated uncommitted work from prior phases 4–8.0a per the
  task's own "preserve all existing uncommitted work" instruction):
  `src/lib/benchmark/measurements.ts`, `src/app/sessions/[id]/page.tsx`,
  `src/components/video/OverlayVideoPlayer.tsx`,
  `src/components/video/OverlaySurface.tsx`,
  `src/components/video/VideoOverlay.tsx` (small, additive edits within each
  — verified directly against the diff, not inferred from file-level status),
  plus three new standalone scripts and this document.
