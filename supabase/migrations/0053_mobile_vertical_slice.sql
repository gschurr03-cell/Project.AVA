-- Batch 01: additive mobile vertical-slice ownership, uploads and deletion state.
-- Native athlete access is explicit; existing coach ownership remains unchanged.
alter table public.athletes
  add column if not exists user_id uuid unique references public.profiles(id) on delete set null;
create index if not exists athletes_user_id_idx on public.athletes(user_id) where user_id is not null;

create policy "athletes read their own athlete profile" on public.athletes
  for select using (auth.uid() = user_id);

create table public.mobile_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  idempotency_key uuid not null,
  object_path text not null unique,
  original_filename text not null,
  content_type text not null,
  expected_bytes bigint not null,
  actual_bytes bigint,
  client_sha256 text not null,
  recording_metadata jsonb not null,
  status text not null default 'initiated',
  expires_at timestamptz not null,
  completed_at timestamptz,
  analysis_id uuid unique references public.analyses(id) on delete set null,
  deletion_requested_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mobile_upload_status_valid check (
    status in ('initiated','uploaded','complete','analysis_submitted','deletion_pending','deleted','failed','cancelled')
  ),
  constraint mobile_upload_size_valid check (expected_bytes > 0 and actual_bytes is null or actual_bytes >= 0),
  constraint mobile_upload_content_type_valid check (content_type in ('video/quicktime','video/mp4')),
  constraint mobile_upload_sha256_valid check (client_sha256 ~ '^[0-9a-f]{64}$'),
  unique(user_id,idempotency_key)
);
create index mobile_uploads_athlete_idx on public.mobile_uploads(athlete_id,created_at desc);
alter table public.mobile_uploads enable row level security;
create policy "athletes read their own mobile uploads" on public.mobile_uploads
  for select using (auth.uid() = user_id);

create table public.mobile_analysis_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  upload_id uuid not null references public.mobile_uploads(id) on delete cascade,
  analysis_id uuid not null unique references public.analyses(id) on delete cascade,
  idempotency_key uuid not null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique(user_id,idempotency_key),
  unique(upload_id)
);
alter table public.mobile_analysis_requests enable row level security;
create policy "athletes read their own mobile analysis requests" on public.mobile_analysis_requests
  for select using (auth.uid() = user_id);

create table public.mobile_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  upload_id uuid not null,
  analysis_id uuid,
  request_id uuid not null,
  status text not null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint mobile_deletion_status_valid check (status in ('pending','completed','failed'))
);
alter table public.mobile_deletion_audit enable row level security;
create policy "athletes read their own mobile deletion audit" on public.mobile_deletion_audit
  for select using (auth.uid() = user_id);

-- Mobile API writes through the trusted server after bearer validation. Clients have
-- SELECT-only RLS and cannot forge upload, analysis or deletion lifecycle state.
revoke insert, update, delete on public.mobile_uploads from authenticated;
revoke insert, update, delete on public.mobile_analysis_requests from authenticated;
revoke insert, update, delete on public.mobile_deletion_audit from authenticated;
