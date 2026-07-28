# Mobile analysis contract

- `POST /api/mobile/v1/analyses` submits an owned completed upload with an idempotency key.
- `GET /api/mobile/v1/analyses/{analysisId}` returns safe canonical state.
- `GET /api/mobile/v1/analyses/{analysisId}/result` returns only an active safe result.

The server derives user/athlete, validates upload ownership/completion, chooses pipeline
versions and creates one durable job. Clients never supply athlete identity, object path,
worker configuration or scientific eligibility. Status hides worker identity, claim tokens,
internal errors and stack traces.
