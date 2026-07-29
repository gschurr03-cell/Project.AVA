# iOS networking

The typed `APIClient` uses async URLSession requests, request IDs, bearer injection,
timeouts, cancellation, decoded server errors, and idempotency enforcement for mutations.
Errors map to authentication, authorization, validation, missing, conflict, throttling,
service, connectivity, timeout, cancellation, decoding, incompatible-contract, or unknown
categories. Non-idempotent requests are not sent without an idempotency key.

The logger redacts secret-bearing keys and never logs bodies, tokens, videos, names,
notes, or report contents. Production retry/backoff and progress delegates belong in
the background-upload transport; ordinary API calls stay bounded.

