# Mobile API versioning standard

- Route namespace: `/api/mobile/v1`.
- Envelope API version: `v1`.
- Base contract: `ava-mobile-api-v1`.
- Resource contracts are independently named `ava-mobile-*-v1`.
- Minimum app version is server configuration (`MOBILE_MINIMUM_APP_VERSION`).
- Result contract is `ava-mobile-safe-result-v1`; manifest/metric engine versions remain
  explicit provenance.

Within v1, additions must be optional or safely ignored. Removing/renaming required fields,
changing units/meaning, changing an error code, or broadening scientific eligibility is
breaking and requires a new version or migration window. The server remains authoritative
for minimum version and capabilities. Unsupported clients must eventually receive a stable
error before protected work; that deployed behavior is not yet proven.

Deprecation requires an announced support window, telemetry showing remaining versions, a
native compatibility test, and rollback. Local contracts are not evidence of staging
availability.

