-- Precomputed token-free CoachingState cache. No coaching values are seeded.
create table public.coaching_state_snapshots (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  coaching_state_id text not null,
  engine_version text not null check(engine_version='ava-adaptive-coaching-v1'),
  schema_version text not null check(schema_version='ava-coaching-state-v1'),
  input_fingerprint text not null,
  state_snapshot jsonb not null,
  twin_updated_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null,
  unique(athlete_id,coaching_state_id),
  unique(athlete_id,input_fingerprint)
);
alter table public.coaching_state_snapshots enable row level security;
create policy "coaches read owned coaching state history"
  on public.coaching_state_snapshots for select using (
    exists(select 1 from public.athletes a where a.id=athlete_id and a.coach_id=auth.uid())
  );
-- No direct insert/update/delete policy. State snapshots are immutable and RPC-managed.

create table public.active_coaching_states (
  athlete_id uuid primary key references public.athletes(id) on delete cascade,
  state_snapshot_id uuid not null references public.coaching_state_snapshots(id),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.active_coaching_states enable row level security;
create policy "coaches read owned active coaching state"
  on public.active_coaching_states for select using (
    exists(select 1 from public.athletes a where a.id=athlete_id and a.coach_id=auth.uid())
  );

create table public.coaching_state_invalidations (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  trigger_id text not null,
  trigger_type text not null check(trigger_type in (
    'new_completed_analysis','coach_override','benchmark_version','digital_twin_update',
    'recommendation_acceptance','recommendation_rejection','competition_schedule',
    'season_transition','research_version','manual_regeneration'
  )),
  source_id text not null,
  occurred_at timestamptz not null,
  status text not null default 'pending' check(status in ('pending','processed')),
  processed_state_id uuid references public.coaching_state_snapshots(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(athlete_id,trigger_id)
);
alter table public.coaching_state_invalidations enable row level security;
create policy "coaches read owned coaching invalidations"
  on public.coaching_state_invalidations for select using (
    exists(select 1 from public.athletes a where a.id=athlete_id and a.coach_id=auth.uid())
  );
-- App open is intentionally not a valid invalidation type.

create table public.coaching_state_audit (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  action text not null,
  previous_state_id uuid references public.coaching_state_snapshots(id),
  selected_state_id uuid not null references public.coaching_state_snapshots(id),
  input_fingerprint text not null,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.coaching_state_audit enable row level security;
create policy "coaches read owned coaching state audit"
  on public.coaching_state_audit for select using (
    exists(select 1 from public.athletes a where a.id=athlete_id and a.coach_id=auth.uid())
  );
-- Audit is append-only.

create or replace function public.enqueue_coaching_state_invalidation(
  p_athlete_id uuid,p_trigger jsonb
) returns boolean language plpgsql security definer set search_path=public as $$
declare v_inserted integer;
begin
  if not exists(select 1 from public.athletes where id=p_athlete_id and coach_id=auth.uid())
    then raise exception 'athlete ownership required'; end if;
  if p_trigger->>'type'='app_open' then raise exception 'app open does not invalidate CoachingState'; end if;
  if coalesce(p_trigger->>'triggerId','')='' or coalesce(p_trigger->>'sourceId','')=''
    then raise exception 'invalidation trigger is incomplete'; end if;
  insert into public.coaching_state_invalidations(
    athlete_id,trigger_id,trigger_type,source_id,occurred_at,created_by
  ) values(
    p_athlete_id,p_trigger->>'triggerId',p_trigger->>'type',p_trigger->>'sourceId',
    (p_trigger->>'occurredAt')::timestamptz,auth.uid()
  ) on conflict(athlete_id,trigger_id) do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 and not exists(
    select 1 from public.coaching_state_invalidations item
    where item.athlete_id=p_athlete_id and item.trigger_id=p_trigger->>'triggerId'
      and item.trigger_type=p_trigger->>'type' and item.source_id=p_trigger->>'sourceId'
      and item.occurred_at=(p_trigger->>'occurredAt')::timestamptz
  ) then raise exception 'invalidation trigger identity collision'; end if;
  return v_inserted=1;
end $$;
revoke all on function public.enqueue_coaching_state_invalidation(uuid,jsonb) from public;
grant execute on function public.enqueue_coaching_state_invalidation(uuid,jsonb) to authenticated;

create or replace function public.append_and_activate_coaching_state(
  p_athlete_id uuid,p_state jsonb,p_triggers jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_previous uuid;v_trigger jsonb;v_inserted integer;
begin
  if not exists(select 1 from public.athletes where id=p_athlete_id and coach_id=auth.uid())
    then raise exception 'athlete ownership required'; end if;
  if p_state->>'athleteId' is distinct from p_athlete_id::text
    then raise exception 'CoachingState athlete identity mismatch'; end if;
  if p_state->>'engineVersion'<>'ava-adaptive-coaching-v1'
    or p_state->>'schemaVersion'<>'ava-coaching-state-v1'
    or (p_state#>>'{computePolicy,externalModelCalls}')::integer<>0
    then raise exception 'CoachingState contract or token-free policy mismatch'; end if;
  insert into public.coaching_state_snapshots(
    athlete_id,coaching_state_id,engine_version,schema_version,input_fingerprint,
    state_snapshot,twin_updated_at,created_by,created_at
  ) values(
    p_athlete_id,p_state->>'coachingStateId',p_state->>'engineVersion',
    p_state->>'schemaVersion',p_state->>'inputFingerprint',p_state,
    (p_state#>>'{invalidationContext,twinUpdatedAt}')::timestamptz,auth.uid(),
    (p_state->>'generatedAt')::timestamptz
  ) on conflict(athlete_id,input_fingerprint) do nothing returning id into v_id;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then
    select id into v_id from public.coaching_state_snapshots
    where athlete_id=p_athlete_id and input_fingerprint=p_state->>'inputFingerprint'
      and state_snapshot=p_state;
    if v_id is null then raise exception 'CoachingState fingerprint collision'; end if;
  end if;
  select state_snapshot_id into v_previous from public.active_coaching_states where athlete_id=p_athlete_id;
  insert into public.active_coaching_states(athlete_id,state_snapshot_id,updated_by)
    values(p_athlete_id,v_id,auth.uid())
    on conflict(athlete_id) do update set state_snapshot_id=excluded.state_snapshot_id,
      updated_by=excluded.updated_by,updated_at=now();
  for v_trigger in select value from jsonb_array_elements(p_triggers) loop
    if v_trigger->>'type'='app_open' then raise exception 'app open cannot be processed as invalidation'; end if;
    insert into public.coaching_state_invalidations(
      athlete_id,trigger_id,trigger_type,source_id,occurred_at,status,
      processed_state_id,created_by,processed_at
    ) values(
      p_athlete_id,v_trigger->>'triggerId',v_trigger->>'type',v_trigger->>'sourceId',
      (v_trigger->>'occurredAt')::timestamptz,'processed',v_id,auth.uid(),now()
    ) on conflict(athlete_id,trigger_id) do update set
      status='processed',processed_state_id=v_id,processed_at=now();
  end loop;
  if v_previous is distinct from v_id then
    insert into public.coaching_state_audit(
      athlete_id,action,previous_state_id,selected_state_id,input_fingerprint,actor_id
    ) values(p_athlete_id,'append_and_activate',v_previous,v_id,p_state->>'inputFingerprint',auth.uid());
  end if;
  return v_id;
end $$;
revoke all on function public.append_and_activate_coaching_state(uuid,jsonb,jsonb) from public;
grant execute on function public.append_and_activate_coaching_state(uuid,jsonb,jsonb) to authenticated;

create or replace function public.get_cached_coaching_state(p_athlete_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not exists(select 1 from public.athletes where id=p_athlete_id and coach_id=auth.uid())
    then raise exception 'athlete ownership required'; end if;
  return jsonb_build_object(
    'activeState',(
      select snapshot.state_snapshot from public.active_coaching_states active
      join public.coaching_state_snapshots snapshot on snapshot.id=active.state_snapshot_id
      where active.athlete_id=p_athlete_id
    ),
    'pendingInvalidations',(
      select count(*) from public.coaching_state_invalidations
      where athlete_id=p_athlete_id and status='pending'
    ),
    'stateHistory',coalesce((
      select jsonb_agg(jsonb_build_object(
        'coachingStateId',coaching_state_id,'generatedAt',created_at,
        'inputFingerprint',input_fingerprint
      ) order by created_at desc)
      from public.coaching_state_snapshots where athlete_id=p_athlete_id
    ),'[]'::jsonb)
  );
end $$;
revoke all on function public.get_cached_coaching_state(uuid) from public;
grant execute on function public.get_cached_coaching_state(uuid) to authenticated;

comment on table public.active_coaching_states is
  'Single cached CoachingState served on app open. Evaluation occurs only after explicit invalidation.';

