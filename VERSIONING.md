# Intelligence versioning

## Version classes

- Engine version: deterministic evaluation behavior.
- Contract/schema version: serialized state shape.
- Taxonomy version: controlled classification vocabulary.
- Catalog/library version: approved content inventory.
- Mapping registry version: explicit cross-engine mappings.
- Snapshot/cache version: portable persisted envelope.
- Dataset version: reviewed Research/Benchmark source set.

## Rules

1. Output-changing logic requires a version change.
2. Additive optional contract fields may retain a version only when old readers remain safe.
3. Removed or redefined fields require a new contract version and migration strategy.
4. Same input plus all governing versions must produce the same fingerprint and output.
5. Histories preserve original versions; they are never silently recalculated.
6. Cross-version comparison requires explicit compatibility logic.
7. Development “v1” labels do not imply scientific or field validation.

## Current authoritative discovery

Engine versions are imported into `src/lib/intelligence/registry.ts` from their owning
contract modules. Do not duplicate version strings in orchestration code.

## Rollback

Rollback selects a prior immutable compatible snapshot through an audited active-pointer
change. It does not mutate or delete newer history.
