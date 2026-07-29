# Native authentication

The existing session coordinator and Keychain store are retained. Batch 01 adds the typed
mobile auth envelope and native auth service, real login request, secure session save,
restoration/refresh validation, logout clearing and HTTPS environment validation.

Tokens are not stored in UserDefaults or logged. Live sign-in, refresh/revocation, disabled
account and deep-link recovery require the staging provider and physical/simulator app
wiring; portable Swift tests validate the core boundary only.
