-- Supabase's function DDL grant hook can grant anon/authenticated directly.
-- Explicitly revoke client roles from every trusted orchestration RPC.
revoke execute on function public.claim_intelligence_execution_job(text,integer) from anon,authenticated;
revoke execute on function public.heartbeat_intelligence_execution_job(uuid,uuid,text,integer) from anon,authenticated;
revoke execute on function public.activate_intelligence_pipeline(uuid,jsonb,text) from anon,authenticated;
revoke execute on function public.rollback_intelligence_pipeline(uuid,text,text) from anon,authenticated;
revoke execute on function public.get_intelligence_execution_plan_internal(uuid) from anon,authenticated;
revoke execute on function public.get_intelligence_execution_job_internal(uuid,uuid) from anon,authenticated;
revoke execute on function public.transition_intelligence_execution_job(uuid,uuid,jsonb,text) from anon,authenticated;
revoke execute on function public.append_intelligence_execution_trace(uuid,uuid,jsonb) from anon,authenticated;
revoke execute on function public.schedule_intelligence_execution_retry(uuid,uuid,jsonb,integer) from anon,authenticated;
revoke execute on function public.stage_intelligence_snapshot(uuid,jsonb,text) from anon,authenticated;
revoke execute on function public.activate_staged_intelligence_pipeline(uuid,text) from anon,authenticated;
revoke execute on function public.fail_intelligence_execution_plan(uuid,jsonb,text) from anon,authenticated;
revoke execute on function public.recover_intelligence_execution_jobs(integer,uuid) from anon,authenticated;

-- Read functions remain authenticated and owner-scoped; anonymous access is prohibited.
revoke execute on function public.get_intelligence_orchestration_dashboard(uuid) from anon;
revoke execute on function public.get_activated_intelligence_snapshot(uuid,text) from anon;
grant execute on function public.get_intelligence_orchestration_dashboard(uuid) to authenticated;
grant execute on function public.get_activated_intelligence_snapshot(uuid,text) to authenticated;
