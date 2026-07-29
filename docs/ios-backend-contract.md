# iOS backend contract

Contract namespace: `/api/mobile/v1`. The repository contains local Next.js route adapters
and permanent native fixtures, but the boundary is not deployed or staging-validated.

| Method/path | Purpose |
| --- | --- |
| `GET /me`, `GET /athlete` | auth context and current athlete |
| `POST /uploads`, `GET /uploads/{id}`, `POST /uploads/{id}/complete` | initialize, reconcile, verify upload |
| `POST /analyses`, `GET /analyses/{id}/status` | idempotent submission and public status |
| `GET /analyses/{id}/active-manifest` | authoritative activated manifest only |
| `GET /analyses/{id}/snapshots`, `GET /analyses/{id}/report` | permitted immutable results |
| `GET /recommendations`, `/coaching-state`, `/digital-twin`, `/benchmarks`, `/projections` | mobile summaries |
| `GET/PATCH /account`, `POST /account/deletion`, `POST /account/export` | account/privacy operations |
| `POST /devices` | APNs token registration |

Mutating requests require bearer authentication, request ID, contract version, and an
idempotency key. Errors use the typed `APIErrorResponse`. The server chooses execution
plans. Claims, leases, staging, shadow data, activation, rollback, replay, and arbitrary
engine execution are never exposed.

Canonical JSON fixtures live in `contracts/mobile/v1`; Swift copies are checked by
`npm run mobile-contract:sanity`. This is the minimum drift gate pending OpenAPI-backed
generation. Authentication transport must be finalized with the existing Supabase
identity configuration before staging integration.
