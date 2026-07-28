# iOS project setup

1. Install full Xcode and select it with `sudo xcode-select -s /Applications/Xcode.app`.
2. Copy each `Configuration/*.xcconfig.example` to the same name without `.example`.
3. Set non-secret environment URLs and placeholder bundle IDs. Supply secrets through
   local/CI-generated configuration, never Git.
4. Open `ios/AVASprint/AVASprint.xcodeproj`, set the development team, and select a
   simulator or device.

Configurations are Debug (development), Staging, and Release. The committed project
uses iOS 17 and placeholder reverse-DNS identifiers because the legal organization and
Apple Team ID are not established. `swift test` validates the portable core. Full app
build, signing, simulator, and archive require Xcode rather than Command Line Tools.

