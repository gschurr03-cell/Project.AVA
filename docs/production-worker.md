# AVA production analysis worker

The worker architecture is governed by the canonical
[AVA Accuracy Manifesto](./accuracy-manifesto.md). Operational changes must preserve raw
evidence, analytical identity, reproducibility, and fail-closed production behavior.

## Audited legacy flow

The previous worker polled `analyses.status = queued` every three seconds, conditionally
updated one analysis to `running`, streamed a signed video URL into a locally configured
Python process, uploaded a deterministic pose artifact, and called the web application
with a shared secret. A crash left `running` rows stuck indefinitely. Retry meant changing
the row back to queued, completion updated analysis and session separately, TypeScript was
compiled at process startup, Python/model availability was assumed, and local debug files
were written beneath the repository. There were no leases, heartbeats, bounds, dead-letter
state, structured telemetry, or safe stage-specific UI status.

## Production architecture

Postgres is the durable queue and transaction authority. Migration
`0018_production_analysis_jobs.sql` creates an internal `analysis_jobs` table and
service-role-only RPCs. An insert trigger creates exactly one job for every new analysis;
eligible legacy queued/running analyses are backfilled. Workers are stateless container
instances and may scale horizontally without changing analysis semantics.

The authoritative production completion path is the `complete_analysis_job` database
function, not the HTTP callback. One transaction validates claim ownership and 60 FPS /
MediaPipe provenance, then updates the analysis, session, artifacts, and job. The callback
remains for local mock compatibility and cannot accept a mock completion in production.

## Compiled module layout

The worker compiles TypeScript into `.analysis-worker-build` with `src/lib` as an explicit
compiler `rootDir`. Emitted paths therefore always mirror source-root-relative module IDs:
for example, `src/lib/biomechanics/mediapipe/index.ts` becomes
`.analysis-worker-build/biomechanics/mediapipe/index.js`. A single generic runtime loader
resolves every compiled module using that same namespace. MediaPipe, RTMPose, biomechanics
analysis, worker mapping, result contracts, acceleration metrics, and job policy were all
audited against their emitted locations.

Previously, TypeScript inferred the same common source root and emitted the `biomechanics/`
directory, but four direct `require()` calls incorrectly assumed flattened paths such as
`.analysis-worker-build/mediapipe/index.js`. The compiler output was correct and preserved;
the loader contract was fixed and the root made explicit to prevent future entry-point
changes from shifting output paths. `worker:check` now compiles and loads the modules before
reporting valid configuration, so output/loader drift is a startup-check failure.

## State machine

`queued → claimed → downloading → validating → processing → generating_results →
uploading_artifacts → completing → completed`

Transient failures enter `retry_scheduled`; permanent input failures enter `failed`;
retry exhaustion enters `dead_lettered`; operators may `cancelled` or requeue eligible
terminal jobs. Parent analysis/session statuses are synchronized by a database trigger.

## Claims, leases, and recovery

`claim_analysis_job` uses one `UPDATE` over a `SELECT … FOR UPDATE SKIP LOCKED` candidate.
It increments the attempt, assigns a unique claim token, worker identity, timestamps, and
lease. Only token/worker owners with an unexpired lease may change stages, heartbeat,
fail, or complete. Each claim also recovers expired leases: attempts below the limit are
scheduled for retry; exhausted attempts dead-letter. A stale worker cannot complete after
recovery. Completed jobs return success on duplicate completion and cannot be reclaimed.

Workers heartbeat every 30 seconds by default against a 180-second lease. SIGINT/SIGTERM
stops new claims and allows the active stage to finish; a hard termination is recovered
after lease expiry.

## Retry policy

Retryable infrastructure/network/storage/database/model-initialization errors use bounded
exponential backoff with deterministic jitter. Unsupported/corrupt media, missing input,
source FPS below the validated minimum, invalid provenance/schema/ownership, and resource
limit violations do not loop. Default maximum attempts are four. Final records preserve
code, category, stage, safe user message, attempt history summary, and whether manual
retry or user action is appropriate. Operator recovery uses service-role-only requeue and
cancel RPCs.

## Media and resource safety

Before expensive work the worker validates known size, duration, FPS, frame count, codec,
analysis mode, and video presence; decoded metadata is checked again. Defaults: 512 MiB,
60 seconds, and 14,400 source frames. Signed URLs are never logged. Temporary files live
under an isolated UUID-derived job directory, are removed in `finally`, and stale folders
are cleaned at startup. Pose artifacts use the deterministic athlete/session/analysis path
with upsert, so retries cannot create uncontrolled duplicates.

### 60 FPS capture classification

`src/lib/video/fpsPolicy.json` is the single threshold/message source consumed by the
TypeScript application and Python runtime. Detected rates from 59.0 through 60.5 are
`validated_60_fps_class`; rates above 60.5 are
`high_speed_source_normalized_to_60`; lower rates fail closed unless both real frame
timestamps and independent nominal/real metadata prove a 60 FPS-class VFR stream. One
malformed metadata field can therefore never promote true 24/30/50/55 FPS footage.

The 59.0 lower boundary was selected after rerunning the actual rejected local source:
OpenCV reported 59.15864276221215 FPS. The old Python gate was 58.5 but also required the
source value to be at least the requested 60 FPS, so ordinary fractional rates still
failed. Nominal-60 sources now retain every decoded source frame and real timestamp; no
synthetic frames are created and no automatic UI retiming replaces artifact timestamps.
High-speed sources retain original indices/timestamps while selecting frames nearest the
validated 60 Hz analysis timeline.

Where available, FFprobe contributes average rate, nominal rate, frame-count/duration
rate, frame timestamps, and VFR evidence. The exact original detected FPS, evidence,
classification, and analysis FPS are logged and persisted on the session and immutable
analysis provenance. Production images include FFmpeg/FFprobe; a runtime without FFprobe
falls back conservatively to the detected rate and cannot use the sub-59 VFR exception.

## Packaging and deployment

`Dockerfile.worker` pins Node/Python dependencies, FFmpeg, OpenCV, and MediaPipe. The
heavy pose model is downloaded during image build and verified against a pinned SHA-256;
it is never downloaded on the first production job. Image construction fails when the
model, Python imports, or worker syntax are invalid. Production never selects the mock
backend; RTMPose remains a visual-only optional comparison.

Build and run after applying migrations 0017–0018:

```bash
docker build -f Dockerfile.worker -t ava-worker:1.0.0 .
docker run --rm --env-file .env.worker -p 8080:8080 ava-worker:1.0.0
```

Required secrets are `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. All
lease, heartbeat, timeout, media-limit, temp-path, model-path, bucket, identity, health,
and log settings are documented in `.env.local.example`. Every replica must have a unique
`WORKER_ID` (hostname+PID is the fallback).

## Health and observability

`/live` checks loop responsiveness; `/ready` reports startup/runtime checks; `/metrics`
returns vendor-neutral JSON for queue depth, oldest queued age, active/completed/failed/
retry/dead-letter counts, average/p50/p95 duration, and worker heartbeat. JSON logs carry
job, analysis, session, worker, attempt, pipeline, stage, elapsed/error fields where
applicable. The logger removes URL/token/secret/profile fields.

Athlete clients cannot read the internal table. `get_analysis_job_status` checks ownership
and returns only stage, safe user message, attempt count, and update time. The UI maps
internal stages to understandable preparation, validation, tracking, result-building,
finalization, retry, and failure copy.

## Verification completed

Migration 0018 was applied to local Supabase. Real-database integration suites verified
concurrent single-owner claims, heartbeat/lease extension, expired-lease recovery, stale
worker rejection, retry scheduling, permanent failure, retry exhaustion/dead-lettering,
atomic completion, and duplicate-completion idempotence. The Linux ARM64 worker image was
built successfully and its packaged Python runtime and checksum-verified model passed the
container startup configuration check. These suites should also run as deployment CI gates;
production infrastructure, alert routing, and a staging soak test remain deployment work.

The module-layout fix was verified by starting the complete local worker. It reached ready,
initialized MediaPipe, claimed a queued integration fixture, and entered processing without
any module-resolution error. That synthetic fixture then failed closed at the expected
source-FPS media gate; it was not suitable for a successful biomechanics result.
