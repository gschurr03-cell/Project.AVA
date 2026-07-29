# Program audit trail

The event stream, immutable snapshots, patches, comparisons, rules, provenance, and
fingerprints form the audit contract. Production requires append-only database storage,
immutable approvals, reviewer identity/role checks, manifest linkage, and redacted
role-scoped retrieval. Fixture output is not a persisted audit trail.

