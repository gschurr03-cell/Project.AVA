# Sprint 03 profile contract audit

Canonical persistence is the `athletes` row linked uniquely to the authenticated user.
The current self-profile projection returns ID, display name, sex, birth date, height in
centimetres and weight in kilograms. The route accepts no athlete selector.

| Consumer | Current mapping | Gap |
| --- | --- | --- |
| Database | snake_case nullable profile fields | route maps to camelCase and explicit units |
| Web | richer coach-owned athlete/session view | not a mobile DTO and must not become canonical |
| Mobile API | `ava-mobile-athlete-v1` | omits event/PB/goal fields rather than guessing |
| Swift | `AthleteSummary` through typed profile service | staging response decoding unproved |
| Benchmarks/analysis/training | richer contextual inputs | must use compatible versioned adapters later |

No fifth profile store was introduced. Organization scope is absent from the current data
contract and therefore cannot be claimed or tested; future coach/admin support must add a
server-authoritative relationship rather than a client-supplied organization ID.
