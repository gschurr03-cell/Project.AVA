# Prompt 15A production-readiness audit

Audit date: 2026-07-18. Decision: **NO-GO for closed beta**.

## Evidence summary

| Subsystem | Status | Evidence / blocker |
| --- | --- | --- |
| Web application | Locally test validated | Next.js build, lint, typecheck, ownership and upload sanity suites |
| Analysis worker | Production-shaped, local only | Durable Postgres leases/retries, health server, pinned model checksum, hardened non-root image; no hosted staging evidence |
| Database/RLS | Strong foundation, local validation | 52 ordered migrations, ownership RLS, service-role-only queue/orchestration RPCs; no staging migration or restore rehearsal |
| Storage | Private/RLS foundation | Private video and pose buckets, signed URLs; lifecycle/retention and provider audit logging unverified |
| Authentication | Partial | Supabase session refresh, recovery, protected routes; MFA, anomaly response, revocation/device testing pending |
| Authorization | Partial, locally tested | Ownership RLS and scoped RPCs; no complete centralized relationship/role policy for every requested operation |
| Upload security | Partial | Client validation and server/worker metadata verification; direct browser upload lacks quarantine/malware workflow and resumability |
| Training integrity | Contract tested | Draft/approval/stale/restriction integrity checks; no persisted active-plan service |
| CI | Implemented, not yet observed | New quality workflow builds web, worker/SBOM, contracts, and portable Swift tests; branch protection is repository-admin work |
| iOS | Portable tests only | Xcode project/contracts exist; no signed build, physical-device, TestFlight, crash, or staging evidence |
| Observability | Partial/local | Worker JSON logs/health/metrics and orchestration health models; no centralized collector, dashboards, alerts, or paging |
| Backups/DR | Blocked | Provider capability not configured or restored in evidence |
| Deployment/IaC | Blocked | Worker Dockerfile exists; no selected hosting provider, web deployment manifest, managed secrets, or reproducible environment resources |
| Legal/policy | Blocked | Draft privacy/terms exist; professional consent, video/health disclosure, retention and minors review pending |

## Security findings

No tracked secret matched the bounded local scanner. This is not git-history or external
secret-scanner proof. The repository has no permissive CORS configuration. Public health
returns only booleans. Queue/orchestration RPCs are revoked from public users and granted
to `service_role`. Remaining high risks are absent distributed rate limiting, incomplete
central authorization, unverified deletion completion, no managed-secret evidence, direct
upload admission limits, and no live security monitoring.

## Implemented in this pass

Non-root worker runtime; strict production-like configuration combinations; centralized
telemetry redaction, correlation IDs, privacy-safe subject IDs, beta allowlists, closed-beta
resource/rate policies, and plan-integrity evaluation; permanent security tests; CI web,
container provenance/SBOM, secret scan, regression and portable Swift gates.

Dependency audit initially found high-severity `tar` findings through the old Supabase CLI.
The CLI was upgraded to 2.109.1 and the high-severity gate now passes. Two moderate PostCSS
findings remain through Next.js; the audit proposes a breaking and invalid Next.js downgrade,
so no forced automated change was accepted. Track an upstream-compatible Next.js resolution.

The identical-prompt follow-up added explicit anti-sniffing, framing, referrer, permissions,
opener and DNS-prefetch headers. HSTS is emitted only for closed-beta/public-production
environments. Worker telemetry now uses recursive depth/size-bounded redaction rather than
top-level filtering. Content Security Policy remains pending a route/resource inventory;
an untested policy could break authenticated Supabase media and Next.js runtime behavior.

## Hard blockers

Provision isolated staging and closed-beta projects; select deployment/IaC and managed
secrets; enforce distributed rate limits/admission control; deploy telemetry/alerts; complete
authorization matrix and deletion worker; run staging E2E, restore, rollback and failure
rehearsals; obtain native device/TestFlight and professional security/privacy/coaching review.
