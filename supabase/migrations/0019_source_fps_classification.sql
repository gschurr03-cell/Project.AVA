-- Persist the original detected rates and the centralized production capture class.
alter table public.sessions
  add column if not exists fps_classification text,
  add column if not exists fps_metadata jsonb;

alter table public.sessions
  add constraint sessions_fps_classification_valid
  check (
    fps_classification is null or fps_classification in (
      'validated_60_fps_class',
      'high_speed_source_normalized_to_60',
      'unsupported_below_60_fps_class'
    )
  );

comment on column public.sessions.fps is
  'Original detected average source FPS; never replaced by nominal/analysis FPS.';
comment on column public.sessions.fps_classification is
  'AVA capture class derived from average/nominal/real/timestamp FPS evidence.';
comment on column public.sessions.fps_metadata is
  'Original source-rate evidence including average, nominal, real, timestamp, and VFR fields.';
