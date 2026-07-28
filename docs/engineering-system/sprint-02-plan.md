# Sprint 02 — Staging and data protection

Objective: establish isolated, recoverable, authorized staging.

Authoritative tasks: `AVA-0002`, `AVA-0003`, `AVA-0004`, `AVA-0005`, `AVA-0010`,
`AVA-0011`, `AVA-0013`, `AVA-0038`.

Execution order follows the hard dependency graph:

1. `AVA-0002` — select and provision isolated Supabase, web and worker hosting.
2. `AVA-0003`, `AVA-0010`, `AVA-0013` — managed secrets, telemetry and distributed
   admission after the staging root exists.
3. `AVA-0004` — apply all ordered migrations to staging with checksums and recovery proof.
4. `AVA-0005` — execute the adversarial authorization matrix against the applied schema.
5. `AVA-0011` — perform a timed isolated restore after staging/schema availability.
6. `AVA-0038` — rehearse incident/support ownership after telemetry and deletion controls
   are operational.

Entry requires the external provider decision, accounts/credentials and all hard
dependencies. Repository-side preparation may proceed locally, but local artifacts do not
satisfy deployed acceptance criteria. Exit requires every task to be Verified Complete or
accurately blocked/replanned with evidence.

