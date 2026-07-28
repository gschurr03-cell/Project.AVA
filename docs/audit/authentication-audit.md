# Authentication audit

Supabase email/password authentication, cookie refresh middleware, callback handling,
password recovery/reset UI and protected server pages exist. Server, browser and
service-role clients are separated.

Gaps:

- no proven native PKCE/deep-link/keychain session flow against staging;
- no MFA or device/session management decision;
- no distributed login/reset abuse controls;
- password reset and email confirmation lack managed-environment E2E evidence;
- beta allowlist policy exists but is not proven at every entry point;
- account deletion/export is not complete operationally;
- no anomaly/revocation monitoring or support procedure has been exercised.

Authentication is a good web foundation, not beta-complete.
