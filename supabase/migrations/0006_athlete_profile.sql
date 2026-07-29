-- Project AVA — athlete physical & performance profile.
--
-- Adds the physical measurements and personal-best / goal times that future
-- calibration (Day 57) and PB prediction (Day 58) will consume. This migration
-- is storage + display only: nothing here feeds metric calculation yet.
--
-- `mass_kg` already existed but was never surfaced in the UI. Coaches enter and
-- reason about "weight", and the profile roadmap refers to `weight_kg`, so we
-- rename the column rather than introduce a duplicate. `height_cm` already
-- exists and is reused as-is.

alter table public.athletes rename column mass_kg to weight_kg;

alter table public.athletes
  add column leg_length_cm      numeric,  -- greater trochanter to floor, cm
  add column personal_best_60m  numeric,  -- seconds
  add column personal_best_100m numeric,  -- seconds
  add column personal_best_200m numeric,  -- seconds
  add column goal_60m           numeric,  -- seconds
  add column goal_100m          numeric,  -- seconds
  add column goal_200m          numeric;  -- seconds

-- Range checks double as unit validation: a value far outside these bounds
-- almost always means the wrong unit was entered (e.g. height in metres, weight
-- in pounds, a time in minutes). A NULL (field left unset) always passes.
alter table public.athletes
  add constraint athletes_height_cm_range      check (height_cm          between 50 and 260),
  add constraint athletes_weight_kg_range      check (weight_kg          between 20 and 250),
  add constraint athletes_leg_length_cm_range  check (leg_length_cm      between 30 and 160),
  add constraint athletes_pb_60m_range         check (personal_best_60m  between 5 and 20),
  add constraint athletes_pb_100m_range        check (personal_best_100m between 8 and 30),
  add constraint athletes_pb_200m_range        check (personal_best_200m between 16 and 60),
  add constraint athletes_goal_60m_range       check (goal_60m           between 5 and 20),
  add constraint athletes_goal_100m_range      check (goal_100m          between 8 and 30),
  add constraint athletes_goal_200m_range      check (goal_200m          between 16 and 60);
