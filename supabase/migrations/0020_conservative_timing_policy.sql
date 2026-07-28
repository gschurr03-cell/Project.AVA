-- Version raw/reported timing snapshots without rewriting legacy analytical data.
alter table public.analyses
  add column if not exists timing_policy_version text,
  add column if not exists raw_timing_metrics jsonb,
  add column if not exists reported_timing_metrics jsonb;

comment on column public.analyses.timing_policy_version is
  'Immutable reporting policy used for time and time-derived speed values.';
comment on column public.analyses.raw_timing_metrics is
  'Exact analytical timing values before conservative reporting.';
comment on column public.analyses.reported_timing_metrics is
  'Official timing values and time-derived speeds used by customer-facing consumers.';

create or replace function public.capture_analysis_timing_snapshots()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'complete' then
    new.timing_policy_version := coalesce(
      new.provenance->>'timingPolicyVersion',
      new.metrics->>'timingPolicyVersion',
      new.timing_policy_version,
      'legacy_unversioned'
    );
    if new.metrics ? 'rawTimingMetrics' then
      new.raw_timing_metrics := new.metrics->'rawTimingMetrics';
      new.reported_timing_metrics := new.metrics->'reportedTimingMetrics';
    elsif new.metrics ? 'rawSplits' then
      new.raw_timing_metrics := jsonb_build_object(
        'splits', new.metrics->'rawSplits',
        'runTime', new.metrics->'rawRunTime',
        'averageVelocityMps', new.metrics->'rawAverageVelocityMps',
        'peakVelocityMps', new.metrics->'rawPeakVelocity'
      );
      new.reported_timing_metrics := jsonb_build_object(
        'splits', new.metrics->'splits',
        'runTime', new.metrics->'reportedRunTime',
        'averageVelocityMps', new.metrics->'reportedAverageVelocityMps',
        'peakVelocityMps', new.metrics->'reportedPeakVelocity'
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists analyses_capture_timing_snapshots on public.analyses;
create trigger analyses_capture_timing_snapshots
before insert or update of status, metrics, provenance on public.analyses
for each row execute function public.capture_analysis_timing_snapshots();

update public.analyses
set timing_policy_version = 'legacy_unversioned'
where status = 'complete' and timing_policy_version is null;
