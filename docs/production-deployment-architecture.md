# Production deployment architecture

Actual components are a Next.js web/API runtime, Supabase Auth/Postgres/private Storage,
Postgres-backed analysis and intelligence queues, a CPU MediaPipe analysis worker, and the
native iOS client. No GPU or text-model dependency is required for authoritative analysis
or training logic.

The worker image pins Node 22, verifies the MediaPipe model checksum, runs non-root, uses
isolated bounded `/tmp`, exposes `/live` and `/ready`, heartbeats leases, retries bounded
failures, and handles termination. It needs outbound Supabase/storage access and service-role
credentials. Web and worker hosting/scaling providers are not selected; therefore compute,
network, autoscaling and deployment manifests remain blocked rather than invented.

The web runtime emits anti-content-sniffing, frame denial, strict referrer, bounded browser
permissions, opener isolation and DNS-prefetch controls. Closed beta and production add
one-year HSTS. CSP requires a tested deployment-specific source inventory before activation.

## Reproducible promotion sequence

1. Create a staging Supabase project with separate Auth, Postgres, and private Storage.
2. Configure staging email delivery and exact callback URLs, including
   `NEXT_PUBLIC_APP_URL`.
3. Apply migrations in filename order with the Supabase CLI. Never point local or preview
   configuration at production.
4. Regenerate database types and run typecheck, lint, build, security, ownership, queue,
   benchmark, intelligence, recommendation, and report checks.
5. Deploy one immutable web artifact with `AVA_ENVIRONMENT=staging` and a versioned
   `AVA_RELEASE_VERSION`.
6. Deploy the worker from the same revision with its own service-role and worker secret.
   Confirm `/live` and `/ready`, then process one owned smoke-test upload end to end.
7. Verify sign-up email, password reset, private storage, report printing, retry behavior,
   logs, and account-deletion intake.
8. Promote the same verified artifacts to closed beta. Do not rebuild between staging and
   production promotion.

## Required external configuration

- Web: canonical domain, HTTPS, runtime variables, immutable release ID, log access.
- Supabase: production project, RLS migrations, private buckets, SMTP, callback allowlist,
  backups, storage/file limits.
- Worker: bounded CPU/memory/temp storage, one unique worker ID per instance, outbound
  Supabase access, secret injection, readiness/liveness probes, graceful termination.
- Operations: monitored support channel, retry/dead-letter alerting, deletion-request queue,
  retention policy, incident owner, and backup/restore owner.

## Smoke and rollback

The release smoke test is the full owned journey: sign up, athlete, upload, timing-zone
confirmation, analysis, refresh during processing, completed five metrics, Limiting Factors,
Sprint Intelligence, recommendations, and print report. Also verify a second account cannot
read the first account’s athlete, session, analysis, storage object, or report.

Rollback uses the previous compatible immutable web and worker artifacts. Pause new claims
before worker rollback when result-contract compatibility is uncertain. Database migrations
are forward-remediated; destructive down migrations are not part of the release procedure.
