# Upload security boundaries

- Identity, athlete ownership, bucket and object path are server-derived.
- Storage authorization must be HTTPS, unexpired and narrowly scoped.
- App bearer/cookie/proxy credentials must never be forwarded to storage.
- Signed destinations, tokens and local paths must not enter logs or telemetry.
- Content type, byte count, FPS metadata and object existence are revalidated server-side.
- Mutations use stable idempotency keys; altered retries conflict safely.
- Temporary/local media is account-scoped, protected and deleted only after canonical
  server verification or explicit safe cancellation policy.
- Retries are bounded; expired authorization is renewed rather than replayed.
- A transfer callback from a cancelled/replaced attempt cannot mark the upload successful.
