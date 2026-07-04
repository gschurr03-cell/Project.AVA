# Project AVA

AI-powered sprint biomechanics web platform. Coaches upload a sprint video; AVA
runs pose estimation and returns coach-ready biomechanics — stride length and
frequency, ground contact / flight time, joint angles, and top speed.

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Supabase** for auth, Postgres, and video storage
- **Tailwind CSS** for styling
- **Zod** for runtime validation at trust boundaries

## Getting started

```bash
npm install
cp .env.local.example .env.local   # fill in Supabase keys
supabase start                     # boots local Postgres/Auth/Storage
npm run db:reset                   # applies migrations + seeds buckets
npm run db:types                   # regenerate database.types.ts
npm run dev                        # http://localhost:3000
```

You need the [Supabase CLI](https://supabase.com/docs/guides/cli) and Docker for
local development. `supabase start` prints the local URL and anon/service keys
to paste into `.env.local`.

## Permanent local dev account

Instead of creating a throwaway verify user each time, seed one permanent local
account with a complete, analyzed demo session:

```bash
npm run dev:seed     # idempotent — safe to re-run any time
```

This creates (or updates) a coach, one athlete with a full profile, and one
`complete` session, and uploads the bundled sample video plus its aligned
MediaPipe pose artifact — so the interactive overlay, calibration, PB
prediction, sprint phases, and sprint intelligence panels all populate from
real, aligned pose data.

Sign in at [`/login`](http://localhost:3000/login):

- **email:** `dev@projectava.local`
- **password:** `dev-password-123` — the local default. Override it by setting
  `DEV_SEED_PASSWORD` before running the seed. No secret is stored in the repo.

The seed talks to the local Supabase stack only; it **refuses to run against a
non-local Supabase URL** unless `DEV_SEED_ALLOW_REMOTE=1` is set, so it can never
touch production data. Re-running it never creates duplicates (every row is keyed
by a fixed id; storage objects are overwritten).

## Local analysis workers (dev)

Two workers poll for queued analyses and POST results to the secured callback.
Both read `.env.local` for the Supabase service-role key and
`ANALYSIS_WORKER_SECRET`, and are dev-only (never deployed).

**Mock worker** — fabricates realistic metrics, no Python needed:

```bash
npm run dev          # terminal 1 — http://localhost:3000
npm run worker:mock  # terminal 2 — polls for queued analyses
```

**Real analysis worker** — runs the actual MediaPipe → PoseSequence →
sprint-metrics pipeline. Needs the Python deps (`requirements-mediapipe.txt`;
see [samples/videos/README.md](./samples/videos/README.md) for the venv setup)
and the venv active so its `python3` sees MediaPipe:

```bash
npm run dev                                   # terminal 1
source .venv/bin/activate && npm run worker:analysis  # terminal 2
```

Click **Run analysis** on a session and the real worker claims the job
(session → *analyzing*), mints a signed URL for the video, runs MediaPipe pose
estimation, computes gait events / steps / strides / angles / sprint metrics,
maps them onto the existing metric shape, and completes the analysis. Debug
artifacts are written to `artifacts/` (git-ignored). **Top speed and stride
length are `0` placeholders** until camera calibration exists — surfaced as a
warning in the worker log and the analysis artifact. Cap frames during
development with `WORKER_MAX_FRAMES=60`.

See [CLAUDE.md](./CLAUDE.md) for architecture and conventions.
