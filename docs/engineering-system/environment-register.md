# Environment register

No remote AVA environment is claimed from repository configuration alone.

| Environment | Purpose/current existence | Services and data | Identity/secrets/telemetry | Deployment and rollback | Blocker |
| --- | --- | --- | --- | --- | --- |
| Local development | Exists; developer iteration | local or explicitly configured Supabase, private storage, optional local worker; fixture data permitted | local Auth; `.env.local` excluded from Git; structured local logs | `npm run dev`, local migrations; reset only disposable local data | not release evidence |
| Automated test | Exists in CI configuration; remote runs unobserved | placeholder web configuration, fixture contracts, worker image build, portable Swift | non-secret placeholders; no athlete data; CI logs | clean checkout and `npm ci`; artifact rollback by commit | AVA-0001/0030 |
| Staging | Not provisioned | separate Supabase Auth/Postgres/private buckets, Next web/API, CPU worker, Postgres queues | unique service-role/worker keys, managed secret store, isolated telemetry | provider-specific repeatable deployment; DB backup and release rollback | EXT-01, EXT-02, EXT-09 |
| Scientific validation | Not provisioned as an environment | locked consented source/reference data and immutable result versions; production-equivalent analysis | reviewer roles, restricted dataset access, separate audit/telemetry | versioned protocol and artifacts; withdraw invalid dataset/version | EXT-05–EXT-07 |
| Production/closed beta | Not provisioned | fully isolated Supabase, storage, web/API, worker, backups and native distribution | managed workload secrets, beta allowlist, production surface policy, on-call telemetry | signed/versioned staged release with tested rollback and restore | staging, legal, security and scientific gates |

## Staging topology contract

- Provider/region: undecided; must meet privacy, latency, residency and backup requirements.
- Web/API: existing Next.js application; no alternate application stack.
- Database/Auth/Storage: a dedicated Supabase project with private athlete-scoped buckets.
- Worker/queue: existing containerized MediaPipe worker and Postgres-backed job functions.
- Secrets: unique runtime-injected staging values; never `NEXT_PUBLIC_` except public client
  configuration.
- Telemetry: separate staging collector/project with redaction, actionable alerts and named
  owner.
- Cost: unknown until provider/region/worker sizing is selected; must be recorded before
  provisioning.
- Supported workflow: synthetic account sign-in → authorized upload → queued job → worker
  completion → activated result → deletion/restore verification.

Validation commands are defined in `canonical-engineering-commands.md`. Deployment,
migration, alert, backup and restore evidence remains externally blocked.
