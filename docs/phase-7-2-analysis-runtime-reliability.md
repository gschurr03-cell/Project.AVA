# Phase 7.2 — Analysis Runtime Reliability

**Date:** 2026-08-07  
**Status:** **CLOSED by Phase 7.2B**  
**Roadmap:** 29.5% (unchanged; Phase 7.2 is unweighted)

## 1. Executive summary

The Vanni 240 incident was a backward-compatibility failure at the pose-schema
parse boundary. Its database pointer, storage object, authorization, JSON, and
pose frames were intact. Later optional gate-debug fields had become required,
causing the loader to reject the complete pose sequence. Legacy diagnostic
fields are optional again and the real artifact now validates.

AVA now has a user-scoped launchd worker (`ava:start`, `ava:stop`, `ava:status`),
automatic restart, project-local logs, active-lease progress writes, bounded UI
polling, measured two-pass work percentages, observed-throughput ETA, and an
explicit retry-progress reset. No scientific formula or gate was changed.

This report records the original Phase 7.2 checkpoint. Phase 7.2B subsequently
closed the runtime lifecycle and formally reclassified the deterministic Vanni
60 artifact difference outside runtime ownership. The current artifact replays at
**4.5224052087322875 Hz**, not the required canonical
**4.385953327434329 Hz**. Two fresh runs produced the same SHA-256 and value.
Changing scientific code or tuning back to history is outside this phase, so
the discrepancy is preserved rather than hidden. See
`docs/phase-7-2b-runtime-lifecycle-closure.md` for closure evidence.

## 2. Roadmap status

Phase 7.2 is CLOSED and unweighted. Overall completion remains **29.5%**.
Phase 6.2 separately remains IN PROGRESS solely for browser playback validation.
Phases 7.0 and 7.1 remain CLOSED.

## 3. Vanni 240 artifact incident

Session `31fe352b-f00f-4a80-b20a-17c2ab08ec5a` correctly points to working
analysis `a7679326-e193-4489-bf50-735fe402ec60`. That analysis is complete and
points to the expected object. The object downloaded as 9,297,825 bytes, parsed
as JSON, contained 1,020 pose frames, and matched the repository's Phase 4.2K
artifact at SHA-256 `3f866e69ba51c650aa371f109b5d5ae08ad52278ac843831e81135d930019e25`.

## 4. Artifact root cause

The first failing boundary was `poseSequenceSchema.safeParse`. Existing
`ava-gate-lock-debug-v1` frames did not contain later-added
`scientificStartGate`, `scientificFinishGate`, and transform-diagnostic fields.
Those additive diagnostics had been made required without a schema-version
change. Classification: **legacy artifact / schema incompatibility**.

## 5. Artifact fix

The later gate-debug fields are optional for v1 reads; new artifacts still emit
them. The loader now distinguishes missing pointer, missing object, corrupt JSON,
schema incompatibility, access error, and available. UI guidance names the
failure and recommends regeneration only for recoverable artifact defects.

## 6. Artifact recovery behavior

No object was silently rewritten and no pose evidence was synthesized. A valid
legacy artifact loads directly. Missing/corrupt/incompatible artifacts receive a
specific reason. Rerun remains the bounded recovery path; storage errors do not
silently complete because upload is already required before completion.

## 7. Current worker lifecycle

The inherited worker is a stateless Node process backed by Postgres queue rows,
claim tokens, renewable leases, heartbeats, bounded retries, idempotent artifact
paths, and atomic completion RPCs. An unmanaged orphan was found on port 8080;
it was ready and idle (`queueDepth=0`, `activeJobs=0`) before replacement.

## 8. Persistent worker architecture

`npm run ava:start` installs/starts `com.projectava.analysis-worker` as a
user-scoped LaunchAgent. It uses the repository working directory, `.env.local`,
the production `.venv`, an explicit launchd PATH, `KeepAlive`, ten-second restart
throttling, and `.ava-runtime/` logs. No sudo is needed. `ava:status` and
`ava:stop` inspect and stop the same stable service label.

## 9. Crash and lease recovery

A controlled idle-worker termination changed PID 10181 to 10566; launchd run
count advanced and readiness recovered. The existing claim token and lease
remain the duplicate-work authority. Progress writes additionally require the
same unexpired processing claim. Existing tests prove active leases are
respected and expired leases reject stale owners.

## 10. UI live-update architecture

The session card uses the authenticated `get_analysis_job_status` RPC every
1.5 seconds. This is bounded polling, survives refresh, rejects illegal stale
transitions, and refreshes server results automatically at completion. No manual
page reload is required.

## 11. Progress model

Wall-clock creep was removed. Non-frame stages hold at their evidenced stage
floor. Processing maps real work into its 18–72% band. Completion status alone
authorizes 100%. Progress records include `progressPercent`, stage, processed and
total units, ETA, update time, throughput, and method
`measured_work_units_v1`.

## 12. Stage model

The inherited queue states remain queued, claimed, downloading, validating,
processing, generating results, uploading artifacts, completing, and completed.
No lifecycle or failure state was collapsed.

## 13. Frame/work-unit accounting

MediaPipe's two full passes are two equal sets of source work units. Pass 1 is
`0..totalFrames`; pass 2 adds one completed-pass offset. Forced pass-completion
telemetry handles stride-gated final emissions and source frames that legitimately
produce no pose frame. This telemetry does not change pose output.

## 14. ETA algorithm

The worker calculates observed work-unit throughput and a bounded EWMA
(`0.3 * observed + 0.7 * previous`). ETA is remaining measured work divided by
that throughput. No ETA is shown until a positive observed rate exists. It is
not a client-side fake countdown.

## 15. ETA accuracy

The real runs demonstrated convergence, not calibrated prediction accuracy.
Vanni 240 began around 269 seconds and converged to about 5 seconds before a
roughly 173-second run completed. Vanni 120 converged from roughly 157 seconds
to 0; Vanni 60 converged to 0. Exact MAE cannot be computed from the retained
latest-snapshot-only schema, so no MAE is claimed. Persisting bounded progress
history would be required for a defensible aggregate accuracy study.

## 16. Progress UI

Queued/retrying stays indeterminate. Processing percentage uses persisted work
units, is monotonic within one attempt, and displays throughput-derived ETA.
Stage labels remain lifecycle-derived. Terminal completion renders 100%.

## 17. Failure and retry UX

Retrying remains distinct from failed/dead-lettered. A real repeat exposed that
the reused job retained prior progress; the first new snapshot correctly failed
the monotonic guard. Migration 0075 now clears progress on every transition back
to queued. A subsequent retry was observed starting with `progress=null`, then
18%, advancing normally to completion.

## 18. Files changed

- `src/lib/calibration/gateLockDebug.ts`
- `src/lib/video/loadOverlayFrames.ts`
- `src/app/sessions/[id]/page.tsx`
- `src/lib/analysisProgress/model.ts`
- `src/app/sessions/[id]/AnalysisProgressCard.tsx`
- `src/lib/biomechanics/mediapipe/runtime/mediapipe_pose_runner.py`
- `src/lib/calibration/index.ts`, `src/lib/calibration/gates.ts`
- `scripts/analysis-worker.mjs`, `scripts/ava-worker-control.mjs`
- `scripts/analysis-progress-sanity.mjs`, `scripts/worker-lease-sanity.mjs`
- `scripts/phase-7-2-analysis-runtime-sanity.mjs`
- `package.json`, `.gitignore`, migrations 0074–0075, this report, roadmap.

## 19. Database changes

Migration 0074 adds a claim-scoped progress-report RPC. Migration 0075 resets
progress on requeue. Both were applied locally. Four benchmark jobs were
requeued; Vanni 60 was repeated twice to adjudicate determinism. One repeat
failed safely before completion because it exposed inherited stale retry
progress; the corrected retry completed. No database reset occurred.

## 20. Deterministic tests

Phase 7.2: **24/24 passed**. Analysis progress passed. Worker job and analysis
sanity passed. Lease integration passed, including owner, expiry, monotonicity,
and retry reset contracts. The formerly documented standalone `pose:sanity`
alias failure was repaired because it prevented the real worker build;
`pose:sanity` now passes.

## 21. Gav real run

Completed without retry in about 22.7 seconds; 142-frame artifact readable.
Scientific replay: **4.848484848484849 Hz**.

## 22. Vanni 240 real run

Completed without retry; 1,020-frame artifact readable. Scientific replay:
**3.103448275862069 Hz**.

## 23. Vanni 120 real run

Completed without retry; 483-frame artifact readable. Scientific replay:
**3.6206896551724137 Hz**.

## 24. Vanni 60 real run

Completed; 233-frame artifact readable. Two fresh runs were byte-identical at
SHA-256 `bd4c3a4a956e78946ac957f3cbbdc50be89d7f1cf072d754a42f5c2e6562771f`.
Both replay at **4.5224052087322875 Hz** with 9 contacts and 2.37 s zone time,
not the canonical **4.385953327434329 Hz**, 10 contacts, 2.40 s.

## 25. Artifact readability validation

All four current objects downloaded, parsed, and passed the current
`poseSequenceSchema`: Gav 142, Vanni 240 1,020, Vanni 120 483, Vanni 60 233
frames. Artifact upload precedes completion in the real logs.

## 26. Scientific replay validation

Gav, Vanni 240, and Vanni 120 are exact. Vanni 60 is a deterministic current-
worker discrepancy. Phase 7.0/7.1 evidence suites remain unchanged and pass.
Phase 7.2 did not alter localization, pose decisions, contacts, timing,
calibration, gates, evidence eligibility, or metric formulas.

## 27. Acceptance table

| Criterion | Result |
|---|---|
| Vanni 240 root cause and systemic artifact fix | Pass |
| persistent worker and crash recovery | Pass |
| lease/duplicate correctness | Pass |
| automatic UI updates | Pass (bounded polling) |
| real work percentage and observed ETA | Pass |
| automatic current completion and readable artifact | Pass |
| retry/failure accuracy | Pass after real defect correction |
| four real runs | Pass |
| Vanni 60 discrepancy classified | **Pass in Phase 7.2B: scientific artifact difference outside lifecycle** |
| Phase 7.2 complete | **Yes — CLOSED by Phase 7.2B** |

## 28. Roadmap progress

No weight was invented. Completion remains **29.5%**.

## 29. Remaining limitations

- Current Vanni 60 inference differs from the canonical artifact; Phase 7.2B
  proves this begins in scientific artifact generation, formally assigns it
  outside runtime lifecycle, and closes Phase 7.2 without scientific tuning.
  Its permanent classification is **“Scientific artifact-generation
  difference,”** not **“Runtime lifecycle.”** Future scientific investigation
  does not reopen Phase 7.2.
- ETA history is not retained, so aggregate MAE is not yet defensible.
- Bounded polling is used rather than Realtime; it meets automatic-update needs
  without broadening table read privileges.
- LaunchAgent support is macOS-local; deployment supervision remains an
  environment-specific concern.

## 30. Git status and agent handoff provenance

The worktree was heavily dirty before this phase. No commit or push occurred.

- **Prior architecture inherited:** Postgres queue, claim/lease/heartbeat RPCs,
  deterministic working-analysis identity, MediaPipe runner, artifact upload,
  atomic completion, status polling, and Phase 7.0/7.1 evidence contracts.
- **Prior findings independently verified:** lease ownership, artifact path
  identity, current-working pointer selection, three canonical frequencies, and
  Phase 6.1–7.1 deterministic suites.
- **Findings corrected/disproved:** Vanni 240 was not missing/corrupt; it was
  schema-incompatible. The standalone alias issue was operationally relevant,
  not merely cosmetic. Retry progress was not reset. Current Vanni 60 real
  inference does not reproduce the documented canonical frequency.
- **Code changed by this agent:** exactly Section 18.
- **Tests added by this agent:** 24-check Phase 7.2 suite and three lease-progress
  assertions; existing progress expectations updated for real work.
- **Real runs performed by this agent:** four benchmark jobs, plus two Vanni 60
  repeat attempts (one safe failure exposing retry state, one corrected run).
- **Not personally validated:** authenticated browser rendering, cross-platform
  supervisors, deployment orchestration, long-term ETA accuracy, or the cause of
  the Vanni 60 scientific delta.

## 31. Separate future scientific scope

Phase 7.2 is permanently closed. A future scientific task may run a read-only Vanni 60 artifact-generation bisect across
the already-present tracker/crop/pose revisions between the canonical Phase 4.2K
artifact and current source. Identify the first inference boundary producing
the additional invalid/frozen frames (current: 27 invalid + 29 frozen versus
canonical: 6 + 17). Do not tune contacts or restore the old number by target.
This is not a remaining runtime closure condition; it must not tune contacts or
metrics toward a historical value and must not reopen runtime ownership, queue
management, worker lifecycle, Dashboard state, or Phase 7.2.
