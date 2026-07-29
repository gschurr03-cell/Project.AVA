# DEC-008 — Canonical web lint entry

- Status: Accepted
- Date: 2026-07-18
- Affected tasks: `AVA-0040`

## Context

`next lint` is deprecated and emitted a framework migration warning. It also reported a
real exhaustive-dependencies warning in `VideoOverlay`.

## Decision

The canonical lint command is `npm run lint`, implemented as
`eslint src --max-warnings=0` using the repository flat configuration. The maintained
application source is the lint boundary; generated Next output, Python environments and
third-party build artifacts are not source inputs.

The overlay effect declares every captured reactive dependency. No rule is disabled and the
warning budget is zero.

## Migration and rollback

CI and developers keep invoking `npm run lint`; no caller needs a new command. Rollback is
the prior package script and `.eslintrc.json`, but it restores a deprecated entry and is not
recommended.

## Evidence and tests

- `npm run lint`
- `npm run typecheck`
- `npm run build`

