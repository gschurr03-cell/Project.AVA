# iOS screen and feature inventory

| Capability | Code state | Connection/validation |
| --- | --- | --- |
| App shell/navigation | SwiftUI app and beta experience views | Portable compile only |
| Authentication | Contracts/service models | Live Supabase/deep-link/device flow unproved |
| Capture/import | AVFoundation/Photos-oriented contracts and quality policy | No physical-device evidence |
| Protected media store | Account-scoped models and fingerprints | Storage pressure/protection unproved |
| Background upload/recovery | URLSession-oriented implementation | No live API/task relaunch proof |
| Offline result package | Immutable scoped package | Fixture tested |
| Home/history/report/coaching/progress | Native presentation views/contracts | Fixture/offline data |
| Accessibility | Labels/design guidance present | No VoiceOver, Dynamic Type or device matrix run |
| Notifications | Documentation/contracts | No provider/permissions/deep-link workflow |
| Training execution | Not connected | No approved-plan API or production screen flow |
| Release | Xcode project/plist/privacy manifest/entitlements | Placeholder IDs, no team/archive/TestFlight |

Native completion is 38%. The project should be kept; its missing providers and device
evidence should be implemented, not replaced by a web container.
