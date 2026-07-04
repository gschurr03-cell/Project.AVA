// Permanent local development seed (development only).
//
//   npm run dev:seed
//
// Creates — or idempotently updates — one permanent local dev account and a
// complete, analyzed demo session, so you never have to hand-make a verify user
// again. Re-running it is safe: every row is keyed by a fixed id and every
// storage object is overwritten, so nothing is ever duplicated.
//
// What it seeds (the whole session-page data chain):
//   • auth user  dev@projectava.local  (email pre-confirmed)
//   • its profile (coach) + one athlete with a complete physical/PB/goal profile
//   • one `complete` session with real video metadata
//   • one `complete` analysis with realistic sprint metrics
//   • the real sample video (→ sprint-videos) and its aligned MediaPipe pose
//     artifact (→ pose-artifacts), so the interactive overlay, calibration,
//     PB prediction, sprint phases, and sprint intelligence panels all populate
//     from real, aligned pose data.
//
// Password: read from DEV_SEED_PASSWORD if set, otherwise the documented local
// default below. This is a throwaway LOCAL credential — never a production
// secret (the local Supabase stack is disposable, like its demo keys).
//
// Safety: refuses to run against a non-local Supabase URL unless
// DEV_SEED_ALLOW_REMOTE=1 is set, so it can never touch production data.
//
// NEVER deploy or run this against production. It uses the service-role key.

import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

// Committed, aligned demo fixtures. The video is the H.264 copy (see
// `npm run sample:transcode`) so it plays reliably in Chrome; it keeps the
// source's dimensions, so the pose artifact stays aligned.
const VIDEO_FILE = path.join(root, "samples/seed/demo-sprint.mp4");
const POSE_FILE = path.join(root, "samples/seed/demo-sprint.pose.json");

// Intrinsic metadata of samples/seed/demo-sprint.mp4 (matches the pose artifact).
const VIDEO_META = {
  width: 1044,
  height: 596,
  fps: 29.97,
  duration_s: 6.173,
  codec: "h264",
};

// Storage object paths follow the ownership convention (first segment = athlete).
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

// Realistic sprint metrics for the analysis (SI unless the name says otherwise).
const METRICS = {
  topSpeedMps: 9.8,
  avgStrideLengthM: 2.18,
  strideFrequencyHz: 4.45, // slightly below target → a coaching limiter to show
  groundContactTimeMs: 104,
  flightTimeMs: 122,
  peakKneeFlexionDeg: 116.5,
  avgTrunkLeanDeg: 7.8,
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

/** Upload a local file to a private bucket, overwriting any existing object. */
async function uploadObject(bucket, objectPath, filePath, contentType) {
  const body = readFileSync(filePath);
  const { error } = await supabase.storage
    .from(bucket)
    .upload(objectPath, body, { contentType, upsert: true });
  if (error) throw new Error(`upload ${bucket}/${objectPath}: ${error.message}`);
  log(`uploaded ${bucket}/${objectPath} (${body.length} bytes)`);
}

async function main() {
  // Fail early with a clear message if the demo assets are missing.
  for (const f of [VIDEO_FILE, POSE_FILE]) {
    try {
      statSync(f);
    } catch {
      fail(`missing demo asset: ${path.relative(root, f)}`);
    }
  }

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

  // Storage: real sample video + its aligned pose artifact (before the rows that
  // reference their paths).
  await uploadObject(VIDEO_BUCKET, VIDEO_PATH, VIDEO_FILE, "video/mp4");
  await uploadObject(POSE_BUCKET, POSE_PATH, POSE_FILE, "application/json");

  // sessions: one completed sprint with real video metadata.
  {
    const size = statSync(VIDEO_FILE).size;
    const { error } = await supabase.from("sessions").upsert(
      {
        id: SESSION_ID,
        athlete_id: ATHLETE_ID,
        created_by: userId,
        name: "Demo sprint — 30 m fly",
        status: "complete",
        distance_m: 30,
        video_path: VIDEO_PATH,
        original_filename: "demo-sprint.mp4",
        width: VIDEO_META.width,
        height: VIDEO_META.height,
        fps: VIDEO_META.fps,
        duration_s: VIDEO_META.duration_s,
        codec: VIDEO_META.codec,
        size_bytes: size,
        notes: "Seeded demo session. Re-run `npm run dev:seed` to reset.",
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(`sessions upsert: ${error.message}`);
    log("session upserted (complete)");
  }

  // analyses: the completed AI output, pointing at the uploaded pose artifact so
  // the overlay + all pose-derived panels render.
  {
    const now = new Date().toISOString();
    const { error } = await supabase.from("analyses").upsert(
      {
        id: ANALYSIS_ID,
        session_id: SESSION_ID,
        model_version: "dev-seed-v1",
        status: "complete",
        metrics: METRICS,
        keypoints_path: POSE_PATH,
        completed_at: now,
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(`analyses upsert: ${error.message}`);
    log("analysis upserted (complete, with overlay pose artifact)");
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
      `  Open the demo session directly: /sessions/${SESSION_ID}`,
      "  Re-run `npm run dev:seed` any time to reset it (idempotent).",
      "",
    ].join("\n"),
  );
}

main().catch((err) => fail(err.message));
