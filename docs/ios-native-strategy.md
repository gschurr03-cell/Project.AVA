# AVA Sprint native strategy

AVA uses a native SwiftUI client targeting iOS 17 on iPhone. The app is a secure
presentation, capture, upload, and synchronization client; all biomechanics and
intelligence remain server-side.

- Apple frameworks: SwiftUI, structured concurrency, URLSession, AVFoundation,
  PhotosUI, BackgroundTasks, UserNotifications, Security, and protected files.
- Dependencies are injected behind protocols from `AppDependencies`; global mutable
  services and third-party packages are excluded.
- Navigation has authenticated/unauthenticated roots and Home, Analyze, Progress,
  Coaching, and Profile destinations. Routes are validated centrally.
- View state uses explicit `LoadState` and upload lifecycle values. Views never own
  networking or persistence.
- Account-scoped, schema-versioned JSON is the initial small offline store. A later
  SwiftData migration is appropriate only when query volume justifies it.
- Debug, Staging, and Release use separate xcconfig values and bundle IDs. Release
  secrets and signing material live outside source control.
- Testing combines Swift Testing state/contract tests, JSON parity fixtures, simulator
  UI tests when full Xcode is available, and physical-device camera/background tests.

