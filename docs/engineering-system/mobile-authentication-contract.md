# Mobile authentication contract

Supabase Auth is canonical. The local adapter currently supports password sign-in, refresh,
global logout, bearer validation, server-side profile lookup, and a unique
`athletes.user_id` mapping. Protected routes never accept an athlete ID as self-identity.

The API returns the v1 authentication payload; Swift stores it through
`SessionCoordinator`/Keychain and performs one bounded refresh. Tokens must not enter logs,
offline result packages, analytics or user defaults.

Missing bearer credentials return AUTH_REQUIRED. Rejected/expired credentials return
AUTH_EXPIRED. A missing enabled profile or unique athlete mapping fails closed as FORBIDDEN.
Staging tests for malformed, expired, revoked and disabled accounts remain blocked by
`AVA-0004`/`AVA-0005`; local source checks are not equivalent.

Password recovery, email verification, redirect registration and end-to-end account
deletion remain incomplete. No second identity provider or custom token format is approved.

