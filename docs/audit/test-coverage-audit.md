# Test coverage audit

AVA has unusually broad purpose-built sanity scripts and selected Playwright/SQL/Swift tests.
They cover deterministic FPS, pose mapping, events, metrics, result foundations, intelligence,
reports, projections, twins, training, ownership and security contracts.

## Gaps

- no unified unit runner, coverage report, mutation testing or enforced threshold;
- many script aliases run the same single sanity file, inflating apparent suite count;
- only one SQL test file;
- Playwright requires local seeded Supabase and does not prove staging;
- no worker-container golden-video CI job;
- no concurrency/termination/lease load test in hosted infrastructure;
- no real iOS XCTest target/device/UI/background/network test evidence;
- no eligible scientific reference dataset;
- no accessibility automation/device review;
- no destructive restore/rollback/deletion rehearsal;
- no full cross-athlete matrix against deployed policies.

Passing source-regex sanity assertions must not be reported as behavioral integration.
