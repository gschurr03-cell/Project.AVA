create or replace function public.rollback_intelligence_pipeline(
  p_execution_plan_id uuid,p_actor_id text,p_reason text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_plan public.intelligence_execution_plans;
  v_current public.intelligence_pipeline_snapshots; v_target uuid;
begin
  select * into v_plan from public.intelligence_execution_plans where id=p_execution_plan_id for update;
  if v_plan.id is null then raise exception 'missing execution plan'; end if;
  select snapshot.* into v_current from public.active_intelligence_pipelines active
    join public.intelligence_pipeline_snapshots snapshot on snapshot.id=active.pipeline_snapshot_id
    where active.athlete_id=v_plan.athlete_id for update;
  if v_current.id is null or v_current.execution_plan_id<>v_plan.id
  then raise exception 'execution plan is not the active manifest'; end if;
  v_target:=v_current.previous_pipeline_snapshot_id;
  if v_target is null then raise exception 'no previous pipeline snapshot'; end if;
  update public.intelligence_pipeline_snapshots set activation_status='rolled_back',
    rolled_back_at=now(),rollback_metadata=jsonb_build_object(
      'reason',left(p_reason,1000),'actorId',p_actor_id,'rolledBackAt',now())
    where id=v_current.id;
  update public.intelligence_pipeline_snapshots set activation_status='active' where id=v_target;
  update public.active_intelligence_pipelines set pipeline_snapshot_id=v_target,updated_at=now()
    where athlete_id=v_plan.athlete_id;
  update public.intelligence_execution_plans set state='rolled_back',completed_at=now() where id=v_plan.id;
  insert into public.intelligence_orchestration_audit(
    athlete_id,execution_plan_id,actor_type,actor_id,action,details
  ) values(v_plan.athlete_id,v_plan.id,'trusted_server',p_actor_id,'pipeline_rolled_back',
    jsonb_build_object('fromManifestId',v_current.id,'toManifestId',v_target,'reason',left(p_reason,1000)));
  return v_target;
end $$;
revoke execute on function public.rollback_intelligence_pipeline(uuid,text,text) from public,anon,authenticated;
grant execute on function public.rollback_intelligence_pipeline(uuid,text,text) to service_role;

