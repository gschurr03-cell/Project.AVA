# Security and privacy audit

## Existing controls

Private storage, ownership RLS, service-role isolation, scoped RPC grants, cookie refresh,
server/client/service separation, bounded secret scan, security headers, telemetry
redaction, allowlist/rate-policy contracts and threat/runbook documents exist.

## Unaccepted launch risks

- no complete authorization matrix with negative staging tests;
- no distributed rate limiting/upload admission control;
- no managed-secret/rotation evidence;
- no operational account/data/video deletion proof;
- no backup restore or rollback rehearsal;
- no centralized security monitoring;
- no professional privacy/terms/consent/health-data review;
- no native keychain/data-protection/device verification;
- no dependency/history/container vulnerability pipeline evidence from a remote protected CI;
- CSP remains intentionally deferred pending resource inventory.

Any cross-athlete access, secret exposure, unerasable video, corrupted activated result or
lost safety event is a P0 release stop.
