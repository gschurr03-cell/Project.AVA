-- Queryable immutable summary of the versioned real-30m envelope stored in experimental_result.
alter table public.analyses
  add column if not exists experimental_raw_fly_time_seconds numeric generated always as
    (nullif(experimental_result #>> '{real30Timing,rawFlyTimeSeconds}', '')::numeric) stored,
  add column if not exists experimental_reported_fly_time_seconds numeric generated always as
    (nullif(experimental_result #>> '{real30Timing,reportedFlyTimeSeconds}', '')::numeric) stored,
  add column if not exists experimental_timing_uncertainty_seconds numeric generated always as
    (nullif(experimental_result #>> '{real30Timing,combinedUncertaintySeconds}', '')::numeric) stored,
  add column if not exists experimental_timing_result_hash text generated always as
    (experimental_result #>> '{real30Timing,resultHash}') stored;

alter table public.analyses add constraint analyses_real30_timing_envelope_valid check (
  coalesce(jsonb_typeof(experimental_result #> '{real30Timing}'), 'null') = 'null' or (
    experimental is true
    and experimental_result #>> '{real30Timing,schemaVersion}' = 'ava-real-30m-timing-v1'
    and (experimental_result #>> '{real30Timing,zoneDistanceMeters}')::numeric = 30
    and experimental_raw_fly_time_seconds > 0
    and experimental_reported_fly_time_seconds >= experimental_raw_fly_time_seconds
    and experimental_timing_uncertainty_seconds >= 0
    and experimental_timing_result_hash ~ '^[0-9a-f]{8}$'
  )
);

comment on column public.analyses.experimental_timing_result_hash is
  'Deterministic hash of immutable experimental 30 m timing inputs, crossings, uncertainty, and external-reference comparison.';
