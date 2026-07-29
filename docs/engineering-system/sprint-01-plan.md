# Sprint 01 — Baseline and source-of-truth decisions

Objective: make the audited product reproducible and remove release/configuration ambiguity
before more integration work.

Tasks: AVA-0001, AVA-0030, AVA-0032, AVA-0039, AVA-0040.

Entry: founder confirms the audited dirty tree is the intended product surface; no competing
implementation session edits the same files. Likely paths: Git/workflow configuration,
package scripts, environment/features, generated DB types and focused quality docs.

Execution order:

1. partition and commit the product baseline;
2. reproduce gates from clean checkout;
3. enable/observe required remote CI;
4. add schema/type drift and release route/flag controls;
5. migrate lint entry and resolve the known hook warning only with behavior-preserving tests.

Required tests: clean install, typecheck, lint, production build, worker check, focused
sanities, SQL drift, portable Swift and Playwright. Exit: clean checkout reproduces all
required gates; unsafe release flags fail closed; evidence is linked. Estimated effort:
approximately 2L + 2M + 1S across parallel Platform/QA/Backend work. External dependency:
repository administration for protected checks.

## Execution result — 2026-07-18

PARTIAL: `AVA-0039` and `AVA-0040` are Verified Complete. `AVA-0001`, `AVA-0030`, and
`AVA-0032` are Blocked by the preserved unpartitioned baseline, unavailable remote
required-check evidence, and unapplied/unverified staging migrations. Full evidence is in
`docs/engineering-system/sprint-reports/`.
