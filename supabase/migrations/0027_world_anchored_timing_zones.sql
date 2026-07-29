-- Explicit discriminator/version for the authoritative world-anchored zone JSON.
-- Full immutable definitions remain in calibration_gates and each analysis input snapshot.
alter table public.sessions
  add column if not exists timing_zone_schema_version text,
  add column if not exists timing_zone_version integer not null default 0;

alter table public.sessions add constraint sessions_timing_zone_version_nonnegative
  check (timing_zone_version >= 0);

comment on column public.sessions.calibration_gates is
  'Versioned source-frame and camera-compensated ground boundaries. Never viewport, crop, or display-follow coordinates.';
comment on column public.sessions.timing_zone_version is
  'Editable zone-draft version; immutable copies are captured in analysis input/workspace snapshots.';
