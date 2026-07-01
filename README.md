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

## Local analysis worker (dev)

There is no real pose-estimation worker yet. For development, a mock worker
completes queued analyses automatically so you can see the full flow end to end.
Run it in a second terminal alongside the dev server:

```bash
npm run dev          # terminal 1 — http://localhost:3000
npm run worker:mock  # terminal 2 — polls for queued analyses
```

With both running, click **Run analysis** on a session: the worker claims the
job (session → *analyzing*), inspects the uploaded video, extracts intrinsic
metadata (duration, resolution, fps, codec, size) with a bundled `ffprobe`
(`@ffprobe-installer/ffprobe`) run against a short-lived signed URL, writes that
metadata to the session, then POSTs realistic mock metrics to the secured
callback. It reads `.env.local` for the Supabase service-role key and
`ANALYSIS_WORKER_SECRET`. Dev-only — never deployed.

See [CLAUDE.md](./CLAUDE.md) for architecture and conventions.
