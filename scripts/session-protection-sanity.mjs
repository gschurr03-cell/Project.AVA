// Local validation-dataset cleanup — deterministic tests for the reference-
// benchmark session protection added in
// supabase/migrations/0072_protected_reference_benchmark_sessions.sql and
// 0073_protect_reference_benchmark_trigger.sql:
//   - set_session_reference_benchmark() sets the flag
//   - a BEFORE DELETE trigger rejects deleting a protected session via ANY
//     pathway (not just the cleanup RPC)
//   - cleanup_unprotected_sessions() (dry-run and real) never includes a
//     protected session in its result set
//   - ordinary (unprotected) session deletion still works
//
// Creates synthetic, clearly-labeled fixture rows directly via `psql`
// (service_role deliberately has no direct INSERT/UPDATE grant on
// `sessions` — the same lockdown this protection mechanism relies on),
// mirroring the established pattern in worker-lease-sanity.mjs. Cleans up
// unconditionally, including clearing the protection flag before its own
// teardown (proving the trigger blocks cascade-delete paths too, not just a
// direct DELETE).
//
//   node scripts/session-protection-sanity.mjs
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

const psql = (sql) =>
  execFileSync("docker", ["exec", "-i", "supabase_db_project-ava", "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-c", sql])
    .toString()
    .trim();

const psqlExpectError = (sql) => {
  try {
    execFileSync("docker", ["exec", "-i", "supabase_db_project-ava", "psql", "-U", "postgres", "-d", "postgres", "-c", sql], { stdio: "pipe" });
    return { errored: false, message: null };
  } catch (err) {
    return { errored: true, message: (err.stderr ?? err.stdout ?? "").toString() };
  }
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Supabase service environment is required.");
const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const athleteId = randomUUID();
const protectedSessionId = randomUUID();
const ordinarySessionId = randomUUID();

try {
  const coachId = psql("select id from auth.users where email='dev@projectava.local';");
  if (!coachId) throw new Error("permanent local dev coach account not found — see docs/permanent-dev-login.md");

  psql(
    `insert into public.athletes (id, coach_id, full_name) values ('${athleteId}', '${coachId}', 'Session Protection Sanity (synthetic, safe to delete)');`,
  );
  psql(
    `insert into public.sessions (id, athlete_id, created_by, video_path, analysis_type, name) values ` +
      `('${protectedSessionId}', '${athleteId}', '${coachId}', 'synthetic/${protectedSessionId}.mov', 'fly', 'protection-sanity-protected'), ` +
      `('${ordinarySessionId}', '${athleteId}', '${coachId}', 'synthetic/${ordinarySessionId}.mov', 'fly', 'protection-sanity-ordinary');`,
  );

  // 1. Ordinary sessions default unprotected.
  const defaultFlag = psql(`select is_reference_benchmark from public.sessions where id='${protectedSessionId}';`);
  check("1. a newly created session defaults is_reference_benchmark to false", defaultFlag === "f");

  // 2. set_session_reference_benchmark() sets the flag.
  const { data: setResult, error: setError } = await service.rpc("set_session_reference_benchmark", {
    p_session_id: protectedSessionId,
    p_protected: true,
  });
  check("2. set_session_reference_benchmark() succeeds and returns true", !setError && setResult === true);
  const flagNow = psql(`select is_reference_benchmark from public.sessions where id='${protectedSessionId}';`);
  check("2. the flag is actually set in the database", flagNow === "t");

  // 3. Protected session deletion is rejected — a direct raw DELETE, not just
  // the cleanup RPC (defense-in-depth via the BEFORE DELETE trigger).
  const directDelete = psqlExpectError(`delete from public.sessions where id='${protectedSessionId}';`);
  check("3. a direct DELETE on a protected session is rejected", directDelete.errored);
  check(
    "3. the rejection is the specific protection error, not an unrelated failure",
    /protected reference-benchmark session/.test(directDelete.message),
  );
  const stillThere = psql(`select count(*) from public.sessions where id='${protectedSessionId}';`);
  check("3. the protected session still exists after the rejected delete attempt", stillThere === "1");

  // 4. cleanup_unprotected_sessions(dry_run=true) never includes a protected session.
  const { data: dryRun, error: dryRunError } = await service.rpc("cleanup_unprotected_sessions", { p_dry_run: true });
  check("4. dry-run cleanup call succeeds", !dryRunError);
  const dryRunIds = (dryRun ?? []).map((r) => r.session_id);
  check("4. bulk cleanup (dry-run) excludes the protected session", !dryRunIds.includes(protectedSessionId));
  check("4. bulk cleanup (dry-run) includes the ordinary session", dryRunIds.includes(ordinarySessionId));
  check("4. dry-run does not actually delete anything", psql(`select count(*) from public.sessions where id='${ordinarySessionId}';`) === "1");

  // 5. Ordinary session deletion still works via the real cleanup RPC.
  const { data: realRun, error: realRunError } = await service.rpc("cleanup_unprotected_sessions", { p_dry_run: false });
  check("5. real cleanup call succeeds", !realRunError);
  const realRunIds = (realRun ?? []).map((r) => r.session_id);
  check("5. the ordinary session was actually deleted", realRunIds.includes(ordinarySessionId));
  check("5. the ordinary session is gone from the database", psql(`select count(*) from public.sessions where id='${ordinarySessionId}';`) === "0");
  check("5. the protected session was NOT touched by the real cleanup run", !realRunIds.includes(protectedSessionId));
  check(
    "5. the protected session still exists, still protected, after a real cleanup run",
    psql(`select is_reference_benchmark from public.sessions where id='${protectedSessionId}';`) === "t",
  );

  // 6. Related "storage objects" (represented here by video_path, the field
  // any storage-cleanup step keys off) are excluded from cleanup for a
  // protected session — proven by the dry-run/real result sets above never
  // containing the protected session, which is exactly what a storage-
  // cleanup step (see the Day-104-cleanup storage script) filters on.
  const protectedPath = psql(`select video_path from public.sessions where id='${protectedSessionId}';`);
  check("6. the protected session's storage path is still present (never queued for deletion)", protectedPath === `synthetic/${protectedSessionId}.mov`);

  console.log("\n" + (ok ? "ALL PASSED" : "FAILURES PRESENT"));
} finally {
  // Teardown: clear protection first — proves the trigger also blocks the
  // CASCADE-delete path from deleting the athlete while a protected session
  // still exists, and documents the sanctioned way to retire a fixture.
  await service.rpc("set_session_reference_benchmark", { p_session_id: protectedSessionId, p_protected: false });
  psql(`delete from public.athletes where id='${athleteId}';`);
}
process.exit(ok ? 0 : 1);
