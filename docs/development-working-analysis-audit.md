# Development working-analysis audit

Audit date: 2026-07-16

## Root cause

Every call to `queueAnalysis` inserts a new `analyses` row. The
`assign_analysis_version` trigger assigns every row a permanent sequence number, and the
session page selects the newest sequence unless an `?analysis=` query remains in the URL.
The page then polls only that selected row. Consequently a stale explicit selection can
remain focused while another analysis completes, and failed/duplicate development attempts
are displayed as permanent versions.

There is no client refresh loop on the session page. Job completion can therefore update
the database correctly without automatically refreshing the overlay.

## Component audit

| Component | Existing state | Readiness and decision |
| --- | --- | --- |
| Source video | One private session object | Production-ready foundation; never mutate or delete during rerun/reset |
| Analysis rows | Immutable row per queue request | Keep for explicit snapshots; replace automatic visible versioning |
| Job queue | Durable one-to-one job per analysis | Keep claims/leases; add atomic working-job reset and stale-claim cancellation |
| Completion RPCs | Atomically complete analysis + job | Keep; add active-working promotion guard |
| Version trigger | Numbers every inserted row | Keep internal ordering for compatibility; expose numbers only for saved snapshots |
| Page selection | Query selection, else newest row | Blocking; default to `sessions.current_working_analysis_id` |
| Polling | Server render reads one job once | Missing; add exact-ID client polling and refresh on terminal state |
| Overlay | Loads selected analysis artifact | Keep; default selection correction makes it load the working artifact |
| Failure history | Failed rows remain visible forever | Archive legacy attempts and reuse the working identity on rerun |
| Saved versions | Every row is implicitly saved | Add explicit immutable snapshot action and nullable saved-version number |
| Reset | Calibration removal exists; no full working reset | Add atomic reset that preserves media and saved snapshots |

## Internal implementation plan

1. Add `working`/`saved`/`archived` lifecycle metadata, a session active-working pointer,
   and unique indexes enforcing one active working row and saved-version numbering.
2. Add atomic database functions to replace/reset the working attempt and clone an explicit
   immutable snapshot.
3. Route `queueAnalysis` through the working-analysis function and return the exact ID.
4. Default the page to the working ID, show only explicit snapshots, and poll that exact ID.
5. Archive legacy development attempts without deleting source media or restoring invalid
   timing.
6. Add lifecycle regression coverage and run worker/UI/build checks.

## Implemented

- Added `working`, `saved`, and `archived` lifecycle kinds, a session
  `current_working_analysis_id`, nullable saved-version numbering, saved timestamps/notes,
  supersession timestamps, and unique indexes enforcing one current working row.
- Rerun now reuses the current working analysis ID. The database atomically invalidates any
  stale worker claim, resets its job, clears prior outputs/errors/invalidation flags, stores
  the new immutable input snapshot, and queues the same identity.
- Added explicit Save Version. It clones the completed database result, assigns the next
  saved version number, and copies the pose artifact to the saved analysis ID so a later
  working rerun cannot overwrite snapshot evidence.
- Added Reset Working Analysis. It archives only the working row, cancels unfinished work,
  clears calibration/timing/overlay draft state, and leaves the original source and saved
  versions untouched.
- Replaced the large automatic version list with Working Analysis controls and a Saved
  Versions section that is hidden when empty.
- Page selection defaults to the session working pointer. Only an explicit saved-version
  link can override it; stale failed or archived IDs cannot become the default.
- Added exact-ID client polling and development diagnostics for current, queued, completed,
  and latest-saved analysis IDs.

## Local panning-session cleanup

Migration 0033 was applied locally. For `IMG_6371 2.mov`, all legacy automatic attempts
except one working row are archived. V1, V2, and failed V13–V16 are hidden from the session
workflow. The source remains:

`11111111-1111-4111-8111-111111111111/2f1c901b-a5e2-4682-9049-1aa1fe8e89fb.mov`

The retained working analysis is
`fbeb8169-4294-4ed7-b1bf-28b06f55f312`, and it remains
`invalid_gate_propagation`; no invalid timing was restored. The session exposes one working
row and zero implicit saved versions.

## Verification

- `working-analysis:sanity`: passed.
- `working-analysis:cleanup`: passed against all three local sessions.
- `worker:analysis:sanity`: passed.
- `fullrun:sanity`: passed.
- Typecheck, lint, and production build passed.
- Lint retains the pre-existing `VideoOverlay` exhaustive-dependencies warning.
