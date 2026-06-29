# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Project AVA is an AI-powered sprint biomechanics web platform. Coaches upload a
sprint video; the system runs pose estimation and surfaces biomechanics metrics
(stride length/frequency, ground contact and flight time, joint angles, top
speed). It is a TypeScript Next.js (App Router) app backed by Supabase for auth,
Postgres, and video storage.

## Commands

```bash
npm run dev          # start dev server at http://localhost:3000
npm run build        # production build (run before claiming a change compiles)
npm run lint         # eslint (next/core-web-vitals + next/typescript)
npm run typecheck    # tsc --noEmit — the fastest correctness gate
npm run format       # prettier

# Supabase (requires Supabase CLI + Docker)
supabase start       # boot local Postgres/Auth/Storage stack
npm run db:reset     # drop + re-apply all migrations in supabase/migrations
npm run db:push      # push migrations to the linked remote project
npm run db:types     # regenerate src/lib/supabase/database.types.ts from the live DB
```

There is no test runner wired up yet. When adding tests, also add the script and
update this section.

## Architecture

### The three Supabase clients (use the right one)

Picking the wrong client is the most common and most dangerous mistake here.

- `src/lib/supabase/client.ts` — **browser** client (anon key). Only in
  `"use client"` components. Subject to Row Level Security.
- `src/lib/supabase/server.ts` — **server** client (anon key, wired to Next.js
  cookies). For Server Components, Route Handlers, and Server Actions. Subject
  to RLS — this is the default for anything acting on behalf of a signed-in user.
- `src/lib/supabase/service.ts` — **service-role** client. **Bypasses RLS.**
  Trusted server contexts only (e.g. the analysis worker writing metrics back).
  Never import it into a Client Component or expose its key to the browser.

### Auth & route protection

`src/middleware.ts` → `src/lib/supabase/middleware.ts#updateSession` runs on
every non-asset request: it refreshes the Supabase session cookie and redirects
unauthenticated users to `/login`. Public path prefixes are `/login`, `/signup`,
`/auth`. When adding a public route, add its prefix there too. Do not insert code
between `createServerClient` and `auth.getUser()` in that file — it causes
session-desync bugs.

Email/password auth uses Server Actions in `src/app/login/actions.ts`. The OAuth
/ magic-link exchange lands at `src/app/auth/callback/route.ts`.

### Data model & ownership (RLS)

Schema lives in `supabase/migrations/` (not an ORM). The ownership chain is the
backbone of every RLS policy:

```
auth.users → profiles → athletes → sessions → analyses
                         (coach owns)  (one sprint)  (AI metrics)
```

- A **coach** (`profiles.role`) owns **athletes**; everything cascades from
  `athletes.coach_id = auth.uid()`.
- A **session** is one sprint recording with one uploaded video; coaches reach
  it through the athlete they own.
- An **analysis** holds AI output. Coaches have **read-only** RLS on it; there is
  deliberately no user INSERT/UPDATE policy — analyses are written by the worker
  via the service-role client.

When you add a table, enable RLS and express access as a path back to
`athletes.coach_id`, mirroring the existing policies. Regenerate types with
`npm run db:types` after any schema change.

### Video storage

Private bucket `sprint-videos` (see `0002_storage_buckets.sql`). Object paths are
`<athlete_id>/<session_id>.<ext>`; the storage RLS policy authorizes by matching
the first path segment to an athlete the coach owns. Serve videos via signed
URLs, never by making the bucket public.

### Analysis pipeline (the AI boundary)

The async flow, by status field:

1. Coach uploads a video → `sessions.status = 'uploaded'`.
2. A session is queued for analysis → an `analyses` row (`status = 'queued'`).
3. An external worker runs pose estimation, then POSTs results to
   `src/app/api/analyses/[id]/result/route.ts`.
4. That handler validates the payload with `analysisResultSchema`
   (`src/lib/biomechanics/types.ts`), writes `analyses.metrics` + flips the
   session to `complete`, using the **service-role** client.

`src/lib/biomechanics/metrics.ts` is the single source of truth for turning raw
pose keypoints into metrics. The UI and the worker must both derive displayed
numbers from these functions — do not re-implement the math elsewhere. Metrics
are SI units unless the field name says otherwise (e.g. `...Ms`, `...Deg`).

The worker callback is currently **unauthenticated** (noted in the route) — gate
it behind a shared secret before shipping.

## Conventions

- Import via the `@/*` alias (→ `src/`), not deep relative paths.
- Validate every external/trust-boundary payload with Zod before it hits the DB.
- Keep secrets server-side: only `NEXT_PUBLIC_*` vars reach the browser; the
  service-role key must never be one of them.
- `database.types.ts` is generated — don't hand-edit it once `db:types` is
  running against a live DB.
