# AVA Sprint MVP production-readiness audit

Audit date: 2026-07-17

## Architecture findings before implementation

| Area | State | Decision / blocker |
| --- | --- | --- |
| Authentication | Partial | Keep Supabase cookie auth. Add return routes and password recovery; email verification already handled. |
| Protected routes | Good foundation | Middleware refreshes sessions and server pages re-check users. Public callback is narrowly scoped. |
| Ownership | Good foundation | Athlete/session/storage RLS is ownership-linked; analyses are user-read-only and worker-written. Add denial tests. |
| Athlete profiles | Partial | Existing measurements and PB validation are production-usable. Broader onboarding metadata is missing. |
| Upload | Blocking reliability gap | Browser upload precedes session creation, so DB failure orphans storage. No size/extension/consent guard. |
| Worker queue | Strong local foundation | Claims, leases, retries, health, cancellation, idempotent completion and temp cleanup exist. Production hosting remains external. |
| Results/trust | Good foundation | Nulls, experimental separation, recording quality, trusted metrics and withholding exist, but presentation is fragmented. |
| Timing Workspace | Partial | Professional editor exists. Panning timing remains unvalidated and feature-gated for production. |
| Saved versions | Good | Explicit immutable snapshots; normal queries hide archived attempts. |
| Privacy/deletion | Missing | No consent ledger, legal drafts, or deletion-request record. |
| Environment | Partial | Example file exists; validation is scattered and startup errors are inconsistent. |
| Errors/loading | Partial | Inline messages exist; route error/loading/not-found boundaries are missing. |
| Observability | Partial | Worker logs are structured; web events and lifecycle trace tooling are incomplete. |
| Mobile/TestFlight | Blocking program gap | Responsive web app only; no Xcode/native wrapper, signing, entitlements, privacy manifest, or TestFlight pipeline. |

## Prioritized implementation checklist

### Critical

- [x] Preserve existing RLS/service-role boundary and add ownership regression coverage.
- [x] Make upload session-first and recoverable; validate file class/size and prevent double submit.
- [x] Add versioned video/biomechanics consent before first upload.
- [x] Add password recovery, safe return-to handling, and invalid-link recovery.
- [x] Add deletion-request foundation without pretending deletion orchestration exists.
- [x] Centralize server environment and safe client feature validation.
- [x] Add route recovery/loading surfaces and a non-sensitive readiness endpoint.

### High

- [ ] Complete resumable multi-step onboarding and extended athlete preferences.
- [ ] Add resumable/chunked upload with real byte progress and cancellation.
- [ ] Create a deployable worker environment and production queue/health monitoring.
- [x] Add local browser E2E coverage using isolated test users.
- [ ] Extend browser E2E to real source upload and worker completion in isolated staging.
- [ ] Implement account export/deletion orchestration and legal review.

### Medium

- [ ] Consolidate result withholding into one athlete-facing section.
- [ ] Add session search/filter/archive and immutable export reports.
- [ ] Add web structured-event sink and protected session lifecycle diagnostics.
- [ ] Complete real-device accessibility and mobile upload/video testing.

### Low

- [ ] Create the selected native iOS delivery architecture after product approval.
- [ ] Optimize visuals only after correctness and real-device profiling.
