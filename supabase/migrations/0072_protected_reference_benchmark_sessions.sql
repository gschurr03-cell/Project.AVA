-- Local validation-dataset cleanup: a durable, database-enforced protection
-- flag for permanent reference-benchmark sessions (e.g. the Gav 20m Fly
-- Baseline video, tied to the historical "AVA Calab Vid 1"/VueMotion
-- external reference used throughout this project's engineering reports),
-- plus two narrow SECURITY DEFINER RPCs so protection is enforced in the
-- database itself, not only in application/UI code.
--
-- Reuse audit: `public.validation_fixtures` (0022_validation_fixtures.sql)
-- already provides a service-only, DB-enforced (`session_id ... on delete
-- restrict`) protected-source registry, and was considered first per this
-- task's own instruction to prefer an existing mechanism. It was NOT reused
-- here because its schema is semantically panning-specific
-- (`expected_recording_class` only accepts `smooth_pan | unstable_pan |
-- pan_with_zoom | excessive_camera_motion` — there is no truthful value for
-- a stationary fly-camera session) — forcing the Gav benchmark into it would
-- mean writing a false classification, which this project's accuracy
-- manifesto (`docs/accuracy-manifesto.md`, "never fabricate data") forbids.
-- A general, honest, session-level flag is the correct fit instead.

alter table public.sessions
  add column if not exists is_reference_benchmark boolean not null default false;

comment on column public.sessions.is_reference_benchmark is
  'Permanent, database-enforced protection flag. True only for reference-'
  'benchmark sessions (e.g. the Gav 20m Fly Baseline video) that must never '
  'be removed by ordinary session cleanup. Set only via '
  'set_session_reference_benchmark(); enforced in cleanup_unprotected_sessions() '
  'and any future destructive session-cleanup pathway, which must explicitly '
  'exclude rows where this is true.';

-- Narrow, service-role-only setter — sessions has no direct UPDATE grant for
-- service_role (writes normally flow through RLS-scoped authenticated
-- sessions), so this SECURITY DEFINER function is the correct, least-
-- privilege way to set the flag without granting broad table access.
create or replace function public.set_session_reference_benchmark(
  p_session_id uuid, p_protected boolean
) returns boolean
language sql security definer set search_path = public as $$
  update public.sessions
  set is_reference_benchmark = p_protected
  where id = p_session_id
  returning true;
$$;

revoke all on function public.set_session_reference_benchmark(uuid, boolean) from public;
grant execute on function public.set_session_reference_benchmark(uuid, boolean) to service_role;

-- Narrow, service-role-only bulk cleanup — the WHERE clause is the entire
-- protection mechanism: a protected session can structurally never appear
-- in its result set, dry-run or real. `p_dry_run` (default true) makes the
-- SAFE preview the default behavior; a caller must explicitly pass `false`
-- to actually delete. Deletion relies on the existing, already-correct FK
-- cascade graph (analyses/analysis_jobs/coach_notes CASCADE from sessions;
-- feedback_submissions/support_requests SET NULL; nothing RESTRICTs on an
-- ordinary, non-fixture session) — no athlete, user, auth, migration, or
-- seed-configuration table is touched by this function.
create or replace function public.cleanup_unprotected_sessions(p_dry_run boolean default true)
returns table(session_id uuid, session_name text, athlete_id uuid, status public.session_status)
language plpgsql security definer set search_path = public as $$
begin
  if p_dry_run then
    return query
      select s.id, s.name, s.athlete_id, s.status
      from public.sessions s
      where s.is_reference_benchmark = false;
  else
    return query
      delete from public.sessions s
      where s.is_reference_benchmark = false
      returning s.id, s.name, s.athlete_id, s.status;
  end if;
end;
$$;

revoke all on function public.cleanup_unprotected_sessions(boolean) from public;
grant execute on function public.cleanup_unprotected_sessions(boolean) to service_role;
