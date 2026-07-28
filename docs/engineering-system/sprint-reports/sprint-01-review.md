# Sprint 01 review

Exit decision: **PARTIAL**

## Outcome

Sprint 01 sought to control the engineering baseline and release truth. Two of five tasks
are Verified Complete:

- `AVA-0039`: production developer/experimental surfaces now fail closed through a
  versioned manifest enforced by the canonical feature loader.
- `AVA-0040`: `next lint` was replaced with ESLint CLI and the overlay hook warning was
  corrected without disabling rules.

Three tasks are accurately blocked:

- `AVA-0001`: a clean intentional baseline cannot be produced without partitioning and
  committing substantial user-owned work.
- `AVA-0030`: depends on `AVA-0001`; remote protected checks were not available or observed.
- `AVA-0032`: depends on staging migration verification (`AVA-0004`) and remote CI
  (`AVA-0030`).

No task is partial or not started after readiness reclassification. No new permanent task
was required.

## Decisions and source truth

- DEC-007 selects one production surface manifest, enforced by the existing feature loader.
- DEC-008 keeps `npm run lint` as the stable caller and selects ESLint CLI as its engine.
- SOT-11 and SOT-12 record those canonical sources.

No result, analysis-state, authentication, authorization, worker, database or native source
of truth changed.

## Risk and regression

Production exposure risk is reduced because unsafe flags and rollout modes now stop a
production process rather than relying on independent defaults. Quality-signal drift is
reduced through a zero-warning lint gate. No new security, scientific or data migration
risk was introduced.

All executable local regression gates passed. Remote CI, clean-checkout reproduction and
staging schema evidence remain unavailable, so the Sprint 01 exit criteria did not pass in
full.

## Critical path and scoring

Sprint task completion is 40% by count. `AVA-0039` removes one P0 and `AVA-0040` removes one
P2; remaining priorities are P0 19, P1 22, P2 6, P4 1. M0 has two evidenced outcomes but is
not complete while `AVA-0001`, `AVA-0030` and `AVA-0032` remain blocked.

The audited program scores remain conservatively unchanged: overall 56%, backend 72%,
native 38%, scientific validation 18%, training 34%, security 48%, operations 31%.
Local code and documentation do not substitute for the missing remote/staging evidence.

## Sprint 2 recommendation

Do not execute Sprint 2 until ownership of the existing worktree is partitioned into an
intentional baseline and remote repository checks can be observed. After that, complete
`AVA-0001`, `AVA-0030`, and `AVA-0032`, then use the authoritative Sprint 2 task set:
`AVA-0002`, `AVA-0003`, `AVA-0004`, `AVA-0005`, `AVA-0010`, `AVA-0011`, `AVA-0013`,
and `AVA-0038`.

