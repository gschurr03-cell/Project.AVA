-- Make the bounded retry transition explicitly type-safe. This is a forward-only
-- replacement of the existing function; table data and public signatures are unchanged.
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
    when p_retryable and v_job.attempt_count < v_job.max_attempts
      then 'retry_scheduled'::public.analysis_job_status
    when p_retryable then 'dead_lettered'::public.analysis_job_status
    else 'failed'::public.analysis_job_status end;
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
    update public.analyses set status = 'failed', error = p_user_message, completed_at = now()
      where id = v_job.analysis_id and status <> 'complete';
    update public.sessions set status = 'failed'
      where id = v_job.session_id and status <> 'complete';
  end if;
  return v_status;
end;
$$;

revoke all on function public.fail_analysis_job(
  uuid,uuid,text,text,text,text,text,text,boolean,integer,boolean
) from public;
grant execute on function public.fail_analysis_job(
  uuid,uuid,text,text,text,text,text,text,boolean,integer,boolean
) to service_role;
