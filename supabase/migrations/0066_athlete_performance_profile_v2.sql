-- Project AVA — Athlete Performance Profile v2 (Phase 6, Part 1).
--
-- Additive-only: every new column is nullable, so every existing athlete row
-- (and every analysis that already ran against it) is unaffected. Fills the
-- remaining gaps in the profile the Athlete Intelligence Model needs —
-- `sex`, `date_of_birth`, and `primary_event` already existed (migrations
-- 0001 and 0054) but had no range/enum constraint; `height_cm`/`weight_kg`/
-- `leg_length_cm`/`trochanter_height_m` already existed (0001/0006/0015).
-- This migration adds wingspan, competition level, dominant leg, spikes, and
-- surface, and constrains the two pre-existing free-text fields
-- (`primary_event`, `age_group`) that never had a check.

alter table public.athletes
  add column if not exists wingspan_cm       numeric,  -- fingertip to fingertip, arms extended, cm
  add column if not exists competition_level text,
  add column if not exists dominant_leg      text,
  add column if not exists spikes_used       text,     -- free text: brand/model, e.g. "Nike Zoom Rival Sprint"
  add column if not exists surface           text;

-- Range checks double as unit validation, matching the pattern in
-- 0006_athlete_profile.sql. A NULL (field left unset) always passes.
alter table public.athletes
  add constraint athletes_wingspan_cm_range check (wingspan_cm between 50 and 260),
  add constraint athletes_competition_level_check
    check (competition_level in ('recreational', 'developmental', 'competitive', 'elite')),
  add constraint athletes_dominant_leg_check check (dominant_leg in ('left', 'right')),
  add constraint athletes_surface_check
    check (surface in ('track', 'grass', 'turf', 'indoor', 'road', 'other')),
  add constraint athletes_spikes_used_length check (char_length(spikes_used) <= 200);

-- `primary_event` (added 0054) and `age_group` (added 0054) had no
-- constraint at all until now; both are free text a coach could enter
-- anything into. Bound them the same way, without changing any existing
-- valid value — every value already in use in this local dev DB is one of
-- these, so this is safe to apply retroactively.
alter table public.athletes
  add constraint athletes_primary_event_check
    check (primary_event in ('60m', '100m', '200m', '400m', 'hurdles', 'relay', 'other')),
  add constraint athletes_age_group_check
    check (age_group in ('youth', 'high_school', 'collegiate', 'open', 'masters'));
