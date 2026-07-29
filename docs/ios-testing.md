# iOS testing

Permanent Swift tests cover contract decoding, active-manifest rejection, upload state,
camera selection, recording classification, streaming fingerprints, network/retry policy,
three-way upload reconciliation, atomic offline packages, feature flags, account isolation,
media cleanup, and routing. `mobile-contract:sanity`
compares canonical TypeScript-side fixtures with Swift resources.

Beta presentation tests additionally cover one-manifest scope, recommendation-order
preservation, fail-closed mixed manifests, prohibited diagnosis language, projection
guarantees, closed feature defaults and bounded feedback. SwiftUI/UI/accessibility snapshot
tests still require full Xcode.

Run:

```sh
cd ios/AVASprint && swift test
npm run mobile-contract:sanity
npm run typecheck
npm run lint
npm run build
git diff --check
```

Full Xcode should add simulator unit/UI flows and static analysis. Staging integration
needs deployed mobile endpoints and test credentials. Physical-device coverage is required
for 60 FPS capture, metadata accuracy, interruptions, background upload, cellular changes,
low storage, Photos limited access, and notification delivery. No simulator or device
result may be inferred from Swift package tests.

Termination scenarios remain manual until an Xcode device harness exists. Every stage must
retain protected source and persisted state, then reconcile OS/server/local truth on launch;
capture finalization cannot be guaranteed after user termination.
