alter type public.session_status add value if not exists 'uploading' before 'uploaded';

create table if not exists public.user_consents (
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_type text not null,
  consent_version text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, consent_type, consent_version),
  constraint user_consents_type_valid check (consent_type in ('video_biomechanics'))
);
alter table public.user_consents enable row level security;
create policy "users manage their own consents" on public.user_consents for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'requested',
  requested_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  constraint account_deletion_status_valid check (status in ('requested','acknowledged','processing','completed','cancelled'))
);
alter table public.account_deletion_requests enable row level security;
create policy "users read their own deletion requests" on public.account_deletion_requests
  for select using (auth.uid() = user_id);
create policy "users request their own deletion" on public.account_deletion_requests
  for insert with check (auth.uid() = user_id and status = 'requested');
create unique index account_deletion_one_open_request
  on public.account_deletion_requests(user_id)
  where status in ('requested','acknowledged','processing');

