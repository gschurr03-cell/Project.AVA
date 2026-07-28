# Mobile API error registry

The current local v1 provider exposes this stable implemented subset:

| Code | HTTP | Retry | Client behavior | Safe meaning |
| --- | ---: | --- | --- | --- |
| AUTH_REQUIRED | 401 | no | show sign-in | authentication missing/invalid |
| AUTH_EXPIRED | 401 | no | refresh once or sign in | session expired |
| FORBIDDEN | 403 | no | do not enumerate resource | account/profile not authorized |
| RESOURCE_NOT_FOUND | 404 | no | show unavailable | owned resource absent |
| RESOURCE_CONFLICT | 409 | no | reconcile state | incompatible current state |
| UPLOAD_EXPIRED | 409 | no | restart safely | upload lease expired |
| UPLOAD_INVALID | 422 | no | correct input | upload or current validation invalid |
| UPLOAD_INCOMPLETE | 409 | yes | reconcile upload | bytes not verified |
| ANALYSIS_NOT_READY | 409 | yes | bounded poll | analysis not terminal |
| ANALYSIS_FAILED | 409 | no | show safe failure | analysis failed |
| RESULT_NOT_ACTIVE | 409 | yes | bounded poll | no authoritative active result |
| RATE_LIMITED | 429 | yes | honor Retry-After | admission denied temporarily |
| SERVICE_UNAVAILABLE | 503/500 | yes | bounded retry | provider/dependency unavailable |
| DELETION_PENDING | 202/409 | yes | show pending | erasure not verified |

Errors include request ID and API version and never include stack, SQL, provider messages,
paths, tokens or signed credentials. Logout is appropriate after unrecoverable
AUTH_REQUIRED/AUTH_EXPIRED. The broader future registry must not be advertised as
implemented until contract tests exist.

