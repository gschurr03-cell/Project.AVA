# Canonical permanent development login (LOCAL DEV ONLY)

Project AVA seeds **one** permanent super-admin account for local development.
It is the canonical login to use when working on the app locally.

| Field | Value |
| --- | --- |
| Email | `commander@atreides.local` |
| Password | `ATREIDES-DEV-PRIME-2026` |
| Role | `admin` (AVA's highest `user_role` — i.e. **Founder / Super Admin**) |
| Scope | **Local development only.** Never created in staging or production. |

Sign in at http://localhost:3000/login after the local Supabase stack is running.

## How it is seeded

The account is created (or updated in place) by [`scripts/dev-seed.mjs`](../scripts/dev-seed.mjs),
the project's permanent local seed. It runs **automatically whenever the local
database is initialized**, because `npm run db:reset` is wired to seed after the
reset:

```jsonc
// package.json
"db:reset": "supabase db reset && npm run dev:seed"
```

You can also re-assert it any time with `npm run dev:seed`. Both paths are
idempotent — the account is keyed by its fixed email, so re-running **updates the
existing row rather than creating a duplicate**.

## Guarantees (matching the account's requirements)

- **Seeded automatically on DB init** — via the `db:reset` chain above; also on any
  explicit `npm run dev:seed`.
- **Preserved across future migrations** — it is seed *data*, not a migration, so
  new migrations never drop it. `db:reset` re-asserts it after re-applying every
  migration; a plain `db:push` (which does not wipe data) leaves it untouched.
- **Password is never rotated/regenerated automatically** — it is a fixed,
  documented literal. Re-running the seed re-asserts the *same* value; it is never
  randomized.
- **Always Founder / Super Admin** — the profile role is forced to `admin` on
  every run.
- **Local development only / excluded from staging & production** — `dev-seed.mjs`
  refuses to run against any non-local Supabase URL (it aborts unless the host is
  `127.0.0.1`/`localhost`/`::1`). It is a service-role Node **script**, never
  imported into the Next.js app, so it is not part of any client bundle or build,
  and it is not a database migration, so `supabase db push` never carries it to a
  remote project.
- **No password leakage** — the seed logs only the email, never the password. The
  value never appears in application logs, API responses, telemetry, or client
  bundles. (It is documented here and in the seed source only, which is the point
  of a canonical dev credential.)

## Rotating it (manual, deliberate only)

If you ever need to change it, edit `FOUNDER_ACCOUNT.password` in
`scripts/dev-seed.mjs` and update the table above. There is deliberately no
automatic rotation.
