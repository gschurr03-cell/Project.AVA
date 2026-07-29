grant select on table public.profiles to authenticated;

grant update on table public.athletes to authenticated;

grant insert, update on table public.onboarding_states to authenticated;

grant select, insert, update on table public.coach_notes to authenticated;

grant select on table public.coach_athlete_preferences to authenticated;

grant select, insert on table public.account_deletion_requests to authenticated;

grant select, insert on table public.support_requests to authenticated;

grant select, insert on table public.feedback_submissions to authenticated;
