alter table public.sessions
  add column if not exists timing_workspace jsonb not null default '{}'::jsonb;

alter table public.sessions add constraint sessions_timing_workspace_object
  check (jsonb_typeof(timing_workspace) = 'object');

comment on column public.sessions.timing_workspace is
  'Reversible UI layout and draft editor state; never authoritative timing calculations.';
