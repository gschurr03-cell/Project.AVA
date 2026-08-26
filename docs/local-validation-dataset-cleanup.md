# Project AVA
## Local Validation Dataset Cleanup — Preserving the Gav Reference Benchmark

Status: destructive local-development cleanup, completed with explicit user
confirmation before any deletion. `db:reset` was never run. Nothing was
committed or pushed. Athletes, users, auth accounts, migrations, seed
configuration, source code, and model assets were never touched.

---

## 1. Exact Gav benchmark preserved

- **Session ID**: `e04a7983-7406-4a00-bb89-8ada7b10bf9f`
- **Session title**: "Gav 20m Fly Baseline video"
- **Athlete ID**: `0510a4cb-9344-449b-97c3-ec65475e9cc0`
- **Athlete name**: Gav
- **Coach**: `efe6fd18-19d4-4dbb-bf5a-f5fb47df3531` ("Atreides Commander", admin)
- **Original filename**: `FullSizeRender.mov`
- **Source video path**: `0510a4cb-9344-449b-97c3-ec65475e9cc0/e04a7983-7406-4a00-bb89-8ada7b10bf9f.mov`
- **Current working analysis**: `3a148f45-02ff-492d-b9f1-790470b83c21` (status `complete`)
- **Pose artifact**: `0510a4cb-9344-449b-97c3-ec65475e9cc0/e04a7983-7406-4a00-bb89-8ada7b10bf9f/3a148f45-02ff-492d-b9f1-790470b83c21.pose.json`
- **Linked benchmark**: `44444444-4444-4444-8444-444444444444` ("AVA Calab Vid 1", source `VueMotion`)

## 2. Evidence used to identify it

Two real "Gav" athlete/session pairs existed in the live database. Both were
audited (athlete records, session metadata, linked `benchmarks` rows, coach
accounts, `scripts/dev-seed.mjs` for permanent-seed status) and presented to
the user as Candidate A and Candidate B, per this task's explicit "if more
than one candidate could reasonably be the benchmark, stop and ask" — this
was a real ambiguity, not a formality:

- **Candidate A** (`6f50822b-b7da-42af-a5e6-22f92701e97d`, "AVA Accel Test"):
  status `failed` (never produced a usable analysis, insufficient temporal
  resolution at 30fps), athlete `ba2fb4d2-...` owned by the permanent local
  dev-login coach account, but not itself present in `scripts/dev-seed.mjs`.
- **Candidate B** (`e04a7983-...`, "Gav 20m Fly Baseline video"): status
  `complete`, `recording_mode: static_precision`, `spatial_metric_eligibility:
  eligible` — the only Gav session with real, usable results, and the one
  tied to the historical "AVA Calab Vid 1"/VueMotion (10.74 m/s) external
  reference used throughout this project's engineering reports (Days 97, 99,
  103, 104).

The user confirmed **Candidate B** as the permanent Gav benchmark and
explicitly confirmed Candidate A was not protected and could be deleted.

## 3. Protection mechanism added or reused

**Reuse audit performed first**, per instructions: `public.validation_fixtures`
(migration `0022_validation_fixtures.sql`) already provides a service-only,
`session_id ... on delete restrict` protected-source registry, used
elsewhere for the panning regression fixture. It was **not** reused because
its schema is semantically panning-specific — `expected_recording_class`
only accepts `smooth_pan | unstable_pan | pan_with_zoom |
excessive_camera_motion`, with no truthful value for a stationary fly-camera
session. Forcing the Gav benchmark into it would mean writing a false
classification, which `docs/accuracy-manifesto.md` ("never fabricate data")
forbids. A general, honest, session-level mechanism was added instead.

**New mechanism** (two additive migrations):

- `supabase/migrations/0072_protected_reference_benchmark_sessions.sql` —
  adds `sessions.is_reference_benchmark boolean not null default false`;
  adds `set_session_reference_benchmark(p_session_id, p_protected)` (narrow,
  `SECURITY DEFINER`, service-role-only setter — `sessions` has no direct
  `UPDATE` grant for `service_role`, so this is the correct least-privilege
  way to set the flag); adds `cleanup_unprotected_sessions(p_dry_run =
  true)` (narrow, `SECURITY DEFINER`, service-role-only bulk deletion whose
  entire protection mechanism is its `WHERE is_reference_benchmark = false`
  clause — a protected row can structurally never appear in its result set;
  `p_dry_run` defaults to `true` so a preview is the safe default).
- `supabase/migrations/0073_protect_reference_benchmark_trigger.sql` —
  defense-in-depth: a `BEFORE DELETE` trigger on `sessions` that rejects
  deleting any row with `is_reference_benchmark = true` through **any**
  pathway, not just the cleanup RPC — including a raw `DELETE FROM sessions`
  run directly. Verified live: a direct `DELETE` against the protected Gav
  session was rejected with the exact expected error before any cleanup
  began.

Both applied locally via `supabase migration up` — **`db:reset` was never
run.** No broad grants were added; both new functions are `revoke all ...
from public` + `grant execute ... to service_role` only. `npm run db:types`
regenerated `src/lib/supabase/database.types.ts` afterward.

**Tests** (`scripts/session-protection-sanity.mjs`, wired as `npm run
session-protection:sanity`, 16 checks against the live local database using
synthetic, clearly-labeled fixture rows, cleaned up unconditionally):
protected-session deletion rejected (both directly and via the cleanup
RPC's dry-run/real result sets), ordinary-session deletion still works,
bulk cleanup excludes protected sessions, and a protected session's storage
path is never queued for deletion. **All 16 passed.**

## 4. Processes stopped

- No `analysis-worker.mjs` process was found running at the start of this
  task (already stopped at the end of the prior session).
- No `mediapipe_pose_runner.py` subprocess was running.
- `analysis_jobs` had **zero** active/claimed/queued/retryable rows before
  cleanup began — confirmed via direct query before touching anything.
- The Next.js dev server (`next dev`, pid 2261) was left running — it does
  not autonomously mutate session state, and it was needed for Step 10's UI
  verification, per this task's explicit allowance ("the dev server may
  remain running if it cannot mutate session state during cleanup").
- The local Supabase stack was left running (required for all DB/storage
  access this task needed).

## 5. Pre-cleanup counts

| Table | Count |
|---|---|
| `sessions` | 13 |
| `sessions` (protected) | 1 |
| `analyses` | 13 |
| `analysis_jobs` | 13 |
| `coach_notes` | 0 |
| `feedback_submissions` | 0 |
| `support_requests` | 0 |
| `validation_fixtures` | 0 |
| `athletes` | 5 |
| `profiles` | 2 |
| `auth.users` | 2 |
| `storage.objects` (`sprint-videos`) | 13 |
| `storage.objects` (`pose-artifacts`) | 9 |

## 6. Manifest path

`tmp/session-cleanup-manifest-20260804-192719.json` — `tmp/` added to
`.gitignore` this session (did not previously exist). Contains, per session:
ID, athlete ID/name, title, original filename, source video path, status,
created_at, analysis IDs, job IDs, artifact paths, real storage object
paths (cross-checked against a full recursive bucket listing — 0 unclaimed
objects in either bucket), protection status, and KEEP/DELETE decision with
reason. No video/artifact file contents were copied. Not committed.

## 7. Dry-run summary

- Protected session: `e04a7983-...` ("Gav 20m Fly Baseline video") — confirmed via the trigger test that it cannot be deleted.
- Sessions to keep: **1**. Sessions to delete: **12**.
- Analyses to delete: **12** (protected session keeps its 1).
- Jobs to delete: **12** (protected session keeps its 1).
- `sprint-videos` objects to delete: **12**; to preserve: **1**.
- `pose-artifacts` objects to delete: **8**; to preserve: **1**.
- Ambiguous/shared objects: **none** — every object mapped to exactly one
  session by its `athlete_id/session_id` path prefix; Gav's prefix never
  overlapped any other session's.
- `coach_notes` / `feedback_submissions` / `support_requests` /
  `validation_fixtures`: all empty — nothing to reconcile.
- No planned action touched or altered the protected Gav session.

## 8. Database rows deleted

Executed via `select * from cleanup_unprotected_sessions(false);` (the
sanctioned RPC — its `WHERE` clause is the entire protection mechanism).
Returned exactly the 12 expected session IDs:

`6f50822b-b7da-42af-a5e6-22f92701e97d` (AVA Accel Test, failed),
`2254c1c0-f980-452e-a51c-93e04843156b` (Vanni 60fps accel, failed),
`b37d1990-724f-48f1-bffd-482073d80687` (Vanni Accel 120fps, uploaded),
`56a7a98d-352f-4827-a2d7-e174df0f3082` (Vanni Accel 240 fps, uploaded),
`eedd7fee-0553-4992-9065-acbbd757f4ea` (Vanni Accel 240 fps panning, uploaded),
`c3f1e165-cffc-4efa-b9ae-adf3cf792193` (Vanni 60fps fly, complete),
`26d7492b-99ad-4070-b0e2-6ee654032f8b` (unnamed, complete),
`227ae200-af96-4ffc-94d0-56d2e5f9d155` (vanni 240fps fly, complete),
`7e7a8ad7-f194-4468-bc6d-6a51d8985f14` (Vanni Panning 240fps fly, failed),
`12d30200-7412-43d7-bbe4-c14a3a135993` (Vanni panning step length, uploaded),
`f7026ec9-1428-44f5-819e-5db96ccb20d9` (AVA Accel Test 60fps-QA, complete),
`f284fb85-cfe4-4ebf-9956-279975396f37` (AVA Accel Test 120fps-QA, complete).

Immediately after: `sessions=1`, `analyses=1`, `analysis_jobs=1`,
`athletes=5` (unchanged), `profiles=2` (unchanged), `auth.users=2`
(unchanged).

## 9. Cascade behavior used

`analyses.session_id → sessions.id ON DELETE CASCADE`,
`analysis_jobs.session_id → sessions.id ON DELETE CASCADE` (and
`analysis_jobs.analysis_id → analyses.id ON DELETE CASCADE`, a second,
redundant cascade path), `coach_notes.session_id → sessions.id ON DELETE
CASCADE` — all pre-existing, unmodified FK constraints. `analyses`,
`analysis_jobs`, and `coach_notes` rows for the 12 deleted sessions were
removed automatically by Postgres; none required explicit deletion.

## 10. Explicit child cleanup performed

**None was needed.** `feedback_submissions.session_id`/`analysis_id` and
`support_requests.session_id`/`analysis_id` are `ON DELETE SET NULL`
(by design — they'd retain content, losing only the reference) but both
tables had 0 rows. `validation_fixtures.session_id` is `ON DELETE RESTRICT`
but had 0 rows, so it could never have blocked this cleanup. No athlete-
scoped intelligence/coaching-state tables (44 of them, all `athlete_id ...
ON DELETE CASCADE` from `athletes`, never from `sessions`) were touched,
since no athlete row was deleted.

## 11. Storage objects deleted

**`sprint-videos`** (12/12 deleted, 0 failed): every object listed in
Section 8's session set, one `.mov` per deleted session, all confirmed
`DELETED` with no error.

**`pose-artifacts`** (8/8 deleted, 0 failed): all pose artifacts under the
12 deleted sessions' `athlete_id/session_id/` prefixes — including one real
data-quality finding worth recording: analysis `92edd09e-...` (Candidate A)
had an **empty** `keypoints_path` column despite a real object existing in
storage at `ba2fb4d2-.../6f50822b-.../92edd09e-....pose.json` (a stale/
partial upload from before the analysis failed). Deletion used the actual
recursive storage listing, not the DB path column, specifically so this
kind of drift couldn't leave an orphaned object behind.

## 12. Storage objects preserved

`sprint-videos/0510a4cb-.../e04a7983-....mov` and
`pose-artifacts/0510a4cb-.../e04a7983-.../3a148f45-....pose.json` — the
Gav benchmark's video and pose artifact. Verified present and intact after
cleanup (Section 18).

## 13. Failed storage deletions

**None.** 20/20 targeted objects deleted successfully across both buckets.

## 14. Post-cleanup counts

| Table | Count |
|---|---|
| `sessions` | 1 |
| `sessions` (protected) | 1 |
| `analyses` | 1 |
| `analysis_jobs` | 1 |
| `coach_notes` | 0 |
| `feedback_submissions` | 0 |
| `support_requests` | 0 |
| `validation_fixtures` | 0 |
| `athletes` | 5 |
| `profiles` | 2 |
| `auth.users` | 2 |
| `storage.objects` (`sprint-videos`) | 1 |
| `storage.objects` (`pose-artifacts`) | 1 |

## 15. Orphan-check results

All zero: `analyses` without a matching `session` — 0; `analysis_jobs`
without a matching `analysis` or `session` — 0; `sessions.current_working_
analysis_id` pointing to a missing `analysis` — 0; active/retryable
`analysis_jobs` remaining — 0. Every remaining storage object belongs to a
real, remaining (protected) session; every session-referenced storage path
resolves to a real object (verified via a signed-URL `HEAD` request
returning `200`, Section 18).

## 16. Athlete count before versus after

**5 → 5.** Unchanged. No athlete row was read-write touched at any point —
all 5 athletes (Ava Sprinter, Gav ×2, Vanni, FPS QA) remain exactly as
before, including the two athletes whose only sessions were deleted
(`ba2fb4d2-...` and `f5875b1c-...` now have zero sessions, which is
expected and correct — athletes are preserved independent of their session
history).

## 17. User/auth count before versus after

**`profiles`: 2 → 2. `auth.users`: 2 → 2.** Unchanged — neither table's
rows were ever part of any delete/cascade path this task touched.

## 18. Gav UI/source-video verification

Verified via direct, real queries against the live post-cleanup database
(no browser-automation tool was available in this environment for a literal
click-through; the equivalent server-side data path was exercised
directly instead):

- The sessions-list query scoped to Gav's athlete returns exactly the one
  protected session (`"Gav 20m Fly Baseline video"`, status `complete`).
- A signed URL for the Gav source video was generated successfully and a
  `HEAD` request against it returned **`200`** with a real
  `content-length: 652218` — the video is genuinely fetchable/playable.
- `sessions.calibration_gates` is present (non-null) for the Gav session.
- `sessions.current_working_analysis_id` resolves to a real, `complete`
  analysis whose `keypoints_path` points to a real, present storage object.
- A full `select id, name from sessions` returns **exactly one row** — the
  Gav session — confirming no deleted session appears anywhere.
- Normal session creation was not re-verified via a live authenticated
  browser flow (no browser-automation tool available); this migration only
  added a new nullable-defaulted column and two new narrow functions, and
  did not touch the existing `sessions` RLS policy ("coaches manage
  sessions for their athletes") or any INSERT-path grant, so it cannot have
  structurally broken session creation — verified by inspection, not a live
  test, and disclosed as such.

## 19. Worker/lint/build results

- `npm run worker:check` — **passed** (`worker_configuration_valid`).
- `npm run lint` — **passed** (0 warnings).
- `npm run build` — **passed** (production build, all routes compiled).
- `npm run session-protection:sanity` (new) — **16/16 passed**.

## 20. Files changed

**New**: `supabase/migrations/0072_protected_reference_benchmark_sessions.sql`,
`supabase/migrations/0073_protect_reference_benchmark_trigger.sql`,
`scripts/session-protection-sanity.mjs`,
`docs/local-validation-dataset-cleanup.md`,
`tmp/session-cleanup-manifest-20260804-192719.json` (gitignored, not
committed).

**Modified**: `.gitignore` (added `/tmp/`), `package.json` (1 new script:
`session-protection:sanity`), `src/lib/supabase/database.types.ts`
(regenerated after the schema change).

**No other files were touched by this task** — all other entries visible in
`git status` (Section 22) are untracked/modified carryovers from prior,
unrelated sessions' work.

## 21. Migration or RPC changes

Two additive migrations (0072, 0073) — see Section 3. Two new RPCs
(`set_session_reference_benchmark`, `cleanup_unprotected_sessions`), one
new trigger function (`prevent_protected_session_delete`) + trigger
(`sessions_protect_reference_benchmark`). No existing migration, RPC,
policy, or grant was modified or removed.

## 22. Git status

Working tree only — **nothing was committed or pushed.** `git status
--short` before and after this task's edits confirms only the files listed
in Section 20 were touched by this task; every other untracked/modified
entry predates it (carryover from Days 90–104's work, per this project's
established practice of not committing mid-milestone).

## 23. Remaining cleanup risks or limitations

- **44 athlete-scoped intelligence/coaching-state tables were not audited
  for stale references** to the now-deleted sessions/analyses (e.g. cached
  JSONB snapshots that may still mention a deleted analysis ID internally).
  These tables cascade from `athletes`, not `sessions`, so no FK was
  broken, but their *cached content* was not inspected — a soft data-
  quality question, not a referential-integrity one, and out of this task's
  explicit scope (session/storage cleanup only).
- **No live authenticated browser walkthrough was performed** (Section 18)
  — no browser-automation tool was available in this environment. All
  claims about session listing, video playback, calibration, and analysis
  loading were verified via the real underlying data path (direct queries,
  a real signed URL + HTTP HEAD request) rather than a literal click-
  through; new-session creation was verified by code inspection rather than
  a live test.
- **The `is_reference_benchmark` protection is session-level only.** If a
  future workflow ever creates a *second* analysis/job pointing at a
  protected session's data in an unusual way, this mechanism protects the
  session row (and, transitively via CASCADE, everything under it) but does
  not independently protect an orphaned artifact that somehow existed
  outside that chain. No such object was found to exist in this audit.
- **The manifest is a point-in-time snapshot** (`tmp/session-cleanup-
  manifest-20260804-192719.json`); it is not re-generated automatically and
  will grow stale if new sessions are created and later need cleanup — a
  fresh manifest should be generated for any future cleanup pass.
