# AVA Sprint production-readiness audit

Audit date: 2026-07-16

## Prompt 15B scientific validation update — 2026-07-18

The scientific decision is **NO-GO for athlete-facing scientific claims**. A versioned
metric registry, governed dataset manifest, reproducible agreement/detection statistics,
language audit, visibility rules and launch gates now exist. The only real governed fixture
is quarantined because it is experimental 30 FPS, has unknown validation consent and lacks
compatible timing-boundary definitions. No locked reference, coach review, athlete
comprehension, cross-device or confidence-calibration study exists. See
[scientific-validation-readiness-audit.md](./scientific-validation-readiness-audit.md).

## Prompt 15A operational update — 2026-07-18

The evidence-based closed-beta decision is **NO-GO**. CI, a non-root worker image,
production-like environment validation, redaction, closed-beta policy contracts and
integrity tests were added. No isolated staging/beta deployment, managed secrets,
distributed abuse control, live telemetry/alerts, restore/rollback rehearsal, signed native
device evidence or professional policy review exists. See
[production-readiness-audit-15a.md](./production-readiness-audit-15a.md).

## 2026-07-18 longitudinal training update

The deterministic Training Program foundation now includes a side-effect-free 14C
longitudinal vertical slice: typed replayable events, immutable state, thresholded coaching
memory, comparability, session quality, adaptation/fatigue/progression evaluation, bounded
two-to-six-week draft mesocycles, immutable patch contracts, scoped change impact, plan
comparison, and stale offline-plan controls. Normal and acute-pain fixtures pass.

This is architecture and fixture validation, not production readiness. Persistence, RLS,
coach workflow, clinician review, real iOS integration, professional rule review, field
validation, observability, and longitudinal scale testing remain release blockers.

The identical-prompt hardening pass also added checkpoint idempotency, future event-version
quarantine, tolerance/effectiveness evaluation, structured seasons, interruption/reentry,
linked planning manifests, and audit projections. This does not change the production
conclusion.

This audit is subordinate to the canonical [AVA Accuracy Manifesto](./accuracy-manifesto.md).
Production readiness requires compliance with every principle in that document.

## Release conclusion

AVA is a substantial, coherent **Next.js web application**, but it is not yet an iOS
application and is not ready for App Store submission. The biomechanics, calibration,
coaching, and premium web UI should be preserved. A native iOS shell/client and an
production deployment of the new analysis worker is still required; those are
release-program decisions, not reasons to rewrite the working domain code.

The immediate code blocker is analysis-clock inconsistency. Source FPS is preserved in
the schema, but the production worker analyzes every decoded source frame at the source
rate. Several UI and recommendation paths then treat 120/240 FPS as a separate, more
trusted calculation path. That conflicts with the required validated 60 FPS production
framework. Experimental RTMPose is correctly visual-only and must remain excluded from
production metric calculations.

The worktree contained pre-existing, uncommitted recommendation, exercise, progress,
session-plan, evidence, and overlay work at audit start. It is user-owned and must not be
overwritten.

## Component audit

| Component                         | Exists  | Readiness                                  | Keep / replace                                                        | Dependencies and debt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------- | ------- | ------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture                      | Yes     | Partial                                    | Keep domain modules and server boundaries                             | Next.js 15/React 19/Supabase web stack. No Xcode project, Swift client, native capture, entitlements, privacy manifest, StoreKit, App Store metadata, or mobile CI. A deliberate native/container strategy is required.                                                                                                                                                                                                                                                                                                               |
| Analysis pipeline                 | Yes     | Partial                                    | Keep structure; harden orchestration                                  | Upload → session → queued analysis → polling worker → pose → metrics → authenticated callback. Worker is explicitly dev-only, polling is process-local, retry state has no attempt count/backoff/dead-letter/lease timeout, and callback updates analysis/session non-transactionally.                                                                                                                                                                                                                                                |
| Database schema                   | Yes     | Good foundation                            | Keep; migrate incrementally                                           | 16 ordered SQL migrations, typed client, ownership chain, RLS, calibration, benchmarks, modes, pose selection. JSON metrics are weakly versioned; no durable analysis input/provenance snapshot, retry fields, audit log, retention policy, or normalized recommendation result. Some nullable mode changes are not reflected by the original enum intent.                                                                                                                                                                            |
| Video processing                  | Yes     | Partial                                    | Keep storage and overlay; replace mock/default production assumptions | Private original-video bucket and signed URLs exist. Upload stores the original object. Metadata columns exist, but browser upload does not extract them and the real worker does not populate them despite migration comments. `DefaultMetadataExtractor` and `FrameExtractor` are planning mocks, not production decoders. Orphaned storage objects remain when session insert fails. No upload size/duration/codec validation or resumable upload.                                                                                 |
| 60 FPS framework                  | Partial | Blocking                                   | Centralize and enforce                                                | `normalizeFps` only snaps metadata near 60/120/240 and overlay timing can be overridden. The pose runner processes every source frame and reports source FPS. High-speed footage therefore enters metric math at 120/240. Existing precision logic explicitly unlocks calculations at 120+, contrary to the release standard. Original FPS column exists and should remain provenance; add explicit analysis FPS/model provenance.                                                                                                    |
| Pose engine                       | Yes     | Partial                                    | Keep MediaPipe primary; keep RTMPose non-production                   | MediaPipe heavy model with ROI tracking is the primary engine. Python runtime downloads its model on first use, has a fixed 120-second timeout, and depends on local Python/OpenCV/MediaPipe. Model availability, deterministic image/runtime, resource limits, observability, and production hosting are unresolved. RTMPose is correctly attached only as a visual comparison, but its selector is user-visible experimental scope. Mock backend remains the default in generic `processVideo`; callers must inject a real backend. |
| Biomechanics engine               | Yes     | Partial / validation-limited               | Keep algorithms; do not claim clinical validation                     | Foot-contact detection, step/stride segmentation, angles, calibration, camera compensation, acceleration metrics, and benchmark scripts exist. Much validation is synthetic or one-off script based. Event thresholds and ROI tuning are footage-specific; no automated golden-video regression suite is wired to CI.                                                                                                                                                                                                                 |
| Metric engine                     | Yes     | Partial                                    | Keep trusted/calibrated path; retire placeholder persistence          | Rich calibrated measurements exist in the page/benchmark layer. The persisted fly callback still stores `topSpeedMps` and `avgStrideLengthM` as numeric zero placeholders, which can leak into history/scoring. Missing values should be nullable/availability-tagged rather than fabricated zeros. Metric provenance, confidence, analysis FPS, and warnings are not persisted in the callback schema.                                                                                                                               |
| Reasoning chain                   | Partial | Blocking for explainability contract       | Consolidate, do not duplicate                                         | Measurements, limiting factors, explanations, evidence, exercises, confidence, session plans, and retest goals exist across multiple engines. The exact chain is not represented by one versioned result type. Associated muscle groups are not explicit. There are two overlapping coaching/recommendation stacks (`lib/coaching` and `lib/intelligence`), with inconsistent thresholds and trust rules. The newer intelligence path is more complete and 60-FPS-aware; consolidation should be incremental.                         |
| UI architecture                   | Yes     | Web-production quality with gaps           | Keep premium AVA design system                                        | App Router server pages, focused client video components, and shared AVA primitives are coherent. Session page is very large and performs extensive derivation during render. Accessibility/device testing, error boundaries, loading states, mobile safe areas, offline behavior, and native interaction testing are incomplete. One existing exhaustive-deps warning remains in `VideoOverlay`.                                                                                                                                     |
| History                           | Yes     | Partial                                    | Keep queries and pure trend helpers                                   | Athlete/session lists and derived trends exist. History is reconstructed from current code and JSON metrics rather than immutable versioned reports, so results can change when algorithms change. Placeholder zeros and mixed FPS/model versions can contaminate longitudinal comparisons.                                                                                                                                                                                                                                           |
| Authentication                    | Yes     | Good web foundation                        | Keep Supabase Auth/RLS                                                | Email/password, signup confirmation handling, cookie refresh middleware, ownership RLS, and server/client/service separation exist. Production needs rate-limit/abuse review, password/reset UX verification, account deletion/export, privacy consent, session/device testing, and native deep-link/OAuth configuration.                                                                                                                                                                                                             |
| Storage                           | Yes     | Good foundation / operationally incomplete | Keep private buckets and RLS                                          | Original videos and pose artifacts are private and athlete-scoped. Missing lifecycle/retention policy, quota enforcement, cleanup of pose artifacts on rerun/delete, orphan reconciliation, regional/privacy review, and upload recovery. Deleting a session removes only the video explicitly; pose artifacts depend on DB cascade but storage objects do not cascade.                                                                                                                                                               |
| Mock implementations              | Yes     | Dev-only                                   | Retain only behind explicit development entry points                  | Mock pose backend, mock worker, default metadata/frame extractors, seed data, and numerous sanity scripts are useful development tools. Generic `processVideo` defaults to mock, creating accidental production-use risk. Production builds should fail closed without a real backend.                                                                                                                                                                                                                                                |
| Broken/incomplete implementations | Yes     | Blocking in selected paths                 | Fix narrowly                                                          | No native iOS target; no production worker; source-rate analysis violates 60 FPS mandate; metadata is not populated; zero metric placeholders; reasoning chain lacks explicit muscles and a single result contract; old/new recommendation engines overlap; no real test runner/CI gate; build/lint rely on deprecated `next lint`; upload rollback is missing. README still describes the worker as dev-only and placeholders accurately.                                                                                            |

## Baseline verification

- `npm run typecheck`: passes.
- `npm run lint`: passes with one existing `react-hooks/exhaustive-deps` warning in
  `VideoOverlay.tsx`; `next lint` is deprecated before Next.js 16.
- `npm run build`: executed as part of this audit; final status is recorded in the
  completion notes for this pass.
- The repository has many purpose-built sanity scripts but no unified unit/integration
  test runner or CI workflow.

## Prioritized implementation checklist

### Critical

- [x] Enforce one `60 FPS` production analysis clock in the real MediaPipe worker:
      preserve original media and
      detected FPS, deterministically sample high-speed sources to 60 FPS before pose/metric
      derivation, and never route RTMPose/high-speed experimental math into persisted metrics.
- [x] Persist analysis provenance: original FPS, analysis FPS (=60), model/version,
      warnings/confidence, and enough input metadata to reproduce a result.
- [x] Replace the dev polling worker with a deployable, monitored job runtime with
      idempotent claims, leases/timeouts, bounded retries, dead-letter handling, and packaged
      pose models/dependencies.
- [ ] Choose and build the iOS delivery architecture (native SwiftUI client or approved
      native container), including capture/upload, authentication deep links, privacy
      manifest/permissions, account deletion, signing, TestFlight, and App Store assets.
- [x] Define one versioned explainable-analysis contract that can represent:
      measurement → limitation → likely movement cause → associated muscle groups → evidence
      confidence → intervention → retest. The contract withholds unimplemented downstream
      links rather than fabricating them; the full intelligence population remains future work.
- [x] Stop persisting unavailable metrics as numeric zero and prevent mixed model/FPS
      histories from being compared as equivalent.

### High

- [ ] Populate and validate video metadata at ingestion/worker claim; enforce supported
      codec, minimum capture FPS, duration, dimensions, and size before queueing.
- [x] Make completion updates atomic/idempotent and add retry/lease fields plus stale-job
      recovery.
- [ ] Add storage cleanup for failed uploads, deleted/rerun pose artifacts, retention,
      quotas, and orphan reconciliation.
- [ ] Establish golden-video regression fixtures and CI gates for event detection,
      measurements, confidence, recommendation chain, schema, typecheck, lint, and build.
- [ ] Consolidate the old coaching engine into the trusted intelligence path without
      changing working UI behavior; centralize thresholds and definitions.
- [ ] Complete privacy, security, abuse/rate-limit, data export/deletion, and App Store
      health/fitness claim review.

### Medium

- [ ] Split the oversized session-page orchestration into typed selectors/services while
      preserving the current design.
- [ ] Add error/loading boundaries, upload progress/recovery, resumable uploads, mobile
      accessibility, safe-area, and real-device test coverage.
- [ ] Persist immutable/versioned report snapshots for trustworthy history and retests.
- [ ] Replace `next lint` with ESLint CLI and resolve the overlay hook warning.
- [x] Add worker health endpoints, structured logs, queue/latency/error metrics, and
      user-safe failure messages. Hosted dashboards and alert routing remain deployment
      configuration.

### Low

- [ ] Remove stale comments and obsolete day-number terminology after behavior stabilizes.
- [ ] Archive unused panels/engines only after call-site and analytics confirmation.
- [ ] Optimize large artifacts and overlay rendering after correctness profiling.

## Earlier internal implementation plan: 60 FPS and result foundation

Only the first code blocker is in scope for this pass:

1. Introduce a single constant and pure sampling planner for the validated 60 FPS
   analysis timeline, with tests for 60/120/240 and non-integer source rates.
2. Apply that planner in the real MediaPipe runner so high-speed source frames are
   actually sampled, not merely relabeled. Preserve source frame indices and source
   metadata while emitting a 60 FPS analysis sequence.
3. Probe/persist original video metadata in the worker and pass the explicit 60 FPS
   analysis target. Fail closed for sources below the minimum usable capture rate rather
   than inventing frames.
4. Add result provenance fields via a migration and callback validation without changing
   current metric math or UI design.
5. Update focused sanity coverage and run typecheck, lint, build, and relevant analysis/FPS
   scripts. Do not attempt the native iOS client or production job infrastructure without
   an explicit architecture/deployment decision.

## Internal implementation plan: production worker pass

1. Preserve the existing MediaPipe/60 FPS biomechanics path and replace only its unsafe
   polling/orchestration boundary.
2. Add a private durable job state machine and transactional RPCs for claims, leases,
   heartbeats, stages, retry/dead-letter transitions, operator recovery, and completion.
3. Make workers stateless and horizontally safe, with deterministic artifacts, isolated
   temporary storage, resource limits, graceful shutdown, and failure classification.
4. Package the exact runtime and pose model in a reproducible container; fail readiness
   when configuration, storage/database access, Python imports, or the model are absent.
5. Expose redacted structured telemetry and safe athlete-facing stages, then prove claims,
   recovery, retry exhaustion, idempotence, packaging, startup, and application builds.

## Completed in this pass

- Added isolated `ava-sprint-30-experimental-v1` processing without changing validated
  `ava-sprint-60-v1` sampling or compatibility. Native-30 frames and timestamps remain real.
- Added migration `0023_experimental_30fps_foundation.sql`, source-tier/version provenance,
  explicit compatibility groups, immutable experimental results, uncertainty/status fields,
  and a separate atomic experimental completion RPC.
- Added one premium Experimental banner and provenance label. Validated history comparisons,
  PB prediction, goal gaps, benchmarks, and recommendations fail closed for this profile.
- Completed the real native-30 panning fixture on attempt one as `smooth_pan`; timing,
  length, velocity, contact/flight, and frequency remained null when calibration or event
  confidence was insufficient.
- Confirmed the final nominal-60 static control remains `static_precision` with unchanged
  camera/tracking confidence, zoom classification, and spatial eligibility.

- Measured every timestamp in the protected panning source. Its 196 intervals are a stable
  33.333–33.334 ms distribution on a 1/600 time base, yielding 30.00000153 FPS with no
  duplicate timestamps, dropped-frame gaps, repeated pictures, or VFR evidence.
- Confirmed the worker did not reject on a rounded metadata field alone: average, nominal,
  real, and timestamp-derived evidence all prove true 30 FPS CFR. Nominal-60 promotion ran
  and correctly failed with `source_fps_below_minimum`.
- Retained the centralized 59.0 FPS nominal-60 production floor. No global threshold or
  production eligibility changed because one visually clean 30 FPS recording does not
  validate lower-rate sprint timing or biomechanics.
- Extended the protected manifest and inspector with reproducible timestamp-distribution,
  duplicate/drop, time-base, and true-capture-class evidence. Added fail-closed regressions
  for true 30, true 50, malformed metadata, and nominal/timestamp disagreement.

- Identified and registered the newly uploaded real side-view panning fixture without
  copying private video into the repository. Its external 2.77-second value is stored as
  incomplete, non-comparable evidence with distance and boundaries explicitly null.
- Proved the source is constant 30 FPS (197 frames, 6.566667 s, nominal and average 30/1),
  so the production worker's permanent `source_fps_below_minimum` rejection is correct. No
  capture-policy bypass, fabricated panning result, or fixture-specific tuning was added.
- Added a typed external-reference/fixture contract, service-only validation registry,
  protected manifest, manual annotations, private contact-sheet artifact, and dedicated
  inspection/preservation/schema checks.
- Reprocessed the trusted static fixture after the final code state. It completed on its
  first attempt as `static_precision` with unchanged camera/tracking confidence, zoom,
  unsafe ranges, source-rate handling, and spatial eligibility.
- At the production-only stage, panning remained 65% and overall MVP 73% because the source
  could not enter validated biomechanics. The later isolated experimental profile supersedes
  those interim percentages without changing validated eligibility. See
  [Real-world panning validation](./panning-real-world-validation.md).

- Audited existing camera compensation, display follow, MediaPipe ROI cropping, calibration,
  recording quality, trust, persistence, and tests before implementing panning changes.
- Added background-feature partial-affine evidence with athlete masking, RANSAC inlier
  support, residuals, translation, rotation, and scale-change estimates.
- Persisted source bounding boxes, deterministic detection crops, crop confidence, mapping
  provenance, tracking-loss ranges, and camera instability ranges without changing source
  video or overlay coordinates.
- Added the versioned `ava-recording-mode-v1` classifier and a central analytical trust
  policy. Absolute spatial metrics are withheld for panning until ground calibration under
  motion is validated; technique geometry can remain available with reliable tracking.
- Added additive migration `0021_panning_analysis_foundation.sql` and a user-safe recording
  assessment label in the existing premium recording-quality panel.
- Confirmed a real 59.x FPS recording completes through the production worker and persists
  its independent classification. The local fixture classified as `static_precision`; no
  genuine supported panning fixture is available locally, so real panning end-to-end
  validation remains open and panning support is not declared complete.

- Added a shared validated analysis-rate constant and deterministic source-frame planner.
- Changed the real worker to request 60 FPS for every production biomechanics run.
- Changed the MediaPipe runtime to sample 60/120/240 FPS sources onto a true 60 Hz
  timeline; it no longer relabels high-speed frames. The original stored video is unchanged.
- Added a fail-closed capture gate for source footage below the validated 60 FPS tolerance.
- Kept RTMPose visual-only and excluded from the metric source.
- Added focused 60/120/240 sampling sanity coverage.
- Verified typecheck and lint; the one pre-existing overlay hook warning and deprecated
  `next lint` command remain documented technical debt.

## Intelligence orchestration hardening — 2026-07-18

- Audited the central registry, dependency semantics, cache policies, snapshot patterns,
  production worker lifecycle, feature flags, UI security, and RLS conventions before
  implementation. Findings are in `docs/intelligence-orchestration-audit.md`.
- Added registry-derived validated execution plans, parallel DAG stages, execution
  context and engine-adapter contracts without modifying any intelligence engine.
- Added queue-neutral worker execution, deterministic retry classification, progress,
  downstream invalidation, cache-hit execution, trace, restart and idempotency primitives.
- Added migration `0047_intelligence_orchestration.sql` for plans, jobs, traces, retries,
  invalidations, audits, immutable pipeline manifests and transactional
  activation/rollback. Mutation remains service-role only.
- Added the feature-gated, owner-scoped `/admin/orchestration` cached telemetry view.
- Live orchestration remains disabled and shadow mode remains enabled until all thirteen
  engine adapters and pipeline-manifest consumer cutovers are validated.
- Focused orchestration coverage, all registered intelligence sanity suites, typecheck,
  lint and production build pass. The pre-existing `VideoOverlay` warning remains.
- Added migration `0017_analysis_result_foundation.sql`, immutable queue-time input
  snapshots, validated production provenance, and the central explainability v1 contract.
- New fly analyses persist unavailable metric values as null with explicit status/reason
  envelopes in the canonical result payload. Legacy rows remain readable and labeled.
- Added weakest-link confidence propagation and strict reference validation. Muscle
  associations require diagnostic disclaimers and cannot be emitted as diagnoses.
- Added migration `0018_production_analysis_jobs.sql` with a durable queue, atomic
  `SKIP LOCKED` claims, claim tokens, leases, heartbeats, bounded retry/backoff,
  dead-lettering, stale-worker rejection, and service-only operator recovery.
- Replaced HTTP callback completion in production with one transactional, provenance-
  validating database completion RPC. Duplicate completion is idempotent.
- Added safe athlete-visible job stages while keeping internal errors, tokens, worker IDs,
  storage paths, and infrastructure details service-only.
- Added resource validation, isolated temporary workspaces, deterministic artifact paths,
  startup cleanup, graceful shutdown, structured redacted logs, health/readiness, and
  queue/latency/failure metrics.
- Added a reproducible Linux worker image with pinned cross-platform Python dependencies
  and a build-time checksum-verified MediaPipe heavy model; container configuration startup
  passed on Linux ARM64.
- Applied migrations locally and passed real concurrent-claim, lease recovery, stale-token,
  retry, dead-letter, atomic completion, and idempotent-completion integration tests.
- Fixed the worker's compiled-module loader contract: `src/lib` is now the explicit compiler
  root and one generic loader resolves source-root-relative emitted modules. `worker:check`
  compiles and loads the complete runtime before succeeding. A full local worker start
  initialized MediaPipe, reached ready, claimed a queued fixture, and entered processing
  with no `MODULE_NOT_FOUND`; the non-media fixture then failed the expected FPS gate.
- Centralized the 60 FPS capture-class policy at a 59.0 FPS metadata floor with a
  conservative timestamp-plus-metadata exception for nominal-60 VFR footage. Nominal-60
  inputs preserve real frames/timestamps; only high-speed inputs sample to 60 Hz.
- Migration `0019_source_fps_classification.sql` persists the exact source FPS, rate
  evidence, VFR flag, and nominal/high-speed classification. Unsupported footage receives
  the safe rerecording instruction and produces no result metrics.
- Reran the previously rejected source. Its exact detected rate was
  `59.15864276221215`, it persisted as `validated_60_fps_class` with `analysis_fps=60`,
  and the analysis completed successfully with 142 real source frames.
- Added `CONSERVATIVE_TIMING_POLICY_V1`: raw timing remains immutable, official time
  ceilings to the next hundredth with a floating-point epsilon, and official zone/stride/
  segment velocity divides distance by reported time. Raw/reported snapshots and policy
  versioning are added by migration `0020_conservative_timing_policy.sql`; legacy results
  remain unchanged and are labeled `legacy_unversioned`.
- Built the permanent session analysis workspace. Completed analyses no longer hide the
  source video, and overlay availability no longer depends on metrics-schema parsing.
- Added immutable per-session analysis versions with transaction-safe numbering, parent
  linkage, workspace snapshots, lightweight history selection, and per-artifact caching.
- Calibration and timing-workspace saves now reuse the original media and queue a new
  analysis version instead of presenting edited session state as an old result.
- Verified a protected real session across five versions: its original video remained
  signable/range-readable and the selected private pose artifact loaded 197 overlay frames.
- Passed workspace sanity/integration, typecheck, lint, and production build. Existing
  overlay-hook, Next.js lint deprecation, and Supabase Edge Runtime warnings remain debt.
- Replaced panning timing-zone authority with versioned ground anchors in immutable source
  and camera-compensated coordinates. Production previous→current partial-affine evidence
  now propagates complete line geometry; crop, viewport, and auto-follow are excluded.
- Added fail-closed signed-plane crossing with real timestamps, interpolation, transform
  confidence, feature support, residual, and unsafe-range checks. No screen-fixed timing
  fallback is permitted for v1 ground anchors.
- Validated the protected real 30 m fixture across ten manually annotated frames: 7.60 px
  mean midpoint error, 15.26 px maximum stable setup offset, 0.93° maximum angular error,
  and safe start/finish crossing brackets. Analysis V7 completed without changing the
  original video path. The external 2.77 value remains intentionally unvalidated.
- Removed the warped connected timing-zone surface. Production review now renders only
  two independently propagated rigid gate segments, each naturally entering/leaving the
  viewport. The 30 m relationship is metadata and no polygon containment enters timing.
- Added independent-gate contract aliases and migration 0028 while retaining legacy v1
  gate readability and immutable historical snapshots.
- The expanded real-fixture strip proves none/start/none/finish visibility across the pan
  with no connection. Independent drift ranges are 0.70 px start and 0.45 px finish.
- Reran the trusted static control as Analysis V15; recording class, camera/tracking
  confidence, zoom, FPS clocks, and spatial eligibility exactly matched its predecessor.
- Completed the immutable V1 real-30m experimental timing path. Three identical runs
  persisted the same interpolated start/finish evidence, raw/reported time and velocity,
  decomposed uncertainty, external-reference caveat, and deterministic hash `237392ec`.
- Added migrations 0029/0030 for queryable timing summaries and a JSON-null-safe envelope
  constraint. Added the experimental timing card and an exact-pose crossing review strip.
- Reran trusted static V16 after the final timing code: deterministic result content and
  metrics matched V15, analysis stayed validated at 60 FPS, and no experimental badge or
  connected timing polygon appeared.
- Passed the dedicated real-30m sanity/integration gates, required analysis regressions,
  typecheck, lint (one pre-existing hook warning), and production build.

## Orchestration production integration — 2026-07-18

- Added explicit adapter states for all 13 registered engines: 11 thin callable adapters
  and fail-closed deferred Research and Benchmark adapters.
- Added the trusted-server database store, forward-only migration 0048, immutable staged
  payloads, integrity-bearing manifests, guarded transition/retry/activation/recovery
  RPCs, telemetry, rollout gate, and centralized compatibility resolver.
- Migrated Root Cause, RCI Adapter and Performance Optimization dashboards to controlled
  manifest reads. Default reads remain legacy-only and execution remains OFF.
- Clean migrations 0001–0052 applied locally, and the SQL integration fixture passed
  claim exclusivity, heartbeat, staging, activation, owner isolation, idempotency and
  unauthorized-mutation and two-manifest rollback checks. Live ACL inspection exposed and migration 0049 fixed
  Supabase direct client grants on mutation RPCs. Concurrent multi-connection claims and
  a true simultaneous multi-connection claim race still requires dedicated coverage.

### Operational shadow hardening

- Added a non-authoritative shadow coordinator, explicit shadow-manifest persistence,
  centralized authoritative baseline metadata and engine-aware equivalence policies.
- Added immutable comparison reports, exact-version replay planning, guarded
  test/development failure injection, dead-letter contracts, deterministic health,
  cutover gates and bounded internal-cohort rules.
- Migration 0051 adds operational histories and owner-scoped dashboard summaries;
  migration 0052 corrects local Postgres JSON staged-count compatibility. The expanded
  SQL fixture proves shadow manifests/reports never change the active pointer.
- A local simulation built 100 plans and drained 500 jobs through eight workers with no
  duplicate claims. This is not database pressure or production-scale evidence.
- Manifest authority remains blocked: no real-athlete shadow runs, Research/Benchmark
  adapters remain deferred, fixture-level parity is incomplete, and production
  concurrency/deployment have not been proven.

## Native iOS foundation — 2026-07-18

- Added an iOS 17 SwiftUI project and portable Swift package under `ios/AVASprint`,
  with Debug, Staging, and Release configuration examples, placeholder bundle/team
  identity, privacy manifest, permission text, URL scheme, and entitlements.
- Added protocol-backed authentication/session refresh, Keychain storage, typed
  URLSession transport, upload/media state, analysis/status contracts, strict active-
  manifest validation, account-scoped protected offline storage, bounded sync, safe
  routing, logging, diagnostics, feature flags, capture/import metadata foundations,
  and a fixture-capable vertical-slice coordinator.
- Added canonical mobile v1 fixtures and a cross-language drift gate. The intended
  `/api/mobile/v1` boundary is documented but not deployed; upload, authentication,
  orchestration status, and report integration are therefore fixture/scaffolding work,
  not staging-proven live flows.
- Added seven passing Swift state/contract tests. Full Xcode app/simulator/UI/static-
  analysis validation and physical-device camera/background-upload testing are blocked
  because this host currently selects Command Line Tools rather than a full Xcode
  installation. No Apple developer team, signing identity, APNs setup, archive, or
  TestFlight distribution is configured.
- The native client contains no pose, biomechanics, coaching, recommendation, snapshot
  activation, or orchestration mutation logic. Staged, shadow, non-authoritative,
  incompatible, cross-athlete, incomplete, and invalid-integrity manifests fail closed.

### Native capture/upload hardening

- Added runtime rear-camera capability inventory and deterministic, configuration-driven
  60-FPS-first format selection without silent low-FPS fallback.
- Added a versioned side-view protocol, separate requested/verified media contracts,
  reason-coded recording suitability, streaming SHA-256, duplicate detection, protected
  account media storage, orphan discovery and storage-pressure gates. Targeted AVAsset
  timestamp sampling plus codec/transformed-orientation extraction are implemented but
  still require a full Xcode compile and physical-device validation.
- Added file-backed background URLSession scaffolding, network/retry policy and explicit
  local/OS/server reconciliation. Persisted task mapping and a live Supabase-compatible
  resumable upload API remain blockers; termination behavior is not device-proven.
- Added validated atomic offline result packages and conflict rules that preserve the
  previous complete package when a replacement is partial, invalid or rolled back.
- Portable Swift coverage expanded to 13 tests. Xcode, simulator, physical-device,
  staging, signing, archive and TestFlight validation remain unavailable.

### Native beta presentation foundation

- Replaced the five-tab native placeholder content with snapshot-driven Home, analysis
  history, Progress, Coaching and Profile empty/data states plus a structured Coach Report.
- Added a bounded, versioned mobile beta package covering report, observations, root-cause
  hypotheses, recommendations, optimization, coaching state, benchmark, projection,
  Digital Twin, progress, evidence and confidence. A TypeScript mobile boundary and Swift
  DTOs avoid exposing raw engine persistence contracts.
- Enforced single-manifest/analysis/athlete scope, HTTPS evidence links, preserved
  recommendation ordering, explicit confidence/unknowns, non-diagnostic muscle language,
  non-guaranteed projections, closed feature flags, bounded feedback and metadata-only
  telemetry. The complete beta payload can commit inside the existing atomic offline package.
- Portable Swift coverage expanded to 17 passing tests. Native SwiftUI compilation,
  snapshot/UI/accessibility/layout testing, live API data, device performance, sharing,
  feedback submission, archive and TestFlight remain blocked and are not claimed.

## Training Program Intelligence foundation — 2026-07-18

- Preserved the existing single-session workout helper and added a separate deterministic,
  server-authoritative Training Program Intelligence v1 boundary.
- Added versioned athlete/context/readiness/restriction/objective/catalog/dosage/session/
  exposure/load/validation/lifecycle/snapshot contracts; an internal Engine Registry entry
  and executable orchestration adapter; and a scoped, idempotent server service.
- Added fail-closed eligibility, objective cycle/missing-dependency checks, authority-aware
  restrictions, pain/readiness decisions, bounded weekly scheduling, catalog-only exercise
  selection, competition protection, recovery/duration/exposure validation, deterministic
  fingerprints, explanations, provenance and draft-only approval state.
- A controlled adult 100 m fixture generates one seven-day non-authoritative microcycle
  with two key days, low-intensity/recovery support and a protected preparation meet.
  It is architecture validation, not a universally safe or coach-approved prescription.
- No database migration, HTTP route, real athlete input, coach/clinician review, shadow run,
  approved-plan pointer, UI or production rollout exists. Athlete-facing programming remains
  disabled.

### Sprint catalog and coach-reviewable microcycle foundation

- Expanded the governed Training Program catalog from six controlled entries to more than
  forty sprint, plyometric, strength/power, mobility and recovery entries, with advanced
  methods explicitly feature gated.
- Added nine versioned block-based session templates and a deterministic Session Builder
  that filters by upstream objective, readiness/restrictions, facility, equipment, training
  age, feature gates and recent usage while preserving selection alternatives/provenance.
- Generalized the seven-day generator for three-to-six available training days with explicit
  rest, key-day spacing, maintenance/recovery and competition protection.
- Added event-driven progression/regression decisions, immutable plan revisions, typed
  adherence events and change-impact classification. Progression requires repeated quality
  completion, readiness and coach approval; it is never calendar-only.
- These remain fixture-validated internal drafts. Catalog breadth and deterministic code do
  not establish safe dosage, coaching efficacy or production readiness.
