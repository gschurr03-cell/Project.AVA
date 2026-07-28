# Sprint 04 native architecture audit

## Current architecture

AVA has one Swift 6 package plus an iOS 17 SwiftUI application/Xcode project. The app entry
point is `AVASprintApp`; `RootView` currently renders the existing beta experience rather
than a session-gated login/application root. `AVASprintCore` is the reusable boundary.

Canonical native components already exist:

- `NativeEnvironment` validates HTTPS base URLs and rejects release localhost.
- `APIClient` is an actor-based typed transport with bearer authorization, request IDs,
  API-version headers, idempotency enforcement, cancellation and typed failures.
- `SessionCoordinator` is the single token/refresh coordinator and serializes refresh work.
- `KeychainSessionStore` uses a device-only Keychain item; the in-memory store is suitable
  for deterministic tests.
- `NativeAuthenticationService` implements login, restore and best-effort server logout.
- `MobileProfileService` and the mobile DTOs adapt the `/api/mobile/v1` contracts.
- service protocols and `AppServices` provide dependency-injection boundaries.
- portable Swift Testing coverage exists, with fixture-backed safe-result decoding.

## Readiness and gaps

| Area | State | Production blocker / debt |
| --- | --- | --- |
| Environment | Partial | example xcconfigs use placeholder domains/bundle IDs and are not connected as authoritative base configurations; development example is HTTP while runtime validation requires HTTPS |
| Identity/signing | Blocking | `com.placeholder.*` bundle IDs and empty `DEVELOPMENT_TEAM`; no official signing assets or archive evidence |
| App lifecycle/UI | Partial | app root is not driven by one explicit session-state model; no implemented Sprint 04 login/startup/error UI evidence |
| API client | Partial foundation | typed transport exists, but client-version header, schema-version enforcement, request-ID retention and one-time post-refresh retry are incomplete |
| Error model | Partial | transport categories exist, but full server-code mapping, user-safe presentation metadata and request-ID diagnostics are incomplete |
| Secure storage | Partial foundation | Keychain store exists; replacement uses delete-then-add rather than an atomic update and has no real-device persistence evidence |
| Refresh | Partial foundation | same actor task serializes concurrent refresh; every refresh error clears the session, so transient and revoked failures are not distinguished; logout/late-refresh race evidence is absent |
| Repositories | Partial | athlete profile exists; dedicated current-user and capabilities repositories are not evident |
| Mocks | Good boundary | in-memory storage and injectable protocols exist; no silent production fallback was found |
| Tests | Partial | 19 portable tests cover broad foundations but not the complete Sprint 04 login/refresh/logout/Keychain/error/repository matrix |
| Simulator/device | Blocking | no recorded simulator authentication run, physical-device run, signing, Keychain persistence or staging evidence |
| Telemetry | Blocking | safe beta telemetry types exist, but no deployed crash collector, symbol upload or test-crash evidence |

## Keep / adapt / defer

Keep the actor-based core, service protocols, typed DTOs, Keychain abstraction, environment
validator and existing design system. Adapt these components only after dependencies become
ready; do not introduce another API client, token store, environment selector or session
coordinator. Deprecate nothing in this pass. The highest migration risk is wiring speculative
identity, staging or telemetry values into the Xcode project before the corresponding
external authority exists.
