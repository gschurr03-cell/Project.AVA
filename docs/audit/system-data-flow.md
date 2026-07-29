# System data flow

## Implemented analysis path

1. An authenticated coach owns an athlete through `athletes.coach_id`.
2. Athlete detail validates a selected video and uploads the original to a private bucket.
3. A server action creates session and analysis records; the database creates/claims a
   durable analysis job.
4. The worker downloads the object, probes metadata, classifies FPS, rejects unsupported
   capture, and retains metadata/provenance.
5. High-speed input is sampled deterministically to 60 Hz. Nominal 60-class input uses real
   source frames/timestamps without synthetic interpolation.
6. Python MediaPipe produces pose landmarks; TypeScript maps events and metrics.
7. Artifacts are stored privately and completion is committed through an atomic RPC.
8. Session/report code reads results, applies trust/activation rules and derives coach
   presentation.

## Required reasoning path

The newer engine family can represent:

`measurement → observation/limitation → likely cause → muscle association → evidence/confidence → intervention → retest`

The chain exists across contracts and report composition, but not every result is durably
persisted as one immutable report. Legacy recommendations and render-time derivation remain
parallel sources. A missing link must withhold downstream recommendations.

## Broken/disconnected flows

| Source | Destination | Break |
| --- | --- | --- |
| iOS capture/upload | Backend | Documented `/api/mobile/v1` provider absent |
| Backend activated result | iOS report/history | Fixture/offline contract only |
| Analysis completion | Manifest orchestration | Feature off; legacy read is default |
| Priority result | Training draft | Engine adapters exist; production mode disabled |
| Training draft | Coach approval/store | No durable training schema/API |
| Approved plan | Native execution | No connected execution workflow |
| Adherence/readiness/pain | Longitudinal reducer | Pure contracts only; no event ingestion |
| Alerts/health | Operator | No centralized collector/paging |
| Account deletion | Storage/derived artifacts | Procedure incomplete and unproved end to end |
