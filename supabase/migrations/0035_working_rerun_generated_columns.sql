-- 0029 made the four experimental timing envelope fields generated columns.
-- The later lifecycle RPC must clear their JSON source, not assign generated
-- outputs directly.
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

revoke all on function public.replace_working_analysis(uuid,jsonb,numeric,text,text,text,text) from public;
grant execute on function public.replace_working_analysis(uuid,jsonb,numeric,text,text,text,text) to service_role;
