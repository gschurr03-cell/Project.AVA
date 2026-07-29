# AVA Sprint TestFlight readiness audit

Audit date: 2026-07-17

AVA is currently a responsive **Next.js web application**, not a native iOS app, PWA
installation package, or configured native wrapper. There is no Xcode project, bundle
identifier, signing team, entitlements, privacy manifest, iOS icons/splash catalog,
camera/photo-library usage description, universal-link association, Store configuration,
TestFlight lane, or mobile release CI.

## Recommended delivery path

Use a deliberate native SwiftUI client consuming the existing authenticated AVA backend,
or approve a carefully tested web container only after file selection, video playback,
cookie/session refresh, password-reset deep links, safe areas, keyboard behavior, network
security, and background upload limitations are validated. Do not create a wrapper solely
to satisfy a schedule.

## Web preparation completed

- Core dashboard and athlete routes use mobile padding and safe-area-aware bottoms.
- Browser upload constrains file class/size and preserves the original.
- Password reset uses a canonical callback origin.
- The Timing Workspace remains tablet/desktop-first but opens safely as a web route.

## TestFlight blockers

1. Select native architecture and application ownership.
2. Reserve bundle ID, app name, signing, and capabilities.
3. Create privacy manifest and camera/photo/video permission descriptions.
4. Implement secure native authentication redirects and account deletion entry.
5. Validate foreground/background uploads on real iPhones.
6. Provision production web/API, Supabase, storage, and worker environments.
7. Complete legal/privacy/health-claim review.
8. Add device E2E, crash reporting, release build, and TestFlight CI.
