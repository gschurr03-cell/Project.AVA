-- Forward-only hardening of migration 0047 for shadow/internal orchestration.
alter table public.intelligence_execution_plans
  add column registry_version text not null default 'intelligence-registry-v1',
  add column request_idempotency_key text,
  add column request_metadata jsonb not null default '{}',
  add column progress_percent smallint not null default 0 check (progress_percent between 0 and 100),
  add column failure jsonb;
create unique index intelligence_plan_request_idempotency_idx
  on public.intelligence_execution_plans(athlete_id,request_idempotency_key)
  where request_idempotency_key is not null;

alter table public.intelligence_pipeline_snapshots
  add column registry_version text not null default 'intelligence-registry-v1',
  add column adapter_versions jsonb not null default '{}',
  add column input_provenance jsonb not null default '{}',
  add column integrity_fingerprint text,
  add column activation_status text not null default 'staged'
    check (activation_status in ('staged','active','superseded','rolled_back')),
  add column rollback_metadata jsonb;

create table public.intelligence_staged_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null,
  execution_plan_id uuid not null references public.intelligence_execution_plans(id) on delete cascade,
  execution_job_id uuid not null references public.intelligence_execution_jobs(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  engine_id text not null, engine_version text not null, adapter_version text not null,
  output_contract text not null, output_fingerprint text not null,
  payload jsonb, created_at timestamptz not null default now(),
  unique(execution_plan_id,engine_id),
  check (octet_length(coalesce(payload,'null'::jsonb)::text) <= 524288)
);
create index intelligence_staged_plan_idx on public.intelligence_staged_snapshots(execution_plan_id);
alter table public.intelligence_staged_snapshots enable row level security;

create table public.intelligence_progress_events (
  id bigint generated always as identity primary key,
  execution_plan_id uuid not null references public.intelligence_execution_plans(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  progress_percent smallint not null check(progress_percent between 0 and 100),
  current_engine_id text, remaining_engine_ids jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index intelligence_progress_plan_idx on public.intelligence_progress_events(execution_plan_id,id desc);
alter table public.intelligence_progress_events enable row level security;

create or replace function public.get_intelligence_execution_plan_internal(p_plan_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'executionPlanId',id,'analysisId',analysis_id,'athleteId',athlete_id,
    'pipelineVersion',pipeline_version,'orchestrationVersion',orchestration_version,
    'engineVersions',engine_versions,'dependencyGraph',dependency_graph,
    'executionOrder',execution_order,'parallelStages','[]'::jsonb,
    'scheduledJobs',coalesce((select jsonb_agg(jsonb_build_object(
      'jobId',j.id,'engineId',j.engine_id,'engineVersion',j.engine_version,
      'dependencies',j.dependencies,'state',j.state,'attemptCount',j.attempt_count,
      'maxAttempts',j.max_attempts,'cacheHit',j.cache_hit) order by j.created_at)
      from public.intelligence_execution_jobs j where j.execution_plan_id=p.id),'[]'),
    'snapshotTargets',snapshot_targets,'createdAt',created_at,'inputFingerprint',input_fingerprint
  ) from public.intelligence_execution_plans p where id=p_plan_id;
$$;
create or replace function public.get_intelligence_execution_job_internal(p_plan_id uuid,p_job_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'jobId',id,'engineId',engine_id,'engineVersion',engine_version,
    'dependencies',dependencies,'state',state,'attemptCount',attempt_count,
    'maxAttempts',max_attempts,'cacheHit',cache_hit
  ) from public.intelligence_execution_jobs where id=p_job_id and execution_plan_id=p_plan_id;
$$;

create or replace function public.transition_intelligence_execution_job(
  p_plan_id uuid,p_job_id uuid,p_patch jsonb,p_actor_id text
) returns boolean language plpgsql security definer set search_path=public as $$
declare v_job public.intelligence_execution_jobs; v_state public.intelligence_execution_state;
begin
  if octet_length(p_patch::text)>16384 then raise exception 'job patch too large'; end if;
  select * into v_job from public.intelligence_execution_jobs
    where id=p_job_id and execution_plan_id=p_plan_id for update;
  if v_job.id is null then raise exception 'job not found'; end if;
  if v_job.state in ('succeeded','failed','cancelled','rolled_back') then
    if p_patch->>'state'=v_job.state::text then return true; end if;
    raise exception 'terminal job is immutable';
  end if;
  v_state:=coalesce((p_patch->>'state')::public.intelligence_execution_state,v_job.state);
  if not (
    (v_job.state in ('queued','waiting','ready','retrying') and v_state in ('ready','running','retrying','failed','cancelled'))
    or (v_job.state='running' and v_state in ('succeeded','retrying','failed','cancelled'))
  ) then raise exception 'invalid job transition % to %',v_job.state,v_state; end if;
  update public.intelligence_execution_jobs set state=v_state,
    attempt_count=coalesce((p_patch->>'attemptCount')::integer,attempt_count),
    cache_hit=coalesce((p_patch->>'cacheHit')::boolean,cache_hit),
    finished_at=case when v_state in ('succeeded','failed','cancelled') then now() else finished_at end,
    claimed_by=case when v_state in ('succeeded','failed','cancelled') then null else claimed_by end,
    claim_token=case when v_state in ('succeeded','failed','cancelled') then null else claim_token end,
    lease_expires_at=case when v_state in ('succeeded','failed','cancelled') then null else lease_expires_at end,
    updated_at=now() where id=p_job_id;
  return true;
end $$;

create or replace function public.append_intelligence_execution_trace(
  p_plan_id uuid,p_job_id uuid,p_trace jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_job public.intelligence_execution_jobs; v_id uuid;
begin
  if octet_length(p_trace::text)>32768 then raise exception 'trace too large'; end if;
  select * into v_job from public.intelligence_execution_jobs where id=p_job_id and execution_plan_id=p_plan_id;
  if v_job.id is null then raise exception 'job not found'; end if;
  insert into public.intelligence_execution_traces(
    execution_plan_id,execution_job_id,athlete_id,engine_id,engine_version,
    started_at,finished_at,duration_ms,input_fingerprint,output_fingerprint,
    input_reference,output_reference,cache_hit,retry_count,failure_reason
  ) values(p_plan_id,p_job_id,v_job.athlete_id,v_job.engine_id,v_job.engine_version,
    (p_trace->>'startedAt')::timestamptz,(p_trace->>'finishedAt')::timestamptz,
    (p_trace->>'durationMs')::integer,p_trace->>'inputFingerprint',p_trace->>'outputFingerprint',
    '{}'::jsonb,'{}'::jsonb,coalesce((p_trace->>'cacheHit')::boolean,false),
    coalesce((p_trace->>'retryCount')::integer,0),p_trace->'failure') returning id into v_id;
  return v_id;
end $$;

create or replace function public.schedule_intelligence_execution_retry(
  p_plan_id uuid,p_job_id uuid,p_failure jsonb,p_delay_ms integer
) returns boolean language plpgsql security definer set search_path=public as $$
declare v_job public.intelligence_execution_jobs;
begin
  if p_failure->>'kind'<>'deterministic_transient' or p_delay_ms not between 0 and 30000
  then raise exception 'retry policy violation'; end if;
  select * into v_job from public.intelligence_execution_jobs where id=p_job_id and execution_plan_id=p_plan_id for update;
  if v_job.id is null or v_job.attempt_count>=v_job.max_attempts then raise exception 'retry unavailable'; end if;
  insert into public.intelligence_retry_history(execution_job_id,athlete_id,attempt_number,failure_kind,failure_code,delay_ms)
    values(v_job.id,v_job.athlete_id,v_job.attempt_count,p_failure->>'kind',p_failure->>'code',p_delay_ms);
  update public.intelligence_execution_jobs set state='retrying',
    available_at=now()+make_interval(secs=>p_delay_ms::numeric/1000),failure_kind=p_failure->>'kind',
    failure_code=p_failure->>'code',failure_message=left(p_failure->>'message',1000),
    claimed_by=null,claim_token=null,lease_expires_at=null,updated_at=now() where id=v_job.id;
  return true;
end $$;

create or replace function public.stage_intelligence_snapshot(
  p_plan_id uuid,p_snapshot jsonb,p_actor_id text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_plan public.intelligence_execution_plans; v_job public.intelligence_execution_jobs; v_id uuid;
begin
  if octet_length(coalesce(p_snapshot->'output','null'::jsonb)::text)>524288 then raise exception 'snapshot payload too large'; end if;
  select * into v_plan from public.intelligence_execution_plans where id=p_plan_id for update;
  select * into v_job from public.intelligence_execution_jobs where execution_plan_id=p_plan_id
    and engine_id=p_snapshot->>'engineId' for update;
  if v_job.id is null or v_job.engine_version<>p_snapshot->>'engineVersion'
    or v_plan.engine_versions->>v_job.engine_id<>v_job.engine_version
  then raise exception 'snapshot identity or version mismatch'; end if;
  insert into public.intelligence_staged_snapshots(
    snapshot_id,execution_plan_id,execution_job_id,athlete_id,engine_id,engine_version,
    adapter_version,output_contract,output_fingerprint,payload
  ) values((p_snapshot->>'snapshotId')::uuid,p_plan_id,v_job.id,v_job.athlete_id,v_job.engine_id,v_job.engine_version,
    p_snapshot->>'adapterVersion','registry:'||v_job.engine_id,p_snapshot->>'outputFingerprint',p_snapshot->'output')
  on conflict(execution_plan_id,engine_id) do nothing;
  select id into v_id from public.intelligence_staged_snapshots
    where execution_plan_id=p_plan_id and engine_id=v_job.engine_id
      and output_fingerprint=p_snapshot->>'outputFingerprint';
  if v_id is null then raise exception 'staged snapshot fingerprint collision'; end if;
  update public.intelligence_execution_jobs set snapshot_id=v_id,updated_at=now() where id=v_job.id;
  return v_id;
end $$;

create or replace function public.activate_staged_intelligence_pipeline(
  p_execution_plan_id uuid,p_actor_id text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_plan public.intelligence_execution_plans; v_previous uuid; v_manifest uuid;
  v_refs jsonb; v_adapters jsonb; v_integrity text;
begin
  select * into v_plan from public.intelligence_execution_plans where id=p_execution_plan_id for update;
  if v_plan.id is null or v_plan.shadow_execution then raise exception 'plan is not eligible for authoritative activation'; end if;
  if exists(select 1 from public.intelligence_execution_jobs where execution_plan_id=v_plan.id and state<>'succeeded')
  then raise exception 'required jobs incomplete'; end if;
  if (select count(*) from public.intelligence_staged_snapshots where execution_plan_id=v_plan.id) <>
     jsonb_array_length(v_plan.snapshot_targets) then raise exception 'staged snapshot set incomplete'; end if;
  select jsonb_object_agg(engine_id,id),jsonb_object_agg(engine_id,adapter_version)
    into v_refs,v_adapters from public.intelligence_staged_snapshots where execution_plan_id=v_plan.id;
  if exists(select 1 from jsonb_array_elements_text(v_plan.snapshot_targets) target where not(v_refs ? target.value))
  then raise exception 'required snapshot missing'; end if;
  v_integrity:=encode(extensions.digest(convert_to(jsonb_build_object(
    'plan',v_plan.input_fingerprint,'pipeline',v_plan.pipeline_version,'registry',v_plan.registry_version,
    'engineVersions',v_plan.engine_versions,'adapterVersions',v_adapters,'snapshots',v_refs)::text,'UTF8'),'sha256'),'hex');
  select pipeline_snapshot_id into v_previous from public.active_intelligence_pipelines
    where athlete_id=v_plan.athlete_id for update;
  if v_previous is not null then update public.intelligence_pipeline_snapshots
    set activation_status='superseded' where id=v_previous; end if;
  insert into public.intelligence_pipeline_snapshots(
    execution_plan_id,athlete_id,analysis_id,pipeline_version,engine_versions,snapshot_ids,
    input_fingerprint,previous_pipeline_snapshot_id,activated_at,registry_version,
    adapter_versions,input_provenance,integrity_fingerprint,activation_status
  ) values(v_plan.id,v_plan.athlete_id,v_plan.analysis_id,v_plan.pipeline_version,v_plan.engine_versions,
    v_refs,v_plan.input_fingerprint,v_previous,now(),v_plan.registry_version,v_adapters,
    jsonb_build_object('analysisId',v_plan.analysis_id),v_integrity,'active') returning id into v_manifest;
  insert into public.active_intelligence_pipelines(athlete_id,pipeline_snapshot_id)
    values(v_plan.athlete_id,v_manifest) on conflict(athlete_id) do update
    set pipeline_snapshot_id=excluded.pipeline_snapshot_id,updated_at=now();
  update public.intelligence_execution_plans set state='succeeded',progress_percent=100,completed_at=now() where id=v_plan.id;
  insert into public.intelligence_orchestration_audit(athlete_id,execution_plan_id,actor_type,actor_id,action,details)
    values(v_plan.athlete_id,v_plan.id,'trusted_server',p_actor_id,'pipeline_activated',
      jsonb_build_object('manifestId',v_manifest,'previousManifestId',v_previous,'integrityFingerprint',v_integrity));
  return v_manifest;
end $$;

create or replace function public.fail_intelligence_execution_plan(
  p_plan_id uuid,p_failure jsonb,p_actor_id text
) returns boolean language plpgsql security definer set search_path=public as $$
declare v_plan public.intelligence_execution_plans;
begin
  select * into v_plan from public.intelligence_execution_plans where id=p_plan_id for update;
  if v_plan.state in ('succeeded','cancelled','rolled_back') then raise exception 'terminal plan is immutable'; end if;
  update public.intelligence_execution_plans set state='failed',failure=p_failure,completed_at=now() where id=p_plan_id;
  insert into public.intelligence_orchestration_audit(athlete_id,execution_plan_id,actor_type,actor_id,action,details)
    values(v_plan.athlete_id,v_plan.id,'worker',p_actor_id,'pipeline_failed',p_failure);
  return true;
end $$;

create or replace function public.get_activated_intelligence_snapshot(p_athlete_id uuid,p_engine_id text)
returns jsonb language sql stable security definer set search_path=public as $$
  select case when exists(select 1 from public.athletes where id=p_athlete_id and coach_id=auth.uid())
  then (select jsonb_build_object(
    'manifestId',m.id,'engineId',s.engine_id,'engineVersion',s.engine_version,
    'adapterVersion',s.adapter_version,'snapshotId',s.snapshot_id,
    'outputFingerprint',s.output_fingerprint,'payload',s.payload)
    from public.active_intelligence_pipelines active
    join public.intelligence_pipeline_snapshots m on m.id=active.pipeline_snapshot_id
    join public.intelligence_staged_snapshots s on s.id=(m.snapshot_ids->>p_engine_id)::uuid
    where active.athlete_id=p_athlete_id and m.activation_status='active' and s.engine_id=p_engine_id)
  else null end;
$$;

create or replace function public.recover_intelligence_execution_jobs(p_limit integer,p_cursor uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_ids jsonb;
begin
  if p_limit not between 1 and 200 then raise exception 'invalid recovery limit'; end if;
  with eligible as (
    select id from public.intelligence_execution_jobs where (
      (state='running' and lease_expires_at<now()) or
      (state='retrying' and available_at<=now())
    ) and (p_cursor is null or id>p_cursor) order by id limit p_limit for update skip locked
  ), recovered as (
    update public.intelligence_execution_jobs j set state='ready',claimed_by=null,
      claim_token=null,lease_expires_at=null,updated_at=now()
    from eligible where j.id=eligible.id returning j.id
  ) select coalesce(jsonb_agg(id),'[]') into v_ids from recovered;
  return jsonb_build_object('recoveredJobIds',v_ids,
    'nextCursor',case when jsonb_array_length(v_ids)=p_limit
      then v_ids->>(jsonb_array_length(v_ids)-1) else null end);
end $$;

revoke all on public.intelligence_staged_snapshots,public.intelligence_progress_events from anon,authenticated;
revoke all on function public.get_intelligence_execution_plan_internal(uuid) from public;
revoke all on function public.get_intelligence_execution_job_internal(uuid,uuid) from public;
revoke all on function public.transition_intelligence_execution_job(uuid,uuid,jsonb,text) from public;
revoke all on function public.append_intelligence_execution_trace(uuid,uuid,jsonb) from public;
revoke all on function public.schedule_intelligence_execution_retry(uuid,uuid,jsonb,integer) from public;
revoke all on function public.stage_intelligence_snapshot(uuid,jsonb,text) from public;
revoke all on function public.activate_staged_intelligence_pipeline(uuid,text) from public;
revoke all on function public.fail_intelligence_execution_plan(uuid,jsonb,text) from public;
revoke all on function public.recover_intelligence_execution_jobs(integer,uuid) from public;
revoke all on function public.get_activated_intelligence_snapshot(uuid,text) from public;
grant execute on function public.get_intelligence_execution_plan_internal(uuid) to service_role;
grant execute on function public.get_intelligence_execution_job_internal(uuid,uuid) to service_role;
grant execute on function public.transition_intelligence_execution_job(uuid,uuid,jsonb,text) to service_role;
grant execute on function public.append_intelligence_execution_trace(uuid,uuid,jsonb) to service_role;
grant execute on function public.schedule_intelligence_execution_retry(uuid,uuid,jsonb,integer) to service_role;
grant execute on function public.stage_intelligence_snapshot(uuid,jsonb,text) to service_role;
grant execute on function public.activate_staged_intelligence_pipeline(uuid,text) to service_role;
grant execute on function public.fail_intelligence_execution_plan(uuid,jsonb,text) to service_role;
grant execute on function public.recover_intelligence_execution_jobs(integer,uuid) to service_role;
grant execute on function public.get_activated_intelligence_snapshot(uuid,text) to authenticated;
