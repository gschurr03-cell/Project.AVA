# System architecture

AVA uses a modular monolith plus worker and native client:

| Layer | Canonical implementation | Maturity |
| --- | --- | --- |
| Web presentation | Next.js 15 / React 19 App Router | Working locally |
| Web application services | Server actions and Supabase clients | Partial |
| Identity/data/storage | Supabase Auth, Postgres, RLS, private Storage | Strong foundation; undeployed evidence absent |
| Analysis jobs | Postgres `analysis_jobs` leases/RPCs | Production-shaped |
| Video/pose worker | Node orchestrator + ffprobe + Python MediaPipe | Production-shaped; hosting unproved |
| Measurement | biomechanics/calibration/measurement modules | Rich; validation-limited |
| Intelligence | observations → interpretations → recommendations → priorities → reports plus advanced engines | Versioned, mixed legacy/shadow |
| Orchestration | manifest/job/store/adapters | Disabled by default; local test only |
| Native | SwiftUI shell + `AVASprintCore` | API/device/release disconnected |
| Training | pure deterministic `trainingProgram` modules | Fixture-only and disabled |

Preserve these boundaries. Do not replace working biomechanics or the worker with a second
pipeline. The immediate architectural need is provider completion: mobile APIs, durable
training services, staging infrastructure and one authoritative activated-result read path.

## Canonical decisions

- Original media remains immutable in private storage.
- Production biomechanics accepts 60 FPS-class or higher and analyzes on the validated
  60 Hz framework; RTMPose and experimental 30 FPS are non-authoritative.
- Activated immutable snapshots, not live recomputation in UI render paths, should be the
  cross-client source of truth.
- Postgres/RLS is the authorization and durable orchestration boundary.
- Deterministic engines remain server-authoritative; iOS consumes presentation contracts.
- Training remains disabled until durable approval, safety and event-replay boundaries exist.
