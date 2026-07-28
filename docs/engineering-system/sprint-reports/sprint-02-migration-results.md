# Sprint 02 migration results

Classification: local only; staging blocked.

- Repository migrations: 53 ordered SQL files (`0001` through `0053`).
- `npx supabase migration list --local`: PASS; every file aligns with the disposable local
  database history.
- `npx supabase db lint --local`: PASS with three pre-existing warnings: one text-to-enum
  assignment and two unused orchestration parameters.
- `npx supabase test db`: FAIL. `mobile_vertical_slice.sql` passed 12 assertions;
  `orchestration_integration.sql` emitted no TAP plan. This received `AVA-0051` and risk
  `R16`; its user-owned test file was not edited.

Not performed: destructive reset, staging apply, staging checksums, staging RLS tests,
upgrade rehearsal, or rollback. The existing local database was not destroyed because its
data ownership was not established. `AVA-0004` remains Blocked.

