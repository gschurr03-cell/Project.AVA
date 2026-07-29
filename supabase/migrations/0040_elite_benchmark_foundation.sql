-- Population benchmark datasets are separate from single-video validation benchmarks.
-- No benchmark values are seeded by this migration.
create table public.benchmark_population_datasets (
  id uuid primary key default gen_random_uuid(),
  dataset_key text not null,
  dataset_version text not null,
  schema_version text not null check(schema_version='ava-benchmark-dataset-v1'),
  dataset_name text not null,
  comparison_level text not null,
  contract jsonb not null,
  source_ids uuid[] not null,
  review_status text not null default 'unreviewed',
  verified boolean not null default false,
  active boolean not null default false,
  created_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(dataset_key,dataset_version),
  constraint benchmark_dataset_activation_safe check (
    not active or (verified and review_status='approved_production' and reviewed_by is not null and reviewed_at is not null)
  )
);
alter table public.benchmark_population_datasets enable row level security;
create policy "research reviewers read population benchmarks"
  on public.benchmark_population_datasets for select using (public.is_research_reviewer());

create table public.benchmark_dataset_audit (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.benchmark_population_datasets(id),
  action text not null,
  actor_id uuid not null references auth.users(id),
  reason text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.benchmark_dataset_audit enable row level security;
create policy "research reviewers read benchmark audit"
  on public.benchmark_dataset_audit for select using (public.is_research_reviewer());

create or replace function public.get_benchmark_developer_catalog()
returns jsonb language plpgsql stable security definer set search_path=public
as $$
begin
  if not public.is_research_reviewer() then raise exception 'research reviewer access required'; end if;
  return jsonb_build_object(
    'datasets',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',id,'datasetKey',dataset_key,'datasetVersion',dataset_version,
        'datasetName',dataset_name,'comparisonLevel',comparison_level,
        'reviewStatus',review_status,'verified',verified,'active',active,
        'contract',contract,'updatedAt',updated_at
      ) order by updated_at desc)
      from public.benchmark_population_datasets where archived_at is null
    ),'[]'::jsonb),
    'auditEvents',(select count(*) from public.benchmark_dataset_audit)
  );
end $$;
revoke all on function public.get_benchmark_developer_catalog() from public;
grant execute on function public.get_benchmark_developer_catalog() to authenticated;

comment on table public.benchmark_population_datasets is
  'Versioned verified population distributions. Never use the legacy validation benchmark table as a peer norm.';

