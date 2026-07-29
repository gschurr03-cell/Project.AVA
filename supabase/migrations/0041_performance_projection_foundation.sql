-- Immutable, versioned projection audit snapshots. No projection values are seeded.
create table public.performance_projection_snapshots (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  projection_id text not null,
  projection_type text not null,
  target_metric text not null,
  engine_version text not null check (engine_version='ava-performance-projection-v1'),
  schema_version text not null check (schema_version='ava-performance-projection-contract-v1'),
  input_snapshot jsonb not null,
  output_snapshot jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (athlete_id, projection_id)
);

alter table public.performance_projection_snapshots enable row level security;

create policy "owners read athlete projection snapshots"
  on public.performance_projection_snapshots for select
  using (
    created_by = auth.uid()
    and exists (
      select 1 from public.athletes
      where athletes.id = performance_projection_snapshots.athlete_id
        and athletes.coach_id = auth.uid()
    )
  );

create policy "owners create athlete projection snapshots"
  on public.performance_projection_snapshots for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.athletes
      where athletes.id = performance_projection_snapshots.athlete_id
        and athletes.coach_id = auth.uid()
    )
  );

-- No update policy: a projection remains an immutable record of what the versioned
-- engine said with the exact evidence available at that time.

create or replace function public.get_projection_developer_summary()
returns jsonb language plpgsql stable security definer set search_path=public
as $$
begin
  if not public.is_research_reviewer() then
    raise exception 'research reviewer access required';
  end if;
  return jsonb_build_object(
    'snapshots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', snapshot.id,
        'athleteId', snapshot.athlete_id,
        'projectionId', snapshot.projection_id,
        'projectionType', snapshot.projection_type,
        'targetMetric', snapshot.target_metric,
        'engineVersion', snapshot.engine_version,
        'schemaVersion', snapshot.schema_version,
        'input', snapshot.input_snapshot,
        'output', snapshot.output_snapshot,
        'createdAt', snapshot.created_at
      ) order by snapshot.created_at desc)
      from public.performance_projection_snapshots snapshot
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.get_projection_developer_summary() from public;
grant execute on function public.get_projection_developer_summary() to authenticated;

comment on table public.performance_projection_snapshots is
  'Immutable evidence and output snapshots for conservative AVA trajectory projections. Never stores raw pose landmarks.';
