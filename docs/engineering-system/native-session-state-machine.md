# Native session state machine

Status: target contract for completing `AVA-0007`; current code provides token coordination
but the application root does not yet implement this full state model.

Canonical states are resolving, unauthenticated, authenticating, authenticated, refreshing,
offline-cached, expired, disabled, unsupported-client and failed. Cached identity may render
explicitly offline-safe content but never grants new authorization.

Expected transitions:

1. Launch enters resolving and loads the Keychain session.
2. A missing session becomes unauthenticated.
3. A valid session is checked/refreshed, then current user, capabilities and athlete profile
   are fetched before authenticated navigation.
4. Concurrent protected calls share one refresh operation. Eligible calls retry no more than
   once.
5. Invalid/revoked refresh becomes expired and clears protected state. Transient connectivity
   failure remains distinguishable from revocation.
6. Logout cancels refresh/protected work, attempts server revocation, clears Keychain and
   protected caches, and becomes unauthenticated even if revocation fails.
7. Unsupported-client and disabled-account states cannot enter protected workflows.

`SessionCoordinator` remains the canonical token coordinator. Completion must prove that a
late refresh cannot overwrite logout and that startup never flashes protected UI.
