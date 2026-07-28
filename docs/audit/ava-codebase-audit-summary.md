# AVA Sprint master codebase audit

Audit date: 2026-07-18  
Branch: `day-25`  
Baseline commit: `2c55e92c2d1a6ee10881fb59ec475772747ce276`  
Decision: **NO-GO for closed beta, athlete beta, App Store, or public production**

## Executive conclusion

AVA is no longer merely a web prototype. The repository contains a working Next.js coach
application, a production-shaped MediaPipe worker, 52 ordered Supabase migrations, a native
iOS project and portable Swift package, and extensive deterministic domain engines. The
repository builds and its selected sanity suites pass.

That is not equivalent to a connected, validated product. The default production switches
leave intelligence orchestration and both training modes disabled. Training is fixture-only
and has no durable plan/event store. The native API described by the iOS contracts does not
exist in the Next.js route tree. The iOS project has placeholder bundle identifiers, no
signing team, no archive/TestFlight/device evidence, and only portable package tests.
Scientific validation has no eligible 60/120/240 FPS reference cohort. No isolated deployed
beta environment, managed secrets, distributed admission control, centralized telemetry,
backup restore, rollback rehearsal, or operational deletion proof exists.

The shortest safe next implementation batch is therefore not another intelligence feature.
It is an isolated staging vertical slice: deploy the existing web/worker/database stack,
implement the versioned native API against activated snapshots, connect one authorized
capture → upload → analysis → report path, and prove it on a physical device while retaining
coach-only language and hidden unvalidated outputs.

## Evidence classification

| State | Meaning in this audit |
| --- | --- |
| Exists | Source, schema, contract, or UI is present |
| Runs | It compiled or executed locally |
| Connected | Its real producer and consumer use the same durable contract |
| Tested | An automated test covers the stated boundary |
| Validated | Appropriate real reference evidence supports correctness |
| Launch ready | Deployment, operations, security, privacy, and user workflow evidence exist |

Passing a fixture sanity script earns “runs/tested,” never scientific or launch readiness.

## Current system

```text
Coach browser
  -> Supabase Auth/RLS
  -> Next.js server actions
  -> private original-video storage
  -> sessions + analyses + durable analysis_jobs
  -> MediaPipe worker (ffprobe + Python pose)
  -> atomic completion RPC + pose artifact
  -> session derivation / report engines
  -> optional legacy or manifest intelligence

Native SwiftUI project
  -> capture/import + local protected media + upload/offline contracts
  -X-> no implemented /api/mobile/v1 provider

TrainingProgram + longitudinal engines
  -> deterministic fixture-tested drafts/events
  -X-> no durable authorized plan service or native execution workflow
```

## Major findings

1. **Dirty-worktree risk:** the audited product is mostly uncommitted. Sixty-two tracked
   files are modified and hundreds of implementation/doc files are untracked. Reproducible
   CI and review cannot be claimed until this surface is intentionally committed.
2. **Core analysis is the strongest vertical:** original video retention, 60 FPS-class
   classification, deterministic high-speed sampling, MediaPipe, job leases/retries, atomic
   completion, provenance, and result activation foundations exist. Real deployed execution
   and representative golden-video validity do not.
3. **The app has multiple maturity levels behind one repository:** production-shaped core,
   internal developer workspaces, disabled/shadow intelligence, experimental 30 FPS/panning,
   and fixture-only training. Defaults expose several experimental engine flags as true even
   though orchestration and training remain off.
4. **Native is structurally real but operationally disconnected:** Xcode and SwiftUI sources
   exist, but signing, app identifiers, staging endpoints, real authentication/upload/result
   APIs, device tests, background recovery, and TestFlight are unproved.
5. **Scientific claims are the primary product-safety boundary:** deterministic behavior is
   well tested; analytical validity, coach agreement, comprehension, device robustness, and
   confidence calibration are not.
6. **Authorization has a good ownership foundation:** RLS follows coach → athlete → session
   ownership and sensitive RPCs are service-role scoped. A complete role/relationship matrix,
   negative staging tests, athlete-role semantics, and operational deletion/export remain.
7. **Training is not a product workflow:** catalog, templates, generation, safety contracts,
   revisions, adherence and longitudinal reducers exist, but there are no training tables,
   RLS policies, APIs, native execution screens, notifications, or coach approval service.
8. **Operations are documents and local contracts, not evidence:** worker container, CI,
   health models and runbooks exist. Hosting, IaC, dashboards, alerts, paging, restore and
   rollback have not been exercised.

## Completion estimates

Weighted estimates intentionally score connection, testing, validation and operations—not
file count.

| Area | Completion | Reason |
| --- | ---: | --- |
| AVA Sprint overall | **56%** | Broad implementation; critical product connections and launch evidence absent |
| Backend/core web | **72%** | Builds and core ownership/upload/analysis contracts pass locally |
| Native iOS | **38%** | Project and portable contracts exist; live API/device/release chain absent |
| Scientific validation | **18%** | Framework and fixtures exist; eligible real studies do not |
| Training system | **34%** | Rich pure engine; persistence, authorization, workflow and validation absent |
| Security readiness | **48%** | RLS/security contracts present; deployed controls and full review absent |
| Operational readiness | **31%** | Container/runbooks/CI definition exist; no managed environment evidence |
| Closed-beta readiness | **42%** | Local vertical pieces exist; deployment, device, safety and operations block |
| Public-launch readiness | **24%** | All beta blockers plus scale, policy and validation requirements |

## Release-stage decisions

| Stage | Decision | Principal blockers |
| --- | --- | --- |
| Internal developer testing | Conditional GO | Preserve current local environment and fixtures |
| Coach review of generated reports | Limited GO | Only consented data, warnings, no athlete-facing claims |
| Closed coach beta | NO-GO | No deployed isolated environment/device/operations proof |
| Athlete beta | NO-GO | Scientific, training, native, privacy and comprehension gates |
| App Store/TestFlight | NO-GO | Signing, identifiers, archive, assets, live API and device matrix |
| Public production | NO-GO | All above plus scale/security/legal/monitoring |

## Immediate implementation batch

Implement one staging-backed native vertical slice without expanding domain scope:

1. provision isolated staging Supabase, web and worker services with managed secrets;
2. apply and verify all migrations, RLS, storage policies and restore procedure;
3. implement the documented `/api/mobile/v1` authentication/upload/job/result endpoints;
4. connect the existing iOS capture/upload/result client to those endpoints;
5. run an authorized 60 FPS-class real video end to end on a physical supported iPhone;
6. verify ownership denial, retry/recovery, deletion, telemetry and safe report language;
7. retain training disabled and hide unvalidated athlete-facing metrics.

No backlog implementation was performed during this audit.
