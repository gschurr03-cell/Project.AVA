-- Add an explicit sprint-analysis mode while preserving every existing session as fly.
create type public.sprint_analysis_type as enum ('fly', 'acceleration');

alter table public.sessions
  add column analysis_type public.sprint_analysis_type default 'fly';

alter table public.benchmarks
  add column analysis_type public.sprint_analysis_type not null default 'fly',
  add column source_video_name text;

-- Wiring-only acceleration benchmark. Reference metrics stay empty until the
-- acceleration-specific measurement definitions have been validated.
insert into public.benchmarks (
  id, name, source, source_video_name, kind, analysis_type, distance_m,
  reference_metrics, notes
)
values (
  '55555555-5555-4555-8555-555555555555',
  'AVA Accel Test',
  'IMG_1961.MOV',
  'IMG_1961.MOV',
  '0–20m acceleration',
  'acceleration',
  20,
  '{}'::jsonb,
  'Acceleration-mode wiring benchmark sourced from IMG_1961.MOV. Metric reference values intentionally pending acceleration-specific validation.'
)
on conflict (id) do nothing;
