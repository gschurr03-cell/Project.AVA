# Quick wins

| ID | Action | Value | Verification |
| --- | --- | --- | --- |
| QW-01 | Change iOS placeholder identifiers only when real IDs are assigned | Prevent archive mistakes | Xcode build settings audit |
| QW-02 | Fail release manifest if experimental/developer flags are enabled | Safety | environment sanity |
| QW-03 | Make missing mobile API visibly blocked in native development UI | Clarity | offline/error test |
| QW-04 | Replace `next lint` with ESLint CLI and fix overlay dependencies | CI stability | clean lint/build |
| QW-05 | Add schema/type drift check | Data integrity | generated diff is empty |
| QW-06 | Label docs/routes as design, fixture, shadow or deployed | Truth | documentation check |
| QW-07 | Remove zero-placeholder assumptions from comparison UI | Metric safety | nullable fixtures |
| QW-08 | Add explicit release check that training modes are disabled | Athlete safety | release sanity |
| QW-09 | Inventory every developer/admin route in production build | Exposure control | route snapshot |
| QW-10 | Record exact worker/model/image version in health output internally | Incident diagnosis | health contract test |

These are secondary to staging, authorization, native API, real analysis and operations.
