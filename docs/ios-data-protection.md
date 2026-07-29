# iOS data protection

- Credentials: Keychain, this-device-only; never logs or offline records.
- Videos: protected private Application Support/temp locations, retained until verified.
- Offline summaries: account-scoped protected files with atomic replacement.
- Re-creatable artifacts only: caches directory.
- Logging/diagnostics: allow-listed metadata and redaction; no payload bodies or health data.

After upload, video remains until server verification and cleanup policy permits deletion.
After analysis, immutable summaries may remain for offline viewing. Logout clears tokens
and that account's summaries; unresolved video requires safe disposition. Account deletion
must invoke the future server endpoint, then purge local account data. App deletion removes
the sandbox but not server data. Screen-capture restrictions and legally defined retention/
secure-deletion guarantees remain privacy-review decisions.

Media fingerprints stream file bytes rather than loading videos into memory. Durable paths
are application-created and re-resolved beneath the authenticated account; backend paths
are not accepted. Background authorization must be short-lived. TLS never downgrades to
cleartext, and pinning is omitted without an operational key-rotation plan.
