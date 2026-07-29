# Mobile API v1

All routes use the shared v1 envelope, request ID, no-store response policy and safe errors.
Protected routes derive the user and athlete from Supabase Auth and server data.

| Method/path | Purpose | Current local state | Primary errors/tests |
| --- | --- | --- | --- |
| POST `/auth/login` | password exchange | implemented locally | AUTH_REQUIRED; mobile API sanity |
| POST `/auth/refresh` | rotate session | implemented locally | AUTH_EXPIRED |
| POST `/auth/logout` | global sign-out | implemented locally | AUTH_REQUIRED |
| GET `/me`, `/athlete` | authenticated self profile | implemented locally | FORBIDDEN; ownership sanity |
| GET `/capabilities` | server safety/compatibility contract | implemented locally | SERVICE_UNAVAILABLE |
| POST/GET `/uploads` and completion | verified owned source upload | implemented locally; later-sprint integration | upload lifecycle |
| POST/GET/DELETE `/analyses` | submit/status/delete owned analysis | implemented locally; deletion incomplete end-to-end | mobile API sanity |
| GET `/analyses/{id}/result` | safe active-result projection | implemented locally; equivalence unproved | result foundation/Swift decoding |

Examples use only synthetic fixtures under `contracts/mobile/v1`. Upload, analysis, deletion
and result routes are listed for accuracy but are not declared production-ready or pulled
into Sprint 03 beyond their assigned task evidence.

There is no OpenAPI document. Current machine-readable evidence is TypeScript/Zod plus
canonical JSON fixtures and Swift decoding tests. Adding OpenAPI is not required to close
the blocked assigned tasks and is not introduced speculatively.

