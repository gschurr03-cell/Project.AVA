-- Trusted-server Intelligence Orchestration Layer. Clients may read only owner-safe
-- operational summaries; mutations and activation are service-role only.
create type public.intelligence_execution_state as enum (
  'queued','waiting','ready','running','retrying','succeeded','failed',
  'cancelled','rolled_back'
);

create table public.intelligence_execution_plans (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  pipeline_version text not null,
  orchestration_version text not null,
  input_fingerprint text not null,
  engine_versions jsonb not null,
  dependency_graph jsonb not null,
  execution_order jsonb not null,
  snapshot_targets jsonb not null,
  state public.intelligence_execution_state not null default 'queued',
  shadow_execution boolean not null default true,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  unique (analysis_id, pipeline_version, input_fingerprint)
);
create table public.intelligence_execution_jobs (
  id uuid primary key default gen_random_uuid(),
  execution_plan_id uuid not null references public.intelligence_execution_plans(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  engine_id text not null,
  engine_version text not null,
  dependencies jsonb not null default '[]',
  state public.intelligence_execution_state not null default 'waiting',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  available_at timestamptz not null default now(),
  claimed_by text, claim_token uuid, lease_expires_at timestamptz,
  cache_hit boolean, snapshot_id uuid, failure_kind text, failure_code text,
  failure_message text, started_at timestamptz, finished_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (execution_plan_id, engine_id)
);
create index intelligence_jobs_claim_idx on public.intelligence_execution_jobs (available_at, created_at)
  where state in ('queued','ready','retrying');
create index intelligence_jobs_lease_idx on public.intelligence_execution_jobs (lease_expires_at)
  where lease_expires_at is not null;

create table public.intelligence_execution_traces (
  id uuid primary key default gen_random_uuid(),
  execution_plan_id uuid not null references public.intelligence_execution_plans(id) on delete cascade,
  execution_job_id uuid not null references public.intelligence_execution_jobs(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  engine_id text not null, engine_version text not null,
  started_at timestamptz not null, finished_at timestamptz not null,
  duration_ms integer not null check (duration_ms >= 0),
  input_fingerprint text not null, output_fingerprint text,
  input_reference jsonb not null default '{}', output_reference jsonb not null default '{}',
  cache_hit boolean not null, retry_count integer not null default 0,
  failure_reason jsonb
);
create table public.intelligence_pipeline_snapshots (
  id uuid primary key default gen_random_uuid(),
  execution_plan_id uuid not null unique references public.intelligence_execution_plans(id),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  pipeline_version text not null, engine_versions jsonb not null,
  snapshot_ids jsonb not null, input_fingerprint text not null,
  previous_pipeline_snapshot_id uuid references public.intelligence_pipeline_snapshots(id),
  activated_at timestamptz, rolled_back_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.active_intelligence_pipelines (
  athlete_id uuid primary key references public.athletes(id) on delete cascade,
  pipeline_snapshot_id uuid not null references public.intelligence_pipeline_snapshots(id),
  updated_at timestamptz not null default now()
);
create table public.intelligence_retry_history (
  id uuid primary key default gen_random_uuid(),
  execution_job_id uuid not null references public.intelligence_execution_jobs(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  attempt_number integer not null, failure_kind text not null, failure_code text not null,
  delay_ms integer not null check (delay_ms >= 0), created_at timestamptz not null default now()
);
create table public.intelligence_orchestration_invalidations (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  trigger text not null, source_engine_id text, invalidated_engine_ids jsonb not null,
  source_reference jsonb not null default '{}', processed_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.intelligence_orchestration_audit (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  execution_plan_id uuid references public.intelligence_execution_plans(id) on delete set null,
  actor_type text not null check (actor_type in ('trusted_server','worker','system')),
  actor_id text not null, action text not null, details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create function public.claim_intelligence_execution_job(
  p_worker_id text, p_lease_seconds integer default 60
) returns setof public.intelligence_execution_jobs
language plpgsql security definer set search_path=public as $$
begin
  if length(trim(coalesce(p_worker_id,'')))=0 or p_lease_seconds not between 15 and 900
  then raise exception 'invalid worker claim configuration'; end if;
  -- A lease interruption is recovery of the same deterministic attempt, not a retry.
  update public.intelligence_execution_jobs set state='ready',claimed_by=null,claim_token=null,
    lease_expires_at=null,updated_at=now()
  where state='running' and lease_expires_at < now();
  return query with candidate as (
    select j.id from public.intelligence_execution_jobs j
    where j.state in ('queued','waiting','ready','retrying') and j.available_at <= now()
      and not exists (
        select 1 from jsonb_array_elements_text(j.dependencies) dependency
        where not exists (
          select 1 from public.intelligence_execution_jobs prerequisite
          where prerequisite.execution_plan_id=j.execution_plan_id
            and prerequisite.engine_id=dependency.value and prerequisite.state='succeeded'
        )
      )
    order by j.available_at,j.created_at for update skip locked limit 1
  )
  update public.intelligence_execution_jobs j set state='running',claimed_by=p_worker_id,
    claim_token=gen_random_uuid(),lease_expires_at=now()+make_interval(secs=>p_lease_seconds),
    started_at=coalesce(j.started_at,now()),updated_at=now()
  from candidate where j.id=candidate.id returning j.*;
end $$;

create function public.heartbeat_intelligence_execution_job(
  p_job_id uuid,p_claim_token uuid,p_worker_id text,p_lease_seconds integer default 60
) returns boolean language sql security definer set search_path=public as $$
  update public.intelligence_execution_jobs set
    lease_expires_at=now()+make_interval(secs=>p_lease_seconds),updated_at=now()
  where id=p_job_id and claim_token=p_claim_token and claimed_by=p_worker_id
    and state='running' and lease_expires_at>now()
  returning true;
$$;

alter table public.intelligence_execution_plans enable row level security;
alter table public.intelligence_execution_jobs enable row level security;
alter table public.intelligence_execution_traces enable row level security;
alter table public.intelligence_pipeline_snapshots enable row level security;
alter table public.active_intelligence_pipelines enable row level security;
alter table public.intelligence_retry_history enable row level security;
alter table public.intelligence_orchestration_invalidations enable row level security;
alter table public.intelligence_orchestration_audit enable row level security;

-- One transaction publishes a manifest only after every required job succeeded.
create function public.activate_intelligence_pipeline(
  p_execution_plan_id uuid, p_snapshot_ids jsonb, p_actor_id text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_plan public.intelligence_execution_plans; v_previous uuid; v_snapshot uuid;
begin
  select * into v_plan from public.intelligence_execution_plans where id=p_execution_plan_id for update;
  if v_plan.id is null then raise exception 'missing execution plan'; end if;
  if exists (
    select 1 from public.intelligence_execution_jobs
    where execution_plan_id=v_plan.id and state <> 'succeeded'
  ) then raise exception 'pipeline jobs are incomplete'; end if;
  if (select count(*) from jsonb_object_keys(p_snapshot_ids)) <>
     (select count(*) from public.intelligence_execution_jobs where execution_plan_id=v_plan.id)
  then raise exception 'snapshot manifest is incomplete'; end if;
  if exists (
    select 1 from public.intelligence_execution_jobs
    where execution_plan_id=v_plan.id and not (p_snapshot_ids ? engine_id)
  ) then raise exception 'snapshot manifest engine mismatch'; end if;
  select pipeline_snapshot_id into v_previous from public.active_intelligence_pipelines
    where athlete_id=v_plan.athlete_id for update;
  insert into public.intelligence_pipeline_snapshots (
    execution_plan_id,athlete_id,analysis_id,pipeline_version,engine_versions,
    snapshot_ids,input_fingerprint,previous_pipeline_snapshot_id,activated_at
  ) values (
    v_plan.id,v_plan.athlete_id,v_plan.analysis_id,v_plan.pipeline_version,v_plan.engine_versions,
    p_snapshot_ids,v_plan.input_fingerprint,v_previous,now()
  ) returning id into v_snapshot;
  insert into public.active_intelligence_pipelines(athlete_id,pipeline_snapshot_id)
    values(v_plan.athlete_id,v_snapshot)
    on conflict(athlete_id) do update set pipeline_snapshot_id=excluded.pipeline_snapshot_id,updated_at=now();
  update public.intelligence_execution_plans set state='succeeded',completed_at=now() where id=v_plan.id;
  insert into public.intelligence_orchestration_audit(athlete_id,execution_plan_id,actor_type,actor_id,action,details)
    values(v_plan.athlete_id,v_plan.id,'trusted_server',p_actor_id,'pipeline_activated',
      jsonb_build_object('snapshotId',v_snapshot,'previousSnapshotId',v_previous));
  return v_snapshot;
end $$;

create function public.rollback_intelligence_pipeline(
  p_execution_plan_id uuid, p_actor_id text, p_reason text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_plan public.intelligence_execution_plans; v_current public.intelligence_pipeline_snapshots; v_target uuid;
begin
  select * into v_plan from public.intelligence_execution_plans where id=p_execution_plan_id for update;
  select s.* into v_current from public.active_intelligence_pipelines a
    join public.intelligence_pipeline_snapshots s on s.id=a.pipeline_snapshot_id
    where a.athlete_id=v_plan.athlete_id for update;
  v_target := v_current.previous_pipeline_snapshot_id;
  if v_target is null then raise exception 'no previous pipeline snapshot'; end if;
  update public.active_intelligence_pipelines set pipeline_snapshot_id=v_target,updated_at=now()
    where athlete_id=v_plan.athlete_id;
  update public.intelligence_pipeline_snapshots set rolled_back_at=now() where id=v_current.id;
  update public.intelligence_execution_plans set state='rolled_back',completed_at=now() where id=v_plan.id;
  insert into public.intelligence_orchestration_audit(athlete_id,execution_plan_id,actor_type,actor_id,action,details)
    values(v_plan.athlete_id,v_plan.id,'trusted_server',p_actor_id,'pipeline_rolled_back',
      jsonb_build_object('fromSnapshotId',v_current.id,'toSnapshotId',v_target,'reason',p_reason));
  return v_target;
end $$;

-- Owner-safe, read-only dashboard payload. No client mutation RPC exists.
create function public.get_intelligence_orchestration_dashboard(p_athlete_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select case when exists(select 1 from public.athletes where id=p_athlete_id and coach_id=auth.uid())
  then jsonb_build_object(
    'plans',coalesce((select jsonb_agg(x order by x.created_at desc) from
      (select id,state,pipeline_version,created_at,started_at,completed_at from public.intelligence_execution_plans
       where athlete_id=p_athlete_id order by created_at desc limit 25) x),'[]'),
    'jobs',coalesce((select jsonb_agg(x order by x.created_at desc) from
      (select id,execution_plan_id,engine_id,engine_version,state,attempt_count,cache_hit,failure_code,created_at
       from public.intelligence_execution_jobs where athlete_id=p_athlete_id order by created_at desc limit 100) x),'[]'),
    'activeSnapshot',(select to_jsonb(s) from public.active_intelligence_pipelines a
      join public.intelligence_pipeline_snapshots s on s.id=a.pipeline_snapshot_id where a.athlete_id=p_athlete_id),
    'retries',coalesce((select jsonb_agg(x order by x.created_at desc) from
      (select execution_job_id,attempt_number,failure_kind,failure_code,delay_ms,created_at
       from public.intelligence_retry_history where athlete_id=p_athlete_id order by created_at desc limit 50) x),'[]')
  ) else null end;
$$;

revoke all on public.intelligence_execution_plans, public.intelligence_execution_jobs,
  public.intelligence_execution_traces, public.intelligence_pipeline_snapshots,
  public.active_intelligence_pipelines, public.intelligence_retry_history,
  public.intelligence_orchestration_invalidations, public.intelligence_orchestration_audit
  from anon, authenticated;
revoke all on function public.activate_intelligence_pipeline(uuid,jsonb,text) from public;
revoke all on function public.rollback_intelligence_pipeline(uuid,text,text) from public;
revoke all on function public.get_intelligence_orchestration_dashboard(uuid) from public;
revoke all on function public.claim_intelligence_execution_job(text,integer) from public;
revoke all on function public.heartbeat_intelligence_execution_job(uuid,uuid,text,integer) from public;
grant execute on function public.activate_intelligence_pipeline(uuid,jsonb,text) to service_role;
grant execute on function public.rollback_intelligence_pipeline(uuid,text,text) to service_role;
grant execute on function public.claim_intelligence_execution_job(text,integer) to service_role;
grant execute on function public.heartbeat_intelligence_execution_job(uuid,uuid,text,integer) to service_role;
grant execute on function public.get_intelligence_orchestration_dashboard(uuid) to authenticated;
