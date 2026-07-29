-- Immutable, token-free PerformanceOptimizationState cache. No optimization values are seeded.
create table public.performance_optimization_snapshots (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  optimization_id text not null,
  engine_version text not null check(engine_version='ava-performance-optimization-v1'),
  optimization_version text not null check(optimization_version='ava-performance-optimization-state-v1'),
  input_fingerprint text not null,
  state_snapshot jsonb not null,
  twin_updated_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null,
  unique(athlete_id,optimization_id), unique(athlete_id,input_fingerprint)
);
alter table public.performance_optimization_snapshots enable row level security;
create policy "coaches read owned optimization history"
  on public.performance_optimization_snapshots for select using (
    exists(select 1 from public.athletes a where a.id=athlete_id and a.coach_id=auth.uid())
  );
-- No direct insert/update/delete policy. Snapshots are immutable and RPC-managed.

create table public.active_performance_optimizations (
  athlete_id uuid primary key references public.athletes(id) on delete cascade,
  snapshot_id uuid not null references public.performance_optimization_snapshots(id),
  updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now()
);
alter table public.active_performance_optimizations enable row level security;
create policy "coaches read owned active optimization"
  on public.active_performance_optimizations for select using (
    exists(select 1 from public.athletes a where a.id=athlete_id and a.coach_id=auth.uid())
  );

create table public.performance_optimization_invalidations (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  trigger_id text not null, trigger_type text not null check(trigger_type in (
    'new_completed_analysis','coach_override','benchmark_version','digital_twin_update',
    'competition_schedule','season_transition','research_version','projection_version',
    'manual_regeneration'
  )), source_id text not null, occurred_at timestamptz not null,
  status text not null default 'pending' check(status in ('pending','processed')),
  processed_snapshot_id uuid references public.performance_optimization_snapshots(id),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  processed_at timestamptz, unique(athlete_id,trigger_id)
);
alter table public.performance_optimization_invalidations enable row level security;
create policy "coaches read owned optimization invalidations"
  on public.performance_optimization_invalidations for select using (
    exists(select 1 from public.athletes a where a.id=athlete_id and a.coach_id=auth.uid())
  );
-- App open never invalidates or recomputes optimization.

create or replace function public.enqueue_performance_optimization_invalidation(
  p_athlete_id uuid,p_trigger jsonb
) returns boolean language plpgsql security definer set search_path=public as $$
declare v_inserted integer;
begin
  if not exists(select 1 from public.athletes where id=p_athlete_id and coach_id=auth.uid())
    then raise exception 'athlete ownership required'; end if;
  if p_trigger->>'type'='app_open'
    then raise exception 'app open does not invalidate PerformanceOptimizationState'; end if;
  if coalesce(p_trigger->>'triggerId','')='' or coalesce(p_trigger->>'sourceId','')=''
    then raise exception 'optimization invalidation trigger is incomplete'; end if;
  insert into public.performance_optimization_invalidations(
    athlete_id,trigger_id,trigger_type,source_id,occurred_at,created_by
  ) values(
    p_athlete_id,p_trigger->>'triggerId',p_trigger->>'type',p_trigger->>'sourceId',
    (p_trigger->>'occurredAt')::timestamptz,auth.uid()
  ) on conflict(athlete_id,trigger_id) do nothing;
  get diagnostics v_inserted=row_count;
  return v_inserted=1;
end $$;
revoke all on function public.enqueue_performance_optimization_invalidation(uuid,jsonb) from public;
grant execute on function public.enqueue_performance_optimization_invalidation(uuid,jsonb) to authenticated;

create table public.performance_optimization_audit (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  action text not null, selected_snapshot_id uuid not null references public.performance_optimization_snapshots(id),
  input_fingerprint text not null, actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.performance_optimization_audit enable row level security;
create policy "coaches read owned optimization audit"
  on public.performance_optimization_audit for select using (
    exists(select 1 from public.athletes a where a.id=athlete_id and a.coach_id=auth.uid())
  );

create or replace function public.append_and_activate_performance_optimization(
  p_athlete_id uuid,p_state jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not exists(select 1 from public.athletes where id=p_athlete_id and coach_id=auth.uid())
    then raise exception 'athlete ownership required'; end if;
  if p_state->>'athleteId' is distinct from p_athlete_id::text
    or p_state->>'engineVersion'<>'ava-performance-optimization-v1'
    or p_state->>'optimizationVersion'<>'ava-performance-optimization-state-v1'
    or (p_state#>>'{computePolicy,externalModelCalls}')::integer<>0
    or (p_state#>>'{computePolicy,deterministic}')::boolean is not true
    then raise exception 'PerformanceOptimizationState contract or token-free policy mismatch'; end if;
  insert into public.performance_optimization_snapshots(
    athlete_id,optimization_id,engine_version,optimization_version,input_fingerprint,
    state_snapshot,twin_updated_at,created_by,created_at
  ) values(
    p_athlete_id,p_state->>'optimizationId',p_state->>'engineVersion',
    p_state->>'optimizationVersion',p_state->>'inputFingerprint',p_state,
    (p_state#>>'{invalidationContext,twinUpdatedAt}')::timestamptz,auth.uid(),
    (p_state->>'generatedAt')::timestamptz
  ) on conflict(athlete_id,input_fingerprint) do nothing;
  select id into v_id from public.performance_optimization_snapshots
    where athlete_id=p_athlete_id and input_fingerprint=p_state->>'inputFingerprint';
  if not exists(select 1 from public.performance_optimization_snapshots
    where id=v_id and state_snapshot=p_state)
    then raise exception 'PerformanceOptimizationState fingerprint collision'; end if;
  insert into public.active_performance_optimizations(athlete_id,snapshot_id,updated_by)
    values(p_athlete_id,v_id,auth.uid()) on conflict(athlete_id) do update
    set snapshot_id=excluded.snapshot_id,updated_by=excluded.updated_by,updated_at=now();
  insert into public.performance_optimization_audit(
    athlete_id,action,selected_snapshot_id,input_fingerprint,actor_id
  ) values(p_athlete_id,'activate',v_id,p_state->>'inputFingerprint',auth.uid());
  return v_id;
end $$;
revoke all on function public.append_and_activate_performance_optimization(uuid,jsonb) from public;
grant execute on function public.append_and_activate_performance_optimization(uuid,jsonb) to authenticated;

create or replace function public.get_cached_performance_optimization(p_athlete_id uuid)
returns jsonb language plpgsql security definer stable set search_path=public as $$
begin
  if not exists(select 1 from public.athletes where id=p_athlete_id and coach_id=auth.uid())
    then raise exception 'athlete ownership required'; end if;
  return coalesce((select snapshot.state_snapshot
    from public.active_performance_optimizations active
    join public.performance_optimization_snapshots snapshot on snapshot.id=active.snapshot_id
    where active.athlete_id=p_athlete_id),'null'::jsonb);
end $$;
revoke all on function public.get_cached_performance_optimization(uuid) from public;
grant execute on function public.get_cached_performance_optimization(uuid) to authenticated;
