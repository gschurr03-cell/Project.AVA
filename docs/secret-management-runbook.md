# Secret management runbook

Managed secret infrastructure is not yet selected. Staging and beta require independent
Supabase service keys, worker callback secret, signing/notification/telemetry credentials,
and native distribution credentials. Grant each workload only its required secret; inject
at runtime; never store in client builds, logs, images, CI output, or repository files.

Rotation: identify consumers, mint replacement, deploy dual-compatible configuration where
possible, verify, revoke old credential, audit access, and record owner/expiry. A historically
committed credential must be revoked even after file removal. Current local scan passed but
does not scan history or external stores.

