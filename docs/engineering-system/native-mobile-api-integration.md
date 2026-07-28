# Native mobile API integration

The canonical native boundary is `AVASprintCore`: `APIClient`, `SessionCoordinator`,
`KeychainSessionStore`, `NativeAuthenticationService`, mobile DTOs and service protocols.
Production code must adapt these components instead of adding parallel clients or stores.

Every protected request uses the configured HTTPS base URL, bearer token, `X-Request-ID`,
`X-AVA-API-Version: v1`, JSON accept headers and idempotency keys for mutations. Transport
and server failures map to typed `NetworkFailure` values; raw response bodies and tokens
must never reach UI or telemetry.

Current proof level is portable/unit-tested preparation only. The following remain required:

- complete current-user and capabilities repositories;
- align the full native error registry and retain server request IDs;
- distinguish transient refresh failures from invalid/revoked credentials;
- prove one-time retry and logout-versus-refresh behavior;
- wire one session-driven application root;
- validate against staging, simulator and a signed physical device.

Mocks and in-memory stores are restricted to tests/previews or explicit development
injection. A failed real request must never fall back to fake success.
