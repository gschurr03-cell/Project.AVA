# Mobile API v1

Implemented routes:

- `POST auth/login`, `POST auth/refresh`, `POST auth/logout`
- `GET me`, `GET athlete`, `GET capabilities`
- `POST uploads`, `GET uploads/{id}`, `POST uploads/{id}/complete`
- `POST analyses`, `GET/DELETE analyses/{id}`
- `GET analyses/{id}/result`

The provider uses canonical Supabase Auth/storage/session/analysis/job systems. Mutations
require idempotency, server-owned paths and ownership checks. Responses are no-store and
correlated. The API is fail-closed behind `MOBILE_API_ENABLED`.
