# iOS authentication

`SessionCoordinator` owns restoration, refresh, and logout and permits only one refresh
at a time. `APIClient` injects access tokens without exposing them to views. Production
storage is `KeychainSessionStore` with after-first-unlock, this-device-only protection;
the in-memory implementation is test/fixture-only.

The live Supabase exchange, email verification, recovery, redirect registration, and
account deletion endpoint remain backend integration work. Unrecoverable refresh failure
must clear credentials and return to the unauthenticated root. Tokens must never enter
UserDefaults, offline payloads, analytics, logs, or upload records.

