-- PostgreSQL compatibility correction for environments without jsonb_object_length().
create or replace function public.create_shadow_intelligence_manifest(
  p_execution_plan_id uuid,p_replay_run_id uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_plan public.intelligence_execution_plans;v_refs jsonb;v_adapters jsonb;v_integrity text;v_id uuid;
begin
  select * into v_plan from public.intelligence_execution_plans where id=p_execution_plan_id for update;
  if v_plan.id is null or not v_plan.shadow_execution then raise exception 'shadow plan required'; end if;
  if exists(select 1 from public.intelligence_execution_jobs where execution_plan_id=v_plan.id and state<>'succeeded')
  then raise exception 'shadow jobs incomplete';end if;
  select jsonb_object_agg(engine_id,id),jsonb_object_agg(engine_id,adapter_version)
    into v_refs,v_adapters from public.intelligence_staged_snapshots where execution_plan_id=v_plan.id;
  if (select count(*) from jsonb_object_keys(coalesce(v_refs,'{}'::jsonb)))<>jsonb_array_length(v_plan.snapshot_targets)
  then raise exception 'shadow snapshots incomplete';end if;
  v_integrity:=encode(extensions.digest(convert_to(jsonb_build_object(
    'plan',v_plan.input_fingerprint,'pipeline',v_plan.pipeline_version,'registry',v_plan.registry_version,
    'engines',v_plan.engine_versions,'adapters',v_adapters,'snapshots',v_refs)::text,'UTF8'),'sha256'),'hex');
  insert into public.intelligence_shadow_manifests(
    execution_plan_id,athlete_id,analysis_id,pipeline_version,registry_version,input_fingerprint,
    engine_versions,adapter_versions,snapshot_references,input_provenance,integrity_fingerprint,source_replay_run_id
  ) values(v_plan.id,v_plan.athlete_id,v_plan.analysis_id,v_plan.pipeline_version,v_plan.registry_version,
    v_plan.input_fingerprint,v_plan.engine_versions,v_adapters,v_refs,
    jsonb_build_object('analysisId',v_plan.analysis_id),v_integrity,p_replay_run_id)
  on conflict(execution_plan_id) do update set execution_plan_id=excluded.execution_plan_id
  returning id into v_id;
  insert into public.intelligence_orchestration_audit(athlete_id,execution_plan_id,actor_type,actor_id,action,details)
    values(v_plan.athlete_id,v_plan.id,'system','shadow-coordinator','shadow_manifest_created',
      jsonb_build_object('manifestId',v_id,'authoritative',false));
  return v_id;
end $$;
revoke execute on function public.create_shadow_intelligence_manifest(uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_shadow_intelligence_manifest(uuid,uuid) to service_role;
