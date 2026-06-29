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

See [CLAUDE.md](./CLAUDE.md) for architecture and conventions.
