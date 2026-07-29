-- Durable production analysis queue. Workers access it only through service-role
-- RPCs; athlete clients receive safe status through get_analysis_job_status().
create type public.analysis_job_status as enum (
  'queued', 'claimed', 'downloading', 'validating', 'processing',
  'generating_results', 'uploading_artifacts', 'completing', 'completed',
  'retry_scheduled', 'failed', 'dead_lettered', 'cancelled'
);

create table public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null unique references public.analyses(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  status public.analysis_job_status not null default 'queued',
  priority smallint not null default 100,
  attempt_count integer not null default 0,
  max_attempts integer not null default 4,
  claimed_by text,
  claim_token uuid,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  dead_lettered_at timestamptz,
  last_error_code text,
  last_error_message text,
  last_error_stage text,
  failure_category text,
  user_message text,
  worker_version text,
  analysis_pipeline_version text not null,
  source_video_path text not null,
  output_artifact_paths jsonb not null default '{}'::jsonb,
  manual_retry_allowed boolean not null default false,
  user_action_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analysis_jobs_attempts_valid check (attempt_count >= 0 and max_attempts between 1 and 20),
  constraint analysis_jobs_priority_valid check (priority between 0 and 1000),
  constraint analysis_jobs_claim_fields check (
    (claim_token is null and claimed_by is null and lease_expires_at is null)
    or (claim_token is not null and claimed_by is not null and lease_expires_at is not null)
  )
);

create index analysis_jobs_eligible_idx
  on public.analysis_jobs (priority, next_attempt_at, created_at)
  where status in ('queued', 'retry_scheduled');
create index analysis_jobs_lease_idx on public.analysis_jobs (lease_expires_at)
  where lease_expires_at is not null;
alter table public.analysis_jobs enable row level security;
-- Deliberately no client table policy: internal errors, worker ids, and attempts stay private.

create function public.sync_analysis_job_parent_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'claimed' then
    update public.analyses set status='running' where id=new.analysis_id and status <> 'complete';
    update public.sessions set status='analyzing' where id=new.session_id and status <> 'complete';
  elsif new.status in ('queued','retry_scheduled') then
    update public.analyses set status='queued' where id=new.analysis_id and status <> 'complete';
    update public.sessions set status='queued' where id=new.session_id and status <> 'complete';
  end if;
  return new;
end;
$$;
create trigger analysis_jobs_sync_parent after insert or update of status on public.analysis_jobs
  for each row execute function public.sync_analysis_job_parent_status();

create function public.enqueue_analysis_job()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.analysis_jobs (
    analysis_id, session_id, athlete_id, analysis_pipeline_version, source_video_path
  )
  select new.id, s.id, s.athlete_id,
         coalesce(new.analysis_pipeline_version, 'legacy'), s.video_path
  from public.sessions s where s.id = new.session_id and s.video_path is not null
  on conflict (analysis_id) do nothing;
  return new;
end;
$$;
create trigger analyses_enqueue_job after insert on public.analyses
  for each row execute function public.enqueue_analysis_job();

-- Backfill queued/running legacy analyses without changing completed history.
insert into public.analysis_jobs (
  analysis_id, session_id, athlete_id, status, analysis_pipeline_version, source_video_path
)
select a.id, s.id, s.athlete_id, 'queued', coalesce(a.analysis_pipeline_version, 'legacy'), s.video_path
from public.analyses a join public.sessions s on s.id = a.session_id
where a.status in ('queued', 'running') and s.video_path is not null
on conflict (analysis_id) do nothing;

create or replace function public.claim_analysis_job(
  p_worker_id text, p_worker_version text, p_lease_seconds integer default 120
) returns setof public.analysis_jobs
language plpgsql security definer set search_path = public as $$
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 or p_lease_seconds not between 30 and 900 then
    raise exception 'invalid worker claim configuration';
  end if;

  -- Recover expired work. Exhausted attempts dead-letter; other jobs back off briefly.
  update public.analysis_jobs
  set status = case when attempt_count >= max_attempts then 'dead_lettered'::public.analysis_job_status
                    else 'retry_scheduled'::public.analysis_job_status end,
      next_attempt_at = case when attempt_count >= max_attempts then next_attempt_at else now() + interval '15 seconds' end,
      dead_lettered_at = case when attempt_count >= max_attempts then now() else dead_lettered_at end,
      failure_category = 'worker_interruption', last_error_code = 'lease_expired',
      last_error_stage = status::text, last_error_message = 'Worker lease expired.',
      user_message = 'Analysis was interrupted and will be retried.',
      manual_retry_allowed = attempt_count >= max_attempts,
      claim_token = null, claimed_by = null, claimed_at = null,
      lease_expires_at = null, heartbeat_at = null, updated_at = now()
  where status in ('claimed','downloading','validating','processing','generating_results','uploading_artifacts','completing')
    and lease_expires_at < now();

  return query
  with candidate as (
    select id from public.analysis_jobs
    where status in ('queued','retry_scheduled') and next_attempt_at <= now()
      and attempt_count < max_attempts
    order by priority asc, next_attempt_at asc, created_at asc
    for update skip locked limit 1
  )
  update public.analysis_jobs j set
    status = 'claimed', attempt_count = j.attempt_count + 1,
    claimed_by = p_worker_id, claim_token = gen_random_uuid(), claimed_at = now(),
    lease_expires_at = now() + make_interval(secs => p_lease_seconds), heartbeat_at = now(),
    started_at = coalesce(j.started_at, now()), worker_version = p_worker_version, updated_at = now()
  from candidate where j.id = candidate.id returning j.*;
end;
$$;

create or replace function public.heartbeat_analysis_job(
  p_job_id uuid, p_claim_token uuid, p_worker_id text, p_lease_seconds integer default 120
) returns boolean language sql security definer set search_path = public as $$
  update public.analysis_jobs set heartbeat_at = now(),
    lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now()
  where id = p_job_id and claim_token = p_claim_token and claimed_by = p_worker_id
    and lease_expires_at > now()
    and status in ('claimed','downloading','validating','processing','generating_results','uploading_artifacts','completing')
  returning true;
$$;

create or replace function public.set_analysis_job_stage(
  p_job_id uuid, p_claim_token uuid, p_worker_id text, p_status public.analysis_job_status
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_rows integer;
begin
  if p_status not in ('downloading','validating','processing','generating_results','uploading_artifacts','completing') then
    raise exception 'invalid processing stage';
  end if;
  update public.analysis_jobs set status = p_status, updated_at = now()
  where id = p_job_id and claim_token = p_claim_token and claimed_by = p_worker_id
    and lease_expires_at > now();
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

create or replace function public.requeue_analysis_job(p_job_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_job public.analysis_jobs; begin
  update public.analysis_jobs set status='queued', next_attempt_at=now(),
    claim_token=null, claimed_by=null, claimed_at=null, lease_expires_at=null,
    heartbeat_at=null, manual_retry_allowed=false, updated_at=now()
  where id=p_job_id and status in ('failed','dead_lettered','cancelled') returning * into v_job;
  if v_job.id is null then return false; end if;
  update public.analyses set status='queued', error=null, completed_at=null where id=v_job.analysis_id;
  update public.sessions set status='queued' where id=v_job.session_id;
  return true;
end;
$$;

create or replace function public.cancel_analysis_job(p_job_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_job public.analysis_jobs; begin
  update public.analysis_jobs set status='cancelled', claim_token=null, claimed_by=null,
    claimed_at=null, lease_expires_at=null, heartbeat_at=null, updated_at=now()
  where id=p_job_id and status not in ('completed','cancelled') returning * into v_job;
  if v_job.id is null then return false; end if;
  update public.analyses set status='failed', error='Analysis cancelled.', completed_at=now() where id=v_job.analysis_id;
  update public.sessions set status='failed' where id=v_job.session_id;
  return true;
end;
$$;

create or replace function public.fail_analysis_job(
  p_job_id uuid, p_claim_token uuid, p_worker_id text, p_error_code text,
  p_error_message text, p_error_stage text, p_failure_category text,
  p_user_message text, p_retryable boolean, p_backoff_seconds integer,
  p_user_action_required boolean default false
) returns public.analysis_job_status language plpgsql security definer set search_path = public as $$
declare v_job public.analysis_jobs; v_status public.analysis_job_status;
begin
  select * into v_job from public.analysis_jobs where id = p_job_id for update;
  if v_job.claim_token is distinct from p_claim_token or v_job.claimed_by is distinct from p_worker_id
     or v_job.lease_expires_at <= now() then raise exception 'stale job claim'; end if;
  v_status := case
    when p_retryable and v_job.attempt_count < v_job.max_attempts then 'retry_scheduled'
    when p_retryable then 'dead_lettered'
    else 'failed' end;
  update public.analysis_jobs set status = v_status,
    next_attempt_at = case when v_status = 'retry_scheduled' then now() + make_interval(secs => greatest(1,p_backoff_seconds)) else next_attempt_at end,
    failed_at = case when v_status = 'failed' then now() else failed_at end,
    dead_lettered_at = case when v_status = 'dead_lettered' then now() else dead_lettered_at end,
    last_error_code = p_error_code, last_error_message = left(p_error_message, 2000),
    last_error_stage = p_error_stage, failure_category = p_failure_category,
    user_message = p_user_message, user_action_required = p_user_action_required,
    manual_retry_allowed = v_status in ('failed','dead_lettered'),
    claim_token = null, claimed_by = null, claimed_at = null, lease_expires_at = null,
    heartbeat_at = null, updated_at = now() where id = p_job_id;
  if v_status in ('failed','dead_lettered') then
    update public.analyses set status = 'failed', error = p_user_message, completed_at = now() where id = v_job.analysis_id and status <> 'complete';
    update public.sessions set status = 'failed' where id = v_job.session_id and status <> 'complete';
  end if;
  return v_status;
end;
$$;

create or replace function public.complete_analysis_job(
  p_job_id uuid, p_claim_token uuid, p_worker_id text, p_model_version text,
  p_metrics jsonb, p_provenance jsonb, p_input_snapshot jsonb, p_result_payload jsonb,
  p_keypoints_path text, p_source_fps numeric, p_artifact_paths jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_job public.analysis_jobs;
begin
  select * into v_job from public.analysis_jobs where id = p_job_id for update;
  if v_job.status = 'completed' then return true; end if;
  if v_job.claim_token is distinct from p_claim_token or v_job.claimed_by is distinct from p_worker_id
     or v_job.lease_expires_at <= now() then raise exception 'stale job claim'; end if;
  if coalesce((p_provenance->>'analysisFps')::numeric, 0) <> 60
     or p_provenance->>'poseModelName' <> 'mediapipe'
     or p_input_snapshot is distinct from (select input_snapshot from public.analyses where id=v_job.analysis_id)
     or p_result_payload->>'analysisId' <> v_job.analysis_id::text
     or p_result_payload->>'sessionId' <> v_job.session_id::text
     or p_result_payload->>'athleteId' <> v_job.athlete_id::text then
    raise exception 'invalid production result identity or provenance';
  end if;
  update public.analyses set status='complete', model_version=p_model_version,
    metrics=p_metrics, provenance=p_provenance, input_snapshot=p_input_snapshot,
    result_payload=p_result_payload, analysis_fps=60, source_fps=p_source_fps,
    keypoints_path=p_keypoints_path, error=null, completed_at=now()
  where id=v_job.analysis_id and status <> 'complete';
  update public.sessions set status='complete' where id=v_job.session_id;
  update public.analysis_jobs set status='completed', completed_at=now(),
    output_artifact_paths=coalesce(p_artifact_paths,'{}'::jsonb),
    claim_token=null, claimed_by=null, claimed_at=null, lease_expires_at=null,
    heartbeat_at=null, updated_at=now() where id=p_job_id;
  return true;
end;
$$;

create or replace function public.get_analysis_job_status(p_analysis_id uuid)
returns table(status public.analysis_job_status, user_message text, attempt_count integer, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select j.status, j.user_message, j.attempt_count, j.updated_at
  from public.analysis_jobs j join public.sessions s on s.id=j.session_id
  join public.athletes a on a.id=s.athlete_id
  where j.analysis_id=p_analysis_id and a.coach_id=auth.uid();
$$;

revoke all on public.analysis_jobs from anon, authenticated;
revoke all on function public.claim_analysis_job(text,text,integer) from public;
revoke all on function public.heartbeat_analysis_job(uuid,uuid,text,integer) from public;
revoke all on function public.set_analysis_job_stage(uuid,uuid,text,public.analysis_job_status) from public;
revoke all on function public.fail_analysis_job(uuid,uuid,text,text,text,text,text,text,boolean,integer,boolean) from public;
revoke all on function public.complete_analysis_job(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,text,numeric,jsonb) from public;
revoke all on function public.requeue_analysis_job(uuid) from public;
revoke all on function public.cancel_analysis_job(uuid) from public;
grant execute on function public.claim_analysis_job(text,text,integer) to service_role;
grant execute on function public.heartbeat_analysis_job(uuid,uuid,text,integer) to service_role;
grant execute on function public.set_analysis_job_stage(uuid,uuid,text,public.analysis_job_status) to service_role;
grant execute on function public.fail_analysis_job(uuid,uuid,text,text,text,text,text,text,boolean,integer,boolean) to service_role;
grant execute on function public.complete_analysis_job(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,text,numeric,jsonb) to service_role;
grant execute on function public.requeue_analysis_job(uuid) to service_role;
grant execute on function public.cancel_analysis_job(uuid) to service_role;
grant execute on function public.get_analysis_job_status(uuid) to authenticated;
