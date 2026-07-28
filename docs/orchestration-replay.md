# Pipeline replay

Replay creates a new non-authoritative run linked to its source plan. It can preserve or
bypass cache and target one engine plus its stored ancestors. It requires immutable
input provenance and every exact engine/adapter/contract/migration version.

The availability validator distinguishes supported, deprecated-runnable, unavailable,
incompatible, missing migration and missing contract. Current deterministic execution
does not imply historical reproducibility: this repository does not retain historical
binaries for versions absent from the registry. Such replay fails closed and never
substitutes current versions.

