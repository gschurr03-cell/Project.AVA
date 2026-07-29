\set ON_ERROR_STOP on
begin;

do $$
declare
  v_owner uuid := '10000000-0000-0000-0000-000000000001';
  v_other uuid := '10000000-0000-0000-0000-000000000002';
  v_athlete uuid := '20000000-0000-0000-0000-000000000001';
  v_session uuid := '30000000-0000-0000-0000-000000000001';
  v_analysis uuid := '40000000-0000-0000-0000-000000000001';
  v_plan uuid := '50000000-0000-0000-0000-000000000001';
  v_plan_2 uuid := '50000000-0000-0000-0000-000000000002';
  v_plan_3 uuid := '50000000-0000-0000-0000-000000000003';
  v_job uuid := '60000000-0000-0000-0000-000000000001';
  v_job_2 uuid := '60000000-0000-0000-0000-000000000002';
  v_job_3 uuid := '60000000-0000-0000-0000-000000000003';
  v_snapshot uuid := '70000000-0000-0000-0000-000000000001';
  v_snapshot_2 uuid := '70000000-0000-0000-0000-000000000002';
  v_snapshot_3 uuid := '70000000-0000-0000-0000-000000000003';
  v_manifest uuid; v_manifest_2 uuid; v_shadow uuid; v_claim public.intelligence_execution_jobs; v_visible jsonb;
begin
  insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
  values
    (v_owner,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner@ava.test','',now(),'{}','{}'),
    (v_other,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','other@ava.test','',now(),'{}','{}');
  insert into public.athletes(id,coach_id,full_name) values(v_athlete,v_owner,'Orchestration Fixture');
  insert into public.sessions(id,athlete_id,created_by,video_path,status)
    values(v_session,v_athlete,v_owner,'fixture.mp4','complete');
  insert into public.analyses(id,session_id,model_version,status,analysis_pipeline_version)
    values(v_analysis,v_session,'fixture','complete','intelligence-pipeline-v1');
  insert into public.intelligence_execution_plans(
    id,analysis_id,athlete_id,pipeline_version,orchestration_version,input_fingerprint,
    engine_versions,dependency_graph,execution_order,snapshot_targets,state,shadow_execution,
    request_idempotency_key
  ) values(v_plan,v_analysis,v_athlete,'intelligence-pipeline-v1','intelligence-orchestration-v1','fixture-input',
    '{"observation":"observation-v1"}','{"nodes":["observation"],"edges":[]}',
    '["observation"]','["observation"]','queued',false,'fixture-request');
  insert into public.intelligence_execution_jobs(
    id,execution_plan_id,athlete_id,engine_id,engine_version,dependencies,state
  ) values(v_job,v_plan,v_athlete,'observation','observation-v1','[]','ready');

  select * into v_claim from public.claim_intelligence_execution_job('fixture-worker',60);
  if v_claim.id<>v_job or v_claim.state<>'running' then raise exception 'claim failed'; end if;
  if not public.heartbeat_intelligence_execution_job(v_job,v_claim.claim_token,'fixture-worker',60)
  then raise exception 'heartbeat failed'; end if;
  if exists(select 1 from public.claim_intelligence_execution_job('second-worker',60))
  then raise exception 'nonexpired claim duplicated'; end if;

  perform public.stage_intelligence_snapshot(v_plan,jsonb_build_object(
    'snapshotId',v_snapshot,'engineId','observation','engineVersion','observation-v1',
    'adapterVersion','ava-orchestration-adapter-v1','outputFingerprint','fixture-output',
    'output',jsonb_build_object('observations',jsonb_build_array(),'trace',jsonb_build_array())
  ),'fixture-worker');
  update public.intelligence_execution_jobs set state='succeeded',claim_token=null,
    claimed_by=null,lease_expires_at=null where id=v_job;
  v_manifest:=public.activate_staged_intelligence_pipeline(v_plan,'fixture-worker');
  if v_manifest is null or not exists(
    select 1 from public.active_intelligence_pipelines where athlete_id=v_athlete and pipeline_snapshot_id=v_manifest
  ) then raise exception 'atomic activation failed'; end if;

  insert into public.intelligence_execution_plans(
    id,analysis_id,athlete_id,pipeline_version,orchestration_version,input_fingerprint,
    engine_versions,dependency_graph,execution_order,snapshot_targets,state,shadow_execution,
    request_idempotency_key
  ) values(v_plan_2,v_analysis,v_athlete,'intelligence-pipeline-v1','intelligence-orchestration-v1','fixture-input-2',
    '{"observation":"observation-v1"}','{"nodes":["observation"],"edges":[]}',
    '["observation"]','["observation"]','queued',false,'fixture-request-2');
  insert into public.intelligence_execution_jobs(
    id,execution_plan_id,athlete_id,engine_id,engine_version,dependencies,state
  ) values(v_job_2,v_plan_2,v_athlete,'observation','observation-v1','[]','succeeded');
  perform public.stage_intelligence_snapshot(v_plan_2,jsonb_build_object(
    'snapshotId',v_snapshot_2,'engineId','observation','engineVersion','observation-v1',
    'adapterVersion','ava-orchestration-adapter-v1','outputFingerprint','fixture-output-2',
    'output',jsonb_build_object('observations',jsonb_build_array(),'trace',jsonb_build_array())
  ),'fixture-worker');
  v_manifest_2:=public.activate_staged_intelligence_pipeline(v_plan_2,'fixture-worker');
  if v_manifest_2=v_manifest then raise exception 'second manifest not created'; end if;
  if public.rollback_intelligence_pipeline(v_plan_2,'fixture-worker','injected failure')<>v_manifest
  then raise exception 'rollback did not restore prior manifest'; end if;
  if not exists(select 1 from public.intelligence_pipeline_snapshots
    where id=v_manifest and activation_status='active')
  then raise exception 'rollback target was not reactivated'; end if;

  insert into public.intelligence_execution_plans(
    id,analysis_id,athlete_id,pipeline_version,orchestration_version,input_fingerprint,
    engine_versions,dependency_graph,execution_order,snapshot_targets,state,shadow_execution,
    request_idempotency_key
  ) values(v_plan_3,v_analysis,v_athlete,'intelligence-pipeline-v1','intelligence-orchestration-v1','fixture-shadow',
    '{"observation":"observation-v1"}','{"nodes":["observation"],"edges":[]}',
    '["observation"]','["observation"]','queued',true,'fixture-shadow-request');
  insert into public.intelligence_execution_jobs(
    id,execution_plan_id,athlete_id,engine_id,engine_version,dependencies,state
  ) values(v_job_3,v_plan_3,v_athlete,'observation','observation-v1','[]','succeeded');
  perform public.stage_intelligence_snapshot(v_plan_3,jsonb_build_object(
    'snapshotId',v_snapshot_3,'engineId','observation','engineVersion','observation-v1',
    'adapterVersion','ava-orchestration-adapter-v1','outputFingerprint','fixture-shadow-output',
    'output',jsonb_build_object('observations',jsonb_build_array(),'trace',jsonb_build_array())
  ),'shadow-worker');
  v_shadow:=public.create_shadow_intelligence_manifest(v_plan_3,null);
  if not exists(select 1 from public.intelligence_shadow_manifests
    where id=v_shadow and authoritative=false and status='shadow')
  then raise exception 'non-authoritative shadow manifest missing'; end if;
  if (select pipeline_snapshot_id from public.active_intelligence_pipelines where athlete_id=v_athlete)<>v_manifest
  then raise exception 'shadow changed authoritative manifest'; end if;
  perform public.persist_shadow_intelligence_comparison(v_plan_3,v_shadow,jsonb_build_object(
    'reportVersion','orchestration-shadow-comparison-v1','baselineMode','legacy_pointer',
    'executionPlanFingerprint','fixture-shadow','results',jsonb_build_array(),
    'readiness','ready','blockerReasons',jsonb_build_array(),
    'startedAt','2026-07-18T00:00:00.000Z','completedAt','2026-07-18T00:00:01.000Z'
  ));
  if not exists(select 1 from public.intelligence_shadow_comparisons where shadow_manifest_id=v_shadow)
  then raise exception 'shadow comparison missing'; end if;

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  v_visible:=public.get_activated_intelligence_snapshot(v_athlete,'observation');
  if v_visible->>'snapshotId'<>v_snapshot::text then raise exception 'owner manifest read failed'; end if;
  perform set_config('request.jwt.claim.sub',v_other::text,true);
  if public.get_activated_intelligence_snapshot(v_athlete,'observation') is not null
  then raise exception 'cross-owner manifest leak'; end if;

  begin
    insert into public.intelligence_execution_plans(
      analysis_id,athlete_id,pipeline_version,orchestration_version,input_fingerprint,
      engine_versions,dependency_graph,execution_order,snapshot_targets,request_idempotency_key
    ) values(v_analysis,v_athlete,'other-pipeline','intelligence-orchestration-v1','other',
      '{}','{"nodes":[],"edges":[]}','[]','[]','fixture-request');
    raise exception 'duplicate idempotency key accepted';
  exception when unique_violation then null;
  end;
end $$;

-- Client roles cannot invoke trusted worker/activation functions.
set local role authenticated;
do $$
begin
  begin
    perform public.recover_intelligence_execution_jobs(10,null);
    raise exception 'authenticated mutation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_shadow_intelligence_manifest('50000000-0000-0000-0000-000000000003',null);
    raise exception 'authenticated shadow mutation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;
select 'orchestration database integration: passed' as result;
