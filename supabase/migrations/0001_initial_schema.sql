-- Project AVA — initial schema.
-- Domain: coaches manage athletes; each sprint is a `session` with one uploaded
-- video; an `analysis` row holds the AI-derived biomechanics metrics.
--
-- Row Level Security is ON for every table. The guiding rule: a coach can only
-- see and mutate rows that belong to athletes they own.

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, created by trigger on signup.
-- ---------------------------------------------------------------------------
create type user_role as enum ('coach', 'athlete', 'admin');

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  role        user_role not null default 'coach',
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are viewable by their owner"
  on public.profiles for select using (auth.uid() = id);
create policy "profiles are editable by their owner"
  on public.profiles for update using (auth.uid() = id);

-- Auto-create a profile when a new auth user signs up.
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- athletes: owned by a coach (profiles.id).
-- ---------------------------------------------------------------------------
create table public.athletes (
  id             uuid primary key default gen_random_uuid(),
  coach_id       uuid not null references public.profiles (id) on delete cascade,
  full_name      text not null,
  sex            text check (sex in ('M', 'F', 'X')),
  date_of_birth  date,
  height_cm      numeric,
  mass_kg        numeric,
  created_at     timestamptz not null default now()
);

create index athletes_coach_id_idx on public.athletes (coach_id);
alter table public.athletes enable row level security;

create policy "coaches manage their athletes"
  on public.athletes for all
  using (auth.uid() = coach_id)
  with check (auth.uid() = coach_id);

-- ---------------------------------------------------------------------------
-- sessions: one sprint recording. video_path points into the storage bucket.
-- ---------------------------------------------------------------------------
create type session_status as enum ('uploaded', 'queued', 'analyzing', 'complete', 'failed');

create table public.sessions (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid not null references public.athletes (id) on delete cascade,
  created_by   uuid not null references public.profiles (id),
  recorded_at  timestamptz not null default now(),
  distance_m   numeric,
  fps          numeric,
  video_path   text,
  status       session_status not null default 'uploaded',
  notes        text,
  created_at   timestamptz not null default now()
);

create index sessions_athlete_id_idx on public.sessions (athlete_id);
alter table public.sessions enable row level security;

-- A coach reaches a session through the athlete they own.
create policy "coaches manage sessions for their athletes"
  on public.sessions for all
  using (
    exists (
      select 1 from public.athletes a
      where a.id = sessions.athlete_id and a.coach_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.athletes a
      where a.id = sessions.athlete_id and a.coach_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- analyses: AI output for a session. Written by the service role worker; read
-- by the owning coach.
-- ---------------------------------------------------------------------------
create type analysis_status as enum ('queued', 'running', 'complete', 'failed');

create table public.analyses (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions (id) on delete cascade,
  model_version   text not null,
  status          analysis_status not null default 'queued',
  metrics         jsonb,
  keypoints_path  text,
  error           text,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index analyses_session_id_idx on public.analyses (session_id);
alter table public.analyses enable row level security;

create policy "coaches read analyses for their sessions"
  on public.analyses for select
  using (
    exists (
      select 1
      from public.sessions s
      join public.athletes a on a.id = s.athlete_id
      where s.id = analyses.session_id and a.coach_id = auth.uid()
    )
  );
-- Writes happen via the service role key (RLS bypassed) from the analysis
-- worker, so no INSERT/UPDATE policy is granted to end users.
