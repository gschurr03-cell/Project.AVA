alter table public.analyses
  add column if not exists performance_result_status text not null default 'eligible',
  add column if not exists performance_result_invalid_reason text,
  add column if not exists performance_result_invalidated_at timestamptz,
  add column if not exists excluded_from_history_trends boolean not null default false,
  add column if not exists excluded_from_benchmarks boolean not null default false,
  add column if not exists excluded_from_predictions boolean not null default false,
  add column if not exists excluded_from_recommendations boolean not null default false;

alter table public.analyses add constraint analyses_performance_result_status_valid check (
  performance_result_status in ('eligible', 'pending_gate_validation', 'invalid_gate_propagation')
);

alter table public.analyses add constraint analyses_invalid_performance_excluded check (
  performance_result_status <> 'invalid_gate_propagation' or (
    performance_result_invalid_reason is not null
    and performance_result_invalidated_at is not null
    and excluded_from_history_trends
    and excluded_from_benchmarks
    and excluded_from_predictions
    and excluded_from_recommendations
  )
);

-- Immutable results remain present; only their downstream eligibility changes.
update public.analyses set
  performance_result_status = 'invalid_gate_propagation',
  performance_result_invalid_reason = 'Timing invalidated because the physical gates did not remain aligned with their selected track markings.',
  performance_result_invalidated_at = now(),
  excluded_from_history_trends = true,
  excluded_from_benchmarks = true,
  excluded_from_predictions = true,
  excluded_from_recommendations = true
where experimental_timing_result_hash = '237392ec';

comment on column public.analyses.performance_result_status is
  'Downstream eligibility of the immutable analysis result; invalidation never mutates its stored measurements.';
