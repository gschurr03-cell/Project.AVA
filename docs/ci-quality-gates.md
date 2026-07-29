# CI quality gates

`.github/workflows/quality-gates.yml` installs from the lockfile, scans tracked files for
common secret forms, runs typecheck/lint/security and core domain regressions, builds Next.js,
builds the worker with provenance and SBOM, and runs portable Swift tests on macOS.
The dependency audit fails on high or critical advisories.

The workflow has read-only repository permissions, disabled checkout credential persistence,
timeouts, and concurrency cancellation. External actions use major-version tags; commit-SHA
pinning and a dependency/license/container-vulnerability scanner remain required. Branch
protection must require all jobs; that external repository setting is not verified here.
