-- Phase 7.2: a new attempt must never inherit the prior attempt's work count.
-- `replace_working_analysis` predates analysis_jobs.progress, so enforce the
-- reset at the table boundary for every legitimate transition back to queued.
create or replace function public.reset_analysis_job_progress_on_requeue()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'queued' and old.status <> 'queued' then
    new.progress := null;
  end if;
  return new;
end $$;

drop trigger if exists analysis_jobs_reset_progress_on_requeue on public.analysis_jobs;
create trigger analysis_jobs_reset_progress_on_requeue
before update of status on public.analysis_jobs
for each row execute function public.reset_analysis_job_progress_on_requeue();

