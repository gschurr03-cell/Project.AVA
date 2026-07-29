-- Append-only athlete memory and immutable Digital Twin versions. No athlete data is seeded.
create table public.athlete_timeline_events (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  event_id text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null,
  source_version text not null,
  compatibility_key text,
  confidence numeric not null check (confidence between 0 and 1),
  payload jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (athlete_id, event_id)
);
create index athlete_timeline_events_history_idx
  on public.athlete_timeline_events (athlete_id, occurred_at, event_id);
alter table public.athlete_timeline_events enable row level security;
create policy "coaches read owned athlete timeline"
  on public.athlete_timeline_events for select using (
    created_by=auth.uid() and exists (
      select 1 from public.athletes a where a.id=athlete_id and a.coach_id=auth.uid()
    )
  );
-- No direct write policy. Owner-scoped append RPC validates identity and idempotency.
-- Deliberately no update/delete policy: accumulated historical facts are append-only.

create table public.athlete_digital_twin_snapshots (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  twin_id text not null,
  snapshot_id text not null,
  snapshot_version text not null check(snapshot_version='ava-athlete-digital-twin-snapshot-v1'),
  engine_version text not null check(engine_version='ava-athlete-digital-twin-v1'),
  schema_version text not null check(schema_version='ava-athlete-digital-twin-contract-v1'),
  previous_snapshot_id uuid references public.athlete_digital_twin_snapshots(id),
  reason text not null,
  twin_snapshot jsonb not null,
  source_event_count integer not null check(source_event_count >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (athlete_id, snapshot_id)
);
alter table public.athlete_digital_twin_snapshots enable row level security;
create policy "coaches read owned twin snapshots"
  on public.athlete_digital_twin_snapshots for select using (
    created_by=auth.uid() and exists (
      select 1 from public.athletes a where a.id=athlete_id and a.coach_id=auth.uid()
    )
  );
-- No direct write policy. Snapshot creation and activation are one transaction through RPC.
-- No update/delete policy. Snapshot contents are immutable.

create table public.athlete_digital_twin_state (
  athlete_id uuid primary key references public.athletes(id) on delete cascade,
  active_snapshot_id uuid not null references public.athlete_digital_twin_snapshots(id),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.athlete_digital_twin_state enable row level security;
create policy "coaches read owned twin state"
  on public.athlete_digital_twin_state for select using (
    updated_by=auth.uid() and exists (
      select 1 from public.athletes a where a.id=athlete_id and a.coach_id=auth.uid()
    )
  );

create table public.athlete_digital_twin_audit (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  action text not null,
  previous_snapshot_id uuid references public.athlete_digital_twin_snapshots(id),
  selected_snapshot_id uuid not null references public.athlete_digital_twin_snapshots(id),
  reason text not null,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.athlete_digital_twin_audit enable row level security;
create policy "coaches read owned twin audit"
  on public.athlete_digital_twin_audit for select using (
    actor_id=auth.uid() and exists (
      select 1 from public.athletes a where a.id=athlete_id and a.coach_id=auth.uid()
    )
  );
-- Audit is append-only.

create or replace function public.append_athlete_timeline_event(
  p_athlete_id uuid, p_event jsonb
) returns boolean language plpgsql security definer set search_path=public as $$
declare v_inserted integer;
begin
  if not exists(select 1 from public.athletes where id=p_athlete_id and coach_id=auth.uid())
    then raise exception 'athlete ownership required'; end if;
  if p_event->>'athleteId' is distinct from p_athlete_id::text
    then raise exception 'event athlete identity mismatch'; end if;
  if coalesce(p_event->>'eventId','')='' or coalesce(p_event->>'sourceVersion','')=''
    or coalesce(p_event#>>'{payload,kind}','')=''
    then raise exception 'event contract is incomplete'; end if;
  insert into public.athlete_timeline_events(
    athlete_id,event_id,event_type,occurred_at,recorded_at,source_version,
    compatibility_key,confidence,payload,created_by
  ) values(
    p_athlete_id,p_event->>'eventId',p_event#>>'{payload,kind}',
    (p_event->>'occurredAt')::timestamptz,(p_event->>'recordedAt')::timestamptz,
    p_event->>'sourceVersion',p_event->>'compatibilityKey',
    (p_event->>'confidence')::numeric,p_event->'payload',auth.uid()
  ) on conflict(athlete_id,event_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted=0 and not exists(
    select 1 from public.athlete_timeline_events event
    where event.athlete_id=p_athlete_id and event.event_id=p_event->>'eventId'
      and event.event_type=p_event#>>'{payload,kind}'
      and event.occurred_at=(p_event->>'occurredAt')::timestamptz
      and event.recorded_at=(p_event->>'recordedAt')::timestamptz
      and event.source_version=p_event->>'sourceVersion'
      and event.compatibility_key is not distinct from p_event->>'compatibilityKey'
      and event.confidence=(p_event->>'confidence')::numeric
      and event.payload=p_event->'payload'
  ) then raise exception 'historical event identity collision'; end if;
  return v_inserted=1;
end $$;
revoke all on function public.append_athlete_timeline_event(uuid,jsonb) from public;
grant execute on function public.append_athlete_timeline_event(uuid,jsonb) to authenticated;

create or replace function public.append_and_activate_athlete_digital_twin_snapshot(
  p_athlete_id uuid, p_snapshot jsonb, p_reason text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_previous uuid; v_inserted integer;
begin
  if not exists(select 1 from public.athletes where id=p_athlete_id and coach_id=auth.uid())
    then raise exception 'athlete ownership required'; end if;
  if p_snapshot->>'athleteId' is distinct from p_athlete_id::text
    or p_snapshot#>>'{twin,athleteId}' is distinct from p_athlete_id::text
    then raise exception 'snapshot athlete identity mismatch'; end if;
  if length(trim(p_reason))<3 or p_reason is distinct from p_snapshot->>'reason'
    then raise exception 'snapshot reason mismatch'; end if;
  select id into v_previous from public.athlete_digital_twin_snapshots
    where athlete_id=p_athlete_id and snapshot_id=p_snapshot->>'previousSnapshotId';
  if p_snapshot->>'previousSnapshotId' is not null and v_previous is null
    then raise exception 'previous twin snapshot does not exist for athlete'; end if;
  insert into public.athlete_digital_twin_snapshots(
    athlete_id,twin_id,snapshot_id,snapshot_version,engine_version,schema_version,
    previous_snapshot_id,reason,twin_snapshot,source_event_count,created_by,created_at
  ) values(
    p_athlete_id,p_snapshot#>>'{twin,twinId}',p_snapshot->>'snapshotId',
    p_snapshot->>'snapshotVersion',p_snapshot#>>'{twin,engineVersion}',
    p_snapshot#>>'{twin,schemaVersion}',v_previous,p_reason,p_snapshot->'twin',
    jsonb_array_length(p_snapshot#>'{twin,timeline}'),auth.uid(),
    (p_snapshot->>'createdAt')::timestamptz
  ) on conflict(athlete_id,snapshot_id) do nothing returning id into v_id;
  get diagnostics v_inserted = row_count;
  if v_inserted=0 then
    select id into v_id from public.athlete_digital_twin_snapshots
      where athlete_id=p_athlete_id and snapshot_id=p_snapshot->>'snapshotId'
        and twin_snapshot=p_snapshot->'twin' and reason=p_reason;
    if v_id is null then raise exception 'twin snapshot identity collision'; end if;
  end if;
  select active_snapshot_id into v_previous from public.athlete_digital_twin_state
    where athlete_id=p_athlete_id;
  insert into public.athlete_digital_twin_state(athlete_id,active_snapshot_id,updated_by)
    values(p_athlete_id,v_id,auth.uid())
    on conflict(athlete_id) do update set active_snapshot_id=excluded.active_snapshot_id,
      updated_by=excluded.updated_by,updated_at=now();
  if v_previous is distinct from v_id then
    insert into public.athlete_digital_twin_audit(
      athlete_id,action,previous_snapshot_id,selected_snapshot_id,reason,actor_id
    ) values(p_athlete_id,'append_and_activate_snapshot',v_previous,v_id,p_reason,auth.uid());
  end if;
  return v_id;
end $$;
revoke all on function public.append_and_activate_athlete_digital_twin_snapshot(uuid,jsonb,text) from public;
grant execute on function public.append_and_activate_athlete_digital_twin_snapshot(uuid,jsonb,text) to authenticated;

create or replace function public.activate_athlete_digital_twin_snapshot(
  p_athlete_id uuid, p_snapshot_id uuid, p_reason text
) returns boolean language plpgsql security definer set search_path=public as $$
declare v_previous uuid;
begin
  if not exists(select 1 from public.athletes where id=p_athlete_id and coach_id=auth.uid())
    then raise exception 'athlete ownership required'; end if;
  if length(trim(p_reason)) < 3 then raise exception 'rollback reason required'; end if;
  if not exists(select 1 from public.athlete_digital_twin_snapshots
    where id=p_snapshot_id and athlete_id=p_athlete_id)
    then raise exception 'snapshot does not belong to athlete'; end if;
  select active_snapshot_id into v_previous from public.athlete_digital_twin_state
    where athlete_id=p_athlete_id;
  insert into public.athlete_digital_twin_state(athlete_id,active_snapshot_id,updated_by)
    values(p_athlete_id,p_snapshot_id,auth.uid())
    on conflict(athlete_id) do update set active_snapshot_id=excluded.active_snapshot_id,
      updated_by=excluded.updated_by,updated_at=now();
  insert into public.athlete_digital_twin_audit(
    athlete_id,action,previous_snapshot_id,selected_snapshot_id,reason,actor_id
  ) values(p_athlete_id,'activate_snapshot',v_previous,p_snapshot_id,p_reason,auth.uid());
  return true;
end $$;
revoke all on function public.activate_athlete_digital_twin_snapshot(uuid,uuid,text) from public;
grant execute on function public.activate_athlete_digital_twin_snapshot(uuid,uuid,text) to authenticated;

create or replace function public.get_athlete_digital_twin_summary(p_athlete_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not exists(select 1 from public.athletes where id=p_athlete_id and coach_id=auth.uid())
    then raise exception 'athlete ownership required'; end if;
  return jsonb_build_object(
    'activeTwin', (
      select snapshot.twin_snapshot
      from public.athlete_digital_twin_state state
      join public.athlete_digital_twin_snapshots snapshot on snapshot.id=state.active_snapshot_id
      where state.athlete_id=p_athlete_id
    ),
    'snapshots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',id,'snapshotId',snapshot_id,'reason',reason,'createdAt',created_at,
        'sourceEventCount',source_event_count,'engineVersion',engine_version
      ) order by created_at desc)
      from public.athlete_digital_twin_snapshots where athlete_id=p_athlete_id
    ),'[]'::jsonb),
    'auditEvents', (select count(*) from public.athlete_digital_twin_audit where athlete_id=p_athlete_id)
  );
end $$;
revoke all on function public.get_athlete_digital_twin_summary(uuid) from public;
grant execute on function public.get_athlete_digital_twin_summary(uuid) to authenticated;

comment on table public.athlete_timeline_events is
  'Append-only versioned athlete facts. Never regenerates or overwrites historical upstream output.';
comment on table public.athlete_digital_twin_state is
  'Mutable active snapshot pointer. Rollback selects history; it never mutates snapshot truth.';
