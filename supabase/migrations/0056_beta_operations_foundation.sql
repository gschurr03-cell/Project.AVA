-- Closed-beta user education, support intake, feedback, and least-privilege
-- operations foundation. Additive only; scientific and analysis data are unchanged.

-- A profile owner may edit their name, never their authorization role.
revoke update on public.profiles from authenticated;
grant update(full_name) on public.profiles to authenticated;

create table public.onboarding_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state text not null default 'not_started'
    check (state in ('not_started','in_progress','completed','dismissed','needs_reconfirmation')),
  current_step integer not null default 1 check (current_step between 1 and 5),
  onboarding_version text not null,
  scientific_boundary_acknowledged boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.onboarding_states enable row level security;
create policy "users manage their onboarding state" on public.onboarding_states
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in (
    'authentication','profile','upload','calibration','analysis_failure',
    'result_question','report','privacy','account_deletion','data_export',
    'feedback','other'
  )),
  subject text not null check (char_length(subject) between 3 and 120),
  message text not null check (char_length(message) between 10 and 4000),
  session_id uuid references public.sessions(id) on delete set null,
  analysis_id uuid references public.analyses(id) on delete set null,
  safe_reference_id text not null unique,
  diagnostic_context jsonb not null default '{}'::jsonb,
  status text not null default 'open'
    check (status in ('open','in_review','waiting_for_user','resolved','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_requests_user_created_idx on public.support_requests(user_id, created_at desc);
create index support_requests_status_created_idx on public.support_requests(status, created_at desc);
alter table public.support_requests enable row level security;
create policy "users read their support requests" on public.support_requests
  for select using (auth.uid() = user_id);
create policy "users create scoped support requests" on public.support_requests
  for insert with check (
    auth.uid() = user_id
    and (session_id is null or exists (
      select 1 from public.sessions s join public.athletes a on a.id=s.athlete_id
      where s.id=session_id and a.coach_id=auth.uid()
    ))
    and (analysis_id is null or exists (
      select 1 from public.analyses an
      join public.sessions s on s.id=an.session_id
      join public.athletes a on a.id=s.athlete_id
      where an.id=analysis_id and a.coach_id=auth.uid()
    ))
  );
create policy "admins read all support requests" on public.support_requests
  for select using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));
create policy "admins update support workflow" on public.support_requests
  for update using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'))
  with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));

create table public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in (
    'confusing_workflow','recording_guidance','analysis_speed','metric_understanding',
    'limiter_quality','recommendation_usefulness','report_usefulness','feature_request','general'
  )),
  usefulness text check (usefulness in ('yes','partly','no')),
  comment text check (comment is null or char_length(comment) <= 2000),
  session_id uuid references public.sessions(id) on delete set null,
  analysis_id uuid references public.analyses(id) on delete set null,
  current_route text,
  may_contact boolean not null default false,
  created_at timestamptz not null default now()
);
create index feedback_submissions_user_created_idx on public.feedback_submissions(user_id, created_at desc);
alter table public.feedback_submissions enable row level security;
create policy "users read their feedback" on public.feedback_submissions
  for select using (auth.uid() = user_id);
create policy "users create scoped feedback" on public.feedback_submissions
  for insert with check (
    auth.uid() = user_id
    and (session_id is null or exists (
      select 1 from public.sessions s join public.athletes a on a.id=s.athlete_id
      where s.id=session_id and a.coach_id=auth.uid()
    ))
    and (analysis_id is null or exists (
      select 1 from public.analyses an
      join public.sessions s on s.id=an.session_id
      join public.athletes a on a.id=s.athlete_id
      where an.id=analysis_id and a.coach_id=auth.uid()
    ))
  );
create policy "admins read all feedback" on public.feedback_submissions
  for select using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));

create table public.beta_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index beta_audit_events_created_idx on public.beta_audit_events(created_at desc);
alter table public.beta_audit_events enable row level security;
create policy "admins read beta audit events" on public.beta_audit_events
  for select using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));
revoke insert, update, delete on public.beta_audit_events from authenticated;

-- Bound incomplete browser uploads atomically. This protects storage/session churn
-- across tabs; completed uploads are not counted.
create or replace function public.enforce_beta_active_upload_limit()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.status='uploading' and (
    select count(*) from public.sessions
    where created_by=new.created_by and status='uploading'
  ) >= 2 then
    raise exception 'beta_active_upload_limit_reached' using errcode='P0001';
  end if;
  return new;
end;
$$;
create trigger sessions_beta_active_upload_limit
before insert on public.sessions
for each row execute function public.enforce_beta_active_upload_limit();

-- Operator access to deletion intake is admin-only. Users retain their existing
-- self-scoped read/insert policies and cannot process their own request.
create policy "admins read deletion requests" on public.account_deletion_requests
  for select using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));
create policy "admins process deletion requests" on public.account_deletion_requests
  for update using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'))
  with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));
