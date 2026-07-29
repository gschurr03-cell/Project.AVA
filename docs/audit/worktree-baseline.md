# Worktree baseline

Captured 2026-07-18 before audit edits.

| Field | Value |
| --- | --- |
| Repository | `/Users/gavinschurr/Project.AVA` |
| Branch | `day-25` |
| HEAD | `2c55e92c2d1a6ee10881fb59ec475772747ce276` |
| Tracked modifications | 62 files; `4,765` insertions and `839` deletions |
| Staged changes | None |
| Untracked surface | Hundreds of files across `.github`, `docs`, `ios`, `scripts`, `src`, `supabase`, `validation` |

The worktree was materially dirty before this audit. All pre-existing changes are treated as
user-owned. The audit added only `docs/audit/*` and `docs/backlog/*`; it did not reset,
stage, reformat, delete, or rewrite existing implementation.

The baseline commit contains only an earlier product state. Conclusions in this audit apply
to the exact dirty working tree, not to a reproducible commit or remote deployment. This is
itself P0 release-process debt: CI, review, rollback and artifact provenance cannot reproduce
the audited product until changes are intentionally partitioned and committed.
