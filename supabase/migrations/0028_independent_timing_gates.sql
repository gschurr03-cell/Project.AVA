-- Stabilize timing-zone semantics: two independent gates plus distance metadata.
-- No connected polygon/corridor geometry is stored or required.
update public.sessions
set calibration_gates = calibration_gates || jsonb_build_object(
  'zoneDistanceMeters', calibration_gates->'distanceM',
  'startGateId', coalesce(calibration_gates #> '{startBoundary,gateId}', calibration_gates #> '{startBoundary,boundaryId}'),
  'finishGateId', coalesce(calibration_gates #> '{finishBoundary,gateId}', calibration_gates #> '{finishBoundary,boundaryId}'),
  'connectedZoneVisualizationDeprecated', true
)
where calibration_gates is not null
  and calibration_gates->>'schemaVersion' = 'ava-ground-anchor-v1';

comment on column public.sessions.calibration_gates is
  'Two independent source/world-anchored crossing gates plus fixed distance metadata. Connected polygon geometry is deprecated and non-authoritative.';
