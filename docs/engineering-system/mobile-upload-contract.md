# Mobile upload contract

The authenticated mobile contract is:

- `POST /api/mobile/v1/uploads`: initiate or idempotently recover one logical upload.
- `GET /api/mobile/v1/uploads/{uploadId}`: retrieve canonical status.
- `POST /api/mobile/v1/uploads/{uploadId}/complete`: request server verification.

The client supplies safe filename, content type, byte count, SHA-256, recording metadata and
one idempotency key. It never supplies athlete ID, organization ID, bucket, object path,
ACL or ownership. The server derives identity/athlete, creates the private object path,
limits type/size/FPS and issues short-lived authorization.

A repeated idempotency key with identical metadata returns the same upload identity and, if
still initiated, fresh authorization. Altered metadata with the same key returns
`RESOURCE_CONFLICT`. Completion is idempotent and succeeds only after the server verifies
object existence and expected byte length. Status and completion responses use camelCase
mobile DTOs rather than database column names.
