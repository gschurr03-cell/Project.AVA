-- Day 66: timing-gate BAR calibration.
--
-- The coach marks two physical timing gates, each a bar drawn cone-to-cone across
-- the lane (start gate + finish gate), a known distance apart. Stored as a single
-- jsonb blob (validated app-side by calibrationGatesSchema):
--
--   {
--     "startGate":  { "c1": {"x","y"}, "c2": {"x","y"}, "timeS": <seconds> },
--     "finishGate": { "c1": {"x","y"}, "c2": {"x","y"}, "timeS": <seconds> },
--     "distanceM":  <metres>
--   }
--
-- Supersedes the old two-floating-point gate columns (calibration_point_*), which
-- remain for backward compatibility but are no longer written by the UI. Nullable
-- so existing rows are unaffected.

alter table public.sessions
  add column calibration_gates jsonb;
