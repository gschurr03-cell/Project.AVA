# Staging environment status

Status: **not deployed; external blocker**.

The repository contains environment validation, worker image, migrations and API provider
code, but this workspace has no supplied isolated Supabase project, hosting account, region,
managed secret store, telemetry sink, notification project or staging DNS. No production
credentials were reused and no fake staging URL was recorded.

Required execution inputs: isolated Supabase URL/anon/service keys, web and worker hosting,
managed secrets, storage buckets, test athlete linked through `athletes.user_id`, telemetry
destination and an authorized 60 FPS-class video. `MOBILE_API_ENABLED=true` must be set only
after migration 0053 and account linking are verified.
