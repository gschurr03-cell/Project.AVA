-- Immutable, token-free RootCauseState cache. No root-cause conclusions are seeded.
create table public.root_cause_state_snapshots(
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  root_cause_state_id text not null,engine_version text not null
    check(engine_version='ava-root-cause-intelligence-v1'),
  state_version text not null check(state_version='ava-root-cause-state-v1'),
  input_fingerprint text not null,state_snapshot jsonb not null,
  twin_updated_at timestamptz not null,created_by uuid not null references auth.users(id),
  created_at timestamptz not null,unique(athlete_id,root_cause_state_id),
  unique(athlete_id,input_fingerprint)
);
alter table public.root_cause_state_snapshots enable row level security;
create policy "coaches read owned root cause history" on public.root_cause_state_snapshots
for select using(exists(select 1 from public.athletes a where a.id=athlete_id and a.coach_id=auth.uid()));
-- No direct insert/update/delete policy. Snapshots are immutable and RPC-managed.

create table public.active_root_cause_states(
  athlete_id uuid primary key references public.athletes(id) on delete cascade,
  snapshot_id uuid not null references public.root_cause_state_snapshots(id),
  updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now()
);
alter table public.active_root_cause_states enable row level security;
create policy "coaches read owned active root cause state" on public.active_root_cause_states
for select using(exists(select 1 from public.athletes a where a.id=athlete_id and a.coach_id=auth.uid()));

create table public.root_cause_invalidations(
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  trigger_id text not null,trigger_type text not null check(trigger_type in(
    'new_validated_analysis','digital_twin_update','coach_confirmation','research_version',
    'benchmark_version','measurement_correction','manual_regeneration'
  )),source_id text not null,occurred_at timestamptz not null,
  status text not null default 'pending' check(status in('pending','processed')),
  processed_snapshot_id uuid references public.root_cause_state_snapshots(id),
  created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
  processed_at timestamptz,unique(athlete_id,trigger_id)
);
alter table public.root_cause_invalidations enable row level security;
create policy "coaches read owned root cause invalidations" on public.root_cause_invalidations
for select using(exists(select 1 from public.athletes a where a.id=athlete_id and a.coach_id=auth.uid()));
-- App open is not an invalidation type and cannot cause online computation.

create table public.root_cause_feedback_audit(
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  action_id text not null,action_snapshot jsonb not null,
  actor_id uuid not null references auth.users(id),created_at timestamptz not null default now(),
  unique(athlete_id,action_id)
);
alter table public.root_cause_feedback_audit enable row level security;
create policy "coaches read owned root cause audit" on public.root_cause_feedback_audit
for select using(exists(select 1 from public.athletes a where a.id=athlete_id and a.coach_id=auth.uid()));

create or replace function public.append_root_cause_feedback(
  p_athlete_id uuid,p_root_cause_state_id text,p_action jsonb
) returns boolean language plpgsql security definer set search_path=public as $$
declare v_inserted integer;v_event jsonb;
begin
  if not exists(select 1 from public.athletes where id=p_athlete_id and coach_id=auth.uid())
    then raise exception 'athlete ownership required';end if;
  if coalesce(p_action->>'actionId','')='' or coalesce(p_action->>'candidateId','')=''
    or p_action->>'action' not in('confirm','reject','merge','split','downgrade','upgrade','unknown')
    then raise exception 'root cause feedback is invalid';end if;
  insert into public.root_cause_feedback_audit(
    athlete_id,action_id,action_snapshot,actor_id,
    created_at
  )values(p_athlete_id,p_action->>'actionId',p_action,auth.uid(),
    (p_action->>'createdAt')::timestamptz)
  on conflict(athlete_id,action_id)do nothing;
  get diagnostics v_inserted=row_count;
  v_event=jsonb_build_object(
    'eventId','root-cause-feedback:'||(p_action->>'actionId'),'athleteId',p_athlete_id::text,
    'occurredAt',p_action->>'createdAt','recordedAt',p_action->>'createdAt',
    'sourceVersion',p_action->>'sourceVersion','compatibilityKey',null,'confidence',1,
    'payload',jsonb_build_object(
      'kind','root_cause_feedback','rootCauseStateId',p_root_cause_state_id,
      'candidateId',p_action->>'candidateId','action',p_action->>'action',
      'relatedCandidateIds',coalesce(p_action->'relatedCandidateIds','[]'::jsonb),
      'reasonCode',p_action->>'reasonCode'
    )
  );
  perform public.append_athlete_timeline_event(p_athlete_id,v_event);
  return v_inserted=1;
end $$;
revoke all on function public.append_root_cause_feedback(uuid,text,jsonb) from public;
grant execute on function public.append_root_cause_feedback(uuid,text,jsonb) to authenticated;

create or replace function public.enqueue_root_cause_invalidation(
  p_athlete_id uuid,p_trigger jsonb
) returns boolean language plpgsql security definer set search_path=public as $$
declare v_inserted integer;
begin
  if not exists(select 1 from public.athletes where id=p_athlete_id and coach_id=auth.uid())
    then raise exception 'athlete ownership required';end if;
  if p_trigger->>'type'='app_open' then raise exception 'app open does not invalidate RootCauseState';end if;
  insert into public.root_cause_invalidations(
    athlete_id,trigger_id,trigger_type,source_id,occurred_at,created_by
  )values(p_athlete_id,p_trigger->>'triggerId',p_trigger->>'type',p_trigger->>'sourceId',
    (p_trigger->>'occurredAt')::timestamptz,auth.uid())
  on conflict(athlete_id,trigger_id)do nothing;
  get diagnostics v_inserted=row_count;return v_inserted=1;
end $$;
revoke all on function public.enqueue_root_cause_invalidation(uuid,jsonb) from public;
grant execute on function public.enqueue_root_cause_invalidation(uuid,jsonb) to authenticated;

create or replace function public.append_and_activate_root_cause_state(
  p_athlete_id uuid,p_state jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not exists(select 1 from public.athletes where id=p_athlete_id and coach_id=auth.uid())
    then raise exception 'athlete ownership required';end if;
  if p_state->>'athleteId' is distinct from p_athlete_id::text
    or p_state->>'engineVersion'<>'ava-root-cause-intelligence-v1'
    or p_state->>'stateVersion'<>'ava-root-cause-state-v1'
    or (p_state#>>'{computePolicy,externalModelCalls}')::integer<>0
    or (p_state#>>'{computePolicy,deterministic}')::boolean is not true
    then raise exception 'RootCauseState contract or token-free policy mismatch';end if;
  insert into public.root_cause_state_snapshots(
    athlete_id,root_cause_state_id,engine_version,state_version,input_fingerprint,
    state_snapshot,twin_updated_at,created_by,created_at
  )values(p_athlete_id,p_state->>'rootCauseStateId',p_state->>'engineVersion',
    p_state->>'stateVersion',p_state->>'inputFingerprint',p_state,
    (p_state#>>'{invalidationContext,twinUpdatedAt}')::timestamptz,auth.uid(),
    (p_state->>'generatedAt')::timestamptz)
  on conflict(athlete_id,input_fingerprint)do nothing;
  select id into v_id from public.root_cause_state_snapshots
    where athlete_id=p_athlete_id and input_fingerprint=p_state->>'inputFingerprint';
  if not exists(select 1 from public.root_cause_state_snapshots where id=v_id and state_snapshot=p_state)
    then raise exception 'RootCauseState fingerprint collision';end if;
  insert into public.active_root_cause_states(athlete_id,snapshot_id,updated_by)
    values(p_athlete_id,v_id,auth.uid())on conflict(athlete_id)do update
    set snapshot_id=excluded.snapshot_id,updated_by=excluded.updated_by,updated_at=now();
  return v_id;
end $$;
revoke all on function public.append_and_activate_root_cause_state(uuid,jsonb) from public;
grant execute on function public.append_and_activate_root_cause_state(uuid,jsonb) to authenticated;

create or replace function public.get_cached_root_cause_state(p_athlete_id uuid)
returns jsonb language plpgsql security definer stable set search_path=public as $$
begin
  if not exists(select 1 from public.athletes where id=p_athlete_id and coach_id=auth.uid())
    then raise exception 'athlete ownership required';end if;
  return coalesce((select snapshot.state_snapshot from public.active_root_cause_states active
    join public.root_cause_state_snapshots snapshot on snapshot.id=active.snapshot_id
    where active.athlete_id=p_athlete_id),'null'::jsonb);
end $$;
revoke all on function public.get_cached_root_cause_state(uuid) from public;
grant execute on function public.get_cached_root_cause_state(uuid) to authenticated;
