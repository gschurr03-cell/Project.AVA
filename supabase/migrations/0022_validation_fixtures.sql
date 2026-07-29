-- Internal validation-fixture registry. No authenticated-user policy is created:
-- fixture provenance is engineering data and remains service-role only.
create table if not exists public.validation_fixtures (
  fixture_id text primary key,
  schema_version text not null,
  name text not null,
  session_id uuid not null references public.sessions(id) on delete restrict,
  canonical_analysis_id uuid references public.analyses(id) on delete set null,
  protected_video_path text not null,
  expected_recording_class text not null,
  source_metadata jsonb not null default '{}'::jsonb,
  external_reference jsonb not null,
  validation_status text not null,
  manual_annotation jsonb,
  diagnostic_artifact_path text,
  notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint validation_fixtures_status_valid check (
    validation_status in ('identified', 'processing', 'manual_review_required', 'regression_ready', 'blocked')
  )
);

alter table public.validation_fixtures enable row level security;

comment on table public.validation_fixtures is
  'Service-only registry for protected real-world validation sources and incomplete external references.';
comment on column public.validation_fixtures.external_reference is
  'External evidence only; never an AVA-produced metric. Comparability must be explicit.';
