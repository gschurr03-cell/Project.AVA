# iOS media lifecycle

Media moves through temporary capture, validated asset, queued, uploading, uploaded,
awaiting verification, safe-to-delete, retained, or deletion-failed states. Durable files
belong in protected Application Support; unstable provider and capture URLs are copied
before queueing.

Storage-pressure cleanup may remove only server-verified `safeToDelete` assets not retained
by the user. It must never remove active uploads, files awaiting verification, retry input,
or retained assets. Logout clears account cache but preserves unresolved media until a
user-visible safe disposition; account deletion must reconcile server state before local
purge.

`LocalMediaStore` copies verified captures/imports into an account directory, applies file
protection, stores fingerprint, verification, protocol, upload/analysis links and lifecycle,
re-resolves URLs after restart, detects duplicate content, and reports orphaned files.
Free-space policy warns below 4 GB, becomes critical below 2 GB, and blocks capture below
1.5 GB. Automatic orphan deletion is not enabled.
