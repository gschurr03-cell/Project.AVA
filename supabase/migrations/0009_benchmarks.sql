-- Day 62: generic benchmark reference model + ground-truth validation.
--
-- A `benchmark` is a known-good reference sprint (e.g. VueMotion-measured) that
-- AVA's computed metrics can be validated against. It is deliberately GENERIC:
-- adding a future benchmark (Flying 30, Acceleration, Curve, another lab clip)
-- is just another INSERT — no code change. Reference values live in a jsonb map
-- keyed by canonical metric keys (see src/lib/benchmark/metrics.ts), so different
-- benchmark types can carry whatever subset of metrics were actually measured.
--
-- Benchmarks are shared reference data (not coach-owned): readable by any
-- authenticated user, never user-writable (managed via migrations / service role),
-- mirroring how analyses are written only by trusted server contexts.
--
-- A session may optionally link to one benchmark; the validation panel appears
-- ONLY for a linked session, so unrelated sprints are never compared to the wrong
-- reference.

create table public.benchmarks (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  source            text,                          -- e.g. "VueMotion", "coach"
  kind              text,                          -- e.g. "20m fly", "Flying 30"
  distance_m        numeric,                       -- reference zone distance, metres
  reference_metrics jsonb not null default '{}'::jsonb, -- canonical metric key → value
  notes             text,
  created_at        timestamptz not null default now()
);

alter table public.benchmarks enable row level security;

-- Global reference data: any authenticated coach can read benchmarks to compare
-- against; there is deliberately no user write policy.
create policy "benchmarks are readable by authenticated users"
  on public.benchmarks for select
  using (auth.uid() is not null);

-- Sessions may reference a benchmark. ON DELETE SET NULL so removing a benchmark
-- never deletes sprint sessions.
alter table public.sessions
  add column benchmark_id uuid references public.benchmarks (id) on delete set null;

create index sessions_benchmark_id_idx on public.sessions (benchmark_id);

-- Seed the first official benchmark: AVA Calab Vid 1 (VueMotion 20 m fly). Fixed
-- id so it is stable and idempotent to reference. Times are seconds, speeds m/s,
-- lengths metres, frequencies steps/second, contact/flight milliseconds.
insert into public.benchmarks (id, name, source, kind, distance_m, reference_metrics, notes)
values (
  '44444444-4444-4444-8444-444444444444',
  'AVA Calab Vid 1',
  'VueMotion',
  '20m fly',
  20,
  jsonb_build_object(
    'zoneTimeS', 1.93,
    'avgVelocityMps', 10.36,
    'maxVelocityMps', 10.74,
    'avgStepLengthM', 2.15,
    'leftStepLengthM', 2.16,
    'rightStepLengthM', 2.14,
    'leftStepFrequencyHz', 5.00,
    'rightStepFrequencyHz', 4.72,
    'groundContactLeftMs', 80,
    'groundContactRightMs', 80,
    'flightLeftMs', 120,
    'flightRightMs', 130
  ),
  'First official AVA benchmark. VueMotion-measured 20 m fly zone (first pair of yellow cones to the final pair).'
)
on conflict (id) do nothing;
