-- Development lifecycle: one mutable working analysis plus explicit immutable snapshots.
alter table public.analyses
  add column if not exists analysis_kind text not null default 'archived',
  add column if not exists is_current_working boolean not null default false,
  add column if not exists superseded_at timestamptz,
  add column if not exists saved_version_number integer,
  add column if not exists saved_at timestamptz,
  add column if not exists saved_notes text;

alter table public.analyses add constraint analyses_kind_valid
  check (analysis_kind in ('working','saved','archived'));
alter table public.analyses add constraint analyses_lifecycle_shape
  check (
    (analysis_kind = 'working' and saved_version_number is null and saved_at is null)
    or (analysis_kind = 'saved' and not is_current_working and saved_version_number is not null and saved_at is not null)
    or (analysis_kind = 'archived' and not is_current_working and saved_version_number is null)
  );

-- Choose one useful legacy row per session as the initial working result. Other
-- automatic reruns remain readable internally but disappear from visible versions.
with ranked as (
  select id, session_id,
    row_number() over (
      partition by session_id
      order by (status = 'complete') desc, created_at desc, id desc
    ) as rank
  from public.analyses
)
update public.analyses a set
  analysis_kind = case when ranked.rank = 1 then 'working' else 'archived' end,
  is_current_working = ranked.rank = 1,
  superseded_at = case when ranked.rank = 1 then null else coalesce(a.superseded_at, now()) end,
  saved_version_number = null,
  saved_at = null
from ranked where ranked.id = a.id;

create unique index analyses_one_current_working_per_session
  on public.analyses(session_id) where is_current_working;
create unique index analyses_saved_version_unique
  on public.analyses(session_id, saved_version_number) where analysis_kind = 'saved';

alter table public.sessions add column if not exists current_working_analysis_id uuid;
update public.sessions s set current_working_analysis_id = a.id
from public.analyses a where a.session_id = s.id and a.is_current_working;
alter table public.sessions add constraint sessions_current_working_analysis_fkey
  foreign key (current_working_analysis_id) references public.analyses(id) on delete set null;

update public.analysis_jobs j set
  status='cancelled', claim_token=null, claimed_by=null, claimed_at=null,
  lease_expires_at=null, heartbeat_at=null, updated_at=now()
from public.analyses a
where a.id=j.analysis_id and a.analysis_kind='archived'
  and j.status not in ('completed','failed','dead_lettered','cancelled');

-- Saved snapshots never create worker jobs.
create or replace function public.enqueue_analysis_job()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.analysis_kind <> 'working' then return new; end if;
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

create or replace function public.replace_working_analysis(
  p_session_id uuid, p_input_snapshot jsonb, p_analysis_fps numeric,
  p_pipeline_version text, p_metric_schema_version text,
  p_explainability_schema_version text, p_timing_compatibility_group text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_job_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
  perform 1 from public.sessions where id = p_session_id and video_path is not null for update;
  if not found then raise exception 'session or source video unavailable'; end if;

  select id into v_id from public.analyses
    where session_id = p_session_id and is_current_working for update;

  if v_id is null then
    insert into public.analyses (
      session_id, status, model_version, input_snapshot, analysis_fps,
      analysis_pipeline_version, metric_schema_version, explainability_schema_version,
      timing_compatibility_group, analysis_kind, is_current_working
    ) values (
      p_session_id, 'queued', 'pending', p_input_snapshot, p_analysis_fps,
      p_pipeline_version, p_metric_schema_version, p_explainability_schema_version,
      p_timing_compatibility_group, 'working', true
    ) returning id into v_id;
  else
    select id into v_job_id from public.analysis_jobs where analysis_id = v_id for update;
    if v_job_id is not null then
      update public.analysis_jobs set
        status='queued', attempt_count=0, next_attempt_at=now(), started_at=null,
        completed_at=null, failed_at=null, dead_lettered_at=null,
        last_error_code=null, last_error_message=null, last_error_stage=null,
        failure_category=null, user_message=null, worker_version=null,
        output_artifact_paths='{}'::jsonb, manual_retry_allowed=false,
        user_action_required=false, claim_token=null, claimed_by=null,
        claimed_at=null, lease_expires_at=null, heartbeat_at=null, updated_at=now()
      where id = v_job_id;
    else
      insert into public.analysis_jobs (
        analysis_id, session_id, athlete_id, analysis_pipeline_version, source_video_path
      )
      select v_id, s.id, s.athlete_id, p_pipeline_version, s.video_path
      from public.sessions s where s.id=p_session_id returning id into v_job_id;
    end if;

    update public.analyses set
      status='queued', model_version='pending', input_snapshot=p_input_snapshot,
      analysis_fps=p_analysis_fps, analysis_pipeline_version=p_pipeline_version,
      metric_schema_version=p_metric_schema_version,
      explainability_schema_version=p_explainability_schema_version,
      timing_compatibility_group=p_timing_compatibility_group,
      error=null, metrics=null, provenance=null, result_payload=null,
      keypoints_path=null, source_fps=null, completed_at=null,
      experimental=false, experiment_version=null, experimental_result=null,
      validation_status='validated', raw_timing_metrics=null, reported_timing_metrics=null,
      experimental_raw_fly_time_seconds=null,
      experimental_reported_fly_time_seconds=null,
      experimental_timing_uncertainty_seconds=null,
      experimental_timing_result_hash=null,
      performance_result_status='eligible',
      performance_result_invalid_reason=null, performance_result_invalidated_at=null,
      excluded_from_history_trends=false, excluded_from_benchmarks=false,
      excluded_from_predictions=false, excluded_from_recommendations=false,
      workspace_config=jsonb_build_object(
        'schemaVersion','ava-workspace-config-v1',
        'timingZone',p_input_snapshot #> '{session,timingZone}',
        'timingSetup',p_input_snapshot #> '{session,timingSetup}',
        'calibrationInputs',p_input_snapshot #> '{session,calibrationInputs}',
        'requestedOptions',p_input_snapshot #> '{session,requestedOptions}'
      ),
      analysis_kind='working', is_current_working=true, superseded_at=null
    where id=v_id;
  end if;

  update public.sessions set current_working_analysis_id=v_id, status='queued'
    where id=p_session_id;
  return v_id;
end;
$$;

create or replace function public.save_working_analysis_snapshot(
  p_session_id uuid, p_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_source public.analyses; v_json jsonb; v_saved_id uuid; v_number integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
  select * into v_source from public.analyses
    where session_id=p_session_id and is_current_working for update;
  if v_source.id is null or v_source.status <> 'complete' then
    raise exception 'only a completed working analysis can be saved';
  end if;
  select coalesce(max(saved_version_number),0)+1 into v_number
    from public.analyses where session_id=p_session_id and analysis_kind='saved';
  v_json := (to_jsonb(v_source) - 'id' - 'version_number') || jsonb_build_object(
    'analysis_kind','saved', 'is_current_working',false,
    'saved_version_number',v_number, 'saved_at',now(),
    'saved_notes',nullif(left(trim(coalesce(p_notes,'')),1000),''),
    'created_at',now(), 'parent_analysis_id',v_source.id
  );
  insert into public.analyses
    select (jsonb_populate_record(null::public.analyses, v_json)).*
    returning id into v_saved_id;
  return v_saved_id;
end;
$$;

create or replace function public.reset_working_analysis(p_session_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
  select id into v_id from public.analyses
    where session_id=p_session_id and is_current_working for update;
  if v_id is not null then
    update public.analysis_jobs set status='cancelled', claim_token=null, claimed_by=null,
      claimed_at=null, lease_expires_at=null, heartbeat_at=null, updated_at=now()
      where analysis_id=v_id and status <> 'completed';
    update public.analyses set analysis_kind='archived', is_current_working=false,
      superseded_at=now() where id=v_id;
  end if;
  update public.sessions set
    current_working_analysis_id=null, status='uploaded',
    calibration_gates=null, timing_zone_schema_version=null, timing_zone_version=0,
    calibration_point_ax=null, calibration_point_ay=null,
    calibration_point_bx=null, calibration_point_by=null,
    calibration_known_distance_m=null, calibration_point_a_time_s=null,
    calibration_point_b_time_s=null, calibration_zone_start_s=null,
    calibration_zone_end_s=null, calibration_zone_distance_m=null,
    overlay_trochanter_x=null, overlay_trochanter_y=null, overlay_trochanter_time_s=null,
    timing_setup=jsonb_build_object(
      'schemaVersion','ava-timing-setup-v1','setupVersion',1,
      'setupMode','technique_only',
      'distance',jsonb_build_object('distanceM',null,'status','unknown',
        'measurementMethod',null,'uncertaintyM',null,'evidence',null,'confirmedAt',null),
      'bodyReference','torso','validationStatus','eligible'
    )
  where id=p_session_id;
  return found;
end;
$$;

revoke all on function public.replace_working_analysis(uuid,jsonb,numeric,text,text,text,text) from public;
revoke all on function public.save_working_analysis_snapshot(uuid,text) from public;
revoke all on function public.reset_working_analysis(uuid) from public;
grant execute on function public.replace_working_analysis(uuid,jsonb,numeric,text,text,text,text) to service_role;
grant execute on function public.save_working_analysis_snapshot(uuid,text) to service_role;
grant execute on function public.reset_working_analysis(uuid) to service_role;

comment on column public.sessions.current_working_analysis_id is
  'Exact analysis identity selected and polled by default for this source video.';
