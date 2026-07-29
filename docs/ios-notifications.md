# iOS notifications

The client contract supports just-in-time permission, APNs token registration/refresh,
environment separation, safe payload decoding, and routes for completion, failure, action
required, interrupted upload, coaching availability, and security alerts. Unknown contract
versions fail closed. Payloads contain opaque IDs and neutral text, never biomechanics or
health detail.

The APNs backend, credentials, associated environments, and production registration route
do not exist yet. Background refresh is best-effort; notifications prompt reconciliation
and never make a manifest authoritative.

