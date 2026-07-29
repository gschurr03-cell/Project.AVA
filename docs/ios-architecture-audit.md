# Native iOS architecture audit

Audit date: 2026-07-18

| Area | Classification | Finding / decision |
| --- | --- | --- |
| Existing native stack | Missing | No Swift, Xcode, React Native, Expo, Capacitor, Flutter, or mobile project exists. |
| Web UI | Web-only | Premium design language is reusable conceptually; React components are not native code. |
| Authentication | Partially reusable | Supabase email/password and cookie auth exist. Native token endpoints/redirect registration are missing. |
| Public API | Incompatible with native MVP | Only health and a trusted worker result callback exist. Most product operations are Next.js Server Actions or internal RPCs. |
| Upload/storage | Partially reusable | Private Supabase buckets and ownership rules exist; no versioned mobile resumable-upload API exists. |
| Analysis queue | Reusable backend | Durable jobs exist, but mobile-safe submission/status endpoints are missing. |
| Activated manifests | Reusable backend | Owner-safe resolver exists; a mobile-safe analysis-scoped endpoint is missing. |
| Reports/intelligence | Partially reusable | Typed backend contracts exist; compact mobile DTOs and drift fixtures are missing. |
| Orchestration | Intentionally server-only | Claims, leases, staging, activation, rollback, replay, and shadow controls must never be mobile-accessible. |
| Offline | Missing | No account-scoped native persistence or sync implementation exists. |
| Apple delivery | Missing / blocked | No App ID, team, signing, entitlements, privacy manifest, TestFlight metadata, or full Xcode installation. |
| Tooling | Blocked in environment | Swift 6.1 CLI exists. `xcodebuild` is unavailable because only Command Line Tools are selected. Simulator/device tests cannot run. |

## Plan before implementation

1. Establish a dependency-light SwiftUI/iOS 17 project foundation and testable Swift
   package, with Debug/Staging/Release configuration examples and no secrets.
2. Implement protocol-backed authentication, networking, upload/media state, manifest
   validation, offline cache, sync, notifications, diagnostics, capture/import and one
   fixture-capable vertical-slice coordinator.
3. Define `/api/mobile/v1` contracts and cross-language JSON fixtures without exposing
   orchestration mutations.
4. Add Swift unit tests runnable with the available CLI, document simulator/device and
   Apple-account blockers, and rerun backend quality gates.

