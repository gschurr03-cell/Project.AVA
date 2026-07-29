-- JSON null is a JSON value, not SQL NULL. Keep legacy or intentionally withheld
-- experimental results valid while enforcing the complete envelope when it exists.
alter table public.analyses
  drop constraint if exists analyses_real30_timing_envelope_valid;

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
