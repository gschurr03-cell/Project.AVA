-- Phase 7.2: lease-scoped, work-based progress updates between heartbeats.
-- This does not change queue ownership: only the current, unexpired claimant
-- may advance progress. The JSON payload remains additive for old clients.
create or replace function public.report_analysis_job_progress(
  p_job_id uuid, p_claim_token uuid, p_worker_id text, p_progress jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_old_units integer;
  v_new_units integer;
begin
  if jsonb_typeof(p_progress) <> 'object'
     or (p_progress->>'method') <> 'measured_work_units_v1'
     or (p_progress->>'processedUnits') is null
     or (p_progress->>'totalUnits') is null then
    return false;
  end if;
  select progress into v_old from public.analysis_jobs
    where id=p_job_id and claim_token=p_claim_token and claimed_by=p_worker_id
      and lease_expires_at > now() and status='processing' for update;
  if not found then return false; end if;
  v_old_units := coalesce((v_old->>'processedUnits')::integer, 0);
  v_new_units := (p_progress->>'processedUnits')::integer;
  if v_new_units < v_old_units or v_new_units < 0
     or v_new_units > (p_progress->>'totalUnits')::integer then
    return false;
  end if;
  update public.analysis_jobs set progress=p_progress, updated_at=now()
    where id=p_job_id;
  return true;
end $$;

revoke all on function public.report_analysis_job_progress(uuid,uuid,text,jsonb) from public;
grant execute on function public.report_analysis_job_progress(uuid,uuid,text,jsonb) to service_role;

