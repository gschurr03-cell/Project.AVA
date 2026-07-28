# DEC-007 — Production surface policy

- Status: Accepted
- Date: 2026-07-18
- Affected tasks: `AVA-0039`

## Context

AVA has many useful internal, experimental and developer surfaces. Most routes already use
individual feature gates, but the gates default independently and there was no release-level
contract preventing an unsafe production combination.

## Decision

`config/production-surface-policy.json` is the canonical versioned manifest of features and
rollout modes that are forbidden in production. `src/lib/config/features.ts` remains the
canonical feature loader and validates the complete parsed configuration against that
manifest whenever `AVA_ENVIRONMENT=production`.

Development, test and staging retain explicit experimental flexibility. Production fails
closed during module initialization if any forbidden boolean is enabled or any bounded mode
differs from its required safe value.

## Consequences

- Existing per-route `notFound()` and component gates remain intact.
- No second feature service or release-state store is introduced.
- Adding a developer surface requires adding its canonical feature key to the manifest.
- A production release must explicitly disable the current experimental defaults.

## Migration and rollback

Release configuration must set all manifest-listed flags to false and the three listed modes
to their required values. Rollback is a code rollback of the manifest/validator together;
disabling the validator alone is not an approved operational workaround.

## Evidence and tests

- `npm run release-surfaces:sanity`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Playwright developer-route denial tests

