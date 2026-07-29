-- Day 63: add the combined step frequency to the AVA Calab Vid 1 reference.
--
-- VueMotion reports left (5.00) and right (4.72) step frequency; their combined
-- cadence (1 / mean step interval) is 4.86 steps/s. AVA's primary frequency is the
-- combined value, so store it in the reference so the benchmark table can compare
-- it directly. Idempotent (jsonb merge; re-running is a no-op).

update public.benchmarks
set reference_metrics = reference_metrics || jsonb_build_object('combinedStepFrequencyHz', 4.86)
where id = '44444444-4444-4444-8444-444444444444';
