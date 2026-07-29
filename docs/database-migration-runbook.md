# Database migration runbook

Before staging/beta migration: snapshot/backup, verify restore capability, run migrations
against an isolated clone, inspect locks/query plans, validate RLS/RPC grants, and record
schema/release versions. Deploy expand changes before code dependence; backfill in bounded,
restartable batches; contract only after all readers migrate. Set statement/lock timeouts.

Migration `0023` drops only a named constraint before replacing policy behavior; no table or
column drop was found. Rollback of enum additions and data migrations is generally forward
remediation, not automatic down migration. No beta migration or restore has been performed.

