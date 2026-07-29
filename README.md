# Project AVA

Video-based sprint performance analysis for coaches and athletes. AVA’s web MVP reports
five authoritative metrics: Average Step Length, Peak Step Length, Step Frequency,
Average Velocity, and Peak Velocity. Structured intelligence explains supported limiting
factors and focused training directions without medical diagnosis or full programming.

## Canonical engineering standard

All product and engineering work is governed by the
[AVA Accuracy Manifesto](./docs/accuracy-manifesto.md). Read it before changing analysis,
models, metrics, persistence, benchmarks, recommendations, or presentation behavior.

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

This creates (or updates) a local coach, athlete profile, and development session.
Seeded content is for local workflow testing and is never production evidence.

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

**Mock worker** — local UI/lifecycle testing only; its output is not valid analysis:

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
estimation and computes the authoritative measured-zone metrics. Spatial metrics are
withheld—not shown as zero—until the required calibration is available. Debug artifacts
are written to `artifacts/` (git-ignored).

See [CLAUDE.md](./CLAUDE.md) for architecture and conventions.
See [Web MVP launch readiness](./docs/web-mvp-launch-readiness.md) for the current launch
decision and [Production deployment architecture](./docs/production-deployment-architecture.md)
for external infrastructure requirements.
