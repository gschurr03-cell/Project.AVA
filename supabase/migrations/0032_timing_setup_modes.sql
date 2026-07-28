-- Four explicit timing-boundary setup modes. Existing timing_mode remains the
-- fly/split/custom measurement profile; this JSON is the versioned boundary setup.
alter table public.sessions
  add column if not exists timing_setup jsonb not null default jsonb_build_object(
    'schemaVersion', 'ava-timing-setup-v1',
    'setupVersion', 1,
    'setupMode', 'technique_only',
    'distance', jsonb_build_object(
      'distanceM', null,
      'status', 'unknown',
      'measurementMethod', null,
      'uncertaintyM', null,
      'evidence', null,
      'confirmedAt', null
    ),
    'bodyReference', 'torso',
    'validationStatus', 'eligible'
  );

alter table public.sessions add constraint sessions_timing_setup_object
  check (jsonb_typeof(timing_setup) = 'object');

alter table public.sessions add constraint sessions_timing_setup_mode_valid
  check (timing_setup->>'setupMode' in (
    'marked_zone', 'fixed_landmarks', 'manual_crossing', 'technique_only'
  ));

comment on column public.sessions.timing_setup is
  'Editable boundary-setup draft. Every queued analysis captures an immutable copy in input_snapshot.';

alter table public.analyses
  add column if not exists timing_compatibility_group text not null default 'legacy-unspecified';

comment on column public.analyses.timing_compatibility_group is
  'Exact-match history group for boundary setup mode and FPS tier; independent of the pipeline compatibility group.';
