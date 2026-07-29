# Atomic pipeline manifest

The active manifest identifies analysis/athlete scope, plan fingerprint, pipeline and
registry versions, engine and adapter versions, ordered engine snapshot references,
input provenance, prior manifest, activation state, timestamps and an integrity hash.

Activation locks the plan and athlete pointer and requires a non-shadow plan, all jobs
succeeded, all target snapshots staged, and matching engine versions. One transaction
supersedes the previous manifest, creates and activates the new manifest, changes the
pointer, completes the plan and audits its SHA-256 fingerprint.

Any failure rolls back the transaction and leaves the previous manifest authoritative.
Staged snapshots remain inactive and immutable. Rollback restores the prior manifest
without deleting history.

