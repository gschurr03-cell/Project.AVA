# Sprint 03 — Mobile API foundation

Objective: provide a versioned secure mobile adapter and canonical safe result.

Authoritative tasks: `AVA-0006`, `AVA-0012`, `AVA-0016`, `AVA-0017`.

Dependency order:

1. `AVA-0006` after staging migrations and authorization (`AVA-0004`, `AVA-0005`).
2. `AVA-0012` after the applied schema and mobile provider (`AVA-0004`, `AVA-0006`).
3. `AVA-0016` after reference metric validation (`AVA-0015`).
4. `AVA-0017` after hosted worker execution (`AVA-0009`) and the canonical activated-result
   decision.

All four have substantial local Batch 1 implementation and remain In Progress. Sprint 03
may audit, document and validate that code locally. It may not claim deployed integration,
scientific validation, erasure proof or web/native result equivalence while dependencies
remain incomplete.

