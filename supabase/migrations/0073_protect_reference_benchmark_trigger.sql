-- Defense-in-depth for 0072's `is_reference_benchmark` flag: a BEFORE DELETE
-- trigger that rejects deleting a protected session via ANY pathway (not
-- just the sanctioned `cleanup_unprotected_sessions()` RPC) — including a
-- raw `DELETE FROM sessions` run directly against the database. This is the
-- strongest practical guarantee available short of revoking DELETE entirely
-- (which would break legitimate, already-existing session deletion for
-- ordinary sessions).

create or replace function public.prevent_protected_session_delete()
returns trigger language plpgsql as $$
begin
  if old.is_reference_benchmark then
    raise exception 'session % is a protected reference-benchmark session and cannot be deleted', old.id
      using errcode = 'P0001',
            hint = 'Clear is_reference_benchmark via set_session_reference_benchmark() first if this is intentional.';
  end if;
  return old;
end;
$$;

drop trigger if exists sessions_protect_reference_benchmark on public.sessions;
create trigger sessions_protect_reference_benchmark
  before delete on public.sessions
  for each row execute function public.prevent_protected_session_delete();
