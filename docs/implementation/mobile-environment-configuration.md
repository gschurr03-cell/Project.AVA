# Mobile environment configuration

Server variables: Supabase URL/anon/service role, `MOBILE_API_ENABLED`,
`MOBILE_MAX_UPLOAD_BYTES`, `MOBILE_UPLOAD_TTL_SECONDS`,
`MOBILE_MINIMUM_APP_VERSION`, video/pose buckets, worker version/model/pipeline and existing
AVA environment/release controls.

iOS receives only an HTTPS API base URL and nonsecret app/environment/version identifiers.
`NativeEnvironment.validatedBaseURL` rejects non-HTTPS endpoints and release localhost.
Tokens and signed URLs are runtime data, never bundle configuration. Debug endpoint
selection must remain in debug configuration. Missing/disabled API fails with
`SERVICE_UNAVAILABLE`; it never silently selects local or production.
