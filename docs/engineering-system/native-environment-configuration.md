# Native environment configuration

Status: existing repository preparation; not live-environment validated.

| Build | Intended backend | Current authority |
| --- | --- | --- |
| Development | developer-controlled local/test endpoint | example xcconfig only |
| Staging | isolated AVA staging mobile API | blocked: endpoint/credentials unavailable |
| Release | AVA production mobile API | blocked: production endpoint/signing unavailable |

`NativeEnvironment.validatedBaseURL` is the canonical runtime validator. It requires HTTPS
and rejects localhost in non-debug builds. Example xcconfigs declare API version, minimum
client version, configuration name, bundle identifier and API base URL, but are templates
and are not secrets. Release/staging values must come from controlled build configuration;
the app must fail closed when required values are absent or invalid.

Do not commit credentials, make the production URL user-editable, or silently fall back to
mock data. Official bundle IDs and `DEVELOPMENT_TEAM` values must be supplied through
`AVA-0008` after Apple identity authority is available.
