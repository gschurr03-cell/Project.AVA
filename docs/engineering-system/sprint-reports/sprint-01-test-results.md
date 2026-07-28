# Sprint 01 test results

Date: 2026-07-18

| Command | Result | Task relationship | Notes |
| --- | --- | --- | --- |
| `node project-tracker/validate_tracker.mjs` | PASS | all | 0 invalid references, cycles or duplicate IDs |
| `npm run release-surfaces:sanity` | PASS | AVA-0039 | 23 unsafe booleans and 3 required modes |
| `npm run lint` | PASS | AVA-0040 | ESLint CLI; zero warnings |
| `npm run typecheck` | PASS | AVA-0039, AVA-0040 | no TypeScript errors |
| `npm run build` | PASS | AVA-0039, AVA-0040 | Next.js production build; 31 static pages generated |
| `npm run worker:analysis:sanity` | PASS | regression | all mapper cases passed |
| `npm run worker:jobs:sanity` | PASS | regression | job contract passed |
| `npm run worker:check` | PASS | regression | compiled modules and MediaPipe model resolved |
| `npm run release-readiness:sanity` | PASS | AVA-0039 | release checklist contract passed |
| `npm run auth-ownership:sanity` | PASS | regression | ownership contract passed |
| `npm run result-foundation:sanity` | PASS | regression | result contract passed |
| `npm run test:e2e` | PASS | AVA-0039, regression | 13 passed, 13 intentionally project-scoped skips; 56.0s |
| `swift test --package-path ios/AVASprint` | PASS | native regression | 19 passed after writable cache/sandbox approval |

The first Playwright attempt could not bind `0.0.0.0:3100` (`EPERM`) inside the restricted
shell. The approved rerun passed. The first Swift attempts could not write the default Clang
cache or start SwiftPM's compiler sandbox; the approved run with `/tmp` cache overrides
passed. These were execution-environment restrictions, not product failures.

Known warnings:

- Playwright's web server reports `NO_COLOR`/`FORCE_COLOR` interaction.
- Next development server warns that future versions will require `allowedDevOrigins`.
- Thirteen Playwright cases are intentionally skipped by project selection: desktop-only
  workflows do not repeat in the mobile project, and the mobile smoke test does not repeat
  in desktop Chromium.

Not run:

- Clean `npm ci` in a separate checkout: `AVA-0001` is blocked by the unpartitioned
  user-owned worktree.
- Remote CI/protected branch observation: `AVA-0030` is blocked.
- Staging schema generation/drift comparison: `AVA-0032` is blocked by `AVA-0004` and
  `AVA-0030`.
- Real hosted worker, physical-device and scientific reference tests: not changed by this
  sprint and outside its independent executable scope.

