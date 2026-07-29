-- Versioned, reproducible analysis results. Additive and nullable so every legacy
-- analysis remains readable without rewriting historical JSON.
alter table public.analyses
  add column provenance jsonb,
  add column input_snapshot jsonb,
  add column result_payload jsonb,
  add column analysis_fps numeric,
  add column source_fps numeric,
  add column metric_schema_version text,
  add column explainability_schema_version text,
  add column analysis_pipeline_version text;

alter table public.analyses
  add constraint analyses_analysis_fps_positive
    check (analysis_fps is null or analysis_fps > 0),
  add constraint analyses_source_fps_positive
    check (source_fps is null or source_fps > 0);

comment on column public.analyses.provenance is
  'Immutable runtime/model/media/calibration provenance for this analysis.';
comment on column public.analyses.input_snapshot is
  'Immutable athlete/session/settings snapshot captured when the job was queued.';
comment on column public.analyses.result_payload is
  'Validated explainable-analysis result. Legacy analyses leave this null.';
