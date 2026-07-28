# iOS offline and sync

`JSONOfflineStore` persists a schema-v1, account-scoped envelope containing athlete,
analysis, manifest, report, queued action, upload, contract, and sync metadata. Files use
complete-unless-open protection on iOS and atomic writes. Corrupt payloads fail closed;
account IDs determine separate files and logout can clear only the current account.

`SyncCoordinator` is single-run, bounded, cancellable, and connectivity/auth gated.
Triggers are sign-in, foreground, reconnect, upload completion, validated notification,
manual refresh, and permitted background refresh. Backend immutable data wins; pending
idempotent local actions remain queued until acknowledged. No intelligence runs offline.
Forward migration beyond schema v1, pruning limits, and full backend reconciliation remain.

Immutable result packages now commit through a validate-decode-replace transaction. Failed
or partial replacements leave the prior valid package intact. Conflict rules accept server
profile/deletion authority, retain prior results for changed/rolled-back manifests until a
replacement validates, quarantine cross-account uploads, and preserve unsupported-protocol
work for explicit action. Device time alone never wins.
