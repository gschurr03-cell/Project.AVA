// Permanent local development seed (development only).
//
//   npm run dev:seed
//
// Creates — or idempotently updates — one permanent local dev account, athlete,
// and the permanent 20 m benchmark reference, so you never have to hand-make a
// verify user again. Re-running it is safe: every row is keyed by a fixed id.
//
// What it seeds:
//   • auth user  dev@projectava.local  (email pre-confirmed)
//   • its profile (coach) + one athlete with a complete physical/PB/goal profile
//   • the permanent AVA Calab Vid 1 (VueMotion 20 m) benchmark reference row
//
// Day 66: the seed no longer creates the retired "30 m fly" demo session — the
// dev dataset now focuses solely on the static 20 m benchmark. Any previously
// seeded 30 m fly session (+ its analysis and storage objects) is DELETED here
// so the environment stays clean. The real, coach-uploaded 20 m session is a
// separate row and is never touched.
//
// Password: read from DEV_SEED_PASSWORD if set, otherwise the documented local
// default below. This is a throwaway LOCAL credential — never a production
// secret (the local Supabase stack is disposable, like its demo keys).
//
// Safety: refuses to run against a non-local Supabase URL unless
// DEV_SEED_ALLOW_REMOTE=1 is set, so it can never touch production data.
//
// NEVER deploy or run this against production. It uses the service-role key.

import { createClient } from "@supabase/supabase-js";

// --- Fixed identity (stable across runs → idempotent, never duplicated) -------
const EMAIL = "dev@projectava.local";
const DEFAULT_PASSWORD = "dev-password-123"; // documented local-only default
const PASSWORD = process.env.DEV_SEED_PASSWORD || DEFAULT_PASSWORD;
const FULL_NAME = "Dev Coach";

// Fixed UUIDs so re-seeding upserts the same rows instead of making new ones.
const ATHLETE_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const ANALYSIS_ID = "33333333-3333-4333-8333-333333333333";

// The permanent AVA Calab Vid 1 (VueMotion 20 m) benchmark reference. Mirrors
// migrations 0009 + 0010; kept here so the seed can re-assert it idempotently.
const BENCHMARK_ID = "44444444-4444-4444-8444-444444444444";
const ACCEL_BENCHMARK_ID = "55555555-5555-4555-8555-555555555555";
const BENCHMARK_REFERENCE = {
  zoneTimeS: 1.93,
  avgVelocityMps: 10.36,
  maxVelocityMps: 10.74,
  avgStepLengthM: 2.15,
  leftStepLengthM: 2.16,
  rightStepLengthM: 2.14,
  combinedStepFrequencyHz: 4.86,
  leftStepFrequencyHz: 5.0,
  rightStepFrequencyHz: 4.72,
  groundContactLeftMs: 80,
  groundContactRightMs: 80,
  flightLeftMs: 120,
  flightRightMs: 130,
};

// Storage object paths of the RETIRED 30 m fly demo (follow the ownership
// convention: first segment = athlete). Kept only so the cleanup below can remove
// any objects a previous seed uploaded.
const VIDEO_PATH = `${ATHLETE_ID}/${SESSION_ID}.mp4`;
const POSE_PATH = `${ATHLETE_ID}/${SESSION_ID}/${ANALYSIS_ID}.pose.json`;
const VIDEO_BUCKET = "sprint-videos";
const POSE_BUCKET = "pose-artifacts";

// A complete, realistic athlete profile (enables calibration + PB prediction).
const ATHLETE_PROFILE = {
  full_name: "Ava Sprinter",
  sex: "F",
  date_of_birth: "2003-04-12",
  height_cm: 172,
  weight_kg: 63,
  leg_length_cm: 91,
  personal_best_60m: 7.35,
  personal_best_100m: 11.42,
  personal_best_200m: 23.6,
  goal_60m: 7.15,
  goal_100m: 11.1,
  goal_200m: 22.9,
};

const {
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  DEV_SEED_ALLOW_REMOTE,
} = process.env;

const log = (msg) => console.log(`[dev-seed] ${msg}`);
const fail = (msg) => {
  console.error(`[dev-seed] ERROR: ${msg}`);
  process.exit(1);
};

// --- Preflight ----------------------------------------------------------------
const missing = [
  ["NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
]
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  fail(`missing env: ${missing.join(", ")}. Run via: npm run dev:seed (loads .env.local)`);
}

// Guard: never seed a non-local (i.e. possibly production) Supabase by accident.
const host = (() => {
  try {
    return new URL(SUPABASE_URL).hostname;
  } catch {
    return "";
  }
})();
const isLocal = host === "127.0.0.1" || host === "localhost" || host === "::1";
if (!isLocal && DEV_SEED_ALLOW_REMOTE !== "1") {
  fail(
    `refusing to seed non-local Supabase at "${SUPABASE_URL}". This seed is for local dev only. ` +
      `Set DEV_SEED_ALLOW_REMOTE=1 only if you are absolutely sure.`,
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Find an auth user by email across all pages, or null. */
async function findUserByEmail(email) {
  const perPage = 200;
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < perPage) return null;
  }
}

/** Create the dev user, or reset its password if it already exists. */
async function upsertUser() {
  const existing = await findUserByEmail(EMAIL);
  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: FULL_NAME },
    });
    if (error) throw new Error(`updateUser: ${error.message}`);
    log(`user exists → password reset (${EMAIL})`);
    return existing.id;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: FULL_NAME },
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  log(`user created (${EMAIL})`);
  return data.user.id;
}

async function main() {
  const userId = await upsertUser();

  // benchmarks: the AVA Calab Vid 1 (VueMotion 20 m) reference must ALWAYS exist
  // — it is AVA's permanent accuracy target. It's seeded by migration 0009, but
  // re-assert it here (idempotent) so a stray delete or a partial DB can't leave
  // the system without its benchmark. Values match migrations 0009 + 0010.
  {
    const { error } = await supabase.from("benchmarks").upsert(
      {
        id: BENCHMARK_ID,
        name: "AVA Calab Vid 1",
        source: "VueMotion",
        kind: "20m fly",
        distance_m: 20,
        reference_metrics: BENCHMARK_REFERENCE,
        notes:
          "First official AVA benchmark. VueMotion-measured 20 m fly zone (first pair of yellow cones to the final pair). Permanent accuracy reference — do not delete.",
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(`benchmarks upsert: ${error.message}`);
    log("benchmark upserted (AVA Calab Vid 1 — permanent reference)");

    const { error: accelError } = await supabase.from("benchmarks").upsert(
      {
        id: ACCEL_BENCHMARK_ID,
        name: "AVA Accel Test",
        source: "IMG_1961.MOV",
        source_video_name: "IMG_1961.MOV",
        kind: "0–20m acceleration",
        analysis_type: "acceleration",
        distance_m: 20,
        reference_metrics: {},
        notes:
          "Acceleration-mode wiring benchmark sourced from IMG_1961.MOV. Metric reference values intentionally pending acceleration-specific validation.",
      },
      { onConflict: "id" },
    );
    if (accelError) throw new Error(`acceleration benchmark upsert: ${accelError.message}`);
    log("benchmark upserted (AVA Accel Test — IMG_1961.MOV)");
  }

  // profiles: a row is auto-created by the on-signup trigger; make sure the dev
  // user's name/role are set (upsert covers both new and existing users).
  {
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: userId, full_name: FULL_NAME, role: "coach" }, { onConflict: "id" });
    if (error) throw new Error(`profiles upsert: ${error.message}`);
    log("profile upserted (coach)");
  }

  // athletes: one athlete with a complete physical / PB / goal profile.
  {
    const { error } = await supabase
      .from("athletes")
      .upsert({ id: ATHLETE_ID, coach_id: userId, ...ATHLETE_PROFILE }, { onConflict: "id" });
    if (error) throw new Error(`athletes upsert: ${error.message}`);
    log(`athlete upserted (${ATHLETE_PROFILE.full_name})`);
  }

  // Day 66 cleanup: remove the retired 30 m fly demo so the dev dataset focuses
  // solely on the static 20 m benchmark. Idempotent + best-effort: delete the old
  // analysis + session rows and their storage objects if a previous seed left them.
  // The account, athlete, and benchmark above are kept; the real coach-uploaded
  // 20 m session (a separate id) is never touched.
  {
    await supabase.from("analyses").delete().eq("session_id", SESSION_ID);
    const { error } = await supabase.from("sessions").delete().eq("id", SESSION_ID);
    if (error) throw new Error(`sessions delete (30 m fly): ${error.message}`);
    await supabase.storage.from(VIDEO_BUCKET).remove([VIDEO_PATH]);
    await supabase.storage.from(POSE_BUCKET).remove([POSE_PATH]);
    log("removed retired 30 m fly demo session + storage (if present)");
  }

  console.log(
    [
      "",
      "✔ Dev seed complete.",
      "",
      "  Sign in at http://localhost:3000/login",
      `    email:    ${EMAIL}`,
      `    password: ${PASSWORD}${PASSWORD === DEFAULT_PASSWORD ? "  (local default — set DEV_SEED_PASSWORD to change)" : "  (from DEV_SEED_PASSWORD)"}`,
      "",
      "  The static 20 m benchmark is the accuracy reference; upload the 20 m",
      "  Calab video as a session and link it to the AVA Calab Vid 1 benchmark.",
      "  Re-run `npm run dev:seed` any time (idempotent).",
      "",
    ].join("\n"),
  );
}

main().catch((err) => fail(err.message));
