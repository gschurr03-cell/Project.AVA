-- Follow-up for environments that applied 0024 before timing workspace fields landed.
alter table public.sessions
  add column if not exists timing_mode text not null default 'fly',
  add column if not exists timing_direction text not null default 'auto',
  add column if not exists timing_body_reference text not null default 'torso',
  add column if not exists timing_splits jsonb not null default '[]'::jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_timing_mode_valid') then
    alter table public.sessions add constraint sessions_timing_mode_valid
      check (timing_mode in ('fly','split','custom'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sessions_timing_direction_valid') then
    alter table public.sessions add constraint sessions_timing_direction_valid
      check (timing_direction in ('auto','left_to_right','right_to_left'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sessions_timing_body_reference_valid') then
    alter table public.sessions add constraint sessions_timing_body_reference_valid
      check (timing_body_reference in ('torso','hips','head'));
  end if;
end $$;
